/**
 * El motor de evaluación de ENTIDAD — el riesgo del propio obligado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE, Y QUÉ NO DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 * La Ley separa dos objetos de evaluación (Art. 18 fr. VII: «sus Riesgos, así
 * como los de las personas Clientes o Usuarias») y este motor ejecuta el
 * primero: el del obligado. Su salida es la que decide el tipo de auditoría
 * anual — interna permitida si el grado es bajo o medio, auditor externo
 * independiente certificado por la UIF si es alto (Arts. 44 y 45 del Acuerdo
 * 115/2026, «de conformidad con la metodología prevista en el Capítulo II
 * Quáter»).
 *
 * NO decide cuánto vale cada elemento, cuánto reduce cada nivel de
 * efectividad, ni dónde empieza el riesgo alto: todo eso es configuración del
 * obligado (ADR-21) y llega ya declarada. Tres fronteras concretas:
 *
 * 1. **El método de entidad lo declara el obligado**, como el de medición. El
 *    motor implementa los que sabe ejecutar y se detiene ante uno que no
 *    conoce.
 *
 * 2. **Un mitigante sin nivel de efectividad detiene la evaluación.** Contarlo
 *    como cero sería VIZO decidiendo que las políticas del obligado no mitigan
 *    nada; ignorarlo, que mitigan sin decir cuánto. Ninguna de las dos es una
 *    respuesta: es la regla dura 6.
 *
 * 3. **Los mitigantes reducen la entidad, nunca el grado de un cliente.** Es
 *    la Opción B de ARQ-01: el score individual queda intocado y las
 *    compuertas de cliente siguen siendo indiluibles por construcción.
 *
 * El único juicio que este motor NO delega es estructural: la mitigación de un
 * elemento no puede exceder su valor — una exposición negativa no es una
 * exposición. Ese tope no es una opinión sobre cuánto mitigar: es la forma de
 * la resta.
 */

import {
  EscalaDeRiesgoInvalida,
  PesoDeElementoAusente,
  type GradoConfigurado,
  type PesosPorElemento,
} from './riesgo'

/** Los métodos de entidad que este motor sabe ejecutar. */
export type MetodoEntidad = 'residual_por_elemento'

export interface NivelDeclarado {
  readonly id: string
  readonly clave: string
  readonly orden: number
  readonly valor: number
}

export interface MitiganteDeclarado {
  readonly id: string
  readonly descripcion: string
  /** Claves de los elementos sobre los que actúa (Art. 10 Septies 1 fr. III). */
  readonly elementos: readonly string[]
  /** El nivel de efectividad que el obligado le declaró. `null` = sin declarar. */
  readonly nivel: NivelDeclarado | null
}

export interface ConfiguracionEntidad {
  readonly modeloId: string
  /** Tal como lo declaró el obligado. Puede ser uno que este motor no conozca. */
  readonly metodoEntidad: string | null
  /** Las claves de TODOS los elementos del catálogo: cada uno exige su valor. */
  readonly elementos: readonly string[]
  readonly pesosPorElemento: PesosPorElemento
  readonly mitigantes: readonly MitiganteDeclarado[]
  readonly escala: readonly GradoConfigurado[]
}

export interface MitigacionAplicada {
  readonly mitiganteId: string
  readonly descripcion: string
  readonly nivelClave: string
  readonly valorNivel: number
}

export interface ElementoEvaluado {
  readonly elemento: string
  readonly valor: number
  /** La suma declarada, ANTES del tope estructural. Se enseña para que el
   *  desglose no esconda que hubo más mitigación declarada que exposición. */
  readonly mitigacionDeclarada: number
  /** Lo que efectivamente redujo: nunca más que el valor del elemento. */
  readonly mitigacionAplicada: number
  readonly residual: number
  readonly mitigantes: readonly MitigacionAplicada[]
}

export type ResultadoEntidad =
  /**
   * El hueco del ADR-21, en su versión de entidad. No es un error: es la
   * respuesta correcta mientras el obligado no declare su configuración, y
   * quien la reciba muestra el hueco, nunca lo rellena.
   */
  | {
      readonly estado: 'sin_configuracion'
      readonly falta: 'metodo_entidad' | 'pesos_elemento' | 'escala'
    }
  | {
      readonly estado: 'evaluado'
      readonly inherente: number
      readonly mitigacion: number
      readonly residual: number
      readonly gradoId: string
      readonly gradoClave: string
      readonly esAlto: boolean
      /**
       * La consecuencia de los Arts. 44/45, ya resuelta: la pantalla la pinta,
       * no la deriva. `externa_obligatoria` cuando el grado es alto;
       * `interna_permitida` cuando no — la externa siempre puede elegirse.
       */
      readonly auditoria: 'externa_obligatoria' | 'interna_permitida'
      readonly porElemento: readonly ElementoEvaluado[]
      readonly corteAplicado: number
    }

export class MetodoDeEntidadDesconocido extends Error {
  constructor(metodo: string) {
    super(
      `El modelo declara el método de entidad "${metodo}", que este motor no sabe ejecutar. Se ` +
        'detiene en vez de aproximarlo con otro: de esta evaluación cuelga qué auditoría le toca ' +
        'al obligado (Arts. 44/45), y un método sustituido cambiaría esa respuesta sin que nadie ' +
        'lo decidiera. Un método nuevo se implementa y se prueba.',
    )
    this.name = 'MetodoDeEntidadDesconocido'
  }
}

