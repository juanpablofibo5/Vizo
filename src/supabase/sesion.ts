import { redirect } from 'next/navigation'
import { clienteServidor } from './servidor'

export interface Sesion {
  usuarioId: string
  email: string
  tenantId: string
  rol: 'admin' | 'capturista'
  nombre: string
}

/**
 * La sesión del usuario, o redirige a /login.
 *
 * `tenant_id` y `rol` se leen de `app_metadata` del JWT, que solo el servicio
 * de Auth puede escribir. Leerlos de la tabla `usuarios` sería más cómodo pero
 * abriría la puerta a que un usuario se cambiara el rol.
 */
export async function sesionRequerida(): Promise<Sesion> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase.auth.getUser()

  if (error !== null || data.user === null) {
    redirect('/login')
  }

  const meta = data.user.app_metadata as { tenant_id?: string; rol?: string }
  if (meta.tenant_id === undefined || meta.rol === undefined) {
    throw new Error(
      `El usuario ${data.user.id} no tiene tenant_id ni rol en app_metadata. ` +
        'Sin eso, RLS no puede filtrar y no se le puede mostrar nada.',
    )
  }

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('id', data.user.id)
    .single()

  return {
    usuarioId: data.user.id,
    email: data.user.email ?? '',
    tenantId: meta.tenant_id,
    rol: meta.rol === 'admin' ? 'admin' : 'capturista',
    nombre: perfil?.nombre ?? data.user.email ?? '',
  }
}
