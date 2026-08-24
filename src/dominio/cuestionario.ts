import type { FechaISO } from './fechas'

/**
 * El cuestionario de identificación del Art. 23 Ter 3.
 *
 * Este módulo NO decide si el cuestionario es «bueno»: decide si el artículo
 * lo EXIGE y si lo que hay lo satisface. La diferencia importa porque el
 * contenido de las preguntas lo pone el Manual de Políticas Internas del
 * obligado —el ¶2 lo dice con esas palabras—, y VIZO no propone preguntas.
 *
 * Lo que sí es del artículo, y por tanto vive aquí:
 *   · el disparador — Grado de Riesgo alto, y solo eso
 *   · los cinco temas del piso — actividad preponderante (¶1), origen y
 *     destino de los recursos, y los actos que realiza o pretende (¶2)
 *   · la Firma Electrónica cuando la vía es remota (¶3)
 */

export type ModalidadCuestionario = 'presencial' | 'remoto_digital'

/**
 * Lo que se sabe del Grado de Riesgo, con la misma forma de tres valores que
 * usa el Art. 23 Ter 5. No es casualidad: los dos artículos se disparan con
 * el mismo hecho, y «no se sabe» tampoco puede colapsar a «no se exige».
 */
export type SituacionDelGrado =
  | { readonly conocida: false }
  | { readonly conocida: true; readonly esAlto: boolean; readonly vencida: boolean }

export type ExigenciaDeCuestionario =
  | { readonly estado: 'exigible'; readonly conGradoVencido: boolean }
  | { readonly estado: 'no_exigible'; readonly porque: 'no_es_grado_alto' }
  | { readonly estado: 'indeterminable'; readonly falta: 'grado_de_riesgo' }

/**
 * ¿El Art. 23 Ter 3 pide cuestionario para este cliente?
 *
 * Una sola condición —«Cuando el Grado de Riesgo del Cliente o Usuaria sea
 * alto»— pero con tres respuestas posibles, no dos. Sin clasificación no es
 * «no se exige»: es que no se puede saber, y esa celda tiene que llegar a la
 * pantalla como hueco.
 *
 * Un grado alto VENCIDO sigue exigiendo. La caducidad del Art. 23 Bis 1 marca
 * cuándo hay que reevaluar, no borra la clasificación que consta: leerla como
 * «ya no es alto» convertiría un plazo incumplido en una obligación menos.
 */
export function exigenciaDeCuestionario(grado: SituacionDelGrado): ExigenciaDeCuestionario {
  if (!grado.conocida) return { estado: 'indeterminable', falta: 'grado_de_riesgo' }
  if (!grado.esAlto) return { estado: 'no_exigible', porque: 'no_es_grado_alto' }
  return { estado: 'exigible', conGradoVencido: grado.vencida }
}

/** Las respuestas que el artículo nombra. El Manual añade, no sustituye. */
export interface RespuestasDelPiso {
  /** ¶1: «mayor información sobre la actividad preponderante». */
  readonly actividadPreponderante: string
  /** ¶2: «el origen y destino de los recursos». */
  readonly origenRecursos: string
  readonly destinoRecursos: string
  /** ¶2: «los actos u operaciones que realicen…». */
  readonly actosQueRealiza: string
  /** ¶2: «…o que pretendan llevar a cabo». Lo único que mira hacia adelante. */
  readonly actosQuePretende: string
}

export interface EvidenciaDeFirma {
  readonly hashSha256: string
  readonly archivo: string
  readonly tamanoBytes: number
  readonly mime: string
}

export interface CuestionarioACapturar extends RespuestasDelPiso {
  readonly modalidad: ModalidadCuestionario
  readonly fechaAplicacion: FechaISO
  readonly suscritoPor: string
  readonly firma?: EvidenciaDeFirma | undefined
  readonly respuestasDelManual?: Readonly<Record<string, string>> | undefined
}

