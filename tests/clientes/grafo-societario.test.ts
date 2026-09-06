import { describe, expect, it } from 'vitest'
import {
  CicloEnElGrafo,
  GrafoIncoherente,
  ProfundidadExcedida,
  ReglaDeAgregacionDesconocida,
  resolverGrafo,
  type ParteDelGrafo,
  type ParticipacionDelGrafo,
} from '../../src/dominio/grafo-societario'

/**
 * El grafo societario, contra los casos que el plano declaró obligatorios:
 * la cadena que multiplica, la indirecta que NO alcanza, y el ciclo que se
 * nombra en vez de resolverse. Más la aritmética exacta en el borde.
 */

const CONFIG = { profundidadMaxima: 10, reglaAgregacion: 'producto_de_la_cadena' }

const parte = (id: string, tipo: ParteDelGrafo['tipo'], esLaRaiz = false): ParteDelGrafo => ({
  id, tipo, esLaRaiz,
})
let n = 0
const tiene = (duenoId: string, poseidaId: string, porcentaje: number): ParticipacionDelGrafo => ({
  id: `a${String((n += 1))}`, duenoId, poseidaId, porcentaje,
})

describe('Los casos obligatorios del plano', () => {
  it('CASO 1 · cadena de tres niveles: PF → PM A (60%) → PM B (50%) → cliente = 30%', () => {
    const r = resolverGrafo(
      {
        partes: [
          parte('cliente', 'moral', true),
          parte('pmB', 'moral'),
          parte('pmA', 'moral'),
          parte('pf', 'fisica'),
        ],
        // El plano lo enuncia de arriba hacia abajo; las aristas son quién
        // posee a quién: PM B posee al cliente, PM A a PM B, la PF a PM A.
        participaciones: [
          tiene('pmB', 'cliente', 50),
          tiene('pmA', 'pmB', 100),
          tiene('pf', 'pmA', 60),
        ],
      },
      CONFIG,
    )
    const pf = r.titulares.find((t) => t.titularId === 'pf')
    expect(pf?.efectiva).toBe(30)
    expect(pf?.directa).toBe(0)
    expect(pf?.cadenas[0]?.tramos).toHaveLength(3)
  })

  it('CASO 2 · la indirecta que NO alcanza: 30% × 80% = 24%, con la traza de por qué', () => {
    const r = resolverGrafo(
      {
        partes: [parte('cliente', 'moral', true), parte('pm', 'moral'), parte('pf', 'fisica')],
        participaciones: [tiene('pm', 'cliente', 80), tiene('pf', 'pm', 30)],
      },
      CONFIG,
    )
    const pf = r.titulares.find((t) => t.titularId === 'pf')
    // 30 y 80 por separado suenan a que sí; el producto dice que no.
    expect(pf?.efectiva).toBe(24)
    // Y la cadena queda escrita: es el procedimiento que el artículo manda documentar.
    expect(pf?.cadenas[0]?.tramos.map((t) => t.porcentaje)).toEqual([30, 80])
  })

  it('CASO 4 · participación cruzada: el ciclo se NOMBRA, no se resuelve', () => {
    expect(() =>
      resolverGrafo(
        {
          partes: [parte('cliente', 'moral', true), parte('pmA', 'moral'), parte('pmB', 'moral')],
          participaciones: [
            tiene('pmA', 'cliente', 50),
            tiene('pmB', 'pmA', 40),
            tiene('pmA', 'pmB', 30),
          ],
        },
        CONFIG,
      ),
    ).toThrow(CicloEnElGrafo)
  })
})

describe('La aritmética es exacta, no de punto flotante', () => {
  it('EL BORDE EXACTO: 62.5% × 40% = 25.000000, ni un polvo binario menos', () => {
    // En float, 0.625 × 0.4 no da exactamente 0.25 — y contra un umbral
    // inclusivo de 25, caer del lado equivocado cambia quién es Beneficiario
    // Controlador. Ésta es la prueba de que la cadena se calcula en enteros.
    const r = resolverGrafo(
      {
        partes: [parte('cliente', 'moral', true), parte('pm', 'moral'), parte('pf', 'fisica')],
        participaciones: [tiene('pm', 'cliente', 40), tiene('pf', 'pm', 62.5)],
      },
      CONFIG,
    )
    expect(r.titulares[0]?.efectiva).toBe(25)
  })

  it('EL POLVO DONDE SÍ MUERDE: 1.01% × 1.52% = 0.015352 exacto', () => {
    // Dos sabotajes de esta suite sobrevivieron con 0.625×0.4 y con 0.1×0.3:
    // los dos resultan exactos en IEEE 754 por casualidad. Este par NO — el
    // camino float da 0.015351999999999998 — y se encontró por fuerza bruta,
    // no adivinando. Prueba además el caso que importa de verdad: las
    // participaciones minoritarias encadenadas, que es donde una estructura
    // opaca esconde al beneficiario en números chiquitos.
    const r = resolverGrafo(
      {
        partes: [parte('cliente', 'moral', true), parte('pm', 'moral'), parte('pf', 'fisica')],
        participaciones: [tiene('pm', 'cliente', 1.52), tiene('pf', 'pm', 1.01)],
      },
      CONFIG,
    )
    expect(r.titulares[0]?.efectiva).toBe(0.015352)
    // Y LA CADENA MISMA, no solo la suma: la agregación re-redondea y puede
    // lavar el polvo de un cálculo sucio — dos sabotajes sobrevivieron
    // exactamente así. El valor por cadena es el que alimenta al motor de
    // prelación, y es el que tiene que salir limpio de origen.
    expect(r.titulares[0]?.cadenas[0]?.porcentajeEfectivo).toBe(0.015352)
  })

  it('directa e indirecta del mismo titular SE SUMAN: 15% directo + 10% vía PM = 25%', () => {
    const r = resolverGrafo(
      {
        partes: [parte('cliente', 'moral', true), parte('pm', 'moral'), parte('pf', 'fisica')],
        participaciones: [
          tiene('pf', 'cliente', 15),
          tiene('pm', 'cliente', 10),
          tiene('pf', 'pm', 100),
        ],
      },
      CONFIG,
    )
    const pf = r.titulares.find((t) => t.titularId === 'pf')
    expect(pf?.directa).toBe(15)
    expect(pf?.indirecta).toBe(10)
    expect(pf?.efectiva).toBe(25)
    expect(pf?.cadenas).toHaveLength(2)
  })

  it('dos caminos indirectos distintos también suman', () => {
    const r = resolverGrafo(
      {
        partes: [
          parte('cliente', 'moral', true),
          parte('pmA', 'moral'),
          parte('pmB', 'moral'),
          parte('pf', 'fisica'),
        ],
        participaciones: [
          tiene('pmA', 'cliente', 50),
          tiene('pmB', 'cliente', 50),
          tiene('pf', 'pmA', 30),
          tiene('pf', 'pmB', 20),
        ],
      },
      CONFIG,
    )
    // 30×50 + 20×50 = 15 + 10 = 25.
    expect(r.titulares[0]?.efectiva).toBe(25)
  })
})

