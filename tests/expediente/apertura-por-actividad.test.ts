import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { abrirExpediente } from '../../src/persistencia/expediente'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * De qué ACTIVIDAD se abre un expediente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL HALLAZGO X-01, EN LA PUERTA QUE SE QUEDÓ SIN ARREGLAR
 * ────────────────────────────────────────────────────────────────────────────
 * `registrarOperacion` decía `where av.fraccion = 'V_BIS'` y se corrigió con el
 * caso X-01: el motor es agnóstico de fracción, y su puerta de entrada tenía
 * que serlo también. `abrirExpediente` decía exactamente lo mismo y NO se tocó,
 * así que la corrección quedó a medias durante semanas sin que nada lo dijera:
 * un obligado de la Fr. VIII podía capturar ventas —esa puerta ya estaba
 * arreglada— y se estrellaba al abrirle expediente a cualquier cliente,
 * pidiéndole una fracción que no ejerce.
 *
 * Lo encontró levantar la demo completa, no la suite. Estos casos existen para
 * que la próxima fracción que entre por INSERTs no repita el viaje.
 */
describe('El expediente se abre contra la actividad CONTRATADA, no contra una fracción escrita en el código', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  const marca = () =>
    String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)

  const conCliente = async (m: string): Promise<string> => {
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Cliente de Apertura','MX') returning id::text`,
      [sesion.tenantId, `APE${m}`],
    )
    return (c.rows[0] as { id: string }).id
  }

  const contratar = async (fraccion: string): Promise<void> => {
    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion = $2`,
      [sesion.tenantId, fraccion],
    )
  }

  beforeEach(async () => {
    const m = marca()
    sesion = await crearTenantConUsuario(db, m, 'admin')
    clienteId = await conCliente(m)
  })

  it('un obligado de la Fr. VIII abre expediente de la VIII, no de la V Bis', async () => {
    // El caso exacto de la agencia automotriz de la demo. Antes reventaba con
    // «Este obligado no tiene registrada la Fracción V Bis».
    await contratar('VIII')

    const r = await abrirExpediente(db, { sesion, clienteId })
    expect(r.yaExistia).toBe(false)

    const { rows } = await db.query(
      `select av.fraccion from expedientes e
         join actividades_vulnerables av on av.id = e.actividad_id
        where e.id = $1`,
      [r.expedienteId],
    )
    expect((rows[0] as { fraccion: string }).fraccion).toBe('VIII')
  })

  it('un obligado de la V Bis sigue abriendo la suya — la corrección no mueve lo que ya servía', async () => {
    await contratar('V_BIS')

    const r = await abrirExpediente(db, { sesion, clienteId })
    const { rows } = await db.query(
      `select av.fraccion from expedientes e
         join actividades_vulnerables av on av.id = e.actividad_id
        where e.id = $1`,
      [r.expedienteId],
    )
    expect((rows[0] as { fraccion: string }).fraccion).toBe('V_BIS')
  })

  it('sin ninguna actividad contratada se detiene: un expediente sin catálogo se vería completo', async () => {
    await expect(abrirExpediente(db, { sesion, clienteId })).rejects.toThrow(
      /ninguna actividad vulnerable contratada/i,
    )
  })

  it('con VARIAS contratadas no adivina: exige que se diga cuál', async () => {
    // Es el escenario que el propio piloto plantea («capturar 1, cumplir 3»).
    // Elegir por él mediría la completitud contra el catálogo de otra
    // fracción, y un expediente medido contra la lista equivocada se ve
    // completo sin estarlo.
    await contratar('V_BIS')
    await contratar('VIII')

    await expect(abrirExpediente(db, { sesion, clienteId })).rejects.toThrow(
      /varias actividades contratadas/i,
    )

    // Diciendo cuál, procede — y abre la que se le nombró.
    const elegida = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'VIII'`,
    )
    const actividadId = (elegida.rows[0] as { id: string }).id
    const r = await abrirExpediente(db, { sesion, clienteId, actividadId })
    const { rows } = await db.query(
      `select actividad_id::text from expedientes where id = $1`,
      [r.expedienteId],
    )
    expect((rows[0] as { actividad_id: string }).actividad_id).toBe(actividadId)
  })

  it('una actividad que el obligado NO contrató se rechaza por su nombre', async () => {
    await contratar('VIII')
    const ajena = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    const actividadId = (ajena.rows[0] as { id: string }).id

    await expect(abrirExpediente(db, { sesion, clienteId, actividadId })).rejects.toThrow(
      /no está contratada/i,
    )
  })
})
