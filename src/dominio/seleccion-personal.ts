import type { FechaISO } from './fechas'

/**
 * La selección de personal del Art. 39 Bis 2.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE Y QUÉ NO
 * ────────────────────────────────────────────────────────────────────────────
 * De las tres cosas que pide el artículo, VIZO solo puede acreditar una: que
 * exista la **declaración firmada** del ¶2, con fecha y con lo que el texto
 * manda que conste. Los *procedimientos* de selección del ¶1 —que garanticen
 * calidad técnica, experiencia y honorabilidad— y las *medidas* del ¶3 para
 * cuando alguien deje de tenerlas son del obligado y viven en su Manual.
 *
 * Este módulo contesta una sola pregunta, y la contesta con tres valores:
 * **¿a esta persona le falta su declaración?** Sí, no, o no se puede saber.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY UN TERCER VALOR
 * ────────────────────────────────────────────────────────────────────────────
 * El Transitorio Sexto acota el artículo a «las nuevas contrataciones
 * realizadas a partir del primero de marzo de dos mil veintisiete». Saber si a
 * alguien le aplica exige saber cuándo se le contrató — y de la gente que ya
 * trabajaba ahí, el obligado puede no tener esa fecha.
 *
 * Sin fecha, la respuesta NO es «no aplica». Es que no se sabe. Tratarla como
 * «no aplica» dejaría fuera del conteo justo a quien podría estar dentro, y
 * sería el silencio que persigue la regla dura 6: un número plausible sobre
 * datos que no alcanzan.
 */

/** Las tres negativas de la fr. II, por separado: el ¶3 pide medidas según cuál falle. */
export interface ManifestacionesFraccionII {
  readonly sinSentenciaPatrimonial: boolean
  readonly sinInhabilitacionComercio: boolean
  readonly sinInhabilitacionServicioOFinanciero: boolean
}

export interface DeclaracionDePersonal {
  readonly id: string
  readonly personaId: string
  readonly fechaDeclaracion: FechaISO
  readonly laboroEnSectorObligado: boolean
  readonly sectoresPrevios: string | null
  readonly manifestaciones: ManifestacionesFraccionII
  readonly tieneFirmaConHuella: boolean
}

export interface PersonaContratable {
  readonly id: string
  readonly nombre: string
  readonly fechaContratacion: FechaISO | null
  readonly bajaDelArea: FechaISO | null
}

export type EstadoDeSeleccion =
  /** Contratada antes de la fecha del Transitorio Sexto. */
  | { readonly estado: 'no_aplica' }
  /** Le aplica y tiene declaración con las tres manifestaciones del texto. */
  | { readonly estado: 'cubierta'; readonly declaracion: DeclaracionDePersonal }
  /** Le aplica y no hay declaración. */
  | { readonly estado: 'sin_declaracion' }
  /**
   * Hay declaración, pero alguna manifestación de la fr. II vino en falso.
   * No es un error de captura: es un hecho que el obligado tiene que atender
   * con las medidas de su Manual (¶3).
   */
  | {
      readonly estado: 'declaracion_con_impedimento'
      readonly declaracion: DeclaracionDePersonal
      readonly impedimentos: readonly string[]
    }
  /** Sin fecha de contratación no se puede saber si le aplica. */
  | { readonly estado: 'indeterminable' }

export const NOMBRE_DEL_IMPEDIMENTO: Record<keyof ManifestacionesFraccionII, string> = {
  sinSentenciaPatrimonial: 'declara haber sido sentenciada por delitos patrimoniales',
  sinInhabilitacionComercio: 'declara estar inhabilitada para ejercer el comercio',
  sinInhabilitacionServicioOFinanciero:
    'declara estar inhabilitada para el servicio público o el sistema financiero',
}

function impedimentosDe(d: DeclaracionDePersonal): string[] {
  return (Object.keys(NOMBRE_DEL_IMPEDIMENTO) as (keyof ManifestacionesFraccionII)[])
    .filter((k) => !d.manifestaciones[k])
    .map((k) => NOMBRE_DEL_IMPEDIMENTO[k])
}

