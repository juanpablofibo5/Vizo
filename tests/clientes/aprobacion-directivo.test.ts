import { describe, expect, it } from 'vitest'
import {
  actosSinConsentir,
  consiente,
  exigenciaDeAprobacion,
  viaQueCorresponde,
  type AprobacionAsentada,
  type SituacionPep,
  type SituacionRiesgo,
} from '../../src/dominio/aprobacion-directivo'

const PEP_SI: SituacionPep = { conocida: true, catalogado: true }
const PEP_NO: SituacionPep = { conocida: true, catalogado: false }
const PEP_NA: SituacionPep = { conocida: false }

const ALTO: SituacionRiesgo = { conocida: true, esAlto: true, vencida: false }
const NO_ALTO: SituacionRiesgo = { conocida: true, esAlto: false, vencida: false }
const RIESGO_NA: SituacionRiesgo = { conocida: false }

const exigencia = (pep: SituacionPep, riesgo: SituacionRiesgo) =>
  exigenciaDeAprobacion({ pep, riesgo })

/**
 * El disparador del Art. 23 Ter 5.
 *
 * Lo que estas pruebas protegen es que «todavía no se sabe» nunca se colapse a
 * «no se requiere». Si alguien alguna vez cambia la conjunción por un `&&` de
 * dos booleanos, la mitad de estos casos muere.
 */
describe('La conjunción del Art. 23 Ter 5, celda por celda', () => {
  it('PEP y grado alto: exigible — es el único sí de la tabla', () => {
    expect(exigencia(PEP_SI, ALTO)).toEqual({ estado: 'exigible', conGradoVencido: false })
  })

  it('PEP pero no de grado alto: no exigible', () => {
    expect(exigencia(PEP_SI, NO_ALTO)).toEqual({
      estado: 'no_exigible',
      porque: 'no_es_grado_alto',
    })
  })

  it('grado alto pero declaró que no es PEP: no exigible', () => {
    expect(exigencia(PEP_NO, ALTO)).toEqual({ estado: 'no_exigible', porque: 'no_es_pep' })
  })

  it('ninguna de las dos: no exigible', () => {
    expect(exigencia(PEP_NO, NO_ALTO).estado).toBe('no_exigible')
  })

  it('EL HUECO: es PEP y nadie lo ha clasificado — no es «no se requiere»', () => {
    expect(exigencia(PEP_SI, RIESGO_NA)).toEqual({
      estado: 'indeterminable',
      falta: ['grado_de_riesgo'],
    })
  })

  it('EL HUECO: es de grado alto y no hay declaración PEP', () => {
    expect(exigencia(PEP_NA, ALTO)).toEqual({
      estado: 'indeterminable',
      falta: ['caracter_pep'],
    })
  })

  it('EL HUECO doble: no se sabe ninguna de las dos, y lo dice completo', () => {
    expect(exigencia(PEP_NA, RIESGO_NA)).toEqual({
      estado: 'indeterminable',
      falta: ['caracter_pep', 'grado_de_riesgo'],
    })
  })

  it('un falso definitivo cierra la conjunción aunque falte la otra mitad', () => {
    // El caso que sorprende y es correcto: si consta que no es de grado alto,
    // el artículo no aplica aunque nadie sepa si es PEP. No tapa nada — la
    // declaración PEP que falta se señala por su cuenta, en su sección.
    expect(exigencia(PEP_NA, NO_ALTO)).toEqual({
      estado: 'no_exigible',
      porque: 'no_es_grado_alto',
    })
    expect(exigencia(PEP_NO, RIESGO_NA)).toEqual({ estado: 'no_exigible', porque: 'no_es_pep' })
  })
})

