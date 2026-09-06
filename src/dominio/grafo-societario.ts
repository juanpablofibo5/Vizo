/**
 * El grafo societario — la cadena de titularidad que el motor por fin recorre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ HUECO CIERRA
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 23 Quinquies fr. I habla de quien «directa o INDIRECTAMENTE» posea
 * el 25% o más. Hasta hoy, «indirectamente» lo resolvía el capturista: la
 * cadena PF → PM A (60%) → PM B (50%) → cliente había que multiplicarla a
 * mano y teclear «30%». El plano de arquitectura (4-sep-2026) lo dice con
 * razón: ese cálculo es el que más se equivoca a mano — 30% × 80% = 24% y
 * NO alcanza el umbral, aunque los dos números por separado suenen a que sí.
 *
 * Este módulo recibe la estructura tal como se capturó —partes y
 * participaciones— y devuelve, por cada persona física, su participación
 * efectiva con LA CADENA COMPLETA de cómo se llegó a ella. La traza no es
 * cortesía: el artículo exige documentar el procedimiento, y «24% porque
 * 30 × 80» es el procedimiento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA ARITMÉTICA ES EXACTA, NO DE PUNTO FLOTANTE
 * ────────────────────────────────────────────────────────────────────────────
 * Los porcentajes llegan con dos decimales (así los guarda la base). El
 * producto de una cadena se calcula en CENTÉSIMAS DE PUNTO como BigInt:
 *
 *   efectivo% = (h₁ × h₂ × … × hₙ) / 100^(2n−1),  con hᵢ = pctᵢ × 100
 *
 * y el resultado se redondea UNA sola vez a millonésimas de punto porcentual.
 * ¿Por qué tanto cuidado? Porque la comparación decisiva es contra un borde
 * inclusivo: 62.5% × 40% debe dar EXACTAMENTE 25 —y ser Beneficiario
 * Controlador— y en float `0.625 * 0.4` es un polvo binario que puede caer
 * del lado equivocado. Es la misma razón por la que los montos del proyecto
 * son centavos enteros y nunca float.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ NO DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 * Ni el tope de profundidad ni la regla de agregación: los dos llegan en la
 * configuración desde el catálogo. La regla implementada es
 * `producto_de_la_cadena` —la práctica estándar— pero el Art. 23 Quinquies no
 * define el método de cómputo, así que está sembrada como POR CONFIRMAR-14
 * con el especialista. Si el catálogo dijera otra regla, este módulo se
 * detiene: aproximarla con la que sabe cambiaría el resultado sin que nadie
 * lo decidiera.
 *
 * Y un ciclo NO se resuelve: se nombra. La participación cruzada (A tiene 40%
 * de B y B tiene 30% de A) vuelve la participación efectiva un sistema de
 * ecuaciones que ninguna norma dice cómo resolver. Calcular «algo razonable»
 * sería la regla dura 6 rota en el peor lugar.
 */

export type TipoDeParte = 'fisica' | 'moral' | 'fideicomiso' | 'otra_figura'

export interface ParteDelGrafo {
  readonly id: string
  readonly tipo: TipoDeParte
  readonly esLaRaiz: boolean
}

/** `duenoId` posee `porcentaje` de `poseidaId`. */
export interface ParticipacionDelGrafo {
  readonly id: string
  readonly duenoId: string
  readonly poseidaId: string
  readonly porcentaje: number
}

export interface ConfiguracionDelGrafo {
  /** Del catálogo (`grafo_profundidad_maxima`). Tope duro del recorrido. */
  readonly profundidadMaxima: number
  /** Del catálogo (`grafo_regla_agregacion`). Solo se sabe una; otra detiene. */
  readonly reglaAgregacion: string
}

export interface TramoDeCadena {
  readonly duenoId: string
  readonly poseidaId: string
  readonly porcentaje: number
}

/** Una cadena completa: del titular físico hasta la raíz, con su producto. */
export interface CadenaDeTitularidad {
  readonly titularId: string
  /** Del titular hacia la raíz, en orden. Un tramo = participación directa. */
  readonly tramos: readonly TramoDeCadena[]
  /** El producto de la cadena, en millonésimas de punto ya redondeado. */
  readonly porcentajeEfectivo: number
}

export interface TitularEfectivo {
  readonly titularId: string
  /** Participación por tramo único (directa en la raíz). */
  readonly directa: number
  /** Suma de los productos de las cadenas de dos tramos o más. */
  readonly indirecta: number
  readonly efectiva: number
  readonly cadenas: readonly CadenaDeTitularidad[]
}

