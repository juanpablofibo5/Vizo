import { describe, expect, it } from 'vitest'
import {
  coherenciaDeLaRuta,
  fechaLimiteDeEntrega,
  periodoDeAuditoria,
} from '../../src/dominio/auditoria'

/**
 * Cap. XIV — DE LA AUDITORÍA (Arts. 42-45, 50 ¶1), dominio puro.
 *
 * Lo que protege: que el periodo largo del Art. 43 solo aplique al año de
 * cierre que en verdad le corresponde al inicio de operaciones —no a
 * cualquier año que se pida—, que sin esa fecha la función NO adivine sino
 * que devuelva una advertencia explícita (ADR-34), que la fecha límite nunca
 * caiga en fin de semana con o sin calendario, y que la ruta congelada
 * envejezca en vez de invalidarse cuando llega una evaluación de entidad
 * nueva (ADR-25/ADR-42).
 */

describe('periodoDeAuditoria', () => {
  it('Art. 42, periodo ordinario: quien ya operaba antes del primer periodo', () => {
    const p = periodoDeAuditoria({
      anio: 2028,
      primerPeriodoAnio: 2028,
      inicioDeOperaciones: '2015-01-01', // muy anterior al Transitorio Octavo
    })
    expect(p).toEqual({
      anio: 2028,
      inicio: '2028-01-01',
      fin: '2028-12-31',
      esPrimerPeriodoDeOperaciones: false,
      advertencia: null,
    })
  })

  it('Art. 43, periodo largo: inicio 15-may-2029 → 15-may-2029 a 31-dic-2030', () => {
    const p = periodoDeAuditoria({
      anio: 2030, // el año de CIERRE que le corresponde a este inicio
      primerPeriodoAnio: 2028,
      inicioDeOperaciones: '2029-05-15',
    })
    expect(p).toEqual({
      anio: 2030,
      inicio: '2029-05-15',
      fin: '2030-12-31',
      esPrimerPeriodoDeOperaciones: true,
      advertencia: null,
    })
  })

  it('un año DISTINTO al de cierre del Art. 43 no reabre el periodo largo: cae en el Art. 42 ordinario', () => {
    // Mismo obligado del caso anterior, un año después: 2031 ya es un
    // periodo ordinario, no una repetición del periodo largo.
    const p = periodoDeAuditoria({
      anio: 2031,
      primerPeriodoAnio: 2028,
      inicioDeOperaciones: '2029-05-15',
    })
    expect(p.esPrimerPeriodoDeOperaciones).toBe(false)
    expect(p).toEqual({
      anio: 2031,
      inicio: '2031-01-01',
      fin: '2031-12-31',
      esPrimerPeriodoDeOperaciones: false,
      advertencia: null,
    })
  })

  it('el año que el periodo largo ya cubre no es un periodo propio: lanza nombrando el de cierre', () => {
    // El Art. 43 SUSTITUYE el periodo del artículo anterior, no agrega uno.
    // Quien inició el 15-may-2029 no tiene un 2029 corto y un 2030 largo:
    // tiene uno solo. Contestar el ordinario dejaría abrir dos periodos
    // solapados sobre los mismos meses, y `un_periodo_por_anio` no lo
    // impediría porque son años distintos.
    expect(() =>
      periodoDeAuditoria({
        anio: 2029,
        primerPeriodoAnio: 2028,
        inicioDeOperaciones: '2029-05-15',
      }),
    ).toThrow(/2030/)
  })

  it('un año anterior al inicio de operaciones tampoco es un periodo', () => {
    expect(() =>
      periodoDeAuditoria({
        anio: 2028,
        primerPeriodoAnio: 2028,
        inicioDeOperaciones: '2029-05-15',
      }),
    ).toThrow(/Art\. 43/)
  })

  it('año anterior al primer periodo: no hay auditoría que abrir (Transitorio Octavo)', () => {
    expect(() =>
      periodoDeAuditoria({ anio: 2027, primerPeriodoAnio: 2028, inicioDeOperaciones: null }),
    ).toThrow(/2028/)
  })

  it('sin inicioDeOperaciones, en el año del primer periodo: ordinario CON advertencia, nunca adivina', () => {
    const p = periodoDeAuditoria({ anio: 2028, primerPeriodoAnio: 2028, inicioDeOperaciones: null })
    expect(p.anio).toBe(2028)
    expect(p.inicio).toBe('2028-01-01')
    expect(p.fin).toBe('2028-12-31')
    expect(p.esPrimerPeriodoDeOperaciones).toBe(false)
    expect(p.advertencia).not.toBeNull()
    expect(p.advertencia).toMatch(/no se sabe/)
  })

  it('sin inicioDeOperaciones, en un año POSTERIOR al primer periodo: ordinario SIN advertencia', () => {
    // Ya no es plausible que sea "su primer periodo": la duda solo aplica al
    // año exacto en que el Transitorio Octavo fija el primer cierre.
    const p = periodoDeAuditoria({ anio: 2029, primerPeriodoAnio: 2028, inicioDeOperaciones: null })
    expect(p.advertencia).toBeNull()
  })
})

