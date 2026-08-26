/**
 * Qué exige el Art. 10 Septies 1, y qué de eso acredita la metodología
 * configurada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO EXISTE, Y POR QUÉ NO ES UN «PORCENTAJE DE AVANCE»
 * ────────────────────────────────────────────────────────────────────────────
 * La metodología de Riesgos es del obligado (ADR-21): VIZO no propone
 * elementos, ni indicadores, ni pesos, ni mitigantes. Pero sí puede decir, sin
 * interpretar nada, **cuáles de las cuatro exigencias del artículo tienen
 * respaldo en lo que está configurado** — que es el mismo criterio del ADR-20
 * con los catorce apartados del Manual: se acredita lo que se puede demostrar
 * con un dato del sistema, y lo demás sale como hueco con su fundamento.
 *
 * Cada requisito se responde con un HECHO consultable, nunca con un juicio:
 *
 *   fr. I     ¿hay indicadores en los cuatro elementos mínimos?
 *   fr. II    ¿hay valor por indicador Y por elemento?
 *   fr. III   ¿hay mitigantes, y dicen sobre qué elemento actúan?
 *   ¶ final   ¿hay indicadores de los dos delitos en CADA elemento?
 *
 * Lo que este módulo NO hace es decir si la metodología es buena. Que un
 * elemento tenga un indicador no lo vuelve suficiente; eso lo juzga el
 * especialista, y VIZO no se mete (ALCANCE §0.5).
 */

/** Las claves de los cuatro elementos mínimos del Art. 10 Septies 1 fr. I. */
export const ELEMENTOS_MINIMOS = [
  'actos_operaciones',
  'tipo_cliente',
  'geografia',
  'transacciones_canales',
] as const

/** Los dos delitos que nombra el párrafo final. Del CPF, no del obligado. */
export const DELITOS_DEL_PARRAFO_FINAL = ['art_139_quater', 'art_400_bis'] as const

export type DelitoCpf = (typeof DELITOS_DEL_PARRAFO_FINAL)[number]

export interface IndicadorConfigurado {
  readonly elemento: string
  readonly peso: number
  readonly delitos: readonly DelitoCpf[]
}

export interface MitiganteConfigurado {
  readonly descripcion: string
  readonly efecto: string
  readonly elementos: readonly string[]
}

export interface MetodologiaConfigurada {
  readonly metodoMedicion: string
  readonly indicadores: readonly IndicadorConfigurado[]
  /** Por clave de elemento. El segundo nivel de la fr. II. */
  readonly pesosPorElemento: Readonly<Record<string, number>>
  readonly mitigantes: readonly MitiganteConfigurado[]
}

export type ClaveDeRequisito = 'fr_i' | 'fr_ii' | 'fr_iii' | 'parrafo_final'

export interface Requisito {
  readonly clave: ClaveDeRequisito
  readonly fundamento: string
  readonly exige: string
  readonly acreditado: boolean
  /** Qué falta, en las palabras del artículo. Vacío si está acreditado. */
  readonly falta: readonly string[]
}

const NOMBRE_ELEMENTO: Record<string, string> = {
  actos_operaciones: 'actos u operaciones',
  tipo_cliente: 'tipo de personas Clientes o Usuarias',
  geografia: 'países y áreas geográficas',
  transacciones_canales: 'transacciones y canales',
}

const nombre = (clave: string): string => NOMBRE_ELEMENTO[clave] ?? clave

