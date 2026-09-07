import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  coberturaDelPeriodo,
  coherenciaDeSesion,
  ingresosSinCapacitar,
  type CoberturaDelPeriodo,
  type CoherenciaDeSesion,
  type IngresoSinCapacitar,
  type PersonaEnPlantilla,
  type RolCapacitacion,
  type SesionImpartida,
  type TemaCapacitacion,
} from '../dominio/capacitacion'

/**
 * El Cap. XII en la base (Arts. 39 Bis y 39 Bis 1 del Acuerdo 115/2026).
 *
 * Este módulo trae los hechos y deja que el dominio decida qué falta. Lo único
 * que resuelve por su cuenta es de dónde salen los plazos: del catálogo, con
 * el mismo criterio de vista anticipada que usa el Cap. III Quáter — el primer
 * periodo empieza el 1 de enero de 2027, así que hoy la fila del catálogo
 * todavía no está vigente y aun así hay que poder configurar y ensayar.
 */

export class DatoDeCapacitacionInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeCapacitacionInvalido'
  }
}

export class PlazoDeCapacitacionAusente extends Error {
  constructor(clave: string) {
    super(
      `El catálogo no tiene el plazo "${clave}" y sin él no se puede decir si un instructor ` +
        'acredita la experiencia que pide el Art. 39 Bis fr. III. Se detiene en vez de suponer ' +
        'un número: el plazo se siembra con su fuente del DOF (regla dura 1).',
    )
    this.name = 'PlazoDeCapacitacionAusente'
  }
}

/**
 * No hay ninguna evaluación de entidad contra la cual declarar coherencia.
 *
 * El Art. 39 Bis fr. I, párrafo final, pide coherencia con los RESULTADOS de
 * la metodología del Cap. II Quáter: sin una evaluación de entidad corrida no
 * hay resultado que citar, y la base lo respalda con un trigger (nivel 2). El
 * mensaje dice qué hacer, no solo qué faltó.
 */
