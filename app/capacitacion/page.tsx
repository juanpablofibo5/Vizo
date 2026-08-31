import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import {
  estadoDeCapacitacion,
  plazosDeCapacitacion,
  type EstadoDeCapacitacion,
} from '../../src/persistencia/capacitacion'
import { NOMBRE_DEL_ROL, NOMBRE_DEL_TEMA } from '../../src/dominio/capacitacion'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { Marco } from '../componentes/marco'
import {
  FormularioBaja,
  FormularioEvaluar,
  FormularioPersona,
  FormularioSesion,
} from './formularios'

export const dynamic = 'force-dynamic'

/**
 * La capacitación anual del Cap. XII.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA TIENE QUE LOGRAR
 * ────────────────────────────────────────────────────────────────────────────
 * Que en cualquier día del año se pueda contestar «¿quién me falta?» sin
 * abrir una hoja de cálculo. VIZO no imparte la capacitación —la fr. III pide
 * cinco años de experiencia en la materia a quien la imparta, y eso no es algo
 * que un sistema pueda ser—, así que lo único que puede aportar es el
 * seguimiento: qué tema no se ha cubierto, quién no tiene constancia y qué
 * instructor no acreditó.
 *
 * Vive en Cumplimiento y no en Configuración por el mismo criterio que el
 * riesgo de la entidad: capacitar es un acto PERIÓDICO del obligado, no un
 * ajuste que se hace una vez. La plantilla se parece a un catálogo, pero lo
 * que se acredita es el periodo.
 *
 * Y una distinción que la pantalla separa a propósito: el ¶3 del Art. 39 Bis 1
 * —capacitación previa o simultánea al ingreso— es una obligación DISTINTA de
 * la anual. Mezclar las dos en un solo marcador dejaría a alguien que entró en
 * noviembre viéndose cubierto por un curso de marzo al que no fue.
 */

function Faltante({ children }: { children: React.ReactNode }) {
  return (
    <li className="pequeno" style={{ marginBottom: '.35rem' }}>
      {children}
    </li>
  )
}

