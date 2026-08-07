import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DatosDeClienteInvalidos,
  PARTICIPACION_BENEFICIARIO_PCT,
  PATRON_CURP,
  PATRON_RFC_FISICA,
  PATRON_RFC_MORAL,
  prepararAltaCliente,
  prepararBeneficiario,
  requiereBeneficiario,
} from '../../src/dominio/clientes'

/**
 * El alta de clientes: la primera frontera de entrada humana del sistema.
 *
 * Regla dura 6: un RFC mal capturado no revienta nada. Se guarda, y meses
 * después el portal rechaza el aviso o —peor— la acumulación no reconoce al
 * mismo cliente y se omite un aviso.
 */
describe('Alta de clientes', () => {
  /**
   * La fuente de verdad de estos formatos es el XSD oficial, no este archivo.
   * Si el SAT publica un XSD con otros patrones, este test falla y obliga a
   * revisarlos en vez de dejarlos desactualizados en silencio.
   */
  describe('los patrones vienen del XSD oficial', () => {
    const xsd = readFileSync('regulatorio/xsd/din.xsd', 'utf8')

    const patronDelXsd = (tipo: string): string => {
      const bloque = new RegExp(
        `<xsd:simpleType name="${tipo}">[\\s\\S]*?<xsd:pattern value="([^"]+)"`,
      ).exec(xsd)
      if (!bloque?.[1]) throw new Error(`No se encontró ${tipo} en el XSD`)
      // El XSD guarda `&amp;` donde el patrón lleva `&`.
      return bloque[1].replace(/&amp;/g, '&')
    }

    it.each([
      ['rfc_fisica_type', PATRON_RFC_FISICA],
      ['rfc_moral_type', PATRON_RFC_MORAL],
      ['curp_type', PATRON_CURP],
    ])('%s coincide con el patrón del código', (tipo, patronCodigo) => {
      expect(patronCodigo.source).toBe(`^${patronDelXsd(tipo)}$`)
    })
  })

  describe('persona física', () => {
    const base = {
      tipoPersona: 'fisica' as const,
      nombreORazonSocial: 'José Ramírez Ñuño',
      nombrePila: 'José',
      apellidoPaterno: 'Ramírez',
      apellidoMaterno: 'Ñuño',
      rfc: 'RANJ800101AB1',
    }

    it('normaliza el RFC capturado con espacios y guiones', () => {
      const c = prepararAltaCliente({ ...base, rfc: ' ranj-800101-ab1 ' })
      expect(c.rfc).toBe('RANJ800101AB1')
    })

    it('colapsa espacios del nombre', () => {
      const c = prepararAltaCliente({ ...base, nombreORazonSocial: '  José   Ramírez  Ñuño ' })
      expect(c.nombreORazonSocial).toBe('José Ramírez Ñuño')
    })

    it('exige nombre y apellido paterno por separado: el aviso los pide así', () => {
      expect(() => prepararAltaCliente({ ...base, nombrePila: '' })).toThrow(/nombre de pila/)
      expect(() => prepararAltaCliente({ ...base, apellidoPaterno: '  ' })).toThrow(
        /apellido paterno/,
      )
    })

    it('rechaza un RFC de persona MORAL en una persona física', () => {
      // 3 letras en vez de 4: es el formato de moral. Validar contra el patrón
      // equivocado dejaría pasar RFC inválidos al aviso.
      expect(() => prepararAltaCliente({ ...base, rfc: 'RAN800101AB1' })).toThrow(
        /formato de persona fisica/,
      )
    })

    it('acepta una persona física identificada solo con CURP', () => {
      const c = prepararAltaCliente({
        ...base,
        rfc: undefined,
        curp: 'RANJ800101HDFMXX01',
      })
      expect(c.curp).toBe('RANJ800101HDFMXX01')
      expect(c.requiereRevisionIdentidad).toBe(false)
    })

    it('un extranjero sin RFC ni CURP queda marcado para revisión humana', () => {
      const c = prepararAltaCliente({
        tipoPersona: 'fisica',
        nombreORazonSocial: 'John Smith',
        nombrePila: 'John',
        apellidoPaterno: 'Smith',
        nacionalidad: 'US',
        identidadAlterna: { tipo_doc: 'pasaporte', numero: 'US123456789', pais: 'US' },
      })
      // El motor acumulará conservadoramente y escalará a un humano (caso A-05).
      expect(c.requiereRevisionIdentidad).toBe(true)
    })

    it('sin ninguna clave de identidad no se puede dar de alta', () => {
      expect(() =>
        prepararAltaCliente({ ...base, rfc: undefined, curp: undefined }),
      ).toThrow(/RFC, CURP o un documento de identidad alterno/)
    })
  })

  describe('persona moral', () => {
    const base = {
      tipoPersona: 'moral' as const,
      nombreORazonSocial: 'Desarrollos Península SA de CV',
      rfc: 'DPE010101AAA',
    }

    it('acepta el RFC de 3 letras', () => {
      expect(prepararAltaCliente(base).rfc).toBe('DPE010101AAA')
    })

    it('rechaza un RFC de persona física en una moral', () => {
      expect(() => prepararAltaCliente({ ...base, rfc: 'DPEX010101AAA' })).toThrow(
        /formato de persona moral/,
      )
    })

    it('no le exige apellidos', () => {
      expect(() => prepararAltaCliente(base)).not.toThrow()
    })
  })

  describe('reporta TODOS los problemas juntos', () => {
    it('quien captura no debería descubrir los errores de uno en uno', () => {
      try {
        prepararAltaCliente({
          tipoPersona: 'fisica',
          nombreORazonSocial: '',
          rfc: 'NOESUNRFC',
          curp: 'TAMPOCO',
          nacionalidad: 'MEXICO',
        })
        expect.unreachable('debió lanzar')
      } catch (e) {
        expect(e).toBeInstanceOf(DatosDeClienteInvalidos)
        const { problemas } = e as DatosDeClienteInvalidos
        expect(problemas.length).toBeGreaterThanOrEqual(4)
        expect(problemas.join(' ')).toMatch(/nombre/)
        expect(problemas.join(' ')).toMatch(/RFC/)
        expect(problemas.join(' ')).toMatch(/CURP/)
        expect(problemas.join(' ')).toMatch(/código de país/)
      }
    })
  })

  describe('beneficiario controlador', () => {
    it('el umbral de participación es 25%, no 50%: cambió con la reforma de 2025', () => {
      expect(PARTICIPACION_BENEFICIARIO_PCT).toBe(25)
    })

    it('personas morales y fideicomisos lo requieren', () => {
      expect(requiereBeneficiario('moral')).toBe(true)
      expect(requiereBeneficiario('fideicomiso')).toBe(true)
      expect(requiereBeneficiario('fisica')).toBe(false)
    })

    it('acepta control efectivo SIN porcentaje: se puede controlar sin acciones', () => {
      const b = prepararBeneficiario({
        nombre: 'María Fernández',
        controlPor: 'control_efectivo',
        esDeclaracion: false,
      })
      expect(b.participacionPct).toBeUndefined()
    })

    it('si el control es por participación, exige el porcentaje', () => {
      expect(() =>
        prepararBeneficiario({
          nombre: 'María Fernández',
          controlPor: 'participacion',
          esDeclaracion: false,
        }),
      ).toThrow(/porcentaje/)
    })

    it('no rechaza participaciones menores al 25%', () => {
      // El umbral obliga a identificar, pero declarar de más no es un error:
      // el control puede ejercerse por otras vías.
      const b = prepararBeneficiario({
        nombre: 'Socio minoritario',
        participacionPct: 10,
        controlPor: 'participacion',
        esDeclaracion: false,
      })
      expect(b.participacionPct).toBe(10)
    })

    it('rechaza porcentajes imposibles', () => {
      for (const pct of [-1, 101]) {
        expect(() =>
          prepararBeneficiario({
            nombre: 'X',
            participacionPct: pct,
            controlPor: 'participacion',
            esDeclaracion: false,
          }),
        ).toThrow(/entre 0 y 100/)
      }
    })

    it('la declaración de que NO existe beneficiario también es válida', () => {
      const b = prepararBeneficiario({
        nombre: '',
        controlPor: 'control_efectivo',
        esDeclaracion: true,
      })
      expect(b.esDeclaracion).toBe(true)
    })
  })
})
