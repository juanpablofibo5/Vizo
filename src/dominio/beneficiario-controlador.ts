/**
 * El árbol de prelación del Beneficiario Controlador (Capítulo III Quinquies
 * del Acuerdo 115/2026: Arts. 23 Quinquies y 23 Quinquies 1).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 * Dados los insumos que quien realiza la Actividad Vulnerable recolectó sobre
 * un Cliente o Usuaria (persona moral o fideicomiso), determina QUIÉN es su
 * Beneficiario Controlador y por qué fracción del orden de prelación se llegó
 * a esa persona. El Art. 23 Quinquies exige documentar el procedimiento
 * seguido: por eso la salida no es solo el nombre, es el CAMINO — qué se
 * evaluó en cada fracción, con qué datos, y por qué se avanzó a la siguiente.
 * El camino es la evidencia que se conserva para una visita de verificación,
 * no un log de depuración.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL ORDEN ES LITERAL Y ES UNA CASCADA, NO UNA ELECCIÓN
 * ────────────────────────────────────────────────────────────────────────────
 * Art. 23 Quinquies, para personas morales, en el orden del texto:
 *
 *   I.   Persona física o grupo de personas físicas que, directa o
 *        indirectamente, posea el 25% o más del capital social.
 *   II.  Si la fracción I no arroja a nadie: quien tenga el control por
 *        otros medios distintos, con funciones ligadas a la estrategia, la
 *        toma de decisiones o la dirección de las políticas principales.
 *   III. Si tampoco la II arroja a nadie: quien ocupe la posición de
 *        funcionario administrativo de mayor grado o de alta dirección.
 *
 * Cada fracción se evalúa completa antes de mirar la siguiente. La fracción I
 * puede arrojar más de una persona (varios accionistas al 25%+, o un grupo
 * que actúa en conjunto): todas cuentan, no solo la de mayor porcentaje — el
 * texto no dice "el mayor", dice "identificar a la persona física o grupo".
 *
 * La fracción I sí sabe combinar tenencia DIRECTA e INDIRECTA de un mismo
 * titular ("directa o indirectamente" está en el propio texto): quien tiene
 * 18% directo y 13% a través de otra persona moral suma 31% y cae en la
 * fracción I sin necesidad de otro mecanismo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOS ARTÍCULOS, DOS UMBRALES DE 25% — Y NO SON EL MISMO
 * ────────────────────────────────────────────────────────────────────────────
 * El Acuerdo 115/2026 tiene DOS reglas con "25%" que se leen distinto:
 *
 *   · Art. 23 Quinquies, fr. I (este módulo, el PROCEDIMIENTO de
 *     identificación): "el 25% o más de la composición accionaria o parte
 *     social del capital social" — mide TENENCIA (capital), borde INCLUSIVO.
 *   · Art. 3, fr. IV, inciso b), subinciso ii) de la Ley (la DEFINICIÓN de
 *     "control efectivo"): "ejercer el voto respecto de más del 25% del
 *     capital social" — mide VOTO, borde EXCLUSIVO ("más del", no "o más").
 *
 * En exactamente 25.00% los dos artículos dan respuestas opuestas. Este
 * módulo implementa SOLO la fr. I del Art. 23 Quinquies —composición
 * accionaria, inclusivo— porque es el procedimiento de identificación que
 * el capítulo pide documentar. Si algún insumo trajera participación por
 * VOTO en vez de por capital, no es intercambiable con `TenenciaCapital`: el
 * criterio de voto pertenece a la definición del Art. 3 y queda pendiente de
 * contrastar con el especialista PLD antes de mezclarlo aquí.
 *
 * Ni el número (25) ni el borde (inclusivo/exclusivo) se fijan en el código:
 * los dos llegan en `configuracion` (regla dura 1). Parametrizar solo el
 * número y dejar el operador de comparación fijo sería la mitad de la regla
 * escrita en código igual — el mismo error que ISSUE #17 encontró en el
 * motor de umbrales (`src/dominio/motor.ts`, `Umbral.inclusivo`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FIDEICOMISOS: NO ES PRELACIÓN, ES CONTROL EFECTIVO — Y PUEDE DESCENDER
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 23 Quinquies 1 no cascada por fracciones: cualquier parte del
 * fideicomiso (fiduciario, fideicomitente, fideicomisario, protectora, o
 * miembro del comité técnico u órgano equivalente) que tenga AL MENOS UNA de
 * las facultades que el artículo enumera —disponer/administrar/dirigir los
 * bienes, instruir o autorizar distribuciones, modificar o extinguir el
 * fideicomiso, nombrar o remover a quien administra, o imponer decisiones
 * sobre su operación— ejerce control efectivo y cuenta como Beneficiario
 * Controlador.
 *
 * Cuando esa parte es persona moral, el segundo párrafo obliga a "ascender en
 * la cadena de titularidad y control": este módulo lo resuelve aplicando el
 * Art. 23 Quinquies (la cascada I → II → III de arriba) sobre los insumos de
 * esa persona moral, para DESCENDER un nivel en la estructura de datos hasta
 * encontrar la persona física. Esa aplicación queda documentada como
 * `caminoDescenso`, anidada dentro del resultado del fideicomiso: la
 * evidencia no se aplana, se conserva completa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ QUEDA EXPRESAMENTE FUERA
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 23 Quinquies 2 exime de recabar al Beneficiario Controlador cuando
 * el Cliente o Usuaria cotiza en una bolsa reconocida o cae en los Anexos 4
 * Bis, 6 Bis, 7-A y 7 Bis A. Ese supuesto NO está contrastado contra el texto
 * de esos Anexos y no se implementa aquí: si los insumos declaran una
 * excepción, este módulo se detiene con un error accionable en vez de
 * calcular — o peor, de asumir que no hay Beneficiario Controlador. Un
 * resultado por defecto ahí sería exactamente el error que la regla dura 6 de
 * CLAUDE.md prohíbe: un cálculo plausible sobre un supuesto no verificado.
 *
 * El umbral de la fracción I (25% en el texto vigente) llega en la
 * `configuracion`, nunca escrito aquí (regla dura 1): este módulo APLICA el
 * orden de prelación, no decide el número.
 */

