import type { ReactNode } from 'react'
import { PanelLateral } from './panel'

/**
 * El armazón del portal.
 *
 * Queda deliberadamente delgado: el panel lateral —donde vive el mapa del
 * producto, la identidad del obligado y la del usuario— es `PanelLateral`, y
 * este componente solo lo pone junto al contenido. Así la mitad del portal que
 * necesita estado del navegador está aislada, y todas las pantallas siguen
 * renderizándose en el servidor.
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
      <PanelLateral obligado={obligado} perfil={perfil} alertasAbiertas={alertasAbiertas} />

      <div className="contenido">
        <main>{children}</main>
      </div>
    </div>
  )
}
