import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { cargarConfigActividad } from '../../src/catalogo/cargador'
import { evaluar } from '../../src/dominio/motor'
import { registrarEvaluacion } from '../../src/persistencia/evaluaciones'
import { casoPara } from '../soporte/fixtures'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * Envuelve el registro en su transacción de sesión.
 *
 * `registrarEvaluacion` exige correr como `authenticated` (issue #7): en la
 * aplicación comparte transacción con la operación que la origina, así que no
 * abre la suya. Aquí se le da una.
 */
async function registrarEnSesion(
  db: Client,
  sesion: ContextoSesion,
  datos: Omit<Parameters<typeof registrarEvaluacion>[1], 'sesion'>,
): Promise<string> {
  return enTransaccionDeSesion(db, sesion, () =>
    registrarEvaluacion(db, { ...datos, sesion }),
  )
}

/**
 * El registro de la evaluación es lo que se defiende en una visita.
 *
 * No basta con que el motor calcule bien: hay que poder demostrar, años
 * después, CON QUÉ calculó. Estos tests verifican que los insumos sobreviven
 * el viaje a Postgres sin perder precisión y que la fila queda inmutable.
 */
describe('Registro de evaluaciones', () => {
  let db: Client
  let sesion: ContextoSesion
  let tenantId: string
  let clienteId: string
  let desarrolloId: string
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
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca)
    tenantId = sesion.tenantId

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

  async function insertarOperacion(base: string, total: string, fecha: string): Promise<string> {
    const r = await db.query(
      `insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                                fecha_operacion, monto_base, iva, monto_total, forma_pago,
                                desarrollo_id)
       values ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,'03',$9) returning id`,
      [tenantId, sucursalId, clienteId, actividadId, fecha, base, (Number(total) - Number(base)).toFixed(2), total, desarrolloId],
    )
    return (r.rows[0] as { id: string }).id
  }

  it('guarda los insumos con los que se calculó, no solo el resultado', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const operacionId = await insertarOperacion('950000.00', '950000.00', '2026-02-15')
    const ev = evaluar(casoPara(config, { id: operacionId, fecha: '2026-02-15', base: 950_000 }), config)

    const id = await registrarEnSesion(db, sesion, { evaluacion: ev, config })
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
    expect(aviso?.['base']).toBe('sin_contribuciones')

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
    const operacionId = await insertarOperacion('910000.00', '910000.00', '2026-01-15')
    const ev = evaluar(casoPara(config, { id: operacionId, fecha: '2026-01-15', base: 910_000 }), config)

    const id = await registrarEnSesion(db, sesion, { evaluacion: ev, config })
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
    const operacionId = await insertarOperacion('500000.00', '500000.00', '2026-02-15')
    const ev = evaluar(casoPara(config, { id: operacionId, fecha: '2026-02-15', base: 500_000 }), config)
    const id = await registrarEnSesion(db, sesion, { evaluacion: ev, config })

    await expect(
      db.query(`update evaluaciones_umbral set resultado_aviso = 'no' where id = $1`, [id]),
    ).rejects.toThrow(/append-only/)

    await expect(
      db.query(`delete from evaluaciones_umbral where id = $1`, [id]),
    ).rejects.toThrow(/append-only/)
  })

  it('reevaluar no pisa la evaluación anterior: son dos filas', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const operacionId = await insertarOperacion('500000.00', '500000.00', '2026-02-15')
    const caso = casoPara(config, { id: operacionId, fecha: '2026-02-15', base: 500_000 })

    await registrarEnSesion(db, sesion, { evaluacion: evaluar(caso, config), config })
    await registrarEnSesion(db, sesion, { evaluacion: evaluar(caso, config), config })

    const { rows } = await db.query(
      `select count(*)::int as n from evaluaciones_umbral where operacion_id = $1`,
      [operacionId],
    )
    expect((rows[0] as { n: number }).n).toBe(2)
  })
})

/**
 * La firma que hace imposible el registro incoherente.
 *
 * Antes, `registrarEvaluacion` recibía `operacionId` suelto y nada impedía
 * guardar el cálculo de una operación apuntando a otra: el registro quedaba
 * diciendo que una operación de $100,000 generó aviso individual con un monto
 * considerado de $950,000. Y eso vive en la tabla que se defiende ante la
 * autoridad.
 *
 * Ahora el id viaja DENTRO de la evaluación, sellado por el motor. Este test
 * verifica el sello; el compilador se encarga del resto (pasar un id suelto ya
 * no compila, que es la mejor prueba posible).
 */
