import { describe, expect, it } from 'vitest'
import {
  catalogacionPep,
  FuncionPublicaIncoherente,
  ReglaPepDesconocida,
} from '../../src/dominio/pep'

const REGLAS = { trasCese: 'ano_calendario_siguiente', trasActo: 'ano_calendario_siguiente' }

/**
 * Los dos relojes del Art. 23 Quáter (¶4 y ¶5).
 *
 * El caso que justifica toda la suite: «durante el año siguiente A AQUEL en
 * que» es año calendario, no 365 días. Las dos lecturas coinciden casi todo el
 * año — difieren exactamente en las fechas que estas pruebas pisan.
 */
describe('La vigencia del carácter de PEP', () => {
  const nacionalCesada = {
    ambito: 'nacional' as const,
    enFunciones: false,
    fechaCese: '2026-01-15',
  }

  it('en funciones está catalogada, sin fecha de fin', () => {
    const r = catalogacionPep({
      funcion: { ambito: 'nacional', enFunciones: true, fechaCese: null },
      fecha: '2030-01-01',
      reglas: REGLAS,
    })
    expect(r).toEqual({ catalogada: true, motivo: 'en_funciones', hasta: null })
  })

  it('la extranjera cesada no tiene reloj: sigue catalogada décadas después', () => {
    // ¶4 y ¶5 hablan solo de «nacionales». Para la extranjera rige el ¶1 a
    // secas: «desempeña o HA DESEMPEÑADO». Lectura literal y conservadora.
    const r = catalogacionPep({
      funcion: { ambito: 'extranjero', enFunciones: false, fechaCese: '1998-11-30' },
      fecha: '2026-12-01',
      reglas: REGLAS,
    })
    expect(r).toEqual({ catalogada: true, motivo: 'extranjera_sin_reloj', hasta: null })
  })

  it('EL CASO QUE MATA LA LECTURA DE 12 MESES: cese en enero de 2026, consulta en junio de 2027', () => {
    // Con «12 meses desde el cese» habría dejado de estar catalogada el
    // 15-ene-2027. Con «el año siguiente a aquel en que cesó» sigue catalogada
    // hasta el 31-dic-2027 — y junio de 2027 cae dentro.
    const r = catalogacionPep({ funcion: nacionalCesada, fecha: '2027-06-01', reglas: REGLAS })
    expect(r).toEqual({ catalogada: true, motivo: 'ano_siguiente_al_cese', hasta: '2027-12-31' })
  })

  it('el reloj del cese muere exactamente al cambiar el año: 31-dic sí, 1-ene no', () => {
    expect(
      catalogacionPep({ funcion: nacionalCesada, fecha: '2027-12-31', reglas: REGLAS }).catalogada,
    ).toBe(true)
    expect(
      catalogacionPep({ funcion: nacionalCesada, fecha: '2028-01-01', reglas: REGLAS }),
    ).toEqual({ catalogada: false, motivo: 'relojes_vencidos' })
  })

  it('¶5: operar con una PEP recién cesada reinicia el reloj desde el acto', () => {
    // Cese 15-ene-2026. Acto 10-ene-2027: cae dentro del año inmediato
    // anterior (10-ene-2026 ≤ cese ≤ acto), así que cataloga hasta el
    // 31-dic-2028 — un año calendario más que el reloj del cese.
    const r = catalogacionPep({
      funcion: nacionalCesada,
      fecha: '2028-06-01',
      fechasDeActos: ['2027-01-10'],
      reglas: REGLAS,
    })
    expect(r).toEqual({
      catalogada: true,
      motivo: 'ano_siguiente_al_acto',
      hasta: '2028-12-31',
      fechaActo: '2027-01-10',
    })
    expect(
      catalogacionPep({
        funcion: nacionalCesada,
        fecha: '2029-01-01',
        fechasDeActos: ['2027-01-10'],
        reglas: REGLAS,
      }),
    ).toEqual({ catalogada: false, motivo: 'relojes_vencidos' })
  })

  it('la condición del ¶5 es inclusiva en su borde: cese exactamente 12 meses antes del acto', () => {
    // Ante la duda se cataloga: el falso positivo cuesta una revisión, el
    // falso negativo es un seguimiento omitido.
    const r = catalogacionPep({
      funcion: nacionalCesada,
      fecha: '2028-06-01',
      fechasDeActos: ['2027-01-15'],
      reglas: REGLAS,
    })
    expect(r.catalogada).toBe(true)
    expect(r.motivo).toBe('ano_siguiente_al_acto')
  })

  it('un acto lejano al cese no extiende nada', () => {
    // Cese 2025-06-01; acto 2027-01-10 llega más de un año después del cese:
    // la condición del ¶5 no se cumple y el reloj del cese ya venció.
    const r = catalogacionPep({
      funcion: { ambito: 'nacional', enFunciones: false, fechaCese: '2025-06-01' },
      fecha: '2027-02-01',
      fechasDeActos: ['2027-01-10'],
      reglas: REGLAS,
    })
    expect(r).toEqual({ catalogada: false, motivo: 'relojes_vencidos' })
  })

  it('con varios actos manda el que catalogue por más tiempo', () => {
    const r = catalogacionPep({
      funcion: nacionalCesada,
      fecha: '2028-06-01',
      fechasDeActos: ['2026-03-01', '2027-01-10', '2026-11-20'],
      reglas: REGLAS,
    })
    expect(r).toMatchObject({ motivo: 'ano_siguiente_al_acto', fechaActo: '2027-01-10' })
  })

  it('una regla que el módulo no conoce detiene, no aproxima', () => {
    expect(() =>
      catalogacionPep({
        funcion: nacionalCesada,
        fecha: '2027-01-01',
        reglas: { trasCese: 'doce_meses', trasActo: 'ano_calendario_siguiente' },
      }),
    ).toThrow(ReglaPepDesconocida)
    expect(() =>
      catalogacionPep({
        funcion: nacionalCesada,
        fecha: '2027-01-01',
        reglas: { trasCese: 'ano_calendario_siguiente', trasActo: 'doce_meses' },
      }),
    ).toThrow(ReglaPepDesconocida)
  })

  it('una función pública incoherente no produce vigencia: revienta', () => {
    expect(() =>
      catalogacionPep({
        funcion: { ambito: 'nacional', enFunciones: true, fechaCese: '2026-01-15' },
        fecha: '2027-01-01',
        reglas: REGLAS,
      }),
    ).toThrow(FuncionPublicaIncoherente)
    expect(() =>
      catalogacionPep({
        funcion: { ambito: 'nacional', enFunciones: false, fechaCese: null },
        fecha: '2027-01-01',
        reglas: REGLAS,
      }),
    ).toThrow(FuncionPublicaIncoherente)
  })
})
