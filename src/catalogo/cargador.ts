import type { ConfigActividad, Umbral } from '../dominio/tipos'
import { pesosTextoACentavos, umaACentavos, umaCentavos } from '../dominio/dinero'

/**
 * El cargador de la Capa 0.
 *
 * Traduce el catálogo regulatorio a la `ConfigActividad` que consume el motor.
 * Existe para que el motor pueda ser una función pura: toda la conversación
 * con la base ocurre aquí.
 *
 * REGLA: todas las consultas son "as of" la fecha de la operación. Nunca "el
 * valor actual". Una operación del 15 de enero de 2026 se evalúa con la UMA de
 * 2025 aunque hoy estemos en agosto.
 */

/** Lo mínimo que necesita el cargador. Cualquier cliente de Postgres sirve. */
export interface EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export class CatalogoIncompleto extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'CatalogoIncompleto'
  }
}

interface FilaUmbral {
  tipo: string
  siempre: boolean
  valor_uma: string | null
  base: string
}

/**
 * Arma la configuración de una actividad para una fecha dada.
 *
 * Falla RUIDOSAMENTE si falta cualquier pieza del catálogo. Es deliberado:
 * un motor que asume un valor por defecto cuando no encuentra la UMA calcula
 * mal en silencio, y en este dominio calcular mal en silencio es lo peor que
 * puede pasar. Ver docs/03_EJECUCION_CLAUDE_CODE.md §6.
 */
export async function cargarConfigActividad(
  db: EjecutorSql,
  fraccion: string,
  fechaOperacion: string,
): Promise<ConfigActividad> {
  const actividad = await unaFila<{ id: string; fraccion: string }>(
    db,
    'select id, fraccion from actividades_vulnerables where fraccion = $1',
    [fraccion],
  )
  if (!actividad) {
    throw new CatalogoIncompleto(
      `La actividad ${fraccion} no está dada de alta en el catálogo`,
    )
  }

  const uma = await unaFila<{ valor: string | null; desde: string | null; hasta: string | null }>(
    db,
    `select u.valor_diario::text as valor,
            u.vigente_desde::text as desde,
            u.vigente_hasta::text as hasta
       from uma_vigencias u
      where daterange(u.vigente_desde, u.vigente_hasta, '[]') @> $1::date`,
    [fechaOperacion],
  )
  if (!uma?.valor || !uma.desde) {
    throw new CatalogoIncompleto(
      `No hay UMA vigente para ${fechaOperacion}. El motor no asume un valor: ` +
        'cárgala en el catálogo con su fuente del DOF.',
    )
  }
  const umaEnCentavos = umaCentavos(pesosTextoACentavos(uma.valor))

  const filas = await varias<FilaUmbral>(
    db,
    `select tipo::text, siempre, valor_uma::text, base::text
       from umbrales
      where actividad_id = $1
        and daterange(vigente_desde, vigente_hasta, '[]') @> $2::date`,
    [actividad.id, fechaOperacion],
  )
  if (filas.length === 0) {
    throw new CatalogoIncompleto(
      `No hay umbrales vigentes para ${fraccion} en ${fechaOperacion}`,
    )
  }

  const umbrales: Umbral[] = filas.map((f) => ({
    tipo: f.tipo as Umbral['tipo'],
    siempre: f.siempre,
    valorUma: f.valor_uma,
    enCentavos: f.siempre || f.valor_uma === null ? null : umaACentavos(f.valor_uma, umaEnCentavos),
    base: f.base as Umbral['base'],
  }))

  const ventanaMeses = await parametroEntero(db, actividad.id, 'ventana_acumulacion_meses', fechaOperacion)
  const proximidadPct = await parametroEntero(db, actividad.id, 'umbral_proximidad_pct', fechaOperacion)

  const version = await unaFila<{ v: string }>(db, 'select app.catalogo_version() as v')
  if (!version?.v) {
    throw new CatalogoIncompleto('No se pudo calcular la versión del catálogo')
  }

  return {
    actividadId: actividad.id,
    fraccion: actividad.fraccion,
    uma: umaEnCentavos,
    umaVigenteDesde: uma.desde,
    umaVigenteHasta: uma.hasta,
    umbrales,
    ventanaMeses,
    proximidadPct,
    catalogoVersion: version.v,
  }
}

/** Busca un umbral por tipo dentro de una configuración ya cargada. */
export function umbralDe(config: ConfigActividad, tipo: Umbral['tipo']): Umbral | undefined {
  return config.umbrales.find((u) => u.tipo === tipo)
}

async function parametroEntero(
  db: EjecutorSql,
  actividadId: string,
  clave: string,
  fecha: string,
): Promise<number> {
  const fila = await unaFila<{ valor: number | null }>(
    db,
    'select app.parametro_vigente($1, $2, $3::date)::int as valor',
    [actividadId, clave, fecha],
  )
  if (fila?.valor === null || fila?.valor === undefined) {
    throw new CatalogoIncompleto(
      `Falta el parámetro "${clave}" vigente en ${fecha}. Es un dato del catálogo, no una constante.`,
    )
  }
  return fila.valor
}

async function unaFila<T>(db: EjecutorSql, sql: string, parametros: unknown[] = []): Promise<T | null> {
  const { rows } = await db.query(sql, parametros)
  return (rows[0] as T | undefined) ?? null
}

async function varias<T>(db: EjecutorSql, sql: string, parametros: unknown[] = []): Promise<T[]> {
  const { rows } = await db.query(sql, parametros)
  return rows as T[]
}
