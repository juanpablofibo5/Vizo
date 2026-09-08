import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  coherenciaDeLaRuta,
  fechaLimiteDeEntrega,
  periodoDeAuditoria,
  type CoherenciaDeLaRuta,
  type RutaAuditoria,
  type TipoAuditor,
} from '../dominio/auditoria'
import { auditoriaQueCorresponde } from '../dominio/entidad'

/**
 * El Cap. XIV en la base (Arts. 42-45 y 50 ¶1 del Acuerdo 115/2026). Fase 1:
 * el periodo, la ruta y el auditor.
 *
 * Este módulo trae los hechos (evaluación de entidad vigente, calendario de
 * días inhábiles, plantilla del Cap. XII) y deja que `src/dominio/
 * auditoria.ts` decida el periodo, la fecha límite y la coherencia de la
 * ruta. Lo único que resuelve por su cuenta es CONTRA QUÉ evaluación de
 * entidad se congela la ruta —la más reciente al momento de abrir, nunca una
 * que alguien pase suelta— y de dónde salen los plazos: del catálogo.
 */

// ─────────────────────────────────────────────────────────────────────────
// Errores
// ─────────────────────────────────────────────────────────────────────────

export class DatoDeAuditoriaInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeAuditoriaInvalido'
  }
}

export class PlazoDeAuditoriaAusente extends Error {
  constructor(clave: string) {
    super(
      `El catálogo no tiene el plazo "${clave}" y sin él no se puede abrir un periodo de ` +
        'auditoría ni designar a su auditor. Se detiene en vez de suponer un número: el plazo se ' +
        'siembra con su fuente del DOF (regla dura 1).',
    )
    this.name = 'PlazoDeAuditoriaAusente'
  }
}

/**
 * No hay ninguna evaluación de entidad contra la cual decidir la ruta.
 *
 * DEFINIDA AQUÍ, no importada de `src/persistencia/capacitacion.ts`, aunque
 * el nombre y el motivo de fondo son el mismo («sin una evaluación de
 * entidad corrida no hay resultado que citar»): el siguiente paso que cada
 * mensaje recomienda es distinto —capacitación manda a declarar coherencia
 * de una sesión, esto manda a abrir un periodo de auditoría— y reusar el
 * mensaje de otro capítulo habría mandado al usuario al lugar equivocado del
 * producto. Dos clases con el mismo nombre en módulos distintos no colisionan:
 * cada quien importa la suya.
 */
