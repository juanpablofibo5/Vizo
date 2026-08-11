import type { EjecutorSql } from '../catalogo/cargador'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * El veredicto del motor, con todo lo que lo sostiene.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTO NO CALCULA NADA
 * ────────────────────────────────────────────────────────────────────────────
 * Lee `evaluaciones_umbral`, que el motor escribió cuando se registró la
 * operación. Cada insumo del cálculo quedó guardado ahí desde la semana 3 —la
 * UMA con su vigencia, los umbrales aplicados, los parámetros, la suma de la
 * ventana, la versión del catálogo— precisamente para poder contarlo después.
 *
 * Recalcular aquí sería el peor error posible de esta pantalla: dos respuestas
 * que pueden diferir, y la que se defiende ante la autoridad es la que quedó
 * registrada, no la que pinta la pantalla.
 *
 * Por eso los montos viajan como TEXTO tal como los devuelve Postgres: pasar un
 * numeric por el `number` de JavaScript puede cambiar el último centavo, y el
 * último centavo es exactamente el que decide si hay aviso.
 */

export interface UmbralAplicado {
  tipo: string
  base: string
  siempre: boolean
  valorUma: string | null
  enPesos: string | null
}

export interface OperacionAcumulada {
  id: string
  fecha: string
  montoBase: string
  montoTotal: string
}

export interface Veredicto {
  evaluacionId: string
  operacionId: string
  evaluadoEn: string
  resultadoAviso: 'no' | 'individual' | 'acumulacion'
  requiereIdentificacion: boolean
  requiereRevisionIdentidad: boolean
  efectivoRestringido: boolean
  alertaProximidad: boolean
  /** El texto que el motor escribió al decidir. */
  motivo: string

  umaValor: string
  umaVigencia: string
  catalogoVersion: string
  umbrales: UmbralAplicado[]
  ventanaMeses: number | null
  proximidadPct: number | null

  montoBaseConsiderado: string
  montoTotalConsiderado: string
  sumaVentana: string | null
  /** Las operaciones que el motor sumó. Vacío si no hubo acumulación. */
  acumuladas: OperacionAcumulada[]
}

interface Fila {
  evaluacion_id: string
  operacion_id: string
  evaluado_en: string
  resultado_aviso: string
  requiere_identificacion: boolean
  requiere_revision_identidad: boolean
  efectivo_restringido: boolean
  alerta_proximidad: boolean
  motivo: string
  uma_valor: string
  uma_vigencia: string
  catalogo_version: string
  umbrales_aplicados: Array<{
    tipo: string
    base: string
    siempre: boolean
    valor_uma: string | null
    en_pesos: string | null
  }>
  parametros_aplicados: Record<string, number>
  monto_base_considerado: string
  monto_total_considerado: string
  suma_ventana: string | null
  operaciones_acumuladas: string[] | null
}

/**
 * El veredicto vigente de cada operación indicada.
 *
 * Vigente = la evaluación más reciente. Una operación puede tener varias si se
 * reevaluó; la que cuenta es la última, y las anteriores siguen ahí porque
 * `evaluaciones_umbral` es append-only.
 */
export async function veredictosDeOperaciones(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; operacionIds: string[] },
): Promise<Map<string, Veredicto>> {
  await exigirSesionActiva(db, p.sesion)
  if (p.operacionIds.length === 0) return new Map()

  const { rows } = await db.query(
    `select distinct on (e.operacion_id)
            e.id::text as evaluacion_id, e.operacion_id::text,
            to_char(e.evaluado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as evaluado_en,
            e.resultado_aviso::text, e.requiere_identificacion,
            e.requiere_revision_identidad, e.efectivo_restringido, e.alerta_proximidad,
            e.motivo, e.uma_valor::text, e.uma_vigencia::text, e.catalogo_version,
            e.umbrales_aplicados, e.parametros_aplicados,
            e.monto_base_considerado::text, e.monto_total_considerado::text,
            e.suma_ventana::text,
            (select array_agg(x::text) from unnest(e.operaciones_acumuladas) x) as operaciones_acumuladas
       from evaluaciones_umbral e
      where e.tenant_id = $1 and e.operacion_id = any($2::uuid[])
      order by e.operacion_id, e.evaluado_en desc`,
    [p.sesion.tenantId, p.operacionIds],
  )

  const filas = rows as Fila[]

  // Las operaciones que el motor sumó se traen en UNA consulta, no una por
  // veredicto: son las mismas pocas repetidas entre evaluaciones.
  const idsAcumulados = [...new Set(filas.flatMap((f) => f.operaciones_acumuladas ?? []))]
  const detalle = new Map<string, OperacionAcumulada>()
  if (idsAcumulados.length > 0) {
    const r = await db.query(
      `select id::text, fecha_operacion::text as fecha,
              monto_base::text, monto_total::text
         from operaciones where tenant_id = $1 and id = any($2::uuid[])`,
      [p.sesion.tenantId, idsAcumulados],
    )
    for (const o of r.rows as Array<{
      id: string
      fecha: string
      monto_base: string
      monto_total: string
    }>) {
      detalle.set(o.id, {
        id: o.id,
        fecha: o.fecha,
        montoBase: o.monto_base,
        montoTotal: o.monto_total,
      })
    }
  }

  return new Map(
    filas.map((f) => [
      f.operacion_id,
      {
        evaluacionId: f.evaluacion_id,
        operacionId: f.operacion_id,
        evaluadoEn: f.evaluado_en,
        resultadoAviso: f.resultado_aviso as Veredicto['resultadoAviso'],
        requiereIdentificacion: f.requiere_identificacion,
        requiereRevisionIdentidad: f.requiere_revision_identidad,
        efectivoRestringido: f.efectivo_restringido,
        alertaProximidad: f.alerta_proximidad,
        motivo: f.motivo,
        umaValor: f.uma_valor,
        umaVigencia: f.uma_vigencia,
        catalogoVersion: f.catalogo_version,
        umbrales: (f.umbrales_aplicados ?? []).map((u) => ({
          tipo: u.tipo,
          base: u.base,
          siempre: u.siempre,
          valorUma: u.valor_uma,
          enPesos: u.en_pesos,
        })),
        ventanaMeses: f.parametros_aplicados?.['ventana_acumulacion_meses'] ?? null,
        proximidadPct: f.parametros_aplicados?.['umbral_proximidad_pct'] ?? null,
        montoBaseConsiderado: f.monto_base_considerado,
        montoTotalConsiderado: f.monto_total_considerado,
        sumaVentana: f.suma_ventana,
        acumuladas: (f.operaciones_acumuladas ?? [])
          .map((id) => detalle.get(id))
          .filter((x): x is OperacionAcumulada => x !== undefined)
          .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      },
    ]),
  )
}
