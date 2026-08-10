import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresca la sesión en cada petición.
 *
 * Sin esto, el token expira y los Server Components ven a un usuario sin
 * sesión — que en un sistema con RLS significa "no ves nada", un modo de falla
 * que se lee como si los datos hubieran desaparecido.
 */
export async function middleware(peticion: NextRequest) {
  let respuesta = NextResponse.next({ request: peticion })

  const supabase = createServerClient(
    requerido('NEXT_PUBLIC_SUPABASE_URL'),
    requerido('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (nuevas) => {
          for (const { name, value } of nuevas) peticion.cookies.set(name, value)
          respuesta = NextResponse.next({ request: peticion })
          for (const { name, value, options } of nuevas) respuesta.cookies.set(name, value, options)
        },
      },
    },
  )

  await supabase.auth.getUser()
  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

/**
 * REGLA DURA 6, en la puerta de entrada del sitio.
 *
 * Esto era `process.env[...] ?? ''`. Con la variable sin configurar, el cliente
 * de Supabase se construía con una llave vacía y reventaba dentro, así que el
 * sitio entero respondía `MIDDLEWARE_INVOCATION_FAILED` — un error que no dice
 * nada y que hay que ir a diagnosticar a mano.
 *
 * Pasó de verdad, al conectar app.vizo.mx: el dominio, el DNS y el enrutamiento
 * estaban bien, y el único problema era una variable de entorno que nadie había
 * cargado. El mensaje de abajo lo habría dicho en el primer intento.
 *
 * Se define aquí y no se importa de `src/supabase/servidor.ts` a propósito: el
 * middleware corre en el runtime Edge y ese módulo arrastra `next/headers`.
 */
function requerido(nombre: string): string {
  const valor = process.env[nombre]
  if (valor === undefined || valor === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. En local se copia de .env.example ` +
        'a .env.local; en Vercel se carga en Project Settings → Environment Variables ' +
        'y hay que REDESPLEGAR, porque las NEXT_PUBLIC_* se hornean en el build.',
    )
  }
  return valor
}
