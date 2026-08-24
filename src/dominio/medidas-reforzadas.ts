import type { FechaISO } from './fechas'

/**
 * Las medidas reforzadas del Art. 23 Ter 4.
 *
 * El artículo tiene tres fracciones y NO son tres opciones: la I y la II son
 * excluyentes —una por clase de persona— y la III se apila encima de la que
 * toque. Este módulo decide cuál corresponde y qué le falta; lo que sean
 * «medidas reforzadas» en concreto lo decide el obligado, porque el artículo
 * no lo define.
 */

export type FraccionReforzada = 'fisica' | 'moral'

/**
 * Qué fracción le toca al cliente. `null` = el artículo no lo nombra.
 *
 * El Art. 23 Ter 4 habla de personas físicas (fr. I) y morales (fr. II), y el
 * sistema conoce además fideicomisos y otras figuras jurídicas. No se les
 * asigna fracción por parecido: devolver `null` y enseñarlo como hueco es la
 * única respuesta honesta hasta que el especialista diga otra cosa
 * (POR CONFIRMAR-11).
 */
export function fraccionQueCorresponde(tipoPersona: string): FraccionReforzada | null {
  if (tipoPersona === 'fisica') return 'fisica'
  if (tipoPersona === 'moral') return 'moral'
  return null
}

export type SituacionDelGrado =
  | { readonly conocida: false }
  | { readonly conocida: true; readonly esAlto: boolean; readonly vencida: boolean }

export type ExigenciaDeMedidas =
  | { readonly estado: 'exigible'; readonly fraccion: FraccionReforzada; readonly conGradoVencido: boolean }
  | { readonly estado: 'no_exigible'; readonly porque: 'no_es_grado_alto' }
  | { readonly estado: 'indeterminable'; readonly falta: 'grado_de_riesgo' }
  /** Grado alto, pero el artículo no nombra esta clase de persona. */
  | { readonly estado: 'sin_fraccion'; readonly tipoPersona: string }

export function exigenciaDeMedidas(entrada: {
  readonly grado: SituacionDelGrado
  readonly tipoPersona: string
}): ExigenciaDeMedidas {
  const { grado, tipoPersona } = entrada
  if (!grado.conocida) return { estado: 'indeterminable', falta: 'grado_de_riesgo' }
  if (!grado.esAlto) return { estado: 'no_exigible', porque: 'no_es_grado_alto' }

  const fraccion = fraccionQueCorresponde(tipoPersona)
  if (fraccion === null) return { estado: 'sin_fraccion', tipoPersona }
  return { estado: 'exigible', fraccion, conGradoVencido: grado.vencida }
}

export type VinculoReforzado =
  | 'conyuge'
  | 'concubina_concubinario'
  | 'dependiente_economico'
  | 'sociedad_vinculada'
  | 'asociacion_vinculada'

export interface PersonaVinculada {
  readonly vinculo: VinculoReforzado
  readonly nombre: string
  /** Fr. I b): «los DATOS señalados en el Capítulo III». */
  readonly datosObtenidos: boolean
  /** Fr. III: «la DOCUMENTACIÓN señalada en el Capítulo III». */
  readonly documentacionObtenida: boolean
  readonly detalle?: string | undefined
}

export interface EvidenciaDeConsulta {
  readonly hashSha256: string
  readonly archivo: string
  readonly tamanoBytes: number
  readonly mime: string
}

export interface MedidasACapturar {
  readonly fechaAdopcion: FechaISO
  /** Fr. I a). Solo para físicas. */
  readonly medidasOrigenDestino?: string | undefined
  /** Fr. I b): si el Manual lo prevé para este caso. Solo para físicas. */
  readonly manualPreveVinculadas?: boolean | undefined
  readonly personasVinculadas?: readonly PersonaVinculada[] | undefined
  /** Fr. II. Solo para morales. */
  readonly informacionAccionistas?: string | undefined
  readonly consultaSeFecha?: FechaISO | undefined
  readonly consultaSeResultado?: string | undefined
  readonly consultaSeEvidencia?: EvidenciaDeConsulta | undefined
  /** Fr. III. */
  readonly documentacionPepExtranjera?: string | undefined
}

/**
 * Qué le falta a un registro de medidas para poder asentarse.
 *
 * Devuelve la lista completa y no el primer problema, por la misma razón que
 * en el cuestionario: quien captura merece verlo todo de una vez.
 */
