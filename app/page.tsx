import Link from 'next/link'
import { conBase, leerComoUsuario } from '../src/supabase/conexion'
import { Marco } from './componentes/marco'
import { ChecklistDeArranque } from './componentes/arranque'
import { fraccionLegible } from './componentes/fraccion'
import { panoramaDePeriodos, type PeriodoPendiente } from '../src/persistencia/calendario'
import { arranqueDelObligado } from '../src/persistencia/arranque'
import { hoyEnMexico } from '../src/dominio/fechas'

/** «sábado 22 de agosto de 2026», para el kicker. */
function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(a!, m! - 1, d!)))
}
import { EstadoAviso, PlazoBadge, nombreDePeriodo } from './avisos/estados'
import { ReglaDelMes } from './componentes/regla-del-mes'
import { Chevron } from './componentes/iconos'

export const dynamic = 'force-dynamic'

/**
 * El semáforo de cumplimiento.
 *
 * Esta pantalla responde UNA pregunta: **¿estoy en regla hoy?**. Todo lo demás
 * del portal existe para trabajar; esta existe para tranquilizar o para
 * alarmar, y tiene que hacerlo en un vistazo.
 *
 * Por eso lo primero es el periodo más urgente, no un tablero de métricas. Un
 * obligado que abre VIZO el día 15 no quiere saber cuántas operaciones capturó:
 * quiere saber si le falta presentar algo y cuánto le queda.
 */

/** El más urgente: primero lo vencido, luego lo que vence antes. */
function elMasUrgente(pendientes: PeriodoPendiente[]): PeriodoPendiente | null {
  if (pendientes.length === 0) return null
  return [...pendientes].sort((a, b) => a.plazo.diasRestantes - b.plazo.diasRestantes)[0] ?? null
}

const TONO_FONDO: Record<string, { borde: string; fondo: string; tinta: string }> = {
  vencido: { borde: 'var(--critico)', fondo: 'var(--critico-suave)', tinta: 'var(--critico)' },
  vence_hoy: { borde: 'var(--critico)', fondo: 'var(--critico-suave)', tinta: 'var(--critico)' },
  por_vencer: { borde: 'var(--alerta)', fondo: 'var(--alerta-suave)', tinta: 'var(--alerta)' },
  holgado: { borde: 'var(--linea-fuerte)', fondo: 'var(--superficie)', tinta: 'var(--ok)' },
}

/**
 * El veredicto: una frase, no una etiqueta.
 *
 * Es la apuesta del rediseño y vale la pena decir por qué se sostiene. La
 * pregunta con la que alguien abre este portal es «¿estoy en regla hoy?», y un
 * chip que diga «VENCIDO» obliga a traducir: vencido *qué*, desde *cuándo*, y
 * si eso significa que estoy mal. Una oración lo contesta de una vez.
 *
 * SE DERIVA DEL ESTADO, NUNCA SE ESCRIBE A MANO. Cada rama sale de datos que
 * el motor ya calculó —el periodo más urgente y su plazo—, así que la frase no
 * puede decir algo que los chips de abajo contradigan.
 */
function veredicto(
  urgente: PeriodoPendiente | null,
  arranqueCompleto: boolean,
): { frase: string; tinta: string } {
  if (urgente === null) {
    return arranqueCompleto
      ? { frase: 'Hoy estás en regla.', tinta: 'var(--ok)' }
      : {
          frase: 'Aún no hay periodos que presentar.',
          tinta: 'var(--texto-tenue)',
        }
  }

  const mes = nombreDePeriodo(urgente.periodo).toLowerCase()
  const dias = urgente.plazo.diasRestantes

  if (urgente.plazo.estado === 'vencido') {
    return {
      frase: `Hoy no estás en regla: ${mes} quedó sin presentar.`,
      tinta: 'var(--critico)',
    }
  }
  if (urgente.plazo.estado === 'vence_hoy') {
    return { frase: `${nombreDePeriodo(urgente.periodo)} vence hoy.`, tinta: 'var(--critico)' }
  }
  if (urgente.plazo.estado === 'por_vencer') {
    return {
      frase: `Te quedan ${String(dias)} día(s) para presentar ${mes}.`,
      tinta: 'var(--alerta)',
    }
  }
  return {
    frase: `${nombreDePeriodo(urgente.periodo)} está pendiente, con plazo holgado.`,
    tinta: 'var(--texto)',
  }
}