export class MitiganteSinEfectividad extends Error {
  constructor(descripcion: string) {
    super(
      `El mitigante "${descripcion}" no tiene nivel de efectividad declarado. Se detiene en vez ` +
        'de contarlo como cero: cero sería VIZO decidiendo que esa política no mitiga nada, y ' +
        'omitirlo sería mitigar sin decir cuánto. El obligado le declara un nivel de su escala ' +
        '— con la evidencia que ese nivel exige — o lo retira del modelo.',
    )
    this.name = 'MitiganteSinEfectividad'
  }
}

export class MitiganteSinCobertura extends Error {
  constructor(descripcion: string) {
    super(
      `El mitigante "${descripcion}" no dice sobre qué elemento actúa. Sin cobertura no se puede ` +
        '«establecer el efecto» que pide el Art. 10 Septies 1 fr. III, y su valor no tiene dónde ' +
        'aplicarse. Se declara la cobertura o se retira el mitigante.',
    )
    this.name = 'MitiganteSinCobertura'
  }
}

/**
 * Evalúa el riesgo de la entidad contra la configuración del obligado.
 *
 * Devuelve el hueco si falta configuración; lanza si un mitigante quedó a
 * medias o el método es desconocido. Nunca devuelve un grado que no salga de
 * la escala recibida.
 */
export function evaluarEntidad(configuracion: ConfiguracionEntidad): ResultadoEntidad {
  // El método primero, como en el motor de cliente: un modelo mal configurado
  // se descubre aquí, no a medio cálculo.
  const metodo = configuracion.metodoEntidad
  if (metodo === null || metodo.trim() === '') {
    return { estado: 'sin_configuracion', falta: 'metodo_entidad' }
  }
  if (metodo !== 'residual_por_elemento') {
    throw new MetodoDeEntidadDesconocido(metodo)
  }

  if (Object.keys(configuracion.pesosPorElemento).length === 0) {
    return { estado: 'sin_configuracion', falta: 'pesos_elemento' }
  }
  if (configuracion.escala.length === 0) {
    return { estado: 'sin_configuracion', falta: 'escala' }
  }

  // Los mitigantes a medias se detectan ANTES de sumar nada: un residual que
  // ignoró un mitigante sin nivel sería plausible y equivocado (regla dura 6).
  for (const m of configuracion.mitigantes) {
    if (m.elementos.length === 0) throw new MitiganteSinCobertura(m.descripcion)
    if (m.nivel === null) throw new MitiganteSinEfectividad(m.descripcion)
  }

  const porElemento: ElementoEvaluado[] = []
  for (const elemento of configuracion.elementos) {
    const valor = configuracion.pesosPorElemento[elemento]
    // La fr. II exige un valor para CADA elemento definido. Suponer uno sería
    // VIZO decidiendo la importancia de un elemento de la metodología ajena.
    if (valor === undefined) throw new PesoDeElementoAusente(elemento)

    const aplicables: MitigacionAplicada[] = configuracion.mitigantes
      .filter((m) => m.elementos.includes(elemento))
      .map((m) => ({
        mitiganteId: m.id,
        descripcion: m.descripcion,
        // El for de arriba ya garantizó el nivel; el `?? 0` nunca corre y solo
        // le consta al compilador.
        nivelClave: m.nivel?.clave ?? '',
        valorNivel: m.nivel?.valor ?? 0,
      }))

    const declarada = aplicables.reduce((suma, m) => suma + m.valorNivel, 0)
    // El tope estructural: la exposición de un elemento no baja de cero. No es
    // un juicio sobre los valores del obligado — es que la resta no produce
    // exposiciones negativas que abaraten OTROS elementos.
    const aplicada = Math.min(valor, declarada)

    porElemento.push({
      elemento,
      valor,
      mitigacionDeclarada: declarada,
      mitigacionAplicada: aplicada,
      residual: valor - aplicada,
      mitigantes: aplicables,
    })
  }

  const inherente = porElemento.reduce((s, e) => s + e.valor, 0)
  const mitigacion = porElemento.reduce((s, e) => s + e.mitigacionAplicada, 0)
  const residual = inherente - mitigacion

  // El corte lo pone la escala del obligado, igual que en el motor de cliente:
  // aplica el grado más severo cuyo corte alcanza el residual.
  const ordenada = [...configuracion.escala].sort((a, b) => b.puntajeMinimo - a.puntajeMinimo)
  const grado = ordenada.find((g) => residual >= g.puntajeMinimo)
  if (grado === undefined) {
    throw new EscalaDeRiesgoInvalida(
      `El residual ${String(residual)} quedó por debajo de todos los cortes de la escala. El ` +
        'grado de menor orden debe empezar en 0; si no, hay puntajes sin grado que les corresponda.',
    )
  }

  return {
    estado: 'evaluado',
    inherente,
    mitigacion,
    residual,
    gradoId: grado.id,
    gradoClave: grado.clave,
    esAlto: grado.esAlto,
    auditoria: grado.esAlto ? 'externa_obligatoria' : 'interna_permitida',
    porElemento,
    corteAplicado: grado.puntajeMinimo,
  }
}
