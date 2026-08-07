import { createBrowserClient } from '@supabase/ssr'

/** Cliente de Supabase para el navegador. Solo se usa para el login. */
export function clienteNavegador() {
  return createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? '',
  )
}
