'use client'

import { useEffect, useState } from 'react'
import { Navegacion } from './navegacion'
import { Salir } from './salir'
import { Marca } from './marca'

/**
 * El panel lateral: todo lo que el portal sabe hacer, siempre a la vista.
 *
 * Tres cosas viven aquí de forma permanente, y las tres por la misma razón: en
 * un sistema donde una acción equivocada se registra para siempre, quien la
 * ejecuta tiene que saber en todo momento **de quién** es la cuenta en la que
 * está y **con qué rol** entró.
 *
 *   · el obligado (razón social y RFC) — un despacho que opera varios no puede
 *     confundirse de cuál está viendo;
 *   · quién es el usuario, con su rol;
 *   · por dónde salir.
 *
 * El rol se pinta pero NO decide nada. Los permisos los aplica RLS en la base,
 * y esconder un botón nunca fue una medida de seguridad — es una cortesía para
 * no ofrecer lo que la base va a rechazar.
 *
 * Es cliente por una sola razón: en pantalla angosta el panel se pliega y hace
 * falta estado para abrirlo. En escritorio el estado no se usa — el panel está
 * fijo y nada depende de JavaScript para navegar.
 */
export function PanelLateral({
  obligado,
  perfil,
  alertasAbiertas,
}: {
  obligado: { razonSocial: string; rfc: string }
  perfil: { nombre: string; rol: 'admin' | 'capturista'; email: string }
  alertasAbiertas?: number | undefined
}) {
  const [abierto, setAbierto] = useState(false)

  // Escape cierra. Es la salida que espera cualquiera que abrió algo que tapa
  // la pantalla, y sin ella el panel se siente una trampa en móvil.
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto])

  return (
    <>
      {/* Solo se ve en pantalla angosta; en escritorio el panel ya está fijo. */}
      <header className="barra-movil">
        <span className="logo"><Marca tamano={20} />VIZO</span>
        <button
          type="button"
          className="alternar"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="panel-lateral"
        >
          <svg
            viewBox="0 0 18 18"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {abierto ? (
              <>
                <path d="M4.2 4.2l9.6 9.6" />
                <path d="M13.8 4.2l-9.6 9.6" />
              </>
            ) : (
              <>
                <path d="M2.8 5h12.4" />
                <path d="M2.8 9h12.4" />
                <path d="M2.8 13h12.4" />
              </>
            )}
          </svg>
          <span className="sr-solo">{abierto ? 'Cerrar el menú' : 'Abrir el menú'}</span>
        </button>
      </header>

      {/* El velo cierra al tocar fuera. Va antes del panel para quedar debajo. */}
      {abierto && (
        <div className="velo" onClick={() => setAbierto(false)} aria-hidden="true" />
      )}

      <aside className="lateral" id="panel-lateral" data-abierto={abierto ? 'sí' : 'no'}>
        <div className="marca">
          <span className="logo"><Marca tamano={20} />VIZO</span>
          <span className="obligado" title={obligado.razonSocial}>
            {obligado.razonSocial}
          </span>
          <span className="rfc">{obligado.rfc}</span>
        </div>

        <Navegacion
          alertasAbiertas={alertasAbiertas}
          alCambiarDeArea={() => setAbierto(false)}
        />

        <div className="usuario">
          <div className="quien">
            <span className="nombre">{perfil.nombre}</span>
            <span className="chip">{perfil.rol}</span>
          </div>
          <span className="correo" title={perfil.email}>
            {perfil.email}
          </span>
          <Salir />
        </div>
      </aside>
    </>
  )
}
