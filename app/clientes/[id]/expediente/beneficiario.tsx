'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import type {
  EstadoBeneficiarioControlador,
  IdentificacionAsentada,
} from '../../../../src/persistencia/beneficiario-controlador'
import {
  accionCompletarPisoBc,
  accionVincularSustentoBc,
  accionIdentificarBeneficiario,
  accionRegistrarExcepcionBc,
  type EstadoCaptura,
} from './acciones'

/**
 * El Beneficiario Controlador del Cap. III Quinquies.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA NO TIENE, Y ES LO IMPORTANTE
 * ────────────────────────────────────────────────────────────────────────────
 * No tiene un selector de fracción. El Art. 23 Quinquies fija un ORDEN —«por
 * lo menos el siguiente orden de prelación»— y elegir la fracción a mano
 * permitiría declarar «llegué por la III» sin haber buscado en la I y en la
 * II. Aquí se capturan INSUMOS: quién tiene cuánto capital, quién controla por
 * otro medio, quién es el funcionario de mayor grado. Cuál fracción resuelve
 * lo decide el motor con el umbral del catálogo, y el camino que recorrió
 * queda asentado completo — incluidas las fracciones que NO dieron resultado,
 * que son las que demuestran que el orden se agotó.
 */

const INICIAL: EstadoCaptura = { ok: null, mensaje: '', problemas: [] }

const CLASES = [
  { valor: 'tenencia', nombre: 'Tiene capital del cliente', pista: 'fr. I' },
  { valor: 'control', nombre: 'Controla por otro medio', pista: 'fr. II' },
  { valor: 'funcionario', nombre: 'Funcionario de mayor grado', pista: 'fr. III' },
] as const

const AREAS = [
  { valor: 'estrategia', nombre: 'la estrategia' },
  { valor: 'toma_de_decisiones', nombre: 'la toma de decisiones' },
  { valor: 'politicas_principales', nombre: 'las principales políticas' },
] as const

const NOMBRE_EXCEPCION: Record<string, string> = {
  bolsa_de_valores: 'Cotiza en bolsa (fr. I)',
  anexo_4bis: 'Anexo 4 Bis (fr. II)',
  anexo_6bis: 'Anexo 6 Bis (fr. II)',
  anexo_7a: 'Anexo 7-A (fr. II)',
  anexo_7bisa: 'Anexo 7 Bis A (fr. II)',
}

