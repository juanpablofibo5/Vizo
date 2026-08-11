import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../componentes/marco'
import { panoramaDePeriodos } from '../../src/persistencia/calendario'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { EstadoAviso, PlazoBadge, nombreDePeriodo } from './estados'
import { BotonGenerar } from './formularios'

export const dynamic = 'force-dynamic'

/**
 * Los periodos y su estado ante la autoridad.
 *
 * Se listan TODOS los meses cerrados desde la primera operación, no solo los
 * que tienen aviso. Un mes sin generar es la información más importante de
 * esta pantalla: el informe en cero es una obligación por sí misma, y no
 * presentarlo se sanciona igual que omitir un aviso. Una lista que solo
 * mostrara lo generado escondería precisamente lo que falta.
 */
export default async function Avisos() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const { periodos, actividadId } = await leerComoUsuario(db, sesion, async () => {
      const act = await db.query(
        `select av.id::text
           from actividades_tenant at
           join actividades_vulnerables av on av.id = at.actividad_id
          where at.tenant_id = $1
          limit 1`,
        [sesion.tenantId],
      )
      const id = (act.rows[0] as { id: string } | undefined)?.id
      if (id === undefined) return { periodos: [], actividadId: null }

      return {
        actividadId: id,
        periodos: await panoramaDePeriodos(db, {
          sesion,
          actividadId: id,
          hoy: hoyEnMexico(),
        }),
      }
    })

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Avisos</h1>
        <p className="sub">
          Cada mes cerrado es una obligación. Sin operaciones reportables se presenta un{' '}
          <strong>informe en cero</strong>, que no es la ausencia de un aviso sino un aviso
          por sí mismo.
        </p>

        {actividadId === null ? (
          <div className="aviso">
            Este obligado no tiene ninguna actividad vulnerable contratada, así que todavía
            no hay periodos que reportar.
          </div>
        ) : periodos.length === 0 ? (
          <div className="tarjeta">
            <p className="tenue" style={{ margin: 0 }}>
              Todavía no hay meses cerrados con actividad. La serie empieza en la primera
              operación registrada.
            </p>
          </div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Estado</th>
                  <th>Plazo</th>
                  <th className="num">Reportables</th>
                  <th>Archivos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {/* Más reciente arriba: el periodo en curso es el que se
                    consulta a diario. La consulta los devuelve en orden
                    cronológico porque para "lo que falta" el más viejo es el
                    más urgente; invertir para pintar es cosa de la pantalla. */}
                {[...periodos].reverse().map((p) => (
                  <tr key={p.periodo}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 550 }}>
                      {nombreDePeriodo(p.periodo)}
                    </td>
                    <td>
                      <EstadoAviso estatus={p.estatusAviso} />
                      {p.tipoAviso === 'cero' && <span className="chip">en cero</span>}
                    </td>
                    <td>
                      {p.estatusAviso === 'presentado' ? (
                        <span className="tenue pequeno">—</span>
                      ) : (
                        <PlazoBadge
                          estado={p.plazo.estado}
                          diasRestantes={p.plazo.diasRestantes}
                          fechaLimite={p.plazo.fechaLimite}
                        />
                      )}
                    </td>
                    <td className="num">{p.operacionesReportables}</td>
                    <td className="tenue pequeno">
                      {p.fragmentos === null
                        ? '—'
                        : p.fragmentos === 1
                          ? '1 archivo'
                          : `${String(p.fragmentos)} lotes`}
                    </td>
                    <td>
                      {p.avisoId === null ? (
                        <BotonGenerar
                          periodo={p.periodo}
                          actividadId={actividadId}
                          puede={perfil.rol === 'admin'}
                        />
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
      </Marco>
    )
  })
}
