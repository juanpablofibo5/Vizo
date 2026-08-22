/**
 * La marca: «el contenedor» — la V calada en un cuadrado de radio del portal.
 *
 * Trazado de `~/Desktop/vizo-logos/svg/04-contenedor-marca-claro.svg`:
 * cuadrado de 56 u con `rx 15` dentro de un lienzo de 64, y la V con proporción
 * de letra (M20 20 L32 44 L44 20), trazo de 8 u con extremos y vértice
 * redondeados. El radio es proporcional, así que a 28 px da ~7.5 px: el mismo
 * `--radio` del portal.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA V VA CALADA, NO PINTADA
 * ────────────────────────────────────────────────────────────────────────────
 * Los archivos del diseñador trazan la V en el color del fondo: #F4F6F5 en el
 * tema claro, #0D1614 en el oscuro. Eso se ve idéntico sobre el fondo del
 * portal y se rompe en cuanto la marca se para sobre otra superficie — dentro
 * de una tarjeta, que es #FFFFFF, la V quedaría gris.
 *
 * Calada en espacio negativo, la V toma lo que haya detrás: sobre el fondo se
 * ve exactamente como en la hoja aprobada, y sobre una tarjeta se ve blanca sin
 * que nadie elija un color. Un solo trazado sirve para los tres usos —claro,
 * oscuro y sello monocromo—, y el color del contenedor entra por `--marca`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OJO CON EL NOMBRE DE LA CLASE
 * ────────────────────────────────────────────────────────────────────────────
 * Se llama `marca-disco` por historia y NO puede llamarse `marca`: esa clase ya
 * existe, es el bloque de identidad de la barra lateral y tiene padding. Con
 * `box-sizing: border-box` dejaba 4 px de contenido dentro de una caja de 44, y
 * la marca salía como un punto. Costó media hora porque la matriz del SVG daba
 * escala 0.0625 —que es 4/64— y eso apuntaba al `viewBox` o a la máscara,
 * cuando el problema era el padding heredado.
 */

export function Marca({
  tamano = 28,
  titulo,
}: {
  tamano?: number
  /** Si se omite, es decorativa y se oculta a lectores de pantalla. */
  titulo?: string
}) {
  const id = `marca-cala-${String(tamano)}`
  return (
    <svg
      viewBox="0 0 64 64"
      width={tamano}
      height={tamano}
      className="marca-disco"
      role={titulo === undefined ? 'presentation' : 'img'}
      aria-hidden={titulo === undefined ? true : undefined}
      aria-label={titulo}
    >
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <path
          d="M20 20 L32 44 L44 20"
          fill="none"
          stroke="#000"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <rect x="4" y="4" width="56" height="56" rx="15" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

/**
 * La marca con el nombre al lado, para el acceso.
 *
 * El nombre va en tinta, no en naranja: #E8590C rinde 3.58:1 sobre blanco y no
 * alcanza el 4.5:1 que pide un texto. El contenedor hace el trabajo; la letra
 * no compite — por eso es una grotesca neutra con el tracking .16em del portal.
 */
export function MarcaConNombre({ tamano = 40 }: { tamano?: number }) {
  return (
    <span className="marca-lockup">
      <Marca tamano={tamano} titulo="VIZO" />
      <span className="marca-nombre">VIZO</span>
    </span>
  )
}
