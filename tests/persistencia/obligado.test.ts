import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import {
  FechaDeAltaInvalida,
  NoAutorizado,
  registrarFechaAlta,
} from '../../src/persistencia/obligado'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * La fecha de alta ante la autoridad.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ────────────────────────────────────────────────────────────────────────────
 * El formulario de Configuración se construyó en F1 y **nunca pudo guardar**,
 * en ningún ambiente: `tenants` tenía una sola política —de SELECT— y
 * `authenticated` un solo privilegio —SELECT—. El UPDATE tocaba 0 filas y la
 * acción lo reportaba como «solo un administrador puede», que apunta a la causa
 * equivocada: tampoco el admin podía.
 *
 * No lo encontró ninguna prueba porque la lógica vivía dentro del Server Action
 * y no había forma de llamarla sin navegador. Y no se notó a ojo porque en
 * local la fecha llega por `seed.sql`: el campo siempre se veía lleno.
 *
 * La lección quedó en el código: lo que escribe vive en `src/persistencia/`,
 * donde una prueba puede ejercerlo con una sesión de verdad.
 */
describe('Fecha de alta del obligado', () => {
  let db: Client
  let admin: ContextoSesion
  let capturista: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, `OB${marca}`, 'admin')
    // Un capturista DEL MISMO obligado: la diferencia a probar es el rol, no el
    // aislamiento entre obligados, que ya cubren otras pruebas.
    const { rows } = await db.query(
      `insert into auth.users (id, instance_id, aud, role, email,
                               confirmation_token, recovery_token, email_change_token_new,
                               email_change, email_change_token_current, phone_change,
                               phone_change_token, reauthentication_token)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
               'authenticated', 'authenticated', $1, '', '', '', '', '', '', '', '')
       returning id::text`,
      [`capturista-${marca}@vizo.test`],
    )
    const id = (rows[0] as { id: string }).id
    await db.query(
      `insert into usuarios (id, tenant_id, rol, nombre, email) values ($1,$2,'capturista','Capturista',$3)`,
      [id, admin.tenantId, `capturista-${marca}@vizo.test`],
    )
    capturista = { usuarioId: id, tenantId: admin.tenantId, rol: 'capturista' }
  })

  const fechaGuardada = async (tenantId: string): Promise<string | null> => {
    const { rows } = await db.query(
      `select fecha_alta_autoridad::text from tenants where id = $1`,
      [tenantId],
    )
    return (rows[0] as { fecha_alta_autoridad: string | null }).fecha_alta_autoridad
  }

  it('el admin la registra, y queda guardada', async () => {
    // La prueba que faltaba. Si el grant o la política desaparecen, esto muere.
    await registrarFechaAlta(db, { sesion: admin, fecha: '2026-03-09' })
    expect(await fechaGuardada(admin.tenantId)).toBe('2026-03-09')
  })

  it('queda en la bitácora, porque mueve las obligaciones pendientes', async () => {
    await registrarFechaAlta(db, { sesion: admin, fecha: '2026-03-09' })

    const { rows } = await db.query(
      `select datos from bitacora
        where tenant_id = $1 and evento = 'obligado.fecha_alta_registrada'`,
      [admin.tenantId],
    )
    expect((rows[0] as { datos: Record<string, unknown> }).datos['fecha_alta_autoridad']).toBe(
      '2026-03-09',
    )
  })

  it('un capturista NO puede cambiarla', async () => {
    await expect(
      registrarFechaAlta(db, { sesion: capturista, fecha: '2026-03-09' }),
    ).rejects.toThrow(NoAutorizado)
    expect(await fechaGuardada(admin.tenantId)).toBeNull()
  })

  it('el admin NO puede cambiar el RFC de su obligado', async () => {
    // El privilegio es por columna: el RFC es la unidad de cobro y la llave del
    // aislamiento. Que el cliente pueda reescribirlo desde su portal no sería
    // una función, sería un agujero. Se comprueba por el camino crudo porque no
    // existe —a propósito— una función que lo ofrezca.
    const rfcAntes = await db.query(`select rfc from tenants where id = $1`, [admin.tenantId])

    await db.query('begin')
    try {
      await db.query(
        `select set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated',
             'app_metadata', json_build_object('tenant_id', $2::text, 'rol', 'admin'))::text, true)`,
        [admin.usuarioId, admin.tenantId],
      )
      await db.query('set local role authenticated')
      await expect(
        db.query(`update tenants set rfc = 'HACK010101AAA' where id = $1`, [admin.tenantId]),
      ).rejects.toThrow(/permission denied|permiso/i)
    } finally {
      await db.query('rollback')
    }

    const rfcDespues = await db.query(`select rfc from tenants where id = $1`, [admin.tenantId])
    expect(rfcDespues.rows[0]).toEqual(rfcAntes.rows[0])
  })

  it('una fecha con otra forma no llega a la base', async () => {
    await expect(
      registrarFechaAlta(db, { sesion: admin, fecha: '09/03/2026' }),
    ).rejects.toThrow(FechaDeAltaInvalida)
  })

  it('una fecha futura la rechaza la BASE, no el formulario', async () => {
    // El CHECK de la migración es quien manda: una fecha de alta no puede ser
    // futura ni anterior a la entrada en vigor de la Ley.
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await expect(registrarFechaAlta(db, { sesion: admin, fecha: manana })).rejects.toThrow(
      /fecha_alta_autoridad_plausible/,
    )
  })
})
