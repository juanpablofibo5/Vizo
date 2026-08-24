'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { EstadoDeRiel } from '../../../componentes/riel'

/**
 * El patrón de siete secciones del conocimiento del cliente.
 *
 * El riel de la izquierda es el estado completo; abrir una sección no pierde
 * de vista a las otras seis. Las secciones que aún no existen (Art. 23 Ter 3
 * y 4) aparecen desde hoy a propósito: el patrón se diseña para siete, no
 * para las cinco construidas — un hueco visible es información, uno escondido
 * es una omisión silenciosa.
 *
 * Los cuerpos NO se desmontan al plegarse: van con `hidden`. Dentro hay
 * formularios a medio llenar, y plegar una sección para consultar otra no
 * puede costarle la captura a nadie.
 */

export interface SeccionDeConocimiento extends EstadoDeRiel {
  /** Ancla estable (`#riesgo`, `#pep`…): eran los ids de los h2 anteriores. */
  id: string
  numero: string
  titulo: string
  articulo: string
  contenido: ReactNode
}

export function ConocimientoDelCliente({
  secciones,
  abiertaInicial,
}: {
  secciones: SeccionDeConocimiento[]
  abiertaInicial: string | null
}) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(
    () => new Set(abiertaInicial === null ? [] : [abiertaInicial]),
  )

  // Un enlace profundo (`…/expediente#aprobacion`) debe aterrizar en la
  // sección abierta, no en un encabezado plegado.
  useEffect(() => {
    const ancla = window.location.hash.slice(1)
    if (ancla !== '' && secciones.some((s) => s.id === ancla)) {
      setAbiertas((previas) => new Set(previas).add(ancla))
    }
    // Solo al montar: el hash posterior lo maneja abrirYSaltar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const alternar = (id: string) => {
    setAbiertas((previas) => {
      const nuevas = new Set(previas)
      if (nuevas.has(id)) nuevas.delete(id)
      else nuevas.add(id)
      return nuevas
    })
  }

  const abrirYSaltar = (id: string) => {
    setAbiertas((previas) => new Set(previas).add(id))
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({
      behavior: quieto ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="expediente-rejilla">
      <nav className="riel" aria-label="Estado del conocimiento del cliente">
        <p className="riel-titulo">Estado</p>
        {secciones.map((s) => (
          <button
            key={s.id}
            type="button"
            className="riel-item"
            data-abierta={abiertas.has(s.id) ? 'sí' : 'no'}
            onClick={() => {
              abrirYSaltar(s.id)
            }}
          >
            <span className="riel-num">{s.numero}</span>
            <span className="riel-texto">
              <span className="riel-nombre">{s.titulo}</span>
              <span className={`riel-estado tono-${s.tono}`}>{s.estado}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="secciones">
        {secciones.map((s) => {
          const abierta = abiertas.has(s.id)
          return (
            <section key={s.id} id={s.id} className="seccion" data-tono={s.tono}>
              <button
                type="button"
                className="seccion-cabeza"
                aria-expanded={abierta}
                aria-controls={`cuerpo-${s.id}`}
                onClick={() => {
                  alternar(s.id)
                }}
              >
                <span className="seccion-num">{s.numero}</span>
                <span className="seccion-rotulo">
                  <span className="seccion-titulo">{s.titulo}</span>
                  <span className="seccion-reloj">
                    {s.articulo} · {s.reloj}
                  </span>
                </span>
                <span className={`estado ${s.tono}`}>{s.estado}</span>
                <span className="seccion-flecha" aria-hidden="true">
                  {abierta ? '▲' : '▼'}
                </span>
              </button>
              <div id={`cuerpo-${s.id}`} className="seccion-cuerpo" hidden={!abierta}>
                {s.contenido}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
