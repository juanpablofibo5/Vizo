/**
 * Aritmética de fechas para la ventana de acumulación.
 *
 * Las fechas del dominio son strings `YYYY-MM-DD` (la fecha del ACTO, no un
 * instante). No se usa `Date` para representarlas: convertir a Date y de
 * vuelta arrastra zona horaria, y una operación del 1 de febrero que se
 * convierte en 31 de enero cambia la UMA aplicable y con ella el umbral.
 */

export type FechaISO = string

const PATRON = /^(\d{4})-(\d{2})-(\d{2})$/

export function partes(fecha: FechaISO): { anio: number; mes: number; dia: number } {
  const m = PATRON.exec(fecha)
  if (!m) {
    throw new Error(`Fecha con formato inesperado: "${fecha}". Se espera YYYY-MM-DD.`)
  }
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/** Último día del mes (1-indexed), respetando años bisiestos. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  // Día 0 del mes siguiente = último día de este. `Date.UTC` toma el mes
  // 0-indexed, así que pasar `mes` tal cual apunta al siguiente.
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/**
 * Resta meses a una fecha, recortando el día cuando el mes destino es más
 * corto.
 *
 * El caso que importa: restar 6 meses al 31 de agosto da 28 de febrero, no
 * "31 de febrero" desbordado al 3 de marzo. `Date.setUTCMonth` desborda; por
 * eso este cálculo es manual.
 */
export function restarMeses(fecha: FechaISO, meses: number): FechaISO {
  const { anio, mes, dia } = partes(fecha)

  let anioDestino = anio
  let mesDestino = mes - meses
  while (mesDestino <= 0) {
    mesDestino += 12
    anioDestino -= 1
  }
  while (mesDestino > 12) {
    mesDestino -= 12
    anioDestino += 1
  }

  const diaDestino = Math.min(dia, ultimoDiaDelMes(anioDestino, mesDestino))
  return `${anioDestino}-${dosDigitos(mesDestino)}-${dosDigitos(diaDestino)}`
}

/**
 * Suma meses a una fecha, con el MISMO recorte de día que `restarMeses`.
 *
 * Tiene que coincidir con Postgres, y coincide: `date '2027-08-31' + interval
 * '6 months'` devuelve `2028-02-29`, no un 31 de febrero desbordado. Importa
 * porque el vencimiento del Perfil transaccional se deriva aquí y el trigger
 * `app.perfil_transaccional_coherente` lo vuelve a calcular allá: si las dos
 * aritméticas discreparan un día, ningún perfil anclado a fin de mes se
 * podría guardar.
 */
export function sumarMeses(fecha: FechaISO, meses: number): FechaISO {
  return restarMeses(fecha, -meses)
}

/**
 * Inicio de la ventana de acumulación: `meses` hacia atrás desde la fecha de
 * la operación evaluada. La ventana es DESLIZANTE (se cuenta desde cada
 * operación) y no periodos fijos de calendario.
 *
 * El límite es INCLUSIVO: una operación exactamente en el borde entra a la
 * suma. Ante la duda se acumula de más — un falso positivo cuesta una
 * revisión, un falso negativo es un aviso omitido.
 */
export function inicioVentana(fechaOperacion: FechaISO, meses: number): FechaISO {
  if (!Number.isInteger(meses) || meses <= 0) {
    throw new Error(`La ventana de acumulación debe ser un número entero de meses, se recibió ${meses}`)
  }
  return restarMeses(fechaOperacion, meses)
}

/** ¿`fecha` cae dentro de [inicio, referencia]? Ambos extremos incluidos. */
export function dentroDeVentana(fecha: FechaISO, inicio: FechaISO, referencia: FechaISO): boolean {
  // Comparación lexicográfica: para YYYY-MM-DD equivale a la cronológica.
  return fecha >= inicio && fecha <= referencia
}

// ─────────────────────────────────────────────────────────────────────────
// La fecha de hoy, en la zona que importa
// ─────────────────────────────────────────────────────────────────────────

/**
 * México. El obligado cumple en su jurisdicción, no en UTC.
 */
export const ZONA_MEXICO = 'America/Mexico_City'

/**
 * HALLAZGO DE LA AUDITORÍA DE LA SEMANA 6.
 *
 * La pantalla del expediente calculaba "hoy" con
 * `new Date().toISOString().slice(0, 10)`, que devuelve la fecha **en UTC**.
 * En Mérida son seis horas de diferencia, así que a partir de las 18:00 hora
 * local el sistema creía que ya era mañana. Durante esas seis horas, cada día,
 * la vigencia del catálogo se resolvía con la fecha equivocada.
 *
 * Es el mismo error que el gotcha del 1 de febrero, en pequeño: un umbral o un
 * campo que entra en vigor mañana se aplicaría desde las 18:00 de hoy. No
 * revienta nada — devuelve el catálogo de otro día.
 *
 * Recibe el instante como parámetro para poder probarlo: una función que lee
 * el reloj por dentro no se puede verificar en los bordes, que es justo donde
 * falla.
 */
export function fechaEn(instante: Date, zona: string = ZONA_MEXICO): string {
  // 'en-CA' formatea como AAAA-MM-DD, que es lo que espera Postgres.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante)
}

/** Hoy en México, según el reloj del SERVIDOR — nunca el del navegador. */
export function hoyEnMexico(): string {
  return fechaEn(new Date())
}