/**
 * El estado de una persona frente al Art. 39 Bis 2.
 *
 * `exigibleDesde` llega del catálogo (`seleccion_personal_alcance`), nunca
 * escrito aquí: la fecha es del Transitorio Sexto y la regla dura 1 vale
 * también para este artículo.
 */
export function estadoDeSeleccion(entrada: {
  readonly persona: PersonaContratable
  readonly declaraciones: readonly DeclaracionDePersonal[]
  readonly exigibleDesde: FechaISO
}): EstadoDeSeleccion {
  const { persona, exigibleDesde } = entrada

  if (persona.fechaContratacion === null) return { estado: 'indeterminable' }
  if (persona.fechaContratacion < exigibleDesde) return { estado: 'no_aplica' }

  // La última por fecha: una declaración nueva es cómo se corrige una vieja,
  // porque lo firmado no se edita.
  const suyas = entrada.declaraciones
    .filter((d) => d.personaId === persona.id)
    .toSorted((a, b) => a.fechaDeclaracion.localeCompare(b.fechaDeclaracion))
  const ultima = suyas.at(-1)
  if (ultima === undefined) return { estado: 'sin_declaracion' }

  const impedimentos = impedimentosDe(ultima)
  return impedimentos.length === 0
    ? { estado: 'cubierta', declaracion: ultima }
    : { estado: 'declaracion_con_impedimento', declaracion: ultima, impedimentos }
}

export interface CoberturaDeSeleccion {
  readonly alcanzadas: number
  readonly cubiertas: number
  readonly faltantes: readonly { readonly personaId: string; readonly nombre: string }[]
  readonly conImpedimento: readonly {
    readonly personaId: string
    readonly nombre: string
    readonly impedimentos: readonly string[]
  }[]
  /** Sin fecha de contratación: no se sabe si les aplica. */
  readonly indeterminadas: readonly { readonly personaId: string; readonly nombre: string }[]
  readonly acreditado: boolean
}

/**
 * La cobertura del obligado.
 *
 * `acreditado` exige que NO queden indeterminadas. Con una sola persona sin
 * fecha de contratación, decir «cubierto» sería afirmar algo sobre gente de la
 * que no se sabe si entra — y esa es la afirmación cómoda que este proyecto no
 * hace.
 */
export function coberturaDeSeleccion(entrada: {
  readonly personas: readonly PersonaContratable[]
  readonly declaraciones: readonly DeclaracionDePersonal[]
  readonly exigibleDesde: FechaISO
}): CoberturaDeSeleccion {
  const faltantes: { personaId: string; nombre: string }[] = []
  const conImpedimento: { personaId: string; nombre: string; impedimentos: readonly string[] }[] = []
  const indeterminadas: { personaId: string; nombre: string }[] = []
  let alcanzadas = 0
  let cubiertas = 0

  for (const persona of entrada.personas) {
    const e = estadoDeSeleccion({
      persona,
      declaraciones: entrada.declaraciones,
      exigibleDesde: entrada.exigibleDesde,
    })
    switch (e.estado) {
      case 'no_aplica':
        break
      case 'indeterminable':
        indeterminadas.push({ personaId: persona.id, nombre: persona.nombre })
        break
      case 'cubierta':
        alcanzadas += 1
        cubiertas += 1
        break
      case 'sin_declaracion':
        alcanzadas += 1
        faltantes.push({ personaId: persona.id, nombre: persona.nombre })
        break
      case 'declaracion_con_impedimento':
        alcanzadas += 1
        conImpedimento.push({
          personaId: persona.id,
          nombre: persona.nombre,
          impedimentos: e.impedimentos,
        })
        break
    }
  }

  return {
    alcanzadas,
    cubiertas,
    faltantes,
    conImpedimento,
    indeterminadas,
    acreditado:
      faltantes.length === 0 && conImpedimento.length === 0 && indeterminadas.length === 0,
  }
}
