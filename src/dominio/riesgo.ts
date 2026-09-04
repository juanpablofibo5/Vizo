/**
 * El motor de Grado de Riesgo (Caps. II Quáter y III Bis del Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE, Y QUÉ NO DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 * Ejecuta la metodología que el obligado configuró y devuelve el grado que le
 * corresponde a un cliente, junto con el camino aritmético que llevó a él. NO
 * decide qué factores existen, cuánto pesa cada uno, ni dónde empieza el riesgo
 * alto: eso es criterio del obligado y llega en la configuración (ADR-21).
 *
 * La frontera se sostiene en tres decisiones concretas:
 *
 * 1. **El método de medición lo declara el obligado.** El Art. 10 Septies 1,
 *    fr. II exige que la metodología establezca «un método de medición que
 *    asigne valores». VIZO implementa los que sabe ejecutar y **se detiene**
 *    ante uno que no conoce, en vez de aproximarlo con el que tiene a mano —
 *    mismo criterio que `fecha-del-acto.ts` con las reglas del Art. 24 Bis.
 *
 * 2. **Sin configuración no hay grado: hay hueco.** Es la regla del ADR-21, y
 *    aquí es un valor del tipo de retorno, no una excepción que alguien pueda
 *    atrapar y sustituir por «bajo». Un grado por defecto sería VIZO decidiendo
 *    que un cliente es poco riesgoso porque nadie configuró nada.
 *
 * 3. **Los cortes de la escala vienen de la escala.** El motor no sabe qué
 *    puntaje es «alto»: busca en los grados del obligado cuál cubre el puntaje
 *    calculado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ DEVUELVE EL CAMINO Y NO SOLO EL GRADO
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 23 Bis 2 obliga a que el modelo se aplique de forma consistente, y el
 * Art. 41 fr. IV a conservar el histórico de sus modificaciones. Un número sin
 * su desglose no se puede defender dos años después: qué factores se
 * consideraron presentes, cuánto sumó cada uno y qué corte se cruzó.
 */

/**
 * Los métodos de medición que este motor sabe ejecutar.
 *
 * `suma_ponderada` suma el peso de los indicadores presentes y nada más.
 * `suma_ponderada_por_elemento` aplica LOS DOS niveles que pide el Art. 10
 * Septies 1 fr. II: el valor de cada indicador y, «a su vez», el de cada
 * elemento. Son métodos distintos y no una mejora del primero, a propósito —
 * cambiar la aritmética de `suma_ponderada` movería el puntaje de clientes ya
 * clasificados sin que nadie lo decidiera.
 */
export type MetodoMedicion = 'suma_ponderada' | 'suma_ponderada_por_elemento'

export interface FactorConfigurado {
  readonly id: string
  readonly factor: string
  /** La clave del elemento al que pertenece (Art. 10 Septies 1 fr. I). */
  readonly elemento: string
  readonly peso: number
}

/**
 * El valor de cada ELEMENTO (Art. 10 Septies 1 fr. II, segunda oración).
 *
 * Solo lo usa `suma_ponderada_por_elemento`. Se indexa por la clave del
 * elemento, que es lo que el factor ya trae.
 */
export type PesosPorElemento = Readonly<Record<string, number>>

export interface GradoConfigurado {
  readonly id: string
  readonly clave: string
  readonly orden: number
  readonly esAlto: boolean
  readonly puntajeMinimo: number
}

export interface ConfiguracionRiesgo {
  /**
   * Si el piso del Art. 23 Bis 4 es exigible a la fecha que se evalúa.
   *
   * Llega del catálogo con su vigencia (1-mar-2027, Transitorio Cuarto), no
   * escrito aquí: la fecha desde la que un artículo obliga es dato con fuente.
   */
  readonly pisoPepExtranjeraExigible?: boolean | undefined
  readonly modeloId: string
  /** Tal como lo declaró el obligado. Puede ser uno que este motor no conozca. */
  readonly metodoMedicion: string
  readonly factores: readonly FactorConfigurado[]
  readonly escala: readonly GradoConfigurado[]
  /** Obligatorio para `suma_ponderada_por_elemento`; ignorado por el otro. */
  readonly pesosPorElemento?: PesosPorElemento | undefined
}

/** Qué factores del modelo aplican a este cliente. Los decide quien evalúa. */
export interface InsumosRiesgo {
  readonly clienteId: string
  readonly factoresPresentes: readonly string[]
  /**
   * Si el cliente es una Persona Políticamente Expuesta EXTRANJERA.
   *
   * Tres valores, y el tercero importa: `null` es «no se sabe» —no hay
   * declaración del Cap. III Quáter— y NO es lo mismo que `false`. Leerlo como
   * «no lo es» daría un grado que quizá debía subir, sin que nadie se entere.
   */
  readonly esPepExtranjera?: boolean | null | undefined
}

