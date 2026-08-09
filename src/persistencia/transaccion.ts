import type { EjecutorSql } from '../catalogo/cargador'

/**
 * Transacciones que corren COMO EL USUARIO, no como el dueño de la base.
 *
 * HALLAZGO DE LA AUDITORÍA DE LA SEMANA 5.
 *
 * La app se conecta con `VIZO_DB_URL`, que apunta al rol `postgres`. Ese rol
 * tiene `rolbypassrls = true`: las políticas RLS no se evalúan. Comprobado
 * contra la base local, el mismo INSERT en el tenant ajeno daba:
 *
 *   - como `postgres` (lo que hace la app):        ESCRIBIÓ
 *   - como `authenticated` con el JWT del usuario: new row violates row-level
 *                                                  security policy
 *
 * Es decir: las lecturas de la UI iban por supabase-js y RLS las filtraba,
 * pero las ESCRITURAS se saltaban RLS por completo. Lo único que separaba un
 * obligado de otro al escribir era que la aplicación pasara el `tenant_id`
 * correcto — exactamente el patrón de la regla dura 6: código que confía en su
 * entrada.
 *
 * Peor: `app.bitacora_registrar` valida el tenant así
 *
 *     if app.tenant_id() is not null and p_tenant is distinct from app.tenant_id()
 *
 * y sin JWT `app.tenant_id()` es NULL, así que la validación se saltaba sola.
 * La corrección de la auditoría de la semana 1 estaba viva en el smoke test y
 * muerta en el único camino de escritura que la aplicación usa de verdad.
 *
 * Esto lo cierra: dentro de la transacción se plantan los claims del usuario y
 * se baja el rol a `authenticated`. A partir de ahí la base aplica RLS y la
 * bitácora valida el tenant, igual que en `tests/estructura/smoke.sql`. El
 * código de la aplicación deja de ser la única línea de defensa.
 *
 * `set local role` se revierte solo al terminar la transacción, así que la
 * conexión no queda degradada para lo que venga después.
 */
export interface ContextoSesion {
  usuarioId: string
  tenantId: string
  rol: 'admin' | 'capturista'
}

/**
 * Exige estar YA dentro de una transacción de sesión.
 *
 * Existe porque hay operaciones que tienen que ser atómicas entre sí —una
 * operación y su evaluación no pueden quedar separadas— y por tanto comparten
 * una sola transacción. Las funciones internas de esa transacción no pueden
 * abrir la suya: un `begin` anidado en Postgres es un no-op con warning, y el
 * `commit` interno cerraría la transacción externa a media faena.
 *
 * La alternativa era un comentario que dijera "llamar solo desde dentro de
 * enTransaccionDeSesion". Un comentario no lo impide; esto sí, y falla al
 * primer intento en vez de escribir saltándose RLS.
 */
export async function exigirSesionActiva(
  db: EjecutorSql,
  sesion: ContextoSesion,
): Promise<void> {
  const { rows } = await db.query(
    `select current_user::text as rol, app.tenant_id()::text as tenant`,
  )
  const estado = rows[0] as { rol: string; tenant: string | null }

  if (estado.rol !== 'authenticated') {
    throw new Error(
      `Esta función escribe datos regulados y exige correr como 'authenticated', pero corre ` +
        `como '${estado.rol}', que se salta RLS. Envuélvela en enTransaccionDeSesion.`,
    )
  }
  if (estado.tenant !== sesion.tenantId) {
    throw new Error(
      'El tenant de la sesión de base no coincide con el de la sesión que se pasó. ' +
        'Se estaría escribiendo en el obligado equivocado.',
    )
  }
}

export async function enTransaccionDeSesion<T>(
  db: EjecutorSql,
  sesion: ContextoSesion,
  cuerpo: () => Promise<T>,
): Promise<T> {
  await db.query('begin')
  try {
    // Los claims se arman en la base con json_build_object y parámetros, no
    // concatenando texto: este valor decide qué filas ve la sesión.
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object(
           'sub', $1::text,
           'role', 'authenticated',
           'app_metadata', json_build_object('tenant_id', $2::text, 'rol', $3::text)
         )::text, true)`,
      [sesion.usuarioId, sesion.tenantId, sesion.rol],
    )
    await db.query('set local role authenticated')

    const resultado = await cuerpo()
    await db.query('commit')
    return resultado
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}
