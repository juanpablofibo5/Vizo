import { describe, expect, it } from 'vitest'
import {
  coberturaDelCuestionario,
  exigenciaDeCuestionario,
  problemasDelCuestionario,
  type CuestionarioACapturar,
  type CuestionarioAsentado,
} from '../../src/dominio/cuestionario'

/**
 * El Art. 23 Ter 3, como función pura.
 *
 * Lo que estas pruebas protegen es lo mismo que en el 23 Ter 5 por otra
 * puerta: que «no se sabe» no colapse a «no se exige», y que un grado alto
 * VENCIDO no se lea como si el cliente hubiera dejado de ser de riesgo alto.
 */

const base: CuestionarioACapturar = {
  modalidad: 'presencial',
  fechaAplicacion: '2027-04-10',
  actividadPreponderante: 'Comercio al por mayor',
  origenRecursos: 'Venta de un inmueble previo',
  destinoRecursos: 'Adquisición de vivienda',
  actosQueRealiza: 'Una compraventa en 2027',
  actosQuePretende: 'Dos más en el año',
  suscritoPor: 'Ricardo Nava',
}

describe('cuándo el Art. 23 Ter 3 exige cuestionario', () => {
  it('grado alto: exigible', () => {
    expect(exigenciaDeCuestionario({ conocida: true, esAlto: true, vencida: false })).toEqual({
      estado: 'exigible',
      conGradoVencido: false,
    })
  })

  it('grado no alto: no exigible, y dice por qué', () => {
    expect(exigenciaDeCuestionario({ conocida: true, esAlto: false, vencida: false })).toEqual({
      estado: 'no_exigible',
      porque: 'no_es_grado_alto',
    })
  })

  it('SIN CLASIFICAR NO ES «NO SE EXIGE»: es que no se puede saber', () => {
    expect(exigenciaDeCuestionario({ conocida: false })).toEqual({
      estado: 'indeterminable',
      falta: 'grado_de_riesgo',
    })
  })

  it('un grado alto VENCIDO sigue exigiendo — la caducidad no borra la clasificación', () => {
    // Leer «vencido» como «ya no es alto» convertiría un plazo incumplido del
    // Art. 23 Bis 1 en una obligación menos del Art. 23 Ter 3.
    expect(exigenciaDeCuestionario({ conocida: true, esAlto: true, vencida: true })).toEqual({
      estado: 'exigible',
      conGradoVencido: true,
    })
  })

  it('y un grado NO alto vencido tampoco lo vuelve exigible', () => {
    expect(exigenciaDeCuestionario({ conocida: true, esAlto: false, vencida: true }).estado).toBe(
      'no_exigible',
    )
  })
})

describe('qué le falta a un cuestionario', () => {
  it('el del piso completo, presencial, no tiene problemas', () => {
    expect(problemasDelCuestionario(base)).toEqual([])
  })

  it('¶3: el REMOTO sin Firma Electrónica no pasa', () => {
    const p = problemasDelCuestionario({ ...base, modalidad: 'remoto_digital' })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('Firma Electrónica')
  })

  it('pero el PRESENCIAL sin firma electrónica SÍ pasa: lleva autógrafa', () => {
    // El «los cuales» del ¶3 se refiere a los medios digitales, no al
    // cuestionario. Exigirla en el presencial sería inventar una obligación.
    expect(problemasDelCuestionario({ ...base, modalidad: 'presencial' })).toEqual([])
  })

  it('el remoto CON firma pasa', () => {
    expect(
      problemasDelCuestionario({
        ...base,
        modalidad: 'remoto_digital',
        firma: { hashSha256: 'a'.repeat(64), archivo: 'c.pdf', tamanoBytes: 10, mime: 'application/pdf' },
      }),
    ).toEqual([])
  })

  it('los cinco temas del piso se reclaman UNO POR UNO, no de a uno', () => {
    const p = problemasDelCuestionario({
      ...base,
      actividadPreponderante: '  ',
      origenRecursos: '',
      destinoRecursos: '',
      actosQueRealiza: '',
      actosQuePretende: '',
    })
    expect(p).toHaveLength(5)
    expect(p.join(' ')).toContain('actividad preponderante')
    expect(p.join(' ')).toContain('pretende llevar a cabo')
  })

  it('una huella que no es SHA-256 se rechaza', () => {
    const p = problemasDelCuestionario({
      ...base,
      firma: { hashSha256: 'pendiente', archivo: 'c.pdf', tamanoBytes: 10, mime: 'application/pdf' },
    })
    expect(p.join(' ')).toContain('SHA-256')
  })
})

describe('a qué clasificación responde el cuestionario', () => {
  const q = (evaluacionRiesgoId: string): CuestionarioAsentado =>
    ({ ...base, id: 'c1', evaluacionRiesgoId, firma: null, respuestasDelManual: {},
       aplicadoPor: 'Ana', registradoEn: '2027-04-10T12:00:00Z' }) as CuestionarioAsentado

  it('sin cuestionario lo dice', () => {
    expect(coberturaDelCuestionario({ ultimo: null, evaluacionVigenteId: 'e1' })).toEqual({
      estado: 'sin_cuestionario',
    })
  })

  it('si cita la clasificación vigente, cubre', () => {
    expect(
      coberturaDelCuestionario({ ultimo: q('e1'), evaluacionVigenteId: 'e1' }).estado,
    ).toBe('cubierto')
  })

  it('si cita OTRA, se dice el hecho — y NO se le llama «vencido»', () => {
    // El artículo no da plazo de vigencia. Llamarlo vencido sería escribir una
    // regla que nadie promulgó; enseñar el hecho deja el juicio a quien lo tiene.
    const c = coberturaDelCuestionario({ ultimo: q('e1'), evaluacionVigenteId: 'e2' })
    expect(c.estado).toBe('sobre_otra_clasificacion')
    expect(JSON.stringify(c)).not.toContain('vencid')
  })
})
