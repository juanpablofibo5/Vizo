import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import {
  estadoDeAuditoria,
  plazosDeAuditoria,
  type AuditorDesignadoGuardado,
  type EstadoDeAuditoria,
  type PeriodoDeAuditoriaGuardado,
} from '../../src/persistencia/auditoria'
import {
  FUNDAMENTO_DE_LA_RUTA,
  NOMBRE_DEL_TIPO_DE_AUDITOR,
  NOMBRE_DE_LA_RUTA,
  type CoherenciaDeLaRuta,
} from '../../src/dominio/auditoria'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { Marco } from '../componentes/marco'
import { estadoDeCapacitacion } from '../../src/persistencia/capacitacion'
import type { RolCapacitacion } from '../../src/dominio/capacitacion'
import { estadoDeLaEntidad, type EvaluacionDeEntidad } from '../../src/persistencia/entidad'
import {
  FormularioAbrirPeriodo,
  FormularioDesignarAuditorExterno,
  FormularioDesignarAuditorInterno,
  FormularioSustituirAuditor,
} from './formularios'

export const dynamic = 'force-dynamic'

/**
 * Cap. XIV — DE LA AUDITORÍA (Arts. 42-45, 50 ¶1). Fase 1: el periodo, la
 * ruta (interna o externa) y quién dictamina.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MISMO REPARTO QUE /capacitacion Y /entidad
 * ────────────────────────────────────────────────────────────────────────────
 * Esta pantalla no deriva la ruta, no calcula la fecha límite ni decide si un
 * requisito se cumple: todo eso ya lo resolvió `estadoDeAuditoria`
 * (src/persistencia/auditoria.ts) o, cuando todavía no hay periodo abierto,
 * `estadoDeLaEntidad` (src/persistencia/entidad.ts, la misma función que pinta
 * /entidad). Lo único que esta pantalla decide es CÓMO CONTARLO — qué botón
 * ofrecer y con qué tono — nunca EL HECHO.
 */

// ─────────────────────────────────────────────────────────────────────────
// El resumen
// ─────────────────────────────────────────────────────────────────────────

function Resumen({ estado }: { estado: EstadoDeAuditoria }) {
  const abierto = estado.periodo !== null
  const conAuditor = estado.auditorVigente !== null

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '.7rem' }}>
      <span
        className={
          estado.plazos.anticipado
            ? 'estado neutro'
            : abierto && conAuditor
              ? 'estado ok'
              : 'estado aviso'
        }
      >
        {estado.plazos.anticipado
          ? `El periodo ${String(estado.anio)} todavía no es exigible`
          : !abierto
            ? `El periodo ${String(estado.anio)} no se ha abierto`
            : conAuditor
              ? `El periodo ${String(estado.anio)} tiene auditor designado`
              : `Al periodo ${String(estado.anio)} le falta designar auditor`}
      </span>

      <p className="pequeno tenue" style={{ margin: 0, maxWidth: '46rem' }}>
        {estado.plazos.anticipado ? (
          <>
            <strong>Vista anticipada.</strong> El Transitorio Octavo fija el primer periodo de
            revisión de auditoría en {String(estado.plazos.primerPeriodoAnio)}: antes de esa fecha
            el Cap. XIV todavía no es exigible, aunque el año del primer periodo ya se puede
            consultar.
          </>
        ) : (
          <>
            Cada año, quien realiza la Actividad Vulnerable mantiene la revisión de un auditor —de
            su área de auditoría interna, o de una persona auditora externa independiente— que
            dictamina la efectividad del cumplimiento (Art. 42).
          </>
        )}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sin periodo abierto
// ─────────────────────────────────────────────────────────────────────────

