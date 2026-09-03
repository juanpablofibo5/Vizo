import { describe, expect, it } from 'vitest'
import {
  NumeralDelPisoDesconocido,
  pisoDelBeneficiario,
  type IdentidadDelBeneficiario,
} from '../../src/dominio/piso-beneficiario'

/**
 * El piso del Art. 12 fr. VII ¶2.
 *
 * Lo que protegen: que los numerales lleguen de fuera, que el ix) se cumpla
 * con CURP **o** RFC —el texto los nombra juntos y condicionados— y que un
 * numeral que este módulo no sepa leer detenga en vez de darse por cubierto.
 */

const NUMERALES = ['i', 'ii', 'iv', 'ix']
const ETIQUETAS = {
  i: 'Nombre y apellidos',
  ii: 'Fecha de nacimiento',
  iv: 'País de nacionalidad',
  ix: 'CURP o RFC',
}

const identidad = (p: Partial<IdentidadDelBeneficiario> = {}): IdentidadDelBeneficiario => ({
  id: 'b1',
  nombre: 'Persona Identificada',
  rfc: null,
  curp: null,
  fechaNacimiento: null,
  nacionalidad: null,
  ...p,
})

describe('El piso de datos del Beneficiario Controlador', () => {
  it('con los cuatro datos, completo', () => {
    const p = pisoDelBeneficiario({
      identidad: identidad({ fechaNacimiento: '1980-01-15', nacionalidad: 'MX', curp: 'XXXX' }),
      numerales: NUMERALES,
      etiquetas: ETIQUETAS,
    })
    expect(p.completo).toBe(true)
    expect(p.datos).toHaveLength(4)
  })

  it('nombra el que falta con la etiqueta del catálogo, no con el número pelón', () => {
    const p = pisoDelBeneficiario({
      identidad: identidad({ nacionalidad: 'MX', curp: 'XXXX' }),
      numerales: NUMERALES,
      etiquetas: ETIQUETAS,
    })
    expect(p.completo).toBe(false)
    expect(p.datos.filter((d) => !d.presente).map((d) => d.etiqueta)).toEqual([
      'Fecha de nacimiento',
    ])
  })

  it('EL IX) SE CUMPLE CON CURP O CON RFC: el texto los nombra juntos', () => {
    // «Clave Única de Registro de Población y la clave del Registro Federal de
    // Contribuyentes, CUANDO CUENTE CON ELLAS». Exigir las dos sería inventar
    // un requisito que el numeral no pone.
    const base = { fechaNacimiento: '1980-01-15', nacionalidad: 'MX' }
    for (const solo of [{ curp: 'XXXX' }, { rfc: 'YYYY' }]) {
      const p = pisoDelBeneficiario({
        identidad: identidad({ ...base, ...solo }),
        numerales: NUMERALES,
        etiquetas: ETIQUETAS,
      })
      expect(p.completo).toBe(true)
    }
  })

  it('LOS NUMERALES LLEGAN DE FUERA: con otra lista, cambia lo que se exige', () => {
    // El día que el catálogo diga otra cosa, este módulo obedece sin tocarse.
    const p = pisoDelBeneficiario({
      identidad: identidad(),
      numerales: ['i'],
      etiquetas: ETIQUETAS,
    })
    expect(p.completo).toBe(true)
  })

  it('un numeral que no sabe leer DETIENE, no se da por cubierto', () => {
    expect(() =>
      pisoDelBeneficiario({
        identidad: identidad(),
        numerales: ['i', 'vii'],
        etiquetas: ETIQUETAS,
      }),
    ).toThrow(NumeralDelPisoDesconocido)
  })

  it('un nombre en blanco no cubre el i)', () => {
    const p = pisoDelBeneficiario({
      identidad: identidad({ nombre: '   ' }),
      numerales: ['i'],
      etiquetas: ETIQUETAS,
    })
    expect(p.completo).toBe(false)
  })
})