// ─────────────────────────────────────────────────────────────────────────
// Configuración — el dato que NUNCA se escribe en código (regla dura 1)
// ─────────────────────────────────────────────────────────────────────────

export interface ConfiguracionBeneficiarioControlador {
  /**
   * El número de la fracción I del Art. 23 Quinquies (25% en el texto
   * vigente). Viene del catálogo (`parametros_motor`), con su fuente citada.
   * Un `0`, un `100` o cualquier valor fuera de (0, 100] es un catálogo
   * corrupto, no un caso a resolver: se detiene en
   * `determinarBeneficiarioControlador`.
   */
  readonly umbralControlPct: number
  /**
   * Si el umbral se alcanza CON su propio valor.
   *
   * `true` = "25% o más" (>=) — la lectura del Art. 23 Quinquies, fr. I, el
   * procedimiento de identificación y el alcance de este módulo.
   * `false` = "más del 25%" (>) — la lectura del Art. 3, fr. IV, inciso b)
   * ii) de la Ley, que mide VOTO en la definición de control efectivo y NO
   * es lo que este módulo evalúa.
   *
   * Va en la configuración y no como un `>=` fijo en el código: fijar el
   * operador aquí sería regulación escrita en código a medias, aunque el
   * número sí viniera parametrizado (regla dura 1).
   */
  readonly umbralControlInclusivo: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// Errores — mensajes accionables (regla dura 6)
// ─────────────────────────────────────────────────────────────────────────

export class ConfiguracionInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ConfiguracionInvalida'
  }
}

/**
 * El supuesto del Art. 23 Quinquies 2 (bolsa reconocida, Anexos 4 Bis, 6 Bis,
 * 7-A y 7 Bis A) llegó marcado en los insumos. Este módulo no lo implementa:
 * contrastar esos Anexos contra el texto del DOF es trabajo aparte, y hasta
 * que eso ocurra, tratar el caso en silencio (calculando igual, u omitiendo
 * la identificación) sería exactamente el cálculo plausible y no verificado
 * que la regla dura 6 prohíbe.
 */
