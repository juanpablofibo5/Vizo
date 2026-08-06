import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db.js'
import { cargarConfigActividad } from '../../src/catalogo/cargador.js'
import { evaluar } from '../../src/dominio/motor.js'
import { registrarEvaluacion } from '../../src/persistencia/evaluaciones.js'
import { entrada, operacion } from '../soporte/fixtures.js'

/**
 * El registro de la evaluación es lo que se defiende en una visita.
 *
 * No basta con que el motor calcule bien: hay que poder demostrar, años
 * después, CON QUÉ calculó. Estos tests verifican que los insumos sobreviven
 * el viaje a Postgres sin perder precisión y que la fila queda inmutable.
 */
describe('Registro de evaluaciones', () => {
  let db: Client
  let tenantId: string
  let clienteId: string
  let sucursalId: string
  let actividadId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    // Un tenant por corrida: las operaciones son append-only, así que no se
    // pueden limpiar. RFC único por timestamp.
    const marca = String(Date.now()).slice(-9)
    const t = await db.query(
      `insert into tenants (rfc, razon_social) values ($1, 'Prueba de registro') returning id`,
      [`TST${marca}`],
    )
    tenantId = (t.rows[0] as { id: string }).id

    const a = await db.query(`select id from actividades_vulnerables where fraccion = 'V_BIS'`)
    actividadId = (a.rows[0] as { id: string }).id

    const s = await db.query(
      `insert into sucursales (tenant_id, nombre, clave) values ($1,'Norte','NTE') returning id`,
      [tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id

    const c = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social)
       values ($1,'fisica',$2,'Aportante de prueba') returning id`,
      [tenantId, `XAX${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  async function insertarOperacion(base: string, total: string, fecha: string): Promise<string> {
    const r = await db.query(
      `insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                                fecha_operacion, monto_base, iva, monto_total, forma_pago)
       values ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,'03') returning id`,
      [tenantId, sucursalId, clienteId, actividadId, fecha, base, (Number(total) - Number(base)).toFixed(2), total],
    )
    return (r.rows[0] as { id: string }).id
  }

  it('guarda los insumos con los que se calculó, no solo el resultado', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const ev = evaluar(entrada(operacion({ fecha: '2026-02-15', base: 950_000 })), config)
    const operacionId = await insertarOperacion('950000.00', '950000.00', '2026-02-15')

    const id = await registrarEvaluacion(db, { tenantId, operacionId, evaluacion: ev, config })
    expect(id).toBeTruthy()

    const { rows } = await db.query(
      `select uma_valor::text, uma_vigencia::text, catalogo_version,
              monto_base_considerado::text, monto_total_considerado::text,
              resultado_aviso::text, requiere_identificacion, alerta_proximidad,
              umbrales_aplicados, parametros_aplicados, motivo
         from evaluaciones_umbral where id = $1`,
      [id],
    )
    const f = rows[0] as Record<string, unknown>

    // La UMA con la que se evaluó, no "la actual"
    expect(f['uma_valor']).toBe('117.31')
    expect(f['uma_vigencia']).toBe('[2026-02-01,)')

    // Los montos sobreviven sin perder centavos
    expect(f['monto_base_considerado']).toBe('950000.00')
    expect(f['resultado_aviso']).toBe('individual')
    expect(f['requiere_identificacion']).toBe(true)
    expect(f['alerta_proximidad']).toBe(false)

    // El snapshot de los umbrales incluye el valor ya convertido a pesos:
    // es el número contra el que realmente se comparó.
    const umbrales = f['umbrales_aplicados'] as Array<Record<string, unknown>>
    const aviso = umbrales.find((u) => u['tipo'] === 'aviso')
    expect(aviso?.['valor_uma']).toBe('8025.00')
    expect(aviso?.['en_pesos']).toBe('941412.75')
    expect(aviso?.['base']).toBe('sin_iva')

    // Y los parámetros, que también son datos del catálogo
    expect(f['parametros_aplicados']).toMatchObject({
      ventana_acumulacion_meses: 6,
      umbral_proximidad_pct: 90,
    })

    // La huella del catálogo permite decir "se calculó con este estado"
    expect(f['catalogo_version']).toMatch(/^[0-9a-f]{64}$/)
    expect(f['motivo']).toContain('941,412.75')
  })

  it('una operación de enero queda registrada con la UMA de 2025', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-01-15')
    const ev = evaluar(entrada(operacion({ fecha: '2026-01-15', base: 910_000 })), config)
    const operacionId = await insertarOperacion('910000.00', '910000.00', '2026-01-15')

    const id = await registrarEvaluacion(db, { tenantId, operacionId, evaluacion: ev, config })
    const { rows } = await db.query(
      `select uma_valor::text, uma_vigencia::text, resultado_aviso::text
         from evaluaciones_umbral where id = $1`,
      [id],
    )
    const f = rows[0] as Record<string, unknown>

    // El mismo monto en febrero NO habría generado aviso. Poder demostrar con
    // qué UMA se evaluó es exactamente lo que hace defendible el cálculo.
    expect(f['uma_valor']).toBe('113.14')
    expect(f['uma_vigencia']).toBe('[2025-02-01,2026-02-01)')
    expect(f['resultado_aviso']).toBe('individual')
  })

  it('la evaluación registrada es inmutable', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const ev = evaluar(entrada(operacion({ fecha: '2026-02-15', base: 500_000 })), config)
    const operacionId = await insertarOperacion('500000.00', '500000.00', '2026-02-15')
    const id = await registrarEvaluacion(db, { tenantId, operacionId, evaluacion: ev, config })

    await expect(
      db.query(`update evaluaciones_umbral set resultado_aviso = 'no' where id = $1`, [id]),
    ).rejects.toThrow(/append-only/)

    await expect(
      db.query(`delete from evaluaciones_umbral where id = $1`, [id]),
    ).rejects.toThrow(/append-only/)
  })

  it('reevaluar no pisa la evaluación anterior: son dos filas', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const op = operacion({ fecha: '2026-02-15', base: 500_000 })
    const operacionId = await insertarOperacion('500000.00', '500000.00', '2026-02-15')

    await registrarEvaluacion(db, { tenantId, operacionId, evaluacion: evaluar(entrada(op), config), config })
    await registrarEvaluacion(db, { tenantId, operacionId, evaluacion: evaluar(entrada(op), config), config })

    const { rows } = await db.query(
      `select count(*)::int as n from evaluaciones_umbral where operacion_id = $1`,
      [operacionId],
    )
    expect((rows[0] as { n: number }).n).toBe(2)
  })
})