export interface AdvertenciaDelGrafo {
  /**
   * `suma_incompleta`: los dueños capturados de una parte no llegan al 100%.
   * No es un error —puede faltar el minoritario que nadie capturó— pero
   * tampoco es silencio: la cifra de quien sí está capturado sigue siendo
   * válida, y el hueco queda dicho.
   */
  readonly tipo: 'suma_incompleta'
  readonly parteId: string
  readonly sumaCapturada: number
}

export interface ResolucionDelGrafo {
  readonly titulares: readonly TitularEfectivo[]
  readonly advertencias: readonly AdvertenciaDelGrafo[]
  /** Cuántos tramos tuvo la cadena más larga: se congela junto al resultado. */
  readonly profundidadRecorrida: number
}

// ─────────────────────────────────────────────────────────────────────────
// Errores accionables
// ─────────────────────────────────────────────────────────────────────────

export class GrafoIncoherente extends Error {
  constructor(detalle: string) {
    super(
      `La estructura societaria no cuadra: ${detalle}. El motor no calcula participaciones ` +
        'sobre una estructura incoherente.',
    )
    this.name = 'GrafoIncoherente'
  }
}

export class CicloEnElGrafo extends Error {
  constructor(readonly ciclo: readonly string[]) {
    super(
      `La estructura tiene participación cruzada: ${ciclo.join(' → ')} → ${String(ciclo[0])}. ` +
        'Con un ciclo, la participación efectiva es un sistema de ecuaciones que ninguna norma ' +
        'dice cómo resolver — el caso se marca para resolución humana, no se aproxima.',
    )
    this.name = 'CicloEnElGrafo'
  }
}

export class ProfundidadExcedida extends Error {
  constructor(tope: number) {
    super(
      `La cadena de titularidad rebasó los ${String(tope)} niveles del tope ` +
        '(`grafo_profundidad_maxima`). Una estructura así de honda se revisa a mano antes de ' +
        'subir el tope: más niveles legítimos son rarísimos, y un recorrido sin tope es un ' +
        'recorrido que un dato malo vuelve infinito.',
    )
    this.name = 'ProfundidadExcedida'
  }
}

export class ReglaDeAgregacionDesconocida extends Error {
  constructor(regla: string) {
    super(
      `El catálogo declara la regla de agregación "${regla}" y este motor no la sabe ejecutar. ` +
        'Se detiene en vez de aproximarla con otra: el método de cómputo de la participación ' +
        'indirecta cambia quién es Beneficiario Controlador (POR CONFIRMAR-14).',
    )
    this.name = 'ReglaDeAgregacionDesconocida'
  }
}

// ─────────────────────────────────────────────────────────────────────────
// La aritmética exacta
// ─────────────────────────────────────────────────────────────────────────

/** Porcentaje (dos decimales) → centésimas de punto, como BigInt. */
function aCentesimas(pct: number): bigint {
  return BigInt(Math.round(pct * 100))
}

/**
 * Producto de una cadena, en millonésimas de punto porcentual, redondeado a
 * la mitad hacia arriba UNA sola vez. Exacto hasta donde los insumos lo son.
 */
function productoEnMillonesimas(tramos: readonly TramoDeCadena[]): number {
  let numerador = 1n
  for (const t of tramos) numerador *= aCentesimas(t.porcentaje)
  // efectivo% = numerador / 100^(2n-1); en millonésimas: × 10^6.
  const denominador = 100n ** BigInt(2 * tramos.length - 1)
  const escalado = numerador * 1_000_000n
  return Number((escalado * 2n + denominador) / (2n * denominador))
}

const deMillonesimas = (m: number): number => m / 1_000_000

// ─────────────────────────────────────────────────────────────────────────
// La resolución
// ─────────────────────────────────────────────────────────────────────────

