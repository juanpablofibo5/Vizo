import { describe, expect, it } from 'vitest'
import { dentroDeVentana, inicioVentana, restarMeses, ultimoDiaDelMes, fechaEn } from '../../src/dominio/fechas'

/**
 * La ventana de acumulación se calcula con estas funciones. Un error de un día
 * en el borde deja fuera una operación que debía sumar — y con ella, un aviso.
 */
describe('Aritmética de fechas', () => {
  describe('restarMeses', () => {
    it.each([
      ['2026-09-10', 6, '2026-03-10', 'el caso A-02: la ventana arranca en marzo'],
      ['2026-05-15', 6, '2025-11-15', 'cruza el cambio de año'],
      ['2026-03-31', 1, '2026-02-28', 'recorta al último día de febrero, no desborda a marzo'],
      ['2024-03-31', 1, '2024-02-29', 'año bisiesto'],
      ['2026-08-31', 6, '2026-02-28', 'agosto 31 menos 6 meses'],
      ['2026-01-15', 6, '2025-07-15', 'retrocede de año'],
      ['2026-12-31', 12, '2025-12-31', 'un año exacto'],
    ])('%s − %i meses = %s (%s)', (fecha, meses, esperado) => {
      expect(restarMeses(fecha, meses)).toBe(esperado)
    })

    it('rechaza una fecha con formato inesperado en vez de adivinar', () => {
      expect(() => restarMeses('15/03/2026', 6)).toThrow()
      expect(() => restarMeses('2026-3-1', 6)).toThrow()
    })
  })

  describe('ultimoDiaDelMes', () => {
    it.each([
      [2026, 2, 28],
      [2024, 2, 29], // bisiesto
      [2100, 2, 28], // 2100 NO es bisiesto: divisible entre 100 y no entre 400
      [2000, 2, 29], // 2000 SÍ lo es
      [2026, 4, 30],
      [2026, 12, 31],
    ])('%i-%i tiene %i días', (anio, mes, dias) => {
      expect(ultimoDiaDelMes(anio, mes)).toBe(dias)
    })
  })

  describe('ventana de acumulación', () => {
    it('el borde es INCLUSIVO: una operación justo en el inicio sí acumula', () => {
      const inicio = inicioVentana('2026-09-10', 6) // 2026-03-10
      expect(inicio).toBe('2026-03-10')
      expect(dentroDeVentana('2026-03-10', inicio, '2026-09-10')).toBe(true)
      // Un día antes queda fuera: es el caso A-02.
      expect(dentroDeVentana('2026-03-09', inicio, '2026-09-10')).toBe(false)
    })

    it('una operación posterior a la evaluada nunca está en la ventana', () => {
      const inicio = inicioVentana('2026-05-15', 6)
      expect(dentroDeVentana('2026-06-01', inicio, '2026-05-15')).toBe(false)
    })

    it('la ventana viene del catálogo: exige meses enteros y positivos', () => {
      expect(() => inicioVentana('2026-05-15', 0)).toThrow()
      expect(() => inicioVentana('2026-05-15', -6)).toThrow()
      expect(() => inicioVentana('2026-05-15', 1.5)).toThrow()
    })
  })
})

describe('La fecha de hoy, en la zona que importa', () => {
  /**
   * HALLAZGO DE LA AUDITORÍA DE LA SEMANA 6.
   *
   * La pantalla del expediente calculaba "hoy" con `toISOString()`, que da la
   * fecha en UTC. Mérida está seis horas atrás, así que desde las 18:00 hora
   * local el sistema ya creía que era el día siguiente.
   */
  it('a las 20:30 de Mérida todavía es el MISMO día, no el siguiente', () => {
    const instante = new Date('2026-08-09T02:30:00Z') // 20:30 del 8 en Mérida
    expect(fechaEn(instante)).toBe('2026-08-08')
    // Lo que hacía antes, para que quede escrito por qué cambió:
    expect(instante.toISOString().slice(0, 10)).toBe('2026-08-09')
  })

  it('a las 00:30 de Mérida ya es el día nuevo', () => {
    expect(fechaEn(new Date('2026-08-09T06:30:00Z'))).toBe('2026-08-09')
  })

  it('respeta el horario de verano: en enero el desfase es distinto que en julio', () => {
    // Enero: UTC-6. 05:30Z es 23:30 del día anterior.
    expect(fechaEn(new Date('2026-01-16T05:30:00Z'))).toBe('2026-01-15')
    // Julio: la regla de 2022 quitó el horario de verano, sigue UTC-6.
    expect(fechaEn(new Date('2026-07-16T05:30:00Z'))).toBe('2026-07-15')
  })

  it('el borde del 1 de febrero se resuelve en hora de México, no en UTC', () => {
    // 31 de enero, 19:00 en Mérida = 1 de febrero 01:00 UTC. Con UTC se
    // aplicarían los umbrales del año nuevo cinco horas antes de tiempo.
    const instante = new Date('2026-02-01T01:00:00Z')
    expect(fechaEn(instante)).toBe('2026-01-31')
    expect(instante.toISOString().slice(0, 10)).toBe('2026-02-01')
  })
})
