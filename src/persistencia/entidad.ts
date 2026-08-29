import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import { DatoDeRiesgoInvalido, PlazoDeRiesgoAusente } from './riesgo'
import type { GradoConfigurado } from '../dominio/riesgo'
import {
  evaluarEntidad,
  type ConfiguracionEntidad,
  type MitiganteDeclarado,
  type NivelDeclarado,
  type ResultadoEntidad,
} from '../dominio/entidad'

/**
 * La evaluación de ENTIDAD del obligado y su configuración (ADR-28).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUIÉN PONE QUÉ
 * ────────────────────────────────────────────────────────────────────────────
 * El obligado pone su escala de efectividad (niveles, con la evidencia que
 * cada uno exige y cuánto reduce), sus mitigantes con el nivel declarado, y el
 * método de entidad. VIZO pone el motor, el histórico append-only y la
 * consecuencia de los Arts. 44/45 ya resuelta. **Ninguna función de aquí
 * inserta un nivel, un valor o un mitigante que el obligado no haya
 * capturado**, y no existe ningún valor por omisión que pudiera colarse como
 * sugerencia (ADR-21).
 *
 * La base ya impide lo peor —la escala de efectividad es monótona y se congela
 * con el modelo, el nivel es del mismo modelo por FK compuesta, el residual ES
 * la resta, la fila no se reescribe— así que estas funciones no repiten esas
 * reglas: traducen sus errores a algo que una persona pueda atender.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const METODOS_ENTIDAD = ['residual_por_elemento']
const BASES = ['anio_completo', 'parcial_desde_inicio', 'proyectados'] as const

export type BaseInformacion = (typeof BASES)[number]

export interface NivelGuardado extends NivelDeclarado {
  nombre: string
  evidenciaExigible: string
}

export interface MitiganteDeEntidad extends MitiganteDeclarado {
  efecto: string
  evidenciaRef: string | null
}

export interface EvaluacionDeEntidad {
  id: string
  gradoClave: string
  gradoNombre: string
  esAlto: boolean
  auditoria: 'externa_obligatoria' | 'interna_permitida'
  inherente: number
  mitigacion: number
  residual: number
  baseInformacion: BaseInformacion
  evaluadoEn: string
  vence: string
  vencida: boolean
  modeloVersion: number
}

export interface EstadoDeLaEntidad {
  /** El modelo vigente, o null — y entonces la pantalla muestra el hueco. */
  modeloVigenteId: string | null
  modeloVersion: number | null
  metodoEntidad: string | null
  niveles: NivelGuardado[]
  mitigantes: MitiganteDeEntidad[]
  pesosPorElemento: Record<string, number>
  /** Qué le falta al obligado para poder evaluar su entidad. Vacío = ya puede. */
  faltaParaEvaluar: string[]
  vigente: EvaluacionDeEntidad | null
  historico: EvaluacionDeEntidad[]
}

interface FilaNivel {
  id: string
  clave: string
  nombre: string
  orden: number
  evidencia_exigible: string
  valor: string
}

interface FilaMitigante {
  id: string
  descripcion: string
  efecto: string
  evidencia_ref: string | null
  nivel_id: string | null
  nivel_clave: string | null
  nivel_orden: number | null
  nivel_valor: string | null
  elementos: string[]
}

interface FilaEvaluacionEntidad {
  id: string
  grado_clave: string
  grado_nombre: string
  es_alto: boolean
  inherente: string
  mitigacion: string
  residual: string
  base_informacion: BaseInformacion
  evaluado_en: string
  vence: string
  vencida: boolean
  version: number
}

async function nivelesDe(db: EjecutorSql, modeloId: string): Promise<NivelGuardado[]> {
  const { rows } = await db.query(
    `select id::text, clave, nombre, orden, evidencia_exigible, valor::text
       from niveles_efectividad where modelo_id = $1 order by orden`,
    [modeloId],
  )
  return (rows as FilaNivel[]).map((n) => ({
    id: n.id,
    clave: n.clave,
    nombre: n.nombre,
    orden: n.orden,
    evidenciaExigible: n.evidencia_exigible,
    valor: Number(n.valor),
  }))
}