export class SinEvaluacionDeEntidad extends Error {
  constructor() {
    super(
      'Este obligado todavía no tiene ninguna evaluación de entidad. Los Arts. 44/45 deciden la ' +
        'ruta de auditoría —interna o externa— según el grado de Riesgo de esa evaluación: primero ' +
        'hay que correrla (Configuración → Riesgo de la entidad) y luego abrir el periodo.',
    )
    this.name = 'SinEvaluacionDeEntidad'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

// ─────────────────────────────────────────────────────────────────────────
// Los plazos del catálogo
// ─────────────────────────────────────────────────────────────────────────

export interface PlazosDeAuditoria {
  readonly primerPeriodoAnio: number
  readonly entregaMes: number
  readonly experienciaMinimaAnios: number
  readonly vedaRecAnios: number
  readonly exigibleDesde: string
  readonly anticipado: boolean
}

async function plazo(db: EjecutorSql, clave: string): Promise<{ valor: number; desde: string }> {
  const { rows } = await db.query(
    `select (valor #>> '{}')::int as valor, vigente_desde::text as desde
       from parametros_motor
      where clave = $1 and actividad_id is null
      order by vigente_desde desc limit 1`,
    [clave],
  )
  const f = rows[0] as { valor: number; desde: string } | undefined
  if (f === undefined) throw new PlazoDeAuditoriaAusente(clave)
  return f
}

/**
 * Los cuatro plazos del capítulo, con su vigencia.
 *
 * Espeja `plazosDeCapacitacion` (src/persistencia/capacitacion.ts:97): antes
 * de que la fila esté vigente se toma la que exista de todas formas
 * (`order by vigente_desde desc limit 1` ya lo hace) y se marca `anticipado`
 * — el obligado necesita poder ver los plazos del capítulo antes de que le
 * sean exigibles.
 *
 * `exigibleDesde`/`anticipado` se anclan a `auditoria_experiencia_minima_anios`
 * (vigente_desde 2028-01-01), no a `auditoria_primer_periodo_anio` (vigente
 * desde 2026-11-30 a propósito, para que el dato esté disponible antes): el
 * capítulo completo —quién puede dictaminar, cuándo entrega— no es exigible
 * hasta 2028, aunque el AÑO del primer periodo ya se pueda consultar antes.
 */
export async function plazosDeAuditoria(db: EjecutorSql, hoy: string): Promise<PlazosDeAuditoria> {
  const primerPeriodo = await plazo(db, 'auditoria_primer_periodo_anio')
  const entrega = await plazo(db, 'auditoria_entrega_mes')
  const experiencia = await plazo(db, 'auditoria_experiencia_minima_anios')
  const veda = await plazo(db, 'auditoria_veda_rec_anios')
  return {
    primerPeriodoAnio: primerPeriodo.valor,
    entregaMes: entrega.valor,
    experienciaMinimaAnios: experiencia.valor,
    vedaRecAnios: veda.valor,
    exigibleDesde: experiencia.desde,
    anticipado: hoy < experiencia.desde,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Abrir el periodo
// ─────────────────────────────────────────────────────────────────────────

interface EvaluacionVigenteFila {
  id: string
  es_alto: boolean
  evaluado_en: string
}

/** La evaluación de entidad más reciente del obligado, o null si no hay ninguna. */
async function evaluacionVigente(
  db: EjecutorSql,
  tenantId: string,
): Promise<{ id: string; ruta: RutaAuditoria; evaluadoEn: string } | null> {
  const { rows } = await db.query(
    `select e.id::text, g.es_alto, e.evaluado_en::text as evaluado_en
       from evaluaciones_entidad e
       join grados_riesgo g on g.id = e.grado_id
      where e.tenant_id = $1
      order by e.secuencia desc
      limit 1`,
    [tenantId],
  )
  const f = rows[0] as EvaluacionVigenteFila | undefined
  if (f === undefined) return null
  return {
    id: f.id,
    ruta: auditoriaQueCorresponde(f.es_alto),
    evaluadoEn: f.evaluado_en,
  }
}

export interface PeriodoAbierto {
  readonly periodoId: string
  readonly anio: number
  readonly inicio: string
  readonly fin: string
  readonly ruta: RutaAuditoria
  readonly esPrimerPeriodoDeOperaciones: boolean
  readonly fechaLimiteEntrega: string
  readonly limiteConCalendario: boolean
  /** No-null cuando el dominio tuvo que asumir en vez de saber (ver periodoDeAuditoria). */
  readonly advertencia: string | null
}

/**
 * Abre el periodo de auditoría del año `anio` (Arts. 42/43), congelando la
 * ruta (Arts. 44/45) contra la evaluación de entidad vigente EN ESTE
 * MOMENTO.
 *
 * `anio` es el año de CIERRE que se pide abrir. Para el primer periodo de un
 * obligado que inició operaciones dentro o después del año del Transitorio
 * Octavo, ese año de cierre es `año-de-inicio-de-operaciones + 1` —no "el
 * año en curso"—, y es responsabilidad de quien llama pedirlo así (ver el
 * comentario de `periodoDeAuditoria` en el dominio).
 *
 * Una sola transacción: leer la evaluación vigente, calcular el periodo y la
 * fecha límite, e insertar tienen que ser atómicos entre sí — nada de leer
 * "la vigente" y que otro periodo la cambie a medio camino.
 */
export async function abrirPeriodo(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; anio: number; hoy: string },
): Promise<PeriodoAbierto> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const evaluacion = await evaluacionVigente(db, p.sesion.tenantId)
    if (evaluacion === null) throw new SinEvaluacionDeEntidad()

    const plazos = await plazosDeAuditoria(db, p.hoy)

    const ten = await db.query(`select inicio_de_operaciones::text as inicio from tenants where id = $1`, [
      p.sesion.tenantId,
    ])
    const inicioDeOperaciones =
      (ten.rows[0] as { inicio: string | null } | undefined)?.inicio ?? null

    let periodo
    try {
      periodo = periodoDeAuditoria({
        anio: p.anio,
        primerPeriodoAnio: plazos.primerPeriodoAnio,
        inicioDeOperaciones,
      })
    } catch (e) {
      throw new DatoDeAuditoriaInvalido([e instanceof Error ? e.message : String(e)])
    }

    // La fecha límite lee el calendario del año en que cae la entrega (el
    // siguiente al cierre), nunca el del año del cierre.
    const anioEntrega = Number(periodo.fin.slice(0, 4)) + 1
    const dh = await db.query(`select fecha::text from dias_inhabiles where anio = $1`, [anioEntrega])
    const diasInhabiles = (dh.rows as { fecha: string }[]).map((r) => r.fecha)
    // «El año está cargado» se deduce de que exista al menos una fila suya, y
    // eso vale por el contrato que declara `dias_inhabiles`: un año se carga
    // completo o no se carga. Sin ese contrato, medio año cargado haría que
    // VIZO dijera `conCalendario: true` sobre una fecha que no verificó.
    const limite = fechaLimiteDeEntrega({
      periodoFin: periodo.fin,
      mesEntrega: plazos.entregaMes,
      diasInhabiles,
      calendarioCargado: diasInhabiles.length > 0,
    })

    try {
      const { rows } = await db.query(
        `insert into periodos_auditoria
           (tenant_id, anio, periodo_inicio, periodo_fin, es_primer_periodo_de_operaciones,
            evaluacion_entidad_id, ruta, fecha_limite_entrega, limite_con_calendario,
            advertencia, abierto_por)
         values ($1,$2,$3::date,$4::date,$5,$6,$7,$8::date,$9,$10,$11)
         returning id::text`,
        [
          p.sesion.tenantId,
          periodo.anio,
          periodo.inicio,
          periodo.fin,
          periodo.esPrimerPeriodoDeOperaciones,
          evaluacion.id,
          evaluacion.ruta,
          limite.fecha,
          limite.conCalendario,
          // Se guarda, no solo se devuelve: si la duda solo se viera al abrir,
          // la pantalla de mañana afirmaría en silencio una certeza que nunca
          // hubo.
          periodo.advertencia,
          p.sesion.usuarioId,
        ],
      )
      const periodoId = (rows[0] as { id: string } | undefined)?.id
      if (periodoId === undefined) {
        throw new DatoDeAuditoriaInvalido(['El periodo de auditoría no se registró: no hubo confirmación de la base.'])
      }
      return {
        periodoId,
        anio: periodo.anio,
        inicio: periodo.inicio,
        fin: periodo.fin,
        ruta: evaluacion.ruta,
        esPrimerPeriodoDeOperaciones: periodo.esPrimerPeriodoDeOperaciones,
        fechaLimiteEntrega: limite.fecha,
        limiteConCalendario: limite.conCalendario,
        advertencia: periodo.advertencia,
      }
    } catch (e) {
      if (e instanceof DatoDeAuditoriaInvalido) throw e
      const bruto = e instanceof Error ? e.message : String(e)
      if (/un_periodo_por_anio/.test(bruto)) {
        throw new DatoDeAuditoriaInvalido([
          `Ya existe un periodo de auditoría abierto para el año ${String(periodo.anio)} en este obligado.`,
        ])
      }
      throw e
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Designar al auditor — Arts. 44/45
// ─────────────────────────────────────────────────────────────────────────

async function periodoDelObligado(
  db: EjecutorSql,
  tenantId: string,
  periodoId: string,
): Promise<{ ruta: RutaAuditoria } | null> {
  const { rows } = await db.query(
    `select ruta::text as ruta from periodos_auditoria where tenant_id = $1 and id = $2`,
    [tenantId, periodoId],
  )
  const f = rows[0] as { ruta: RutaAuditoria } | undefined
  return f === undefined ? null : { ruta: f.ruta }
}

/**
 * Designa a un auditor INTERNO (Art. 44).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA RUTA SE VALIDA AQUÍ, NO EN LA BASE
 * ────────────────────────────────────────────────────────────────────────────
 * La migración (1.5) da a la base dos triggers para las condiciones del Art.
 * 44 en sí —que la persona no sea la REC, que tenga capacitación
 * acreditada— pero NINGUNO que compare `tipo` contra la `ruta` congelada del
 * periodo: esa comparación es asimétrica (un periodo `interna_permitida`
 * admite CUALQUIERA de los dos tipos, porque el obligado siempre puede
 * ELEGIR externo aunque no le sea obligatorio; solo `externa_obligatoria`
 * cierra la puerta a interno) y no estaba en la especificación de triggers
 * de la migración. Se resuelve aquí, como precondición explícita (nivel 3 de
 * la regla dura 6): si en el futuro conviene subirla a nivel 2 (un trigger
 * en `auditores_designados` que lea `periodos_auditoria.ruta`), es un cambio
 * aislado a este archivo y a esa migración.
 */
export async function designarAuditorInterno(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; periodoId: string; personaId: string },
): Promise<{ auditorId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const periodo = await periodoDelObligado(db, p.sesion.tenantId, p.periodoId)
    if (periodo === null) {
      throw new DatoDeAuditoriaInvalido(['Ese periodo de auditoría no existe en este obligado.'])
    }
    if (periodo.ruta === 'externa_obligatoria') {
      throw new DatoDeAuditoriaInvalido([
        'Este periodo tiene ruta de auditoría externa obligatoria (Art. 45: el Riesgo del ' +
          'obligado se evaluó como alto). No se puede designar a un auditor interno mientras esa ' +
          'ruta esté vigente.',
      ])
    }

    try {
      const { rows } = await db.query(
        `insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
         values ($1,$2,'interna',$3,$4)
         returning id::text`,
        [p.sesion.tenantId, p.periodoId, p.personaId, p.sesion.usuarioId],
      )
      const auditorId = (rows[0] as { id: string } | undefined)?.id
      if (auditorId === undefined) {
        throw new DatoDeAuditoriaInvalido(['La designación no se registró: no hubo confirmación de la base.'])
      }
      return { auditorId }
    } catch (e) {
      if (e instanceof DatoDeAuditoriaInvalido) throw e
      throw traducirErrorDeDesignacion(e)
    }
  })
}

export interface DatosAuditorExterno {
  readonly nombre: string
  readonly profesion: string
  readonly cedulaProfesional: string
  readonly aniosExperiencia: number
  readonly certificacionUifFolio: string
  readonly certificacionUifVence: string
  readonly acreditacion?: { readonly hash: string; readonly archivo: string } | undefined
  /** Inciso c): no sentenciada por delitos patrimoniales. */
  readonly sinSentenciaPatrimonial: boolean
  /** Inciso d): sin servicios previos al auditado que generen conflicto de interés. */
  readonly sinServiciosPreviosEnConflicto: boolean
  /** Inciso e): sin el cargo de REC del auditado durante el periodo y los dos años posteriores. */
  readonly sinCargoRecEnVeda: boolean
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Designa a un auditor EXTERNO (Art. 45).
 *
 * Válido con cualquier ruta del periodo: el obligado siempre puede ELEGIR
 * externo, aunque su Riesgo no lo obligue. Valida los cinco incisos contra
 * el catálogo y contra sí mismos ANTES de tocar la base, para que el error
 * cite el artículo en vez de traducir un `check_violation` genérico —el
 * CHECK `auditor_externo_con_sus_requisitos` de la base es el respaldo de
 * nivel 2, no la primera línea.
 */
export async function designarAuditorExterno(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; periodoId: string; datos: DatosAuditorExterno },
): Promise<{ auditorId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const periodo = await periodoDelObligado(db, p.sesion.tenantId, p.periodoId)
    if (periodo === null) {
      throw new DatoDeAuditoriaInvalido(['Ese periodo de auditoría no existe en este obligado.'])
    }

    const d = p.datos
    const problemas: string[] = []
    if (d.nombre.trim() === '') problemas.push('Falta el nombre de la persona auditora externa.')
    if (d.profesion.trim() === '') problemas.push('Falta la profesión de la persona auditora externa (Art. 45 inciso a).')
    if (d.cedulaProfesional.trim() === '') problemas.push('Falta la cédula profesional (Art. 45 inciso a).')
    if (d.certificacionUifFolio.trim() === '') {
      problemas.push('Falta el folio de la certificación vigente de la UIF (Art. 45 inciso b).')
    }
    if (!FECHA.test(d.certificacionUifVence)) {
      problemas.push('Falta la fecha de vigencia de la certificación de la UIF (Art. 45 inciso b).')
    }
    if (!d.sinSentenciaPatrimonial || !d.sinServiciosPreviosEnConflicto || !d.sinCargoRecEnVeda) {
      problemas.push(
        'No se puede designar a una persona auditora externa que no cumple los incisos c), d) o ' +
          'e) del Art. 45: no haber sido sentenciada por delitos patrimoniales, no haber prestado ' +
          'servicios previos al auditado que generen conflicto de interés, y no haber sido su ' +
          'Representante Encargada de Cumplimiento durante el periodo auditado ni los dos años ' +
          'posteriores. Quien no los cumple no se puede designar; no hay nada que registrar de un ' +
          'candidato que no calificó.',
      )
    }
    if (d.acreditacion !== undefined && !/^[0-9a-f]{64}$/.test(d.acreditacion.hash)) {
      problemas.push('La huella del documento que acredita a la persona auditora no es un SHA-256.')
    }

    const plazos = await plazosDeAuditoria(db, new Date().toISOString().slice(0, 10))
    if (!Number.isFinite(d.aniosExperiencia) || d.aniosExperiencia < 0) {
      problemas.push('Los años de experiencia deben ser un número mayor o igual a cero.')
    } else if (d.aniosExperiencia < plazos.experienciaMinimaAnios) {
      problemas.push(
        `La persona auditora externa debe acreditar al menos ${String(plazos.experienciaMinimaAnios)} ` +
          `años de experiencia en PLD (Art. 45 inciso a), y se declararon ${String(d.aniosExperiencia)}.`,
      )
    }
    if (problemas.length > 0) throw new DatoDeAuditoriaInvalido(problemas)

    try {
      const { rows } = await db.query(
        `insert into auditores_designados
           (tenant_id, periodo_id, tipo, nombre, profesion, cedula_profesional, anios_experiencia,
            certificacion_uif_folio, certificacion_uif_vence, acredita_hash, acredita_archivo,
            sin_sentencia_patrimonial, sin_servicios_previos_en_conflicto, sin_cargo_rec_en_veda,
            designado_por)
         values ($1,$2,'externa',$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,$14)
         returning id::text`,
        [
          p.sesion.tenantId,
          p.periodoId,
          d.nombre.trim(),
          d.profesion.trim(),
          d.cedulaProfesional.trim(),
          d.aniosExperiencia,
          d.certificacionUifFolio.trim(),
          d.certificacionUifVence,
          d.acreditacion?.hash ?? null,
          d.acreditacion?.archivo ?? null,
          d.sinSentenciaPatrimonial,
          d.sinServiciosPreviosEnConflicto,
          d.sinCargoRecEnVeda,
          p.sesion.usuarioId,
        ],
      )
      const auditorId = (rows[0] as { id: string } | undefined)?.id
      if (auditorId === undefined) {
        throw new DatoDeAuditoriaInvalido(['La designación no se registró: no hubo confirmación de la base.'])
      }
      return { auditorId }
    } catch (e) {
      if (e instanceof DatoDeAuditoriaInvalido) throw e
      throw traducirErrorDeDesignacion(e)
    }
  })
}

