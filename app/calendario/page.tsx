import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../componentes/marco'
import { panoramaDePeriodos } from '../../src/persistencia/calendario'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { EstadoAviso, PlazoBadge, nombreDePeriodo } from '../avisos/estados'

export const dynamic = 'force-dynamic'

/**
 * El calendario de obligaciones.
 *
 * La misma información que la pantalla de avisos, ordenada por la pregunta
 * contraria: avisos responde "¿qué hago con este periodo?", calendario responde
 * "¿qué se me viene encima?". Por eso aquí manda el plazo y no el estado, y lo
 * vencido va primero.
 */
export default async function Calendario() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const datos = await leerComoUsuario(db, sesion, async () => {
      const act = await db.query(
        `select av.id::text
           from actividades_tenant at
           join actividades_vulnerables av on av.id = at.actividad_id
          where at.tenant_id = $1 limit 1`,
        [sesion.tenantId],
      )
      const actividadId = (act.rows[0] as { id: string } | undefined)?.id

      const t = await db.query(`select fecha_alta_autoridad::text from tenants where id = $1`, [
        sesion.tenantId,
      ])

      return {
        fechaAlta:
          (t.rows[0] as { fecha_alta_autoridad: string | null } | undefined)
            ?.fecha_alta_autoridad ?? null,
        periodos:
          actividadId === undefined
            ? []
            : await panoramaDePeriodos(db, { sesion, actividadId, hoy: hoyEnMexico() }),
      }
    })

    // Primero lo que menos tiempo queda: vencido, hoy, y luego por cercanía.
    const pendientes = [...datos.periodos]
      .filter((p) => p.estatusAviso !== 'presentado')
      .sort((a, b) => a.plazo.diasRestantes - b.plazo.diasRestantes)

    const presentados = datos.periodos.filter((p) => p.estatusAviso === 'presentado')

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Calendario de obligaciones</h1>
        <p className="sub">
          El aviso de cada mes vence el <strong>día 17 del mes siguiente</strong>. La alerta
          empieza el día 10.
        </p>

        {datos.fechaAlta === null ? (
          <div className="aviso" style={{ marginBottom: '1.2rem' }}>
            No está registrada la fecha de alta ante la autoridad, así que este calendario
            arranca en la primera operación capturada — y puede estar dejando fuera meses que
            ya debían informe en cero.{' '}
            <Link href="/configuracion">Registrar la fecha de alta</Link>.
          </div>
        ) : (
          <p className="pequeno tenue" style={{ marginTop: '-1rem', marginBottom: '1.2rem' }}>
            La obligación corre desde el alta ante la autoridad:{' '}
            <span className="mono">{datos.fechaAlta}</span>.
          </p>
        )}

        <h2>Pendientes</h2>
        {pendientes.length === 0 ? (
          <div className="tarjeta">
            <p className="tenue" style={{ margin: 0 }}>
              Nada pendiente. Todos los periodos cerrados están presentados.
            </p>
          </div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Vence</th>
                  <th>Plazo</th>
                  <th>Estado</th>
                  <th className="num">Reportables</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.periodo}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 550 }}>
                      {nombreDePeriodo(p.periodo)}
                    </td>
                    <td className="mono pequeno">{p.plazo.fechaLimite}</td>
                    <td>
                      <PlazoBadge
                        estado={p.plazo.estado}
                        diasRestantes={p.plazo.diasRestantes}
                        fechaLimite={p.plazo.fechaLimite}
                      />
                    </td>
                    <td>
                      <EstadoAviso estatus={p.estatusAviso} />
                    </td>
                    <td className="num">
                      {p.operacionesReportables === 0 ? (
                        <span className="tenue pequeno">en cero</span>
                      ) : (
                        p.operacionesReportables
                      )}
                    </td>
                    <td>
                      {p.avisoId === null ? (
                        <Link href="/avisos">Generar</Link>
                      ) : (
                        <Link href={`/avisos/${p.avisoId}`}>Ver aviso</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {presentados.length > 0 && (
          <>
            <h2>Cumplidos</h2>
            <div className="tabla-envoltura">
              <table>
                <tbody>
                  {presentados.map((p) => (
                    <tr key={p.periodo}>
                      <td style={{ textTransform: 'capitalize' }}>{nombreDePeriodo(p.periodo)}</td>
                      <td>
                        <EstadoAviso estatus={p.estatusAviso} />
                      </td>
                      <td>
                        {p.avisoId !== null && (
                          <Link href={`/avisos/${p.avisoId}`}>Ver acuse</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Marco>
    )
  })
}
