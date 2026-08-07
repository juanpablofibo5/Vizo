import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'VIZO — cumplimiento PLD',
  description: 'Fracción V Bis · desarrollo inmobiliario',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  )
}
