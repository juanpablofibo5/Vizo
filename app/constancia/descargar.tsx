'use client'

import { useActionState, useEffect, useRef } from 'react'
import { emitirYDescargar, type EstadoEmision } from './acciones'

/**
 * Emitir la Constancia y bajar los dos documentos.
 *
 * Bajan JUNTOS porque el índice del Manual referencia a la Constancia por su
 * huella: entregar el Manual solo dejaría siete apartados apuntando a un
 * documento que el lector no tiene.
 *
 * La descarga se dispara en un efecto y una sola vez por resultado. La primera
 * versión la hacía durante el render y mutaba el estado para no repetirse — que
 * funciona hasta que React vuelve a renderizar por cualquier otra razón y el
 * navegador baja los archivos otra vez.
 */

const INICIAL: EstadoEmision = { archivos: null, mensaje: null, error: null }

export function BotonEmitir({ puede }: { puede: boolean }) {
  const [estado, accion, emitiendo] = useActionState<EstadoEmision, FormData>(
    emitirYDescargar,
    INICIAL,
  )
  const yaBajado = useRef<string | null>(null)

  useEffect(() => {
    if (estado.archivos === null) return
    // Una misma emisión no se baja dos veces: la clave es el nombre del primer
    // archivo, que lleva RFC y fecha.
    const clave = estado.archivos[0]?.nombre ?? ''
    if (yaBajado.current === clave) return
    yaBajado.current = clave

    for (const a of estado.archivos) {
      const url = URL.createObjectURL(
        new Blob([a.contenido], { type: 'text/markdown;charset=utf-8' }),
      )
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = a.nombre
      enlace.click()
      URL.revokeObjectURL(url)
    }
  }, [estado.archivos])

  return (
    <form action={accion} style={{ display: 'grid', gap: '.5rem' }}>
      {estado.error !== null && <div className="error">{estado.error}</div>}
      {estado.mensaje !== null && <div className="exito">{estado.mensaje}</div>}

      <button type="submit" disabled={!puede || emitiendo}>
        {emitiendo ? 'Emitiendo…' : 'Emitir y descargar'}
      </button>

      <span className="pequeno tenue">
        {puede
          ? 'Dos archivos: la Constancia y el índice de su Manual, que la referencia por su huella.'
          : 'Solo un administrador emite la constancia.'}
      </span>
    </form>
  )
}
