import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../operaciones/marco'
import { formatearPesosTexto } from '../../src/dominio/dinero'

export const dynamic = 'force-dynamic'

interface FilaAlerta {
  id: string
  tipo: string
  titulo: string
  detalle: Record<string, unknown>
  created_at: string
  cliente: string | null
  fecha_operacion: string | null
  monto_base: string | null
}

const ORDEN: Record<string, number> = {
  aviso_requerido: 0,
  revision_identidad: 1,
  proximidad: 2,
}

export default async function Alertas() {
  return conBase(async ({ db, sesion, perfil }) => {
    const filas = await leerComoUsuario(db, sesion, async () => {
      // El nombre del aportante se trae AQUÍ, por join y bajo RLS — no vive en
      // la alerta. Así el panel es legible sin que la tabla de alertas guarde
      // datos personales (regla dura 3).
      const r = await db.query(
        `select a.id, a.tipo::text, a.titulo, a.detalle, a.created_at::text,
                c.nombre_o_razon_social as cliente,
                o.fecha_operacion::text, o.monto_base::text
           from alertas a
           left join evaluaciones_umbral e on e.id = a.evaluacion_id
           left join operaciones o on o.id = e.operacion_id
           left join clientes_finales c on c.id = o.cliente_id
          where a.estado = 'abierta'
          order by a.created_at desc`,
      )
      return r.rows as FilaAlerta[]
    })

    const ordenadas = [...filas].sort(
      (a, b) => (ORDEN[a.tipo] ?? 9) - (ORDEN[b.tipo] ?? 9),
    )

    return (
      <Marco nombre={perfil.nombre} rol={perfil.rol} alertasAbiertas={filas.length}>
        <h1>Alertas abiertas</h1>
        <p className="sub">
          Una alerta no es un aviso: es lo que alguien tiene que mirar. VIZO nunca presenta nada
          al SPPLD por su cuenta.
        </p>

        {ordenadas.length === 0 ? (
          <p className="vacia">
            No hay alertas abiertas. Cada operación registrada se evalúa; si ninguna cruzó un
            umbral, no hay nada pendiente.
          </p>
        ) : (
          ordenadas.map((a) => (
            <div key={a.id} className={a.tipo === 'proximidad' ? 'tarjeta' : 'tarjeta tarjeta-alerta'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <strong>{a.titulo}</strong>
                <span className="chip">{a.tipo.replace(/_/g, ' ')}</span>
              </div>

              <p style={{ margin: '.5rem 0' }}>{String(a.detalle['motivo'] ?? '')}</p>

              {a.cliente !== null && (
                <p className="sub" style={{ margin: 0 }}>
                  {a.cliente} · operación del {a.fecha_operacion}
                  {a.monto_base !== null && ` · ${formatearPesosTexto(a.monto_base)}`}
                </p>
              )}

              {a.detalle['suma_ventana'] !== undefined && (
                <p className="sub" style={{ margin: '.25rem 0 0' }}>
                  Suma de la ventana:{' '}
                  <strong>{formatearPesosTexto(String(a.detalle['suma_ventana']))}</strong> en{' '}
                  {String(a.detalle['operaciones_en_ventana'])} operaciones de{' '}
                  {String(a.detalle['ventana_meses'])} meses.
                </p>
              )}
            </div>
          ))
        )}
      </Marco>
    )
  })
}
