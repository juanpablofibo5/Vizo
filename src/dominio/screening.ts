/**
 * El dominio del screening: la normalización y lo que la regla dura 5 vuelve
 * inexpresable en tipos.
 *
 * El matching vive en SQL (trigramas con índice); aquí vive lo que tiene que
 * ser idéntico en los dos lados y lo que la persistencia valida antes de
 * escribir. VIZO **nunca** descarta una coincidencia: ese verbo ni existe en
 * este módulo — existe `resolverScreening`, que registra la decisión de un
 * humano con su razonamiento.
 */

/**
 * El espejo de `app.normalizar_para_screening` de la base. SI CAMBIA UNO, CAMBIA EL
 * OTRO — la prueba de paridad de `screening.test.ts` los compara contra los
 * mismos casos, porque dos normalizaciones distintas hacen mentir al matching.
 */
export function normalizarNombre(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
}

/** Las cuatro listas que la consulta EXIGE vigentes (decisión Q3 / ADR-30). */
export const LISTAS_EXIGIDAS = ['ofac_sdn', 'onu', 'sat_69b', 'lpb'] as const
export type ClaveDeLista = (typeof LISTAS_EXIGIDAS)[number]

export interface ListaVigente {
  readonly id: string
  readonly clave: string
  readonly descargadaEn: string
  readonly hash: string
  readonly registros: number
}

export interface CoincidenciaScreening {
  readonly lista: string
  readonly entradaId: string
  readonly nombreEnLista: string
  readonly criterio: 'rfc' | 'nombre'
  readonly similitud: number
  readonly datos: Record<string, string>
}

export class ListasIncompletas extends Error {
  constructor(faltantes: readonly string[]) {
    super(
      `No hay versión vigente de: ${faltantes.join(', ')}. Consultar contra menos listas y ` +
        'decir «sin coincidencias» produciría el silencio más caro del producto (regla dura 6). ' +
        'Se cargan con el runbook 06 y se vuelve a consultar.',
    )
    this.name = 'ListasIncompletas'
  }
}

export class DatoDeScreeningInvalido extends Error {
  constructor(problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeScreeningInvalido'
  }
}
