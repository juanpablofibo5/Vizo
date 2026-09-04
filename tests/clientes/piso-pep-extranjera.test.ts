import { describe, expect, it } from 'vitest'
import {
  EscalaSinGradoAlto,
  evaluarRiesgo,
  type ConfiguracionRiesgo,
  type InsumosRiesgo,
} from '../../src/dominio/riesgo'

/**
 * El piso del Art. 23 Bis 4.
 *
 * «deberán considerar como personas Clientes o Usuarias de Grado de Riesgo
 * alto, AL MENOS a […] las Personas Políticamente Expuestas extranjeras.»
 *
 * Lo que protegen: que «al menos» sea un PISO y no una asignación, que el
 * puntaje calculado no se altere, y que la falta de declaración se diga en vez
 * de resolverse como «no le toca».
 */

const ESCALA = [
  { id: 'g-bajo', clave: 'bajo', orden: 1, puntajeMinimo: 0, esAlto: false },
  { id: 'g-medio', clave: 'medio', orden: 2, puntajeMinimo: 35, esAlto: false },
  { id: 'g-alto', clave: 'alto', orden: 3, puntajeMinimo: 70, esAlto: true },
]

const config = (extra: Partial<ConfiguracionRiesgo> = {}): ConfiguracionRiesgo => ({
  modeloId: 'm1',
  metodoMedicion: 'suma_ponderada',
  factores: [
    { id: 'f1', factor: 'Uno', elemento: 'tipo_cliente', peso: 10 },
    { id: 'f2', factor: 'Dos', elemento: 'tipo_cliente', peso: 80 },
  ],
  escala: ESCALA,
  pisoPepExtranjeraExigible: true,
  ...extra,
})

const insumos = (p: Partial<InsumosRiesgo> = {}): InsumosRiesgo => ({
  clienteId: 'c1',
  factoresPresentes: ['f1'],
  ...p,
})

const evaluado = (r: ReturnType<typeof evaluarRiesgo>) => {
  if (r.estado !== 'evaluado') throw new Error(`esperaba evaluado, llegó ${r.estado}`)
  return r
}

describe('El piso del Art. 23 Bis 4', () => {
  it('SUBE al que el puntaje dejaba abajo', () => {
    const r = evaluado(evaluarRiesgo(insumos({ esPepExtranjera: true }), config()))
    expect(r.gradoClave).toBe('alto')
    expect(r.esAlto).toBe(true)
    expect(r.pisoPepExtranjera).toBe('aplicado')
  })

  it('EL PUNTAJE NO SE TOCA: es lo que la metodología del obligado produjo', () => {
    // Subir el grado y además reescribir el puntaje falsificaría el cálculo
    // del obligado. El artículo manda considerar el GRADO, no el número.
    const r = evaluado(evaluarRiesgo(insumos({ esPepExtranjera: true }), config()))
    expect(r.puntaje).toBe(10)
    // Y el corte que se reporta es el del grado al que se subió, no el viejo.
    expect(r.corteAplicado).toBe(70)
  })

  it('«AL MENOS»: a quien ya era alto no le cambia nada', () => {
    const r = evaluado(
      evaluarRiesgo(insumos({ factoresPresentes: ['f2'], esPepExtranjera: true }), config()),
    )
    expect(r.gradoClave).toBe('alto')
    expect(r.puntaje).toBe(80)
    expect(r.pisoPepExtranjera).toBe('ya_era_alto')
  })

  it('quien NO es PEP extranjera se queda con su grado', () => {
    const r = evaluado(evaluarRiesgo(insumos({ esPepExtranjera: false }), config()))
    expect(r.gradoClave).toBe('bajo')
    expect(r.pisoPepExtranjera).toBe('no_aplica')
  })

  it('SIN DECLARACIÓN NO ES «no le toca»: es que no se sabe', () => {
    // Resolverlo como `no_aplica` daría un grado que quizá debía subir, sin
    // que nadie se entere. La respuesta cómoda es justo la que no se da.
    const r = evaluado(evaluarRiesgo(insumos(), config()))
    expect(r.pisoPepExtranjera).toBe('no_se_sabe')
    expect(r.gradoClave).toBe('bajo')
  })

  it('antes de su vigencia el piso no se aplica, y se dice por qué', () => {
    const r = evaluado(
      evaluarRiesgo(
        insumos({ esPepExtranjera: true }),
        config({ pisoPepExtranjeraExigible: false }),
      ),
    )
    expect(r.gradoClave).toBe('bajo')
    expect(r.pisoPepExtranjera).toBe('no_exigible')
  })

  it('una escala SIN grado alto detiene: cuál es «alto» lo declara el obligado', () => {
    // No se elige el más severo por cuenta propia. Si nadie marcó un grado
    // como alto, el artículo no se puede cumplir y hay que decirlo.
    expect(() =>
      evaluarRiesgo(
        insumos({ esPepExtranjera: true }),
        config({ escala: ESCALA.map((g) => ({ ...g, esAlto: false })) }),
      ),
    ).toThrow(EscalaSinGradoAlto)
  })

  it('sube al MENOR de los grados altos, no al más severo de la escala', () => {
    const r = evaluado(
      evaluarRiesgo(
        insumos({ esPepExtranjera: true }),
        config({
          escala: [
            ...ESCALA,
            { id: 'g-critico', clave: 'critico', orden: 4, puntajeMinimo: 90, esAlto: true },
          ],
        }),
      ),
    )
    // «Al menos alto» es alto, no lo más alto que exista.
    expect(r.gradoClave).toBe('alto')
  })
})
