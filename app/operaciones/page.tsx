import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../componentes/marco'
import { EtiquetaVeredicto, VeredictoExplicable } from '../componentes/veredicto'
import { veredictosDeOperaciones, type Veredicto } from '../../src/persistencia/veredicto'
import { formatearPesosTexto as pesos } from '../../src/dominio/dinero'

export const dynamic = 'force-dynamic'

interface Fila {
  id: string
  fecha_operacion: string
  monto_base: string
  monto_total: string
  forma_pago: string
  cliente: string
  sucursal: string
  resultado_aviso: string | null
  alerta_proximidad: boolean | null
  registrado_en: string
}

export default async function Operaciones() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const { filas, veredictos, abiertas } = await leerComoUsuario(db, sesion, async () => {
      // Se lee de `operaciones_vigentes`: las corregidas siguen en la tabla
      // —nada se borra— pero no son las que cuentan.
      //
      // La evaluación se trae con un lateral que toma la MÁS RECIENTE: la
      // tabla es append-only y una operación puede haberse reevaluado porque
      // cambió el catálogo. Mostrar la vieja diría algo que ya no es cierto.
      const r = await db.query(
        `select o.id, o.fecha_operacion::text, o.monto_base::text, o.monto_total::text,
                o.forma_pago, o.registrado_en::text,
                c.nombre_o_razon_social as cliente,
                s.nombre as sucursal,
                e.resultado_aviso::text, e.alerta_proximidad
           from operaciones_vigentes o
           join clientes_finales c on c.tenant_id = o.tenant_id and c.id = o.cliente_id
           join sucursales s on s.tenant_id = o.tenant_id and s.id = o.sucursal_id
           left join lateral (
             select resultado_aviso, alerta_proximidad
               from evaluaciones_umbral ev
              where ev.operacion_id = o.id
              order by ev.evaluado_en desc
              limit 1
           ) e on true
          -- Explícito además de RLS. Esta lista se salvó por accidente de la
          -- fuga de la vista —los joins contra tablas que sí aplican RLS
          -- descartaban las filas ajenas—, y salvarse por accidente no es
          -- salvarse.
          where o.tenant_id = $1
          order by o.fecha_operacion desc, o.registrado_en desc`,
        [sesion.tenantId],
      )
      const a = await db.query(
        `select count(*)::int as n from alertas where tenant_id = $1 and estado = 'abierta'`,
        [sesion.tenantId],
      )
      const operaciones = r.rows as Fila[]
      // El veredicto completo, con sus insumos. NO se recalcula nada aquí: se
      // lee lo que el motor registró al evaluar.
      const veredictos = await veredictosDeOperaciones(db, {
        sesion,
        operacionIds: operaciones.map((o) => o.id),
      })
      return {
        filas: operaciones,
        veredictos,
        abiertas: (a.rows[0] as { n: number }).n,
      }
    })

    return (
      <Marco obligado={obligado} perfil={perfil} alertasAbiertas={abiertas}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Operaciones</h1>
            <p className="sub">
              Cada operación se evalúa al registrarse. Las corregidas dejan de aparecer aquí, pero
              no se borran.
            </p>
          </div>
          <Link href="/operaciones/nueva">
            <button type="button">Registrar operación</button>
          </Link>
        </div>

        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Aportante</th>
              <th>Sucursal</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td className="vacia" colSpan={5}>
                  Todavía no hay operaciones registradas.
                </td>
              </tr>
            ) : (
              filas.map((f) => {
                const veredicto: Veredicto | undefined = veredictos.get(f.id)
                return (
                <tr key={f.id}>
                  <td>{f.fecha_operacion}</td>
                  <td>{f.cliente}</td>
                  <td>{f.sucursal}</td>
                  <td style={{ textAlign: 'right' }}>
                    {pesos(f.monto_base)}
                    {f.monto_total !== f.monto_base && (
                      <div className="pista">total {pesos(f.monto_total)}</div>
                    )}
                  </td>
                  <td>
                    {veredicto === undefined ? (
                      // No debería pasar: operación y evaluación se escriben en
                      // la misma transacción. Si aparece, es un dato que hay que
                      // mirar, no un hueco que disimular.
                      <span className="chip chip-alerta">sin evaluar</span>
                    ) : (
                      <>
                        <EtiquetaVeredicto v={veredicto} />
                        {veredicto.alertaProximidad && (
                          <span className="chip">cerca del umbral</span>
                        )}
                        <VeredictoExplicable v={veredicto} />
                      </>
                    )}
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Marco>
    )
  })
}
