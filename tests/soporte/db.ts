import { Client } from 'pg'

/**
 * Conexión a la base LOCAL de desarrollo.
 *
 * Se usa `pg` directo y no supabase-js a propósito: la cadena de conexión del
 * stack local es determinista (misma en cualquier máquina y en CI), mientras
 * que las llaves de API se generan por proyecto. Un test que falla porque
 * cambió una llave no dice nada sobre el código.
 *
 * Estos tests corren como `postgres`, que salta RLS. El aislamiento entre
 * tenants NO se prueba aquí: se prueba en tests/estructura/smoke.sql, donde se
 * cambia al rol `authenticated` con un JWT simulado. Confundir las dos cosas
 * produce un test de seguridad que pasa siempre.
 */
export const URL_DB_LOCAL =
  process.env['VIZO_DB_URL'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

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
