/**
 * La Constancia de mecanismos, y el índice del Manual.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA REGLA, QUE ES TODO EL ARCHIVO (ADR-20)
 * ────────────────────────────────────────────────────────────────────────────
 *   **VIZO no emite una sola frase que no pueda respaldar con un dato del
 *   sistema. Sin evidencia no hay prosa: hay hueco.**
 *
 * Es la regla dura 6 aplicada a un documento en vez de a un cálculo. El modo de
 * falla es el mismo y por eso la respuesta es la misma: ante un dato que falta,
 * no se rellena con algo razonable — se dice que falta.
 *
 * En concreto: un apartado marcado `acreditado` cuyo recolector devuelve CERO
 * hechos **degrada a hueco**. No genera un párrafo genérico, no dice «el
 * obligado cuenta con mecanismos de…», no escribe nada. Ese es el caso que hay
 * que probar, porque es el que convierte una frontera declarada en una
 * verificable.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA FUNCIÓN NO SABE DE FRACCIONES
 * ────────────────────────────────────────────────────────────────────────────
 * Los catorce apartados son filas de `apartados_manual`, con su texto literal y
 * la clave de su recolector. Aquí solo se cruzan apartados con hechos. Cuando
 * se construya el Capítulo III Bis y el apartado II pase de hueco a acreditado,
 * cambia una fila del catálogo y este archivo no se entera.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA FUNCIÓN NO HACE, Y ES LA FRONTERA
 * ────────────────────────────────────────────────────────────────────────────
 * No redacta políticas. No sugiere el texto de un hueco. No recomienda qué
 * debida diligencia corresponde ni clasifica riesgo. Un hueco lleva el texto
 * del artículo, por qué VIZO no lo acredita, y **preguntas** — nunca respuestas.
 */

/** Un hecho verificable del sistema. Nada aquí es opinión. */
export interface HechoAcreditado {
  /** Qué se afirma, en una línea. */
  afirmacion: string
  /** De dónde sale: tabla, catálogo, versión, cuenta. Es lo que hace auditable la frase. */
  respaldo: string
}

export type OrigenApartado = 'acreditado' | 'acreditado_parcial' | 'del_obligado'

/** Una fila de `apartados_manual`. */
export interface ApartadoDelManual {
  fraccion: string
  orden: number
  /** Literal del Art. 37 Bis. */
  texto: string
  origen: OrigenApartado
  claveEvidencia?: string | undefined
  porQueNo?: string | undefined
  preguntas: readonly string[]
  fuente: string
}

/** Cómo salió cada apartado DESPUÉS de cruzarlo con la evidencia. */
export type Resolucion =
  /** VIZO lo acredita entero: hay hechos y el catálogo no reserva nada al obligado. */
  | 'acreditado'
  /** VIZO acredita una parte y nombra lo que falta. */
  | 'parcial'
  /** Hueco: lo pone el obligado. Puede venir del catálogo o de que no hubo evidencia. */
  | 'hueco'

export interface SeccionResuelta {
  fraccion: string
  orden: number
  texto: string
  fuente: string
  resolucion: Resolucion
  /** Vacío en un hueco. */
  hechos: readonly HechoAcreditado[]
  porQueNo?: string | undefined
  preguntas: readonly string[]
  /**
   * `true` cuando el catálogo decía «acreditado» y el recolector no devolvió
   * nada. No es lo mismo que un hueco de catálogo: aquí el sistema DEBERÍA
   * poder demostrarlo y no pudo, y eso hay que verlo, no esconderlo.
   */
  degradado: boolean
}

export interface Constancia {
  secciones: readonly SeccionResuelta[]
  /** Cuántos apartados quedaron enteramente a cargo del obligado. */
  huecos: number
  acreditados: number
  parciales: number
  /** Apartados que el catálogo daba por acreditados y se quedaron sin evidencia. */
  degradados: readonly string[]
}

export class CatalogoDelManualVacio extends Error {
  constructor() {
    super(
      'No hay apartados del Manual vigentes a esa fecha. Sin catálogo no se puede generar una ' +
        'constancia: saldría un documento de cero apartados que parecería completo. ' +
        'Revisa apartados_manual y sus vigencias.',
    )
    this.name = 'CatalogoDelManualVacio'
  }
}

/**
 * Cruza los apartados del catálogo con los hechos que se pudieron recolectar.
 *
 * @param apartados Los vigentes a la fecha, en orden.
 * @param hechos    Por clave de recolector, los hechos que devolvió. Una clave
 *                  ausente o con lista vacía es lo mismo: no hay evidencia.
 */
export function resolverConstancia(
  apartados: readonly ApartadoDelManual[],
  hechos: ReadonlyMap<string, readonly HechoAcreditado[]>,
): Constancia {
  // REGLA DURA 6, y aquí el caso caro es idéntico al de la completitud: con el
  // catálogo vacío no hay apartados que reclamar, así que el documento saldría
  // «completo» con cero secciones. Un catálogo que no cargó y un Manual sin
  // pendientes se ven iguales desde aquí; solo uno de los dos es defendible.
  if (apartados.length === 0) throw new CatalogoDelManualVacio()

  const secciones = [...apartados]
    .sort((a, b) => a.orden - b.orden)
    .map((a): SeccionResuelta => {
      const recolectados =
        a.claveEvidencia === undefined ? [] : (hechos.get(a.claveEvidencia) ?? [])

      // El corazón del ADR-20. El catálogo dice que VIZO lo acredita, pero
      // quien decide es la EVIDENCIA: sin hechos, la sección no escribe prosa.
      const hayEvidencia = recolectados.length > 0
      const degradado = a.origen !== 'del_obligado' && !hayEvidencia

      const resolucion: Resolucion = !hayEvidencia
        ? 'hueco'
        : a.origen === 'acreditado_parcial'
          ? 'parcial'
          : 'acreditado'

      return {
        fraccion: a.fraccion,
        orden: a.orden,
        texto: a.texto,
        fuente: a.fuente,
        resolucion,
        hechos: recolectados,
        // Un apartado degradado conserva la explicación del catálogo si la
        // tiene, y si no, dice lo que de verdad pasó. Callarlo dejaría un
        // hueco sin motivo, que es el hueco mudo que la tabla prohíbe sembrar.
        porQueNo:
          degradado && a.porQueNo === undefined
            ? 'VIZO debería poder acreditar este apartado y no encontró evidencia en el sistema. ' +
              'Revisa que la cuenta esté configurada y que haya operación registrada antes de ' +
              'entregar este documento.'
            : a.porQueNo,
        preguntas: a.preguntas,
        degradado,
      }
    })

  return {
    secciones,
    acreditados: secciones.filter((s) => s.resolucion === 'acreditado').length,
    parciales: secciones.filter((s) => s.resolucion === 'parcial').length,
    huecos: secciones.filter((s) => s.resolucion === 'hueco').length,
    degradados: secciones.filter((s) => s.degradado).map((s) => s.fraccion),
  }
}
