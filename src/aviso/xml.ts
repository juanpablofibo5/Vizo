/**
 * Serialización XML para el aviso del SPPLD.
 *
 * Es un serializador propio y diminuto, no una librería, por una razón: el XSD
 * usa `xsd:sequence` en todos sus complexTypes, así que **el orden de los
 * elementos es parte de la especificación**. Un serializador que ordene por
 * clave, o que dependa del orden de inserción de un objeto de JavaScript,
 * produce un XML que no valida — y el fallo aparece como "This element is not
 * expected", que no dice que el problema sea el orden.
 *
 * Aquí el orden es una lista, que es un dato explícito y revisable contra el
 * esquema.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS MONTOS VAN COMO TEXTO
 * ────────────────────────────────────────────────────────────────────────────
 * Igual que en el manifiesto: un `numeric` de Postgres que pasa por el `number`
 * de JavaScript puede volver distinto, y aquí lo que vuelve distinto es la
 * cifra que se le reporta a la autoridad. El serializador NO acepta números —
 * si llega uno, revienta.
 */

export class XmlInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'XmlInvalido'
  }
}

/** Un elemento con texto, o un elemento con hijos. Nunca las dos cosas. */
export type Nodo =
  | { elemento: string; texto: string }
  | { elemento: string; hijos: Nodo[] }

export interface Atributos {
  [nombre: string]: string
}

/**
 * Escapa lo que XML no admite crudo dentro de un texto.
 *
 * `&` va primero: si fuera después, escaparía los `&` que acaba de introducir
 * y produciría `&amp;lt;`. Es el error clásico de esta función.
 */
export function escaparTexto(valor: string): string {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escaparAtributo(valor: string): string {
  return escaparTexto(valor).replaceAll('"', '&quot;')
}

function serializarNodo(nodo: Nodo, sangria: string): string {
  if ('texto' in nodo) {
    if (typeof nodo.texto !== 'string') {
      throw new XmlInvalido(
        `El elemento <${nodo.elemento}> recibió algo que no es texto. Los montos y las ` +
          'fechas viajan como cadena tal como los devuelve Postgres: un numeric que pasa ' +
          'por el number de JavaScript puede volver con otro valor, y aquí eso es la cifra ' +
          'que se le reporta a la autoridad.',
      )
    }
    return `${sangria}<${nodo.elemento}>${escaparTexto(nodo.texto)}</${nodo.elemento}>`
  }

  // Un elemento sin hijos se omite en el llamador, no aquí: decidir eso aquí
  // escondería un `minOccurs` mal entendido detrás de un XML que valida.
  const dentro = nodo.hijos.map((h) => serializarNodo(h, `${sangria}  `)).join('\n')
  return `${sangria}<${nodo.elemento}>\n${dentro}\n${sangria}</${nodo.elemento}>`
}

/** Documento completo, con su declaración y los atributos de la raíz. */
export function serializarDocumento(raiz: Nodo, atributos: Atributos = {}): string {
  const attrs = Object.entries(atributos)
    .map(([k, v]) => ` ${k}="${escaparAtributo(v)}"`)
    .join('')

  const cuerpo = serializarNodo(raiz, '')
  // Los atributos van en la raíz, que serializarNodo no conoce: se insertan
  // sobre la etiqueta de apertura ya generada.
  const conAttrs = cuerpo.replace(`<${raiz.elemento}>`, `<${raiz.elemento}${attrs}>`)

  return `<?xml version="1.0" encoding="UTF-8"?>\n${conAttrs}\n`
}

/** Azúcar para armar árboles sin repetir la forma del objeto. */
export const texto = (elemento: string, valor: string): Nodo => ({ elemento, texto: valor })
export const rama = (elemento: string, hijos: Nodo[]): Nodo => ({ elemento, hijos })

/**
 * Omite el elemento cuando el valor no está.
 *
 * Existe para los `minOccurs="0"` del esquema y para nada más. Un elemento
 * OBLIGATORIO al que le falta el dato no se omite: eso produciría un XML que no
 * valida, o peor, uno que valida y reporta de menos. Ese caso revienta antes,
 * en quien arma el árbol (regla dura 6).
 */
export const opcional = (elemento: string, valor: string | null | undefined): Nodo[] =>
  valor === null || valor === undefined || valor === '' ? [] : [texto(elemento, valor)]
