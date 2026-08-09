import { Client } from 'pg'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * Conexión a la base LOCAL de desarrollo.
 *
 * Se usa `pg` directo y no supabase-js a propósito: la cadena de conexión del
 * stack local es determinista (misma en cualquier máquina y en CI), mientras
 * que las llaves de API se generan por proyecto. Un test que falla porque
 * cambió una llave no dice nada sobre el código.
 *
 * La conexión se abre como `postgres`, que salta RLS. Eso está bien para
 * PREPARAR datos, y está mal para probar el comportamiento real de la
 * aplicación.
 *
 * AUDITORÍA DE LA SEMANA 5: ese matiz costó un defecto. El comentario que
 * estaba aquí decía —con razón— que el aislamiento se prueba en
 * `tests/estructura/smoke.sql` y no en estos tests. Lo que nadie notó es que
 * la APLICACIÓN también se conectaba como `postgres`, así que sus escrituras
 * tampoco pasaban por RLS. El razonamiento cubría los tests y se detuvo ahí.
 *
 * Ahora todo lo que escribe pasa por `enTransaccionDeSesion`, que baja el rol
 * a `authenticated` y planta los claims. Estos tests ejercitan ese camino, así
 * que RLS se evalúa de verdad — no reemplazan al smoke test, lo complementan.
 */
/**
 * Conexión ADMINISTRATIVA, distinta de la que usa la aplicación.
 *
 * Desde la migración 018 la app se conecta como `vizo_app`, que no puede
 * saltarse RLS. Los tests sí necesitan un rol elevado para PREPARAR el
 * escenario —crear obligados, usuarios y sucursales—, así que usan otra
 * variable. Que sean dos nombres distintos es a propósito: si fueran el mismo,
 * cambiar uno cambiaría el otro sin que nadie lo notara.
 */
export const URL_DB_LOCAL =
  process.env['VIZO_DB_URL_ADMIN'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function conectar(): Promise<Client> {
  const cliente = new Client({ connectionString: URL_DB_LOCAL })
  await cliente.connect()
  return cliente
}

/** Ejecuta una consulta y devuelve las filas tipadas. */
export async function consultar<T>(
  cliente: Client,
  sql: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const resultado = await cliente.query(sql, parametros)
  return resultado.rows as T[]
}

/** Primera fila, o null. Útil para consultas de un solo valor. */
export async function consultarUna<T>(
  cliente: Client,
  sql: string,
  parametros: unknown[] = [],
): Promise<T | null> {
  const filas = await consultar<T>(cliente, sql, parametros)
  return filas[0] ?? null
}

/**
 * Un obligado con un usuario que puede trabajar en él.
 *
 * Devuelve la sesión de ese usuario, que es lo que ahora piden las funciones
 * de persistencia. El usuario tiene que existir de verdad: `usuarios.id`
 * apunta a `auth.users`, y `bitacora.actor_id` a `usuarios(tenant_id, id)`.
 *
 * La preparación corre como `postgres` a propósito —crear el escenario no es
 * lo que se está probando—; lo que se prueba corre después como el usuario.
 */
export async function crearTenantConUsuario(
  db: Client,
  marca: string,
  rol: 'admin' | 'capturista' = 'capturista',
): Promise<ContextoSesion> {
  const t = await db.query(
    `insert into tenants (rfc, razon_social) values ($1, $2) returning id`,
    [`TST${marca}`, `Obligado de prueba ${marca}`],
  )
  const tenantId = (t.rows[0] as { id: string }).id

  const u = await db.query(
    `insert into auth.users (id, instance_id, aud, role, email)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1)
     returning id`,
    [`prueba-${marca}@ejemplo.mx`],
  )
  const usuarioId = (u.rows[0] as { id: string }).id

  await db.query(
    `insert into usuarios (id, tenant_id, rol, nombre, email)
     values ($1, $2, $3::rol_usuario, 'Usuario de prueba', $4)`,
    [usuarioId, tenantId, rol, `prueba-${marca}@ejemplo.mx`],
  )

  return { usuarioId, tenantId, rol }
}