export function resolverGrafo(
  entrada: {
    readonly partes: readonly ParteDelGrafo[]
    readonly participaciones: readonly ParticipacionDelGrafo[]
  },
  configuracion: ConfiguracionDelGrafo,
): ResolucionDelGrafo {
  if (configuracion.reglaAgregacion !== 'producto_de_la_cadena') {
    throw new ReglaDeAgregacionDesconocida(configuracion.reglaAgregacion)
  }
  if (!Number.isInteger(configuracion.profundidadMaxima) || configuracion.profundidadMaxima < 1) {
    throw new GrafoIncoherente(
      `el tope de profundidad "${String(configuracion.profundidadMaxima)}" no es un entero positivo`,
    )
  }

  const porId = new Map(entrada.partes.map((p) => [p.id, p]))
  const raices = entrada.partes.filter((p) => p.esLaRaiz)
  if (raices.length === 0) {
    throw new GrafoIncoherente('no hay raíz — nadie marcó cuál parte es el cliente evaluado')
  }
  if (raices.length > 1) {
    throw new GrafoIncoherente('hay más de una raíz, y el cliente evaluado es uno solo')
  }
  const raiz = raices[0] as ParteDelGrafo

  // Las aristas se verifican completas ANTES de recorrer nada.
  const duenosDe = new Map<string, ParticipacionDelGrafo[]>()
  const vistos = new Set<string>()
  for (const arista of entrada.participaciones) {
    const dueno = porId.get(arista.duenoId)
    const poseida = porId.get(arista.poseidaId)
    if (dueno === undefined || poseida === undefined) {
      throw new GrafoIncoherente(
        `la participación ${arista.id} apunta a una parte que no está en la estructura`,
      )
    }
    if (poseida.tipo === 'fisica') {
      throw new GrafoIncoherente('nadie puede ser dueño de una persona física')
    }
    if (arista.duenoId === arista.poseidaId) {
      throw new GrafoIncoherente(`la parte ${arista.duenoId} aparece como dueña de sí misma`)
    }
    if (!(arista.porcentaje > 0 && arista.porcentaje <= 100)) {
      throw new GrafoIncoherente(
        `la participación ${arista.id} declara ${String(arista.porcentaje)}%, fuera de (0, 100]`,
      )
    }
    const clave = `${arista.duenoId}→${arista.poseidaId}`
    if (vistos.has(clave)) {
      throw new GrafoIncoherente(
        `hay dos participaciones vigentes de la misma parte sobre ${arista.poseidaId}`,
      )
    }
    vistos.add(clave)
    const lista = duenosDe.get(arista.poseidaId) ?? []
    lista.push(arista)
    duenosDe.set(arista.poseidaId, lista)
  }

  // La suma por parte: >100 es imposible y detiene; <100 se dice, no se calla.
  const advertencias: AdvertenciaDelGrafo[] = []
  for (const [parteId, aristas] of duenosDe) {
    const suma = aristas.reduce((s, a) => s + Math.round(a.porcentaje * 100), 0)
    if (suma > 10_000) {
      throw new GrafoIncoherente(
        `los dueños capturados de ${parteId} suman ${String(suma / 100)}%: nadie reparte más del 100% de su capital`,
      )
    }
    if (suma < 10_000) {
      advertencias.push({ tipo: 'suma_incompleta', parteId, sumaCapturada: suma / 100 })
    }
  }

  // ── El recorrido: de la raíz hacia arriba ─────────────────────────────
  const cadenasPorTitular = new Map<string, CadenaDeTitularidad[]>()
  let profundidadRecorrida = 0

  const subir = (parteId: string, tramos: TramoDeCadena[], pila: string[]): void => {
    for (const arista of duenosDe.get(parteId) ?? []) {
      const dueno = porId.get(arista.duenoId) as ParteDelGrafo
      if (pila.includes(dueno.id)) {
        const desde = pila.indexOf(dueno.id)
        throw new CicloEnElGrafo([...pila.slice(desde), parteId])
      }
      const cadena = [
        { duenoId: arista.duenoId, poseidaId: arista.poseidaId, porcentaje: arista.porcentaje },
        ...tramos,
      ]
      if (cadena.length > configuracion.profundidadMaxima) {
        throw new ProfundidadExcedida(configuracion.profundidadMaxima)
      }
      profundidadRecorrida = Math.max(profundidadRecorrida, cadena.length)

      if (dueno.tipo === 'fisica') {
        const lista = cadenasPorTitular.get(dueno.id) ?? []
        lista.push({
          titularId: dueno.id,
          tramos: cadena,
          porcentajeEfectivo: deMillonesimas(productoEnMillonesimas(cadena)),
        })
        cadenasPorTitular.set(dueno.id, lista)
      } else {
        subir(dueno.id, cadena, [...pila, dueno.id])
      }
    }
  }
  subir(raiz.id, [], [raiz.id])

  // ── La suma por titular, en millonésimas para no juntar polvo ─────────
  const titulares: TitularEfectivo[] = [...cadenasPorTitular.entries()].map(([titularId, cadenas]) => {
    let directa = 0
    let indirecta = 0
    for (const c of cadenas) {
      const m = Math.round(c.porcentajeEfectivo * 1_000_000)
      if (c.tramos.length === 1) directa += m
      else indirecta += m
    }
    return {
      titularId,
      directa: deMillonesimas(directa),
      indirecta: deMillonesimas(indirecta),
      efectiva: deMillonesimas(directa + indirecta),
      cadenas,
    }
  })

  return { titulares, advertencias, profundidadRecorrida }
}