const NOMBRE_ROL: Record<string, string> = {
  fiduciario: 'fiduciario',
  fideicomitente: 'fideicomitente',
  fideicomisario: 'fideicomisario',
  protectora: 'persona protectora',
  comite_tecnico: 'miembro del comité técnico',
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

/** El camino recorrido: la evidencia que el párrafo de cierre exige conservar. */
function Camino({
  identificacion,
  descensos,
}: {
  identificacion: IdentificacionAsentada
  descensos: readonly IdentificacionAsentada[]
}) {
  return (
    <div style={{ display: 'grid', gap: '.9rem' }}>
      {identificacion.excepcion !== null ? (
        <p className="pequeno" style={{ margin: 0 }}>
          <strong>{NOMBRE_EXCEPCION[identificacion.excepcion.tipo] ?? identificacion.excepcion.tipo}</strong>
          {identificacion.excepcion.clavePizarra !== null && (
            <>
              {' · clave de pizarra '}
              <span className="mono">{identificacion.excepcion.clavePizarra}</span>
            </>
          )}
          {identificacion.excepcion.detalle !== null && (
            <>
              <br />
              <span className="tenue">{identificacion.excepcion.detalle}</span>
            </>
          )}
        </p>
      ) : (
        <>
          {identificacion.pasos.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '.4rem' }}>
              {identificacion.pasos.map((paso) => (
                <li key={paso.id} className="pequeno">
                  <strong>Fracción {paso.fraccion}</strong>{' '}
                  <span className={paso.resultado === 'encontrado' ? 'estado ok' : 'estado neutro'}>
                    {paso.resultado === 'encontrado' ? 'identificó' : 'sin resultado'}
                  </span>
                  {paso.motivo !== null && (
                    <>
                      <br />
                      <span className="tenue">{paso.motivo}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}

          {identificacion.hallazgos.length === 0 ? (
            <p className="pequeno tenue" style={{ margin: 0 }}>
              El procedimiento no llegó a ninguna persona física.
            </p>
          ) : (
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Beneficiario Controlador</th>
                    <th>Se llegó por</th>
                    <th>Con qué base</th>
                  </tr>
                </thead>
                <tbody>
                  {identificacion.hallazgos.map((h) => {
                    const descenso = descensos.find((d) => d.desciendeDeHallazgoId === h.id)
                    return (
                      <tr key={h.id}>
                        <td>{h.nombre}</td>
                        <td className="pequeno">
                          {h.fraccion !== null
                            ? `fracción ${h.fraccion}`
                            : `${NOMBRE_ROL[h.rol ?? ''] ?? h.rol} del fideicomiso`}
                        </td>
                        <td className="pequeno">
                          {h.base}
                          {descenso !== undefined && (
                            <>
                              <br />
                              <span className="tenue">
                                Era persona moral: se descendió y su propio procedimiento quedó
                                asentado ({descenso.hallazgos.length} persona(s) física(s)).
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="pequeno tenue" style={{ margin: 0 }}>
        Identificado el {identificacion.fechaIdentificacion}
        {identificacion.excepcion === null && (
          <>
            {' · umbral aplicado '}
            {identificacion.umbralPct}%{' '}
            {identificacion.umbralInclusivo ? '(«o más»)' : '(«más del»)'}
          </>
        )}
      </p>
    </div>
  )
}

function FormularioIdentificar({
  clienteId,
  alTerminar,
}: {
  clienteId: string
  alTerminar: () => void
}) {
  const [estado, accion, guardando] = useActionState<EstadoCaptura, FormData>(
    accionIdentificarBeneficiario,
    INICIAL,
  )
  const [clases, setClases] = useState<string[]>(['tenencia'])

  // Al terminar bien, el formulario se va. La confirmación es el camino
  // recién asentado, que aparece arriba con las fracciones que se evaluaron:
  // dejar el formulario abierto y en blanco debajo de una barra verde invita
  // a capturar dos veces la misma determinación.
  useEffect(() => {
    if (estado.ok === true) alTerminar()
  }, [estado, alTerminar])

  const agregar = () => { setClases((c) => [...c, 'tenencia']) }
  const cambiar = (i: number, valor: string) => {
    setClases((c) => c.map((x, j) => (j === i ? valor : x)))
  }

  return (
    <form action={accion} style={{ display: 'grid', gap: '1rem' }}>
      <Problemas estado={estado} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="cuantosCandidatos" value={clases.length} />

      <label style={{ margin: 0, maxWidth: '20rem' }}>
        <span>
          Fecha de la identificación{' '}
          <span className="pista">previa al acto o al establecer la relación</span>
        </span>
        <input type="date" name="fechaIdentificacion" required />
      </label>

      {clases.map((clase, i) => (
        <fieldset
          key={i}
          style={{
            border: '1px solid var(--linea)',
            borderRadius: '.6rem',
            padding: '.9rem',
            display: 'grid',
            gap: '.7rem',
          }}
        >
          <legend className="pequeno tenue" style={{ padding: '0 .4rem' }}>
            Candidato {i + 1}
          </legend>

          <div className="rejilla" style={{ gap: '.7rem' }}>
            <label style={{ margin: 0 }}>
              <span>Nombre</span>
              <input type="text" name={`nombre${String(i)}`} />
            </label>
            <label style={{ margin: 0 }}>
              <span>
                RFC <span className="pista">opcional</span>
              </span>
              <input type="text" name={`rfc${String(i)}`} className="mono" maxLength={13} />
            </label>
            <label style={{ margin: 0 }}>
              <span>
                CURP <span className="pista">opcional</span>
              </span>
              <input type="text" name={`curp${String(i)}`} className="mono" maxLength={18} />
            </label>
          </div>

          <label style={{ margin: 0 }}>
            <span>Qué se sabe de esta persona</span>
            <select
              name={`clase${String(i)}`}
              value={clase}
              onChange={(e) => { cambiar(i, e.target.value) }}
            >
              {CLASES.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.nombre} ({c.pista})
                </option>
              ))}
            </select>
          </label>

          {clase === 'tenencia' && (
            <div className="rejilla" style={{ gap: '.7rem' }}>
              <label style={{ margin: 0 }}>
                <span>
                  % del capital <span className="pista">composición accionaria o parte social</span>
                </span>
                <input
                  type="number"
                  name={`porcentaje${String(i)}`}
                  min={0.01}
                  max={100}
                  step={0.01}
                />
              </label>
              <label style={{ margin: 0 }}>
                <span>Vía</span>
                <select name={`via${String(i)}`} defaultValue="directa">
                  <option value="directa">Directa</option>
                  <option value="indirecta">Indirecta (por una persona moral)</option>
                </select>
              </label>
            </div>
          )}

          {clase === 'control' && (
            <>
              <label style={{ margin: 0 }}>
                <span>
                  Por qué medio <span className="pista">p. ej. veto estatutario sobre el presupuesto</span>
                </span>
                <input type="text" name={`medio${String(i)}`} />
              </label>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="pequeno" style={{ padding: 0, marginBottom: '.35rem' }}>
                  Sus funciones se relacionan con
                </legend>
                <div style={{ display: 'grid', gap: '.3rem' }}>
                  {AREAS.map((a) => (
                    <label
                      key={a.valor}
                      className="pequeno"
                      style={{ margin: 0, display: 'flex', gap: '.5rem' }}
                    >
                      <input type="checkbox" name={`areas${String(i)}`} value={a.valor} />
                      <span>{a.nombre}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {clase === 'funcionario' && (
            <div className="rejilla" style={{ gap: '.7rem' }}>
              <label style={{ margin: 0 }}>
                <span>Cargo</span>
                <input type="text" name={`cargo${String(i)}`} />
              </label>
              <label style={{ margin: 0 }}>
                <span>
                  Rango <span className="pista">1 es el de mayor grado</span>
                </span>
                <input type="number" name={`rango${String(i)}`} min={1} defaultValue={1} />
              </label>
            </div>
          )}

          <label className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
            <input type="checkbox" name={`grupo${String(i)}`} value="si" />
            <span>Es un grupo de personas físicas actuando en conjunto</span>
          </label>
        </fieldset>
      ))}

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="button" className="secundario" onClick={agregar}>
          Agregar otro candidato
        </button>
        <button type="submit" disabled={guardando}>
          {guardando ? 'Corriendo el orden de prelación…' : 'Correr el orden y asentar el camino'}
        </button>
      </div>
    </form>
  )
}

function FormularioExcepcion({
  clienteId,
  alTerminar,
}: {
  clienteId: string
  alTerminar: () => void
}) {
  const [estado, accion, guardando] = useActionState<EstadoCaptura, FormData>(
    accionRegistrarExcepcionBc,
    INICIAL,
  )
  const [tipo, setTipo] = useState('bolsa_de_valores')

  useEffect(() => {
    if (estado.ok === true) alTerminar()
  }, [estado, alTerminar])

  return (
    <form action={accion} style={{ display: 'grid', gap: '.7rem', maxWidth: '30rem' }}>
      <Problemas estado={estado} />
      <input type="hidden" name="clienteId" value={clienteId} />

      <label style={{ margin: 0 }}>
        <span>Supuesto del Art. 23 Quinquies 2</span>
        <select
          name="tipoExcepcion"
          value={tipo}
          onChange={(e) => { setTipo(e.target.value) }}
        >
          {Object.entries(NOMBRE_EXCEPCION).map(([valor, nombre]) => (
            <option key={valor} value={valor}>
              {nombre}
            </option>
          ))}
        </select>
      </label>

      {/* La clave solo aparece para la fr. I, y ahí es obligatoria: el texto la
          condiciona con «siempre que proporcione». Para los anexos no existe. */}
      {tipo === 'bolsa_de_valores' && (
        <label style={{ margin: 0 }}>
          <span>
            Clave de pizarra{' '}
            <span className="pista">con la que se localiza en la bolsa</span>
          </span>
          <input type="text" name="clavePizarra" className="mono" required />
        </label>
      )}

      <label style={{ margin: 0 }}>
        <span>Fecha</span>
        <input type="date" name="fechaIdentificacion" required />
      </label>

      <label style={{ margin: 0 }}>
        <span>
          Sustento <span className="pista">opcional</span>
        </span>
        <input type="text" name="detalleExcepcion" />
      </label>

      {(tipo === 'anexo_7a' || tipo === 'anexo_7bisa') && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          El texto de este anexo no está contrastado contra el DOF, así que VIZO no decide por su
          cuenta si el cliente cae en él: se registra lo que el obligado declara, con su sustento.
        </p>
      )}

      <button type="submit" className="secundario" disabled={guardando}>
        {guardando ? 'Registrando…' : 'Registrar la excepción'}
      </button>
    </form>
  )
}

/**
 * La documentación que sustenta el procedimiento (Art. 23 Quinquies).
 *
 * El artículo pide cuatro cosas y ésta es la segunda: «conservar la
 * información, DOCUMENTACIÓN y registros que la sustenten». El documento no se
 * sube aquí — entra por la zona de documentos del expediente, con su huella— y
 * esto lo ata al paso o al hallazgo que respalda.
 *
 * El lugar va en UN SOLO campo con prefijo, no en dos selectores: dos
 * permitirían mandar paso y hallazgo a la vez, y la base lo rechazaría con
 * razón. Mejor que no se pueda ni decir.
 */
function Sustentos({
  clienteId,
  identificacion,
  sustentos,
  documentos,
  puede,
}: {
  clienteId: string
  identificacion: IdentificacionAsentada
  sustentos: EstadoBeneficiarioControlador['sustentos']
  documentos: readonly { id: string; etiqueta: string }[]
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<EstadoCaptura, FormData>(
    accionVincularSustentoBc,
    INICIAL,
  )
  const [abierto, setAbierto] = useState(false)

  const nombreDelLugar = (s: EstadoBeneficiarioControlador['sustentos'][number]): string => {
    if (s.pasoId !== null) {
      const paso = identificacion.pasos.find((p) => p.id === s.pasoId)
      return paso === undefined ? 'una fracción' : `la fracción ${paso.fraccion}`
    }
    if (s.hallazgoId !== null) {
      const h = identificacion.hallazgos.find((x) => x.id === s.hallazgoId)
      return h === undefined ? 'un hallazgo' : h.nombre
    }
    return 'el procedimiento entero'
  }

  return (
    <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1rem', display: 'grid', gap: '.7rem' }}>
      <div>
        <strong className="pequeno">Documentación que lo sustenta</strong>
        <p className="pequeno tenue" style={{ margin: '.3rem 0 0', maxWidth: '44rem' }}>
          El párrafo de cierre del Art. 23 Quinquies pide conservar «la información, documentación
          y registros que la sustenten». El archivo se sube en la zona de documentos del
          expediente; aquí se dice qué parte del camino respalda.
        </p>
      </div>

      <Problemas estado={estado} />

      {sustentos.length === 0 ? (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Ningún documento vinculado todavía. El procedimiento está escrito; lo que le falta es lo
          que lo prueba.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.05rem' }}>
          {sustentos.map((s) => (
            <li key={s.id} className="pequeno" style={{ marginBottom: '.35rem' }}>
              <span className="mono">{s.nombreArchivo}</span> · sustenta {nombreDelLugar(s)}
              <br />
              <span className="tenue">{s.nota}</span>
            </li>
          ))}
        </ul>
      )}

      {puede &&
        (abierto ? (
          <form action={accion} style={{ display: 'grid', gap: '.5rem', maxWidth: '32rem' }}>
            <input type="hidden" name="clienteId" value={clienteId} />
            <input type="hidden" name="identificacionId" value={identificacion.id} />

            <label style={{ margin: 0 }}>
              <span className="pequeno">Documento del expediente</span>
              <select name="documentoId" required>
                <option value="">Selecciona…</option>
                {documentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.etiqueta}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ margin: 0 }}>
              <span className="pequeno">Qué parte del camino respalda</span>
              <select name="lugar" defaultValue="">
                <option value="">El procedimiento entero</option>
                {identificacion.pasos.map((p) => (
                  <option key={p.id} value={`paso:${p.id}`}>
                    La fracción {p.fraccion}
                  </option>
                ))}
                {identificacion.hallazgos.map((h) => (
                  <option key={h.id} value={`hallazgo:${h.id}`}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ margin: 0 }}>
              <span className="pequeno">
                Qué prueba <span className="pista">se conserva diez años; que se entienda sin abrirlo</span>
              </span>
              <input type="text" name="nota" required />
            </label>

            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="secundario pequeno" disabled={guardando}>
                {guardando ? 'Vinculando…' : 'Vincular'}
              </button>
              <button
                type="button"
                className="secundario pequeno"
                onClick={() => { setAbierto(false) }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : documentos.length === 0 ? (
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Este expediente todavía no tiene documentos que vincular. Súbelos abajo y vuelve.
          </p>
        ) : (
          <button
            type="button"
            className="secundario pequeno"
            onClick={() => { setAbierto(true) }}
          >
            Vincular un documento
          </button>
        ))}
    </div>
  )
}

/**
 * El piso del Art. 12 fr. VII ¶2.
 *
 * Va DESPUÉS del camino y no dentro del formulario de identificación, porque
 * los datos llegan después: el orden de prelación dice quién es, y sus datos
 * se recaban luego. Pedir las dos cosas a la vez empujaría a no registrar el
 * procedimiento hasta tenerlo todo, y el procedimiento es lo que más cuesta
 * reconstruir dos años después.
 */
function PisoDelBeneficiario({
  clienteId,
  piso,
  puede,
}: {
  clienteId: string
  piso: EstadoBeneficiarioControlador['piso']
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<EstadoCaptura, FormData>(
    accionCompletarPisoBc,
    INICIAL,
  )
  const [abierto, setAbierto] = useState<string | null>(null)

  if (piso.porBeneficiario.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1rem', display: 'grid', gap: '.8rem' }}>
      <div>
        <strong className="pequeno">Datos que hay que recabar de cada uno</strong>
        <p className="pequeno tenue" style={{ margin: '.3rem 0 0', maxWidth: '44rem' }}>
          El Art. 12 fr. VII ¶2 los pide <strong>en todos los casos</strong> cuando el cliente es
          persona moral o fideicomiso — no condicionados a que el cliente los tenga, como sí lo
          están los del ¶1 para clientes persona física.
        </p>
      </div>

      <Problemas estado={estado} />

      {piso.porBeneficiario.map((b) => (
        <div key={b.beneficiarioId} style={{ display: 'grid', gap: '.4rem' }}>
          <div className="pequeno">
            <strong>{b.nombre}</strong>{' '}
            <span className={b.completo ? 'estado ok' : 'estado aviso'}>
              {b.completo ? 'con sus datos' : `faltan ${String(b.datos.filter((d) => !d.presente).length)}`}
            </span>
          </div>
          {!b.completo && (
            <ul style={{ margin: 0, paddingLeft: '1.05rem' }}>
              {b.datos
                .filter((d) => !d.presente)
                .map((d) => (
                  <li key={d.numeral} className="pequeno tenue">
                    {d.etiqueta} <span className="mono">· Anexo 3 a) {d.numeral})</span>
                  </li>
                ))}
            </ul>
          )}

          {puede && !b.completo && (
            abierto === b.beneficiarioId ? (
              <form action={accion} style={{ display: 'grid', gap: '.5rem', maxWidth: '32rem' }}>
                <input type="hidden" name="clienteId" value={clienteId} />
                <input type="hidden" name="beneficiarioId" value={b.beneficiarioId} />
                <div className="rejilla" style={{ gap: '.6rem' }}>
                  <label style={{ margin: 0 }}>
                    <span className="pequeno">Fecha de nacimiento</span>
                    <input type="date" name="fechaNacimiento" />
                  </label>
                  <label style={{ margin: 0 }}>
                    <span className="pequeno">
                      Nacionalidad <span className="pista">código de país</span>
                    </span>
                    <input type="text" name="nacionalidad" className="mono" maxLength={2} />
                  </label>
                  <label style={{ margin: 0 }}>
                    <span className="pequeno">RFC</span>
                    <input type="text" name="rfcBc" className="mono" maxLength={13} />
                  </label>
                  <label style={{ margin: 0 }}>
                    <span className="pequeno">CURP</span>
                    <input type="text" name="curpBc" className="mono" maxLength={18} />
                  </label>
                </div>
                <p className="pequeno tenue" style={{ margin: 0 }}>
                  Lo que dejes en blanco no se borra: se queda como estaba.
                </p>
                <button type="submit" className="secundario pequeno" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar sus datos'}
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="secundario pequeno"
                onClick={() => { setAbierto(b.beneficiarioId) }}
              >
                Recabar sus datos
              </button>
            )
          )}
        </div>
      ))}
    </div>
  )
}

export function SeccionBeneficiario({
  clienteId,
  estado,
  documentos,
  puede,
}: {
  clienteId: string
  estado: EstadoBeneficiarioControlador
  documentos: readonly { id: string; etiqueta: string }[]
  puede: boolean
}) {
  const [abierto, setAbierto] = useState<'ninguno' | 'identificar' | 'excepcion'>('ninguno')
  const cerrar = useCallback(() => { setAbierto('ninguno') }, [])

  if (!estado.requiere) {
    return (
      <p className="pequeno tenue" style={{ margin: 0, maxWidth: '42rem' }}>
        El procedimiento del Cap. III Quinquies es de personas morales y fideicomisos. A una
        persona física la Ley le pregunta otra cosa —si actúa por cuenta de otro (Art. 18 fr. III,
        párrafo 2)— y esa respuesta vive en el alta del cliente.
      </p>
    )
  }

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.1rem' }}>
      {estado.umbral.anticipado && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          El Cap. III Quinquies es exigible a partir de los actos del {estado.umbral.exigibleDesde}{' '}
          (Transitorio Cuarto). Identificar antes no sobra: el Art. 23 Quinquies 1 lo pide antes
          del acto.
        </p>
      )}

      {estado.vigente === null ? (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Nadie ha corrido el procedimiento para este cliente.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            El Art. 23 Quinquies no pide guardar un nombre: pide documentar el procedimiento
            seguido, conservarlo y mantenerlo actualizado durante la relación de negocios.
          </p>
        </div>
      ) : (
        <Camino identificacion={estado.vigente} descensos={estado.descensos} />
      )}

      {estado.vigente !== null && estado.vigente.excepcion === null && (
        <>
          <PisoDelBeneficiario clienteId={clienteId} piso={estado.piso} puede={puede} />
          <Sustentos
            clienteId={clienteId}
            identificacion={estado.vigente}
            sustentos={estado.sustentos}
            documentos={documentos}
            puede={puede}
          />
        </>
      )}

      {puede && (
        <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1rem' }}>
          {abierto === 'ninguno' ? (
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setAbierto('identificar') }}>
                {estado.vigente === null ? 'Identificar' : 'Volver a identificar'}
              </button>
              <button
                type="button"
                className="secundario"
                onClick={() => { setAbierto('excepcion') }}
              >
                Registrar una excepción
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.8rem' }}>
              {estado.vigente !== null && (
                <p className="pequeno tenue" style={{ margin: 0 }}>
                  La identificación actual no se borra: queda en el historial como sustituida, que
                  es lo que demuestra que se mantuvo actualizada.
                </p>
              )}
              {abierto === 'identificar' ? (
                <FormularioIdentificar clienteId={clienteId} alTerminar={cerrar} />
              ) : (
                <FormularioExcepcion clienteId={clienteId} alTerminar={cerrar} />
              )}
              <button
                type="button"
                className="secundario pequeno"
                onClick={() => { setAbierto('ninguno') }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {estado.historial.length > 0 && (
        <details>
          <summary className="pequeno">
            Identificaciones anteriores ({estado.historial.length})
          </summary>
          <div style={{ display: 'grid', gap: '1rem', marginTop: '.8rem' }}>
            {estado.historial.map((h) => (
              <div key={h.id} style={{ borderLeft: '2px solid var(--linea)', paddingLeft: '.9rem' }}>
                <Camino identificacion={h} descensos={estado.descensos} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
