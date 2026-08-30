import type { Icono } from './areas'

/**
 * Los iconos de la navegación.
 *
 * SVG en línea y no una librería: son ocho dibujos de veinte bytes cada uno, y
 * una dependencia de iconos traería miles junto con su versión, su bundle y su
 * política de licencia. Todos heredan `currentColor`, así que el estado activo
 * y el modo oscuro los pintan sin una sola regla extra.
 *
 * No llevan significado propio: acompañan a la palabra, no la sustituyen. Un
 * portal de cumplimiento no se navega por pictogramas — el rótulo siempre está.
 * Por eso van `aria-hidden`: para un lector de pantalla el enlace ya se llama
 * como se llama, y anunciar el dibujo sería repetir.
 */
const TRAZOS: Record<Icono, React.ReactNode> = {
  // Un tablero: cuadrantes de un vistazo.
  inicio: (
    <>
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.2" />
      <rect x="10" y="10" width="5.5" height="5.5" rx="1.2" />
    </>
  ),
  // Dos personas: el cliente y su beneficiario controlador.
  clientes: (
    <>
      <circle cx="7" cy="6" r="2.75" />
      <path d="M2.4 15.2a4.85 4.85 0 0 1 9.2 0" />
      <path d="M12.4 3.6a2.75 2.75 0 0 1 0 5.1" />
      <path d="M13.2 10.9a4.6 4.6 0 0 1 3.4 4.3" />
    </>
  ),
  // Flechas de intercambio: entra y sale.
  operaciones: (
    <>
      <path d="M3 6.5h11l-2.6-2.8" />
      <path d="M15 11.5H4l2.6 2.8" />
    </>
  ),
  // El triángulo de advertencia.
  alertas: (
    <>
      <path d="M9 2.9 16.3 15.3H1.7L9 2.9Z" />
      <path d="M9 7.4v3.4" />
      <path d="M9 13.05v.05" />
    </>
  ),
  // Documento con líneas: el archivo que se presenta.
  avisos: (
    <>
      <path d="M4 2.5h6.2L14.5 6.9V15.5H4V2.5Z" />
      <path d="M10 2.6v4.4h4.4" />
      <path d="M6.4 10.2h5.2" />
      <path d="M6.4 12.7h3.4" />
    </>
  ),
  // El edificio del obligado: el riesgo propio, no el de sus clientes.
  entidad: (
    <>
      <path d="M4 15.5V4.2L9 2.4l5 1.8v11.3" />
      <path d="M2.5 15.5h13" />
      <path d="M6.8 6.6h.05" />
      <path d="M11.2 6.6h.05" />
      <path d="M6.8 9.4h.05" />
      <path d="M11.2 9.4h.05" />
      <path d="M9 15.5v-3h.05" />
    </>
  ),
  // Documento con sello: el MER se emite y se congela.
  mer: (
    <>
      <path d="M4 2.5h6.2L14.5 6.9v3.1" />
      <path d="M10 2.6v4.4h4.4" />
      <path d="M4 2.5v13h4.6" />
      <circle cx="12.6" cy="13" r="2.7" />
      <path d="M11.5 13l.8.9 1.4-1.7" />
    </>
  ),
  // Escudo con marca: la prueba verificable.
  evidencia: (
    <>
      <path d="M9 2.2 15 4.4v4.7c0 3.5-2.4 6-6 7-3.6-1-6-3.5-6-7V4.4L9 2.2Z" />
      <path d="M6.5 9.1 8.3 11l3.3-3.6" />
    </>
  ),
  // Calendario con el día marcado: el 17.
  calendario: (
    <>
      <rect x="2.6" y="3.8" width="12.8" height="11.6" rx="1.6" />
      <path d="M2.6 7.4h12.8" />
      <path d="M6.2 2.4v2.6" />
      <path d="M11.8 2.4v2.6" />
      <path d="M11.5 11.2v.05" />
    </>
  ),
  // Deslizadores: lo que se ajusta una vez y se deja.
  configuracion: (
    <>
      <path d="M2.8 5.6h4.1" />
      <path d="M10.5 5.6h4.7" />
      <path d="M2.8 12.4h4.7" />
      <path d="M11.1 12.4h4.1" />
      <circle cx="8.7" cy="5.6" r="1.8" />
      <circle cx="9.3" cy="12.4" r="1.8" />
    </>
  ),
}

export function IconoArea({ nombre }: { nombre: Icono }) {
  return (
    <svg
      className="icono"
      viewBox="0 0 18 18"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[nombre]}
    </svg>
  )
}

/**
 * El chevron de «esto lleva a algún lado».
 *
 * Va aquí y no suelto en la pantalla porque lo usan las filas de atención y
 * las de alertas, y dos flechas dibujadas por separado divergen. Es geometría
 * de 24 y trazo 1.8, más grueso que los iconos de navegación: vive dentro de
 * un círculo de 1.8rem y a ese tamaño el 1.5 se deshace.
 */
export function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  )
}

/** El ojo de mostrar/ocultar contraseña. Tachado cuando la clave está visible. */
export function Ojo({ tachado }: { tachado: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {tachado && <path d="M4 20 20 4" />}
    </svg>
  )
}
