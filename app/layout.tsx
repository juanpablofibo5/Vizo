import type { ReactNode } from 'react'
import './globals.css'
import { barlow, barlowCondensed } from './tipografia'

export const metadata = {
  title: 'VIZO — cumplimiento PLD',
  description: 'Fracción V Bis · desarrollo inmobiliario',
  // El favicon es `app/icon.svg`: Next lo toma por convención y genera el
  // <link> solo. No hace falta declararlo aquí.
}

/**
 * El color de la barra del navegador en móvil.
 *
 * Va en `viewport` y no en `metadata` porque Next lo pide así desde la 14 —lo
 * avisa en el build—, y son los mismos dos `--fondo` del portal: sin esto la
 * barra sale blanca por encima del tema oscuro.
 *
 * OJO: ESTOS DOS VALORES SON UNA COPIA DE `--fondo`, y una copia se desfasa.
 * Ya pasó: se escribieron con la paleta fría (#F4F6F5 / #0D1614) y siguieron
 * ahí cuando el rediseño movió el fondo al mundo cálido, así que la barra del
 * navegador pintaba el color viejo sobre el portal nuevo. Se descubrió leyendo
 * el HTML que sirve el dominio, no en local.
 *
 * No se puede leer del CSS: Next necesita el valor en tiempo de build y el
 * token vive en una hoja de estilos. Por eso lo vigila una prueba —
 * `tests/diseno/semantica-del-color.test.ts`— que compara estos dos contra
 * `--fondo` y falla si divergen otra vez.
 */
export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F1EFEB' },
    { media: '(prefers-color-scheme: dark)', color: '#100F0E' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  )
}
