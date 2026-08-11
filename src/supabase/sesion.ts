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

/**
 * El obligado de la sesión, para el armazón del portal.
 *
 * Se lee con el cliente del usuario, así que RLS aplica: si una sesión
 * apuntara al tenant equivocado esto devolvería vacío en lugar de pintar el
 * nombre de otro obligado en el encabezado.
 */
export async function obligadoDeSesion(): Promise<{ razonSocial: string; rfc: string }> {
  const supabase = await clienteServidor()
  const { data } = await supabase.from('tenants').select('razon_social, rfc').single()
  const t = data as { razon_social: string; rfc: string } | null
  return { razonSocial: t?.razon_social ?? '—', rfc: t?.rfc ?? '' }
}
