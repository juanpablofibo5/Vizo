'use client'

import { useActionState, useEffect, useRef } from 'react'
import { emitirYDescargarMer, type EstadoEmisionMer } from './acciones'

/**
 * Emitir el MER y bajar el documento.
 *
 * La descarga se dispara en un efecto y una sola vez por resultado — el mismo
 * arreglo que la Constancia: dispararla durante el render vuelve a bajar el
 * archivo cada vez que React repinta por cualquier otra razón.
 */

const INICIAL: EstadoEmisionMer = { archivo: null, mensaje: null, error: null }

export function BotonEmitirMer({ puede }: { puede: boolean }) {
  const [estado, accion, emitiendo] = useActionState<EstadoEmisionMer, FormData>(
    emitirYDescargarMer,
    INICIAL,
  )
  const yaBajado = useRef<string | null>(null)

  useEffect(() => {
    if (estado.archivo === null) return
    if (yaBajado.current === estado.archivo.nombre) return
    yaBajado.current = estado.archivo.nombre

    const url = URL.createObjectURL(
      new Blob([estado.archivo.contenido], { type: 'text/markdown;charset=utf-8' }),
    )
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = estado.archivo.nombre
    enlace.click()
    URL.revokeObjectURL(url)
  }, [estado.archivo])

  return (
    <form action={accion} style={{ display: 'grid', gap: '.5rem' }}>
      {estado.error !== null && <div className="error">{estado.error}</div>}
      {estado.mensaje !== null && <div className="exito">{estado.mensaje}</div>}

      <button type="submit" disabled={!puede || emitiendo}>
        {emitiendo ? 'Emitiendo…' : 'Emitir y descargar'}
      </button>

      <span className="pequeno tenue">
        {puede
          ? 'El texto se congela con su huella SHA-256 y queda en bitácora con tu nombre y la hora.'
          : 'Solo un administrador emite el MER.'}
      </span>
    </form>
  )
}
