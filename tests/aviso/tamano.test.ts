import { describe, expect, it } from 'vitest'
import { tamanoLegible } from '../../src/dominio/tamano'

/**
 * Salió al correr la demo completa: un PDF de 192 bytes se pintaba como
 * "0 KB", que al lado de un documento se lee como "el archivo está vacío".
 */
describe('Tamaño legible', () => {
  it('por debajo de 1 KB dice bytes, no cero', () => {
    expect(tamanoLegible(192)).toBe('192 B')
    expect(tamanoLegible('0')).toBe('0 B')
  })

  it('con un decimal mientras la diferencia se note', () => {
    // Entre 1.2 KB y 9.8 KB hay información; entre 340 y 341 no.
    expect(tamanoLegible(1_800)).toBe('1.8 KB')
    expect(tamanoLegible(348_160)).toBe('340 KB')
  })

  it('los bytes llegan como texto desde Postgres', () => {
    expect(tamanoLegible('2097152')).toBe('2.0 MB')
  })

  it('un valor que no es número no inventa un tamaño', () => {
    expect(tamanoLegible('no es un número')).toBe('—')
  })
})
