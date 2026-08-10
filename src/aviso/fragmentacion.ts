import { construirInformeXml, type AvisoDelInforme, type Informe } from './informe'

/**
 * Fragmentación por el límite de 2 MB del SPPLD.
 *
 * El portal rechaza archivos más grandes. Un obligado con cientos de avisos en
 * un mes lo rebasa, y el rechazo no llega con un mensaje útil: llega como un
 * archivo que no se pudo presentar el día 17.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ 2_000_000 Y NO 2 × 1024 × 1024
 * ────────────────────────────────────────────────────────────────────────────
 * El SAT dice "2 MB" sin decir cuál de los dos. Entre 2,000,000 y 2,097,152 hay
 * 97 KB de diferencia, y equivocarse hacia arriba significa un archivo
 * rechazado. Se toma el MENOR: ser más estricto que la autoridad nunca produce
 * un aviso rechazado, y es el mismo criterio con el que se eligió validar con
 * libxml2 en vez de con algo más laxo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DÓNDE SE CORTA
 * ────────────────────────────────────────────────────────────────────────────
 * Entre avisos, nunca dentro de uno. Cada fragmento es un `archivo` COMPLETO y
 * válido por sí mismo —mismo `mes_reportado`, mismo `sujeto_obligado`, un
 * subconjunto de los avisos—, porque eso es lo que el portal recibe: archivos
 * independientes, no partes de uno.
 */

/** El menor de las dos lecturas de "2 MB". Ver arriba. */
export const LIMITE_BYTES = 2_000_000

export class AvisoDemasiadoGrande extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'AvisoDemasiadoGrande'
  }
}

export interface Fragmento {
  /** 1-based: el lote 1 de N. */
  lote: number
  totalLotes: number
  xml: string
  bytes: number
  avisos: number
}

const pesar = (xml: string): number => Buffer.byteLength(xml, 'utf8')

/**
 * Parte el informe en tantos archivos como haga falta.
 *
 * Un informe que cabe entero devuelve UN fragmento — no un caso especial: el
 * flujo de un solo archivo y el de veinte son el mismo código, así que el
 * camino que casi siempre corre es el mismo que se prueba con muchos.
 */
export function fragmentarInforme(informe: Informe): Fragmento[] {
  // Lo que pesa el informe sin un solo aviso: la declaración, la raíz, el mes
  // y el sujeto obligado. Es el costo fijo que paga CADA fragmento.
  const sobre = pesar(construirInformeXml({ ...informe, avisos: [] }))

  // Cuánto añade cada aviso. Se mide una vez por aviso y no una vez por
  // combinación: el serializador concatena y la sangría de un aviso no depende
  // de sus hermanos, así que su tamaño dentro del informe es constante. Hay un
  // test que compara esta cuenta contra el XML realmente serializado.
  const pesos = informe.avisos.map(
    (a) => pesar(construirInformeXml({ ...informe, avisos: [a] })) - sobre,
  )

  const grupos: AvisoDelInforme[][] = []
  let actual: AvisoDelInforme[] = []
  let acumulado = sobre

  informe.avisos.forEach((aviso, i) => {
    const peso = pesos[i] as number

    if (sobre + peso > LIMITE_BYTES) {
      // Un solo aviso que no cabe no se puede partir: sus operaciones son de
      // un mismo acto. Reventar aquí es la única salida honesta — emitirlo
      // igual produce un archivo que el portal rechaza.
      throw new AvisoDemasiadoGrande(
        `El aviso ${aviso.referencia} pesa ${String(peso)} bytes y con el encabezado supera ` +
          `el límite de ${String(LIMITE_BYTES)} del SPPLD. No se puede fragmentar más: un ` +
          'aviso es indivisible. Revisa cuántas operaciones lleva.',
      )
    }

    if (acumulado + peso > LIMITE_BYTES && actual.length > 0) {
      grupos.push(actual)
      actual = []
      acumulado = sobre
    }
    actual.push(aviso)
    acumulado += peso
  })

  // El informe en cero entra aquí con `actual` vacío: sigue siendo un archivo
  // que hay que presentar, así que se emite igual.
  grupos.push(actual)

  return grupos.map((avisos, i) => {
    const xml = construirInformeXml({ ...informe, avisos })
    return {
      lote: i + 1,
      totalLotes: grupos.length,
      xml,
      bytes: pesar(xml),
      avisos: avisos.length,
    }
  })
}
