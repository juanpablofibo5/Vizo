/**
 * La vigencia del carácter de PEP (Art. 23 Quáter del Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 * Dada una función pública declarada (cargo, ámbito, si sigue en funciones y
 * desde cuándo no), responde si esa persona está catalogada como PEP en una
 * fecha dada — y hasta cuándo. De aquí cuelga el seguimiento reforzado del
 * Manual (Fr. IV) y, desde el 1-mar-2027, el grado de riesgo (Art. 23 Bis 4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS DOS RELOJES, Y POR QUÉ NINGUNO ES «12 MESES»
 * ────────────────────────────────────────────────────────────────────────────
 * ¶4 — «durante el año siguiente A AQUEL en que hubiesen dejado su cargo»:
 *      la PEP nacional cesada sigue catalogada hasta el 31 de diciembre del
 *      año siguiente al del cese. Un cese del 15-ene-2026 cataloga hasta el
 *      31-dic-2027 — casi dos años, no 365 días.
 *
 * ¶5 — el segundo reloj, anclado al ACTO: si el cese ocurrió «dentro del año
 *      inmediato anterior a la fecha» del acto u operación (esta condición SÍ
 *      es de 12 meses: está anclada a una fecha), la persona queda catalogada
 *      «durante el año siguiente a aquel en que se haya realizado el acto» —
 *      otra vez año calendario. Operar con una PEP recién cesada REINICIA el
 *      reloj desde el acto.
 *
 * La vigencia efectiva es la MÁS LARGA de las dos. Los dos límites son
 * inclusivos: ante la duda se cataloga — un falso positivo cuesta una revisión
 * más estricta, un falso negativo es un seguimiento omitido.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA EXTRANJERA NO TIENE RELOJ
 * ────────────────────────────────────────────────────────────────────────────
 * Los ¶4 y ¶5 hablan solo de PEP «nacionales». Para la extranjera rige el ¶1 a
 * secas —«desempeña o HA DESEMPEÑADO»— que no le pone fin. Mientras el texto
 * no diga otra cosa, la extranjera cesada sigue catalogada; es la lectura
 * literal y la conservadora, y desde el 1-mar-2027 además es riesgo alto por
 * defecto (Art. 23 Bis 4).
 *
 * Las reglas llegan del catálogo (`parametros_motor`, claves
 * `pep_vigencia_tras_cese` y `pep_vigencia_tras_acto`) con su fuente citada.
 * Este módulo las APLICA; no las trae escritas — regla dura 1.
 */
import { partes, restarMeses, type FechaISO } from './fechas'

/** Las reglas que el catálogo puede expresar hoy. */
export type ReglaVigenciaPep = 'ano_calendario_siguiente'

export class ReglaPepDesconocida extends Error {
  constructor(clave: string, regla: string) {
    super(
      `El catálogo pide resolver "${clave}" con la regla "${regla}", que este módulo no sabe ` +
        'aplicar. Se detiene en vez de aproximar con la que había: una regla nueva se ' +
        'implementa y se prueba, no se adivina.',
    )
    this.name = 'ReglaPepDesconocida'
  }
}

export class FuncionPublicaIncoherente extends Error {
  constructor(detalle: string) {
    super(
      `La función pública declarada no cuadra: ${detalle}. La base impide guardar esto ` +
        '(constraint cese_coherente); si llegó aquí, el dato no viene de la base y no se ' +
        'puede derivar una vigencia de él.',
    )
    this.name = 'FuncionPublicaIncoherente'
  }
}

export interface FuncionPublica {
  ambito: 'nacional' | 'extranjero'
  enFunciones: boolean
  /** Obligatoria cuando ya no está en funciones; prohibida cuando sí. */
  fechaCese: FechaISO | null
}

export type CatalogacionPep =
  | { catalogada: true; motivo: 'en_funciones'; hasta: null }
  | { catalogada: true; motivo: 'extranjera_sin_reloj'; hasta: null }
  | { catalogada: true; motivo: 'ano_siguiente_al_cese'; hasta: FechaISO }
  | { catalogada: true; motivo: 'ano_siguiente_al_acto'; hasta: FechaISO; fechaActo: FechaISO }
  | { catalogada: false; motivo: 'relojes_vencidos' }

/** 31 de diciembre del año siguiente al de `fecha`. */
function finDelAnioSiguiente(fecha: FechaISO): FechaISO {
  return `${partes(fecha).anio + 1}-12-31`
}

/**
 * ¿Está catalogada como PEP en `fecha`?
 *
 * `fechasDeActos` son los actos u operaciones del obligado con el cliente al
 * que esta función pública alcanza — el ancla del ¶5. Sin actos, solo corre el
 * reloj del cese.
 */
export function catalogacionPep(entrada: {
  funcion: FuncionPublica
  fecha: FechaISO
  fechasDeActos?: FechaISO[]
  reglas: { trasCese: string; trasActo: string }
}): CatalogacionPep {
  const { funcion, fecha, fechasDeActos = [], reglas } = entrada

  // Las reglas se validan ANTES de mirar el caso: un módulo que solo revisa la
  // regla cuando la necesita descubre el catálogo corrupto en producción, con
  // el cliente equivocado.
  if (reglas.trasCese !== 'ano_calendario_siguiente') {
    throw new ReglaPepDesconocida('pep_vigencia_tras_cese', reglas.trasCese)
  }
  if (reglas.trasActo !== 'ano_calendario_siguiente') {
    throw new ReglaPepDesconocida('pep_vigencia_tras_acto', reglas.trasActo)
  }

  if (funcion.enFunciones && funcion.fechaCese !== null) {
    throw new FuncionPublicaIncoherente('sigue en funciones y a la vez tiene fecha de cese')
  }
  if (!funcion.enFunciones && funcion.fechaCese === null) {
    throw new FuncionPublicaIncoherente('dejó el cargo pero no dice cuándo')
  }

  if (funcion.enFunciones) {
    return { catalogada: true, motivo: 'en_funciones', hasta: null }
  }

  if (funcion.ambito === 'extranjero') {
    return { catalogada: true, motivo: 'extranjera_sin_reloj', hasta: null }
  }

  const cese = funcion.fechaCese as FechaISO

  // ¶4 — el reloj del cese.
  const hastaPorCese = finDelAnioSiguiente(cese)
  if (fecha <= hastaPorCese) {
    return { catalogada: true, motivo: 'ano_siguiente_al_cese', hasta: hastaPorCese }
  }

  // ¶5 — el reloj del acto. De todos los actos que cumplen la condición, manda
  // el que catalogue por más tiempo.
  let mejor: { hasta: FechaISO; fechaActo: FechaISO } | null = null
  for (const acto of fechasDeActos) {
    const dentroDelAnioPrevio = cese >= restarMeses(acto, 12) && cese <= acto
    if (!dentroDelAnioPrevio) continue

    const hasta = finDelAnioSiguiente(acto)
    if (mejor === null || hasta > mejor.hasta) {
      mejor = { hasta, fechaActo: acto }
    }
  }
  if (mejor !== null && fecha <= mejor.hasta) {
    return { catalogada: true, motivo: 'ano_siguiente_al_acto', ...mejor }
  }

  return { catalogada: false, motivo: 'relojes_vencidos' }
}