async function mitigantesDeEntidad(
  db: EjecutorSql,
  modeloId: string,
): Promise<MitiganteDeEntidad[]> {
  const { rows } = await db.query(
    `select m.id::text, m.descripcion, m.efecto, m.evidencia_ref,
            m.nivel_id::text as nivel_id, n.clave as nivel_clave,
            n.orden as nivel_orden, n.valor::text as nivel_valor,
            coalesce(
              (select array_agg(e.clave order by e.clave)
                 from mitigantes_elementos me
                 join elementos_riesgo e on e.id = me.elemento_id
                where me.mitigante_id = m.id),
              '{}'::text[]) as elementos
       from mitigantes m
       left join niveles_efectividad n on n.id = m.nivel_id
      where m.modelo_id = $1
      order by m.created_at`,
    [modeloId],
  )
  return (rows as FilaMitigante[]).map((m) => ({
    id: m.id,
    descripcion: m.descripcion,
    efecto: m.efecto,
    evidenciaRef: m.evidencia_ref,
    elementos: m.elementos,
    nivel:
      m.nivel_id === null || m.nivel_clave === null || m.nivel_orden === null || m.nivel_valor === null
        ? null
        : { id: m.nivel_id, clave: m.nivel_clave, orden: m.nivel_orden, valor: Number(m.nivel_valor) },
  }))
}

const aEvaluacionEntidad = (f: FilaEvaluacionEntidad): EvaluacionDeEntidad => ({
  id: f.id,
  gradoClave: f.grado_clave,
  gradoNombre: f.grado_nombre,
  esAlto: f.es_alto,
  auditoria: f.es_alto ? 'externa_obligatoria' : 'interna_permitida',
  inherente: Number(f.inherente),
  mitigacion: Number(f.mitigacion),
  residual: Number(f.residual),
  baseInformacion: f.base_informacion,
  evaluadoEn: f.evaluado_en,
  vence: f.vence,
  vencida: f.vencida,
  modeloVersion: f.version,
})

/** Declara el método de entidad del borrador. Nunca sobre un modelo vigente. */
export async function declararMetodoEntidad(
  db: Client,
  p: { sesion: ContextoSesion; modeloId: string; metodo: string },
): Promise<void> {
  if (!METODOS_ENTIDAD.includes(p.metodo)) {
    throw new DatoDeRiesgoInvalido([
      `El método de entidad "${p.metodo}" no es uno que el motor sepa ejecutar. Hoy solo está ` +
        'implementado el residual por elemento; un método nuevo se implementa y se prueba antes ' +
        'de poder elegirse.',
    ])
  }

  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(
      `update modelos_riesgo set metodo_entidad = $2
        where id = $1 and estado = 'borrador'`,
      [p.modeloId, p.metodo],
    )
    if ((r.rowCount ?? 0) === 0) {
      throw new DatoDeRiesgoInvalido([
        'Ese modelo no existe o ya no está en borrador. El método de entidad se declara antes ' +
          'de aprobar la metodología: cambiarlo después movería la respuesta de auditoría sin ' +
          'versión nueva.',
      ])
    }
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'entidad.metodo_declarado',
      'modelo_riesgo',
      p.modeloId,
      JSON.stringify({ metodo: p.metodo }),
      p.sesion.usuarioId,
    ])
  })
}

/** Define un nivel de la escala de efectividad. Lo escribe el obligado. */
export async function definirNivelEfectividad(
  db: Client,
  p: {
    sesion: ContextoSesion
    modeloId: string
    orden: number
    clave: string
    nombre: string
    evidenciaExigible: string
    valor: number
  },
): Promise<{ nivelId: string }> {
  const problemas: string[] = []
  if (p.clave.trim() === '') problemas.push('Falta la clave del nivel.')
  if (p.nombre.trim() === '') problemas.push('Falta el nombre del nivel.')
  if (p.evidenciaExigible.trim() === '') {
    problemas.push(
      'Falta la evidencia exigible: qué documento tiene que existir para declarar este nivel. ' +
        'Un nivel sin evidencia es optimismo con nombre.',
    )
  }
  if (!Number.isInteger(p.orden) || p.orden < 1) {
    problemas.push('El orden debe ser un entero desde 1, donde 1 es el nivel que menos mitiga.')
  }
  if (!Number.isFinite(p.valor) || p.valor < 0) {
    problemas.push('El valor debe ser un número mayor o igual a cero.')
  }
  if (problemas.length > 0) throw new DatoDeRiesgoInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `insert into niveles_efectividad
         (tenant_id, modelo_id, orden, clave, nombre, evidencia_exigible, valor)
       values ($1,$2,$3,$4,$5,$6,$7) returning id::text`,
      [
        p.sesion.tenantId,
        p.modeloId,
        p.orden,
        p.clave.trim(),
        p.nombre.trim(),
        p.evidenciaExigible.trim(),
        p.valor,
      ],
    )
    const nivelId = (rows[0] as { id: string }).id
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'entidad.nivel_definido',
      'nivel_efectividad',
      nivelId,
      JSON.stringify({ clave: p.clave.trim(), orden: p.orden, valor: p.valor }),
      p.sesion.usuarioId,
    ])
    return { nivelId }
  })
}

