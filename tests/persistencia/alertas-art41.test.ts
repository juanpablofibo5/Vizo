import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import type { ContextoSesion } from '../../src/persistencia/transaccion'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { pesos } from '../../src/dominio/dinero'

/**
 * El sistema de alertas del Art. 41 fr. V, sobre la base real.
 *
 * Lo que protegen: que la alerta cuelgue del ACTO y no del cliente —el texto
 * dice «actos u operaciones que se pretendan llevar a cabo con»—, que nazca en
 * la misma transacción que la operación, y que cada una pueda señalar el hecho
 * que la justifica.
 */
describe('Las alertas del Art. 41 fr. V', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let sucursalId: string
  let desarrolloId: string
  let marca: string

  const FECHA_ACTO = '2027-03-20'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(`update tenants set tipo_persona = 'moral' where id = $1`, [sesion.tenantId])

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
       values ($1,'fisica',$2,'Cliente del Art. 41','MX') returning id::text`,
      [sesion.tenantId, `A41${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad)
       values ($1,'Torre 41',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75) returning id::text`,
      [sesion.tenantId, `LIC41${marca}`],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  const operar = (fecha = FECHA_ACTO) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId, clienteId, desarrolloId,
        fechaOperacion: fecha,
        montoBase: pesos(400_000), iva: pesos(0), isai: pesos(0), otrosAccesorios: pesos(0),
        formaPago: '03',
      },
    })

  const alertas = async (tipo: string) => {
    const { rows } = await db.query(
      `select titulo, detalle, operacion_id::text, evaluacion_riesgo_id::text,
              declaracion_pep_id::text
         from alertas where tenant_id = $1 and tipo = $2::tipo_alerta`,
      [sesion.tenantId, tipo],
    )
    return rows as Array<{
      titulo: string; detalle: Record<string, unknown>; operacion_id: string
      evaluacion_riesgo_id: string | null; declaracion_pep_id: string | null
    }>
  }

  const declararPep = async (resultado: 'pep_por_funcion' | 'niega') => {
    await db.query('begin')
    const r = await db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,$3::resultado_declaracion_pep,date '2027-03-01',$4) returning id::text`,
      [sesion.tenantId, clienteId, resultado, sesion.usuarioId],
    )
    const id = (r.rows[0] as { id: string }).id
    if (resultado !== 'niega') {
      await db.query(
        `insert into vinculos_pep (tenant_id,declaracion_id,tipo,cargo,ambito,en_funciones)
         values ($1,$2,'titular','Directora de área','nacional',true)`,
        [sesion.tenantId, id],
      )
    }
    await db.query('commit')
    return id
  }

  const clasificar = async (clave: 'alto' | 'medio', vence = '2027-10-01') => {
    const grados: Record<string, string> = {}
    for (const [c, n, o, alto, min] of [
      ['bajo', 'Bajo', 1, false, 0],
      ['medio', 'Medio', 2, false, 35],
      ['alto', 'Alto', 3, true, 70],
    ] as const) {
      const r = await db.query(
        `insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
         values ($1,$2,$3,$4,$5,$6,date '2027-03-01') returning id::text`,
        [sesion.tenantId, c, n, o, alto, min],
      )
      grados[c] = (r.rows[0] as { id: string }).id
    }
    const el = await db.query(`select id from elementos_riesgo where clave = 'tipo_cliente'`)
    const m = await db.query(
      `insert into modelos_riesgo (tenant_id,version) values ($1,1) returning id::text`,
      [sesion.tenantId],
    )
    const modeloId = (m.rows[0] as { id: string }).id
    await db.query(
      `insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
       values ($1,$2,$3,'Factor de aserción',80)`,
      [sesion.tenantId, modeloId, (el.rows[0] as { id: string }).id],
    )
    await db.query(
      `update modelos_riesgo set estado='vigente', vigente_desde=date '2027-03-01',
              aprobado_por=$2, aprobado_en=now() where id=$1`,
      [modeloId, sesion.usuarioId],
    )
    const e = await db.query(
      `insert into evaluaciones_riesgo
         (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,vence)
       values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,$7::date) returning id::text`,
      [sesion.tenantId, clienteId, modeloId, grados[clave],
       clave === 'alto' ? 80 : 40, sesion.usuarioId, vence],
    )
    return (e.rows[0] as { id: string }).id
  }

  it('un cliente de grado ALTO levanta la alerta, y ésta nombra su evaluación', async () => {
    const evaluacionId = await clasificar('alto')
    const { operacionId } = await operar()

    const a = await alertas('cliente_riesgo_alto')
    expect(a).toHaveLength(1)
    expect(a[0]?.operacion_id).toBe(operacionId)
    expect(a[0]?.evaluacion_riesgo_id).toBe(evaluacionId)
    expect(a[0]?.detalle['fundamento']).toBe('Art. 41 fr. V del Acuerdo 115/2026')
    expect(a[0]?.detalle['grado']).toBe('Alto')
  })

  it('un cliente de grado medio NO la levanta', async () => {
    await clasificar('medio')
    await operar()
    expect(await alertas('cliente_riesgo_alto')).toEqual([])
  })

  it('CUELGA DEL ACTO: dos operaciones del mismo cliente alto levantan dos alertas', async () => {
    // El texto dice «actos u operaciones que se pretendan llevar a cabo CON»
    // clientes de riesgo alto. Una sola alerta por cliente dejaría la segunda
    // operación sin señal, que es justo la que el artículo quiere señalar.
    await clasificar('alto')
    const a1 = await operar('2027-03-20')
    const a2 = await operar('2027-03-21')

    const a = await alertas('cliente_riesgo_alto')
    expect(a).toHaveLength(2)
    expect(a.map((x) => x.operacion_id).sort()).toEqual([a1.operacionId, a2.operacionId].sort())
  })

  it('un cliente PEP levanta su alerta, y nombra la declaración', async () => {
    const declaracionId = await declararPep('pep_por_funcion')
    const { operacionId } = await operar()

    const a = await alertas('cliente_pep')
    expect(a).toHaveLength(1)
    expect(a[0]?.declaracion_pep_id).toBe(declaracionId)
    expect(a[0]?.operacion_id).toBe(operacionId)
    expect(a[0]?.detalle['declaracion_revisada']).toBe(false)
  })

  it('QUIEN NIEGA SER PEP no levanta alerta: declarar no es serlo', async () => {
    await declararPep('niega')
    await operar()
    expect(await alertas('cliente_pep')).toEqual([])
  })

  it('HUECO CONOCIDO: sin declaración ni clasificación, el acto no levanta NINGUNA alerta', async () => {
    // Esta prueba no celebra el comportamiento, lo fija. Se creyó que el caso
    // «no se sabe» ya lo cubría `aprobacion_directivo_pendiente`; es falso —
    // esa alerta solo nace cuando la exigencia es `exigible`, no cuando es
    // indeterminable. El día que se decida cerrar el hueco, esta prueba es la
    // que avisa que el comportamiento cambió a propósito.
    await operar()
    expect(await alertas('cliente_pep')).toEqual([])
    expect(await alertas('cliente_riesgo_alto')).toEqual([])
    const { rows } = await db.query(
      `select count(*)::int as n from alertas
        where tenant_id = $1 and tipo = 'aprobacion_directivo_pendiente'`,
      [sesion.tenantId],
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })

  it('los dos supuestos a la vez levantan DOS alertas, no una', async () => {
    // Se atienden distinto: el riesgo alto pide medidas reforzadas y
    // cuestionario; el PEP, aprobación de directivo y seguimiento.
    await clasificar('alto')
    await declararPep('pep_por_funcion')
    await operar()

    expect(await alertas('cliente_riesgo_alto')).toHaveLength(1)
    expect(await alertas('cliente_pep')).toHaveLength(1)
  })

  it('la alerta mide el vencimiento contra la FECHA DEL ACTO, no contra el reloj', async () => {
    // Nace vencida: `evaluaciones_riesgo` es append-only y la base rechaza el
    // UPDATE. Que la prueba no pueda mutarla es la guarda haciendo su trabajo.
    await clasificar('alto', '2027-01-01')
    await operar()
    const a = await alertas('cliente_riesgo_alto')
    expect(a[0]?.detalle['clasificacion_vencida_al_acto']).toBe(true)
  })

  it('REGLA DURA 3: el detalle no lleva nombre ni RFC del cliente', async () => {
    await clasificar('alto')
    await declararPep('pep_por_funcion')
    await operar()
    const texto = JSON.stringify([
      ...(await alertas('cliente_riesgo_alto')),
      ...(await alertas('cliente_pep')),
    ])
    expect(texto).not.toMatch(/Cliente del Art\. 41/)
    expect(texto).not.toMatch(new RegExp(`A41${marca}`))
  })
})
