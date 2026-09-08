import { partes, ultimoDiaDelMes, type FechaISO } from './fechas'

/**
 * Cap. XIV — DE LA AUDITORÍA (Arts. 42-45, 50 ¶1). Fase 1: el periodo, la
 * ruta (interna o externa) y la fecha límite de entrega.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA RUTA YA ESTÁ RESUELTA EN OTRO LADO (ADR-28) — AQUÍ SOLO SE CONSUME
 * ────────────────────────────────────────────────────────────────────────────
 * Si el Riesgo del obligado (evaluaciones_entidad.grado_id → grados_riesgo.
 * es_alto) es bajo o medio, el Art. 44 permite dictamen de auditoría interna;
 * si es alto (o el obligado lo elige), el Art. 45 exige auditor externo
 * certificado por la UIF. Ese cómputo ya lo hace `estadoDeLaEntidad`
 * (src/persistencia/entidad.ts:382), que devuelve `auditoria:
 * 'externa_obligatoria' | 'interna_permitida'` por cada evaluación. Este
 * módulo NO recalcula esa ruta desde `es_alto`: la recibe ya resuelta y
 * decide qué hacer con ella en el tiempo (periodo, envejecimiento, plazos).
 */

export type RutaAuditoria = 'externa_obligatoria' | 'interna_permitida'
export type TipoAuditor = 'interna' | 'externa'

// ─────────────────────────────────────────────────────────────────────────
// El periodo — Arts. 42 y 43
// ─────────────────────────────────────────────────────────────────────────

export interface PeriodoCalculado {
  readonly anio: number
  readonly inicio: FechaISO
  /** Siempre 31-dic: los dos artículos cierran el mismo día. */
  readonly fin: FechaISO
  readonly esPrimerPeriodoDeOperaciones: boolean
  /**
   * No-null cuando el cálculo tuvo que ADIVINAR en lugar de saber. Hoy el
   * único caso es `inicioDeOperaciones` ausente en el año del primer
   * periodo: ver el comentario dentro de `periodoDeAuditoria`.
   */
  readonly advertencia: string | null
}

/**
 * El periodo de revisión de auditoría para el año `anio`, según lo que se
 * sepa del obligado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL AÑO PEDIDO DECIDE, Y NO SOLO `inicioDeOperaciones`
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 43 (línea 458) modifica el periodo SOLO para el primer año de
 * operaciones: «desde la fecha en que inicien operaciones […] y hasta el
 * treinta y uno de diciembre del SIGUIENTE año». Es un caso que ocurre UNA
 * vez por obligado, no en cada llamada. Una función pura no tiene memoria de
 * "ya abrí el primer periodo": la única manera de que sepa que YA PASÓ el
 * primer periodo y hoy toca uno ordinario es que quien pregunta diga POR
 * CUÁL año de cierre pregunta. Por eso el Art. 43 solo aplica cuando el año
 * pedido es EXACTAMENTE el año de cierre que le corresponde al inicio de
 * operaciones (`anioInicio + 1`): para cualquier año posterior, ya es un
 * periodo ordinario del Art. 42, así el obligado siga siendo relativamente
 * nuevo. Sin esta comparación, la función quedaría contestando el mismo
 * periodo largo para siempre, sin importar qué año se le pidiera — y eso sí
 * sería un cálculo mal hecho en silencio (regla dura 6).
 *
 * Consecuencia para quien llama (persistencia, y después la UI): para abrir
 * el PRIMER periodo de un obligado que inició operaciones dentro o después
 * del año del Transitorio Octavo, hay que pedir el año de CIERRE
 * (`inicioDeOperaciones` + 1 año), no "el año en curso". Es la función la
 * que sabe cuál es ese año — pero hay que pedírselo a ella, no adivinarlo
 * antes de llamarla.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Y POR QUÉ LOS AÑOS QUE EL PERIODO LARGO YA CUBRE NO SON UN PERIODO
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 43 no agrega un periodo: SUSTITUYE el del artículo anterior. Quien
 * inició operaciones el 15-may-2029 no tiene un periodo 2029 y otro 2030:
 * tiene UNO solo, del 15-may-2029 al 31-dic-2030. Pedir el 2029 no es pedir
 * un periodo corto — es pedir algo que no existe, y contestarlo con el
 * ordinario del Art. 42 dejaría abrir dos periodos solapados sobre los
 * mismos meses (`un_periodo_por_anio` no lo impide: son años distintos),
 * ambos plausibles y uno falso. Es el modo de falla de la regla dura 6, así
 * que se detiene diciendo cuál es el año de cierre que sí se puede abrir.
 */
