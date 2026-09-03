import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import type { ContextoSesion } from '../../src/persistencia/transaccion'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { pesos } from '../../src/dominio/dinero'

/**
 * La alerta del Art. 32 cuando el pago fue en Metales Preciosos.
 *
 * Lo que protege: que la alerta más grave del portal se llame por lo que pasó
 * —no «efectivo» sobre un pago en oro— y que su desglose diga qué instrumento
 * fue, con la descripción congelada y no solo el código.
 */
describe('La alerta del Art. 32', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let sucursalId: string
  let desarrolloId: string

  const FECHA = '2026-03-15'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    const vBis = await db.query(`select id from actividades_vulnerables where fraccion = 'V_BIS'`)
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId, (vBis.rows[0] as { id: string }).id,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id::text`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Cliente del 32','MX') returning id::text`,
      [sesion.tenantId, `A32${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad)
       values ($1,'Torre 32',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75) returning id::text`,
      [sesion.tenantId, `LIC32${marca}`],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  const operar = (formaPago: string, instrumento?: string) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId, clienteId, desarrolloId,
        fechaOperacion: FECHA,
        montoBase: pesos(1_000_000), iva: pesos(0), isai: pesos(0), otrosAccesorios: pesos(0),
        formaPago,
        ...(instrumento === undefined ? {} : { instrumentoMonetario: instrumento }),
      },
    })

  const alertaDel32 = async () => {
    const { rows } = await db.query(
      `select titulo, detalle from alertas
        where tenant_id = $1 and detalle->>'por' = 'efectivo_restringido'`,
      [sesion.tenantId],
    )
    return rows as Array<{ titulo: string; detalle: Record<string, unknown> }>
  }

  it('ORO: la alerta se llama por el metal, no «efectivo»', async () => {
    // Pagado por transferencia según la forma de pago, en oro según el
    // instrumento. Antes esto no levantaba nada.
    await operar('03', '13')
    const a = await alertaDel32()
    expect(a).toHaveLength(1)
    expect(a[0]?.titulo).toMatch(/Metales Preciosos/)
    expect(a[0]?.detalle['motivo']).toMatch(/oro, la plata y el platino/)
  })

  it('y su desglose CONGELA la descripción, no solo el código', async () => {
    await operar('03', '13')
    const a = await alertaDel32()
    // Un «13» pelón obligaría a ir al catálogo para entender la alerta más
    // grave del portal, y el catálogo puede cambiar de descripción.
    expect(String(a[0]?.detalle['instrumento_restringido'])).toMatch(/Oro/)
    expect(String(a[0]?.detalle['instrumento_restringido'])).toMatch(/13/)
  })

  it('EFECTIVO por forma de pago sigue levantándola, y se llama efectivo', async () => {
    await operar('01')
    const a = await alertaDel32()
    expect(a).toHaveLength(1)
    expect(a[0]?.titulo).toMatch(/Efectivo/)
    expect(a[0]?.detalle['instrumento_restringido']).toBeUndefined()
  })

  it('una transferencia sin metal no levanta ninguna', async () => {
    await operar('03', '10')
    expect(await alertaDel32()).toEqual([])
  })

  it('la evaluación guarda qué instrumento la disparó', async () => {
    await operar('03', '15')
    const { rows } = await db.query(
      `select efectivo_restringido, instrumento_restringido from evaluaciones_umbral
        where tenant_id = $1`,
      [sesion.tenantId],
    )
    expect((rows[0] as { efectivo_restringido: boolean }).efectivo_restringido).toBe(true)
    expect((rows[0] as { instrumento_restringido: string }).instrumento_restringido).toBe('15')
  })
})