describe('La evaluación se sella con su operación', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  it('el motor sella el resultado con el id de la operación evaluada', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const caso = casoPara(config, { id: 'operacion-concreta', fecha: '2026-02-15', base: 950_000 })
    const ev = evaluar(caso, config)

    expect(ev.operacionId).toBe('operacion-concreta')
    expect(ev.operacionId).toBe(caso.operacion.id)
  })

  it('el registro apunta siempre a la operación que se evaluó', async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    // Un obligado DISTINTO al del beforeEach, con su propio usuario: el
    // registro corre como authenticated y el actor tiene que existir en ese
    // tenant, no en otro.
    const otra = await crearTenantConUsuario(db, marca)
    const tid = otra.tenantId
    const act = (
      (await db.query(`select id from actividades_vulnerables where fraccion='V_BIS'`)).rows[0] as {
        id: string
      }
    ).id
    const suc = (
      (
        await db.query(
          `insert into sucursales (tenant_id,nombre,clave) values ($1,'N','N') returning id`,
          [tid],
        )
      ).rows[0] as { id: string }
    ).id
    const cli = (
      (
        await db.query(
          `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
           values ($1,'fisica',$2,'X') returning id`,
          [tid, `SEL${marca}`],
        )
      ).rows[0] as { id: string }
    ).id
    const desOtra = (
      (
        await db.query(
          `insert into desarrollos_inmobiliarios
             (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
              tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
              otras_empresas,objeto_aviso_anterior)
           values ($1,'Torre ajena',$2,'31','97000','CENTRO','CALLE 60','5',
                   50000000.00,120.00,941412.75,false,false) returning id`,
          [tid, `LICO${marca}`],
        )
      ).rows[0] as { id: string }
    ).id
    const op = (
      (
        await db.query(
          `insert into operaciones (tenant_id,sucursal_id,cliente_id,actividad_id,fecha_operacion,
                                    monto_base,iva,monto_total,forma_pago,desarrollo_id)
           values ($1,$2,$3,$4,'2026-02-15',950000,0,950000,'03',$5) returning id`,
          [tid, suc, cli, act, desOtra],
        )
      ).rows[0] as { id: string }
    ).id

    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const ev = evaluar(casoPara(config, { id: op, fecha: '2026-02-15', base: 950_000 }), config)
    const id = await registrarEnSesion(db, otra, { evaluacion: ev, config })

    // El monto registrado y el de la operación tienen que ser el mismo.
    const { rows } = await db.query(
      `select e.monto_base_considerado::text as ev, o.monto_base::text as op
         from evaluaciones_umbral e join operaciones o on o.id = e.operacion_id
        where e.id = $1`,
      [id],
    )
    const f = rows[0] as Record<string, string>
    expect(f['ev']).toBe(f['op'])
  })

  describe('ISSUE #7: no se puede registrar saltándose RLS', () => {
    const nuevaMarca = () =>
      String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)

    it('rechaza correr como postgres, que salta las políticas', async () => {
      const sesion = await crearTenantConUsuario(db, nuevaMarca())
      const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      // No hace falta que la operación exista: la precondición corta ANTES de
      // tocar la tabla. Que corte antes es justamente lo que se está probando.
      const operacionId = (
        (await db.query('select gen_random_uuid() as id')).rows[0] as { id: string }
      ).id
      const ev = evaluar(
        casoPara(config, { id: operacionId, fecha: '2026-02-15', base: 950_000 }),
        config,
      )

      // Sin envolver: la conexión es la de los tests, rol postgres.
      await expect(registrarEvaluacion(db, { sesion, evaluacion: ev, config })).rejects.toThrow(
        /se salta RLS/,
      )

      // Y no dejó nada a medias.
      const { rows } = await db.query(
        `select count(*)::int as n from evaluaciones_umbral where operacion_id = $1`,
        [operacionId],
      )
      expect((rows[0] as { n: number }).n).toBe(0)
    })

    it('rechaza una sesión cuyo tenant no es el de la transacción', async () => {
      const sesion = await crearTenantConUsuario(db, nuevaMarca())
      const otra = await crearTenantConUsuario(db, nuevaMarca())
      const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      const operacionId = (
        (await db.query('select gen_random_uuid() as id')).rows[0] as { id: string }
      ).id
      const ev = evaluar(
        casoPara(config, { id: operacionId, fecha: '2026-02-15', base: 950_000 }),
        config,
      )

      // La transacción se abre con una sesión y se registra con otra.
      await expect(
        enTransaccionDeSesion(db, sesion, () =>
          registrarEvaluacion(db, { sesion: otra, evaluacion: ev, config }),
        ),
      ).rejects.toThrow(/obligado equivocado/)
    })
  })
})