export async function quitarNivelEfectividad(
  db: Client,
  p: { sesion: ContextoSesion; nivelId: string },
): Promise<void> {
  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(`delete from niveles_efectividad where id = $1`, [p.nivelId])
    if ((r.rowCount ?? 0) === 0) {
      throw new DatoDeRiesgoInvalido(['Ese nivel no existe en tu obligado.'])
    }
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'entidad.nivel_retirado',
      'nivel_efectividad',
      p.nivelId,
      JSON.stringify({}),
      p.sesion.usuarioId,
    ])
  })
}

/**
 * Declara un mitigante del borrador, con su cobertura y —si ya lo decidió— su
 * nivel. Corregirlo después es quitarlo y volverlo a declarar, nunca editarlo:
 * la misma doctrina que los factores.
 */
export async function agregarMitigante(
  db: Client,
  p: {
    sesion: ContextoSesion
    modeloId: string
    descripcion: string
    efecto: string
    elementoIds: readonly string[]
    nivelId?: string
    evidenciaRef?: string
  },
): Promise<{ mitiganteId: string }> {
  const problemas: string[] = []
  if (p.descripcion.trim().length < 3) problemas.push('Describe el mitigante.')
  if (p.efecto.trim() === '') {
    problemas.push('Falta el efecto (Art. 10 Septies 1 fr. III): qué reduce y cómo.')
  }
  if (p.elementoIds.length === 0) {
    problemas.push(
      'El mitigante debe cubrir al menos un elemento de Riesgo: sin cobertura no se puede ' +
        'establecer su efecto.',
    )
  }
  if (problemas.length > 0) throw new DatoDeRiesgoInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `insert into mitigantes (tenant_id, modelo_id, descripcion, efecto, nivel_id, evidencia_ref)
       values ($1,$2,$3,$4,$5,$6) returning id::text`,
      [
        p.sesion.tenantId,
        p.modeloId,
        p.descripcion.trim(),
        p.efecto.trim(),
        p.nivelId ?? null,
        p.evidenciaRef?.trim() ?? null,
      ],
    )
    const mitiganteId = (rows[0] as { id: string }).id

    for (const elementoId of p.elementoIds) {
      await db.query(
        `insert into mitigantes_elementos (tenant_id, mitigante_id, elemento_id)
         values ($1,$2,$3)`,
        [p.sesion.tenantId, mitiganteId, elementoId],
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'entidad.mitigante_declarado',
      'mitigante',
      mitiganteId,
      JSON.stringify({ elementos: p.elementoIds.length, con_nivel: p.nivelId !== undefined }),
      p.sesion.usuarioId,
    ])
    return { mitiganteId }
  })
}

export async function quitarMitigante(
  db: Client,
  p: { sesion: ContextoSesion; mitiganteId: string },
): Promise<void> {
  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(`delete from mitigantes where id = $1`, [p.mitiganteId])
    if ((r.rowCount ?? 0) === 0) {
      throw new DatoDeRiesgoInvalido(['Ese mitigante no existe en tu obligado.'])
    }
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'entidad.mitigante_retirado',
      'mitigante',
      p.mitiganteId,
      JSON.stringify({}),
      p.sesion.usuarioId,
    ])
  })
}

