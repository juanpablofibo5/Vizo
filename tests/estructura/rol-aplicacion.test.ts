import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { conectar } from '../soporte/db'

/**
 * El rol con el que se conecta la aplicación.
 *
 * ARREGLO DE RAÍZ DEL HALLAZGO DE LA SEMANA 5. Aquella auditoría encontró que
 * las escrituras se saltaban RLS porque la app se conectaba como `postgres`.
 * Se corrigió bajando el rol dentro de cada transacción — una protección que
 * hay que ACORDARSE de usar. Esto quita la posibilidad de olvidarla.
 *
 * Estos tests se conectan de verdad como `vizo_app`, no consultan `pg_roles`:
 * que un rol diga que no tiene BYPASSRLS y que de hecho no pueda saltarse las
 * políticas son dos afirmaciones distintas, y solo la segunda importa.
 */
describe('El rol de la aplicación no puede saltarse RLS', () => {
  const URL_APP =
    process.env['VIZO_DB_URL'] ??
    'postgresql://vizo_app:vizo-local-dev@127.0.0.1:54322/postgres'

  const TENANT_A = '00000000-0000-4000-8000-000000000001'
  const TENANT_B = '00000000-0000-4000-8000-000000000002'
  const CAPTURISTA = '00000000-0000-4000-8000-00000000000b'

  let app: Client
  let admin: Client

  beforeAll(async () => {
    admin = await conectar()
    app = new Client({ connectionString: URL_APP })
    await app.connect()
  })

  afterAll(async () => {
    await app.end()
    await admin.end()
  })

  const comoUsuario = async (tenantId: string) => {
    await app.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated',
           'app_metadata', json_build_object('tenant_id',$2::text,'rol','capturista'))::text, true)`,
      [CAPTURISTA, tenantId],
    )
    await app.query('set local role authenticated')
  }

  it('la aplicación NO se conecta como postgres', async () => {
    const { rows } = await app.query('select current_user::text as u')
    expect((rows[0] as { u: string }).u).toBe('vizo_app')
  })

  it('el rol no tiene BYPASSRLS ni superusuario', async () => {
    const { rows } = await admin.query(
      `select rolsuper, rolbypassrls, rolinherit from pg_roles where rolname = 'vizo_app'`,
    )
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolinherit: false })
  })

  describe('si alguien olvida asumir authenticated', () => {
    it('la consulta muere en vez de leer los datos de todos', async () => {
      await app.query('begin')
      try {
        // Esto es exactamente lo que hacía la app antes de la semana 5, y
        // entonces devolvía los clientes de TODOS los obligados.
        await expect(app.query('select id from clientes_finales')).rejects.toThrow(
          /permission denied/,
        )
      } finally {
        await app.query('rollback')
      }
    })

    it('y tampoco puede escribir', async () => {
      await app.query('begin')
      try {
        await expect(
          app.query(
            `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
             values ($1,'moral','ROL999999ZZ9','Colado')`,
            [TENANT_A],
          ),
        ).rejects.toThrow(/permission denied/)
      } finally {
        await app.query('rollback')
      }
    })
  })

  describe('por el camino correcto', () => {
    it('trabaja con normalidad en su propio obligado', async () => {
      await app.query('begin')
      try {
        await comoUsuario(TENANT_A)
        const r = await app.query(
          `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
           values ($1,'moral','ROL111111AA1','Legítimo') returning id`,
          [TENANT_A],
        )
        expect(r.rows).toHaveLength(1)
      } finally {
        await app.query('rollback')
      }
    })

    it('pero RLS lo detiene en el obligado ajeno', async () => {
      await app.query('begin')
      try {
        await comoUsuario(TENANT_A)
        await expect(
          app.query(
            `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
             values ($1,'moral','ROL222222BB2','Intruso')`,
            [TENANT_B],
          ),
        ).rejects.toThrow(/row-level security/)
      } finally {
        await app.query('rollback')
      }
    })
  })

  describe('no puede escalar privilegios', () => {
    it.each([
      ['volverse postgres', 'set role postgres'],
      ['concederse BYPASSRLS', 'alter role vizo_app with bypassrls'],
      ['leer el esquema auth', 'select count(*) from auth.users'],
    ])('%s', async (_etiqueta, sql) => {
      await app.query('begin')
      try {
        await expect(app.query(sql)).rejects.toThrow(/permission denied/)
      } finally {
        await app.query('rollback')
      }
    })
  })
})