export class SinEvaluacionDeEntidad extends Error {
  constructor() {
    super(
      'Este obligado todavía no tiene ninguna evaluación de entidad. El Art. 39 Bis fr. I pide ' +
        'coherencia con los resultados de la metodología del Capítulo II Quáter: primero hay que ' +
        'correr esa evaluación (Configuración → Riesgo de la entidad) y luego declarar la ' +
        'coherencia de la sesión.',
    )
    this.name = 'SinEvaluacionDeEntidad'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

/**
 * Los plazos del capítulo, con su vigencia.
 *
 * Antes del 1 de enero de 2027 no hay fila vigente: se toma la PRÓXIMA y se
 * marca `anticipado`. Es el mismo criterio de `reglasDeVigencia` en el módulo
 * PEP, y existe por la misma razón — el obligado necesita configurar antes de
 * que le sea exigible, y esconder el capítulo hasta el día 1 sería llegar tarde.
 */
export interface PlazosDeCapacitacion {
  readonly experienciaMinimaAnios: number
  readonly periodicidadMeses: number
  readonly retencionAnios: number
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
  if (f === undefined) throw new PlazoDeCapacitacionAusente(clave)
  return f
}

export async function plazosDeCapacitacion(
  db: EjecutorSql,
  hoy: string,
): Promise<PlazosDeCapacitacion> {
  const experiencia = await plazo(db, 'capacitacion_experiencia_minima_anios')
  const periodicidad = await plazo(db, 'capacitacion_periodicidad_meses')
  const retencion = await plazo(db, 'capacitacion_retencion_anios')
  return {
    experienciaMinimaAnios: experiencia.valor,
    periodicidadMeses: periodicidad.valor,
    retencionAnios: retencion.valor,
    exigibleDesde: experiencia.desde,
    anticipado: hoy < experiencia.desde,
  }
}

export interface SesionGuardada extends SesionImpartida {
  readonly instructorAcreditaHash: string | null
  readonly instructorAcreditaArchivo: string | null
  readonly materialHash: string | null
  /** A qué papeles del ¶1 se dirigió (Art. 39 Bis fr. I, línea 433: «adecuarse a las responsabilidades»). */
  readonly dirigidaA: readonly RolCapacitacion[]
  /** ¿Sus temas están declarados coherentes con los resultados de la metodología vigente? */
  readonly coherencia: CoherenciaDeSesion
}

/**
 * Una asistencia sin evaluación asentada.
 *
 * No es un adorno de la pantalla: es la lista de trabajo del ¶2. Mientras
 * alguien esté aquí, asistió a un curso que todavía no acredita nada, y la
 * cobertura del periodo lo cuenta como faltante.
 */
export interface AsistenciaPendiente {
  readonly asistenciaId: string
  readonly personaNombre: string
  readonly sesionTitulo: string
  readonly sesionFecha: string
}

export interface EstadoDeCapacitacion {
  readonly anio: number
  readonly programaId: string | null
  readonly plantilla: readonly PersonaEnPlantilla[]
  readonly sesiones: readonly SesionGuardada[]
  readonly pendientesDeEvaluar: readonly AsistenciaPendiente[]
  readonly cobertura: CoberturaDelPeriodo
  /** ¶3 del Art. 39 Bis 1: obligación distinta de la anual. */
  readonly ingresosPendientes: readonly IngresoSinCapacitar[]
  readonly plazos: PlazosDeCapacitacion
  /** Contra qué evaluación de entidad se declararía coherencia hoy. `null` = todavía ninguna. */
  readonly evaluacionVigente: { readonly id: string; readonly evaluadoEn: string } | null
}

interface FilaPersona {
  id: string
  nombre: string
  rol: RolCapacitacion
  ingreso_al_area: string
  baja_del_area: string | null
}

interface FilaDeclaracion {
  evaluacionEntidadId: string
  declaradaEn: string
}

interface FilaSesion {
  id: string
  titulo: string
  fecha: string
  temas: TemaCapacitacion[]
  dirigida_a: RolCapacitacion[]
  instructor_nombre: string
  instructor_anios_experiencia: number
  instructor_acredita_hash: string | null
  instructor_acredita_archivo: string | null
  material_hash: string | null
  asistentes: string[]
  con_constancia: string[]
  declaraciones: FilaDeclaracion[]
}

export async function estadoDeCapacitacion(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; anio: number; hoy: string },
): Promise<EstadoDeCapacitacion> {
  await exigirSesionActiva(db, p.sesion)
  const plazos = await plazosDeCapacitacion(db, p.hoy)

  const per = await db.query(
    `select id::text, nombre, rol::text as rol,
            ingreso_al_area::text as ingreso_al_area,
            baja_del_area::text as baja_del_area
       from personas_capacitables
      where tenant_id = $1
      order by rol, nombre`,
    [p.sesion.tenantId],
  )
  const plantilla: PersonaEnPlantilla[] = (per.rows as FilaPersona[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    rol: f.rol,
    ingresoAlArea: f.ingreso_al_area,
    bajaDelArea: f.baja_del_area,
  }))

  const prog = await db.query(
    `select id::text from programas_capacitacion where tenant_id = $1 and anio = $2`,
    [p.sesion.tenantId, p.anio],
  )
  const programaId = (prog.rows[0] as { id: string } | undefined)?.id ?? null

  // La evaluación de entidad más reciente del obligado: es contra la que
  // `declararCoherencia` ancla, y contra la que aquí se compara cada sesión.
  // Una sola consulta, fuera del bucle de sesiones — igual que la plantilla.
  const eval_ = await db.query(
    `select id::text, evaluado_en::text as evaluado_en
       from evaluaciones_entidad
      where tenant_id = $1
      order by secuencia desc
      limit 1`,
    [p.sesion.tenantId],
  )
  const evalVigente = eval_.rows[0] as { id: string; evaluado_en: string } | undefined
  const evaluacionVigente = evalVigente === undefined
    ? null
    : { id: evalVigente.id, evaluadoEn: evalVigente.evaluado_en }

