import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import {
  IdentidadIndeterminada,
  historialParaAcumulacion,
  normalizarClave,
  resolverIdentidad,
} from '../../src/persistencia/historial'
import { cargarConfigActividad } from '../../src/catalogo/cargador'
import { evaluar } from '../../src/dominio/motor'
import { pesos } from '../../src/dominio/dinero'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * El historial contra la base real.
 *
 * La suite del motor prueba la lógica con historiales en memoria; esto prueba
 * que la consulta trae lo que debe: mismo cliente, misma actividad, dentro de
 * la ventana, CRUZANDO SUCURSALES.
 */
describe('Historial para acumulación', () => {
  let db: Client
  let sesion: ContextoSesion
  let tenantId: string
  let actividadId: string
  let clienteId: string
  let otroClienteId: string
  let desarrolloId: string
  let sucNorte: string
  let sucCentro: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca)
    tenantId = sesion.tenantId
    actividadId = (
      (await db.query(`select id from actividades_vulnerables where fraccion='V_BIS'`))
        .rows[0] as { id: string }
    ).id

    const s1 = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Norte','NTE') returning id`,
      [tenantId],
    )
    sucNorte = (s1.rows[0] as { id: string }).id
    const s2 = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Centro','CTR') returning id`,
      [tenantId],
    )
    sucCentro = (s2.rows[0] as { id: string }).id

    const c1 = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
       values ($1,'fisica',$2,'Aportante uno') returning id`,
      [tenantId, `AAA${marca.slice(0, 9)}`],
    )
    clienteId = (c1.rows[0] as { id: string }).id
    const c2 = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
       values ($1,'fisica',$2,'Aportante dos') returning id`,
      [tenantId, `BBB${marca.slice(0, 9)}`],
    )
    otroClienteId = (c2.rows[0] as { id: string }).id

    const des = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre de prueba',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [tenantId, `LIC${marca}`],
    )
    desarrolloId = (des.rows[0] as { id: string }).id
  })

  async function operar(fecha: string, base: string, sucursal: string, cliente = clienteId) {
    const r = await db.query(
      `insert into operaciones (tenant_id,sucursal_id,cliente_id,actividad_id,fecha_operacion,
                                monto_base,iva,monto_total,forma_pago,desarrollo_id)
       values ($1,$2,$3,$4,$5,$6::numeric,0,$6::numeric,'03',$7) returning id`,
      [tenantId, sucursal, cliente, actividadId, fecha, base, desarrolloId],
    )
    return (r.rows[0] as { id: string }).id
  }

  /**
   * El historial exige correr como `authenticated` (issue #7): en la
   * aplicación comparte transacción con la operación que se está evaluando.
   * Aquí se le da una propia.
   */
  const enSesion = <T,>(cuerpo: () => Promise<T>): Promise<T> =>
    enTransaccionDeSesion(db, sesion, cuerpo)

  const params = (fecha: string) => ({
    sesion,
    clienteId,
    actividadId,
    fechaOperacion: fecha,
    ventanaMeses: 6,
  })

  it('cruza sucursales: es la promesa que un Excel por sucursal no puede cumplir', async () => {
    await operar('2026-06-01', '500000.00', sucNorte)
    await operar('2026-07-15', '480000.00', sucCentro)

    const historial = await enSesion(() => historialParaAcumulacion(db, params('2026-07-20')))
    expect(historial).toHaveLength(2)
    expect(historial.map((h) => h.montoBase)).toEqual([pesos(500_000), pesos(480_000)])
  })

  it('deja fuera lo que cayó antes de la ventana', async () => {
    await operar('2026-01-10', '500000.00', sucNorte) // 8 meses antes
    await operar('2026-06-01', '300000.00', sucNorte)

    const historial = await enSesion(() => historialParaAcumulacion(db, params('2026-09-10')))
    expect(historial).toHaveLength(1)
    expect(historial[0]?.montoBase).toBe(pesos(300_000))
  })

  it('no mezcla clientes', async () => {
    await operar('2026-06-01', '500000.00', sucNorte, clienteId)
    await operar('2026-06-02', '900000.00', sucNorte, otroClienteId)

    const historial = await enSesion(() => historialParaAcumulacion(db, params('2026-07-01')))
    expect(historial).toHaveLength(1)
    expect(historial[0]?.clienteId).toBe(clienteId)
  })

  it('excluye la operación que se está evaluando', async () => {
    await operar('2026-06-01', '400000.00', sucNorte)
    const evaluada = await operar('2026-06-15', '400000.00', sucNorte)

    const historial = await enSesion(() => historialParaAcumulacion(db, {
      ...params('2026-06-15'),
      excluirOperacionId: evaluada,
    }))
    expect(historial).toHaveLength(1)
    expect(historial[0]?.id).not.toBe(evaluada)
  })

  it('marca caeEnIdentificacion contra el umbral vigente en la fecha de CADA operación', async () => {
    // En V Bis la identificación es "siempre": todas caen, incluso montos
    // pequeños. Es lo que hace que la acumulación sea el caso típico.
    await operar('2026-06-01', '1000.00', sucNorte)
    const historial = await enSesion(() => historialParaAcumulacion(db, params('2026-07-01')))
    expect(historial[0]?.caeEnIdentificacion).toBe(true)
  })

  it('de punta a punta: tres pagos de preventa disparan el aviso en el tercero', async () => {
    await operar('2026-03-15', '400000.00', sucNorte)
    await operar('2026-04-15', '400000.00', sucCentro) // otra sucursal
    const tercero = await operar('2026-05-15', '400000.00', sucNorte)

    const config = await cargarConfigActividad(db, 'V_BIS', '2026-05-15')
    const historial = await enSesion(() => historialParaAcumulacion(db, {
      ...params('2026-05-15'),
      ventanaMeses: config.ventanaMeses,
      excluirOperacionId: tercero,
    }))

    const ev = evaluar(
      {
        operacion: {
          id: tercero,
          clienteId,
          sucursalId: sucNorte,
          actividadId,
          fechaOperacion: '2026-05-15',
          montoBase: pesos(400_000),
          iva: pesos(0),
          isai: pesos(0),
          otrosAccesorios: pesos(0),
          montoTotal: pesos(400_000),
          formaPago: '03',
          esEfectivo: false,
        },
        cliente: { id: clienteId, resolucionIdentidad: 'rfc' },
        historial,
      },
      config,
    )

    // 400,000 × 3 = 1,200,000 ≥ 941,412.75
    expect(ev.resultadoAviso).toBe('acumulacion')
    expect(ev.sumaVentana).toBe(pesos(1_200_000))
    expect(ev.operacionesAcumuladas).toHaveLength(2)
    expect(ev.motivo).toContain('acumulación')
  })
})

