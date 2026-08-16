import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { ConsolidacionNoPermitida, generarAviso } from '../../src/persistencia/aviso'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const PERIODO = '2026-05-01'

/**
 * Consolidar el periodo exige un solo desarrollo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FUENTE
 * ────────────────────────────────────────────────────────────────────────────
 * Art. 24 Bis 1 del Acuerdo 115/2026 —DOF del 7 de agosto de 2026, edición
 * vespertina, código 5795797—. La regla general es **un Aviso por cada acto u
 * operación**; para la Fr. V Bis abre una excepción:
 *
 *   «es posible enviar en un Aviso todos los actos u operaciones realizados
 *   durante el mes calendario correspondiente siempre que los recursos
 *   recibidos sean aplicados al mismo Desarrollo Inmobiliario…»
 *
 * Hasta contrastar el texto, VIZO soportaba las dos granularidades sin elegir
 * —lo correcto mientras la norma no estaba verificada— pero el modo
 * consolidado agrupaba TODO el periodo sin mirar el desarrollo.
 *
 * El aviso resultante habría validado contra el XSD, porque el esquema no sabe
 * de esta regla. Válido y prohibido a la vez: el modo de falla de siempre.
 */
describe('Consolidar un periodo', () => {
  let db: Client
  let admin: ContextoSesion
  let almacen: AlmacenDocumentos
  let actividadId: string
  let sucursalId: string
  let clienteId: string
  let torreA: string
  let torreB: string

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

  const desarrollo = async (nombre: string, licencia: string): Promise<string> => {
    const { rows } = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,$2,$3,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id::text`,
      [admin.tenantId, nombre, licencia],
    )
    return (rows[0] as { id: string }).id
  }

  /** Un pago que cruza el umbral por sí solo: $941,412.75 con la UMA de 2026. */
  const aportar = async (desarrolloId: string, fecha: string): Promise<void> => {
    await registrarOperacion(db, {
      sesion: admin,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        fechaOperacion: fecha,
        montoBase: pesos(1_200_000),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        instrumentoMonetario: '1',
        monedaCodigo: '1',
      },
    })
  }

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    almacen = almacenComo(admin, BUCKET_AVISOS)

    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      admin.tenantId,
      actividadId,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id::text`,
      [admin.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora SA','MX') returning id::text`,
      [admin.tenantId, `CON${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    torreA = await desarrollo('Torre A', `LICA${marca}`)
    torreB = await desarrollo('Torre B', `LICB${marca}`)
  })

  it('con DOS desarrollos, consolidar se detiene', async () => {
    await aportar(torreA, '2026-05-10')
    await aportar(torreB, '2026-05-20')

    await expect(
      generarAviso(
        db,
        { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_periodo' },
        almacen,
      ),
    ).rejects.toThrow(ConsolidacionNoPermitida)
  })

  it('y el aviso POR OPERACIÓN sí sale: es la regla general del Art. 24 Bis 1', async () => {
    // Detenerse no puede dejar al obligado sin salida. La regla general del
    // artículo es un aviso por operación, y ese camino queda abierto.
    await aportar(torreA, '2026-05-10')
    await aportar(torreB, '2026-05-20')

    const r = await generarAviso(
      db,
      { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    expect(r.xml).toContain('LICA')
    expect(r.xml).toContain('LICB')
  })

  it('con UN solo desarrollo, consolidar es lo que el artículo permite', async () => {
    // El control positivo, y la excepción textual: mismo Desarrollo
    // Inmobiliario, un solo Aviso con todo el mes.
    await aportar(torreA, '2026-05-10')
    await aportar(torreA, '2026-05-20')

    const r = await generarAviso(
      db,
      { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_periodo' },
      almacen,
    )
    expect(r.xml).toContain('LICA')
    expect(r.xml).not.toContain('LICB')
  })
})
