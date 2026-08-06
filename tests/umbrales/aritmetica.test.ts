import { describe, expect, it } from 'vitest'
import {
  centavos,
  formatearPesos,
  pesos,
  pesosTextoACentavos,
  porcentaje,
  umaACentavos,
  umaCentavos,
} from '../../src/dominio/dinero.js'

/**
 * Aritmética de dinero: la capa donde un error no se ve pero se paga.
 *
 * Los valores esperados de este archivo se calcularon A MANO con `bc`, no con
 * el código que se está probando:
 *
 *   $ echo "scale=2; 8025 * 117.31" | bc   → 941412.75
 *   $ echo "scale=2; 8025 * 113.14" | bc   → 907948.50
 *   $ echo "scale=4; 941412.75 * .90" | bc → 847271.4750
 *   $ echo "scale=2; (8025*117.31)-(8025*113.14)" | bc → 33464.25
 *
 * Verificar con el mismo código que se prueba no verifica nada.
 */
describe('Aritmética de centavos', () => {
  describe('conversión desde el numeric de Postgres', () => {
    it('no pierde el centavo que parseFloat pierde', () => {
      // El bug que esta función existe para evitar. NO es teórico y NO depende
      // de montos raros: verificado en node, `parseFloat(t) * 100` deja de ser
      // entero para 8.20 (819.9999999999999), 2.30 (229.99999999999997),
      // 70.10 (7009.999999999999) y 1234567.89 (123456788.99999999).
      //
      // Que $941,412.75 sobreviva es CASUALIDAD de su representación binaria.
      // Confiar en eso es confiar en la suerte para un cálculo que decide si
      // se presenta un aviso.
      for (const [texto, esperado] of [
        ['8.20', 820],
        ['2.30', 230],
        ['70.10', 7010],
        ['1234567.89', 123_456_789],
      ] as const) {
        expect(pesosTextoACentavos(texto)).toBe(esperado)
        expect(Number.isInteger(parseFloat(texto) * 100)).toBe(false)
      }
    })

    it.each([
      ['0.00', 0],
      ['0.01', 1],
      ['1', 100],
      ['1.5', 150],
      ['117.31', 11_731],
      ['113.14', 11_314],
      ['8025.00', 802_500],
      ['941412.75', 94_141_275],
      ['-500.25', -50_025],
    ])('"%s" → %i centavos', (texto, esperado) => {
      expect(pesosTextoACentavos(texto)).toBe(esperado)
    })

    it('rechaza lo que no es un monto en vez de adivinar', () => {
      expect(() => pesosTextoACentavos('1.234')).toThrow() // 3 decimales
      expect(() => pesosTextoACentavos('$941,412.75')).toThrow() // formateado
      expect(() => pesosTextoACentavos('')).toThrow()
      expect(() => centavos(1.5)).toThrow() // centavos fraccionarios
    })
  })

  describe('conversión de UMA a pesos', () => {
    // Calculado con bc, no con este código.
    it('8,025 UMA × $117.31 = $941,412.75 (tabla oficial del SPPLD)', () => {
      expect(umaACentavos('8025.00', umaCentavos(11_731))).toBe(pesos(941_412.75))
    })

    it('8,025 UMA × $113.14 = $907,948.50', () => {
      expect(umaACentavos('8025.00', umaCentavos(11_314))).toBe(pesos(907_948.5))
    })

    it('la frontera del 1 de febrero mueve el umbral $33,464.25', () => {
      const con2026 = umaACentavos('8025.00', umaCentavos(11_731))
      const con2025 = umaACentavos('8025.00', umaCentavos(11_314))
      expect(con2026 - con2025).toBe(pesos(33_464.25))
    })

    it('umbrales de otras fracciones, para que el motor no sea de una sola', () => {
      // Fr. XV con UMA 2026: identificación 1,605 y aviso 3,210
      expect(umaACentavos('1605.00', umaCentavos(11_731))).toBe(pesos(188_282.55))
      expect(umaACentavos('3210.00', umaCentavos(11_731))).toBe(pesos(376_565.1))
    })
  })

  describe('umbral de proximidad', () => {
    it('90% de $941,412.75 = $847,271.475 → $847,271.48 al centavo', () => {
      // Se redondea HACIA ARRIBA: la alerta debe dispararse un poco más tarde,
      // nunca más temprano de lo que el parámetro indica.
      expect(porcentaje(pesos(941_412.75), 90)).toBe(pesos(847_271.48))
    })

    it('el caso A-06: $860,000 cruza proximidad pero no el umbral', () => {
      const umbral = pesos(941_412.75)
      const proximidad = porcentaje(umbral, 90)
      const suma = pesos(860_000)

      expect(suma >= proximidad).toBe(true) // 860,000 ≥ 847,271.48
      expect(suma >= umbral).toBe(false) // 860,000 < 941,412.75
    })

    it('el caso U-03: un centavo por debajo del umbral', () => {
      const umbral = pesos(941_412.75)
      const monto = pesos(941_412.74)

      expect(monto >= umbral).toBe(false)
      expect(umbral - monto).toBe(1) // exactamente un centavo
      expect(monto >= porcentaje(umbral, 90)).toBe(true)
    })
  })

  describe('formato para bitácora y mensajes', () => {
    it.each([
      [941_412.75, '$941,412.75'],
      [0.01, '$0.01'],
      [1_200_000, '$1,200,000.00'],
    ])('%d → %s', (valor, esperado) => {
      expect(formatearPesos(pesos(valor))).toBe(esperado)
    })
  })
})
