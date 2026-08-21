import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  evaluarRiesgo,
  type ConfiguracionRiesgo,
  type FactorConfigurado,
  type GradoConfigurado,
  type ResultadoRiesgo,
} from '../dominio/riesgo'

/**
 * El modelo de Riesgos del obligado y su ejecución (Caps. II Quáter y III Bis).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUIÉN PONE QUÉ
 * ────────────────────────────────────────────────────────────────────────────
 * El obligado pone la escala de grados, los factores y sus ponderaciones. VIZO
 * pone el motor, el histórico y la evidencia (ADR-21). Este módulo es el que
 * hace cumplir esa división al escribir: **ninguna función de aquí inserta un
 * factor, un grado o un corte que el obligado no haya capturado**, y no existe
 * ningún valor por omisión que pudiera colarse como sugerencia.
 *
 * La base ya impide lo peor —un modelo no se activa vacío, no se evalúa contra
 * un borrador, los factores se congelan al activarse— así que estas funciones
 * no repiten esas reglas: traducen sus errores a algo que una persona pueda
 * atender.
 */

export type EstadoModelo = 'borrador' | 'vigente' | 'sustituido'

export interface ElementoRiesgo {
  id: string
  clave: string
  nombre: string
  fuente: string
}

export interface FactorGuardado extends FactorConfigurado {
  elementoNombre: string
}

export interface ModeloGuardado {
  id: string
  version: number
  estado: EstadoModelo
  metodoMedicion: string | null
  vigenteDesde: string | null
  aprobadoEn: string | null
  factores: FactorGuardado[]
}

export interface EstadoRiesgo {
  /** El catálogo de elementos mínimos: lo pone la norma, no el obligado. */
  elementos: ElementoRiesgo[]
  escala: GradoConfigurado[]
  vigente: ModeloGuardado | null
  borrador: ModeloGuardado | null
  /** Desde cuándo es exigible (Transitorio Cuarto). */
  exigibleDesde: string
  anticipada: boolean
  /**
   * El hueco del ADR-21, resumido para la pantalla: qué le falta al obligado
   * para poder clasificar. Vacío significa que ya puede.
   */
  faltaParaClasificar: string[]
}

export class DatoDeRiesgoInvalido extends Error {
  constructor(problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeRiesgoInvalido'
  }
}

export class ModeloNoActivable extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ModeloNoActivable'
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const METODOS_CONOCIDOS = ['suma_ponderada']

interface FilaGrado {
  id: string
  clave: string
  nombre: string
  orden: number
  es_alto: boolean
  puntaje_minimo: string | null
}

interface FilaModelo {
  id: string
  version: number
  estado: EstadoModelo
  metodo_medicion: string | null
  vigente_desde: string | null
  aprobado_en: string | null
}

interface FilaFactor {
  id: string
  factor: string
  elemento_clave: string
  elemento_nombre: string
  peso: string
}

async function factoresDe(db: EjecutorSql, modeloId: string): Promise<FactorGuardado[]> {
  const { rows } = await db.query(
    `select f.id::text, f.factor, e.clave as elemento_clave, e.nombre as elemento_nombre,
            f.peso::text
       from factores_modelo f
       join elementos_riesgo e on e.id = f.elemento_id
      where f.modelo_id = $1
      order by e.clave, f.factor`,
    [modeloId],
  )
  return (rows as FilaFactor[]).map((f) => ({
    id: f.id,
    factor: f.factor,
    elemento: f.elemento_clave,
    elementoNombre: f.elemento_nombre,
    peso: Number(f.peso),
  }))
}

const aModelo = async (db: EjecutorSql, f: FilaModelo): Promise<ModeloGuardado> => ({
  id: f.id,
  version: f.version,
  estado: f.estado,
  metodoMedicion: f.metodo_medicion,
  vigenteDesde: f.vigente_desde,
  aprobadoEn: f.aprobado_en,
  factores: await factoresDe(db, f.id),
})

