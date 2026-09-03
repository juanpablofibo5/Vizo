import { describe, expect, it } from 'vitest'
import {
  coberturaDeSeleccion,
  estadoDeSeleccion,
  type DeclaracionDePersonal,
  type PersonaContratable,
} from '../../src/dominio/seleccion-personal'

/**
 * El Art. 39 Bis 2, en el dominio.
 *
 * Lo que protegen: que el Transitorio Sexto acote de verdad —solo las nuevas
 * contrataciones—, que la falta de fecha NO se lea como «no aplica», y que una
 * manifestación en falso se distinga de una declaración ausente.
 */

const DESDE = '2027-03-01'

const persona = (
  id: string,
  fechaContratacion: string | null,
  nombre = `Persona ${id}`,
): PersonaContratable => ({ id, nombre, fechaContratacion, bajaDelArea: null })

const declaracion = (
  personaId: string,
  m: Partial<DeclaracionDePersonal['manifestaciones']> = {},
  fecha = '2027-03-05',
): DeclaracionDePersonal => ({
  id: `d-${personaId}-${fecha}`,
  personaId,
  fechaDeclaracion: fecha,
  laboroEnSectorObligado: false,
  sectoresPrevios: null,
  manifestaciones: {
    sinSentenciaPatrimonial: true,
    sinInhabilitacionComercio: true,
    sinInhabilitacionServicioOFinanciero: true,
    ...m,
  },
  tieneFirmaConHuella: true,
})

describe('A quién alcanza el Art. 39 Bis 2', () => {
  it('EL TRANSITORIO SEXTO ACOTA: quien se contrató antes no entra', () => {
    expect(
      estadoDeSeleccion({
        persona: persona('a', '2027-02-28'),
        declaraciones: [],
        exigibleDesde: DESDE,
      }).estado,
    ).toBe('no_aplica')
  })

  it('el propio primero de marzo sí entra: «a partir del»', () => {
    expect(
      estadoDeSeleccion({
        persona: persona('a', '2027-03-01'),
        declaraciones: [],
        exigibleDesde: DESDE,
      }).estado,
    ).toBe('sin_declaracion')
  })

  it('SIN FECHA DE CONTRATACIÓN NO ES «NO APLICA»: es que no se sabe', () => {
    // Leerlo como «no aplica» dejaría fuera del conteo justo a quien podría
    // estar dentro, y sobre datos que no alcanzan.
    expect(
      estadoDeSeleccion({ persona: persona('a', null), declaraciones: [], exigibleDesde: DESDE })
        .estado,
    ).toBe('indeterminable')
  })

  it('la fecha viene de fuera: con otra fecha exigible, cambia a quién alcanza', () => {
    // El día que el catálogo diga otra cosa, este módulo obedece sin tocarse.
    expect(
      estadoDeSeleccion({
        persona: persona('a', '2027-02-28'),
        declaraciones: [],
        exigibleDesde: '2027-01-01',
      }).estado,
    ).toBe('sin_declaracion')
  })
})

describe('Qué cuenta como cubierta', () => {
  it('con las tres manifestaciones del texto, cubierta', () => {
    const e = estadoDeSeleccion({
      persona: persona('a', '2027-03-10'),
      declaraciones: [declaracion('a')],
      exigibleDesde: DESDE,
    })
    expect(e.estado).toBe('cubierta')
  })

  it('UNA MANIFESTACIÓN EN FALSO no es una declaración ausente: dice cuál falló', () => {
    const e = estadoDeSeleccion({
      persona: persona('a', '2027-03-10'),
      declaraciones: [declaracion('a', { sinSentenciaPatrimonial: false })],
      exigibleDesde: DESDE,
    })
    expect(e.estado).toBe('declaracion_con_impedimento')
    if (e.estado !== 'declaracion_con_impedimento') throw new Error('imposible')
    expect(e.impedimentos).toEqual(['declara haber sido sentenciada por delitos patrimoniales'])
  })

  it('y si fallan dos, las nombra las dos', () => {
    const e = estadoDeSeleccion({
      persona: persona('a', '2027-03-10'),
      declaraciones: [
        declaracion('a', { sinInhabilitacionComercio: false, sinInhabilitacionServicioOFinanciero: false }),
      ],
      exigibleDesde: DESDE,
    })
    if (e.estado !== 'declaracion_con_impedimento') throw new Error('debía tener impedimentos')
    expect(e.impedimentos).toHaveLength(2)
  })

  it('LA ÚLTIMA MANDA: corregir es declarar de nuevo, porque lo firmado no se edita', () => {
    const e = estadoDeSeleccion({
      persona: persona('a', '2027-03-10'),
      declaraciones: [
        declaracion('a', { sinSentenciaPatrimonial: false }, '2027-03-05'),
        declaracion('a', {}, '2027-03-20'),
      ],
      exigibleDesde: DESDE,
    })
    expect(e.estado).toBe('cubierta')
  })

  it('la declaración de otra persona no cubre a ésta', () => {
    const e = estadoDeSeleccion({
      persona: persona('a', '2027-03-10'),
      declaraciones: [declaracion('b')],
      exigibleDesde: DESDE,
    })
    expect(e.estado).toBe('sin_declaracion')
  })
})

describe('La cobertura del obligado', () => {
  it('cuenta solo a las alcanzadas, no a toda la plantilla', () => {
    const c = coberturaDeSeleccion({
      personas: [persona('vieja', '2020-01-01'), persona('nueva', '2027-04-01')],
      declaraciones: [declaracion('nueva')],
      exigibleDesde: DESDE,
    })
    expect(c.alcanzadas).toBe(1)
    expect(c.cubiertas).toBe(1)
    expect(c.acreditado).toBe(true)
  })

  it('UNA SOLA PERSONA SIN FECHA basta para no poder decir «cubierto»', () => {
    // Con alguien de quien no se sabe si entra, «acreditado» afirmaría algo
    // sobre datos que no alcanzan.
    const c = coberturaDeSeleccion({
      personas: [persona('nueva', '2027-04-01'), persona('sin-fecha', null)],
      declaraciones: [declaracion('nueva')],
      exigibleDesde: DESDE,
    })
    expect(c.cubiertas).toBe(1)
    expect(c.indeterminadas).toHaveLength(1)
    expect(c.acreditado).toBe(false)
  })

  it('quien tiene impedimento no cuenta como cubierta ni como faltante', () => {
    const c = coberturaDeSeleccion({
      personas: [persona('x', '2027-04-01')],
      declaraciones: [declaracion('x', { sinInhabilitacionComercio: false })],
      exigibleDesde: DESDE,
    })
    expect(c.cubiertas).toBe(0)
    expect(c.faltantes).toEqual([])
    expect(c.conImpedimento).toHaveLength(1)
    expect(c.acreditado).toBe(false)
  })

  it('sin nadie alcanzado, acredita — y no porque haya cubierto a alguien', () => {
    const c = coberturaDeSeleccion({
      personas: [persona('vieja', '2020-01-01')],
      declaraciones: [],
      exigibleDesde: DESDE,
    })
    expect(c.alcanzadas).toBe(0)
    expect(c.acreditado).toBe(true)
  })
})
