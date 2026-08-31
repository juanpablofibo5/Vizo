import { describe, expect, it } from 'vitest'
import {
  coberturaDelPeriodo,
  ingresosSinCapacitar,
  plantillaDelPeriodo,
  type PersonaEnPlantilla,
  type SesionImpartida,
} from '../../src/dominio/capacitacion'

/**
 * El Cap. XII, como función pura.
 *
 * Lo que protegen: que ASISTIR no se confunda con ACREDITAR —el ¶2 del Art. 39
 * Bis 1 ata la constancia a una evaluación satisfactoria—, que los cinco temas
 * del artículo se exijan uno por uno, y que quien entró y salió a media año
 * siga contando.
 */

const persona = (
  id: string,
  rol: PersonaEnPlantilla['rol'],
  ingreso = '2027-01-01',
  baja: string | null = null,
): PersonaEnPlantilla => ({ id, nombre: `Persona ${id}`, rol, ingresoAlArea: ingreso, bajaDelArea: baja })

const sesion = (v: Partial<SesionImpartida>): SesionImpartida => ({
  id: 's1',
  titulo: 'Curso anual',
  fecha: '2027-03-01',
  temas: ['marco_normativo', 'manual_politicas', 'actos_articulo_17', 'riesgos_del_obligado', 'tecnicas_400_bis'],
  instructorNombre: 'Instructora',
  instructorAniosExperiencia: 8,
  acreditaConDocumento: true,
  asistentes: [],
  conConstancia: [],
  ...v,
})

describe('quién tenía que capacitarse en el periodo', () => {
  it('quien entró en marzo y salió en septiembre CUENTA', () => {
    // Excluirlo por no estar el 31 de diciembre dejaría el hueco justo donde el
    // ¶3 pone el acento: el ingreso al área.
    const p = [persona('a', 'atencion_publico', '2027-03-01', '2027-09-30')]
    expect(plantillaDelPeriodo(p, 2027)).toHaveLength(1)
  })

  it('quien salió ANTES del periodo no cuenta', () => {
    expect(plantillaDelPeriodo([persona('a', 'directivo', '2025-01-01', '2026-12-31')], 2027)).toEqual([])
  })

  it('quien entra DESPUÉS del periodo tampoco', () => {
    expect(plantillaDelPeriodo([persona('a', 'directivo', '2028-02-01')], 2027)).toEqual([])
  })
})

describe('la cobertura del periodo anual', () => {
  it('con todo cubierto, acredita', () => {
    const c = coberturaDelPeriodo({
      anio: 2027,
      personas: [persona('a', 'rec')],
      sesiones: [sesion({ asistentes: ['a'], conConstancia: ['a'] })],
      experienciaMinima: 5,
    })
    expect(c.acreditado).toBe(true)
    expect(c.temasFaltantes).toEqual([])
  })

  it('SIN NINGUNA SESIÓN no acredita, y el motivo es que faltan los cinco temas', () => {
    // La fr. I pide cursos «por lo menos una vez al año», pero eso no necesita
    // una guarda propia: los temas SALEN de las sesiones, así que sin ninguna
    // faltan los cinco. Una condición `sesiones.length > 0` en la conjunción
    // era lógica muerta —quitarla no rompía nada— y se eliminó.
    const c = coberturaDelPeriodo({ anio: 2027, personas: [], sesiones: [], experienciaMinima: 5 })
    expect(c.acreditado).toBe(false)
    expect(c.temasFaltantes).toHaveLength(5)
    // Y el hecho se conserva por separado, porque la pantalla necesita
    // distinguir «no se impartió nada» de «se impartió y faltan temas».
    expect(c.huboAlgunaSesion).toBe(false)
  })

  it('ASISTIR NO ES ACREDITAR: sin constancia, la persona sigue faltando', () => {
    // El ¶2 del 39 Bis 1 ata la constancia a una evaluación satisfactoria.
    // Contar asistencias diría que basta con sentarse en la sala.
    const c = coberturaDelPeriodo({
      anio: 2027,
      personas: [persona('a', 'atencion_publico')],
      sesiones: [sesion({ asistentes: ['a'], conConstancia: [] })],
      experienciaMinima: 5,
    })
    expect(c.acreditado).toBe(false)
    expect(c.personasFaltantes).toEqual([
      { personaId: 'a', nombre: 'Persona a', rol: 'atencion_publico', motivo: 'sin_constancia' },
    ])
  })

  it('y quien ni asistió sale con otro motivo', () => {
    const c = coberturaDelPeriodo({
      anio: 2027,
      personas: [persona('a', 'auditoria')],
      sesiones: [sesion({})],
      experienciaMinima: 5,
    })
    expect(c.personasFaltantes[0]?.motivo).toBe('sin_sesion')
  })

  it('los cinco temas se reclaman UNO POR UNO, con su inciso', () => {
    const c = coberturaDelPeriodo({
      anio: 2027,
      personas: [],
      sesiones: [sesion({ temas: ['marco_normativo'] })],
      experienciaMinima: 5,
    })
    expect(c.temasFaltantes).toHaveLength(4)
    expect(c.temasFaltantes.map((t) => t.fundamento)).toEqual([
      'Art. 39 Bis fr. I inciso b)',
      'Art. 39 Bis fr. I inciso c)',
      'Art. 39 Bis fr. I inciso d)',
      'Art. 39 Bis fr. II',
    ])
  })

  it('varias sesiones SUMAN sus temas: el artículo pide cubrirlos, no en un solo curso', () => {
    const c = coberturaDelPeriodo({
      anio: 2027,
      personas: [],
      sesiones: [
        sesion({ id: 's1', temas: ['marco_normativo', 'manual_politicas'] }),
        sesion({ id: 's2', temas: ['actos_articulo_17', 'riesgos_del_obligado', 'tecnicas_400_bis'] }),
      ],
      experienciaMinima: 5,
    })
    expect(c.temasFaltantes).toEqual([])
  })
})

