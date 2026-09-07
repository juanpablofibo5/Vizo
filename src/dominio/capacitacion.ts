import type { FechaISO } from './fechas'

/**
 * La cobertura del Cap. XII: quién falta por capacitar y qué tema no se cubrió.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE Y QUÉ NO
 * ────────────────────────────────────────────────────────────────────────────
 * VIZO **no imparte** la capacitación: la fr. III exige que quien la imparta
 * acredite cinco años de experiencia en la materia, y eso no es algo que un
 * sistema pueda ser. Lo que VIZO puede hacer —y es lo que decide si el
 * obligado llega al 31 de diciembre cumplido— es decir, en cualquier momento
 * del periodo, **quién falta y qué falta**.
 *
 * Igual que la cobertura de la metodología, cada respuesta es un HECHO
 * consultable y nunca un juicio: que alguien haya asistido no dice que haya
 * aprendido. Lo que el artículo pide acreditar es que la capacitación se llevó
 * a cabo, con su evaluación y su constancia.
 */

export type RolCapacitacion =
  // ¶1, primer grupo: gobierno y dirección.
  | 'consejo_administracion'
  | 'administrador_unico'
  | 'directivo'
  | 'funcionario'
  | 'rec'
  // ¶1, «y, EN TODO CASO, a sus empleados que…»
  | 'atencion_publico'
  | 'identificacion_cliente'
  | 'envio_avisos'
  | 'auditoria'

/** Los cuatro incisos de la fr. I más la fr. II. */
export type TemaCapacitacion =
  | 'marco_normativo'
  | 'manual_politicas'
  | 'actos_articulo_17'
  | 'riesgos_del_obligado'
  | 'tecnicas_400_bis'

export const TEMAS_MINIMOS: readonly TemaCapacitacion[] = [
  'marco_normativo',
  'manual_politicas',
  'actos_articulo_17',
  'riesgos_del_obligado',
  'tecnicas_400_bis',
]

export const NOMBRE_DEL_TEMA: Record<TemaCapacitacion, string> = {
  marco_normativo: 'la Ley, su Reglamento, estas reglas y las Resoluciones de formatos',
  manual_politicas: 'el Manual de Políticas Internas del obligado',
  actos_articulo_17: 'los actos u operaciones del Art. 17 de la Ley',
  riesgos_del_obligado: 'los Riesgos a que está expuesto el obligado',
  tecnicas_400_bis: 'técnicas, métodos y tendencias del Art. 400 Bis del CPF',
}

export const FUNDAMENTO_DEL_TEMA: Record<TemaCapacitacion, string> = {
  marco_normativo: 'Art. 39 Bis fr. I inciso a)',
  manual_politicas: 'Art. 39 Bis fr. I inciso b)',
  actos_articulo_17: 'Art. 39 Bis fr. I inciso c)',
  riesgos_del_obligado: 'Art. 39 Bis fr. I inciso d)',
  tecnicas_400_bis: 'Art. 39 Bis fr. II',
}

export const NOMBRE_DEL_ROL: Record<RolCapacitacion, string> = {
  consejo_administracion: 'consejo de administración',
  administrador_unico: 'administrador único o equivalente',
  directivo: 'directivos',
  funcionario: 'funcionarios',
  rec: 'Representante Encargado de Cumplimiento',
  atencion_publico: 'atención al público',
  identificacion_cliente: 'identificación o conocimiento del cliente',
  envio_avisos: 'envío de avisos',
  auditoria: 'auditoría',
}

export interface PersonaEnPlantilla {
  readonly id: string
  readonly nombre: string
  readonly rol: RolCapacitacion
  readonly ingresoAlArea: FechaISO
  readonly bajaDelArea: FechaISO | null
}

export interface SesionImpartida {
  readonly id: string
  readonly titulo: string
  readonly fecha: FechaISO
  readonly temas: readonly TemaCapacitacion[]
  readonly instructorNombre: string
  readonly instructorAniosExperiencia: number
  readonly acreditaConDocumento: boolean
  /** Ids de las personas con asistencia registrada. */
  readonly asistentes: readonly string[]
  /** Ids de las personas con constancia expedida (implica evaluación ok). */
  readonly conConstancia: readonly string[]
}

// ─────────────────────────────────────────────────────────────────────────
// La coherencia temas↔metodología (Art. 39 Bis fr. I, párrafo final)
// ─────────────────────────────────────────────────────────────────────────

