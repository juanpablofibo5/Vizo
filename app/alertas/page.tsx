import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../componentes/marco'
import { formatearPesosTexto } from '../../src/dominio/dinero'
import { DesgloseDelVeredicto } from '../componentes/veredicto'
import { TarjetaDeAlerta } from './tarjeta'
import { veredictosDeOperaciones } from '../../src/persistencia/veredicto'

export const dynamic = 'force-dynamic'

interface FilaAlerta {
  id: string
  tipo: string
  titulo: string
  detalle: Record<string, unknown>
  created_at: string
  operacion_id: string | null
  cliente_id: string | null
  cliente: string | null
  fecha_operacion: string | null
  monto_base: string | null
}

const ORDEN: Record<string, number> = {
  // La aprobación del Art. 23 Ter 5 va arriba del aviso a propósito: el aviso
  // tiene plazo hasta el día 17 del mes siguiente; una operación con PEP de
  // grado alto sin consentimiento ya ocurrió y sigue sin firma.
  aprobacion_directivo_pendiente: 0,
  aviso_requerido: 1,
  revision_identidad: 2,
  desviacion_perfil: 3,
  perfil_ausente: 4,
  proximidad: 5,
}

export default async function Alertas() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const { alertas: filas, veredictos } = await leerComoUsuario(db, sesion, async () => {
      // El nombre del aportante se trae AQUÍ, por join y bajo RLS — no vive en
      // la alerta. Así el panel es legible sin que la tabla de alertas guarde
      // datos personales (regla dura 3).
      // La operación llega por dos caminos y hay que aceptar los dos: las
      // alertas del motor de umbrales cuelgan de su evaluación, y las del
      // Art. 23 Ter 2 nacen de comparar una operación contra el perfil
      // declarado, sin evaluación de umbral de por medio. Antes de coalesce,
      // una desviación de perfil se mostraba sin cliente ni monto.
      const r = await db.query(
        `select a.id, a.tipo::text, a.titulo, a.detalle, a.created_at::text,
                o.id::text as operacion_id,
                c.id::text as cliente_id, c.nombre_o_razon_social as cliente,
                o.fecha_operacion::text, o.monto_base::text
           from alertas a
           left join evaluaciones_umbral e on e.id = a.evaluacion_id
           left join operaciones o on o.id = coalesce(a.operacion_id, e.operacion_id)
           left join clientes_finales c on c.id = o.cliente_id
          where a.estado = 'abierta'
          order by a.created_at desc`,
      )
      const alertas = r.rows as FilaAlerta[]
      // El MISMO componente que en operaciones: una alerta y su operación no
      // pueden explicar el veredicto de dos formas distintas.
      const veredictos = await veredictosDeOperaciones(db, {
        sesion,
        operacionIds: alertas.map((a) => a.operacion_id).filter((x): x is string => x !== null),
      })
      return { alertas, veredictos }
    })

    const ordenadas = [...filas].sort(
      (a, b) => (ORDEN[a.tipo] ?? 9) - (ORDEN[b.tipo] ?? 9),
    )

    return (
      <Marco obligado={obligado} perfil={perfil} alertasAbiertas={filas.length}>
        <h1>Alertas abiertas</h1>
        <p className="sub">
          Una alerta no es un aviso: es lo que alguien tiene que mirar. VIZO nunca presenta nada
          al SPPLD por su cuenta.
        </p>

        {ordenadas.length === 0 ? (
          <div className="tarjeta">
            <p className="tenue" style={{ margin: 0 }}>
              No hay alertas abiertas. Cada operación registrada se evalúa; si ninguna cruzó un
              umbral, no hay nada pendiente.
            </p>
          </div>
        ) : (
          <div className="alertas">
            {ordenadas.map((a) => {
              const v = a.operacion_id === null ? undefined : veredictos.get(a.operacion_id)
              return (
                <TarjetaDeAlerta
                  key={a.id}
                  tipo={a.tipo}
                  titulo={a.titulo}
                  detalle={a.detalle}
                  pie={
                    a.cliente === null || a.cliente_id === null ? null : (
                      <p className="ficha-alerta-pie">
                        <Link
                          href={`/clientes/${a.cliente_id}/expediente`}
                          className="nombre-cliente"
                        >
                          {a.cliente}
                        </Link>{' '}
                        · operación del {a.fecha_operacion}
                        {a.monto_base !== null && ` · ${formatearPesosTexto(a.monto_base)}`}
                      </p>
                    )
                  }
                  /* El MISMO desglose que en operaciones: una alerta y su
                     operación no pueden explicar el veredicto de dos formas. */
                  desglose={
                    v === undefined ? null : (
                      <DesgloseDelVeredicto
                        v={v}
                        sinMotivo={a.detalle['motivo'] === v.motivo}
                      />
                    )
                  }
                />
              )
            })}
          </div>
        )}
      </Marco>
    )
  })
}