describe('Resolución de identidad', () => {
  it('normaliza claves capturadas con formatos distintos', () => {
    expect(normalizarClave(' xaxx-010101-000 ')).toBe('XAXX010101000')
    expect(normalizarClave('')).toBeNull()
    expect(normalizarClave(null)).toBeNull()
  })

  it('prefiere el RFC, luego la CURP, y al final la identidad alterna', () => {
    expect(resolverIdentidad({ rfc: 'XAXX010101000', curp: 'XAXX010101HDFABC01' })).toBe('rfc')
    expect(resolverIdentidad({ rfc: null, curp: 'XAXX010101HDFABC01' })).toBe('curp')
    expect(
      resolverIdentidad({ rfc: null, curp: null, identidadAlterna: { tipo_doc: 'pasaporte' } }),
    ).toBe('identidad_alterna')
  })

  it('un cliente sin ninguna clave no se puede acumular con confianza', () => {
    expect(() => resolverIdentidad({ rfc: null, curp: null })).toThrow(IdentidadIndeterminada)
  })

  it('nunca resuelve por nombre', () => {
    // El nombre no es parámetro de esta función a propósito: resolver identidad
    // por nombre es el camino directo a un falso negativo.
    expect(() => resolverIdentidad({ rfc: '  ', curp: '' })).toThrow(IdentidadIndeterminada)
  })
})
