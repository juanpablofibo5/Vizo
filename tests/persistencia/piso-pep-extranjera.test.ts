import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { evaluarClienteYRegistrar } from '../../src/persistencia/riesgo'

/**
 * El piso del Art. 23 Bis 4 sobre la base real.
 *
 * Lo que protegen: que el ámbito del VÍNCULO sea lo que decide —no la
 * nacionalidad del cliente—, que la fila guarde que el grado subió por el
 * artículo, y que sin declaración la respuesta sea «no se sabe».
 */
describe('El piso de la PEP extranjera', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let marca: string

  // Después del 1-mar-2027: el piso ya es exigible.
  const HOY = '2027-06-15'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')

    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Cliente del piso','MX') returning id::text`,
      [sesion.tenantId, `PPE${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    // Un modelo cuyo único factor pesa poco: sin el piso, el cliente sale bajo.
    for (const [clave, nombre, orden, alto, min] of [
      ['bajo', 'Bajo', 1, false, 0],
      ['medio', 'Medio', 2, false, 35],
      ['alto', 'Alto', 3, true, 70],
    ] as const) {
      await db.query(
        `insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
         values ($1,$2,$3,$4,$5,$6,date '2027-01-01')`,
        [sesion.tenantId, clave, nombre, orden, alto, min],
      )
    }
    const el = await db.query(`select id from elementos_riesgo where clave = 'tipo_cliente'`)
    const m = await db.query(
      `insert into modelos_riesgo (tenant_id,version) values ($1,1) returning id::text`,
      [sesion.tenantId],
    )
    const modeloId = (m.rows[0] as { id: string }).id
    await db.query(
      `insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
       values ($1,$2,$3,'Factor menor',10)`,
      [sesion.tenantId, modeloId, (el.rows[0] as { id: string }).id],
    )
    await db.query(
      `update modelos_riesgo set estado='vigente', vigente_desde=date '2027-01-01',
              metodo_medicion='suma_ponderada', aprobado_por=$2, aprobado_en=now()
        where id=$1`,
      [modeloId, sesion.usuarioId],
    )
  })

  const declarar = async (resultado: 'niega' | 'pep_por_funcion', ambito?: 'nacional' | 'extranjero') => {
    await db.query('begin')
    const r = await db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,$3::resultado_declaracion_pep,date '2027-03-01',$4) returning id::text`,
      [sesion.tenantId, clienteId, resultado, sesion.usuarioId],
    )
    if (ambito !== undefined) {
      // Un vínculo extranjero EXIGE el país: lo impide la base (Cap. III
      // Quáter). «Extranjero» sin decir cuál no identifica nada.
      await db.query(
        `insert into vinculos_pep (tenant_id,declaracion_id,tipo,cargo,ambito,pais,en_funciones)
         values ($1,$2,'titular','Cargo',$3::ambito_funcion_publica,$4,true)`,
        [
          sesion.tenantId,
          (r.rows[0] as { id: string }).id,
          ambito,
          ambito === 'extranjero' ? 'US' : null,
        ],
      )
    }
    await db.query('commit')
  }

  const evaluar = () =>
    evaluarClienteYRegistrar(db, {
      sesion, clienteId, factoresPresentes: [], hoy: HOY,
    })

  const conFactor = async () => {
    const f = await db.query(
      `select id::text from factores_modelo where tenant_id = $1`, [sesion.tenantId],
    )
    return evaluarClienteYRegistrar(db, {
      sesion, clienteId, factoresPresentes: [(f.rows[0] as { id: string }).id], hoy: HOY,
    })
  }

  const filaGuardada = async () => {
    const { rows } = await db.query(
      `select e.puntaje::text, e.piso_pep_extranjera, g.clave
         from evaluaciones_riesgo e join grados_riesgo g on g.id = e.grado_id
        where e.tenant_id = $1 order by e.evaluado_en desc limit 1`,
      [sesion.tenantId],
    )
    return rows[0] as { puntaje: string; piso_pep_extranjera: boolean; clave: string }
  }

  it('PEP EXTRANJERA: el grado sube y la fila dice que fue por el artículo', async () => {
    await declarar('pep_por_funcion', 'extranjero')
    const { resultado } = await enTransaccionDeSesion(db, sesion, conFactor)
    if (resultado.estado !== 'evaluado') throw new Error('esperaba evaluado')

    expect(resultado.gradoClave).toBe('alto')
    expect(resultado.pisoPepExtranjera).toBe('aplicado')
    const fila = await filaGuardada()
    expect(fila.clave).toBe('alto')
    expect(fila.piso_pep_extranjera).toBe(true)
    // El puntaje calculado se conserva: 10, no 70.
    expect(Number(fila.puntaje)).toBe(10)
  })

  it('PEP NACIONAL no dispara el piso: decide el ámbito del vínculo', async () => {
    await declarar('pep_por_funcion', 'nacional')
    const { resultado } = await enTransaccionDeSesion(db, sesion, conFactor)
    if (resultado.estado !== 'evaluado') throw new Error('esperaba evaluado')
    expect(resultado.gradoClave).toBe('bajo')
    expect(resultado.pisoPepExtranjera).toBe('no_aplica')
    expect((await filaGuardada()).piso_pep_extranjera).toBe(false)
  })

  it('quien NIEGA ser PEP tampoco', async () => {
    await declarar('niega')
    const { resultado } = await enTransaccionDeSesion(db, sesion, conFactor)
    if (resultado.estado !== 'evaluado') throw new Error('esperaba evaluado')
    expect(resultado.pisoPepExtranjera).toBe('no_aplica')
  })

  it('SIN DECLARACIÓN la respuesta es «no se sabe», y queda escrita', async () => {
    const { resultado } = await enTransaccionDeSesion(db, sesion, conFactor)
    if (resultado.estado !== 'evaluado') throw new Error('esperaba evaluado')
    expect(resultado.pisoPepExtranjera).toBe('no_se_sabe')
    expect(resultado.gradoClave).toBe('bajo')
    // Y la fila NO marca el piso: no se aplicó.
    expect((await filaGuardada()).piso_pep_extranjera).toBe(false)
  })

  it('antes del 1 de marzo de 2027 el piso todavía no obliga', async () => {
    await declarar('pep_por_funcion', 'extranjero')
    const f = await db.query(
      `select id::text from factores_modelo where tenant_id = $1`, [sesion.tenantId],
    )
    const { resultado } = await enTransaccionDeSesion(db, sesion, () =>
      evaluarClienteYRegistrar(db, {
        sesion, clienteId, factoresPresentes: [(f.rows[0] as { id: string }).id],
        hoy: '2027-02-28',
      }),
    )
    if (resultado.estado !== 'evaluado') throw new Error('esperaba evaluado')
    expect(resultado.pisoPepExtranjera).toBe('no_exigible')
    expect(resultado.gradoClave).toBe('bajo')
  })

  it('sin factores presentes el motor no inventa un grado', async () => {
    await declarar('pep_por_funcion', 'extranjero')
    const { resultado } = await enTransaccionDeSesion(db, sesion, evaluar)
    // Cero factores da puntaje cero, que cae en el grado más bajo; el piso lo
    // sube igual, porque el artículo no habla del puntaje.
    if (resultado.estado !== 'evaluado') throw new Error('esperaba evaluado')
    expect(resultado.puntaje).toBe(0)
    expect(resultado.gradoClave).toBe('alto')
  })
})
