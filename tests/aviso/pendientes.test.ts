import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import {
  aprobarAviso,
  generarAviso,
  marcarListoParaRevision,
  registrarAcuse,
} from '../../src/persistencia/aviso'
import { periodosPendientes } from '../../src/persistencia/calendario'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'

/**
 * La alerta de calendario, contra la base.
 *
 * La obligación no avisa sola: el día 17 llega igual para quien se acordó y
 * para quien no.
 */
describe('Periodos pendientes de presentar', () => {
  let db: Client
  let sesion: ContextoSesion
  let almacen: AlmacenDocumentos
  let actividadId: string
  let sucursalId: string
  let clienteId: string
  let desarrolloId: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    almacen = almacenComo(sesion, BUCKET_AVISOS)
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      actividadId,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Pendientes SA','MX') returning id`,
      [sesion.tenantId, `PEN${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Pendiente','LIC20260003','31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [sesion.tenantId],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  const capturar = (fecha: string, monto: number) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        fechaOperacion: fecha,
        montoBase: pesos(monto),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        instrumentoMonetario: '1',
        monedaCodigo: '1',
        aportacionFideicomiso: false,
        nombreInstitucion: 'BANCO EJEMPLO',
      },
    })

  const pendientes = (hoy: string) =>
    enTransaccionDeSesion(db, sesion, () =>
      periodosPendientes(db, { sesion, actividadId, hoy }),
    )

  it('lista los meses cerrados sin aviso presentado, con su fecha límite', async () => {
    await capturar('2026-03-10', 1_200_000)
    await capturar('2026-05-15', 1_200_000)

    const r = await pendientes('2026-06-12')

    // Marzo, abril y mayo. Abril no tuvo operaciones y aparece igual: el
    // informe en cero es una obligación, no la ausencia de una.
    expect(r.map((x) => x.periodo)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01'])
    expect(r.map((x) => x.operacionesReportables)).toEqual([1, 0, 1])
    expect(r.map((x) => x.plazo.fechaLimite)).toEqual(['2026-04-17', '2026-05-17', '2026-06-17'])
  })

  it('el mes en curso NO aparece: todavía no cierra', async () => {
    await capturar('2026-05-15', 1_200_000)
    const r = await pendientes('2026-06-12')
    expect(r.map((x) => x.periodo)).not.toContain('2026-06-01')
  })

  it('traduce el día 10 del catálogo a los 7 días de anticipación', async () => {
    // El catálogo guarda un DÍA DEL MES y el dominio razona en días de
    // anticipación. Si la conversión se torciera, la alerta saldría el día
    // equivocado — y ese es todo el valor de la alerta.
    await capturar('2026-05-15', 1_200_000)

    expect((await pendientes('2026-06-09'))[0]?.plazo.estado).toBe('holgado')
    expect((await pendientes('2026-06-10'))[0]?.plazo.estado).toBe('por_vencer')
    expect((await pendientes('2026-06-17'))[0]?.plazo.estado).toBe('vence_hoy')
    expect((await pendientes('2026-06-18'))[0]?.plazo.estado).toBe('vencido')
  })

  it('un aviso a medio camino sigue pendiente, y dice en qué estado va', async () => {
    await capturar('2026-05-15', 1_200_000)
    const a = await generarAviso(
      db,
      { sesion, actividadId, periodo: '2026-05-01', granularidad: 'un_aviso_por_operacion' },
      almacen,
    )

    let r = await pendientes('2026-06-12')
    expect(r[0]?.estatusAviso).toBe('validado')

    await marcarListoParaRevision(db, { sesion, avisoId: a.avisoId })
    r = await pendientes('2026-06-12')
    // Generado no es presentado: mientras el acuse no vuelva, sigue debiéndose.
    expect(r[0]?.estatusAviso).toBe('listo_revision')
    expect(r.map((x) => x.periodo)).toContain('2026-05-01')
  })

  it('deja de estar pendiente cuando vuelve el ACUSE, no cuando se aprueba', async () => {
    // El estado no lo declara VIZO, lo declara la evidencia: aprobar es una
    // decisión interna; presentar es lo que la autoridad recibió.
    await capturar('2026-05-15', 1_200_000)
    const a = await generarAviso(
      db,
      { sesion, actividadId, periodo: '2026-05-01', granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    await marcarListoParaRevision(db, { sesion, avisoId: a.avisoId })
    await aprobarAviso(db, { sesion, avisoId: a.avisoId })

    expect((await pendientes('2026-06-12')).map((x) => x.periodo)).toContain('2026-05-01')

    await registrarAcuse(db, {
      sesion,
      avisoId: a.avisoId,
      storagePath: `${sesion.tenantId}/${a.avisoId}/acuse.pdf`,
    })

    expect((await pendientes('2026-06-12')).map((x) => x.periodo)).not.toContain('2026-05-01')
  })

  it('sin ninguna operación no inventa periodos', async () => {
    // LO QUE ESTA CONSULTA NO SABE: desde cuándo el obligado debe informar. Esa
    // fecha es la del alta ante la autoridad y no está en el modelo. Devolver
    // una lista aquí sería inventarla.
    expect(await pendientes('2026-06-12')).toEqual([])
  })
})