/**
 * El fundamento que la UI cita junto al estado de coherencia.
 *
 * Sigue el estilo de `FUNDAMENTO_DEL_TEMA`: una cadena corta y estable, para
 * que la pantalla no tenga que repetir el artículo entero cada vez.
 */
export const FUNDAMENTO_DE_LA_COHERENCIA = 'Art. 39 Bis fr. I, párrafo final'

/**
 * ¿La sesión tiene una declaración de coherencia, y sigue mirando a la
 * evaluación de entidad vigente?
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ TRES ESTADOS Y NO UN BOOLEANO
 * ────────────────────────────────────────────────────────────────────────
 * El párrafo final del Art. 39 Bis fr. I (línea 433) pide que los temas sean
 * «coherentes con los RESULTADOS de la implementación de la metodología». La
 * metodología no es estática: cada vez que se corre una evaluación de entidad
 * nueva (Cap. II Quáter), hay resultados nuevos contra los que medir. Una
 * declaración vieja no se vuelve FALSA cuando eso pasa —sigue siendo cierto
 * que, en su momento, alguien la declaró coherente con lo que existía
 * entonces—; se vuelve una declaración que habla de OTRA evaluación. Decirlo
 * como «sobre otra evaluación» es un hecho; decir «vencida» inventaría un
 * plazo que el artículo no fija (mismo criterio del ADR-25 con el
 * cuestionario del Art. 23 Ter 3).
 *
 * `sin_declarar` y `sobre_otra_evaluacion` son ambos "no cubierto" para la
 * cobertura del periodo, pero la pantalla necesita distinguirlos: al segundo
 * ya se le declaró coherencia alguna vez, solo que contra un resultado que ya
 * no es el último.
 */
export type CoherenciaDeSesion =
  | { readonly estado: 'sin_declarar' }
  | { readonly estado: 'declarada'; readonly evaluacionEntidadId: string; readonly declaradaEn: string }
  | {
      readonly estado: 'sobre_otra_evaluacion'
      readonly evaluacionEntidadId: string
      readonly declaradaEn: string
    }

/**
 * Resuelve la coherencia de una sesión a partir de sus declaraciones y de
 * cuál es la evaluación de entidad vigente del obligado.
 *
 * Solo mira la declaración MÁS RECIENTE (por `declaradaEn`): re-declarar es
 * una fila nueva, nunca una corrección de la anterior (ADR-34), así que la
 * pregunta «¿esta sesión está cubierta?» solo la contesta la última palabra
 * que alguien dijo sobre ella.
 *
 * Si hay declaraciones pero no hay evaluación vigente, es un dato que no
 * cuadra: las evaluaciones de entidad son append-only (`evaluaciones_entidad`
 * nunca se vacía), así que una declaración solo puede existir si en algún
 * momento hubo, al menos, la evaluación contra la que se ancló. La regla dura
 * 6 manda morir en vez de adivinar cuál «hueco» mostrar.
 */
export function coherenciaDeSesion(args: {
  readonly declaraciones: readonly { evaluacionEntidadId: string; declaradaEn: string }[]
  readonly evaluacionVigenteId: string | null
}): CoherenciaDeSesion {
  const { declaraciones, evaluacionVigenteId } = args
  if (declaraciones.length === 0) return { estado: 'sin_declarar' }

  const masReciente = [...declaraciones].sort((a, b) =>
    a.declaradaEn < b.declaradaEn ? 1 : a.declaradaEn > b.declaradaEn ? -1 : 0,
  )[0]
  // El sort no puede dejar `masReciente` en `undefined`: ya se comprobó arriba
  // que `declaraciones.length > 0`.
  if (masReciente === undefined) throw new Error('coherenciaDeSesion: estado inalcanzable')

  if (evaluacionVigenteId === null) {
    throw new Error(
      'Hay una declaración de coherencia sin ninguna evaluación de entidad vigente. Las ' +
        'evaluaciones de entidad son append-only: no pueden desaparecer. Es un dato que no ' +
        'cuadra, y no se calcula en silencio sobre él (regla dura 6).',
    )
  }

  return masReciente.evaluacionEntidadId === evaluacionVigenteId
    ? { estado: 'declarada', evaluacionEntidadId: masReciente.evaluacionEntidadId, declaradaEn: masReciente.declaradaEn }
    : {
        estado: 'sobre_otra_evaluacion',
        evaluacionEntidadId: masReciente.evaluacionEntidadId,
        declaradaEn: masReciente.declaradaEn,
      }
}