function traducirErrorDeDesignacion(e: unknown): Error {
  const bruto = e instanceof Error ? e.message : String(e)
  if (/auditor_interno_de_la_plantilla/.test(bruto)) {
    return new DatoDeAuditoriaInvalido([
      'Esa persona no existe en la plantilla del Cap. XII de este obligado.',
    ])
  }
  if (/auditor_del_mismo_periodo/.test(bruto)) {
    return new DatoDeAuditoriaInvalido(['Ese periodo de auditoría no existe en este obligado.'])
  }
  if (/un_auditor_vigente_por_periodo/.test(bruto)) {
    return new DatoDeAuditoriaInvalido([
      'Este periodo ya tiene un auditor vigente. Sustitúyelo primero y vuelve a designar.',
    ])
  }
  // Las guardas del Art. 44 (REC, capacitación acreditada) y el CHECK de los
  // incisos del Art. 45 ya llegan en español, citando el artículo: se dejan
  // subir tal cual en vez de envolverlas otra vez.
  return e instanceof Error ? e : new Error(bruto)
}

// ─────────────────────────────────────────────────────────────────────────
// Sustituir al auditor
// ─────────────────────────────────────────────────────────────────────────

export async function sustituirAuditor(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; auditorId: string; motivo: string; hoy: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (p.motivo.trim() === '') {
      throw new DatoDeAuditoriaInvalido(['Falta el motivo de la sustitución.'])
    }
    if (!FECHA.test(p.hoy)) {
      throw new DatoDeAuditoriaInvalido(['Falta la fecha de la sustitución.'])
    }

    // `returning` y no un UPDATE a secas: mismo modo de falla que
    // `evaluarYAcreditar` — sin este chequeo, sustituir el auditor de otro
    // obligado (o uno ya sustituido) reportaría éxito sin haber tocado nada.
    const { rows } = await db.query(
      `update auditores_designados
          set sustituido_en = $3::timestamptz, motivo_sustitucion = $4
        where tenant_id = $1 and id = $2 and sustituido_en is null
      returning id::text`,
      [p.sesion.tenantId, p.auditorId, p.hoy, p.motivo.trim()],
    )
    if (rows.length === 0) {
      throw new DatoDeAuditoriaInvalido([
        'Ese auditor no existe en este obligado, o ya fue sustituido antes.',
      ])
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// El estado de auditoría — el modelo de lectura
// ─────────────────────────────────────────────────────────────────────────

export interface PeriodoDeAuditoriaGuardado {
  readonly id: string
  readonly anio: number
  readonly inicio: string
  readonly fin: string
  readonly esPrimerPeriodoDeOperaciones: boolean
  readonly evaluacionEntidadId: string
  readonly ruta: RutaAuditoria
  readonly fechaLimiteEntrega: string
  readonly limiteConCalendario: boolean
  /**
   * Qué NO se sabía al calcular este periodo, congelado como se dijo entonces
   * (hoy: el obligado sin `inicio_de_operaciones`, del que no puede afirmarse
   * que no le tocaba el periodo largo del Art. 43). `null` cuando no hubo
   * nada que advertir.
   */
  readonly advertencia: string | null
}

export interface AuditorDesignadoGuardado {
  readonly id: string
  readonly tipo: TipoAuditor
  readonly designadoEn: string
  readonly sustituidoEn: string | null
  readonly motivoSustitucion: string | null
  // Interna
  readonly personaId: string | null
  readonly personaNombre: string | null
  /**
   * Los dos requisitos del Art. 44 para el auditor interno, **verificados en
   * cada lectura**, no congelados al designar.
   *
   * Es deliberado, y se aparta del patrón de congelar que usan la ruta del
   * periodo o la declaración de coherencia (ADR-42). La diferencia está en el
   * texto: aquéllas describen una DECISIÓN tomada en un momento —contra qué
   * evaluación se resolvió— y por eso se guardan como fueron. Éstas describen
   * una CONDICIÓN que el artículo pide sostener: el área de auditoría interna
   * «deberá estar integrada por personal independiente a la persona
   * Representante Encargada de Cumplimiento», en presente, y el Art. 45 ¶final
   * lo dice todavía más claro para el externo — «deberá mantenerse
   * independiente […] durante el desarrollo de la auditoría y hasta la
   * emisión del dictamen respectivo».
   *
   * Congelarlas dejaría a la pantalla afirmando que alguien es independiente
   * del REC porque lo era el día que se le designó, aunque hoy sea la REC.
   * Recalculadas, la pantalla enseña el hecho de hoy — y si dejó de cumplirse,
   * se ve. `null` cuando el auditor es externo: estos dos no le aplican.
   */
  readonly esElRec: boolean | null
  readonly tieneConstanciaAcreditada: boolean | null
  // Externa
  readonly nombre: string | null
  readonly profesion: string | null
  readonly cedulaProfesional: string | null
  readonly aniosExperiencia: number | null
  readonly certificacionUifFolio: string | null
  readonly certificacionUifVence: string | null
}

export interface EstadoDeAuditoria {
  readonly anio: number
  readonly plazos: PlazosDeAuditoria
  readonly periodo: PeriodoDeAuditoriaGuardado | null
  /** null cuando no hay periodo abierto para este año: no hay ruta que comparar. */
  readonly coherenciaDeLaRuta: CoherenciaDeLaRuta | null
  readonly auditorVigente: AuditorDesignadoGuardado | null
  /** Sustituidos, del más antiguo al más reciente. */
  readonly historiaDeAuditores: readonly AuditorDesignadoGuardado[]
}

interface FilaPeriodo {
  id: string
  anio: number
  periodo_inicio: string
  periodo_fin: string
  es_primer_periodo_de_operaciones: boolean
  evaluacion_entidad_id: string
  ruta: RutaAuditoria
  fecha_limite_entrega: string
  limite_con_calendario: boolean
  advertencia: string | null
}

interface FilaAuditor {
  id: string
  tipo: TipoAuditor
  persona_id: string | null
  persona_nombre: string | null
  es_el_rec: boolean | null
  tiene_constancia_acreditada: boolean | null
  nombre: string | null
  profesion: string | null
  cedula_profesional: string | null
  anios_experiencia: number | null
  certificacion_uif_folio: string | null
  certificacion_uif_vence: string | null
  designado_en: string
  sustituido_en: string | null
  motivo_sustitucion: string | null
}

/**
 * Todo lo que la pantalla de auditoría necesita para el año `anio`.
 *
 * Consultas agregadas, sin N+1: el periodo en una consulta, la evaluación
 * vigente en otra (para la coherencia de la ruta), y los auditores del
 * periodo —con los dos hechos verificados del Art. 44 calculados EN LA
 * MISMA consulta, vía subconsultas correlacionadas, no una vuelta a la base
 * por cada auditor— en una tercera.
 */
export async function estadoDeAuditoria(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; anio: number; hoy: string },
): Promise<EstadoDeAuditoria> {
  await exigirSesionActiva(db, p.sesion)
  const plazos = await plazosDeAuditoria(db, p.hoy)

  const per = await db.query(
    `select id::text, anio, periodo_inicio::text as periodo_inicio, periodo_fin::text as periodo_fin,
            es_primer_periodo_de_operaciones, evaluacion_entidad_id::text as evaluacion_entidad_id,
            ruta::text as ruta, fecha_limite_entrega::text as fecha_limite_entrega,
            limite_con_calendario, advertencia
       from periodos_auditoria
      where tenant_id = $1 and anio = $2`,
    [p.sesion.tenantId, p.anio],
  )
  const filaPeriodo = per.rows[0] as FilaPeriodo | undefined
  const periodo: PeriodoDeAuditoriaGuardado | null =
    filaPeriodo === undefined
      ? null
      : {
          id: filaPeriodo.id,
          anio: filaPeriodo.anio,
          inicio: filaPeriodo.periodo_inicio,
          fin: filaPeriodo.periodo_fin,
          esPrimerPeriodoDeOperaciones: filaPeriodo.es_primer_periodo_de_operaciones,
          evaluacionEntidadId: filaPeriodo.evaluacion_entidad_id,
          ruta: filaPeriodo.ruta,
          fechaLimiteEntrega: filaPeriodo.fecha_limite_entrega,
          limiteConCalendario: filaPeriodo.limite_con_calendario,
          advertencia: filaPeriodo.advertencia,
        }

  const evaluacion = await evaluacionVigente(db, p.sesion.tenantId)

  const coherencia: CoherenciaDeLaRuta | null =
    periodo === null
      ? null
      : coherenciaDeLaRuta({
          evaluacionDelPeriodoId: periodo.evaluacionEntidadId,
          rutaCongelada: periodo.ruta,
          evaluacionVigenteId: evaluacion?.id ?? null,
          rutaVigente: evaluacion?.ruta ?? null,
        })

  let auditorVigente: AuditorDesignadoGuardado | null = null
  let historiaDeAuditores: AuditorDesignadoGuardado[] = []

  if (periodo !== null) {
    const aud = await db.query(
      `select a.id::text, a.tipo::text as tipo,
              a.persona_id::text as persona_id, pc.nombre as persona_nombre,
              (pc.rol = 'rec' and pc.baja_del_area is null) as es_el_rec,
              case when a.persona_id is null then null else exists (
                select 1 from asistencias_capacitacion ac
                 where ac.tenant_id = a.tenant_id and ac.persona_id = a.persona_id
                   and ac.constancia_folio is not null
              ) end as tiene_constancia_acreditada,
              a.nombre, a.profesion, a.cedula_profesional, a.anios_experiencia,
              a.certificacion_uif_folio, a.certificacion_uif_vence::text as certificacion_uif_vence,
              a.created_at::text as designado_en,
              a.sustituido_en::text as sustituido_en, a.motivo_sustitucion
         from auditores_designados a
         left join personas_capacitables pc on pc.tenant_id = a.tenant_id and pc.id = a.persona_id
        where a.tenant_id = $1 and a.periodo_id = $2
        order by a.created_at`,
      [p.sesion.tenantId, periodo.id],
    )

    const auditores: AuditorDesignadoGuardado[] = (aud.rows as FilaAuditor[]).map((f) => ({
      id: f.id,
      tipo: f.tipo,
      designadoEn: f.designado_en,
      sustituidoEn: f.sustituido_en,
      motivoSustitucion: f.motivo_sustitucion,
      personaId: f.persona_id,
      personaNombre: f.persona_nombre,
      esElRec: f.es_el_rec,
      tieneConstanciaAcreditada: f.tiene_constancia_acreditada,
      nombre: f.nombre,
      profesion: f.profesion,
      cedulaProfesional: f.cedula_profesional,
      aniosExperiencia: f.anios_experiencia,
      certificacionUifFolio: f.certificacion_uif_folio,
      certificacionUifVence: f.certificacion_uif_vence,
    }))

    auditorVigente = auditores.find((a) => a.sustituidoEn === null) ?? null
    historiaDeAuditores = auditores.filter((a) => a.sustituidoEn !== null)
  }

  return {
    anio: p.anio,
    plazos,
    periodo,
    coherenciaDeLaRuta: coherencia,
    auditorVigente,
    historiaDeAuditores,
  }
}