export default async function Inicio() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const datos = await leerComoUsuario(db, sesion, async () => {
      const arranque = await arranqueDelObligado(db, { sesion })

      // La actividad sale del catálogo, incluido su nombre. Escribirlo en la
      // pantalla haría que un obligado de arrendamiento leyera "desarrollo
      // inmobiliario" en su propio portal.
      const act = await db.query(
        `select av.id::text, av.fraccion::text, av.nombre
           from actividades_tenant at
           join actividades_vulnerables av on av.id = at.actividad_id
          where at.tenant_id = $1
          order by av.fraccion limit 1`,
        [sesion.tenantId],
      )
      const actividad = act.rows[0] as { id: string; fraccion: string; nombre: string } | undefined
      const actividadId = actividad?.id

      const periodos =
        actividadId === undefined
          ? []
          : await panoramaDePeriodos(db, { sesion, actividadId, hoy: hoyEnMexico() })

      // El filtro por tenant va EXPLÍCITO además de RLS. Estas cuatro cuentas
      // se apoyaban solo en RLS, y `operaciones_vigentes` resultó ser una vista
      // sin `security_invoker`: evaluaba las políticas como su dueño, que se
      // las salta. Este número contaba las operaciones de todos los obligados.
      // La vista ya está corregida; la segunda capa se pone porque la primera
      // falló en silencio durante meses.
      const resumen = await db.query(
        `select
           (select count(*)::int from alertas
             where tenant_id = $2 and estado = 'abierta') as alertas,
           (select count(*)::int from avisos
             where tenant_id = $2 and estatus = 'listo_revision') as esperan_aprobacion,
           (select count(*)::int from clientes_finales
             where tenant_id = $2 and requiere_revision_identidad) as identidad_por_revisar,
           (select count(*)::int from operaciones_vigentes
             where tenant_id = $2
               and fecha_operacion >= date_trunc('month', $1::date)) as operaciones_del_mes,
           -- Art. 21: la revisión anual del expediente. Se avisa treinta días
           -- antes de que venza, no el día que vence: conseguir un comprobante
           -- de domicilio nuevo depende de un tercero.
           (select count(*)::int from expedientes_por_reverificar
             where tenant_id = $2
               and vence <= ($1::date + interval '30 days')) as revisiones_pendientes`,
        [hoyEnMexico(), sesion.tenantId],
      )

      return {
        arranque,
        actividad: actividad ?? null,
        periodos,
        resumen: resumen.rows[0] as {
          alertas: number
          esperan_aprobacion: number
          identidad_por_revisar: number
          operaciones_del_mes: number
          revisiones_pendientes: number
        },
      }
    })

    const pendientes = datos.periodos.filter((p) => p.estatusAviso !== 'presentado')
    const urgente = elMasUrgente(pendientes)
    const tono = TONO_FONDO[urgente?.plazo.estado ?? 'holgado'] ?? TONO_FONDO['holgado']

    // Cada renglón: cuántos, qué, y de dónde sale. El número va aparte del
    // texto porque en el rediseño se lee primero — es lo que dice si esto
    // urge— y el pie dice de qué obligación viene.
    const atencion: Array<{
      n: number
      texto: string
      pie: string
      tinta: string
      ruta: '/alertas' | '/avisos' | '/clientes'
    }> = []
    if (datos.resumen.esperan_aprobacion > 0) {
      atencion.push({
        n: datos.resumen.esperan_aprobacion,
        texto: 'aviso(s) esperando tu aprobación',
        pie: 'Generados y validados contra el XSD; falta la decisión humana.',
        tinta: 'var(--critico)',
        ruta: '/avisos',
      })
    }
    if (datos.resumen.alertas > 0) {
      atencion.push({
        n: datos.resumen.alertas,
        texto: 'alerta(s) del motor sin revisar',
        pie: 'Una alerta no es un aviso: es lo que alguien tiene que mirar.',
        tinta: 'var(--alerta)',
        ruta: '/alertas',
      })
    }
    if (datos.resumen.identidad_por_revisar > 0) {
      atencion.push({
        n: datos.resumen.identidad_por_revisar,
        texto: 'cliente(s) sin RFC ni CURP',
        pie: 'La acumulación del Art. 19 no puede resolver su identidad.',
        tinta: 'var(--alerta)',
        ruta: '/clientes',
      })
    }
    if (datos.resumen.revisiones_pendientes > 0) {
      atencion.push({
        n: datos.resumen.revisiones_pendientes,
        texto: 'expediente(s) con revisión anual por vencer',
        pie: 'Art. 21 · solo aplica a clientes con Relación de negocios.',
        tinta: 'var(--alerta)',
        ruta: '/clientes',
      })
    }

    const v = veredicto(urgente, datos.arranque.completo)
    const hoy = hoyEnMexico()

    return (
      <Marco obligado={obligado} perfil={perfil} alertasAbiertas={datos.resumen.alertas}>
        <p className="kicker">{fechaLarga(hoy)}</p>
        <h1>{obligado.razonSocial}</h1>
        <p className="sub">
          {datos.actividad === null ? (
            'Sin actividad vulnerable contratada'
          ) : (
            <>
              Fracción {fraccionLegible(datos.actividad.fraccion)} · {datos.actividad.nombre}
            </>
          )}
        </p>

        {/* ── La tarjeta que contesta la pregunta ─────────────────────── */}
        {/* Solo si HAY pregunta que contestar. Sin actividad contratada no
            existe obligación que calcular, y una tarjeta tranquilizadora sobre
            un obligado del que no se sabe nada es la peor mentira que este
            producto puede contar. */}
        {datos.arranque.puedeEvaluar && (
          <>
          <p className="veredicto" style={{ color: v.tinta }}>
            {v.frase}
          </p>
          <div
            className="tarjeta"
            style={{
              borderColor: tono?.borde,
              background: tono?.fondo,
              borderWidth: '1.5px',
            }}
          >
            {urgente === null ? (
              <>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                  {datos.arranque.completo ? 'Todo presentado' : 'Sin periodos pendientes todavía'}
                </h2>
                <p className="pequeno" style={{ margin: '.4rem 0 0' }}>
                  {datos.arranque.completo
                    ? 'No hay periodos cerrados pendientes de presentar.'
                    : 'No hay periodos cerrados pendientes, pero la cuenta aún está en arranque: mientras falten pasos, esto no equivale a estar al corriente.'}
                </p>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '.7rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      textTransform: 'capitalize',
                    }}
                  >
                    {nombreDePeriodo(urgente.periodo)}
                  </h2>
                  <PlazoBadge
                    estado={urgente.plazo.estado}
                    diasRestantes={urgente.plazo.diasRestantes}
                    fechaLimite={urgente.plazo.fechaLimite}
                  />
                  <EstadoAviso estatus={urgente.estatusAviso} />
                </div>
                <p className="pequeno" style={{ margin: '.6rem 0 1rem' }}>
                  {urgente.operacionesReportables === 0
                    ? 'Sin operaciones reportables: corresponde un informe en cero, que es una obligación por sí misma.'
                    : `${String(urgente.operacionesReportables)} operación(es) reportable(s). Fecha límite ${urgente.plazo.fechaLimite}.`}
                  {pendientes.length > 1 &&
                    ` Hay ${String(pendientes.length - 1)} periodo(s) más pendiente(s).`}
                </p>
                <ReglaDelMes
                  hoy={hoy}
                  fechaLimite={urgente.plazo.fechaLimite}
                  tinta={tono?.tinta ?? 'var(--texto)'}
                />

                <div style={{ display: 'flex', gap: '.7rem', marginTop: '1.3rem' }}>
                  <Link href="/avisos" className="boton">
                    Ir a avisos
                  </Link>
                  <Link href="/calendario" className="boton secundario">
                    Ver el calendario del periodo
                  </Link>
                </div>
              </>
            )}
          </div>
          </>
        )}

        {/* ── El arranque, mientras falte algo ─────────────────────────── */}
        {/* Desaparece solo cuando la cuenta cerró su primer periodo. Un
            checklist que se queda para siempre en la pantalla principal deja
            de leerse a la tercera semana. */}
        {!datos.arranque.completo && <ChecklistDeArranque arranque={datos.arranque} />}

        {/* ── Lo que pide una acción ──────────────────────────────────── */}
        <h2>Requiere tu atención</h2>
        <p className="sub" style={{ margin: '0 0 .8rem' }}>
          Cada renglón lleva a la acción que lo cierra. Lo que no está aquí, no está pendiente.
        </p>
        {atencion.length === 0 ? (
          <div className="tarjeta">
            <p className="tenue" style={{ margin: 0 }}>
              Nada pendiente de revisar.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {atencion.map((a) => (
              // Cada renglón lleva a la ACCIÓN, no a un reporte: si algo pide
              // atención, el clic tiene que resolverlo.
              <Link
                key={a.texto}
                href={a.ruta}
                className="fila-atencion"
                style={{ borderLeftColor: a.tinta }}
              >
                <span className="cuenta" style={{ color: a.tinta }}>
                  {a.n}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block' }}>{a.texto}</span>
                  <span className="pie">{a.pie}</span>
                </span>
                <span className="chevron">
                  <Chevron />
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* ── El mes en números ───────────────────────────────────────── */}
        <h2>Este mes</h2>
        <div className="rejilla">
          <div className="tarjeta elevable">
            <span className="tenue pequeno">Operaciones capturadas</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 620 }} className="num">
              {datos.resumen.operaciones_del_mes}
            </div>
          </div>
          <div className="tarjeta elevable">
            <span className="tenue pequeno">Periodos pendientes</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 620 }} className="num">
              {pendientes.length}
            </div>
          </div>
          <div className="tarjeta elevable">
            <span className="tenue pequeno">Alertas abiertas</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 620 }} className="num">
              {datos.resumen.alertas}
            </div>
          </div>
        </div>
      </Marco>
    )
  })
}
