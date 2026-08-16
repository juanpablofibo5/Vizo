import type { EjecutorSql } from '../catalogo/cargador'
import { pesosTextoACentavos } from '../dominio/dinero'
import { inicioVentana } from '../dominio/fechas'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'
import type { OperacionPrevia, ResolucionIdentidad } from '../dominio/tipos'

/**
 * El historial que alimenta la acumulación.
 *
 * Es la consulta donde se gana o se pierde la promesa del producto: sumar las
 * operaciones del mismo cliente **a través de sucursales**, que es lo que un
 * Excel por sucursal no puede ver.
 *
 * Tres filtros que no son negociables:
 *   · mismo cliente
 *   · MISMA actividad — los acumulados jamás se cruzan entre fracciones (A-04)
 *   · dentro de la ventana deslizante
 * Y uno que a propósito NO existe: la sucursal.
 *
 * ISSUE #7. El tenant sale de la SESIÓN, no de un parámetro suelto, y esta
 * consulta exige correr como `authenticated`. La razón es asimétrica y por eso
 * importa: con RLS puesta, un tenant equivocado no devuelve datos ajenos —
 * devuelve CERO FILAS. Y cero filas en la acumulación significa sumar de
 * menos, es decir un aviso omitido, que es la dirección cara del error
 * (10,000 a 65,000 UMA de multa). Un aviso de más se corrige.
 */

export interface ParametrosHistorial {
  /** De aquí sale el tenant. No se recibe suelto: ver el párrafo de arriba. */
  sesion: ContextoSesion
  clienteId: string
  actividadId: string
  fechaOperacion: string
  ventanaMeses: number
  /** Se excluye del historial: es la operación que se está evaluando. */
  excluirOperacionId?: string | undefined
}

interface FilaHistorial {
  id: string
  fecha_operacion: string
  monto_base: string
  monto_total: string
  cae_en_identificacion: boolean
  cliente_id: string
}

export async function historialParaAcumulacion(
  db: EjecutorSql,
  p: ParametrosHistorial,
): Promise<OperacionPrevia[]> {
  await exigirSesionActiva(db, p.sesion)

  const inicio = inicioVentana(p.fechaOperacion, p.ventanaMeses)

  // `cae_en_identificacion` se resuelve por operación contra el umbral vigente
  // EN SU PROPIA FECHA, no en la de la operación evaluada: un historial que
  // cruza el 1 de febrero tiene dos UMA distintas en juego.
  //
  // Solo suman los actos que individualmente caen en el supuesto de
  // identificación (webinar SAT-UIF del 20/06/2026). En V Bis eso es todo,
  // pero en Fr. XV el umbral discrimina.
  const { rows } = await db.query(
    `select o.id,
            o.fecha_operacion::text,
            o.monto_base::text,
            o.monto_total::text,
            o.cliente_id,
            coalesce(
              u.siempre
              or (u.valor_uma is not null
                  and (case when u.base = 'con_contribuciones' then o.monto_total else o.monto_base end)
                      >= u.valor_uma * app.uma_vigente(o.fecha_operacion)),
              false
            ) as cae_en_identificacion
       from operaciones_vigentes o
       left join umbrales u
         on u.actividad_id = o.actividad_id
        and u.tipo = 'identificacion'
        and daterange(u.vigente_desde, u.vigente_hasta, '[]') @> o.fecha_operacion
      where o.tenant_id = $1
        and o.cliente_id = $2
        and o.actividad_id = $3
        and o.fecha_operacion >= $4::date
        and o.fecha_operacion <= $5::date
        and ($6::uuid is null or o.id <> $6::uuid)
      order by o.fecha_operacion, o.registrado_en`,
    [
      p.sesion.tenantId,
      p.clienteId,
      p.actividadId,
      inicio,
      p.fechaOperacion,
      p.excluirOperacionId ?? null,
    ],
  )

  return (rows as FilaHistorial[]).map((f) => ({
    id: f.id,
    fechaOperacion: f.fecha_operacion,
    montoBase: pesosTextoACentavos(f.monto_base),
    montoTotal: pesosTextoACentavos(f.monto_total),
    caeEnIdentificacion: f.cae_en_identificacion,
    clienteId: f.cliente_id,
  }))
}

// ─────────────────────────────────────────────────────────────────────────
// Resolución de identidad
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normaliza una clave fiscal para comparar: mayúsculas, sin espacios ni
 * guiones. `RFC` y `CURP` se capturan con formatos inconsistentes y toda la
 * acumulación depende de que "el mismo cliente" se resuelva bien.
 */
export function normalizarClave(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const limpio = valor.replace(/[\s-]/g, '').toUpperCase()
  return limpio === '' ? null : limpio
}

export interface IdentidadCliente {
  rfc?: string | null
  curp?: string | null
  identidadAlterna?: unknown
}

export class IdentidadIndeterminada extends Error {
  constructor() {
    super(
      'El cliente no tiene RFC, CURP ni identidad alterna: no hay forma de resolver ' +
        'si es el mismo cliente en otra operación, y sin eso la acumulación no es confiable.',
    )
    this.name = 'IdentidadIndeterminada'
  }
}

/**
 * Cómo quedó resuelta la identidad de un cliente.
 *
 * Orden de preferencia: RFC (la clave fiscal única), luego CURP, y al final la
 * identidad alterna del extranjero sin RFC. Ese último caso enciende la
 * bandera de revisión humana en el motor.
 *
 * NUNCA se resuelve por nombre. Es el camino directo a un falso negativo, y un
 * falso negativo aquí es un aviso omitido. El criterio definitivo para
 * extranjeros está POR CONFIRMAR con el especialista PLD (caso A-05).
 */
export function resolverIdentidad(c: IdentidadCliente): ResolucionIdentidad {
  if (normalizarClave(c.rfc) !== null) return 'rfc'
  if (normalizarClave(c.curp) !== null) return 'curp'
  if (c.identidadAlterna !== null && c.identidadAlterna !== undefined) return 'identidad_alterna'
  throw new IdentidadIndeterminada()
}
