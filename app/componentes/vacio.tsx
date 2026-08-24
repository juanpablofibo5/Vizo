import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'

/**
 * Un estado vacío: qué falta, por qué importa y qué hacer.
 *
 * Los estados vacíos son uno de los cuatro territorios donde entra el naranja
 * de marca —con la barra lateral, el acceso y el onboarding— porque son las
 * únicas pantallas del producto donde no hay ningún estado regulatorio que
 * comunicar. Cuando no hay nada que decir del cumplimiento, se puede hablar
 * del producto.
 *
 * Las tres partes son obligatorias a propósito. Un vacío que solo dice
 * «todavía no hay clientes» describe la pantalla; el que dice qué se integra
 * y ofrece el primer paso mueve a alguien. La lista de clientes de un obligado
 * recién dado de alta ES su primera pantalla, y estaba en una celda gris.
 */
export function Vacio({
  titulo,
  children,
  accion,
}: {
  titulo: string
  children: ReactNode
  /* `Route` y no `string`: con `typedRoutes` activado, una ruta inventada
     deja de compilar. Un estado vacío cuyo único botón lleva a un 404 sería
     peor que no ofrecer botón. */
  accion?: { texto: string; href: Route } | undefined
}) {
  return (
    <div className="vacio">
      <MarcaVacio />
      <h2 className="vacio-titulo">{titulo}</h2>
      <div className="vacio-cuerpo">{children}</div>
      {accion !== undefined && (
        <Link href={accion.href} className="boton">
          {accion.texto}
        </Link>
      )}
    </div>
  )
}

/**
 * El contenedor de la marca, vacío.
 *
 * Es el mismo cuadro redondeado del logo sin la V dentro: el sitio donde va a
 * ir algo, todavía sin nada. No es decoración por defecto — dice lo mismo que
 * la pantalla.
 */
function MarcaVacio() {
  return (
    <svg
      className="vacio-marca"
      viewBox="0 0 64 64"
      width="40"
      height="40"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="5"
        width="54"
        height="54"
        rx="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="6 5"
        opacity="0.55"
      />
    </svg>
  )
}