/**
 * Quién debía capacitarse en el periodo.
 *
 * Una persona cuenta si estuvo en su área **en algún momento del año**: alguien
 * que entró en marzo y salió en septiembre tuvo que capacitarse igual, y
 * excluirlo por no estar el 31 de diciembre dejaría un hueco justo donde el ¶3
 * del Art. 39 Bis 1 pone el acento — el ingreso al área.
 */
export function plantillaDelPeriodo(
  personas: readonly PersonaEnPlantilla[],
  anio: number,
): PersonaEnPlantilla[] {
  const inicio = `${String(anio)}-01-01`
  const fin = `${String(anio)}-12-31`
  return personas.filter(
    (p) => p.ingresoAlArea <= fin && (p.bajaDelArea === null || p.bajaDelArea >= inicio),
  )
}

export interface FaltaDeTema {
  readonly tema: TemaCapacitacion
  readonly fundamento: string
  readonly comoLoDiceElArticulo: string
}

export interface FaltaDePersona {
  readonly personaId: string
  readonly nombre: string
  readonly rol: RolCapacitacion
  /** `sin_sesion` no asistió a ninguna; `sin_constancia` asistió pero no acredita. */
  readonly motivo: 'sin_sesion' | 'sin_constancia'
}

export interface InstructorSinAcreditar {
  readonly sesionId: string
  readonly titulo: string
  readonly instructor: string
  readonly motivo: 'anios_insuficientes' | 'sin_documento'
  readonly aniosDeclarados: number
}

export interface CoberturaDelPeriodo {
  readonly anio: number
  readonly huboAlgunaSesion: boolean
  /**
   * Cuánta gente tenía que capacitarse EN ESTE PERIODO.
   *
   * No es `personas.length`: quien se dio de baja el año pasado sigue en el
   * padrón y no cuenta aquí. La pantalla lo necesita para no decir «toda la
   * plantilla acredita» cuando lo cierto es que no había a quién medir —cero
   * de cero no es cumplimiento— y no puede deducirlo de `personasFaltantes`,
   * que también está vacío en ese caso.
   */
  readonly personasEnElPeriodo: number
  readonly temasFaltantes: readonly FaltaDeTema[]
  readonly personasFaltantes: readonly FaltaDePersona[]
  readonly instructoresSinAcreditar: readonly InstructorSinAcreditar[]
  readonly acreditado: boolean
}

/**
 * La cobertura del periodo anual.
 *
 * Tres cosas tienen que cumplirse a la vez y por eso se reportan por separado:
 * que los cinco temas del artículo se hayan cubierto, que cada persona de la
 * plantilla tenga su constancia, y que quien impartió acredite la experiencia
 * de la fr. III.
 *
 * `experienciaMinima` llega del catálogo (`capacitacion_experiencia_minima_anios`),
 * no escrito aquí: la regla dura 1 vale también para este capítulo.
 */
