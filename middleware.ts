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
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? '',
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
