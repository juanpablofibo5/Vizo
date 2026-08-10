/**
 * El calendario de presentación del aviso.
 *
 * La fecha límite es el día **17 del mes inmediato siguiente** al periodo
 * reportado, y la alerta empieza el día 10 — siete días de margen, que es lo
 * que el plan fijó para que nadie descubra el vencimiento el mismo 17.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA FUNCIÓN NO HACE, Y ES A PROPÓSITO
 * ────────────────────────────────────────────────────────────────────────────
 * No recorre la fecha cuando el 17 cae en sábado, domingo o día inhábil.
 *
 * Sería fácil escribirlo y estaría mal: **no sabemos si el plazo se recorre**.
 * Un recorrido inventado empuja la alerta hacia adelante y hace que el sistema
 * diga "todavía tienes tiempo" un día en que quizá ya no lo hay. El error caro
 * de este proyecto no es el crash, es el número plausible.
 *
 * Mientras eso no se confirme contra el texto, el 17 es el 17. Adelantarse
 * nunca produce un incumplimiento; atrasarse sí. Ver el issue de POR CONFIRMAR.
 *
 * El día 17 no está aquí como constante: vive en `parametros_motor` desde la
 * semana 1, y el smoke test lo comprueba. Esta función lo RECIBE.
 */

/** Estado del periodo respecto de su fecha límite. */
export type EstadoPlazo = 'holgado' | 'por_vencer' | 'vence_hoy' | 'vencido'

export interface Plazo {
  /** AAAA-MM-DD del último día para presentar. */
  fechaLimite: string
  estado: EstadoPlazo
  /** Negativo si ya venció. */
  diasRestantes: number
}

export class PeriodoInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'PeriodoInvalido'
  }
}

const DIAS = 86_400_000

/** Cuenta días entre dos AAAA-MM-DD sin que la zona horaria se meta. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(
    Number(desde.slice(0, 4)),
    Number(desde.slice(5, 7)) - 1,
    Number(desde.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(hasta.slice(0, 4)),
    Number(hasta.slice(5, 7)) - 1,
    Number(hasta.slice(8, 10)),
  )
  return Math.round((b - a) / DIAS)
}

/**
 * @param periodo    Primer día del mes reportado, 'AAAA-MM-01'.
 * @param hoy        Hoy EN MÉXICO. Se recibe, no se lee del reloj: una función
 *                   que mira el reloj por dentro no se puede probar en los
 *                   bordes, que es justo donde importa.
 * @param diaLimite  Del catálogo (`parametros_motor`), no de una constante.
 * @param diasAviso  Cuántos días antes empieza a avisar.
 */
export function plazoDePresentacion(p: {
  periodo: string
  hoy: string
  diaLimite: number
  diasAviso: number
}): Plazo {
  if (!/^\d{4}-\d{2}-01$/.test(p.periodo)) {
    throw new PeriodoInvalido(
      `El periodo debe ser el primer día del mes reportado ('AAAA-MM-01') y llegó "${p.periodo}".`,
    )
  }

  const anio = Number(p.periodo.slice(0, 4))
  const mes = Number(p.periodo.slice(5, 7))
  // Mes siguiente. Diciembre rueda a enero del año que entra — el caso que
  // más se olvida, y el que cae en plena temporada de cierre.
  const anioLimite = mes === 12 ? anio + 1 : anio
  const mesLimite = mes === 12 ? 1 : mes + 1

  const fechaLimite = `${String(anioLimite)}-${String(mesLimite).padStart(2, '0')}-${String(
    p.diaLimite,
  ).padStart(2, '0')}`

  const diasRestantes = diasEntre(p.hoy, fechaLimite)

  const estado: EstadoPlazo =
    diasRestantes < 0
      ? 'vencido'
      : diasRestantes === 0
        ? 'vence_hoy'
        : diasRestantes <= p.diasAviso
          ? 'por_vencer'
          : 'holgado'

  return { fechaLimite, estado, diasRestantes }
}
