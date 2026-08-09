import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { almacenSobre } from '../../src/supabase/almacen'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * Storage local, hablado como el usuario.
 *
 * Los tests podrían usar la llave de servicio y todo pasaría — saltándose las
 * políticas del bucket, que es justo lo único que vale la pena probar aquí.
 * En vez de eso se firma un JWT de usuario con el secreto del stack local y se
 * habla con Storage como hablaría la aplicación.
 *
 * El secreto de abajo NO es una credencial: es el valor por omisión que
 * `supabase start` usa en cualquier máquina y en CI, igual que la cadena de
 * conexión de `db.ts`. Firmar aquí evita depender de las llaves que el CLI
 * genera por proyecto, que cambian y harían fallar el test por una razón que
 * no dice nada del código.
 */
const URL_API = process.env['SUPABASE_URL_LOCAL'] ?? 'http://127.0.0.1:54321'
const SECRETO_LOCAL = 'super-secret-jwt-token-with-at-least-32-characters-long'

const b64url = (v: Buffer | string): string =>
  Buffer.from(v).toString('base64url')

function firmarJwt(carga: Record<string, unknown>): string {
  const cabecera = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const cuerpo = b64url(
    JSON.stringify({
      iss: 'supabase',
      aud: 'authenticated',
      // Una hora basta y sobra para una corrida de tests.
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...carga,
    }),
  )
  const firma = createHmac('sha256', SECRETO_LOCAL)
    .update(`${cabecera}.${cuerpo}`)
    .digest('base64url')
  return `${cabecera}.${cuerpo}.${firma}`
}

/** JWT del rol `anon`, el que va en la cabecera `apikey`. */
export function llaveAnon(): string {
  return firmarJwt({ role: 'anon' })
}

/** JWT de un usuario concreto, con su tenant y su rol en `app_metadata`. */
export function jwtDeSesion(sesion: ContextoSesion): string {
  return firmarJwt({
    sub: sesion.usuarioId,
    role: 'authenticated',
    app_metadata: { tenant_id: sesion.tenantId, rol: sesion.rol },
  })
}

/**
 * Un almacén que habla con Storage como el usuario de esa sesión.
 *
 * `apikey` lleva la llave anónima y `Authorization` el JWT del usuario: es
 * exactamente lo que manda el navegador, así que las políticas del bucket se
 * evalúan igual que en producción.
 */
export function almacenComo(sesion: ContextoSesion): AlmacenDocumentos {
  const cliente = createClient(URL_API, llaveAnon(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwtDeSesion(sesion)}` } },
  })
  return almacenSobre(cliente)
}
