'use client'

import { useState, type ReactNode } from 'react'
import { calculoDeLaAlerta, nombreDeTipo, tonoDeAlerta } from '../componentes/alertas'

/**
 * Una alerta abierta, con su «Por qué» plegado.
 *
 * El desglose va cerrado por omisión y no porque estorbe: la pantalla se abre
 * para saber QUÉ hay que mirar, y el cálculo se consulta el día que alguien
 * pregunta —normalmente la autoridad—. Pero está a un clic y sale entero, con
 * los mismos datos que quedaron registrados.
 *
 * El pie con el nombre del aportante se pasa como `children` desde el servidor:
 * el nombre no vive en la alerta (regla dura 3, nada personal en `detalle`), se
 * llega a él por la operación y bajo RLS.
 */
export function TarjetaDeAlerta({
  tipo,
  titulo,
  detalle,
  pie,
  desglose,
}: {
  tipo: string
  titulo: string
  detalle: Record<string, unknown>
  pie: ReactNode
  /** El desglose del motor, cuando la alerta cuelga de una evaluación. */
  desglose: ReactNode
}) {
  const [abierta, setAbierta] = useState(false)
  const por = typeof detalle['por'] === 'string' ? detalle['por'] : null
  const tono = tonoDeAlerta(tipo, por)
  const motivo = typeof detalle['motivo'] === 'string' ? detalle['motivo'] : ''
  const calculo = calculoDeLaAlerta(detalle)
  const hayQueExplicar = calculo.length > 0 || desglose !== null

  return (
    <article className="alerta elevable" data-tono={tono}>
      <div className="alerta-cabeza">
        <strong>{titulo}</strong>
        <span className="chip">{nombreDeTipo(tipo)}</span>
      </div>

      {motivo !== '' && <p className="alerta-motivo">{motivo}</p>}
      {pie}

      {hayQueExplicar && (
        <>
          <button
            type="button"
            className="por-que"
            aria-expanded={abierta}
            onClick={() => {
              setAbierta((a) => !a)
            }}
          >
            {abierta ? 'Ocultar por qué' : 'Por qué'}
          </button>

          {abierta && (
            <div className="alerta-calculo">
              {calculo.length > 0 && (
                <div className="calculo-caja">
                  <p className="calculo-titulo">Con qué se calculó</p>
                  <dl className="calculo-pares">
                    {calculo.map((c) => (
                      <div key={c.clave} className="calculo-par">
                        <dt>{c.etiqueta}</dt>
                        <dd>{c.valor}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {desglose}
            </div>
          )}
        </>
      )}
    </article>
  )
}