/** Todo lo que la pantalla de entidad necesita, con el hueco ya redactado. */
export async function estadoDeLaEntidad(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<EstadoDeLaEntidad> {
  await exigirSesionActiva(db, p.sesion)

  const mo = await db.query(
    `select id::text, version, metodo_entidad
       from modelos_riesgo where tenant_id = $1 and estado = 'vigente'`,
    [p.sesion.tenantId],
  )
  const vigente = mo.rows[0] as
    | { id: string; version: number; metodo_entidad: string | null }
    | undefined

  const el = await db.query(`select clave from elementos_riesgo order by clave`)
  const elementos = (el.rows as { clave: string }[]).map((e) => e.clave)

  const niveles = vigente === undefined ? [] : await nivelesDe(db, vigente.id)
  const mitigantes = vigente === undefined ? [] : await mitigantesDeEntidad(db, vigente.id)

  const pesosPorElemento: Record<string, number> = {}
  if (vigente !== undefined) {
    const pe = await db.query(
      `select e.clave, p.peso::text from pesos_elemento p
        join elementos_riesgo e on e.id = p.elemento_id where p.modelo_id = $1`,
      [vigente.id],
    )
    for (const r of pe.rows as { clave: string; peso: string }[]) {
      pesosPorElemento[r.clave] = Number(r.peso)
    }
  }

  const ev = await db.query(
    `select e.id::text, g.clave as grado_clave, g.nombre as grado_nombre, g.es_alto,
            e.riesgo_inherente::text as inherente, e.mitigacion_aplicada::text as mitigacion,
            e.riesgo_residual::text as residual, e.base_informacion::text as base_informacion,
            e.evaluado_en::text as evaluado_en, e.vence::text as vence,
            (e.vence < (now() at time zone 'America/Mexico_City')::date) as vencida,
            m.version
       from evaluaciones_entidad e
       join grados_riesgo g on g.id = e.grado_id
       join modelos_riesgo m on m.id = e.modelo_id
      where e.tenant_id = $1
      order by e.secuencia desc`,
    [p.sesion.tenantId],
  )
  const evaluaciones = (ev.rows as FilaEvaluacionEntidad[]).map(aEvaluacionEntidad)

  // El hueco, dicho como lo que le falta al obligado. Nunca se rellena por él.
  const falta: string[] = []
  if (vigente === undefined) {
    falta.push('Ninguna versión de la metodología está vigente.')
  } else {
    if (vigente.metodo_entidad === null) {
      falta.push('La metodología no declara su método de evaluación de entidad.')
    }
    const sinValor = elementos.filter((e) => pesosPorElemento[e] === undefined)
    if (sinValor.length > 0) {
      falta.push(
        `Falta el valor de ${String(sinValor.length)} elemento(s): ${sinValor.join(', ')}. ` +
          'El Art. 10 Septies 1 fr. II lo exige para cada uno.',
      )
    }
    for (const m of mitigantes) {
      if (m.nivel === null) {
        falta.push(`El mitigante «${m.descripcion}» no tiene nivel de efectividad declarado.`)
      }
    }
  }

  return {
    modeloVigenteId: vigente?.id ?? null,
    modeloVersion: vigente?.version ?? null,
    metodoEntidad: vigente?.metodo_entidad ?? null,
    niveles,
    mitigantes,
    pesosPorElemento,
    faltaParaEvaluar: falta,
    vigente: evaluaciones[0] ?? null,
    historico: evaluaciones.slice(1),
  }
}

/**
 * Corre el motor de entidad y registra la evaluación.
 *
 * Si falta configuración, devuelve el hueco **sin escribir nada**: registrar
 * una evaluación de entidad sin metodología sería inventarle al obligado la
 * respuesta de su auditoría.
 */
export async function evaluarEntidadYRegistrar(
  db: Client,
  p: {
    sesion: ContextoSesion
    hoy: string
    base: BaseInformacion
    periodoInicio?: string
    periodoFin?: string
    totalClientes: number
    totalOperaciones: number
    montoOperadoCentavos: number
  },
): Promise<{ resultado: ResultadoEntidad; evaluacionId: string | null }> {
  const problemas: string[] = []
  if (!BASES.includes(p.base)) {
    problemas.push('La base de información debe ser año completo, parcial desde inicio o proyectados.')
  }
  if (p.base === 'proyectados') {
    if (p.periodoInicio !== undefined || p.periodoFin !== undefined) {
      problemas.push('Con datos proyectados no hay periodo histórico que declarar.')
    }
  } else if (
    p.periodoInicio === undefined ||
    p.periodoFin === undefined ||
    !FECHA.test(p.periodoInicio) ||
    !FECHA.test(p.periodoFin)
  ) {
    problemas.push('El periodo de la información debe venir completo, con fechas AAAA-MM-DD.')
  } else if (p.periodoFin < p.periodoInicio) {
    problemas.push('El periodo termina antes de empezar.')
  }
  for (const [nombre, valor] of [
    ['total de clientes', p.totalClientes],
    ['total de operaciones', p.totalOperaciones],
    ['monto operado', p.montoOperadoCentavos],
  ] as const) {
    if (!Number.isSafeInteger(valor) || valor < 0) {
      problemas.push(`El ${nombre} debe ser un entero mayor o igual a cero.`)
    }
  }
  if (problemas.length > 0) throw new DatoDeRiesgoInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDeLaEntidad(db, { sesion: p.sesion, hoy: p.hoy })
    if (estado.modeloVigenteId === null) {
      return {
        resultado: { estado: 'sin_configuracion', falta: 'metodo_entidad' },
        evaluacionId: null,
      }
    }

    const gr = await db.query(
      `select id::text, clave, orden, es_alto, puntaje_minimo::text
         from grados_riesgo where tenant_id = $1 order by orden`,
      [p.sesion.tenantId],
    )
    const escala: GradoConfigurado[] = (
      gr.rows as { id: string; clave: string; orden: number; es_alto: boolean; puntaje_minimo: string | null }[]
    ).map((g) => ({
      id: g.id,
      clave: g.clave,
      orden: g.orden,
      esAlto: g.es_alto,
      puntajeMinimo: g.puntaje_minimo === null ? Number.NaN : Number(g.puntaje_minimo),
    }))

    const el = await db.query(`select clave from elementos_riesgo order by clave`)
    const configuracion: ConfiguracionEntidad = {
      modeloId: estado.modeloVigenteId,
      metodoEntidad: estado.metodoEntidad,
      elementos: (el.rows as { clave: string }[]).map((e) => e.clave),
      pesosPorElemento: estado.pesosPorElemento,
      mitigantes: estado.mitigantes,
      escala,
    }

    const resultado = evaluarEntidad(configuracion)
    if (resultado.estado !== 'evaluado') {
      return { resultado, evaluacionId: null }
    }

    // Sin plazo no se sella un vencimiento: este número entra a una fila
    // append-only que decide la auditoría del obligado. Un doce supuesto
    // quedaría escrito para siempre como si alguien lo hubiera decidido.
    const meses = await db.query(
      `select (valor #>> '{}')::int as meses from parametros_motor
        where clave = 'reevaluacion_entidad_meses' and actividad_id is null
        order by vigente_desde desc limit 1`,
    )
    const m = (meses.rows[0] as { meses: number } | undefined)?.meses
    if (m === undefined) throw new PlazoDeRiesgoAusente('reevaluacion_entidad_meses')

    const { rows } = await db.query(
      `insert into evaluaciones_entidad
         (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
          total_clientes, total_operaciones, monto_operado_centavos,
          riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id,
          detalle, evaluado_por, vence)
       values ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,
               (current_date + ($15 || ' months')::interval)::date)
       returning id::text`,
      [
        p.sesion.tenantId,
        estado.modeloVigenteId,
        p.base,
        p.base === 'proyectados' ? null : p.periodoInicio,
        p.base === 'proyectados' ? null : p.periodoFin,
        p.totalClientes,
        p.totalOperaciones,
        p.montoOperadoCentavos,
        resultado.inherente,
        resultado.mitigacion,
        resultado.residual,
        resultado.gradoId,
        JSON.stringify({
          metodo: 'residual_por_elemento',
          por_elemento: resultado.porElemento,
          corte_aplicado: resultado.corteAplicado,
        }),
        p.sesion.usuarioId,
        String(m),
      ],
    )
    const evaluacionId = (rows[0] as { id: string }).id

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'entidad.evaluada',
      'evaluacion_entidad',
      evaluacionId,
      JSON.stringify({
        grado: resultado.gradoClave,
        es_alto: resultado.esAlto,
        auditoria: resultado.auditoria,
        inherente: resultado.inherente,
        mitigacion: resultado.mitigacion,
        residual: resultado.residual,
        base: p.base,
      }),
      p.sesion.usuarioId,
    ])

    return { resultado, evaluacionId }
  })
}