describe('fechaLimiteDeEntrega', () => {
  it('sin calendario cargado, retrocede solo fin de semana: domingo 31-mar-2030 retrocede a viernes 29', () => {
    const r = fechaLimiteDeEntrega({
      periodoFin: '2029-12-31', // cierre 2029 → entrega en 2030
      mesEntrega: 3,
      diasInhabiles: [],
      calendarioCargado: false,
    })
    expect(r).toEqual({ fecha: '2030-03-29', conCalendario: false })
  })

  it('conCalendario es false cuando no hay calendario, aunque diasInhabiles llegue vacío por otra razón', () => {
    const r = fechaLimiteDeEntrega({
      periodoFin: '2029-12-31',
      mesEntrega: 3,
      diasInhabiles: [],
      calendarioCargado: false,
    })
    expect(r.conCalendario).toBe(false)
  })

  it('con calendario cargado, un día inhábil oficial retrocede MÁS que solo el fin de semana', () => {
    // El viernes 29 (a donde llegaría solo evitando fin de semana) está
    // marcado como inhábil: tiene que seguir retrocediendo hasta el jueves 28.
    const r = fechaLimiteDeEntrega({
      periodoFin: '2029-12-31',
      mesEntrega: 3,
      diasInhabiles: ['2030-03-29'],
      calendarioCargado: true,
    })
    expect(r).toEqual({ fecha: '2030-03-28', conCalendario: true })
  })

  it('nunca devuelve una fecha en fin de semana', () => {
    for (const periodoFin of ['2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31', '2030-12-31']) {
      const r = fechaLimiteDeEntrega({ periodoFin, mesEntrega: 3, diasInhabiles: [], calendarioCargado: false })
      const dow = new Date(`${r.fecha}T00:00:00Z`).getUTCDay()
      expect(dow).not.toBe(0)
      expect(dow).not.toBe(6)
    }
  })

  it('rechaza un mes de entrega fuera de 1-12: no es un umbral que se calcule con basura', () => {
    expect(() =>
      fechaLimiteDeEntrega({ periodoFin: '2029-12-31', mesEntrega: 13, diasInhabiles: [], calendarioCargado: false }),
    ).toThrow()
  })
})

describe('coherenciaDeLaRuta', () => {
  it('sobre la evaluación vigente: la ruta congelada sigue mirando al último hecho', () => {
    const c = coherenciaDeLaRuta({
      evaluacionDelPeriodoId: 'eval-1',
      rutaCongelada: 'interna_permitida',
      evaluacionVigenteId: 'eval-1',
      rutaVigente: 'interna_permitida',
    })
    expect(c).toEqual({ estado: 'sobre_la_evaluacion_vigente' })
  })

  it('sobre otra evaluación, pero la ruta NO cambiaría hoy', () => {
    const c = coherenciaDeLaRuta({
      evaluacionDelPeriodoId: 'eval-1',
      rutaCongelada: 'interna_permitida',
      evaluacionVigenteId: 'eval-2',
      rutaVigente: 'interna_permitida',
    })
    expect(c).toEqual({ estado: 'sobre_otra_evaluacion', rutaHoy: 'interna_permitida', cambiaria: false })
  })

  it('sobre otra evaluación, y la ruta SÍ cambiaría hoy — nunca "inválida", el artículo no lo dice', () => {
    const c = coherenciaDeLaRuta({
      evaluacionDelPeriodoId: 'eval-1',
      rutaCongelada: 'interna_permitida',
      evaluacionVigenteId: 'eval-2',
      rutaVigente: 'externa_obligatoria',
    })
    expect(c).toEqual({ estado: 'sobre_otra_evaluacion', rutaHoy: 'externa_obligatoria', cambiaria: true })
  })

  it('sin ninguna evaluación de entidad vigente, lanza: las evaluaciones son append-only, no desaparecen', () => {
    expect(() =>
      coherenciaDeLaRuta({
        evaluacionDelPeriodoId: 'eval-1',
        rutaCongelada: 'interna_permitida',
        evaluacionVigenteId: null,
        rutaVigente: null,
      }),
    ).toThrow(/append-only/)
  })
})