export interface PasoDelPuntaje {
  readonly factorId: string
  readonly factor: string
  readonly elemento: string
  readonly peso: number
  /**
   * El peso del elemento que multiplicó a este indicador. `null` cuando el
   * método no usa el segundo nivel — y entonces el desglose lo dice, en vez de
   * mostrar un 1 que parecería una decisión de alguien.
   */
  readonly pesoDelElemento: number | null
}

export type ResultadoRiesgo =
  /**
   * El hueco del ADR-21. No es un error: es la respuesta correcta cuando el
   * obligado todavía no configuró su modelo, y quien la reciba tiene que
   * mostrar el hueco, nunca rellenarlo.
   */
  | { readonly estado: 'sin_configuracion'; readonly falta: 'factores' | 'escala' }
  | {
      readonly estado: 'evaluado'
      readonly puntaje: number
      readonly gradoId: string
      readonly gradoClave: string
      readonly esAlto: boolean
      readonly aplicados: readonly PasoDelPuntaje[]
      readonly corteAplicado: number
      /**
       * Qué pasó con el piso del Art. 23 Bis 4.
       *
       * `aplicado` — el grado subió por el artículo, no por el puntaje.
       * `ya_era_alto` — el modelo del obligado ya lo clasificaba alto.
       * `no_aplica` — el cliente no es PEP extranjera.
       * `no_exigible` — el piso todavía no está vigente para esta fecha.
       * `no_se_sabe` — falta la declaración del Cap. III Quáter, así que no
       *   se puede afirmar que el grado calculado sea el que corresponde.
       */
      readonly pisoPepExtranjera:
        | 'aplicado'
        | 'ya_era_alto'
        | 'no_aplica'
        | 'no_exigible'
        | 'no_se_sabe'
    }

export class EscalaSinGradoAlto extends Error {
  constructor() {
    super(
      'El Art. 23 Bis 4 manda considerar a la Persona Políticamente Expuesta extranjera de Grado ' +
        'de Riesgo alto, y la escala de este obligado no tiene ningún grado marcado como alto. No ' +
        'se elige el más severo por su cuenta: cuál grado es «alto» lo declara el obligado en su ' +
        'metodología, y sin esa declaración el artículo no se puede cumplir.',
    )
    this.name = 'EscalaSinGradoAlto'
  }
}

export class PesoDeElementoAusente extends Error {
  constructor(elemento: string) {
    super(
      `El modelo declara el método "suma_ponderada_por_elemento" pero no tiene valor asignado ` +
        `para el elemento "${elemento}". El Art. 10 Septies 1 fr. II lo exige para CADA uno de ` +
        'los elementos definidos. Se detiene en vez de suponer 1: un peso supuesto sería VIZO ' +
        'decidiendo la importancia de un elemento de la metodología del obligado.',
    )
    this.name = 'PesoDeElementoAusente'
  }
}

export class MetodoDeMedicionDesconocido extends Error {
  constructor(metodo: string) {
    super(
      `El modelo declara el método de medición "${metodo}", que este motor no sabe ejecutar. Se ` +
        'detiene en vez de aproximarlo con otro: el método es parte de la metodología del ' +
        'obligado (Art. 10 Septies 1, fr. II), y sustituirlo cambiaría el resultado sin que ' +
        'nadie lo decidiera. Un método nuevo se implementa y se prueba.',
    )
    this.name = 'MetodoDeMedicionDesconocido'
  }
}

export class InsumoDeRiesgoIncoherente extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'InsumoDeRiesgoIncoherente'
  }
}

export class EscalaDeRiesgoInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'EscalaDeRiesgoInvalida'
  }
}

/**
 * Evalúa el Grado de Riesgo de un cliente contra la configuración del obligado.
 *
 * Devuelve el hueco si no hay nada configurado; lanza si el insumo o la escala
 * son incoherentes. Nunca devuelve un grado que no salga de la escala recibida.
 */