function SeccionSinPeriodo({
  estado,
  entidadVigente,
  puede,
}: {
  estado: EstadoDeAuditoria
  entidadVigente: EvaluacionDeEntidad | null
  puede: boolean
}) {
  if (estado.plazos.anticipado) {
    return (
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Todavía no. El primer periodo de revisión de auditoría abre hasta el{' '}
        {String(estado.plazos.primerPeriodoAnio)}-01-01 (Transitorio Octavo): antes de esa fecha
        no hay periodo que abrir. Lo que sí conviene adelantar es la evaluación de entidad y la
        capacitación del Cap. XII — de ahí sale quién puede dictaminar cuando el periodo abra.
      </p>
    )
  }

  if (entidadVigente === null) {
    return (
      <div className="aviso">
        <strong>Falta la evaluación de entidad.</strong>
        <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
          Los Arts. 44 y 45 deciden la ruta —interna o externa— según el grado de Riesgo de la
          entidad, y este obligado todavía no tiene ninguna evaluación corrida. Primero se corre
          la evaluación; con ella resuelta se puede abrir el periodo.
        </p>
        <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
          <Link href="/entidad" className="nombre-cliente">
            Ir a Riesgo de la entidad
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '.9rem' }}>
      <p className="pequeno" style={{ margin: 0, maxWidth: '44rem' }}>
        Con la evaluación de entidad vigente del {entidadVigente.evaluadoEn.slice(0, 10)}, a este
        obligado le tocaría <strong>{NOMBRE_DE_LA_RUTA[entidadVigente.auditoria]}</strong> (
        {FUNDAMENTO_DE_LA_RUTA}). La ruta se congela contra esa evaluación en el momento de abrir
        el periodo.
      </p>
      <FormularioAbrirPeriodo anio={estado.anio} puede={puede} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// El periodo abierto
// ─────────────────────────────────────────────────────────────────────────

function SeccionPeriodo({ periodo }: { periodo: PeriodoDeAuditoriaGuardado }) {
  return (
    <div className="tarjeta">
      <div className="rejilla" style={{ gap: '1rem' }}>
        <div>
          <span className="tenue pequeno">Periodo</span>
          <div className="mono" style={{ fontWeight: 600, marginTop: '.2rem' }}>
            {periodo.inicio} — {periodo.fin}
          </div>
          {periodo.esPrimerPeriodoDeOperaciones && (
            <p className="pequeno tenue" style={{ margin: '.4rem 0 0' }}>
              Primer periodo de operaciones del obligado (Art. 43): por eso no cierra en un año,
              sino hasta el 31 de diciembre del siguiente.
            </p>
          )}
        </div>

        <div>
          <span className="tenue pequeno">Ruta</span>
          <div style={{ fontWeight: 600, marginTop: '.2rem' }}>
            {NOMBRE_DE_LA_RUTA[periodo.ruta]}
          </div>
          <p className="pequeno tenue" style={{ margin: '.4rem 0 0' }}>{FUNDAMENTO_DE_LA_RUTA}</p>
        </div>

        <div>
          <span className="tenue pequeno">Entrega a más tardar</span>
          <div className="mono" style={{ fontWeight: 600, marginTop: '.2rem' }}>
            {periodo.fechaLimiteEntrega}
          </div>
          <p className="pequeno tenue" style={{ margin: '.4rem 0 0' }}>Art. 50 ¶1</p>
        </div>
      </div>

      {!periodo.limiteConCalendario && (
        <p className="pequeno" style={{ margin: '.9rem 0 0' }}>
          <span className="estado aviso">sin confirmar contra el calendario oficial</span>{' '}
          <span className="tenue">
            — el calendario de días inhábiles de ese año todavía no está cargado. El último día
            hábil real podría caer antes de esta fecha, nunca después.
          </span>
        </p>
      )}

      {periodo.advertencia !== null && (
        <p className="pequeno" style={{ margin: '.9rem 0 0' }}>
          <span className="estado aviso">lo que no se sabía al abrirlo</span>{' '}
          <span className="tenue">— {periodo.advertencia}</span>
        </p>
      )}
    </div>
  )
}

function SeccionCoherencia({
  coherencia,
}: {
  coherencia: Extract<CoherenciaDeLaRuta, { estado: 'sobre_otra_evaluacion' }>
}) {
  return (
    <div className="aviso">
      <strong>Este periodo se fijó sobre otra evaluación de entidad.</strong>
      <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
        Desde que se abrió el periodo llegó una evaluación de entidad más reciente. La ruta
        congelada no se invalida —ni el Art. 44 ni el 45 dan ese verbo—, pero{' '}
        {coherencia.cambiaria ? (
          <>
            hoy, con la evaluación vigente, la ruta sería{' '}
            <strong>{NOMBRE_DE_LA_RUTA[coherencia.rutaHoy]}</strong>.
          </>
        ) : (
          'hoy, con la evaluación vigente, la ruta seguiría siendo la misma.'
        )}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// El auditor
// ─────────────────────────────────────────────────────────────────────────

function FichaAuditor({ a }: { a: AuditorDesignadoGuardado }) {
  const sustituido = a.sustituidoEn !== null

  return (
    <div className={sustituido ? 'tarjeta pequeno' : 'tarjeta tarjeta-ok'}>
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{a.tipo === 'interna' ? a.personaNombre : a.nombre}</strong>
        <span className="chip">{NOMBRE_DEL_TIPO_DE_AUDITOR[a.tipo]}</span>
      </div>

      {a.tipo === 'interna' ? (
        <div className="pequeno" style={{ marginTop: '.5rem', display: 'grid', gap: '.3rem' }}>
          <span>
            {a.esElRec === true ? (
              <span className="estado aviso">Hoy figura como la persona REC</span>
            ) : a.esElRec === false ? (
              <span className="estado ok">No es la persona REC</span>
            ) : (
              <span className="tenue">No se pudo verificar</span>
            )}{' '}
            <span className="tenue">· verificado por VIZO, Art. 44</span>
          </span>
          <span>
            {a.tieneConstanciaAcreditada === true ? (
              <span className="estado ok">Tiene constancia de capacitación acreditada</span>
            ) : a.tieneConstanciaAcreditada === false ? (
              <span className="estado aviso">Sin constancia de capacitación acreditada</span>
            ) : (
              <span className="tenue">No se pudo verificar</span>
            )}{' '}
            <span className="tenue">· verificado por VIZO, Art. 44</span>
          </span>
        </div>
      ) : (
        <div className="pequeno tenue" style={{ marginTop: '.5rem' }}>
          {a.profesion} · cédula {a.cedulaProfesional} · {String(a.aniosExperiencia)} años de
          experiencia
          <br />
          Certificación UIF {a.certificacionUifFolio}, vigente hasta {a.certificacionUifVence}
        </div>
      )}

      <p className="pequeno tenue" style={{ margin: '.6rem 0 0' }}>
        Designado el {a.designadoEn.slice(0, 10)}
        {sustituido && (
          <>
            {' '}
            · sustituido el {a.sustituidoEn?.slice(0, 10)}: {a.motivoSustitucion}
          </>
        )}
      </p>
    </div>
  )
}

function SeccionAuditor({
  periodo,
  auditorVigente,
  plantilla,
  puede,
}: {
  periodo: PeriodoDeAuditoriaGuardado
  auditorVigente: AuditorDesignadoGuardado | null
  plantilla: readonly { id: string; nombre: string; rol: RolCapacitacion }[]
  puede: boolean
}) {
  if (auditorVigente !== null) {
    return (
      <div style={{ display: 'grid', gap: '.8rem' }}>
        <FichaAuditor a={auditorVigente} />
        <FormularioSustituirAuditor auditorId={auditorVigente.id} puede={puede} />
      </div>
    )
  }

  if (periodo.ruta === 'externa_obligatoria') {
    return (
      <div style={{ display: 'grid', gap: '.9rem' }}>
        <p className="pequeno tenue" style={{ margin: 0, maxWidth: '46rem' }}>
          El Riesgo de la entidad se evaluó como alto: el Art. 45 exige que la revisión la haga
          una persona auditora externa independiente, con certificación vigente de la UIF. Un
          auditor interno no aplica mientras esta ruta esté vigente.
        </p>
        <FormularioDesignarAuditorExterno periodoId={periodo.id} puede={puede} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      <p className="pequeno tenue" style={{ margin: 0, maxWidth: '46rem' }}>
        Con este grado de Riesgo, el Art. 44 permite que la revisión la haga el área de auditoría
        interna. Contratar una persona auditora externa siempre se puede elegir —«cuando lo elija
        quien realice la Actividad Vulnerable», Art. 45—; lo que esta ruta evita es que sea
        obligatorio.
      </p>
      <div className="rejilla" style={{ gap: '1.4rem' }}>
        <div className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Auditor interno</h3>
          <FormularioDesignarAuditorInterno
            periodoId={periodo.id}
            plantilla={plantilla}
            puede={puede}
          />
        </div>
        <div className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Persona auditora externa</h3>
          <FormularioDesignarAuditorExterno periodoId={periodo.id} puede={puede} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

export default async function Auditoria() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const hoy = hoyEnMexico()

    const estado = await leerComoUsuario(db, sesion, async () => {
      // El año no se elige desde un selector, igual que en /capacitacion: el
      // primero disponible sale del catálogo, y ofrecer uno anterior sería
      // ofrecer un formulario que solo puede fallar.
      const plazos = await plazosDeAuditoria(db, hoy)
      const anio = Math.max(Number(hoy.slice(0, 4)), plazos.primerPeriodoAnio)
      return estadoDeAuditoria(db, { sesion, anio, hoy })
    })

    const periodo = estado.periodo
    const puede = perfil.rol === 'admin'

    // Sin periodo abierto, la pantalla necesita saber CONTRA QUÉ se abriría:
    // `estadoDeAuditoria` solo expone la evaluación de entidad vigente por
    // dentro, para comparar coherencia — cuando no hay periodo, no la
    // devuelve. Se lee aparte con la misma función que ya usa /entidad: no
    // se recalcula la ruta aquí, se consume la que `estadoDeLaEntidad` ya
    // resolvió.
    const entidadVigente =
      periodo === null
        ? await leerComoUsuario(
            db,
            sesion,
            async () => (await estadoDeLaEntidad(db, { sesion, hoy })).vigente,
          )
        : null

    // El selector del auditor interno necesita la plantilla del Cap. XII.
    // No hay una consulta más ligera que la traiga sola: se reusa
    // `estadoDeCapacitacion` —mismo costo que ya paga /capacitacion— y solo
    // se toma `plantilla`, que no depende del año que se le pida.
    const necesitaPlantilla =
      periodo !== null && estado.auditorVigente === null && periodo.ruta !== 'externa_obligatoria'
    const plantilla = necesitaPlantilla
      ? await leerComoUsuario(
          db,
          sesion,
          async () => (await estadoDeCapacitacion(db, { sesion, anio: estado.anio, hoy })).plantilla,
        )
      : []

    const coherenciaAviso =
      estado.coherenciaDeLaRuta !== null && estado.coherenciaDeLaRuta.estado === 'sobre_otra_evaluacion'
        ? estado.coherenciaDeLaRuta
        : null

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Auditoría</h1>
        <p className="sub" style={{ maxWidth: '46rem' }}>
          El periodo de revisión, quién dictamina y cuándo vence la entrega (Cap. XIV, Arts. 42-45
          y 50 ¶1 del Acuerdo 115/2026).
        </p>

        <Resumen estado={estado} />

        <h2 id="periodo" style={{ marginTop: '1.6rem' }}>
          El periodo
        </h2>
        {periodo === null ? (
          <SeccionSinPeriodo estado={estado} entidadVigente={entidadVigente} puede={puede} />
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <SeccionPeriodo periodo={periodo} />
            {coherenciaAviso !== null && <SeccionCoherencia coherencia={coherenciaAviso} />}
          </div>
        )}

        {periodo !== null && (
          <>
            <h2 id="auditor" style={{ marginTop: '1.6rem' }}>
              El auditor
            </h2>
            <SeccionAuditor
              periodo={periodo}
              auditorVigente={estado.auditorVigente}
              plantilla={plantilla}
              puede={puede}
            />
          </>
        )}

        {periodo !== null && estado.historiaDeAuditores.length > 0 && (
          <>
            <h2 id="historia" style={{ marginTop: '1.6rem' }}>
              Historia de sustituciones
            </h2>
            <p className="tenue pequeno" style={{ marginTop: '-.4rem' }}>
              Un hecho no se borra, se sustituye: cada auditor sustituido queda aquí, con su
              motivo, del más antiguo al más reciente.
            </p>
            <div style={{ display: 'grid', gap: '.9rem' }}>
              {estado.historiaDeAuditores.map((a) => (
                <FichaAuditor key={a.id} a={a} />
              ))}
            </div>
          </>
        )}

        {!puede && (
          <p className="tenue pequeno" style={{ marginTop: '1.2rem' }}>
            Solo un administrador abre el periodo, designa al auditor o lo sustituye.
          </p>
        )}
      </Marco>
    )
  })
}