  // Las asistencias, las constancias y las declaraciones de coherencia se
  // agregan en la misma consulta: son subconjuntos de la sesión, y traerlos
  // por separado abre la puerta a que se desincronicen entre sí (misma razón
  // que ya juntaba asistentes y con_constancia).
  const ses = programaId === null
    ? { rows: [] }
    : await db.query(
        `select s.id::text, s.titulo, s.fecha::text, s.temas::text[] as temas,
                s.dirigida_a::text[] as dirigida_a,
                s.instructor_nombre, s.instructor_anios_experiencia,
                s.instructor_acredita_hash, s.instructor_acredita_archivo, s.material_hash,
                coalesce((select array_agg(a.persona_id::text)
                            from asistencias_capacitacion a where a.sesion_id = s.id),
                         '{}'::text[]) as asistentes,
                coalesce((select array_agg(a.persona_id::text)
                            from asistencias_capacitacion a
                           where a.sesion_id = s.id and a.constancia_folio is not null),
                         '{}'::text[]) as con_constancia,
                coalesce(
                  (select jsonb_agg(jsonb_build_object(
                             'evaluacionEntidadId', dc.evaluacion_entidad_id::text,
                             'declaradaEn', dc.created_at::text))
                     from declaraciones_coherencia dc where dc.sesion_id = s.id),
                  '[]'::jsonb) as declaraciones
           from sesiones_capacitacion s
          where s.tenant_id = $1 and s.programa_id = $2
          order by s.fecha`,
        [p.sesion.tenantId, programaId],
      )

  const sesiones: SesionGuardada[] = (ses.rows as FilaSesion[]).map((f) => ({
    id: f.id,
    titulo: f.titulo,
    fecha: f.fecha,
    temas: f.temas,
    dirigidaA: f.dirigida_a,
    instructorNombre: f.instructor_nombre,
    instructorAniosExperiencia: f.instructor_anios_experiencia,
    // «contar Y acreditar»: el documento es la segunda mitad de la fr. III.
    acreditaConDocumento: f.instructor_acredita_hash !== null,
    asistentes: f.asistentes,
    conConstancia: f.con_constancia,
    instructorAcreditaHash: f.instructor_acredita_hash,
    instructorAcreditaArchivo: f.instructor_acredita_archivo,
    materialHash: f.material_hash,
    coherencia: coherenciaDeSesion({
      declaraciones: f.declaraciones,
      evaluacionVigenteId: evaluacionVigente?.id ?? null,
    }),
  }))

  const pen = programaId === null
    ? { rows: [] }
    : await db.query(
        `select a.id::text as asistencia_id, pc.nombre as persona_nombre,
                s.titulo as sesion_titulo, s.fecha::text as sesion_fecha
           from asistencias_capacitacion a
           join sesiones_capacitacion s on s.id = a.sesion_id
           join personas_capacitables pc on pc.id = a.persona_id
          where a.tenant_id = $1 and s.programa_id = $2 and a.evaluacion_fecha is null
          order by s.fecha, pc.nombre`,
        [p.sesion.tenantId, programaId],
      )

  return {
    anio: p.anio,
    programaId,
    plantilla,
    sesiones,
    pendientesDeEvaluar: (
      pen.rows as Array<{
        asistencia_id: string
        persona_nombre: string
        sesion_titulo: string
        sesion_fecha: string
      }>
    ).map((f) => ({
      asistenciaId: f.asistencia_id,
      personaNombre: f.persona_nombre,
      sesionTitulo: f.sesion_titulo,
      sesionFecha: f.sesion_fecha,
    })),
    cobertura: coberturaDelPeriodo({
      anio: p.anio,
      personas: plantilla,
      sesiones,
      experienciaMinima: plazos.experienciaMinimaAnios,
    }),
    ingresosPendientes: ingresosSinCapacitar({ personas: plantilla, sesiones, hoy: p.hoy }),
    plazos,
    evaluacionVigente,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Escrituras
// ─────────────────────────────────────────────────────────────────────────

export async function agregarAPlantilla(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    nombre: string
    rol: RolCapacitacion
    ingresoAlArea: string
  },
): Promise<{ personaId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (p.nombre.trim() === '') {
      throw new DatoDeCapacitacionInvalido(['Falta el nombre de la persona.'])
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.ingresoAlArea)) {
      throw new DatoDeCapacitacionInvalido([
        'Falta la fecha de ingreso al área. El Art. 39 Bis 1 ¶3 ata la capacitación al ingreso, ' +
          'no al alta en el sistema.',
      ])
    }
    const { rows } = await db.query(
      `insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area)
       values ($1,$2,$3::rol_capacitacion,$4::date) returning id::text`,
      [p.sesion.tenantId, p.nombre.trim(), p.rol, p.ingresoAlArea],
    )
    return { personaId: (rows[0] as { id: string }).id }
  })
}