export function evaluarRiesgo(
  insumos: InsumosRiesgo,
  configuracion: ConfiguracionRiesgo,
): ResultadoRiesgo {
  // El método se valida ANTES de mirar nada más: un motor que solo revisa el
  // método cuando lo necesita descubre el modelo mal configurado en el cliente
  // equivocado.
  const metodo = configuracion.metodoMedicion
  if (metodo !== 'suma_ponderada' && metodo !== 'suma_ponderada_por_elemento') {
    throw new MetodoDeMedicionDesconocido(metodo)
  }

  // El hueco del ADR-21, antes que cualquier cálculo.
  if (configuracion.factores.length === 0) {
    return { estado: 'sin_configuracion', falta: 'factores' }
  }
  if (configuracion.escala.length === 0) {
    return { estado: 'sin_configuracion', falta: 'escala' }
  }

  const porId = new Map(configuracion.factores.map((f) => [f.id, f]))

  // Un factor presente que el modelo no contiene es un insumo de otro modelo, o
  // de una versión anterior. Calcular con él daría un puntaje plausible y
  // equivocado — la regla dura 6.
  const aplicados: PasoDelPuntaje[] = []
  for (const id of insumos.factoresPresentes) {
    const f = porId.get(id)
    if (f === undefined) {
      throw new InsumoDeRiesgoIncoherente(
        `El factor "${id}" no pertenece al modelo ${configuracion.modeloId}. Evaluar con un ` +
          'factor de otro modelo produciría un puntaje que ninguna metodología respalda.',
      )
    }
    // El segundo nivel de la fr. II. Se busca ANTES de sumar nada: si falta el
    // valor de un elemento, el puntaje que saldría sería plausible y
    // equivocado, que es justo lo que la regla dura 6 no admite.
    let pesoDelElemento: number | null = null
    if (metodo === 'suma_ponderada_por_elemento') {
      const w = configuracion.pesosPorElemento?.[f.elemento]
      if (w === undefined) throw new PesoDeElementoAusente(f.elemento)
      pesoDelElemento = w
    }
    aplicados.push({
      factorId: f.id,
      factor: f.factor,
      elemento: f.elemento,
      peso: f.peso,
      pesoDelElemento,
    })
  }

  if (new Set(insumos.factoresPresentes).size !== insumos.factoresPresentes.length) {
    throw new InsumoDeRiesgoIncoherente(
      'Hay factores repetidos en los insumos. Contarían dos veces y subirían el puntaje sin ' +
        'que ningún criterio lo justifique.',
    )
  }

  const puntaje = aplicados.reduce(
    (suma, p) => suma + p.peso * (p.pesoDelElemento ?? 1),
    0,
  )

  // La escala se recorre de mayor a menor: aplica el grado más severo cuyo
  // corte alcanza el puntaje.
  const ordenada = [...configuracion.escala].sort((a, b) => b.puntajeMinimo - a.puntajeMinimo)
  const grado = ordenada.find((g) => puntaje >= g.puntajeMinimo)

  if (grado === undefined) {
    throw new EscalaDeRiesgoInvalida(
      `El puntaje ${String(puntaje)} quedó por debajo de todos los cortes de la escala. El grado ` +
        'de menor orden debe empezar en 0; si no, hay puntajes sin grado que les corresponda.',
    )
  }

  // ── El piso del Art. 23 Bis 4 ──────────────────────────────────────────
  // «deberán considerar como […] de Grado de Riesgo alto, AL MENOS a […] las
  // Personas Políticamente Expuestas extranjeras».
  //
  // «Al menos» es lo que lo vuelve un PISO y no una asignación: sube al que
  // quedó por debajo y no toca al que ya estaba alto. Y el PUNTAJE no se
  // altera — es lo que la metodología del obligado produjo, y reescribirlo
  // sería falsificar su propio cálculo. Lo que cambia es el grado, y queda
  // dicho que cambió por el artículo.
  const piso = pisoDelArticulo23Bis4(insumos, configuracion, grado)
  if (piso === 'aplicado') {
    const alto = [...configuracion.escala]
      .filter((g) => g.esAlto)
      .sort((a, b) => a.puntajeMinimo - b.puntajeMinimo)[0]
    if (alto === undefined) throw new EscalaSinGradoAlto()
    return {
      estado: 'evaluado',
      puntaje,
      gradoId: alto.id,
      gradoClave: alto.clave,
      esAlto: true,
      aplicados,
      corteAplicado: alto.puntajeMinimo,
      pisoPepExtranjera: 'aplicado',
    }
  }

  return {
    estado: 'evaluado',
    puntaje,
    gradoId: grado.id,
    gradoClave: grado.clave,
    esAlto: grado.esAlto,
    aplicados,
    corteAplicado: grado.puntajeMinimo,
    pisoPepExtranjera: piso,
  }
}

/** Qué pasó con el piso, sin tocar todavía el resultado. */
function pisoDelArticulo23Bis4(
  insumos: InsumosRiesgo,
  configuracion: ConfiguracionRiesgo,
  grado: { readonly esAlto: boolean },
): 'aplicado' | 'ya_era_alto' | 'no_aplica' | 'no_exigible' | 'no_se_sabe' {
  if (configuracion.pisoPepExtranjeraExigible !== true) return 'no_exigible'
  // Sin declaración del Cap. III Quáter no se sabe si le toca. Se dice, en vez
  // de resolverlo como «no le toca» — que es la respuesta cómoda.
  if (insumos.esPepExtranjera === null || insumos.esPepExtranjera === undefined) {
    return 'no_se_sabe'
  }
  if (!insumos.esPepExtranjera) return 'no_aplica'
  return grado.esAlto ? 'ya_era_alto' : 'aplicado'
}
