import type { ReactNode } from 'react'
import './globals.css'

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
 */
export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F6F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0D1614' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  )
}
