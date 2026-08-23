import { Barlow, Barlow_Condensed } from 'next/font/google'

/**
 * Barlow y Barlow Condensed, SERVIDAS DESDE NUESTRO DOMINIO.
 *
 * El handoff de diseño las pedía con un `<link>` a fonts.googleapis.com. Eso
 * no puede entrar: mandaría la IP de cada usuario a un tercero desde pantallas
 * que muestran nombres, RFC y domicilios de personas identificadas, y VIZO es
 * **encargado** bajo la LFPDPPP. No es una transferencia que alguien haya
 * autorizado, y no hay forma de justificarla como necesaria: la fuente es
 * estética.
 *
 * `next/font/google` descarga los archivos EN EL BUILD y los sirve desde el
 * propio dominio. Cero peticiones a Google en tiempo de ejecución. La tipografía
 * del diseño se conserva íntegra; lo único que cambia es de dónde viene.
 *
 * `display: 'swap'` a propósito: el texto se lee con la fuente del sistema
 * mientras Barlow carga. En un portal que se abre contra un plazo, ver el
 * contenido tarde es peor que verlo dos veces.
 */
export const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--fuente-cuerpo',
})

export const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--fuente-titulo',
})
