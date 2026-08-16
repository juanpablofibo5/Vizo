/**
 * La fecha del acto u operación (Art. 24 Bis del Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ DECIDE
 * ────────────────────────────────────────────────────────────────────────────
 * El último párrafo del artículo: «Con la fecha del acto u operación se
 * iniciará el conteo del plazo máximo para la presentación del Aviso […] a que
 * se refiere el artículo 23 de la Ley». Es decir, de esta fecha cuelga el día
 * 17 que el obligado no puede pasar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UNA REGLA POR FRACCIÓN Y NO UNA FÓRMULA
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 24 Bis define una fecha distinta para cada Actividad Vulnerable —la
 * de liquidación, la de conclusión del servicio, el último día del mes del
 * consumo— y para la Fr. V Bis elige la de **la última aportación recibida y
 * destinada al desarrollo en el mes calendario**.
 *
 * Y hay fracciones que **no enumera**: la XV (arrendamiento), la XII y la XIV.
 * Para ésas rige el encabezado —«además de las establecidas en los artículos 5
 * y 24 del Reglamento»— que no se ha contrastado. Por eso la ausencia de regla
 * NO se resuelve con un valor por defecto: se detiene. Un plazo calculado desde
 * la fecha equivocada no revienta nada; solo llega tarde al día 17.
 */

/** Las reglas que el catálogo puede expresar hoy. */
export type ReglaFechaDelActo = 'ultima_aportacion_del_mes'

export class SinReglaDeFechaDelActo extends Error {
  constructor(fraccion: string) {
    super(
      `El catálogo no dice qué fecha cuenta como la del acto para la Fracción ${fraccion}, y ` +
        'el Art. 24 Bis del Acuerdo 115/2026 no la enumera: solo cubre las fracciones I, II, ' +
        'III, V, V Bis, VI, VII, VIII, IX, X, XI, XIII y XVI. Para las demás rige el Reglamento, ' +
        'que todavía no se contrasta contra el DOF. Sin esa regla no se puede afirmar desde ' +
        'cuándo corre el plazo del Art. 23.',
    )
    this.name = 'SinReglaDeFechaDelActo'
  }
}

export class ReglaDeFechaDesconocida extends Error {
  constructor(regla: string) {
    super(
      `El catálogo pide resolver la fecha del acto con la regla "${regla}", que este motor no ` +
        'sabe aplicar. Se detiene en vez de usar otra: una regla nueva se implementa, no se ' +
        'aproxima con la que había.',
    )
    this.name = 'ReglaDeFechaDesconocida'
  }
}

export class PeriodoSinActos extends Error {
  constructor(periodo: string) {
    super(
      `No hay actos u operaciones en ${periodo} de los que tomar la fecha. Un informe en cero no ` +
        'tiene fecha del acto: no hubo acto.',
    )
    this.name = 'PeriodoSinActos'
  }
}

/**
 * Resuelve la fecha del acto para un conjunto de operaciones de un periodo.
 *
 * @param regla   La del catálogo (`parametros_motor.fecha_del_acto`).
 * @param fechas  Fechas 'AAAA-MM-DD' de las operaciones reportables del periodo.
 *                Ya vienen acotadas al mes calendario por quien las consultó.
 */
export function fechaDelActo(
  regla: ReglaFechaDelActo | string,
  fechas: readonly string[],
  periodo: string,
): string {
  if (fechas.length === 0) throw new PeriodoSinActos(periodo)

  if (regla === 'ultima_aportacion_del_mes') {
    // «la última aportación […] en el mes calendario». Como cadenas AAAA-MM-DD,
    // el orden lexicográfico ES el cronológico, y no mete zonas horarias donde
    // no hacen falta.
    return fechas.reduce((maxima, f) => (f > maxima ? f : maxima))
  }

  throw new ReglaDeFechaDesconocida(regla)
}