/**
 * Da de baja a alguien del área.
 *
 * No es un borrado y no puede serlo: quien estuvo en su área parte del año
 * cuenta para ese periodo entero (`plantillaDelPeriodo`), y borrarlo cambiaría
 * hacia atrás la respuesta a «quién faltaba». La baja dice desde cuándo dejó
 * de contar sin tocar lo que ya pasó.
 */
export async function darDeBajaDelArea(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; personaId: string; fecha: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) {
      throw new DatoDeCapacitacionInvalido(['Falta la fecha en que dejó el área.'])
    }
    const { rows } = await db.query(
      `update personas_capacitables set baja_del_area = $3::date
        where tenant_id = $1 and id = $2 and baja_del_area is null
      returning id::text`,
      [p.sesion.tenantId, p.personaId, p.fecha],
    )
    if (rows.length === 0) {
      throw new DatoDeCapacitacionInvalido([
        'Esa persona no está en la plantilla de este obligado, o ya tiene una baja registrada.',
      ])
    }
  })
}

export interface DatosSesion {
  readonly titulo: string
  readonly fecha: string
  readonly temas: readonly TemaCapacitacion[]
  /** A qué papeles del ¶1 se dirigió (Art. 39 Bis fr. I, línea 433: «adecuarse a las responsabilidades»). */
  readonly dirigidaA: readonly RolCapacitacion[]
  readonly instructorNombre: string
  readonly instructorAniosExperiencia: number
  readonly acreditacion?:
    | { readonly hash: string; readonly archivo: string }
    | undefined
  /** Ids de la plantilla que asistieron. */
  readonly asistentes: readonly string[]
}

/**
 * Registra una sesión y su lista de asistencia.
 *
 * El programa del año se crea aquí si no existe: pedirle al usuario que cree
 * primero un «programa» vacío y luego la sesión sería un paso de burocracia
 * que el artículo no pide — lo que el 39 Bis exige es que haya cursos, y el
 * programa es el contenedor del periodo.
 *
 * NO se registran evaluaciones ni constancias en este paso: llegan después de
 * la sesión, y el ¶2 del 39 Bis 1 las ata entre sí.
 */