describe('la fr. III: contar Y acreditar', () => {
  it('un instructor con menos años del catálogo no acredita', () => {
    const c = coberturaDelPeriodo({
      anio: 2027, personas: [],
      sesiones: [sesion({ instructorAniosExperiencia: 3 })],
      experienciaMinima: 5,
    })
    expect(c.instructoresSinAcreditar[0]?.motivo).toBe('anios_insuficientes')
  })

  it('DECLARAR LOS AÑOS SIN DOCUMENTO cumple una sola de las dos cosas', () => {
    // «deberá CONTAR Y ACREDITAR experiencia de por lo menos cinco años».
    const c = coberturaDelPeriodo({
      anio: 2027, personas: [],
      sesiones: [sesion({ instructorAniosExperiencia: 20, acreditaConDocumento: false })],
      experienciaMinima: 5,
    })
    expect(c.instructoresSinAcreditar[0]?.motivo).toBe('sin_documento')
    expect(c.acreditado).toBe(false)
  })

  it('el mínimo sale del catálogo, no de un número escrito en el código', () => {
    // Si la autoridad mueve los cinco años, esto se sigue comportando.
    const s = [sesion({ instructorAniosExperiencia: 6 })]
    expect(coberturaDelPeriodo({ anio: 2027, personas: [], sesiones: s, experienciaMinima: 5 })
      .instructoresSinAcreditar).toEqual([])
    expect(coberturaDelPeriodo({ anio: 2027, personas: [], sesiones: s, experienciaMinima: 8 })
      .instructoresSinAcreditar).toHaveLength(1)
  })
})

describe('el ¶3: capacitación previa o simultánea al ingreso', () => {
  it('marca a quien entró a atención al público y no acredita', () => {
    const r = ingresosSinCapacitar({
      personas: [persona('a', 'atencion_publico', '2027-02-01')],
      sesiones: [],
      hoy: '2027-03-03',
    })
    expect(r).toHaveLength(1)
    expect(r[0]?.diasDesdeElIngreso).toBe(30)
  })

  it('NO alcanza a los papeles que el ¶3 no nombra', () => {
    // El ¶3 habla de «atención al público o administración de recursos». El
    // consejo y la auditoría están en el ¶1, no aquí.
    const r = ingresosSinCapacitar({
      personas: [persona('a', 'consejo_administracion', '2027-02-01'), persona('b', 'auditoria', '2027-02-01')],
      sesiones: [], hoy: '2027-03-03',
    })
    expect(r).toEqual([])
  })

  it('quien ya acredita no aparece', () => {
    const r = ingresosSinCapacitar({
      personas: [persona('a', 'atencion_publico', '2027-02-01')],
      sesiones: [sesion({ conConstancia: ['a'] })],
      hoy: '2027-03-03',
    })
    expect(r).toEqual([])
  })

  it('quien todavía no ingresa tampoco', () => {
    const r = ingresosSinCapacitar({
      personas: [persona('a', 'atencion_publico', '2027-06-01')],
      sesiones: [], hoy: '2027-03-03',
    })
    expect(r).toEqual([])
  })
})
