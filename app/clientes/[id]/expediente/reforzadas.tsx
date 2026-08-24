'use client'

import { useActionState, useState } from 'react'
import type { EstadoDeMedidas } from '../../../../src/persistencia/medidas-reforzadas'
import type { VinculoReforzado } from '../../../../src/dominio/medidas-reforzadas'
import { accionAdoptarMedidas, type EstadoCaptura } from './acciones'

/**
 * Las medidas reforzadas del Art. 23 Ter 4.
 *
 * El formulario cambia entero según la fracción, y la fracción NO se elige:
 * la decide la clase de persona del cliente. Por eso no hay un selector — hay
 * dos formularios distintos y la pantalla enseña el que toca.
 */

const INICIAL: EstadoCaptura = { ok: null, mensaje: '', problemas: [] }

const VINCULOS: ReadonlyArray<readonly [VinculoReforzado, string]> = [
  ['conyuge', 'Cónyuge'],
  ['concubina_concubinario', 'Concubina o concubinario'],
  ['dependiente_economico', 'Dependiente económico'],
  ['sociedad_vinculada', 'Sociedad con vínculo patrimonial'],
  ['asociacion_vinculada', 'Asociación con vínculo patrimonial'],
]

export function SeccionMedidasReforzadas({
  clienteId,
  estado,
  puede,
}: {
  clienteId: string
  estado: EstadoDeMedidas
  puede: boolean
}) {
  const [resultado, accion, guardando] = useActionState<EstadoCaptura, FormData>(
    accionAdoptarMedidas,
    INICIAL,
  )
  const [preveVinculadas, setPreveVinculadas] = useState(false)
  const [personas, setPersonas] = useState(1)

  const e = estado.exigencia
  const exigible = e.estado === 'exigible'
  const esFisica = exigible && e.fraccion === 'fisica'

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.1rem' }}>
      {estado.anticipado && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          El Cap. III Ter es exigible a partir de los actos del {estado.exigibleDesde}{' '}
          (Transitorio Cuarto).
        </p>
      )}

      {e.estado === 'no_exigible' && (
        <p className="pequeno tenue" style={{ margin: 0, maxWidth: '42rem' }}>
          El Art. 23 Ter 4 pide medidas reforzadas cuando el Grado de Riesgo es{' '}
          <strong>alto</strong>, y este cliente no lo es.
        </p>
      )}

      {e.estado === 'indeterminable' && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Todavía no se puede saber si este cliente necesita medidas reforzadas.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            Se disparan con el Grado de Riesgo alto, y a este cliente nadie lo ha clasificado.
            Clasifícalo en la sección 02.
          </p>
        </div>
      )}

      {/*
        El hueco más incómodo del capítulo, y el que no se puede tapar: el
        cliente ES de grado alto, así que algo hay que hacer, pero el artículo
        solo nombra personas físicas y morales.
      */}
      {e.estado === 'sin_fraccion' && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>El Art. 23 Ter 4 no nombra esta clase de persona.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0', maxWidth: '42rem' }}>
            El cliente es de Grado de Riesgo <strong>alto</strong>, y el artículo dice qué hacer
            con personas físicas (fr. I) y con morales (fr. II). Este es{' '}
            <strong>{e.tipoPersona}</strong>, y el texto no lo alcanza.
          </p>
          <p className="pequeno" style={{ margin: '.5rem 0 0', maxWidth: '42rem' }}>
            VIZO no le asigna una fracción por parecido: asentar medidas bajo una que no le
            corresponde fabricaría evidencia de cumplir una regla que quizá no existe. Es
            pregunta para el especialista PLD, y está registrada como tal.
          </p>
        </div>
      )}

      {exigible && (
        <p className="pequeno tenue" style={{ margin: 0, maxWidth: '42rem' }}>
          Cliente de Grado de Riesgo alto y {esFisica ? 'persona física' : 'persona moral'}: le
          toca la <strong>{esFisica ? 'fracción I' : 'fracción II'}</strong>.
          {estado.aplicaPepExtranjera && (
            <>
              {' '}
              Además es <strong>Persona Políticamente Expuesta extranjera</strong>, así que se
              apila la fracción III.
            </>
          )}
        </p>
      )}

      {estado.cobertura.estado === 'sobre_otra_clasificacion' && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Las últimas medidas responden a otra clasificación.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            Se adoptaron el {estado.cobertura.medidas.fechaAdopcion} y desde entonces el cliente
            volvió a clasificarse. El artículo no dice que eso obligue a repetirlas, así que VIZO
            lo pone a la vista sin llamarlo vencido.
          </p>
        </div>
      )}

      {estado.historial.map((m) => (
        <div key={m.id} className="calculo-caja">
          <p className="calculo-titulo">
            {m.fraccion === 'fisica' ? 'Fracción I' : 'Fracción II'} · {m.fechaAdopcion}
            {m.aplicaPepExtranjera && ' · + fracción III'}
          </p>
          <dl className="calculo-pares">
            {m.medidasOrigenDestino !== null && (
              <div className="calculo-par">
                <dt>Medidas de origen y destino</dt>
                <dd>{m.medidasOrigenDestino}</dd>
              </div>
            )}
            {m.informacionAccionistas !== null && (
              <div className="calculo-par">
                <dt>Información de accionistas</dt>
                <dd>{m.informacionAccionistas}</dd>
              </div>
            )}
            {m.consultaSeFecha !== null && (
              <div className="calculo-par">
                <dt>Consulta a la Secretaría de Economía</dt>
                <dd>
                  {m.consultaSeFecha} · {m.consultaSeResultado}
                </dd>
              </div>
            )}
            {m.manualPreveVinculadas !== null && (
              <div className="calculo-par">
                <dt>El Manual prevé el inciso b)</dt>
                <dd>{m.manualPreveVinculadas ? 'sí' : 'no, para este caso'}</dd>
              </div>
            )}
            {m.documentacionPepExtranjera !== null && (
              <div className="calculo-par">
                <dt>Documentación de la fr. III</dt>
                <dd>{m.documentacionPepExtranjera}</dd>
              </div>
            )}
            {m.personasVinculadas.map((per) => (
              <div key={per.id} className="calculo-par">
                <dt>{VINCULOS.find(([v]) => v === per.vinculo)?.[1] ?? per.vinculo}</dt>
                <dd>
                  {per.nombre} · {per.datosObtenidos ? 'datos ✓' : 'sin datos'}
                  {per.documentacionObtenida ? ' · documentación ✓' : ''}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {resultado.ok !== null && (
        <div className={resultado.ok ? 'exito' : 'error'}>
          {resultado.mensaje}
          {resultado.problemas.length > 0 && (
            <ul>
              {resultado.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {exigible && (
        <form action={accion} style={{ display: 'grid', gap: '.8rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />

          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            {estado.historial.length === 0 ? 'Adoptar las medidas' : 'Adoptar medidas nuevas'}
          </h3>

          <label style={{ margin: 0, maxWidth: '16rem' }}>
            <span>Fecha de adopción</span>
            <input type="date" name="fechaAdopcion" required disabled={!puede} />
          </label>

          {esFisica ? (
            <>
              <label style={{ margin: 0 }}>
                <span>
                  Medidas reforzadas de origen y destino{' '}
                  <span className="pista">— fr. I inciso a), con tus palabras</span>
                </span>
                <textarea name="medidasOrigenDestino" rows={3} required disabled={!puede} />
              </label>

              <label className="casilla">
                <input
                  type="checkbox"
                  name="preveVinculadas"
                  value="si"
                  checked={preveVinculadas}
                  onChange={(ev) => {
                    setPreveVinculadas(ev.target.checked)
                  }}
                  disabled={!puede}
                />
                <span>
                  El Manual de Políticas Internas prevé recabar datos del cónyuge, dependientes
                  económicos o sociedades vinculadas para este caso{' '}
                  <span className="pista">— fr. I inciso b), «en su caso»</span>
                </span>
              </label>

              {preveVinculadas &&
                Array.from({ length: personas }, (_, i) => (
                  <fieldset key={i} style={{ margin: 0 }}>
                    <legend>Persona vinculada {i + 1}</legend>
                    <div className="fila">
                      <label style={{ margin: 0 }}>
                        <span>Vínculo</span>
                        <select name={`vinculo${String(i)}`} disabled={!puede}>
                          {VINCULOS.map(([v, rotulo]) => (
                            <option key={v} value={v}>
                              {rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ margin: 0 }}>
                        <span>Nombre o razón social</span>
                        <input name={`nombre${String(i)}`} disabled={!puede} />
                      </label>
                    </div>
                    <label className="casilla suelta" style={{ marginTop: '.6rem' }}>
                      <input type="checkbox" name={`datos${String(i)}`} value="si" disabled={!puede} />
                      <span>Se obtuvieron sus datos del Capítulo III</span>
                    </label>
                    {estado.aplicaPepExtranjera && (
                      <label className="casilla suelta" style={{ marginTop: '.4rem' }}>
                        <input type="checkbox" name={`documentacion${String(i)}`} value="si" disabled={!puede} />
                        <span>
                          Se obtuvo su <strong>documentación</strong> del Capítulo III (fr. III)
                        </span>
                      </label>
                    )}
                  </fieldset>
                ))}

              {preveVinculadas && (
                <button
                  type="button"
                  className="secundario"
                  onClick={() => {
                    setPersonas((n) => n + 1)
                  }}
                  disabled={!puede}
                >
                  Agregar otra persona
                </button>
              )}
              <input type="hidden" name="cuantasPersonas" value={preveVinculadas ? personas : 0} />
            </>
          ) : (
            <>
              <label style={{ margin: 0 }}>
                <span>
                  Mayor información de los principales accionistas o socios{' '}
                  <span className="pista">— fr. II</span>
                </span>
                <textarea name="informacionAccionistas" rows={3} required disabled={!puede} />
              </label>

              <div className="aviso" style={{ margin: 0 }}>
                <p className="pequeno" style={{ margin: 0 }}>
                  La fr. II dice <strong>«debiendo consultar»</strong> los registros electrónicos
                  de la Secretaría de Economía para confirmar los datos. La consulta la haces tú:{' '}
                  <strong>VIZO no la ejecuta</strong> — automatizarla lo convertiría en quien
                  afirma que los datos coinciden. Aquí se registra que se hizo y qué arrojó.
                </p>
              </div>

              <div className="fila">
                <label style={{ margin: 0 }}>
                  <span>Fecha de la consulta a la Secretaría de Economía</span>
                  <input type="date" name="consultaSeFecha" required disabled={!puede} />
                </label>
                <label style={{ margin: 0 }}>
                  <span>Acuse o captura de la consulta (opcional)</span>
                  <input type="file" name="consultaSeArchivo" disabled={!puede} />
                </label>
              </div>

              <label style={{ margin: 0 }}>
                <span>Qué arrojó la consulta</span>
                <textarea name="consultaSeResultado" rows={2} required disabled={!puede} />
              </label>
            </>
          )}

          {estado.aplicaPepExtranjera && (
            <label style={{ margin: 0 }}>
              <span>
                Documentación adicional del Capítulo III{' '}
                <span className="pista">— fr. III, por ser PEP extranjera</span>
              </span>
              <textarea name="documentacionPepExtranjera" rows={2} required disabled={!puede} />
            </label>
          )}

          <button type="submit" disabled={!puede || guardando}>
            {guardando ? 'Asentando…' : 'Asentar las medidas'}
          </button>

          {!puede && (
            <span className="tenue pequeno">
              Solo un administrador asienta las medidas. La regla la aplica la base de datos.
            </span>
          )}
        </form>
      )}
    </div>
  )
}