export async function registrarSesion(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; anio: number; datos: DatosSesion; hoy: string },
): Promise<{ sesionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const problemas: string[] = []
    if (p.datos.titulo.trim() === '') problemas.push('Falta el título de la sesión.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.datos.fecha)) problemas.push('Falta la fecha de la sesión.')
    if (p.datos.temas.length === 0) {
      problemas.push(
        'La sesión no cubre ningún tema. El Art. 39 Bis fr. I y II fijan cinco: sin al menos uno, ' +
          'la sesión no acredita nada.',
      )
    }
    if (p.datos.instructorNombre.trim() === '') {
      problemas.push('Falta quién impartió la sesión (Art. 39 Bis fr. III).')
    }
    if (p.datos.dirigidaA.length === 0) {
      problemas.push(
        'La sesión no dice a qué papeles se dirigió. El Art. 39 Bis fr. I, línea 433, exige ' +
          '«adecuarse a las responsabilidades de los miembros de sus respectivos consejos de ' +
          'administración, administrador único, directivos, funcionarios y, en todo caso de sus ' +
          'empleados»: sin destinatario declarado no hay con qué responsabilidad adecuarse.',
      )
    }

    const plazos = await plazosDeCapacitacion(db, p.hoy)
    if (p.datos.instructorAniosExperiencia < plazos.experienciaMinimaAnios) {
      problemas.push(
        `Quien imparta debe acreditar al menos ${String(plazos.experienciaMinimaAnios)} años de ` +
          'experiencia en la materia (Art. 39 Bis fr. III), y se declararon ' +
          `${String(p.datos.instructorAniosExperiencia)}.`,
      )
    }
    if (p.datos.acreditacion !== undefined && !/^[0-9a-f]{64}$/.test(p.datos.acreditacion.hash)) {
      problemas.push('La huella del documento que acredita la experiencia no es un SHA-256.')
    }
    if (problemas.length > 0) throw new DatoDeCapacitacionInvalido(problemas)

    // Una sesión que todavía no se impartió no acredita nada: lo que el Art.
    // 39 Bis pide conservar es evidencia de cursos DADOS, con su lista de
    // asistencia. Registrar el de la semana que entra crearía asistentes de
    // una sesión a la que nadie fue.
    if (p.datos.fecha > p.hoy) {
      throw new DatoDeCapacitacionInvalido([
        `La sesión está fechada el ${p.datos.fecha} y hoy es ${p.hoy}. Se registra lo impartido, ` +
          'no lo programado: la lista de asistencia de una sesión que no ha ocurrido no acredita nada.',
      ])
    }

    if (new Date(p.datos.fecha).getUTCFullYear() !== p.anio) {
      throw new DatoDeCapacitacionInvalido([
        `La sesión es del ${p.datos.fecha} y se está registrando en el periodo ${String(p.anio)}. ` +
          'El periodo es el año calendario (Transitorio Séptimo): una sesión de otro año no lo cubre.',
      ])
    }

    // El programa del periodo, si todavía no existe.
    const prog = await db.query(
      `insert into programas_capacitacion (tenant_id, anio)
       values ($1,$2)
       on conflict (tenant_id, anio) do update set anio = excluded.anio
       returning id::text`,
      [p.sesion.tenantId, p.anio],
    )
    const programaId = (prog.rows[0] as { id: string }).id

    const a = p.datos.acreditacion
    // Deduplicar: declarar el mismo papel dos veces no dirige la sesión a más
    // gente, y dejarlo pasar produciría un array con relleno que no dice nada.
    const dirigidaA = [...new Set(p.datos.dirigidaA)]
    const { rows } = await db.query(
      `insert into sesiones_capacitacion
         (tenant_id, programa_id, titulo, fecha, temas, dirigida_a, instructor_nombre,
          instructor_anios_experiencia, instructor_acredita_hash,
          instructor_acredita_archivo, registrado_por)
       values ($1,$2,$3,$4::date,$5::tema_capacitacion[],$6::rol_capacitacion[],$7,$8,$9,$10,$11)
       returning id::text`,
      [
        p.sesion.tenantId,
        programaId,
        p.datos.titulo.trim(),
        p.datos.fecha,
        `{${p.datos.temas.join(',')}}`,
        `{${dirigidaA.join(',')}}`,
        p.datos.instructorNombre.trim(),
        p.datos.instructorAniosExperiencia,
        a?.hash ?? null,
        a?.archivo ?? null,
        p.sesion.usuarioId,
      ],
    )
    const sesionId = (rows[0] as { id: string }).id

    for (const personaId of p.datos.asistentes) {
      await db.query(
        `insert into asistencias_capacitacion (tenant_id, sesion_id, persona_id)
         values ($1,$2,$3)`,
        [p.sesion.tenantId, sesionId, personaId],
      )
    }

    return { sesionId }
  })
}

/**
 * Asienta la evaluación de un asistente y, si aprobó, su constancia.
 *
 * Los dos van juntos porque el ¶2 del Art. 39 Bis 1 los ata: «PARA EXPEDIR las
 * constancias […] deberán practicarles […] evaluaciones». Ofrecerlos por
 * separado invitaría a expedir primero y evaluar después, que es justo lo que
 * el texto invierte — y la base lo rechazaría con un `check_violation` que no
 * dice de qué artículo viene.
 */
