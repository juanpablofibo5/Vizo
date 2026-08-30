import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { preparacionDelCatalogo } from '../../src/persistencia/preparacion'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2026-08-30'

/**
 * La preparación del catálogo, y el invariante que cierra el hueco del ensayo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ SE PROTEGE AQUÍ
 * ────────────────────────────────────────────────────────────────────────────
 * Los cuatro defectos que encontró levantar la demo a mano —desarrollo exigido
 * a todos, selects obligatorios sin opciones, el mensaje del backoffice en la
 * cara del obligado, y el expediente atado a la Fr. V Bis— eran el mismo error:
 * la pantalla decidía por su cuenta lo que el catálogo ya sabía.
 *
 * Ninguna prueba los vio porque todas miraban el motor, y el motor estaba bien.
 * Lo que faltaba era una que mirara la COSTURA: para cada actividad del
 * catálogo, ¿lo que la pantalla va a ofrecer coincide con lo que el catálogo
 * puede sostener?
 *
 * Estos casos son esa pregunta. No sustituyen a hacer clic —eso sigue siendo el
 * ensayo de la demo— pero sí impiden que una fracción nueva entre por INSERTs y
 * deje pantallas rotas que nadie note hasta enseñarlas.
 */
describe('La preparación del catálogo por actividad', () => {
  let db: Client
  let sesion: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
  })

  const contratar = async (fraccion: string): Promise<void> => {
    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion = $2`,
      [sesion.tenantId, fraccion],
    )
  }

  it('sin actividad contratada no hay nada que preparar', async () => {
    expect(await enTransaccionDeSesion(db, sesion, () =>
      preparacionDelCatalogo(db, { sesion, hoy: HOY }),
    )).toEqual([])
  })

  it('la V Bis está completa: es la fracción con la que el producto se construyó', async () => {
    await contratar('V_BIS')
    const [p] = await enTransaccionDeSesion(db, sesion, () =>
      preparacionDelCatalogo(db, { sesion, hoy: HOY }),
    )

    expect(p?.fraccion).toBe('V_BIS')
    expect(p?.requiereDesarrollo).toBe(true)
    expect(p?.faltantes).toEqual([])
    expect(p?.puedeCapturarOperacion).toBe(true)
    expect(p?.puedeAbrirExpediente).toBe(true)
    expect(p?.puedeGenerarAviso).toBe(true)
  })

  it('la Fr. VIII puede capturar y evaluar, pero todavía no generar aviso', async () => {
    // El estado real del piloto automotriz: sus tres umbrales están sembrados
    // citando la Ley, y el SPPLD no ha publicado su formato. La distinción
    // importa comercialmente — «funciona menos el envío» no es «no funciona».
    await contratar('VIII')
    const [p] = await enTransaccionDeSesion(db, sesion, () =>
      preparacionDelCatalogo(db, { sesion, hoy: HOY }),
    )

    expect(p?.fraccion).toBe('VIII')
    expect(p?.requiereDesarrollo).toBe(false)
    expect(p?.puedeCapturarOperacion).toBe(true)
    expect(p?.puedeGenerarAviso).toBe(false)
    expect(p?.faltantes.map((f) => f.clave)).toContain('formato_aviso')
  })

  it('CADA PIEZA QUE FALTA DICE QUÉ ROMPE, no cómo se llama la tabla', async () => {
    // Es lo que se le enseña al obligado. «Falta catalogos_sat» no le sirve a
    // nadie; «no se puede generar el aviso, y por qué» sí. El defecto 3 del
    // ensayo fue exactamente esto: el mensaje del backoffice en su cara.
    await contratar('VIII')
    const [p] = await enTransaccionDeSesion(db, sesion, () =>
      preparacionDelCatalogo(db, { sesion, hoy: HOY }),
    )

    expect(p?.faltantes.length).toBeGreaterThan(0)
    for (const f of p?.faltantes ?? []) {
      expect(f.bloquea.length).toBeGreaterThan(40)
      expect(f.nombre).not.toMatch(/_/)
      // Ni nombres de tabla ni de columna en lo que lee el obligado.
      expect(f.bloquea).not.toMatch(/campos_expediente|catalogos_sat|formatos_aviso|actividades_/)
    }
  })

  it('EL INVARIANTE: ninguna acción se declara posible sin la pieza que la sostiene', async () => {
    // Este es el caso que habría cazado los cuatro defectos de golpe. Recorre
    // TODAS las fracciones del catálogo —incluidas las que entren mañana por
    // INSERTs— y comprueba que lo ofrecido nunca exceda lo cargado.
    const { rows } = await db.query(`select fraccion from actividades_vulnerables`)
    const fracciones = (rows as { fraccion: string }[]).map((r) => r.fraccion)
    expect(fracciones.length).toBeGreaterThan(0)

    for (const fraccion of fracciones) {
      const m = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
      const s = await crearTenantConUsuario(db, m, 'admin')
      await db.query(
        `insert into actividades_tenant (tenant_id, actividad_id)
         select $1, id from actividades_vulnerables where fraccion = $2`,
        [s.tenantId, fraccion],
      )
      const [p] = await enTransaccionDeSesion(db, s, () =>
        preparacionDelCatalogo(db, { sesion: s, hoy: HOY }),
      )
      if (p === undefined) throw new Error(`${fraccion} no devolvió preparación`)

      const cargada = (c: string): boolean =>
        p.piezas.find((x) => x.clave === c)?.cargada === true

      // Ofrecer capturar sin umbrales sería evaluar contra nada.
      if (p.puedeCapturarOperacion) expect(cargada('umbrales')).toBe(true)
      // Ofrecer expediente sin su catálogo lo dejaría «completo» en vacío.
      if (p.puedeAbrirExpediente) expect(cargada('expediente')).toBe(true)
      // Ofrecer aviso sin formato produce un aviso rechazado, y tarde.
      if (p.puedeGenerarAviso) expect(cargada('formato_aviso')).toBe(true)
      // Y al revés: lo que falta tiene que estar dicho, nunca escondido.
      for (const pieza of p.piezas) {
        expect(pieza.cargada || p.faltantes.includes(pieza)).toBe(true)
      }
    }
  })

  it('la preparación es POR OBLIGADO: solo habla de lo que ese contrató', async () => {
    await contratar('VIII')
    const p = await enTransaccionDeSesion(db, sesion, () =>
      preparacionDelCatalogo(db, { sesion, hoy: HOY }),
    )
    expect(p.map((x) => x.fraccion)).toEqual(['VIII'])
  })
})