export function coberturaDeLaMetodologia(m: MetodologiaConfigurada): Requisito[] {
  const conIndicador = new Set(m.indicadores.map((i) => i.elemento))

  // ── Fr. I ─────────────────────────────────────────────────────────────
  const sinIndicador = ELEMENTOS_MINIMOS.filter((e) => !conIndicador.has(e))
  const frI: Requisito = {
    clave: 'fr_i',
    fundamento: 'Art. 10 Septies 1, fr. I',
    exige: 'Identificar elementos e indicadores, con cuatro elementos como mínimo.',
    acreditado: sinIndicador.length === 0,
    falta: sinIndicador.map((e) => `Sin ningún indicador en «${nombre(e)}».`),
  }

  // ── Fr. II ────────────────────────────────────────────────────────────
  // Dos oraciones, dos exigencias. La primera la cumple cualquier modelo con
  // pesos; la segunda solo el que además valora cada elemento Y usa un método
  // que lo aplique — un peso guardado que el método ignora no es «utilizar un
  // método que asigne valores», es un número decorativo.
  const faltaII: string[] = []
  if (m.indicadores.length === 0) {
    faltaII.push('No hay indicadores a los que asignar valor.')
  }
  const elementosUsados = [...conIndicador]
  const sinPeso = elementosUsados.filter((e) => m.pesosPorElemento[e] === undefined)
  for (const e of sinPeso) {
    faltaII.push(`Sin valor asignado al elemento «${nombre(e)}» (segunda oración de la fr. II).`)
  }
  if (m.metodoMedicion !== 'suma_ponderada_por_elemento') {
    // Un modelo en borrador puede no haber declarado método todavía, y decir
    // «el método declarado («»)» con las comillas vacías no informa de nada.
    faltaII.push(
      m.metodoMedicion === ''
        ? 'Todavía no se declara un método de medición.'
        : `El método declarado («${m.metodoMedicion}») no aplica el valor de los elementos: ` +
          'la fr. II pide asignarlo «a su vez», no solo guardarlo.',
    )
  }
  const frII: Requisito = {
    clave: 'fr_ii',
    fundamento: 'Art. 10 Septies 1, fr. II',
    exige: 'Un método de medición que asigne valor a cada indicador y, a su vez, a cada elemento.',
    acreditado: faltaII.length === 0,
    falta: faltaII,
  }

  // ── Fr. III ───────────────────────────────────────────────────────────
  const faltaIII: string[] = []
  if (m.mitigantes.length === 0) {
    faltaIII.push('No hay ningún Mitigante identificado.')
  }
  const huerfanos = m.mitigantes.filter((x) => x.elementos.length === 0)
  if (huerfanos.length > 0) {
    faltaIII.push(
      `${String(huerfanos.length)} Mitigante(s) no dicen sobre qué elemento actúan, así que no ` +
        'permiten establecer su efecto.',
    )
  }
  const frIII: Requisito = {
    clave: 'fr_iii',
    fundamento: 'Art. 10 Septies 1, fr. III',
    exige: 'Identificar los Mitigantes implementados y el efecto que tienen sobre los elementos.',
    acreditado: faltaIII.length === 0,
    falta: faltaIII,
  }

  // ── Párrafo final ─────────────────────────────────────────────────────
  // «para CADA UNO de los elementos de Riesgo señalados». La exigencia es por
  // elemento y por delito: un indicador de 400 Bis en geografía no cubre a
  // 139 Quáter en geografía, ni a 400 Bis en el resto.
  const faltaFinal: string[] = []
  for (const e of ELEMENTOS_MINIMOS) {
    for (const d of DELITOS_DEL_PARRAFO_FINAL) {
      const hay = m.indicadores.some((i) => i.elemento === e && i.delitos.includes(d))
      if (!hay) {
        const art = d === 'art_139_quater' ? '139 Quáter' : '400 Bis'
        faltaFinal.push(`Sin indicador del Art. ${art} del CPF en «${nombre(e)}».`)
      }
    }
  }
  const parrafoFinal: Requisito = {
    clave: 'parrafo_final',
    fundamento: 'Art. 10 Septies 1, párrafo final',
    exige:
      'Indicadores específicos de los delitos de los Arts. 139 Quáter y 400 Bis del Código ' +
      'Penal Federal, para cada uno de los elementos.',
    acreditado: faltaFinal.length === 0,
    falta: faltaFinal,
  }

  return [frI, frII, frIII, parrafoFinal]
}

/**
 * ¿La metodología acredita el artículo completo?
 *
 * Se responde con un `every`, no con un conteo: «tres de cuatro» sonaría a
 * avance y el Transitorio Segundo no admite avances parciales el 1 de marzo
 * de 2027.
 */
export function metodologiaCompleta(requisitos: readonly Requisito[]): boolean {
  return requisitos.every((r) => r.acreditado)
}