export function coberturaDelPeriodo(entrada: {
  readonly anio: number
  readonly personas: readonly PersonaEnPlantilla[]
  readonly sesiones: readonly SesionImpartida[]
  readonly experienciaMinima: number
}): CoberturaDelPeriodo {
  const { anio, sesiones, experienciaMinima } = entrada
  const plantilla = plantillaDelPeriodo(entrada.personas, anio)

  // ── Los cinco temas ──────────────────────────────────────────────────
  const cubiertos = new Set(sesiones.flatMap((s) => s.temas))
  const temasFaltantes: FaltaDeTema[] = TEMAS_MINIMOS.filter((t) => !cubiertos.has(t)).map((t) => ({
    tema: t,
    fundamento: FUNDAMENTO_DEL_TEMA[t],
    comoLoDiceElArticulo: NOMBRE_DEL_TEMA[t],
  }))

  // ── Persona por persona ──────────────────────────────────────────────
  // Se exige CONSTANCIA, no asistencia: el ¶2 del Art. 39 Bis 1 ata la
  // constancia a una evaluación satisfactoria, así que es lo único que
  // acredita que la capacitación surtió efecto. Contar asistencias diría que
  // basta con sentarse en la sala.
  const asistio = new Set(sesiones.flatMap((s) => s.asistentes))
  const acredita = new Set(sesiones.flatMap((s) => s.conConstancia))
  const personasFaltantes: FaltaDePersona[] = plantilla
    .filter((p) => !acredita.has(p.id))
    .map((p) => ({
      personaId: p.id,
      nombre: p.nombre,
      rol: p.rol,
      motivo: asistio.has(p.id) ? ('sin_constancia' as const) : ('sin_sesion' as const),
    }))

  // ── La fr. III ───────────────────────────────────────────────────────
  const instructoresSinAcreditar: InstructorSinAcreditar[] = sesiones.flatMap<InstructorSinAcreditar>((s) => {
    if (s.instructorAniosExperiencia < experienciaMinima) {
      return [
        {
          sesionId: s.id,
          titulo: s.titulo,
          instructor: s.instructorNombre,
          motivo: 'anios_insuficientes' as const,
          aniosDeclarados: s.instructorAniosExperiencia,
        },
      ]
    }
    // «deberá CONTAR Y ACREDITAR»: son dos cosas, y declarar los años sin el
    // documento cumple una sola.
    if (!s.acreditaConDocumento) {
      return [
        {
          sesionId: s.id,
          titulo: s.titulo,
          instructor: s.instructorNombre,
          motivo: 'sin_documento' as const,
          aniosDeclarados: s.instructorAniosExperiencia,
        },
      ]
    }
    return []
  })

  return {
    anio,
    huboAlgunaSesion: sesiones.length > 0,
    personasEnElPeriodo: plantilla.length,
    temasFaltantes,
    personasFaltantes,
    instructoresSinAcreditar,
    /*
      SIN `sesiones.length > 0`, Y A PROPÓSITO.
      La primera versión lo incluía para expresar el «por lo menos una vez al
      año» de la fr. I. Es lógica muerta: los temas SALEN de las sesiones, así
      que sin ninguna sesión los cinco faltan y la conjunción ya da falso. Se
      descubrió sabotéandolo —quitarlo no rompió ninguna prueba—, y una guarda
      que ningún caso puede defender no se queda «por si acaso»: se va, porque
      el día que estorbe nadie sabrá si podía quitarse.
      `huboAlgunaSesion` sí se conserva en la salida: la pantalla necesita
      distinguir «no se ha impartido nada» de «se impartió y faltan temas».
    */
    acreditado:
      temasFaltantes.length === 0 &&
      personasFaltantes.length === 0 &&
      instructoresSinAcreditar.length === 0,
  }
}

/**
 * ¿Alguien entró a su área y todavía no se capacita?
 *
 * Es el ¶3 del Art. 39 Bis 1, que es una obligación DISTINTA de la anual:
 * «deberán recibir capacitación […] de manera previa o simultánea a su ingreso
 * o al inicio de sus actividades en dichas áreas». No espera al calendario.
 *
 * El texto lo pide para quienes «vayan a operar o laborar en áreas de atención
 * al público o de administración de recursos». Los otros papeles del ¶1 —el
 * consejo, la auditoría— no están en esa frase, así que aquí tampoco.
 */
const AREAS_DEL_PARRAFO_TERCERO: readonly RolCapacitacion[] = ['atencion_publico', 'envio_avisos']

export interface IngresoSinCapacitar {
  readonly personaId: string
  readonly nombre: string
  readonly rol: RolCapacitacion
  readonly ingresoAlArea: FechaISO
  readonly diasDesdeElIngreso: number
}

export function ingresosSinCapacitar(entrada: {
  readonly personas: readonly PersonaEnPlantilla[]
  readonly sesiones: readonly SesionImpartida[]
  readonly hoy: FechaISO
}): IngresoSinCapacitar[] {
  const { personas, sesiones, hoy } = entrada
  const acredita = new Set(sesiones.flatMap((s) => s.conConstancia))

  return personas
    .filter((p) => AREAS_DEL_PARRAFO_TERCERO.includes(p.rol))
    .filter((p) => p.bajaDelArea === null || p.bajaDelArea >= hoy)
    .filter((p) => p.ingresoAlArea <= hoy)
    .filter((p) => !acredita.has(p.id))
    .map((p) => ({
      personaId: p.id,
      nombre: p.nombre,
      rol: p.rol,
      ingresoAlArea: p.ingresoAlArea,
      diasDesdeElIngreso: dias(p.ingresoAlArea, hoy),
    }))
}

function dias(desde: FechaISO, hasta: FechaISO): number {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