function Resumen({ estado }: { estado: EstadoDeCapacitacion }) {
  const { cobertura } = estado

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.1rem' }}>
      <div>
        {/* En vista anticipada el tono es NEUTRO, no de alerta: el capítulo no
            es exigible todavía y pintar de ámbar un periodo que nadie está
            obligado a cubrir enseña a ignorar el color. */}
        <span
          className={
            estado.plazos.anticipado
              ? 'estado neutro'
              : cobertura.acreditado
                ? 'estado ok'
                : 'estado aviso'
          }
        >
          {estado.plazos.anticipado
            ? `El periodo ${String(estado.anio)} todavía no empieza`
            : cobertura.acreditado
              ? `El periodo ${String(estado.anio)} está cubierto`
              : `Al periodo ${String(estado.anio)} le falta`}
        </span>
        {!cobertura.huboAlgunaSesion && (
          <p className="pequeno tenue" style={{ margin: '.5rem 0 0' }}>
            Todavía no se ha registrado ninguna sesión del periodo.
          </p>
        )}
      </div>

      {!cobertura.acreditado && (
        <div className="rejilla" style={{ gap: '1.2rem' }}>
          <div>
            <div className="tenue pequeno" style={{ marginBottom: '.4rem' }}>
              Temas sin cubrir
            </div>
            {cobertura.temasFaltantes.length === 0 ? (
              <span className="estado ok">Los cinco están cubiertos</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.05rem' }}>
                {cobertura.temasFaltantes.map((t) => (
                  <Faltante key={t.tema}>
                    {t.comoLoDiceElArticulo} <span className="tenue">· {t.fundamento}</span>
                  </Faltante>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="tenue pequeno" style={{ marginBottom: '.4rem' }}>
              Personas sin constancia
            </div>
            {cobertura.personasEnElPeriodo === 0 ? (
              // Cero de cero no es cumplimiento: es que no había a quién medir.
              // Pintarlo verde sería el modo de falla de la regla dura 6 en la
              // pantalla — una afirmación plausible sobre datos que no hay. Y
              // se mira la plantilla DEL PERIODO, no el padrón: quien se dio de
              // baja el año pasado sigue en la tabla y no cuenta para este año.
              <span className="estado neutro">Nadie en la plantilla del periodo</span>
            ) : cobertura.personasFaltantes.length === 0 ? (
              <span className="estado ok">Toda la plantilla acredita</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.05rem' }}>
                {cobertura.personasFaltantes.map((p) => (
                  <Faltante key={p.personaId}>
                    {p.nombre} <span className="tenue">· {NOMBRE_DEL_ROL[p.rol]}</span>
                    <br />
                    <span className="tenue">
                      {p.motivo === 'sin_sesion'
                        ? 'no asistió a ninguna sesión'
                        : 'asistió, pero no tiene constancia'}
                    </span>
                  </Faltante>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="tenue pequeno" style={{ marginBottom: '.4rem' }}>
              Instructores sin acreditar
            </div>
            {!cobertura.huboAlgunaSesion ? (
              <span className="estado neutro">Nadie ha impartido todavía</span>
            ) : cobertura.instructoresSinAcreditar.length === 0 ? (
              <span className="estado ok">Todos acreditan la fr. III</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.05rem' }}>
                {cobertura.instructoresSinAcreditar.map((i) => (
                  <Faltante key={i.sesionId}>
                    {i.instructor} <span className="tenue">· {i.titulo}</span>
                    <br />
                    <span className="tenue">
                      {i.motivo === 'anios_insuficientes'
                        ? `declaró ${String(i.aniosDeclarados)} años y la fr. III pide ${String(
                            estado.plazos.experienciaMinimaAnios,
                          )}`
                        : 'no se cargó el documento que acredita la experiencia'}
                    </span>
                  </Faltante>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="pequeno tenue" style={{ margin: 0 }}>
        {estado.plazos.anticipado ? (
          <>
            <strong>Vista anticipada.</strong> El Cap. XII es exigible desde el{' '}
            {estado.plazos.exigibleDesde} (Transitorio Séptimo del Acuerdo 115/2026). Lo que se
            capture hoy queda asentado, pero el primer periodo que se acredita es 2027.
          </>
        ) : (
          <>
            El periodo es de {String(estado.plazos.periodicidadMeses)} meses y la constancia se
            conserva {String(estado.plazos.retencionAnios)} años (Art. 39 Bis 1 ¶1). VIZO no borra:
            la base lo impide.
          </>
        )}
      </p>
    </div>
  )
}

export default async function Capacitacion() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const hoy = hoyEnMexico()

    const estado = await leerComoUsuario(db, sesion, async () => {
      // El periodo es el año calendario y NO se elige desde un selector:
      // mientras solo se pueda tocar el periodo en curso, no hay forma de
      // asentar una sesión en el año equivocado desde la pantalla.
      //
      // Y antes del primer periodo se trabaja sobre el primero, que sale del
      // catálogo y no de un 2027 escrito aquí. Ofrecer 2026 sería ofrecer un
      // formulario que solo puede fallar: la base lo rechaza con
      // `anio_desde_el_primer_periodo` porque antes de esa fecha no hay
      // periodo que cumplir.
      const plazos = await plazosDeCapacitacion(db, hoy)
      const primerPeriodo = Number(plazos.exigibleDesde.slice(0, 4))
      const anio = Math.max(Number(hoy.slice(0, 4)), primerPeriodo)
      return estadoDeCapacitacion(db, { sesion, anio, hoy })
    })
    const anio = estado.anio
    const puede = perfil.rol === 'admin'

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Capacitación</h1>
        <p className="sub">
          Quién debe capacitarse en el periodo, qué se ha impartido y a quién le falta la
          constancia.
        </p>

        <Resumen estado={estado} />

        {/* El ¶3 va arriba de todo lo demás y separado: no espera al
            calendario del periodo, y quien está en esta lista lleva días
            operando sin haberse capacitado. */}
        {estado.ingresosPendientes.length > 0 && (
          <>
            <h2 id="ingresos">Ingresos sin capacitar</h2>
            {/* Antes del primer periodo esto NO es una alerta: nadie está
                incumpliendo todavía. Pintarlo ámbar durante meses enseñaría a
                ignorar el color justo antes de que empiece a significar algo. */}
            <div className={estado.plazos.anticipado ? 'tarjeta pequeno' : 'aviso'}>
              El Art. 39 Bis 1 ¶3 pide capacitar «de manera previa o simultánea» al ingreso al área
              de atención al público o de administración de recursos.{' '}
              {estado.plazos.anticipado
                ? 'Cuando el capítulo entre en vigor, estas personas ya llevarán tiempo en su área:'
                : 'Estas personas ya están en su área y todavía no acreditan:'}
              <ul style={{ margin: '.6rem 0 0', paddingLeft: '1.1rem' }}>
                {estado.ingresosPendientes.map((i) => (
                  <li key={i.personaId} className="pequeno">
                    <strong>{i.nombre}</strong>{' '}
                    <span className="tenue">
                      · {NOMBRE_DEL_ROL[i.rol]} · ingresó el {i.ingresoAlArea}, hace{' '}
                      {String(i.diasDesdeElIngreso)} días
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <h2 id="pendientes">Evaluaciones pendientes</h2>
        {estado.pendientesDeEvaluar.length === 0 ? (
          <p className="tenue pequeno">
            Ninguna asistencia sin evaluar. El ¶2 del Art. 39 Bis 1 ata la constancia a una
            evaluación satisfactoria, así que hasta aquí no queda nadie a medio camino.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {estado.pendientesDeEvaluar.map((a) => (
              <div key={a.asistenciaId} className="tarjeta">
                <div style={{ fontWeight: 560 }}>{a.personaNombre}</div>
                <div className="tenue pequeno" style={{ marginBottom: '.8rem' }}>
                  {a.sesionTitulo} · {a.sesionFecha}
                </div>
                <FormularioEvaluar asistenciaId={a.asistenciaId} puede={puede} />
              </div>
            ))}
          </div>
        )}

        <h2 id="sesiones">Sesiones del periodo</h2>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sesión</th>
                <th>Temas</th>
                <th>Impartió</th>
                <th>Asistencia</th>
              </tr>
            </thead>
            <tbody>
              {estado.sesiones.length === 0 ? (
                <tr>
                  <td className="vacia" colSpan={5}>
                    Ninguna sesión registrada en {anio}.
                  </td>
                </tr>
              ) : (
                estado.sesiones.map((s) => (
                  <tr key={s.id}>
                    <td className="mono pequeno">{s.fecha}</td>
                    <td>{s.titulo}</td>
                    <td className="pequeno">
                      {s.temas.map((t) => (
                        <div key={t}>{NOMBRE_DEL_TEMA[t]}</div>
                      ))}
                    </td>
                    <td className="pequeno">
                      {s.instructorNombre}
                      <br />
                      <span className="tenue">
                        {String(s.instructorAniosExperiencia)} años ·{' '}
                        {s.acreditaConDocumento ? (
                          <>acreditados con {s.instructorAcreditaArchivo ?? 'documento'}</>
                        ) : (
                          <span className="estado aviso">sin documento</span>
                        )}
                      </span>
                    </td>
                    <td
                      className="pequeno"
                      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                    >
                      {String(s.conConstancia.length)} de {String(s.asistentes.length)} con
                      constancia
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: '1.4rem' }}>Registrar una sesión</h3>
        {estado.plazos.anticipado ? (
          <p className="tenue pequeno">
            Todavía no. Se registra lo impartido, y la primera sesión que acredita algo es del
            periodo {anio}: una de {hoy.slice(0, 4)} no cubriría ningún periodo y la base la
            rechaza. Lo que sí conviene adelantar es la plantilla — de ella sale la lista de quién
            tiene que capacitarse.
          </p>
        ) : (
          <div className="tarjeta">
            <FormularioSesion
              anio={anio}
              hoy={hoy}
              plantilla={estado.plantilla}
              puede={puede}
            />
          </div>
        )}

        <h2 id="plantilla">Plantilla del periodo</h2>
        <p className="tenue pequeno" style={{ marginTop: '-.4rem' }}>
          Los nueve papeles del Art. 39 Bis ¶1. No es la lista de usuarios de VIZO: el consejo de
          administración tiene que capacitarse y normalmente no entra al portal.
        </p>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Papel</th>
                <th>Ingresó al área</th>
                <th>Baja del área</th>
              </tr>
            </thead>
            <tbody>
              {estado.plantilla.length === 0 ? (
                <tr>
                  <td className="vacia" colSpan={4}>
                    Nadie en la plantilla. Sin ella, VIZO no puede decir a quién le falta.
                  </td>
                </tr>
              ) : (
                estado.plantilla.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>{NOMBRE_DEL_ROL[p.rol]}</td>
                    <td className="mono pequeno">{p.ingresoAlArea}</td>
                    <td className="mono pequeno">
                      {p.bajaDelArea ?? <FormularioBaja personaId={p.id} hoy={hoy} puede={puede} />}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: '1.4rem' }}>Agregar a la plantilla</h3>
        <div className="tarjeta">
          <FormularioPersona puede={puede} />
        </div>

        {!puede && (
          <p className="tenue pequeno" style={{ marginTop: '1rem' }}>
            Solo un administrador registra sesiones y evaluaciones.
          </p>
        )}
      </Marco>
    )
  })
}
