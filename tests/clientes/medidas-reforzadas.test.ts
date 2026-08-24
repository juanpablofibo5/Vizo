import { describe, expect, it } from 'vitest'
import {
  exigenciaDeMedidas,
  fraccionQueCorresponde,
  problemasDeLasMedidas,
  type MedidasACapturar,
} from '../../src/dominio/medidas-reforzadas'

/**
 * El Art. 23 Ter 4, como función pura.
 *
 * Dos celdas concentran el riesgo: que a un fideicomiso se le asigne una
 * fracción por parecido —el artículo solo nombra físicas y morales—, y que la
 * consulta a la Secretaría de Economía se lea como opcional cuando el texto
 * dice «DEBIENDO consultar».
 */

const ALTO = { conocida: true as const, esAlto: true, vencida: false }

describe('qué fracción le toca a cada cliente', () => {
  it('física → fr. I; moral → fr. II', () => {
    expect(fraccionQueCorresponde('fisica')).toBe('fisica')
    expect(fraccionQueCorresponde('moral')).toBe('moral')
  })

  it('EL ARTÍCULO NO NOMBRA FIDEICOMISOS NI OTRAS FIGURAS: no se les inventa una', () => {
    expect(fraccionQueCorresponde('fideicomiso')).toBeNull()
    expect(fraccionQueCorresponde('figura_juridica')).toBeNull()
  })

  it('y con grado alto eso sale como «sin fracción», no como exigible ni como no exigible', () => {
    expect(exigenciaDeMedidas({ grado: ALTO, tipoPersona: 'fideicomiso' })).toEqual({
      estado: 'sin_fraccion',
      tipoPersona: 'fideicomiso',
    })
  })

  it('sin clasificar no es «no se exige»', () => {
    expect(exigenciaDeMedidas({ grado: { conocida: false }, tipoPersona: 'fisica' })).toEqual({
      estado: 'indeterminable',
      falta: 'grado_de_riesgo',
    })
  })

  it('un grado alto vencido sigue exigiendo', () => {
    expect(
      exigenciaDeMedidas({
        grado: { conocida: true, esAlto: true, vencida: true },
        tipoPersona: 'moral',
      }),
    ).toEqual({ estado: 'exigible', fraccion: 'moral', conGradoVencido: true })
  })
})

const fisica: MedidasACapturar = {
  fechaAdopcion: '2027-04-10',
  medidasOrigenDestino: 'Estados de cuenta de seis meses y carta del notario.',
  manualPreveVinculadas: false,
}

const moral: MedidasACapturar = {
  fechaAdopcion: '2027-04-10',
  informacionAccionistas: 'Libro de accionistas y acta de asamblea.',
  consultaSeFecha: '2027-04-09',
  consultaSeResultado: 'Coinciden los tres socios declarados.',
}

describe('qué le falta a las medidas', () => {
  it('la fr. I completa no tiene problemas', () => {
    expect(problemasDeLasMedidas({ fraccion: 'fisica', aplicaPepExtranjera: false, datos: fisica })).toEqual([])
  })

  it('fr. I b): NO exige personas, exige que alguien haya DECIDIDO si las hay', () => {
    // «en su caso» y «en los términos que prevean en su Manual»: la ausencia
    // sin decisión es un olvido disfrazado de cumplimiento.
    const sinDecidir = { ...fisica, manualPreveVinculadas: undefined }
    expect(problemasDeLasMedidas({ fraccion: 'fisica', aplicaPepExtranjera: false, datos: sinDecidir }))
      .toHaveLength(1)
    // Decidir que NO lo prevé es una respuesta válida.
    expect(problemasDeLasMedidas({ fraccion: 'fisica', aplicaPepExtranjera: false, datos: fisica }))
      .toEqual([])
  })

  it('si el Manual SÍ lo prevé pero no hay nadie, falta', () => {
    const p = problemasDeLasMedidas({
      fraccion: 'fisica', aplicaPepExtranjera: false,
      datos: { ...fisica, manualPreveVinculadas: true, personasVinculadas: [] },
    })
    expect(p.join(' ')).toContain('no se registró ninguna persona vinculada')
  })

  it('la fr. II completa no tiene problemas', () => {
    expect(problemasDeLasMedidas({ fraccion: 'moral', aplicaPepExtranjera: false, datos: moral })).toEqual([])
  })

  it('«DEBIENDO CONSULTAR» NO ES OPCIONAL: sin la consulta a la SE, falta', () => {
    const p = problemasDeLasMedidas({
      fraccion: 'moral', aplicaPepExtranjera: false,
      datos: { ...moral, consultaSeFecha: undefined },
    })
    expect(p.join(' ')).toContain('Secretaría de Economía')
  })

  it('fr. III: la PEP extranjera pide DOCUMENTACIÓN, no solo datos', () => {
    const p = problemasDeLasMedidas({
      fraccion: 'fisica', aplicaPepExtranjera: true,
      datos: {
        ...fisica,
        documentacionPepExtranjera: 'Pasaporte y comprobante de domicilio',
        manualPreveVinculadas: true,
        personasVinculadas: [
          { vinculo: 'conyuge', nombre: 'Ana', datosObtenidos: true, documentacionObtenida: true },
          { vinculo: 'dependiente_economico', nombre: 'Luis', datosObtenidos: true, documentacionObtenida: false },
        ],
      },
    })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('Luis')
    expect(p[0]).toContain('DOCUMENTACIÓN')
  })

  it('y sin la documentación adicional del artículo tampoco pasa', () => {
    const p = problemasDeLasMedidas({
      fraccion: 'fisica', aplicaPepExtranjera: true, datos: fisica,
    })
    expect(p.join(' ')).toContain('fr. III')
  })
})