/** Todo lo que la pantalla de configuración necesita saber. */
export async function estadoDelRiesgo(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<EstadoRiesgo> {
  await exigirSesionActiva(db, p.sesion)

  const el = await db.query(
    `select id::text, clave, nombre, fuente from elementos_riesgo order by clave`,
  )
  const gr = await db.query(
    `select id::text, clave, nombre, orden, es_alto, puntaje_minimo::text
       from grados_riesgo where tenant_id = $1 order by orden`,
    [p.sesion.tenantId],
  )
  const mo = await db.query(
    `select id::text, version, estado::text as estado, metodo_medicion,
            vigente_desde::text as vigente_desde, aprobado_en::text as aprobado_en
       from modelos_riesgo where tenant_id = $1 and estado in ('vigente','borrador')`,
    [p.sesion.tenantId],
  )
  const pa = await db.query(
    `select vigente_desde::text as desde, (valor #>> '{}')::int as minimo
       from parametros_motor
      where clave = 'minimo_clasificaciones_riesgo' and actividad_id is null
      order by vigente_desde desc limit 1`,
  )

  const filas = mo.rows as FilaModelo[]
  const vigente = filas.find((f) => f.estado === 'vigente')
  const borrador = filas.find((f) => f.estado === 'borrador')
  const escala: GradoConfigurado[] = (gr.rows as FilaGrado[]).map((g) => ({
    id: g.id,
    clave: g.clave,
    orden: g.orden,
    esAlto: g.es_alto,
    puntajeMinimo: g.puntaje_minimo === null ? Number.NaN : Number(g.puntaje_minimo),
  }))

  const cat = pa.rows[0] as { desde: string; minimo: number } | undefined
  const minimo = cat?.minimo ?? 3
  const exigibleDesde = cat?.desde ?? '2027-03-01'

  // El hueco, dicho como lo que le falta al obligado. Nunca se rellena por él.
  const falta: string[] = []
  if (escala.length < minimo) {
    falta.push(
      `La escala tiene ${String(escala.length)} de las ${String(minimo)} clasificaciones mínimas que exige el Art. 23 Bis.`,
    )
  }
  if (escala.length > 0 && !escala.some((g) => g.esAlto)) {
    falta.push('Ningún grado está marcado como alto, y de ese valor cuelgan las medidas reforzadas.')
  }
  if (escala.some((g) => Number.isNaN(g.puntajeMinimo))) {
    falta.push('Algún grado no dice desde qué puntaje aplica.')
  }
  const enCurso = borrador ?? vigente
  if (enCurso === undefined) {
    falta.push('No hay ninguna versión de la metodología.')
  } else if ((await factoresDe(db, enCurso.id)).length === 0) {
    falta.push('La metodología no tiene ningún factor configurado. Los captura el obligado.')
  }
  if (vigente === undefined) {
    falta.push('Ninguna versión está vigente: hasta que se apruebe, no se clasifica a nadie.')
  }

  return {
    elementos: el.rows as ElementoRiesgo[],
    escala,
    vigente: vigente === undefined ? null : await aModelo(db, vigente),
    borrador: borrador === undefined ? null : await aModelo(db, borrador),
    exigibleDesde,
    anticipada: p.hoy < exigibleDesde,
    faltaParaClasificar: falta,
  }
}

/** Define un grado de la escala. Lo escribe el obligado, con su corte. */
export async function definirGrado(
  db: Client,
  p: {
    sesion: ContextoSesion
    clave: string
    nombre: string
    orden: number
    esAlto: boolean
    puntajeMinimo: number
    vigenteDesde: string
  },
): Promise<{ gradoId: string }> {
  const problemas: string[] = []
  if (p.clave.trim() === '') problemas.push('Falta la clave del grado.')
  if (p.nombre.trim() === '') problemas.push('Falta el nombre del grado.')
  if (!Number.isInteger(p.orden) || p.orden < 1) {
    problemas.push('El orden debe ser un entero desde 1, donde 1 es el menor riesgo.')
  }
  if (!Number.isFinite(p.puntajeMinimo) || p.puntajeMinimo < 0) {
    problemas.push('El puntaje mínimo debe ser un número mayor o igual a cero.')
  }
  if (!FECHA.test(p.vigenteDesde)) problemas.push('La fecha debe tener la forma AAAA-MM-DD.')
  if (problemas.length > 0) throw new DatoDeRiesgoInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `insert into grados_riesgo
         (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
       values ($1,$2,$3,$4,$5,$6,$7::date) returning id::text`,
      [
        p.sesion.tenantId,
        p.clave.trim(),
        p.nombre.trim(),
        p.orden,
        p.esAlto,
        p.puntajeMinimo,
        p.vigenteDesde,
      ],
    )
    const gradoId = (rows[0] as { id: string }).id

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'riesgo.grado_definido',
      'grado_riesgo',
      gradoId,
      JSON.stringify({ clave: p.clave.trim(), orden: p.orden, es_alto: p.esAlto }),
      p.sesion.usuarioId,
    ])
    return { gradoId }
  })
}

