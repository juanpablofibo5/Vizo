import { describe, expect, it } from 'vitest'
import { plazoDePresentacion, PeriodoInvalido } from '../../src/dominio/calendario'

/** Del catálogo (`parametros_motor`), aquí fijos para probar los bordes. */
const DIA_LIMITE = 17
const DIAS_AVISO = 7

const plazo = (periodo: string, hoy: string) =>
  plazoDePresentacion({ periodo, hoy, diaLimite: DIA_LIMITE, diasAviso: DIAS_AVISO })

describe('Calendario de presentación', () => {
  it('la fecha límite es el día 17 del mes SIGUIENTE al reportado', () => {
    expect(plazo('2026-05-01', '2026-06-01').fechaLimite).toBe('2026-06-17')
  })

  it('diciembre rueda a enero del año que entra', () => {
    // El caso que más se olvida, y el que cae en plena temporada de cierre.
    expect(plazo('2026-12-01', '2026-12-20').fechaLimite).toBe('2027-01-17')
  })

  describe('los bordes de la alerta', () => {
    it('el día 9 todavía está holgado', () => {
      const p = plazo('2026-05-01', '2026-06-09')
      expect(p.estado).toBe('holgado')
      expect(p.diasRestantes).toBe(8)
    })

    it('el día 10 empieza a avisar: exactamente 7 días', () => {
      const p = plazo('2026-05-01', '2026-06-10')
      expect(p.estado).toBe('por_vencer')
      expect(p.diasRestantes).toBe(7)
    })

    it('el 17 vence hoy, no está vencido', () => {
      // Confundirlos manda a alguien a casa creyendo que ya no puede presentar.
      const p = plazo('2026-05-01', '2026-06-17')
      expect(p.estado).toBe('vence_hoy')
      expect(p.diasRestantes).toBe(0)
    })

    it('el 18 ya venció, y lo dice con números negativos', () => {
      const p = plazo('2026-05-01', '2026-06-18')
      expect(p.estado).toBe('vencido')
      expect(p.diasRestantes).toBe(-1)
    })
  })

  it('cruzar el cambio de mes no descuadra la cuenta', () => {
    // Del 31 de mayo al 17 de junio hay 17 días. Restar meses a mano es donde
    // se cuelan los errores de un día.
    expect(plazo('2026-04-01', '2026-04-30').diasRestantes).toBe(17)
  })

  it('un periodo que no es el primer día del mes NO se interpreta a la buena', () => {
    // '2026-05-15' podría querer decir mayo, o podría ser un error de captura.
    // Adivinar cuál produce una fecha límite plausible y equivocada.
    expect(() => plazo('2026-05-15', '2026-06-01')).toThrow(PeriodoInvalido)
  })

  /**
   * Lo que esta función NO hace, verificado como comportamiento.
   *
   * El 17 de enero de 2027 es domingo. La función devuelve el 17 igual, porque
   * NO SABEMOS si el plazo se recorre al siguiente día hábil. Un recorrido
   * inventado empuja la alerta hacia adelante y hace que el sistema diga
   * "todavía tienes tiempo" un día en que quizá ya no lo hay.
   *
   * Adelantarse nunca produce un incumplimiento; atrasarse sí.
   */
  it('NO recorre el plazo cuando el 17 cae en domingo', () => {
    const p = plazo('2026-12-01', '2027-01-15')
    expect(p.fechaLimite).toBe('2027-01-17')
    expect(new Date('2027-01-17T12:00:00Z').getUTCDay()).toBe(0) // domingo
  })
})
