import { Client } from 'pg'
import { sesionRequerida } from './sesion'
import type { ContextoSesion } from '../persistencia/transaccion'

/**
 * Conexión SQL con la sesión del usuario ya resuelta.
 *
 * Existe para que ninguna pantalla ni Server Action vuelva a repetir el par
 * "abrir cliente de pg / armar el ContextoSesion". Cuando eso se copia y pega,
 * tarde o temprano una copia se queda sin la parte que baja el rol — que es
 * exactamente el defecto que encontró la auditoría de la semana 5.
 */
export function cadenaDeConexion(): string {
  const url = process.env['VIZO_DB_URL']
  if (url === undefined || url === '') {
    throw new Error('Falta VIZO_DB_URL. Cópiala de .env.example a .env.local.')
  }
  return url
}

export interface Contexto {
  db: Client
  sesion: ContextoSesion
  /** Para pintar el encabezado; no se usa para decidir permisos. */
  perfil: { nombre: string; rol: 'admin' | 'capturista'; email: string }
  /**
   * El obligado de la sesión, para el armazón del portal.
   *
   * Se lee BAJO RLS como todo lo demás: si algún día una sesión apuntara al
   * tenant equivocado, esta consulta devolvería vacío en lugar de pintar el
   * nombre de otro obligado en el encabezado.
   */
  obligado: { razonSocial: string; rfc: string }
}

export async function conBase<T>(cuerpo: (c: Contexto) => Promise<T>): Promise<T> {
  const s = await sesionRequerida()
  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const sesion = { usuarioId: s.usuarioId, tenantId: s.tenantId, rol: s.rol }
    const obligado = await leerComoUsuario(db, sesion, async () => {
      const r = await db.query(`select razon_social, rfc from tenants where id = $1`, [
        s.tenantId,
      ])
      const t = r.rows[0] as { razon_social: string; rfc: string } | undefined
      return { razonSocial: t?.razon_social ?? '—', rfc: t?.rfc ?? '' }
    })

    return await cuerpo({
      db,
      sesion,
      perfil: { nombre: s.nombre, rol: s.rol, email: s.email },
      obligado,
    })
  } finally {
    await db.end()
  }
}

/**
 * Lecturas con RLS puesta.
 *
 * Abre una transacción solo para plantar los claims y bajar el rol, y la
 * revierte al terminar: no escribe nada, pero necesita la sesión de base para
 * que las políticas filtren. Sin esto, una pantalla leería como `postgres` y
 * vería los datos de todos los obligados.
 */
export async function leerComoUsuario<T>(
  db: Client,
  sesion: ContextoSesion,
  cuerpo: () => Promise<T>,
): Promise<T> {
  await db.query('begin')
  try {
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
    return await cuerpo()
  } finally {
    // Siempre rollback: aquí no se escribe. Si alguna consulta de lectura
    // dejara algo, esto lo deshace en vez de confirmarlo por descuido.
    await db.query('rollback')
  }
}
