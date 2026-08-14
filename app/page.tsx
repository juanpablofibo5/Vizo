import Link from 'next/link'
import { conBase, leerComoUsuario } from '../src/supabase/conexion'
import { Marco } from './componentes/marco'
import { ChecklistDeArranque } from './componentes/arranque'
import { fraccionLegible } from './componentes/fraccion'
import { panoramaDePeriodos, type PeriodoPendiente } from '../src/persistencia/calendario'
import { arranqueDelObligado } from '../src/persistencia/arranque'
import { hoyEnMexico } from '../src/dominio/fechas'
import { EstadoAviso, PlazoBadge, nombreDePeriodo } from './avisos/estados'

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

const TONO_FONDO: Record<string, { borde: string; fondo: string }> = {
  vencido: { borde: 'var(--critico)', fondo: 'var(--critico-suave)' },
  vence_hoy: { borde: 'var(--critico)', fondo: 'var(--critico-suave)' },
  por_vencer: { borde: 'var(--alerta)', fondo: 'var(--alerta-suave)' },
  holgado: { borde: 'var(--linea-fuerte)', fondo: 'var(--superficie)' },
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
               and fecha_operacion >= date_trunc('month', $1::date)) as operaciones_del_mes`,
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
        },
      }
    })

    const pendientes = datos.periodos.filter((p) => p.estatusAviso !== 'presentado')
    const urgente = elMasUrgente(pendientes)
    const tono = TONO_FONDO[urgente?.plazo.estado ?? 'holgado'] ?? TONO_FONDO['holgado']

    const atencion: Array<{ texto: string; ruta: '/alertas' | '/avisos' | '/clientes' }> = []
    if (datos.resumen.esperan_aprobacion > 0) {
      atencion.push({
        texto: `${String(datos.resumen.esperan_aprobacion)} aviso(s) esperando tu aprobación`,
        ruta: '/avisos',
      })
    }
    if (datos.resumen.alertas > 0) {
      atencion.push({
        texto: `${String(datos.resumen.alertas)} alerta(s) del motor sin revisar`,
        ruta: '/alertas',
      })
    }
    if (datos.resumen.identidad_por_revisar > 0) {
      atencion.push({
        texto: `${String(datos.resumen.identidad_por_revisar)} cliente(s) sin RFC ni CURP: la acumulación no puede resolverlos`,
        ruta: '/clientes',
      })
    }

    return (
      <Marco obligado={obligado} perfil={perfil} alertasAbiertas={datos.resumen.alertas}>
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
          <div
            className="tarjeta"
            style={{
              borderColor: tono?.borde,
              background: tono?.fondo,
              borderWidth: '1.5px',
              padding: '1.5rem 1.6rem',
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
                <Link href="/avisos" className="boton">
                  Ir a avisos
                </Link>
              </>
            )}
          </div>
        )}

        {/* ── El arranque, mientras falte algo ─────────────────────────── */}
        {/* Desaparece solo cuando la cuenta cerró su primer periodo. Un
            checklist que se queda para siempre en la pantalla principal deja
            de leerse a la tercera semana. */}
        {!datos.arranque.completo && <ChecklistDeArranque arranque={datos.arranque} />}

        {/* ── Lo que pide una acción ──────────────────────────────────── */}
        <h2>Requiere tu atención</h2>
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
                className="tarjeta tarjeta-alerta"
                style={{ textDecoration: 'none', color: 'inherit', padding: '.85rem 1rem' }}
              >
                {a.texto}
              </Link>
            ))}
          </div>
        )}

        {/* ── El mes en números ───────────────────────────────────────── */}
        <h2>Este mes</h2>
        <div className="rejilla">
          <div className="tarjeta">
            <span className="tenue pequeno">Operaciones capturadas</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 620 }} className="num">
              {datos.resumen.operaciones_del_mes}
            </div>
          </div>
          <div className="tarjeta">
            <span className="tenue pequeno">Periodos pendientes</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 620 }} className="num">
              {pendientes.length}
            </div>
          </div>
          <div className="tarjeta">
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
