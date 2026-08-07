import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase para el servidor.
 *
 * Usa la llave PUBLICABLE, no la de servicio: la sesión del usuario viaja en
 * la cookie y RLS filtra por su `tenant_id`. La llave de servicio salta RLS,
 * así que en código de aplicación es un incidente de seguridad, no un atajo.
 */
export async function clienteServidor() {
  const almacen = await cookies()

  return createServerClient(
    requerido('NEXT_PUBLIC_SUPABASE_URL'),
    requerido('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (nuevas) => {
          try {
            for (const { name, value, options } of nuevas) almacen.set(name, value, options)
          } catch {
            // Un Server Component no puede escribir cookies. El middleware
            // refresca la sesión, así que aquí se ignora sin perder nada.
          }
        },
      },
    },
  )
}

/**
 * Regla dura 6: una variable de entorno faltante no puede degradar a
 * `undefined` y fallar más adelante con un error incomprensible.
 */
function requerido(nombre: string): string {
  const valor = process.env[nombre]
  if (valor === undefined || valor === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Cópiala de .env.example a .env.local.`,
    )
  }
  return valor
}
