'use client'

import { useActionState } from 'react'
import { descargarConstancia, type EstadoDescarga } from './acciones'

/**
 * Descargar la Constancia como texto.
 *
 * El archivo se arma en el servidor —la evidencia sale de la base, no del
 * navegador— y se entrega como Markdown. Un PDF se vería mejor y sería peor
 * evidencia: el texto plano se hashea, se versiona, se compara y se abre dentro
 * de veinte años sin depender de una aplicación.
 */

const INICIAL: EstadoDescarga = { texto: null, error: null }

export function BotonDescargar() {
  const [estado, accion, generando] = useActionState<EstadoDescarga, FormData>(
    descargarConstancia,
    INICIAL,
  )

  // El navegador guarda el archivo solo cuando el servidor ya devolvió el
  // texto. Se hace aquí y no en el servidor porque una descarga es del cliente.
  if (estado.texto !== null && typeof window !== 'undefined') {
    const blob = new Blob([estado.texto.contenido], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = estado.texto.nombre
    a.click()
    URL.revokeObjectURL(url)
    estado.texto = null
  }

  return (
    <form action={accion}>
      {estado.error !== null && <div className="error">{estado.error}</div>}
      <button type="submit" disabled={generando} style={{ width: '100%' }}>
        {generando ? 'Generando…' : 'Descargar la constancia'}
      </button>
    </form>
  )
}