export class ExcepcionSinContrastar extends Error {
  constructor(tipo: string, detalle: string) {
    super(
      `El Cliente o Usuaria declara la excepción "${tipo}" del Art. 23 Quinquies 2 (${detalle}). ` +
        'Este módulo no evalúa ese supuesto — no está contrastado contra el texto de los Anexos ' +
        'citados. No calcules un Beneficiario Controlador por defecto: resuelve la excepción por ' +
        'la vía del Art. 23 Quinquies 2 antes de llamar a esta función con este cliente.',
    )
    this.name = 'ExcepcionSinContrastar'
  }
}

/**
 * Un insumo falta, está fuera de rango, o no alcanza para aplicar la
 * fracción que corresponde. Nunca se completa con un supuesto: se detiene
 * con un mensaje que dice qué dato falta y por qué hace falta.
 */
export class InsumoIncoherente extends Error {
  constructor(detalle: string) {
    super(
      `Los insumos del Beneficiario Controlador no cuadran: ${detalle}. El motor no determina un ` +
        'Beneficiario Controlador con datos incompletos o inconsistentes.',
    )
    this.name = 'InsumoIncoherente'
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Insumos — Fracción I: tenencia de capital, directa o indirecta
// ─────────────────────────────────────────────────────────────────────────

/**
 * Una tenencia de capital social sobre el Cliente o Usuaria evaluado.
 *
 * `titularId` es un identificador opaco (persona física o grupo de personas
 * físicas actuando en conjunto) — nunca un nombre, RFC o CURP: regla dura 3
 * de CLAUDE.md aplica también dentro del dominio, no solo en logs.
 *
 * La tenencia INDIRECTA (a través de otra persona moral intermedia) se suma
 * a la directa del mismo titular: así es como el texto dice "directa o
 * indirectamente" en la fracción I, sin que este módulo tenga que recorrer
 * el árbol societario — quien arma el insumo ya resolvió la cadena y aporta
 * el porcentaje que le corresponde a esa cadena.
 */
export interface TenenciaCapital {
  readonly titularId: string
  /** `true` si `titularId` identifica a un grupo de personas físicas, no a una sola. */
  readonly esGrupo: boolean
  /** Porcentaje del capital social que representa esta tenencia. En (0, 100]. */
  readonly porcentaje: number
  readonly via: 'directa' | 'indirecta'
  /** Obligatorio cuando `via` es `'indirecta'`: por qué persona moral llega la cadena. */
  readonly intermediarioId?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Insumos — Fracción II: control por otros medios
// ─────────────────────────────────────────────────────────────────────────

export type AreaDeControl = 'estrategia' | 'toma_de_decisiones' | 'politicas_principales'

/**
 * Alguien con control del Cliente o Usuaria por un medio distinto a la
 * tenencia de capital, con funciones ligadas al menos a una de las áreas que
 * el texto enumera. `areasControladas` documenta CUÁLES, porque es lo que
 * hace la determinación accionable ante una revisión: no basta con decir
 * "controla", hay que poder señalar por dónde.
 */
export interface ControlPorOtrosMedios {
  readonly titularId: string
  readonly esGrupo: boolean
  /** Descripción del medio de control (p. ej. "veto estatutario sobre el presupuesto anual"). */
  readonly medio: string
  readonly areasControladas: readonly AreaDeControl[]
}

// ─────────────────────────────────────────────────────────────────────────
// Insumos — Fracción III: funcionario de mayor grado o alta dirección
// ─────────────────────────────────────────────────────────────────────────

/**
 * Un candidato de la fracción III. `rango` es el orden jerárquico declarado
 * por quien captura el dato: 1 es el de mayor grado. Cuando dos o más
 * comparten el rango 1, el texto no rompe el empate — así que ambos cuentan
 * como Beneficiario Controlador.
 */
export interface FuncionarioAltaDireccion {
  readonly titularId: string
  readonly esGrupo: boolean
  readonly cargo: string
  readonly rango: number
}

// ─────────────────────────────────────────────────────────────────────────
// Insumos — persona moral (agrupa las tres fracciones)
// ─────────────────────────────────────────────────────────────────────────

export interface InsumosPersonaMoral {
  readonly tenenciasCapital: readonly TenenciaCapital[]
  readonly controlPorOtrosMedios: readonly ControlPorOtrosMedios[]
  readonly funcionariosAltaDireccion: readonly FuncionarioAltaDireccion[]
}

// ─────────────────────────────────────────────────────────────────────────
// Insumos — fideicomiso (Art. 23 Quinquies 1)
// ─────────────────────────────────────────────────────────────────────────

export type RolFideicomiso =
  | 'fiduciario'
  | 'fideicomitente'
  | 'fideicomisario'
  | 'protector'
  | 'comite_tecnico'

/**
 * Las cinco facultades que el Art. 23 Quinquies 1 enumera, en el orden del
 * texto. Basta con UNA en `true` para que la parte ejerza control efectivo
 * — el artículo las separa con comas y "o", no exige todas a la vez.
 */
export interface FacultadesControlFideicomiso {
  /** Disponer, administrar o dirigir el destino de los bienes o derechos fideicomitidos. */
  readonly disponerAdministrarDirigirBienes: boolean
  readonly instruirAutorizarDistribuciones: boolean
  readonly modificarOExtinguirFideicomiso: boolean
  readonly nombrarORemoverAdministracion: boolean
  readonly imponerDecisionesDeOperacionOAdministracion: boolean
}

/**
 * Una parte del fideicomiso. Cuando `tipoPersona` es `'moral'`, el segundo
 * párrafo del Art. 23 Quinquies 1 obliga a descender hasta la persona
 * física: `insumosPersonaMoral` trae lo necesario para aplicar el Art. 23
 * Quinquies sobre esa persona moral. Sin ese dato, si la parte ejerce
 * control efectivo, el descenso no se puede completar y el motor se detiene
 * — no se sustituye a la persona moral por su Beneficiario Controlador sin
 * haberlo determinado.
 */
export interface ParteFideicomiso {
  readonly titularId: string
  readonly rol: RolFideicomiso
  readonly tipoPersona: 'fisica' | 'moral'
  readonly facultades: FacultadesControlFideicomiso
  readonly insumosPersonaMoral?: InsumosPersonaMoral
}

export interface InsumosFideicomiso {
  readonly partes: readonly ParteFideicomiso[]
}

// ─────────────────────────────────────────────────────────────────────────
// Insumos — entrada completa
// ─────────────────────────────────────────────────────────────────────────

/** El supuesto del Art. 23 Quinquies 2. Presente ⇒ `ExcepcionSinContrastar`. */
export interface ExcepcionCapitulo {
  readonly tipo: 'bolsa_reconocida' | 'anexo_excluido'
  readonly detalle: string
}

export type SujetoEvaluado =
  | { readonly tipo: 'persona_moral'; readonly insumos: InsumosPersonaMoral }
  | { readonly tipo: 'fideicomiso'; readonly insumos: InsumosFideicomiso }

export interface InsumosBeneficiarioControlador {
  /** Presente cuando el Cliente o Usuaria invoca el Art. 23 Quinquies 2. */
  readonly excepcion?: ExcepcionCapitulo
  readonly sujeto: SujetoEvaluado
}

// ─────────────────────────────────────────────────────────────────────────
// Salida — el camino como dato estructurado
// ─────────────────────────────────────────────────────────────────────────

export type FraccionPrelacion = 'I' | 'II' | 'III'

/**
 * Un paso del recorrido por el orden de prelación de personas morales: qué
 * fracción se evaluó, con qué insumo exacto, y el resultado. `detalle`
 * explica en prosa por qué se determinó aquí o por qué se avanzó — pero el
 * dato auditable es el insumo evaluado, no el texto.
 */
export type PasoPrelacion =
  | {
      readonly fraccion: 'I'
      readonly tenenciasEvaluadas: readonly TenenciaCapital[]
      readonly resultado: 'determinado' | 'sin_resultado'
      readonly detalle: string
    }
  | {
      readonly fraccion: 'II'
      readonly controlEvaluado: readonly ControlPorOtrosMedios[]
      readonly resultado: 'determinado' | 'sin_resultado'
      readonly detalle: string
    }
  | {
      readonly fraccion: 'III'
      readonly funcionariosEvaluados: readonly FuncionarioAltaDireccion[]
      readonly resultado: 'determinado' | 'sin_resultado'
      readonly detalle: string
    }

export interface BeneficiarioPersonaMoral {
  readonly titularId: string
  readonly esGrupo: boolean
  readonly fraccion: FraccionPrelacion
  /** Justificación puntual y auditable (p. ej. el desglose del porcentaje). */
  readonly base: string
}

export interface DeterminacionPersonaMoral {
  readonly tipo: 'persona_moral'
  readonly fraccionAplicada: FraccionPrelacion
  readonly beneficiarios: readonly BeneficiarioPersonaMoral[]
  /** Todas las fracciones evaluadas en orden, hasta la que resolvió. */
  readonly camino: readonly PasoPrelacion[]
}

export interface BeneficiarioFideicomiso {
  /** Siempre una persona física — si hubo descenso, ya es el resultado final del descenso. */
  readonly titularId: string
  readonly rolOriginal: RolFideicomiso
  readonly viaDescenso: boolean
  /** Presente cuando `viaDescenso` es `true`: la aplicación completa del Art. 23 Quinquies. */
  readonly caminoDescenso?: DeterminacionPersonaMoral
  readonly base: string
}

export interface DeterminacionFideicomiso {
  readonly tipo: 'fideicomiso'
  readonly beneficiarios: readonly BeneficiarioFideicomiso[]
}

export type DeterminacionBeneficiarioControlador = DeterminacionPersonaMoral | DeterminacionFideicomiso

// ─────────────────────────────────────────────────────────────────────────
// La función pública
// ─────────────────────────────────────────────────────────────────────────

export function determinarBeneficiarioControlador(
  insumos: InsumosBeneficiarioControlador,
  configuracion: ConfiguracionBeneficiarioControlador,
): DeterminacionBeneficiarioControlador {
  verificarConfiguracion(configuracion)

  if (insumos.excepcion) {
    throw new ExcepcionSinContrastar(insumos.excepcion.tipo, insumos.excepcion.detalle)
  }

  return insumos.sujeto.tipo === 'persona_moral'
    ? determinarPersonaMoral(insumos.sujeto.insumos, configuracion)
    : determinarFideicomiso(insumos.sujeto.insumos, configuracion)
}

// ─────────────────────────────────────────────────────────────────────────
// Persona moral — Art. 23 Quinquies, la cascada I → II → III
// ─────────────────────────────────────────────────────────────────────────

function determinarPersonaMoral(
  insumos: InsumosPersonaMoral,
  configuracion: ConfiguracionBeneficiarioControlador,
): DeterminacionPersonaMoral {
  const camino: PasoPrelacion[] = []

  // ── Fracción I ────────────────────────────────────────────────────────
  verificarTenencias(insumos.tenenciasCapital)
  const porTitular = agruparPorTitular(insumos.tenenciasCapital)
  const fraccionI = [...porTitular.entries()]
    .filter(([, suma]) => alcanzaUmbral(suma.porcentaje, configuracion))
    .map(([titularId, suma]): BeneficiarioPersonaMoral => ({
      titularId,
      esGrupo: suma.esGrupo,
      fraccion: 'I',
      base: describirTenencia(suma, configuracion),
    }))
  const comparador = configuracion.umbralControlInclusivo ? '(≥, "25% o más")' : '(>, "más del 25%")'

  if (fraccionI.length > 0) {
    camino.push({
      fraccion: 'I',
      tenenciasEvaluadas: insumos.tenenciasCapital,
      resultado: 'determinado',
      detalle:
        `${fraccionI.length} titular(es) alcanzan el umbral de ${configuracion.umbralControlPct}% ` +
        `${comparador} de participación directa e indirecta.`,
    })
    return { tipo: 'persona_moral', fraccionAplicada: 'I', beneficiarios: fraccionI, camino }
  }
  camino.push({
    fraccion: 'I',
    tenenciasEvaluadas: insumos.tenenciasCapital,
    resultado: 'sin_resultado',
    detalle:
      `Ningún titular alcanza el umbral de ${configuracion.umbralControlPct}% ${comparador} de ` +
      'participación directa e indirecta; se avanza a la fracción II.',
  })

  // ── Fracción II ───────────────────────────────────────────────────────
  verificarControlPorOtrosMedios(insumos.controlPorOtrosMedios)
  if (insumos.controlPorOtrosMedios.length > 0) {
    const fraccionII = insumos.controlPorOtrosMedios.map(
      (c): BeneficiarioPersonaMoral => ({
        titularId: c.titularId,
        esGrupo: c.esGrupo,
        fraccion: 'II',
        base: `Ejerce control por otros medios (${c.medio}) sobre: ${c.areasControladas.join(', ')}.`,
      }),
    )
    camino.push({
      fraccion: 'II',
      controlEvaluado: insumos.controlPorOtrosMedios,
      resultado: 'determinado',
      detalle: `${fraccionII.length} titular(es) ejercen control por otros medios distintos a la tenencia.`,
    })
    return { tipo: 'persona_moral', fraccionAplicada: 'II', beneficiarios: fraccionII, camino }
  }
  camino.push({
    fraccion: 'II',
    controlEvaluado: insumos.controlPorOtrosMedios,
    resultado: 'sin_resultado',
    detalle: 'Sin control identificado por otros medios; se avanza a la fracción III.',
  })

  // ── Fracción III ──────────────────────────────────────────────────────
  // Última fracción del orden: siempre debe resolver a alguien — toda
  // persona moral tiene un funcionario de mayor grado o alta dirección. Una
  // lista vacía aquí no es "sin resultado", es un insumo incompleto.
  verificarFuncionarios(insumos.funcionariosAltaDireccion)
  const rangoMinimo = Math.min(...insumos.funcionariosAltaDireccion.map((f) => f.rango))
  const fraccionIII = insumos.funcionariosAltaDireccion
    .filter((f) => f.rango === rangoMinimo)
    .map(
      (f): BeneficiarioPersonaMoral => ({
        titularId: f.titularId,
        esGrupo: f.esGrupo,
        fraccion: 'III',
        base: `Ocupa la posición de mayor grado (${f.cargo}, rango ${f.rango}) al no haberse identificado a nadie en las fracciones I y II.`,
      }),
    )
  camino.push({
    fraccion: 'III',
    funcionariosEvaluados: insumos.funcionariosAltaDireccion,
    resultado: 'determinado',
    detalle: `${fraccionIII.length} funcionario(s) de mayor grado o alta dirección identificados.`,
  })
  return { tipo: 'persona_moral', fraccionAplicada: 'III', beneficiarios: fraccionIII, camino }
}

// ─────────────────────────────────────────────────────────────────────────
// Fideicomiso — Art. 23 Quinquies 1: control efectivo, con descenso
// ─────────────────────────────────────────────────────────────────────────

function determinarFideicomiso(
  insumos: InsumosFideicomiso,
  configuracion: ConfiguracionBeneficiarioControlador,
): DeterminacionFideicomiso {
  verificarPartes(insumos.partes)

  const calificantes = insumos.partes.filter((p) => tieneControlEfectivo(p.facultades))
  if (calificantes.length === 0) {
    throw new InsumoIncoherente(
      'ninguna de las partes del fideicomiso (fiduciario, fideicomitentes, fideicomisarios, ' +
        'protectoras o comité técnico) quedó marcada con alguna facultad de control efectivo del ' +
        'Art. 23 Quinquies 1 (disponer/administrar/dirigir los bienes, instruir o autorizar ' +
        'distribuciones, modificar o extinguir el fideicomiso, nombrar o remover administración, o ' +
        'imponer decisiones de operación); revisa la captura de facultades antes de continuar',
    )
  }

  const beneficiarios: BeneficiarioFideicomiso[] = calificantes.flatMap((parte) =>
    resolverParteFideicomiso(parte, configuracion),
  )

  return { tipo: 'fideicomiso', beneficiarios }
}

function resolverParteFideicomiso(
  parte: ParteFideicomiso,
  configuracion: ConfiguracionBeneficiarioControlador,
): BeneficiarioFideicomiso[] {
  if (parte.tipoPersona === 'fisica') {
    return [
      {
        titularId: parte.titularId,
        rolOriginal: parte.rol,
        viaDescenso: false,
        base: `Ejerce control efectivo sobre el fideicomiso en su carácter de ${parte.rol}.`,
      },
    ]
  }

  // Persona moral con control efectivo: el Art. 23 Quinquies 1, segundo
  // párrafo, obliga a descender hasta la persona física aplicando el Art.
  // 23 Quinquies. Sin los insumos de esa persona moral, el descenso no se
  // puede completar — y sustituir a la persona moral por su nombre, sin
  // haber determinado quién la controla, sería exactamente el vacío que la
  // regla dura 6 prohíbe llenar con un supuesto.
  if (!parte.insumosPersonaMoral) {
    throw new InsumoIncoherente(
      `la parte "${parte.titularId}" (${parte.rol}) es persona moral con control efectivo, pero no ` +
        'trae los insumos de capital, control por otros medios y funcionarios para aplicar el Art. ' +
        '23 Quinquies y descender hasta la persona física; sin ellos no se puede completar la ' +
        'identificación del Beneficiario Controlador',
    )
  }

  const descenso = determinarPersonaMoral(parte.insumosPersonaMoral, configuracion)
  return descenso.beneficiarios.map((b) => ({
    titularId: b.titularId,
    rolOriginal: parte.rol,
    viaDescenso: true,
    caminoDescenso: descenso,
    base:
      `Persona moral "${parte.titularId}" (${parte.rol}) ejerce control efectivo sobre el ` +
      `fideicomiso; se descendió por el Art. 23 Quinquies (fracción ${descenso.fraccionAplicada}) ` +
      'hasta esta persona física.',
  }))
}

function tieneControlEfectivo(f: FacultadesControlFideicomiso): boolean {
  return (
    f.disponerAdministrarDirigirBienes ||
    f.instruirAutorizarDistribuciones ||
    f.modificarOExtinguirFideicomiso ||
    f.nombrarORemoverAdministracion ||
    f.imponerDecisionesDeOperacionOAdministracion
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Piezas internas — validación (regla dura 6: detenerse, no asumir)
// ─────────────────────────────────────────────────────────────────────────

function verificarConfiguracion(configuracion: ConfiguracionBeneficiarioControlador): void {
  const { umbralControlPct } = configuracion
  if (!Number.isFinite(umbralControlPct) || umbralControlPct <= 0 || umbralControlPct > 100) {
    throw new ConfiguracionInvalida(
      `El umbral de control de la fracción I (Art. 23 Quinquies) debe estar en (0, 100]; el ` +
        `catálogo trae ${umbralControlPct}. Corrige el parámetro en el catálogo antes de evaluar.`,
    )
  }
}

/**
 * ¿La participación alcanza el umbral de la fracción I?
 *
 * El operador NO es fijo: `umbralControlInclusivo` decide entre "25% o más"
 * (Art. 23 Quinquies, fr. I — este módulo) y "más del 25%" (Art. 3, fr. IV,
 * inciso b) ii) de la Ley — la definición de control efectivo por VOTO, que
 * este módulo no evalúa). Fijar el `>=` aquí sin leer la configuración
 * dejaría la mitad de la regla escrita en código.
 */
function alcanzaUmbral(porcentaje: number, configuracion: ConfiguracionBeneficiarioControlador): boolean {
  return configuracion.umbralControlInclusivo
    ? porcentaje >= configuracion.umbralControlPct
    : porcentaje > configuracion.umbralControlPct
}

function verificarTenencias(tenencias: readonly TenenciaCapital[]): void {
  let sumaDirecta = 0
  for (const t of tenencias) {
    if (t.titularId.trim() === '') {
      throw new InsumoIncoherente('una tenencia de capital trae "titularId" vacío')
    }
    if (!Number.isFinite(t.porcentaje) || t.porcentaje <= 0 || t.porcentaje > 100) {
      throw new InsumoIncoherente(
        `la tenencia del titular "${t.titularId}" trae porcentaje ${t.porcentaje}, fuera de (0, 100]`,
      )
    }
    if (t.via === 'indirecta' && (!t.intermediarioId || t.intermediarioId.trim() === '')) {
      throw new InsumoIncoherente(
        `la tenencia indirecta del titular "${t.titularId}" no trae "intermediarioId": sin la ` +
          'persona moral por la que llega la cadena, no se puede documentar el procedimiento',
      )
    }
    if (t.via === 'directa') sumaDirecta += t.porcentaje
  }
  if (sumaDirecta > 100) {
    throw new InsumoIncoherente(
      `la suma de tenencias DIRECTAS declaradas es ${sumaDirecta}%, por encima del 100% del capital ` +
        'social; revisa la captura antes de evaluar la fracción I',
    )
  }
}

function verificarControlPorOtrosMedios(control: readonly ControlPorOtrosMedios[]): void {
  for (const c of control) {
    if (c.titularId.trim() === '') {
      throw new InsumoIncoherente('un candidato de la fracción II trae "titularId" vacío')
    }
    if (c.areasControladas.length === 0) {
      throw new InsumoIncoherente(
        `el candidato "${c.titularId}" de la fracción II no trae ninguna área controlada ` +
          '(estrategia, toma de decisiones o políticas principales): sin eso no se puede sustentar ' +
          'que ejerce control por otros medios en los términos del Art. 23 Quinquies, fr. II',
      )
    }
  }
}

function verificarFuncionarios(funcionarios: readonly FuncionarioAltaDireccion[]): void {
  if (funcionarios.length === 0) {
    throw new InsumoIncoherente(
      'la fracción III no trae ningún funcionario administrativo de mayor grado o de alta ' +
        'dirección. Es la última fracción del orden de prelación: si las fracciones I y II no ' +
        'arrojaron a nadie, aquí SIEMPRE debe haber al menos un candidato — captúralo antes de evaluar',
    )
  }
  for (const f of funcionarios) {
    if (f.titularId.trim() === '') {
      throw new InsumoIncoherente('un candidato de la fracción III trae "titularId" vacío')
    }
    if (!Number.isInteger(f.rango) || f.rango <= 0) {
      throw new InsumoIncoherente(
        `el candidato "${f.titularId}" de la fracción III trae rango ${f.rango}; debe ser un ` +
          'entero positivo (1 = mayor grado)',
      )
    }
  }
}

function verificarPartes(partes: readonly ParteFideicomiso[]): void {
  if (partes.length === 0) {
    throw new InsumoIncoherente(
      'el fideicomiso no trae ninguna parte (fiduciario, fideicomitentes, fideicomisarios, ' +
        'protectoras o comité técnico); sin partes no hay quién evaluar para el Art. 23 Quinquies 1',
    )
  }
  for (const p of partes) {
    if (p.titularId.trim() === '') {
      throw new InsumoIncoherente('una parte del fideicomiso trae "titularId" vacío')
    }
  }
}

interface SumaTenencia {
  readonly esGrupo: boolean
  readonly porcentaje: number
  readonly detalleDirecta: number
  readonly detalleIndirecta: number
}

function agruparPorTitular(tenencias: readonly TenenciaCapital[]): Map<string, SumaTenencia> {
  const porTitular = new Map<string, SumaTenencia>()
  for (const t of tenencias) {
    const previa = porTitular.get(t.titularId) ?? {
      esGrupo: t.esGrupo,
      porcentaje: 0,
      detalleDirecta: 0,
      detalleIndirecta: 0,
    }
    if (previa.esGrupo !== t.esGrupo) {
      throw new InsumoIncoherente(
        `el titular "${t.titularId}" aparece marcado como grupo en una tenencia y como persona ` +
          'individual en otra; el dato no puede ser ambos a la vez',
      )
    }
    porTitular.set(t.titularId, {
      esGrupo: t.esGrupo,
      porcentaje: previa.porcentaje + t.porcentaje,
      detalleDirecta: previa.detalleDirecta + (t.via === 'directa' ? t.porcentaje : 0),
      detalleIndirecta: previa.detalleIndirecta + (t.via === 'indirecta' ? t.porcentaje : 0),
    })
  }
  return porTitular
}

function describirTenencia(suma: SumaTenencia, configuracion: ConfiguracionBeneficiarioControlador): string {
  const partes: string[] = []
  if (suma.detalleDirecta > 0) partes.push(`${suma.detalleDirecta}% directo`)
  if (suma.detalleIndirecta > 0) partes.push(`${suma.detalleIndirecta}% indirecto`)
  const relacion = configuracion.umbralControlInclusivo ? 'alcanza o supera' : 'supera'
  return (
    `Participación total de ${suma.porcentaje}% (${partes.join(' + ')}), ` +
    `${relacion} el umbral de ${configuracion.umbralControlPct}% de la fracción I ` +
    '(Art. 23 Quinquies — composición accionaria, no voto).'
  )
}
