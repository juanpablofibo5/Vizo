import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import {
  estadoDeLaEntidad,
  type EstadoDeLaEntidad,
  type EvaluacionDeEntidad,
} from '../../src/persistencia/entidad'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { Marco } from '../componentes/marco'
import { FormularioEvaluarEntidad } from './evaluar'

export const dynamic = 'force-dynamic'

/**
 * El riesgo de la ENTIDAD: el del propio obligado, no el de sus clientes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA TIENE QUE LOGRAR
 * ────────────────────────────────────────────────────────────────────────────
 * Que la consecuencia se lea antes que el número. El Art. 18 fr. VII y XI de
 * la Ley exige evaluar a la propia entidad, y los Arts. 44/45 del Acuerdo le
 * cuelgan la decisión cara: con grado alto, la evaluación de efectividad anual
 * la practica un auditor externo certificado ante la UIF; sin él, puede
 * hacerla el área interna. Eso es dinero del obligado, y es lo primero que la
 * pantalla dice.
 *
 * Y una frontera que es condición de diseño (ADR-28): esta pantalla JAMÁS
 * presenta la mitigación como una forma de «bajar el grado». La resta es la
 * que el método declarado produce con la evidencia que cada nivel exige — se
 * enseña completa, con el inherente al lado, para que nadie lea el residual
 * como un favor.
 */

const BASE_LEGIBLE: Record<string, string> = {
  anio_completo: 'año completo',
  parcial_desde_inicio: 'parcial desde el inicio',
  proyectados: 'datos proyectados',
}

function FichaEvaluacion({ e, titulo }: { e: EvaluacionDeEntidad; titulo?: string }) {
  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <p style={{ margin: 0 }}>
        {titulo !== undefined && <span className="pequeno tenue">{titulo} · </span>}
        <span className={e.esAlto ? 'chip alerta' : 'chip'}>{e.gradoNombre}</span>{' '}
        <span className="pequeno tenue" style={{ fontVariantNumeric: 'tabular-nums' }}>
          inherente {e.inherente} − mitigación {e.mitigacion} = residual {e.residual} · base:{' '}
          {BASE_LEGIBLE[e.baseInformacion] ?? e.baseInformacion} · metodología v{e.modeloVersion}{' '}
          · evaluado el {e.evaluadoEn.slice(0, 10)}
        </span>
      </p>
      <p className="pequeno" style={{ margin: 0 }}>
        {e.vencida ? (
          <span className="error">
            La reevaluación venció el {e.vence}: esta pantalla está describiendo un riesgo de hace
            más de un ciclo.
          </span>
        ) : (
          <span className="tenue">Se reevalúa a más tardar el {e.vence}.</span>
        )}
      </p>
    </div>
  )
}

function Veredicto({ e }: { e: EvaluacionDeEntidad }) {
  return e.auditoria === 'externa_obligatoria' ? (
    <div className="tarjeta" style={{ borderLeft: '3px solid var(--alerta)' }}>
      <h3 style={{ marginTop: 0 }}>Auditoría externa obligatoria</h3>
      <p className="pequeno" style={{ margin: 0 }}>
        La última evaluación quedó en <strong>grado alto</strong>. Con ese resultado, la
        evaluación de efectividad anual la practica un <strong>auditor externo</strong> con
        certificación vigente ante la UIF (Arts. 44 y 45 del Acuerdo 115/2026). No es una
        preferencia de VIZO: es la consecuencia que el Acuerdo le cuelga al grado.
      </p>
    </div>
  ) : (
    <div className="tarjeta tarjeta-ok">
      <h3 style={{ marginTop: 0 }}>Evaluación interna permitida</h3>
      <p className="pequeno" style={{ margin: 0 }}>
        Con grado <strong>{e.gradoNombre}</strong>, el Art. 45 del Acuerdo permite que la
        evaluación de efectividad anual la haga el área interna del obligado. Contratar una
        externa siempre puede elegirse; lo que este grado evita es que sea obligatoria.
      </p>
    </div>
  )
}