/** Abre una versión nueva de la metodología, en borrador. */
export async function crearModelo(
  db: Client,
  p: { sesion: ContextoSesion; metodoMedicion: string },
): Promise<{ modeloId: string }> {
  if (!METODOS_CONOCIDOS.includes(p.metodoMedicion)) {
    throw new DatoDeRiesgoInvalido([
      `El método de medición "${p.metodoMedicion}" no es uno que el motor sepa ejecutar. ` +
        'Hoy solo está implementada la suma ponderada; un método nuevo se implementa y se prueba ' +
        'antes de poder elegirse.',
    ])
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `insert into modelos_riesgo (tenant_id, version, metodo_medicion)
       select $1, coalesce(max(version), 0) + 1, $2 from modelos_riesgo where tenant_id = $1
       returning id::text, version`,
      [p.sesion.tenantId, p.metodoMedicion],
    )
    const fila = rows[0] as { id: string; version: number }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'riesgo.modelo_creado',
      'modelo_riesgo',
      fila.id,
      JSON.stringify({ version: fila.version, metodo: p.metodoMedicion }),
      p.sesion.usuarioId,
    ])
    return { modeloId: fila.id }
  })
}

/** Agrega un factor al borrador. VIZO nunca llama a esto por su cuenta. */
export async function agregarFactor(
  db: Client,
  p: {
    sesion: ContextoSesion
    modeloId: string
    elementoId: string
    factor: string
    peso: number
    indicadores?: Record<string, unknown>
  },
): Promise<{ factorId: string }> {
  const problemas: string[] = []
  if (p.factor.trim().length < 3) problemas.push('Describe el factor de riesgo.')
  if (!Number.isFinite(p.peso) || p.peso <= 0 || p.peso > 100) {
    problemas.push('El peso debe ser mayor que cero y no pasar de 100.')
  }
  if (problemas.length > 0) throw new DatoDeRiesgoInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso, indicadores)
       values ($1,$2,$3,$4,$5,$6::jsonb) returning id::text`,
      [
        p.sesion.tenantId,
        p.modeloId,
        p.elementoId,
        p.factor.trim(),
        p.peso,
        JSON.stringify(p.indicadores ?? {}),
      ],
    )
    const factorId = (rows[0] as { id: string }).id

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'riesgo.factor_configurado',
      'factor_modelo',
      factorId,
      JSON.stringify({ peso: p.peso }),
      p.sesion.usuarioId,
    ])
    return { factorId }
  })
}

export async function quitarFactor(
  db: Client,
  p: { sesion: ContextoSesion; factorId: string },
): Promise<void> {
  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(`delete from factores_modelo where id = $1`, [p.factorId])
    if ((r.rowCount ?? 0) === 0) {
      throw new DatoDeRiesgoInvalido(['Ese factor no existe en tu obligado.'])
    }
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'riesgo.factor_retirado',
      'factor_modelo',
      p.factorId,
      JSON.stringify({}),
      p.sesion.usuarioId,
    ])
  })
}

/**
 * Aprueba y activa el modelo. Es la decisión del obligado sobre su propia
 * metodología: por eso queda con nombre y hora, y por eso la base exige que la
 * escala esté completa y haya factores antes de dejarla pasar.
 */
export async function activarModelo(
  db: Client,
  p: { sesion: ContextoSesion; modeloId: string; vigenteDesde: string },
): Promise<void> {
  if (!FECHA.test(p.vigenteDesde)) {
    throw new DatoDeRiesgoInvalido(['La fecha de vigencia debe tener la forma AAAA-MM-DD.'])
  }

  await enTransaccionDeSesion(db, p.sesion, async () => {
    // Si ya había uno vigente, se sustituye: el histórico conserva con cuál se
    // evaluó a cada cliente en su momento.
    await db.query(
      `update modelos_riesgo set estado = 'sustituido'
        where tenant_id = $1 and estado = 'vigente'`,
      [p.sesion.tenantId],
    )

    try {
      const r = await db.query(
        `update modelos_riesgo
            set estado = 'vigente', vigente_desde = $2::date,
                aprobado_por = $3, aprobado_en = now()
          where id = $1 and estado = 'borrador'`,
        [p.modeloId, p.vigenteDesde, p.sesion.usuarioId],
      )
      if ((r.rowCount ?? 0) === 0) {
        throw new ModeloNoActivable(
          'Ese modelo no existe o ya no está en borrador. Solo se activa una versión en borrador.',
        )
      }
    } catch (e) {
      // La base explica por qué no se puede activar; el mensaje ya es el útil.
      if (e instanceof ModeloNoActivable) throw e
      throw new ModeloNoActivable(e instanceof Error ? e.message : String(e))
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'riesgo.modelo_activado',
      'modelo_riesgo',
      p.modeloId,
      JSON.stringify({ vigente_desde: p.vigenteDesde }),
      p.sesion.usuarioId,
    ])
  })
}

/**
 * Corre el motor sobre un cliente y registra la evaluación.
 *
 * Si el obligado no ha configurado su modelo, devuelve el hueco **sin escribir
 * nada**: registrar una evaluación sin metodología sería inventar un grado.
 */
export async function evaluarClienteYRegistrar(
  db: Client,
  p: {
    sesion: ContextoSesion
    clienteId: string
    factoresPresentes: readonly string[]
    hoy: string
  },
): Promise<{ resultado: ResultadoRiesgo; evaluacionId: string | null }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDelRiesgo(db, { sesion: p.sesion, hoy: p.hoy })

    if (estado.vigente === null) {
      return { resultado: { estado: 'sin_configuracion', falta: 'factores' }, evaluacionId: null }
    }

    const configuracion: ConfiguracionRiesgo = {
      modeloId: estado.vigente.id,
      metodoMedicion: estado.vigente.metodoMedicion ?? '',
      factores: estado.vigente.factores,
      escala: estado.escala,
    }

    const resultado = evaluarRiesgo(
      { clienteId: p.clienteId, factoresPresentes: p.factoresPresentes },
      configuracion,
    )
    if (resultado.estado !== 'evaluado') {
      return { resultado, evaluacionId: null }
    }

    const meses = await db.query(
      `select (valor #>> '{}')::int as meses from parametros_motor
        where clave = 'reevaluacion_grado_meses' and actividad_id is null
        order by vigente_desde desc limit 1`,
    )
    const m = (meses.rows[0] as { meses: number } | undefined)?.meses ?? 6

    const { rows } = await db.query(
      `insert into evaluaciones_riesgo
         (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados,
          evaluado_por, vence)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7, (current_date + ($8 || ' months')::interval)::date)
       returning id::text`,
      [
        p.sesion.tenantId,
        p.clienteId,
        estado.vigente.id,
        resultado.gradoId,
        resultado.puntaje,
        JSON.stringify(resultado.aplicados),
        p.sesion.usuarioId,
        String(m),
      ],
    )
    const evaluacionId = (rows[0] as { id: string }).id

    // REGLA DURA 3: el grado y el puntaje, nunca quién es el cliente. El
    // cliente_id va como objeto de la bitácora, que es un id opaco.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'riesgo.cliente_evaluado',
      'evaluacion_riesgo',
      evaluacionId,
      JSON.stringify({
        grado: resultado.gradoClave,
        es_alto: resultado.esAlto,
        puntaje: resultado.puntaje,
        factores: resultado.aplicados.length,
      }),
      p.sesion.usuarioId,
    ])

    return { resultado, evaluacionId }
  })
}

// ---------------------------------------------------------------------------
// La vista del riesgo de UN cliente, para su expediente
// ---------------------------------------------------------------------------

export interface EvaluacionDeCliente {
  id: string
  grado: string
  gradoNombre: string
  esAlto: boolean
  puntaje: number
  evaluadoEn: string
  vence: string
  vencida: boolean
  aplicados: { factor: string; elemento: string; peso: number }[]
  modeloVersion: number
}

export interface RiesgoDelCliente {
  /** Si el obligado ya puede clasificar. Si no, la pantalla muestra el hueco. */
  puedeClasificar: boolean
  faltaParaClasificar: string[]
  /** Los factores del modelo vigente: las casillas que alguien va a marcar. */
  factores: FactorGuardado[]
  vigente: EvaluacionDeCliente | null
  historico: EvaluacionDeCliente[]
  /** Del catálogo: cada cuántos meses hay que reevaluar (Art. 23 Bis 1). */
  reevaluacionMeses: number
}

interface FilaEvaluacion {
  id: string
  grado: string
  grado_nombre: string
  es_alto: boolean
  puntaje: string
  evaluado_en: string
  vence: string
  vencida: boolean
  factores_aplicados: { factor: string; elemento: string; peso: number }[]
  version: number
}

const aEvaluacion = (f: FilaEvaluacion): EvaluacionDeCliente => ({
  id: f.id,
  grado: f.grado,
  gradoNombre: f.grado_nombre,
  esAlto: f.es_alto,
  puntaje: Number(f.puntaje),
  evaluadoEn: f.evaluado_en,
  vence: f.vence,
  vencida: f.vencida,
  aplicados: f.factores_aplicados,
  modeloVersion: f.version,
})

export async function riesgoDelCliente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<RiesgoDelCliente> {
  const estado = await estadoDelRiesgo(db, { sesion: p.sesion, hoy: p.hoy })

  const { rows } = await db.query(
    `select e.id::text, g.clave as grado, g.nombre as grado_nombre, g.es_alto,
            e.puntaje::text, e.evaluado_en::text as evaluado_en, e.vence::text as vence,
            (e.vence < (now() at time zone 'America/Mexico_City')::date) as vencida,
            e.factores_aplicados, m.version
       from evaluaciones_riesgo e
       join grados_riesgo g on g.id = e.grado_id
       join modelos_riesgo m on m.id = e.modelo_id
      where e.cliente_id = $1
      order by e.secuencia desc`,
    [p.clienteId],
  )
  const evaluaciones = (rows as FilaEvaluacion[]).map(aEvaluacion)

  const meses = await db.query(
    `select (valor #>> '{}')::int as meses from parametros_motor
      where clave = 'reevaluacion_grado_meses' and actividad_id is null
      order by vigente_desde desc limit 1`,
  )

  return {
    puedeClasificar: estado.vigente !== null,
    faltaParaClasificar: estado.faltaParaClasificar,
    factores: estado.vigente?.factores ?? [],
    vigente: evaluaciones[0] ?? null,
    historico: evaluaciones.slice(1),
    reevaluacionMeses: (meses.rows[0] as { meses: number } | undefined)?.meses ?? 6,
  }
}
