/**
 * La marca: «el visor sobre el umbral».
 *
 * El trazado es el de `~/Desktop/vizo-logos/01-visor-final/svg/vizo-marca.svg`:
 * disco con la V y el umbral CALADOS en espacio negativo, no dibujados encima.
 * La V lleva proporción de letra (24 u de alto por 22 de ancho) y el umbral va
 * acortado a 17 u — se descartó el chevron ancho del primer trazado porque
 * disco + punta + barra se leía como el ícono de «descargar».
 *
 * Va EN LÍNEA y no como archivo en `public/` porque el dibujo es idéntico en
 * los dos temas: lo único que cambia entre `vizo-marca.svg` (#E8590C) y
 * `vizo-marca-oscuro.svg` (#FF7A1A) es el `fill`. Con `currentColor` el color
 * entra desde `--marca`, que ya está definido por tema, y no hay dos archivos
 * que se desincronicen ni una petición extra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA CLASE SE LLAMA `marca-disco` Y NO `marca`, Y NO ES UN CAPRICHO
 * ────────────────────────────────────────────────────────────────────────────
 * `.marca` YA EXISTÍA: es el bloque de identidad de la barra lateral, con
 * `padding: 1.15rem 1.25rem 1rem`. Al reutilizar ese nombre, el padding cayó
 * sobre el SVG y —con `box-sizing: border-box`— dejó 4 px de contenido dentro
 * de una caja de 44. El disco salía como un punto.
 *
 * Costó media hora de diagnóstico porque la pista apuntaba a otro lado: la
 * matriz del SVG daba escala 0.0625, que es exactamente 4/64, y eso parecía un
 * problema de `viewBox` o de la máscara. No lo era. La caja medía 44×44 por
 * fuera y 4 px por dentro.
 *
 * OJO: la variante de 16 px NO es esta reducida. Va sin umbral, porque la
 * separación óptica no sobrevive al rasterizado. Vive en el favicon.
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
          d="M21 14.4 L32 38.4 L43 14.4"
          fill="none"
          stroke="#000"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M23.5 49.8 H40.5" fill="none" stroke="#000" strokeWidth="5.6" strokeLinecap="round" />
      </mask>
      <circle cx="32" cy="32" r="28" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

/**
 * La marca con el nombre al lado, para el acceso.
 *
 * El nombre va en tinta, no en naranja: #E8590C rinde 3.58:1 sobre blanco y no
 * alcanza el 4.5:1 que pide un texto. El naranja es el disco; la palabra es
 * texto y se lee como texto.
 */
export function MarcaConNombre({ tamano = 40 }: { tamano?: number }) {
  return (
    <span className="marca-lockup">
      <Marca tamano={tamano} titulo="VIZO" />
      <span className="marca-nombre">VIZO</span>
    </span>
  )
}
