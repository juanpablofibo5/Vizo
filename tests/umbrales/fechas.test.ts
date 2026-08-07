import { describe, expect, it } from 'vitest'
import { dentroDeVentana, inicioVentana, restarMeses, ultimoDiaDelMes } from '../../src/dominio/fechas'

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