export function problemasDeLasMedidas(entrada: {
  readonly fraccion: FraccionReforzada
  readonly aplicaPepExtranjera: boolean
  readonly datos: MedidasACapturar
}): string[] {
  const { fraccion, aplicaPepExtranjera, datos } = entrada
  const problemas: string[] = []
  const vacio = (s: string | undefined): boolean => s === undefined || s.trim() === ''

  if (fraccion === 'fisica') {
    if (vacio(datos.medidasOrigenDestino)) {
      problemas.push(
        'Falta decir qué medidas reforzadas se adoptaron para conocer el origen y destino de ' +
          'los recursos (Art. 23 Ter 4 fr. I inciso a).',
      )
    }
    // El inciso b) es «en su caso» y «en los términos del Manual»: no se exige
    // que haya personas, se exige que alguien haya DECIDIDO si las hay. La
    // ausencia sin decisión es un olvido disfrazado de cumplimiento.
    if (datos.manualPreveVinculadas === undefined) {
      problemas.push(
        'Falta decir si el Manual de Políticas Internas prevé recabar datos del cónyuge, ' +
          'dependientes económicos o sociedades vinculadas para este caso (fr. I inciso b).',
      )
    }
    if (datos.manualPreveVinculadas === true && (datos.personasVinculadas ?? []).length === 0) {
      problemas.push(
        'El Manual lo prevé para este caso, pero no se registró ninguna persona vinculada.',
      )
    }
  }

  if (fraccion === 'moral') {
    if (vacio(datos.informacionAccionistas)) {
      problemas.push(
        'Falta la mayor información de los principales accionistas o socios (fr. II).',
      )
    }
    // «DEBIENDO consultar» no admite lectura opcional.
    if (datos.consultaSeFecha === undefined || datos.consultaSeFecha === '') {
      problemas.push(
        'Falta la fecha de la consulta a los registros electrónicos de la Secretaría de ' +
          'Economía. La fr. II la exige para confirmar los datos del cliente.',
      )
    }
    if (vacio(datos.consultaSeResultado)) {
      problemas.push('Falta qué arrojó la consulta a la Secretaría de Economía.')
    }
  }

  if (aplicaPepExtranjera) {
    if (vacio(datos.documentacionPepExtranjera)) {
      problemas.push(
        'El cliente es Persona Políticamente Expuesta extranjera: la fr. III pide, además, la ' +
          'documentación del Capítulo III de las personas del inciso b).',
      )
    }
    const sinDocumentacion = (datos.personasVinculadas ?? []).filter(
      (p) => !p.documentacionObtenida,
    )
    if (sinDocumentacion.length > 0) {
      problemas.push(
        `La fr. III pide la DOCUMENTACIÓN —no solo los datos— de cada persona del inciso b). ` +
          `Falta la de: ${sinDocumentacion.map((p) => p.nombre).join(', ')}.`,
      )
    }
  }

  if (datos.consultaSeEvidencia !== undefined
      && !/^[0-9a-f]{64}$/.test(datos.consultaSeEvidencia.hashSha256)) {
    problemas.push('La huella del acuse de la consulta no es un SHA-256.')
  }

  return problemas
}

export interface MedidasAsentadas {
  readonly id: string
  readonly fraccion: FraccionReforzada
  readonly fechaAdopcion: FechaISO
  readonly medidasOrigenDestino: string | null
  readonly manualPreveVinculadas: boolean | null
  readonly informacionAccionistas: string | null
  readonly consultaSeFecha: string | null
  readonly consultaSeResultado: string | null
  readonly consultaSeEvidencia: EvidenciaDeConsulta | null
  readonly aplicaPepExtranjera: boolean
  readonly documentacionPepExtranjera: string | null
  readonly personasVinculadas: readonly (PersonaVinculada & { readonly id: string })[]
  readonly evaluacionRiesgoId: string
  readonly adoptadasPor: string
  readonly registradoEn: string
}

export type CoberturaDeMedidas =
  | { readonly estado: 'sin_medidas' }
  | { readonly estado: 'cubierto'; readonly medidas: MedidasAsentadas }
  /**
   * Igual que en el cuestionario: el artículo no da plazo de vigencia, así que
   * cuando el cliente se reclasifica el sistema dice el hecho y no «vencido».
   */
  | {
      readonly estado: 'sobre_otra_clasificacion'
      readonly medidas: MedidasAsentadas
      readonly evaluacionVigenteId: string
    }

export function coberturaDeMedidas(entrada: {
  readonly ultimas: MedidasAsentadas | null
  readonly evaluacionVigenteId: string | null
}): CoberturaDeMedidas {
  const { ultimas, evaluacionVigenteId } = entrada
  if (ultimas === null) return { estado: 'sin_medidas' }
  if (evaluacionVigenteId === null || ultimas.evaluacionRiesgoId === evaluacionVigenteId) {
    return { estado: 'cubierto', medidas: ultimas }
  }
  return { estado: 'sobre_otra_clasificacion', medidas: ultimas, evaluacionVigenteId }
}