describe('Lo que detiene y lo que solo advierte', () => {
  const base = () => ({
    partes: [parte('cliente', 'moral', true), parte('pm', 'moral'), parte('pf', 'fisica')],
    participaciones: [tiene('pm', 'cliente', 60), tiene('pf', 'pm', 50)],
  })

  it('los dueños de una parte no pueden sumar MÁS de 100%', () => {
    expect(() =>
      resolverGrafo(
        {
          partes: [parte('cliente', 'moral', true), parte('a', 'fisica'), parte('b', 'fisica')],
          participaciones: [tiene('a', 'cliente', 70), tiene('b', 'cliente', 40)],
        },
        CONFIG,
      ),
    ).toThrow(/más del 100%/)
  })

  it('sumar MENOS de 100% no detiene: se advierte, porque puede faltar el minoritario', () => {
    const r = resolverGrafo(base(), CONFIG)
    expect(r.advertencias.map((a) => a.tipo)).toContain('suma_incompleta')
    expect(r.advertencias[0]?.sumaCapturada).toBe(60)
    // Y la cifra de quien sí está capturado sigue calculándose.
    expect(r.titulares[0]?.efectiva).toBe(30)
  })

  it('nadie puede ser dueño de una persona física', () => {
    expect(() =>
      resolverGrafo(
        {
          partes: [parte('cliente', 'moral', true), parte('pf', 'fisica'), parte('pm', 'moral')],
          participaciones: [tiene('pf', 'cliente', 50), tiene('pm', 'pf', 10)],
        },
        CONFIG,
      ),
    ).toThrow(/dueño de una persona física/)
  })

  it('sin raíz, o con dos, no hay qué recorrer', () => {
    expect(() =>
      resolverGrafo({ partes: [parte('pm', 'moral')], participaciones: [] }, CONFIG),
    ).toThrow(/no hay raíz/)
    expect(() =>
      resolverGrafo(
        { partes: [parte('a', 'moral', true), parte('b', 'moral', true)], participaciones: [] },
        CONFIG,
      ),
    ).toThrow(/más de una raíz/)
  })

  it('EL TOPE DE PROFUNDIDAD VIENE DE FUERA: con tope 2, la cadena de 3 detiene', () => {
    expect(() =>
      resolverGrafo(
        {
          partes: [
            parte('cliente', 'moral', true),
            parte('pmB', 'moral'),
            parte('pmA', 'moral'),
            parte('pf', 'fisica'),
          ],
          participaciones: [
            tiene('pmB', 'cliente', 50),
            tiene('pmA', 'pmB', 100),
            tiene('pf', 'pmA', 60),
          ],
        },
        { ...CONFIG, profundidadMaxima: 2 },
      ),
    ).toThrow(ProfundidadExcedida)
  })

  it('una regla de agregación que el motor no sabe ejecutar DETIENE', () => {
    expect(() => resolverGrafo(base(), { ...CONFIG, reglaAgregacion: 'suma_simple' })).toThrow(
      ReglaDeAgregacionDesconocida,
    )
  })

  it('una arista hacia una parte que no existe detiene', () => {
    expect(() =>
      resolverGrafo(
        {
          partes: [parte('cliente', 'moral', true)],
          participaciones: [tiene('fantasma', 'cliente', 50)],
        },
        CONFIG,
      ),
    ).toThrow(GrafoIncoherente)
  })

  it('la profundidad recorrida queda en el resultado, para congelarse con él', () => {
    const r = resolverGrafo(
      {
        partes: [
          parte('cliente', 'moral', true),
          parte('pmB', 'moral'),
          parte('pmA', 'moral'),
          parte('pf', 'fisica'),
        ],
        participaciones: [
          tiene('pmB', 'cliente', 50),
          tiene('pmA', 'pmB', 100),
          tiene('pf', 'pmA', 60),
        ],
      },
      CONFIG,
    )
    expect(r.profundidadRecorrida).toBe(3)
  })
})
