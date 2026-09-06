'use client'

import { useActionState, useState } from 'react'
import type { EstructuraDelCliente } from '../../../../src/persistencia/grafo-societario'
import {
  accionAgregarParte,
  accionAgregarParticipacion,
  accionCerrarParticipacion,
  accionIdentificarDesdeEstructura,
  type EstadoCaptura,
} from './acciones'

/**
 * La estructura societaria — la tabla anidada que el plano pidió en vez de un
 * visualizador de grafo.
 *
 * Lo que esta pantalla NO tiene: un campo de «porcentaje efectivo». La cadena
 * la multiplica el motor; aquí solo se declara quién posee qué, con cuánto y
 * desde cuándo. El 60% × 50% = 30% que antes calculaba el capturista con una
 * calculadora es exactamente el error que este formulario vuelve imposible.
 */

const INICIAL: EstadoCaptura = { ok: null, mensaje: '', problemas: [] }

const NOMBRE_TIPO: Record<string, string> = {
  fisica: 'persona física',
  moral: 'persona moral',
  fideicomiso: 'fideicomiso',
  otra_figura: 'otra figura',
}

function Problemas({ estado }: { estado: EstadoCaptura }) {
  if (estado.ok === null) return null
  if (estado.ok) return <div className="exito">{estado.mensaje}</div>
  return (
    <div className="error">
      {estado.mensaje}
      {estado.problemas.length > 0 && (
        <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
          {estado.problemas.map((p) => (
            <li key={p} className="pequeno">{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EstructuraSocietaria({
  clienteId,
  estructura,
  puede,
}: {
  clienteId: string
  estructura: EstructuraDelCliente
  puede: boolean
}) {
  const [alta, accionAlta, guardandoAlta] = useActionState<EstadoCaptura, FormData>(
    accionAgregarParte,
    INICIAL,
  )
  const [arista, accionArista, guardandoArista] = useActionState<EstadoCaptura, FormData>(
    accionAgregarParticipacion,
    INICIAL,
  )
  const [cierre, accionCierre, cerrando] = useActionState<EstadoCaptura, FormData>(
    accionCerrarParticipacion,
    INICIAL,
  )
  const [corrida, accionCorrida, corriendo] = useActionState<EstadoCaptura, FormData>(
    accionIdentificarDesdeEstructura,
    INICIAL,
  )
  const [abierto, setAbierto] = useState<'ninguno' | 'parte' | 'participacion' | 'correr'>('ninguno')
  const [cerrandoId, setCerrandoId] = useState<string | null>(null)

  const porId = new Map(estructura.partes.map((p) => [p.id, p]))
  const nombreDe = (id: string): string => porId.get(id)?.nombre ?? id
  const hayRaiz = estructura.partes.some((p) => p.esLaRaiz)
  const fisicas = estructura.partes.filter((p) => p.tipo === 'fisica')
  const vigentes = estructura.participaciones.filter((a) => a.vigenteHasta === null)

  return (
    <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1rem', display: 'grid', gap: '.9rem' }}>
      <div>
        <strong className="pequeno">Estructura societaria</strong>
        <p className="pequeno tenue" style={{ margin: '.3rem 0 0', maxWidth: '46rem' }}>
          Quién posee qué, con cuánto y desde cuándo. El porcentaje efectivo de cada cadena{' '}
          <strong>lo multiplica el motor</strong> — 60% de quien tiene 50% es 30%, y ese cálculo
          ya no se hace a mano.
        </p>
      </div>

      {estructura.partes.length === 0 ? (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Sin estructura capturada. Empieza por la raíz: el propio cliente.
        </p>
      ) : (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Parte</th>
                <th>Tipo</th>
                <th>Participaciones</th>
              </tr>
            </thead>
            <tbody>
              {estructura.partes.map((parte) => {
                const posee = estructura.participaciones.filter((a) => a.duenoId === parte.id)
                return (
                  <tr key={parte.id}>
                    <td>
                      {parte.nombre}
                      {parte.esLaRaiz && (
                        <span className="chip" style={{ marginLeft: '.45rem' }}>
                          el cliente
                        </span>
                      )}
                      {parte.rfc !== null && (
                        <span className="tenue mono pequeno" style={{ marginLeft: '.45rem' }}>
                          {parte.rfc}
                        </span>
                      )}
                    </td>
                    <td className="pequeno">{NOMBRE_TIPO[parte.tipo]}</td>
                    <td className="pequeno">
                      {posee.length === 0 ? (
                        <span className="tenue">—</span>
                      ) : (
                        posee.map((a) => (
                          <div key={a.id} style={{ marginBottom: '.2rem' }}>
                            <span className="mono">{a.porcentaje}%</span> de {nombreDe(a.poseidaId)}
                            {a.vigenteHasta !== null ? (
                              <span className="tenue"> · hasta {a.vigenteHasta}</span>
                            ) : (
                              puede && (
                                cerrandoId === a.id ? (
                                  <form
                                    action={accionCierre}
                                    style={{ display: 'inline-flex', gap: '.35rem', marginLeft: '.5rem' }}
                                  >
                                    <input type="hidden" name="clienteId" value={clienteId} />
                                    <input type="hidden" name="participacionId" value={a.id} />
                                    <input type="date" name="vigenteHasta" required />
                                    <button type="submit" className="secundario pequeno" disabled={cerrando}>
                                      {cerrando ? '…' : 'Cerrar'}
                                    </button>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    className="secundario pequeno"
                                    style={{ marginLeft: '.5rem' }}
                                    onClick={() => { setCerrandoId(a.id) }}
                                  >
                                    Dejó de ser cierta
                                  </button>
                                )
                              )
                            )}
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Problemas estado={cierre} />

      {puede && (
        <div style={{ display: 'grid', gap: '.8rem' }}>
          {abierto === 'ninguno' && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="secundario pequeno" onClick={() => { setAbierto('parte') }}>
                Agregar una parte
              </button>
              {estructura.partes.length >= 2 && (
                <button
                  type="button"
                  className="secundario pequeno"
                  onClick={() => { setAbierto('participacion') }}
                >
                  Registrar una participación
                </button>
              )}
              {hayRaiz && vigentes.length > 0 && (
                <button type="button" className="pequeno" onClick={() => { setAbierto('correr') }}>
                  Correr el orden desde la estructura
                </button>
              )}
            </div>
          )}

          {abierto === 'parte' && (
            <form action={accionAlta} style={{ display: 'grid', gap: '.6rem', maxWidth: '30rem' }}>
              <Problemas estado={alta} />
              <input type="hidden" name="clienteId" value={clienteId} />
              <label style={{ margin: 0 }}>
                <span className="pequeno">Nombre o razón social</span>
                <input type="text" name="nombreParte" required />
              </label>
              <div className="rejilla" style={{ gap: '.6rem' }}>
                <label style={{ margin: 0 }}>
                  <span className="pequeno">Tipo</span>
                  <select name="tipoParte" defaultValue="moral">
                    <option value="fisica">Persona física</option>
                    <option value="moral">Persona moral</option>
                    <option value="fideicomiso">Fideicomiso</option>
                    <option value="otra_figura">Otra figura</option>
                  </select>
                </label>
                <label style={{ margin: 0 }}>
                  <span className="pequeno">RFC <span className="pista">opcional</span></span>
                  <input type="text" name="rfcParte" className="mono" maxLength={13} />
                </label>
                <label style={{ margin: 0 }}>
                  <span className="pequeno">CURP <span className="pista">opcional</span></span>
                  <input type="text" name="curpParte" className="mono" maxLength={18} />
                </label>
              </div>
              {!hayRaiz && (
                <label className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
                  <input type="checkbox" name="esLaRaiz" value="si" defaultChecked />
                  <span>Es el propio cliente (la raíz de la estructura)</span>
                </label>
              )}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="secundario pequeno" disabled={guardandoAlta}>
                  {guardandoAlta ? 'Agregando…' : 'Agregar'}
                </button>
                <button type="button" className="secundario pequeno" onClick={() => { setAbierto('ninguno') }}>
                  Cerrar
                </button>
              </div>
            </form>
          )}

          {abierto === 'participacion' && (
            <form action={accionArista} style={{ display: 'grid', gap: '.6rem', maxWidth: '30rem' }}>
              <Problemas estado={arista} />
              <input type="hidden" name="clienteId" value={clienteId} />
              <label style={{ margin: 0 }}>
                <span className="pequeno">Quién posee</span>
                <select name="duenoId" required>
                  <option value="">Selecciona…</option>
                  {estructura.partes.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label style={{ margin: 0 }}>
                <span className="pequeno">De quién <span className="pista">nadie posee a una persona física</span></span>
                <select name="poseidaId" required>
                  <option value="">Selecciona…</option>
                  {estructura.partes
                    .filter((p) => p.tipo !== 'fisica')
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                </select>
              </label>
              <div className="rejilla" style={{ gap: '.6rem' }}>
                <label style={{ margin: 0 }}>
                  <span className="pequeno">% del capital</span>
                  <input
                    type="number" name="porcentajeParticipacion"
                    min={0.01} max={100} step={0.01} required
                  />
                </label>
                <label style={{ margin: 0 }}>
                  <span className="pequeno">
                    Cierta desde <span className="pista">la fecha de la asamblea, no la de hoy</span>
                  </span>
                  <input type="date" name="vigenteDesde" required />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="secundario pequeno" disabled={guardandoArista}>
                  {guardandoArista ? 'Registrando…' : 'Registrar'}
                </button>
                <button type="button" className="secundario pequeno" onClick={() => { setAbierto('ninguno') }}>
                  Cerrar
                </button>
              </div>
            </form>
          )}

          {abierto === 'correr' && (
            <form action={accionCorrida} style={{ display: 'grid', gap: '.6rem', maxWidth: '30rem' }}>
              <Problemas estado={corrida} />
              <input type="hidden" name="clienteId" value={clienteId} />
              <p className="pequeno tenue" style={{ margin: 0 }}>
                El motor multiplica las cadenas vigentes a la fecha, corre el orden de prelación y
                congela el grafo completo en la identificación.
              </p>
              <label style={{ margin: 0 }}>
                <span className="pequeno">Fecha de la identificación</span>
                <input type="date" name="fechaIdentificacion" required />
              </label>
              <label style={{ margin: 0 }}>
                <span className="pequeno">
                  Funcionario de mayor grado{' '}
                  <span className="pista">fr. III — por si las cadenas no alcanzan el umbral</span>
                </span>
                <select name="funcionarioParteId" defaultValue="">
                  <option value="">Sin declarar</option>
                  {fisicas.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label style={{ margin: 0 }}>
                <span className="pequeno">Su cargo</span>
                <input type="text" name="funcionarioCargo" />
              </label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" disabled={corriendo}>
                  {corriendo ? 'Corriendo…' : 'Correr el orden'}
                </button>
                <button type="button" className="secundario pequeno" onClick={() => { setAbierto('ninguno') }}>
                  Cerrar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