describe('Un dato vencido nunca reduce la obligación', () => {
  it('un grado alto vencido sigue exigiendo la aprobación, y lo dice', () => {
    const r = exigencia(PEP_SI, { conocida: true, esAlto: true, vencida: true })
    expect(r).toEqual({ estado: 'exigible', conGradoVencido: true })
  })

  it('un grado NO alto vencido deja de ser un «no» que se pueda oponer', () => {
    // Caducar no degrada a nadie, pero tampoco sostiene un «no se requiere»:
    // el Art. 23 Bis 1 declaró viejo ese dato al vencer los seis meses.
    expect(exigencia(PEP_SI, { conocida: true, esAlto: false, vencida: true })).toEqual({
      estado: 'indeterminable',
      falta: ['grado_vencido'],
    })
  })

  it('y si además no hay declaración PEP, el hueco nombra las dos mitades', () => {
    expect(exigencia(PEP_NA, { conocida: true, esAlto: false, vencida: true })).toEqual({
      estado: 'indeterminable',
      falta: ['caracter_pep', 'grado_vencido'],
    })
  })
})

const POSTERIOR = (ops: string[]): AprobacionAsentada => ({
  id: 'ap-post',
  momento: 'posterior',
  fechaAprobacion: '2027-04-10',
  operacionesConsentidas: ops,
})

const PREVIA: AprobacionAsentada = {
  id: 'ap-prev',
  momento: 'previa',
  fechaAprobacion: '2027-04-10',
  vigenteHasta: '2027-12-31',
}

describe('Qué actos quedaron consentidos', () => {
  it('la posterior consiente exactamente los que nombra', () => {
    const ap = POSTERIOR(['op-1'])
    expect(consiente(ap, { id: 'op-1', fecha: '2027-03-20' })).toBe(true)
    expect(consiente(ap, { id: 'op-2', fecha: '2027-03-20' })).toBe(false)
  })

  it('la previa consiente por ventana, y no hacia atrás', () => {
    // Un acto anterior a la firma no fue consentido «previamente» por ella.
    expect(consiente(PREVIA, { id: 'x', fecha: '2027-04-09' })).toBe(false)
    expect(consiente(PREVIA, { id: 'x', fecha: '2027-04-10' })).toBe(true)
    expect(consiente(PREVIA, { id: 'x', fecha: '2027-12-31' })).toBe(true)
    expect(consiente(PREVIA, { id: 'x', fecha: '2028-01-01' })).toBe(false)
  })

  it('una previa sin plazo bendeciría todo: por eso el plazo es un campo', () => {
    // No hay forma de construir una AprobacionAsentada previa sin vigenteHasta
    // —el tipo lo exige, y la base también—, así que la única manera de
    // consentir «para siempre» es que alguien elija una fecha lejana y quede
    // asentada con su nombre.
    const lejana: AprobacionAsentada = { ...PREVIA, vigenteHasta: '2099-12-31' }
    expect(consiente(lejana, { id: 'x', fecha: '2050-06-01' })).toBe(true)
  })

  it('los actos sin consentir son los que ninguna aprobación cubre', () => {
    const actos = [
      { id: 'op-1', fecha: '2027-03-20' },
      { id: 'op-2', fecha: '2027-04-15' },
      { id: 'op-3', fecha: '2028-02-01' },
    ]
    const sin = actosSinConsentir({ actos, aprobaciones: [POSTERIOR(['op-1']), PREVIA] })
    expect(sin.map((a) => a.id)).toEqual(['op-3'])
  })

  it('sin ninguna aprobación, ningún acto queda consentido', () => {
    const actos = [{ id: 'op-1', fecha: '2027-03-20' }]
    expect(actosSinConsentir({ actos, aprobaciones: [] })).toEqual(actos)
  })
})

describe('La rama no se elige: la impone qué es el obligado', () => {
  it('persona física: la constancia que subsana (¶2)', () => {
    expect(viaQueCorresponde('fisica')).toBe('constancia_persona_fisica')
  })

  it('moral, fideicomiso y figura jurídica: la firma de un directivo (¶1)', () => {
    for (const tipo of ['moral', 'fideicomiso', 'figura_juridica']) {
      expect(viaQueCorresponde(tipo)).toBe('directivo')
    }
  })
})
