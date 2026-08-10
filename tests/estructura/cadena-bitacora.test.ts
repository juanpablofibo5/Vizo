import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * La cadena de la bitácora y qué puede demostrar.
 *
 * Todas las alteraciones se hacen sobre una COPIA. La bitácora real nunca se
 * toca — y cada caso lo comprueba al final, porque "no la toqué" es una
 * afirmación y no una garantía.
 *
 * La copia y la real se verifican con la MISMA función
 * (`app.bitacora_verificar_en`). Una demo con su propia implementación
 * demostraría que esa copia detecta alteraciones, no que las detecte la que
 * corre en producción.
 */
describe('Cadena de la bitácora', () => {
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
    sesion = await crearTenantConUsuario(db, marca)

    for (const [evento, tipo] of [
      ['catalogo.seed_aplicado', 'catalogo'],
      ['cliente.alta', 'cliente'],
      ['operacion.registrada', 'operacion'],
      ['documento.alta', 'documento'],
      ['manifiesto.generado', 'manifiesto'],
    ]) {
      // CON actor: sin él, `actor_id` ya sería NULL y el test que lo pone en
      // NULL no probaría nada — pasaría por no cambiar el dato.
      await db.query(
        'select app.bitacora_registrar($1,$2,$3,gen_random_uuid(),$4::jsonb,$5)',
        [sesion.tenantId, evento, tipo, '{}', sesion.usuarioId],
      )
    }

    await db.query('drop table if exists copia_bitacora')
    await db.query(
      `create table copia_bitacora (like public.bitacora including all excluding identity)`,
    )
    await db.query(`insert into copia_bitacora select * from public.bitacora where tenant_id = $1`, [
      sesion.tenantId,
    ])
  })

  const verificarCopia = async () => {
    const { rows } = await db.query(
      `select secuencia_rota::int, motivo from app.bitacora_verificar_en($1, 'copia_bitacora'::regclass)`,
      [sesion.tenantId],
    )
    return rows[0] as { secuencia_rota: number; motivo: string } | undefined
  }

  const realIntacta = async () => {
    const { rows } = await db.query(`select * from app.bitacora_verificar($1)`, [sesion.tenantId])
    return rows.length === 0
  }

  it('una cadena sin tocar verifica', async () => {
    expect(await verificarCopia()).toBeUndefined()
    expect(await realIntacta()).toBe(true)
  })

  it('alterar el CONTENIDO de un evento se detecta, y dice cuál', async () => {
    await db.query(
      `update copia_bitacora set datos = '{"monto":"1.00"}'::jsonb where secuencia = 3`,
    )
    const r = await verificarCopia()
    expect(r?.secuencia_rota).toBe(3)
    expect(r?.motivo).toMatch(/alterado/)
    expect(await realIntacta()).toBe(true)
  })

  it('cambiar el ACTOR de un evento también: el hash cubre quién lo hizo', async () => {
    await db.query(`update copia_bitacora set actor_id = null where secuencia = 2`)
    const r = await verificarCopia()
    expect(r?.secuencia_rota).toBe(2)
    expect(await realIntacta()).toBe(true)
  })

  it('BORRAR un evento intermedio deja un hueco y se detecta', async () => {
    // El ataque realista: quitar el evento incómodo de en medio.
    await db.query(`delete from copia_bitacora where secuencia = 3`)
    const r = await verificarCopia()
    expect(r?.secuencia_rota).toBe(4)
    expect(r?.motivo).toMatch(/hueco en la secuencia/)
    expect(await realIntacta()).toBe(true)
  })

  it('reencadenar a mano no salva: el hash del eslabón siguiente no cuadra', async () => {
    // Alguien que sabe lo que hace altera el evento Y ajusta el hash_previo
    // del que sigue para que "empalme".
    await db.query(`update copia_bitacora set datos = '{"x":1}'::jsonb where secuencia = 2`)
    await db.query(
      `update copia_bitacora c
          set hash_previo = (select hash from copia_bitacora p where p.secuencia = 2 and p.tenant_id = c.tenant_id)
        where c.secuencia = 3`,
    )
    // Sigue detectándose: el hash del eslabón 2 ya no corresponde a su
    // contenido, y eso se revisa antes que el enlace.
    const r = await verificarCopia()
    expect(r?.secuencia_rota).toBe(2)
    expect(await realIntacta()).toBe(true)
  })

  /**
   * LA LIMITACIÓN QUE HAY QUE CONOCER.
   *
   * Una cadena de hashes detecta alteraciones y huecos, pero NO detecta que le
   * hayan cortado la cola: si se borran los últimos eventos, lo que queda sigue
   * siendo una cadena perfectamente válida — solo que más corta.
   *
   * Esto no es un defecto del encadenamiento, es lo que un encadenamiento puede
   * hacer. Lo que lo cierra es anclar la cabeza fuera de la propia bitácora:
   * cada manifiesto guarda `hash_bitacora_cabeza`, así que un manifiesto viejo
   * prueba que en su momento la cadena llegaba hasta cierto punto. Si la
   * bitácora ya no llega ahí, la cola se cortó.
   */
  describe('cortar la cola NO lo detecta la cadena sola', () => {
    it('borrar los últimos eventos deja una cadena válida más corta', async () => {
      await db.query(`delete from copia_bitacora where secuencia > 3`)
      // Verifica: no hay hueco ni hash roto.
      expect(await verificarCopia()).toBeUndefined()
      expect(await realIntacta()).toBe(true)
    })

    it('pero el ancla del manifiesto sí lo delata', async () => {
      // Lo que un manifiesto generado antes del recorte había guardado.
      const { rows: antes } = await db.query(`select app.bitacora_cabeza($1) as h`, [
        sesion.tenantId,
      ])
      const cabezaEnElManifiesto = (antes[0] as { h: string }).h

      await db.query(`delete from copia_bitacora where secuencia > 3`)

      const { rows: ahora } = await db.query(
        `select hash from copia_bitacora where tenant_id = $1 order by secuencia desc limit 1`,
        [sesion.tenantId],
      )
      const cabezaActual = (ahora[0] as { hash: string }).hash

      // La cadena verifica, pero ya no llega donde el manifiesto dice que
      // llegaba. Eso es la prueba del recorte.
      expect(await verificarCopia()).toBeUndefined()
      expect(cabezaActual).not.toBe(cabezaEnElManifiesto)
      expect(await realIntacta()).toBe(true)
    })
  })
})