export async function evaluarYAcreditar(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    asistenciaId: string
    satisfactoria: boolean
    fecha: string
    detalle?: string | undefined
    folio?: string | undefined
  },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) {
      throw new DatoDeCapacitacionInvalido(['Falta la fecha de la evaluación.'])
    }
    if (!p.satisfactoria && p.folio !== undefined && p.folio !== '') {
      throw new DatoDeCapacitacionInvalido([
        'No se expide constancia a quien no obtuvo resultado satisfactorio. El Art. 39 Bis 1 ¶2 ' +
          'ata una cosa a la otra, y el Manual de Políticas Internas dice qué hacer con quien no ' +
          'aprueba.',
      ])
    }
    // `returning` y no un UPDATE a secas: si el id no es de este obligado, RLS
    // no falla — filtra, y el UPDATE reporta éxito sin haber tocado nada. Sería
    // el modo de falla de la regla dura 6 exacto: la pantalla diría «constancia
    // registrada» y en el expediente no habría ninguna.
    const { rows } = await db.query(
      `update asistencias_capacitacion
          set evaluacion_satisfactoria = $2, evaluacion_fecha = $3::date,
              evaluacion_detalle = $4, constancia_folio = $5
        where tenant_id = $1 and id = $6
      returning id::text`,
      [
        p.sesion.tenantId,
        p.satisfactoria,
        p.fecha,
        p.detalle ?? null,
        p.satisfactoria ? (p.folio ?? null) : null,
        p.asistenciaId,
      ],
    )
    if (rows.length === 0) {
      throw new DatoDeCapacitacionInvalido([
        'Esa asistencia no existe en este obligado: no hay a quién evaluar.',
      ])
    }
  })
}

/**
 * Declara que los temas de una sesión son coherentes con los resultados de
 * la evaluación de entidad más reciente (Art. 39 Bis fr. I, línea 433).
 *
 * ────────────────────────────────────────────────────────────────────────
 * CONTRA QUÉ SE ANCLA, Y POR QUÉ AQUÍ Y NO EN LA BASE SOLAMENTE
 * ────────────────────────────────────────────────────────────────────────
 * Esta función elige sola la evaluación vigente (`order by secuencia desc
 * limit 1`, el mismo criterio que `estadoDeLaEntidad`): es el nivel 1 de la
 * regla dura 6 — que el error sea imposible de expresar, no que se detecte
 * después. El trigger `declaracion_contra_la_ultima_evaluacion` de la base es
 * el nivel 2, por si algún día algo se salta esta función.
 *
 * NO llama a ninguna otra función de persistencia: no hay riesgo de que
 * `enTransaccionDeSesion` se anide (ADR-41).
 */
export async function declararCoherencia(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; sesionId: string },
): Promise<{ declaracionId: string; evaluacionEntidadId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const ev = await db.query(
      `select id::text from evaluaciones_entidad
        where tenant_id = $1
        order by secuencia desc
        limit 1`,
      [p.sesion.tenantId],
    )
    const evaluacion = ev.rows[0] as { id: string } | undefined
    if (evaluacion === undefined) throw new SinEvaluacionDeEntidad()

    try {
      const { rows } = await db.query(
        `insert into declaraciones_coherencia
           (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
         values ($1,$2,$3,$4)
         returning id::text`,
        [p.sesion.tenantId, p.sesionId, evaluacion.id, p.sesion.usuarioId],
      )
      const declaracionId = (rows[0] as { id: string } | undefined)?.id
      // `returning` sin fila: mismo modo de falla que `evaluarYAcreditar` con
      // un id ajeno — RLS filtra en vez de fallar, y sin este chequeo la
      // pantalla diría «declarada» sobre una sesión que en realidad no se tocó.
      if (declaracionId === undefined) {
        throw new DatoDeCapacitacionInvalido([
          'La declaración de coherencia no se registró: no hubo confirmación de la base.',
        ])
      }
      return { declaracionId, evaluacionEntidadId: evaluacion.id }
    } catch (e) {
      if (e instanceof DatoDeCapacitacionInvalido) throw e
      // Las guardas de la base, dichas en palabras del artículo. Dejarlas
      // subir como `unique_violation` o `foreign_key_violation` obligaría al
      // usuario a adivinar qué constraint tiene ese nombre.
      const bruto = e instanceof Error ? e.message : String(e)
      if (/una_declaracion_por_sesion_y_evaluacion/.test(bruto)) {
        throw new DatoDeCapacitacionInvalido([
          'Esta sesión ya tiene una declaración de coherencia contra la evaluación de entidad ' +
            'vigente. Corregirla no es un UPDATE: si algo cambió, se declara de nuevo cuando ' +
            'llegue una evaluación de entidad nueva.',
        ])
      }
      if (/declaraciones_coherencia_tenant_id_sesion_id_fkey/.test(bruto)) {
        throw new DatoDeCapacitacionInvalido([
          'Esa sesión no existe en este obligado: no hay a qué declararle coherencia.',
        ])
      }
      throw e
    }
  })
}