export default async function PantallaEntidad() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const estado = await leerComoUsuario(db, sesion, (): Promise<EstadoDeLaEntidad> =>
      estadoDeLaEntidad(db, { sesion, hoy: hoyEnMexico() }),
    )

    const puedeEvaluar = estado.faltaParaEvaluar.length === 0
    const elementos = Object.keys(estado.pesosPorElemento).sort()

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Riesgo de la entidad</h1>
        <p className="sub" style={{ maxWidth: '46rem' }}>
          El riesgo del propio obligado — no el de sus clientes (Art. 18 fr. VII y XI de la Ley).
          De su grado depende quién puede hacer la evaluación de efectividad anual: auditor
          externo certificado ante la UIF, o el área interna (Arts. 44 y 45 del Acuerdo
          115/2026).
        </p>

        {estado.vigente !== null && (
          <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            <Veredicto e={estado.vigente} />
            <div className="tarjeta">
              <FichaEvaluacion e={estado.vigente} />
            </div>
          </div>
        )}

        {/* La frontera, dicha donde más tienta cruzarla. */}
        <div className="tarjeta" style={{ borderLeft: '3px solid var(--acento)', marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>El residual no es un descuento</h3>
          <p className="pequeno" style={{ margin: 0 }}>
            El método declarado (<span className="mono">residual por elemento</span>) resta del
            riesgo inherente la mitigación que los controles del obligado alcanzan — y cada nivel
            de efectividad <strong>exige una evidencia concreta</strong> para poder declararse.
            Nada aquí «baja el grado»: la resta es la que el obligado puede sostener con
            documentos si la autoridad pregunta.
          </p>
        </div>

        {!puedeEvaluar && (
          <div className="aviso" style={{ marginBottom: '1.5rem' }}>
            <strong>Todavía no se puede evaluar la entidad, y no es un error.</strong>
            <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
              Falta configuración que el obligado declara — VIZO no la rellena por él (ADR-21):
            </p>
            <ul className="pequeno" style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
              {estado.faltaParaEvaluar.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="pequeno tenue" style={{ margin: '.5rem 0 0' }}>
              La metodología se configura en{' '}
              <Link href="/configuracion" className="nombre-cliente">
                Configuración → Modelo de riesgo
              </Link>
              ; la escala de efectividad y los mitigantes se declaran sobre el borrador durante
              el arranque asistido (runbook de alta).
            </p>
          </div>
        )}

        {puedeEvaluar && (
          <div className="tarjeta" style={{ marginBottom: '1.5rem' }}>
            {perfil.rol === 'admin' ? (
              <FormularioEvaluarEntidad reevaluacion={estado.vigente !== null} />
            ) : (
              <p className="pequeno tenue" style={{ margin: 0 }}>
                Solo un administrador registra la evaluación de entidad: es la fila de la que
                depende la auditoría del obligado.
              </p>
            )}
          </div>
        )}

        {estado.modeloVigenteId !== null && (
          <>
            <h2>Con qué se evalúa</h2>
            <p className="sub" style={{ maxWidth: '46rem' }}>
              Todo lo de abajo lo declaró el obligado en su metodología v
              {estado.modeloVersion ?? '—'}, y quedó congelado con ella. Cambiarlo es aprobar una
              versión nueva, nunca editar esta.
            </p>

            <div className="rejilla" style={{ marginBottom: '1.2rem' }}>
              <div className="tarjeta">
                <span className="tenue pequeno">Método de entidad</span>
                <div className="mono" style={{ fontWeight: 620, marginTop: '.2rem' }}>
                  {estado.metodoEntidad ?? '— sin declarar —'}
                </div>
              </div>
              <div className="tarjeta">
                <span className="tenue pequeno">Valor por elemento (Art. 10 Septies 1 fr. II)</span>
                <div style={{ marginTop: '.2rem' }}>
                  {elementos.map((el) => (
                    <span key={el} className="pequeno" style={{ marginRight: '.8rem' }}>
                      {el}{' '}
                      <span className="mono" style={{ fontWeight: 620 }}>
                        {estado.pesosPorElemento[el]}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <h3>Escala de efectividad</h3>
            <p className="sub" style={{ maxWidth: '46rem' }}>
              Ordinal y con evidencia exigible: un nivel que no se puede documentar no se puede
              declarar. Un nivel más alto nunca mitiga menos que uno más bajo — eso lo garantiza
              la base, no esta pantalla.
            </p>
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Nivel</th>
                    <th>Evidencia exigible</th>
                    <th>Mitiga hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.niveles.length === 0 ? (
                    <tr>
                      <td className="vacia" colSpan={3}>
                        El obligado todavía no declara su escala de efectividad.
                      </td>
                    </tr>
                  ) : (
                    estado.niveles.map((n) => (
                      <tr key={n.id}>
                        <td>
                          <span className="mono">{n.orden}</span> · {n.nombre}{' '}
                          <span className="pequeno tenue">({n.clave})</span>
                        </td>
                        <td className="pequeno">{n.evidenciaExigible}</td>
                        <td className="mono">{n.valor}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: '1.5rem' }}>Mitigantes declarados</h3>
            <div style={{ display: 'grid', gap: '.9rem' }}>
              {estado.mitigantes.length === 0 ? (
                <p className="tenue pequeno" style={{ margin: 0 }}>
                  El obligado todavía no declara mitigantes. Sin ellos, el residual ES el
                  inherente — que también es una evaluación válida.
                </p>
              ) : (
                estado.mitigantes.map((m) => (
                  <div
                    key={m.id}
                    className="tarjeta"
                    style={m.nivel === null ? { borderLeft: '3px solid var(--alerta)' } : {}}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: '.7rem',
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong>{m.descripcion}</strong>
                      {m.nivel === null ? (
                        <span className="estado aviso">sin nivel declarado</span>
                      ) : (
                        <span className="estado ok">
                          nivel {m.nivel.orden} · mitiga hasta {m.nivel.valor}
                        </span>
                      )}
                    </div>
                    <p className="pequeno" style={{ margin: '.4rem 0 0' }}>
                      {m.efecto}
                    </p>
                    <p className="pequeno tenue" style={{ margin: '.4rem 0 0' }}>
                      Cubre: {m.elementos.join(', ')}
                      {m.evidenciaRef !== null && <> · evidencia: {m.evidenciaRef}</>}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {estado.historico.length > 0 && (
          <>
            <h2 style={{ marginTop: '2rem' }}>Evaluaciones anteriores</h2>
            <p className="sub">
              El histórico no se reescribe: cada reevaluación es una fila nueva, y las anteriores
              son la evidencia de cómo se pensó en su momento.
            </p>
            <div style={{ display: 'grid', gap: '.9rem' }}>
              {estado.historico.map((h) => (
                <div key={h.id} className="tarjeta">
                  <FichaEvaluacion e={h} titulo="anterior" />
                </div>
              ))}
            </div>
          </>
        )}
      </Marco>
    )
  })
}