export function periodoDeAuditoria(args: {
  readonly anio: number
  readonly primerPeriodoAnio: number
  readonly inicioDeOperaciones: FechaISO | null
}): PeriodoCalculado {
  const { anio, primerPeriodoAnio, inicioDeOperaciones } = args

  if (anio < primerPeriodoAnio) {
    throw new Error(
      `No hay auditoría que abrir para el año ${String(anio)}: el primer periodo de revisión de ` +
        `auditoría no inicia hasta ${String(primerPeriodoAnio)} (Transitorio Octavo). Antes de esa ` +
        'fecha el Cap. XIV todavía no es exigible.',
    )
  }

  if (inicioDeOperaciones !== null) {
    const anioInicio = partes(inicioDeOperaciones).anio

    if (anioInicio >= primerPeriodoAnio && anio <= anioInicio) {
      throw new Error(
        `El año ${String(anio)} no tiene periodo de auditoría propio en este obligado: está dentro ` +
          `del primer periodo de operaciones, que va del ${inicioDeOperaciones} al ` +
          `31 de diciembre de ${String(anioInicio + 1)} (Art. 43, línea 458). El año de cierre que ` +
          `se puede abrir es ${String(anioInicio + 1)}.`,
      )
    }

    if (anioInicio >= primerPeriodoAnio && anio === anioInicio + 1) {
      // Art. 43: el primer año de operaciones se extiende hasta el 31 de
      // diciembre del año SIGUIENTE al de inicio.
      return {
        anio,
        inicio: inicioDeOperaciones,
        fin: `${String(anio)}-12-31`,
        esPrimerPeriodoDeOperaciones: true,
        advertencia: null,
      }
    }
  }

  if (inicioDeOperaciones === null && anio === primerPeriodoAnio) {
    // NO ADIVINAR (ADR-34): sin la fecha de inicio de operaciones no se
    // puede saber si a este obligado le tocaba el periodo largo del Art. 43
    // o el ordinario del Art. 42 — ambos podrían ser ciertos. El Transitorio
    // Octavo fija 2028 como el año en que TODOS los que ya operaban cierran
    // su primer periodo (Art. 42, ordinario), así que se calcula esa
    // hipótesis por ser la que cubre a la mayoría — pero se dice, con
    // todas sus letras, que es una hipótesis y no un hecho verificado.
    return {
      anio,
      inicio: `${String(anio)}-01-01`,
      fin: `${String(anio)}-12-31`,
      esPrimerPeriodoDeOperaciones: false,
      advertencia:
        'Este obligado no tiene registrada la fecha en que inició operaciones como Actividad ' +
        'Vulnerable. Se calculó el periodo ORDINARIO del Art. 42 (1-ene a 31-dic), asumiendo que ' +
        'ya operaba antes de la entrada en vigor del Acuerdo — pero no se sabe si, en realidad, le ' +
        'correspondía el periodo LARGO del primer año de operaciones (Art. 43), que hubiera cerrado ' +
        'hasta el año siguiente. Registra la fecha de inicio de operaciones del obligado para ' +
        'resolver la duda.',
    }
  }

  // Art. 42: del 1-ene al 31-dic del año pedido.
  return {
    anio,
    inicio: `${String(anio)}-01-01`,
    fin: `${String(anio)}-12-31`,
    esPrimerPeriodoDeOperaciones: false,
    advertencia: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// La fecha límite de entrega — Art. 50 ¶1
// ─────────────────────────────────────────────────────────────────────────

/**
 * El último día hábil del mes de entrega (del año siguiente al cierre del
 * periodo), retrocediendo fines de semana y —si se conoce— días inhábiles
 * oficiales.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOS CERTEZAS DE DISTINTO TAMAÑO
 * ────────────────────────────────────────────────────────────────────────────
 * Que un día sea sábado o domingo es aritmética de calendario: siempre
 * cierto, sin depender de ningún catálogo. Que un día sea inhábil por
 * decreto (un feriado oficial) es un HECHO que alguien tiene que cargar
 * (`dias_inhabiles`, que nace vacía a propósito — ver la migración
 * 20260908120000). Cuando `calendarioCargado` es false, esta función
 * retrocede solo fines de semana y lo dice con `conCalendario: false`: la
 * fecha que devuelve puede caer DESPUÉS de la fecha límite real —nunca
 * antes—, porque un día que en realidad es inhábil pero no está cargado se
 * cuenta como hábil. Es la dirección arriesgada, y por eso quien pinte esta
 * fecha en una pantalla tiene que poder decir «sin confirmar contra el
 * calendario oficial» en vez de tratarla como si fuera definitiva (regla
 * dura 6: nunca calcular en silencio con un dato que falta).
 *
 * Nunca devuelve una fecha en fin de semana, con o sin calendario cargado.
 */
export function fechaLimiteDeEntrega(args: {
  readonly periodoFin: FechaISO
  /** Del catálogo (`auditoria_entrega_mes`), 1-indexed: 3 = marzo. */
  readonly mesEntrega: number
  /** ISO, del año de entrega correspondiente. Vacío = sin calendario cargado. */
  readonly diasInhabiles: readonly FechaISO[]
  readonly calendarioCargado: boolean
}): { readonly fecha: FechaISO; readonly conCalendario: boolean } {
  const { periodoFin, mesEntrega, diasInhabiles, calendarioCargado } = args

  if (!Number.isInteger(mesEntrega) || mesEntrega < 1 || mesEntrega > 12) {
    throw new Error(`El mes de entrega debe ser un entero de 1 a 12; se recibió ${String(mesEntrega)}.`)
  }

  const anioEntrega = partes(periodoFin).anio + 1
  const inhabiles = new Set(calendarioCargado ? diasInhabiles : [])

  const fechaDe = (dia: number): FechaISO =>
    `${String(anioEntrega)}-${String(mesEntrega).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  const esFinDeSemana = (dia: number): boolean => {
    const diaSemana = new Date(Date.UTC(anioEntrega, mesEntrega - 1, dia)).getUTCDay()
    return diaSemana === 0 || diaSemana === 6
  }

  let dia = ultimoDiaDelMes(anioEntrega, mesEntrega)
  while (esFinDeSemana(dia) || inhabiles.has(fechaDe(dia))) {
    dia -= 1
    if (dia < 1) {
      // No debería ocurrir con un calendario real (nunca hay un mes entero
      // inhábil), pero un mes-año inventado en una prueba sí podría
      // vaciarse: se detiene en vez de devolver una fecha del mes anterior
      // sin que nadie lo haya pedido.
      throw new Error(
        `No quedó ningún día hábil en ${String(mesEntrega)}/${String(anioEntrega)} tras excluir ` +
          'fines de semana y días inhábiles: revisa el calendario cargado para ese mes.',
      )
    }
  }

  return { fecha: fechaDe(dia), conCalendario: calendarioCargado }
}

// ─────────────────────────────────────────────────────────────────────────
// La coherencia de la ruta congelada — el envejecimiento del ADR-25/ADR-42
// ─────────────────────────────────────────────────────────────────────────

export type CoherenciaDeLaRuta =
  | { readonly estado: 'sobre_la_evaluacion_vigente' }
  | { readonly estado: 'sobre_otra_evaluacion'; readonly rutaHoy: RutaAuditoria; readonly cambiaria: boolean }

/**
 * ¿La ruta con la que se abrió el periodo sigue mirando a la evaluación de
 * entidad vigente del obligado, o el obligado ya tiene una evaluación más
 * reciente?
 *
 * Mismo criterio que `coherenciaDeSesion` (src/dominio/capacitacion.ts) y
 * que `declaraciones_coherencia` (ADR-42): si llegó una evaluación de
 * entidad nueva después de abrir el periodo, la ruta NO se invalida —ni el
 * Art. 44 ni el 45 dan ese verbo—: envejece, y se dice sobre qué evaluación
 * se decidió y si HOY, con la evaluación vigente, la ruta sería otra.
 * `cambiaria` es la única pregunta que de verdad importa para la pantalla:
 * si es `false`, la evaluación cambió pero la conclusión (interna/externa)
 * sigue siendo la misma.
 *
 * Si hay un periodo abierto (por tanto una evaluación a la que se ancló) y
 * hoy no hay NINGUNA evaluación de entidad vigente, es un dato que no
 * cuadra: las evaluaciones de entidad son append-only (nunca desaparecen),
 * así que ese estado es estructuralmente imposible salvo un error de quien
 * llama. Se detiene en vez de adivinar (regla dura 6).
 */
export function coherenciaDeLaRuta(args: {
  readonly evaluacionDelPeriodoId: string
  readonly rutaCongelada: RutaAuditoria
  readonly evaluacionVigenteId: string | null
  readonly rutaVigente: RutaAuditoria | null
}): CoherenciaDeLaRuta {
  const { evaluacionDelPeriodoId, rutaCongelada, evaluacionVigenteId, rutaVigente } = args

  if (evaluacionVigenteId === null) {
    throw new Error(
      'Hay un periodo de auditoría cuya ruta se congeló contra una evaluación de entidad, y hoy no ' +
        'hay ninguna evaluación de entidad vigente para este obligado. Las evaluaciones de entidad ' +
        'son append-only: no pueden desaparecer. Es un dato que no cuadra, y no se calcula en ' +
        'silencio sobre él (regla dura 6).',
    )
  }

  if (evaluacionDelPeriodoId === evaluacionVigenteId) {
    return { estado: 'sobre_la_evaluacion_vigente' }
  }

  if (rutaVigente === null) {
    throw new Error(
      'Hay una evaluación de entidad vigente pero no se indicó su ruta de auditoría: dato ' +
        'incompleto para decidir la coherencia (regla dura 6).',
    )
  }

  return {
    estado: 'sobre_otra_evaluacion',
    rutaHoy: rutaVigente,
    cambiaria: rutaVigente !== rutaCongelada,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Nombres y fundamentos que la UI cita — mismo estilo que capacitacion.ts
// ─────────────────────────────────────────────────────────────────────────

export const NOMBRE_DEL_TIPO_DE_AUDITOR: Record<TipoAuditor, string> = {
  interna: 'área de auditoría interna',
  externa: 'persona auditora externa independiente',
}

export const NOMBRE_DE_LA_RUTA: Record<RutaAuditoria, string> = {
  interna_permitida: 'dictamen de auditoría interna permitido',
  externa_obligatoria: 'persona auditora externa obligatoria',
}

export const FUNDAMENTO_DE_LA_RUTA = 'Arts. 44 y 45'

export interface RequisitoDeAuditorExterno {
  readonly inciso: 'a' | 'b' | 'c' | 'd' | 'e'
  /** Resumen del literal del inciso, para la pantalla — no el texto completo. */
  readonly resumen: string
}

/** Los cinco incisos del Art. 45, en el orden del texto. */
export const REQUISITOS_DEL_AUDITOR_EXTERNO: readonly RequisitoDeAuditorExterno[] = [
  {
    inciso: 'a',
    resumen:
      'Título universitario y cédula profesional en derecho, contaduría, finanzas, ' +
      'administración, informática o áreas afines, con al menos 3 años de experiencia en PLD',
  },
  {
    inciso: 'b',
    resumen:
      'Certificación vigente de la UIF (Art. 34 Bis), vigente al momento de elaborar y firmar el dictamen',
  },
  { inciso: 'c', resumen: 'No haber sido sentenciada por delitos patrimoniales' },
  {
    inciso: 'd',
    resumen: 'No haber prestado servicios previos al auditado que generen conflicto de interés durante el periodo auditado',
  },
  {
    inciso: 'e',
    resumen:
      'No haber aceptado el cargo de Representante Encargada de Cumplimiento del auditado ' +
      'durante el periodo auditado ni los dos años posteriores',
  },
]