const ETIQUETA_DEL_PISO: ReadonlyArray<readonly [keyof RespuestasDelPiso, string]> = [
  ['actividadPreponderante', 'la actividad preponderante del cliente (¶1)'],
  ['origenRecursos', 'el origen de los recursos (¶2)'],
  ['destinoRecursos', 'el destino de los recursos (¶2)'],
  ['actosQueRealiza', 'los actos u operaciones que realiza (¶2)'],
  ['actosQuePretende', 'los actos u operaciones que pretende llevar a cabo (¶2)'],
]

/**
 * Qué le falta a un cuestionario para poder asentarse.
 *
 * Devuelve la lista completa, no el primer problema: quien captura merece ver
 * todo lo que falta de una vez y no descubrirlo de uno en uno. La base rechaza
 * lo mismo con CHECKs —esto no la sustituye—, pero un CHECK dice «check_
 * violation» y esto dice qué campo y de qué párrafo sale.
 */
export function problemasDelCuestionario(c: CuestionarioACapturar): string[] {
  const problemas: string[] = []

  for (const [campo, comoSeLlama] of ETIQUETA_DEL_PISO) {
    if (c[campo].trim() === '') {
      problemas.push(`Falta ${comoSeLlama}. El Art. 23 Ter 3 lo nombra expresamente.`)
    }
  }

  if (c.suscritoPor.trim() === '') {
    problemas.push(
      'Falta quién suscribe el cuestionario. Un cuestionario que nadie firmó no acredita nada.',
    )
  }

  // ¶3: «podrá realizarse vía remota, por medios digitales o electrónicos, LOS
  // CUALES en todo caso deberán contener la Firma Electrónica». La exigencia
  // se ata a la vía remota, no al cuestionario: el presencial lleva firma
  // autógrafa y el artículo no le pide otra cosa.
  if (c.modalidad === 'remoto_digital' && c.firma === undefined) {
    problemas.push(
      'Un cuestionario aplicado por vía remota debe contener la Firma Electrónica de quien lo ' +
        'suscribe (Art. 23 Ter 3 ¶3). Sube el archivo firmado.',
    )
  }

  if (c.firma !== undefined && !/^[0-9a-f]{64}$/.test(c.firma.hashSha256)) {
    problemas.push('La huella del archivo firmado no es un SHA-256.')
  }

  return problemas
}

export interface CuestionarioAsentado extends RespuestasDelPiso {
  readonly id: string
  readonly modalidad: ModalidadCuestionario
  readonly fechaAplicacion: FechaISO
  readonly suscritoPor: string
  readonly firma: EvidenciaDeFirma | null
  readonly respuestasDelManual: Readonly<Record<string, string>>
  /** La clasificación que lo motivó. */
  readonly evaluacionRiesgoId: string
  readonly aplicadoPor: string
  readonly registradoEn: string
}

export type CoberturaDelCuestionario =
  | { readonly estado: 'sin_cuestionario' }
  /** El último cuestionario responde a la clasificación vigente. */
  | { readonly estado: 'cubierto'; readonly cuestionario: CuestionarioAsentado }
  /**
   * Hay cuestionario, pero responde a una clasificación anterior.
   *
   * NO se llama «vencido» a propósito. El Art. 23 Ter 3 no da plazo de
   * vigencia ni dice que una reclasificación obligue a repetirlo; lo que dice
   * es a quién se le aplica. Así que el sistema enseña el hecho —se aplicó
   * sobre otra clasificación— y deja el juicio a quien lo tiene que hacer.
   * Inventar aquí una caducidad sería escribir una regla que nadie promulgó.
   */
  | {
      readonly estado: 'sobre_otra_clasificacion'
      readonly cuestionario: CuestionarioAsentado
      readonly evaluacionVigenteId: string
    }

export function coberturaDelCuestionario(entrada: {
  readonly ultimo: CuestionarioAsentado | null
  readonly evaluacionVigenteId: string | null
}): CoberturaDelCuestionario {
  const { ultimo, evaluacionVigenteId } = entrada
  if (ultimo === null) return { estado: 'sin_cuestionario' }
  if (evaluacionVigenteId === null || ultimo.evaluacionRiesgoId === evaluacionVigenteId) {
    return { estado: 'cubierto', cuestionario: ultimo }
  }
  return { estado: 'sobre_otra_clasificacion', cuestionario: ultimo, evaluacionVigenteId }
}
