import type { ReactNode } from 'react'
import { Navegacion } from './navegacion'

/**
 * El armazón del portal.
 *
 * Tres cosas están siempre a la vista, y las tres por la misma razón: en un
 * sistema donde una acción equivocada se registra para siempre, quien la
 * ejecuta tiene que saber en todo momento **de quién** es la cuenta en la que
 * está y **con qué rol** entró.
 *
 *   · el obligado (razón social y RFC) — un despacho que opera varios no puede
 *     confundirse de cuál está viendo;
 *   · quién es el usuario;
 *   · su rol.
 *
 * El rol se pinta pero NO decide nada. Los permisos los aplica RLS en la base,
 * y esconder un botón nunca fue una medida de seguridad — es una cortesía para
 * no ofrecer lo que la base va a rechazar.
 */
export function Marco({
  obligado,
  perfil,
  alertasAbiertas,
  children,
}: {
  obligado: { razonSocial: string; rfc: string }
  perfil: { nombre: string; rol: 'admin' | 'capturista'; email: string }
  alertasAbiertas?: number | undefined
  children: ReactNode
}) {
  return (
    <div className="portal">
      <aside className="lateral">
        <div className="marca">
          <span className="logo">VIZO</span>
          <span className="obligado">{obligado.razonSocial}</span>
          <span className="rfc">{obligado.rfc}</span>
        </div>

        <Navegacion alertasAbiertas={alertasAbiertas} />

        <div className="usuario">
          <span className="nombre">
            {perfil.nombre}
            <span className="chip">{perfil.rol}</span>
          </span>
          <span className="correo">{perfil.email}</span>
        </div>
      </aside>

      <div className="contenido">
        <main>{children}</main>
      </div>
    </div>
  )
}
