import type { EjecutorSql } from '../catalogo/cargador'
import { plazoDePresentacion, type Plazo } from '../dominio/calendario'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * Qué periodos siguen sin presentarse, y cuánto falta para su fecha límite.
 *
 * Es lo que alimenta la alerta de calendario: la obligación no avisa sola, y el
 * día 17 llega igual para quien se acordó y para quien no.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA CONSULTA NO SABE
 * ────────────────────────────────────────────────────────────────────────────
 * No sabe desde cuándo el obligado tiene que informar. La obligación arranca con
 * su alta y registro ante la autoridad, y esa fecha NO está en el modelo de
 * datos: `tenants` guarda cuándo se creó la fila en VIZO, que es otra cosa.
 *
 * Así que la serie de meses empieza en la primera operación registrada. Eso
 * cubre "hubo actividad y no se ha presentado" —que es el caso que produce una
 * omisión— y NO cubre "me di de alta en marzo, no operé, y debía informar en
 * cero desde entonces".
 *
 * Está dicho aquí y no resuelto con una suposición: inventar una fecha de alta
 * produce una lista de pendientes plausible y equivocada, en las dos
 * direcciones. Ver el issue de la fecha de alta.
 */

export interface PeriodoPendiente {
  /** 'AAAA-MM-01'. */
  periodo: string
  plazo: Plazo
  /** Estado del aviso si ya se empezó; null si no existe todavía. */
  estatusAviso: string | null
  /** Null mientras el periodo no tenga aviso generado. */
  avisoId: string | null
  tipoAviso: string | null
  fragmentos: number | null
  operacionesReportables: number
}

/**
 * TODOS los periodos, presentados incluidos.
 *
 * `periodosPendientes` filtra sobre esto. Son dos preguntas distintas: la
 * alerta quiere saber qué falta; la pantalla de avisos quiere el historial
 * completo, porque un periodo ya presentado sigue siendo la prueba de que se
 * cumplió — y en una revisión eso es lo que se enseña.
 */
export async function panoramaDePeriodos(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    actividadId: string
    /** Hoy EN MÉXICO. Se recibe: la hora que decide algo no sale del navegador. */
    hoy: string
  },
): Promise<PeriodoPendiente[]> {
  await exigirSesionActiva(db, p.sesion)

  const parametros = await db.query(
    `select clave, valor::int as valor
       from parametros_motor
      where clave in ('dia_limite_presentacion', 'dia_alerta_presentacion')
        and daterange(vigente_desde, vigente_hasta, '[]') @> $1::date`,
    [p.hoy],
  )
  const porClave = new Map(
    (parametros.rows as Array<{ clave: string; valor: number }>).map((r) => [r.clave, r.valor]),
  )
  const diaLimite = porClave.get('dia_limite_presentacion')
  const diaAlerta = porClave.get('dia_alerta_presentacion')
  if (diaLimite === undefined || diaAlerta === undefined) {
    throw new Error(
      `Faltan parámetros de calendario vigentes en ${p.hoy}. El día límite es dato de ` +
        'catálogo, no una constante: cárgalo en parametros_motor con su vigencia.',
    )
  }

  // El catálogo guarda un DÍA DEL MES (avisar a partir del 10) y el dominio
  // razona en días de anticipación. La conversión va aquí, explícita, para no
  // torcer la semántica del catálogo ni la de la función.
  const diasAviso = diaLimite - diaAlerta

  // Los meses van del primero con actividad hasta el mes ANTERIOR al de hoy:
  // un mes que no ha cerrado todavía no se reporta.
  const { rows } = await db.query(
    `with meses as (
       select generate_series(
                date_trunc('month', (select min(fecha_operacion)
                                       from operaciones_vigentes
                                      where tenant_id = $1 and actividad_id = $2)),
                date_trunc('month', $3::date) - interval '1 month',
                interval '1 month'
              )::date as periodo
     )
     select m.periodo::text,
            a.estatus::text as estatus_aviso,
            a.id::text as aviso_id,
            a.tipo::text as tipo_aviso,
            a.fragmentos,
            (select count(*)::int
               from operaciones_vigentes o
               join lateral (
                 select x.resultado_aviso from evaluaciones_umbral x
                  where x.operacion_id = o.id order by x.evaluado_en desc limit 1
               ) ev on true
              where o.tenant_id = $1 and o.actividad_id = $2
                and o.fecha_operacion >= m.periodo
                and o.fecha_operacion < m.periodo + interval '1 month'
                and ev.resultado_aviso <> 'no') as reportables
       from meses m
       left join avisos a
         on a.tenant_id = $1 and a.actividad_id = $2 and a.periodo = m.periodo
      order by m.periodo desc`,
    [p.sesion.tenantId, p.actividadId, p.hoy],
  )

  return (
    rows as Array<{
      periodo: string
      estatus_aviso: string | null
      aviso_id: string | null
      tipo_aviso: string | null
      fragmentos: number | null
      reportables: number
    }>
  ).map((r) => ({
    periodo: r.periodo,
    avisoId: r.aviso_id,
    tipoAviso: r.tipo_aviso,
    fragmentos: r.fragmentos,
    plazo: plazoDePresentacion({
      periodo: r.periodo,
      hoy: p.hoy,
      diaLimite,
      diasAviso,
    }),
    estatusAviso: r.estatus_aviso,
    operacionesReportables: r.reportables,
  }))
}

/**
 * Lo que falta por presentar. Es `panoramaDePeriodos` sin los ya presentados.
 *
 * Se deriva en vez de repetir la consulta: dos SQL que responden casi lo mismo
 * divergen en cuanto alguien toca uno solo, y aquí divergir significa que la
 * alerta y la pantalla se contradigan sobre si un mes está en regla.
 */
export async function periodosPendientes(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; actividadId: string; hoy: string },
): Promise<PeriodoPendiente[]> {
  const todos = await panoramaDePeriodos(db, p)
  return todos.filter((x) => x.estatusAviso !== 'presentado')
}
