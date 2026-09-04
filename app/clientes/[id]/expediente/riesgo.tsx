'use client'

import { useActionState } from 'react'
import { evaluarRiesgo, type EstadoRevision } from './acciones'
import type { RiesgoDelCliente } from '../../../../src/persistencia/riesgo'

/**
 * El Grado de Riesgo del cliente (Cap. III Bis).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUIÉN DECIDE QUÉ, OTRA VEZ
 * ────────────────────────────────────────────────────────────────────────────
 * Las casillas de abajo son los factores que el OBLIGADO configuró en su
 * metodología. Quien evalúa marca cuáles aplican a este cliente — eso es
 * conocimiento del caso, no criterio normativo. El motor suma los pesos que ya
 * estaban configurados y busca en la escala del obligado qué grado le toca.
 *
 * VIZO no marca ninguna casilla por omisión, no sugiere cuáles aplican, y no
 * mueve el grado que el cálculo produjo. Si nadie configuró un modelo, esta
 * pantalla dice qué falta y no ofrece evaluar: un grado sin metodología sería
 * un número que nadie decidió (ADR-21).
 */

const INICIAL: EstadoRevision = { ok: null, mensaje: '' }

function Ficha({
  e,
  titulo,
}: {
  e: RiesgoDelCliente['vigente'] & object
  titulo?: string
}) {
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <p style={{ margin: 0 }}>
        {titulo !== undefined && <span className="pequeno tenue">{titulo} · </span>}
        <span className={e.esAlto ? 'chip alerta' : 'chip'}>{e.gradoNombre}</span>{' '}
        <span className="pequeno tenue" style={{ fontVariantNumeric: 'tabular-nums' }}>
          puntaje {e.puntaje} · metodología v{e.modeloVersion} · evaluado el{' '}
          {e.evaluadoEn.slice(0, 10)}
        </span>
      </p>

      {/* Sin esto la ficha se contradice: grado alto con un puntaje que la
          escala del obligado clasificaría bajo, y nada que lo explique. El
          grado no salió del cálculo — salió del artículo. */}
      {e.pisoPepExtranjera && (
        <p className="pequeno" style={{ margin: 0, maxWidth: '44rem' }}>
          <strong>El grado no lo produjo el puntaje: lo impone el Art. 23 Bis 4.</strong>{' '}
          <span className="tenue">
            El artículo manda considerar de Grado de Riesgo alto —«al menos»— a las Personas
            Políticamente Expuestas extranjeras. El puntaje de {e.puntaje} es el que la
            metodología del obligado calculó, y se conserva tal cual: lo que subió es el grado.
          </span>
        </p>
      )}

      <p className="pequeno" style={{ margin: 0 }}>
        {e.vencida ? (
          <span className="error">
            La reevaluación venció el {e.vence}. El Art. 23 Bis 1 pide al menos cada seis meses.
          </span>
        ) : (
          <span className="tenue">Se reevalúa a más tardar el {e.vence}.</span>
        )}
      </p>

      {e.aplicados.length === 0 ? (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Ningún factor aplicó a este cliente.
        </p>
      ) : (
        <ul className="pequeno" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {e.aplicados.map((a) => (
            <li key={a.factor}>
              {a.factor} <span className="tenue">· {a.elemento} ·</span>{' '}
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>+{a.peso}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SeccionRiesgoCliente({
  clienteId,
  riesgo,
  puede,
}: {
  clienteId: string
  riesgo: RiesgoDelCliente
  puede: boolean
}) {
  const [estado, accion, evaluando] = useActionState<EstadoRevision, FormData>(
    evaluarRiesgo,
    INICIAL,
  )

  // El hueco del ADR-21, en la pantalla donde más tienta rellenarlo.
  if (!riesgo.puedeClasificar) {
    return (
      <div className="tarjeta" style={{ display: 'grid', gap: '.7rem' }}>
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Este cliente no tiene Grado de Riesgo, y no se le puede asignar uno.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            No es que sea de riesgo bajo: es que el obligado todavía no ha configurado su
            metodología, y un grado sin metodología sería un número que nadie decidió.
          </p>
          <ul className="pequeno" style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
            {riesgo.faltaParaClasificar.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Se configura en <strong>Configuración → Modelo de riesgo</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.2rem' }}>
      {riesgo.vigente === null ? (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Todavía no se ha evaluado a este cliente. Marca abajo qué factores de la metodología le
          aplican.
        </p>
      ) : (
        <Ficha e={riesgo.vigente} />
      )}

      {estado.ok !== null && (
        <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
      )}

      {puede && (
        <form action={accion} style={{ display: 'grid', gap: '.7rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />

          <div>
            <h4 style={{ margin: '0 0 .2rem' }}>
              {riesgo.vigente === null ? 'Evaluar' : 'Reevaluar'}
            </h4>
            <p className="pequeno tenue" style={{ margin: 0 }}>
              Los factores y sus pesos son los que el obligado configuró. Aquí solo se marca cuáles
              aplican a este cliente; el grado lo calcula el motor con la escala vigente.
            </p>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.4rem' }}>
            {riesgo.factores.map((f) => (
              <li key={f.id}>
                <label className="casilla parrafo">
                  {/* Ninguna casilla viene marcada: VIZO no supone qué aplica. */}
                  <input type="checkbox" name="factores" value={f.id} />
                  <span>
                    {f.factor}{' '}
                    <span className="pequeno tenue">
                      · {f.elementoNombre} ·{' '}
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>peso {f.peso}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <button type="submit" disabled={evaluando}>
            {evaluando ? 'Evaluando…' : 'Calcular el grado'}
          </button>
          <p className="pequeno tenue" style={{ margin: 0 }}>
            La evaluación queda con tu nombre y la hora, y no se reescribe: una reevaluación es un
            registro nuevo. Se reevalúa al menos cada {riesgo.reevaluacionMeses} meses (Art. 23 Bis 1).
          </p>
        </form>
      )}

      {!puede && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Solo un administrador evalúa el Grado de Riesgo.
        </p>
      )}

      {riesgo.historico.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 .5rem' }}>
            Evaluaciones anteriores{' '}
            <span className="pequeno tenue">
              el Art. 41 fr. IV exige conservar el histórico del grado
            </span>
          </h4>
          <div style={{ display: 'grid', gap: '.9rem' }}>
            {riesgo.historico.map((h) => (
              <Ficha key={h.id} e={h} titulo="anterior" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
