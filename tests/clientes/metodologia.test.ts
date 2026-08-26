import { describe, expect, it } from 'vitest'
import {
  coberturaDeLaMetodologia,
  metodologiaCompleta,
  type MetodologiaConfigurada,
} from '../../src/dominio/metodologia'

/**
 * La cobertura del Art. 10 Septies 1.
 *
 * Lo que estas pruebas protegen es que el resumen NO acredite de más. Un
 * requisito marcado como cumplido cuando no lo está es peor que uno faltante:
 * el faltante se atiende, el falso positivo se archiva y aparece el día de la
 * visita de la autoridad.
 */

const COMPLETA: MetodologiaConfigurada = {
  metodoMedicion: 'suma_ponderada_por_elemento',
  pesosPorElemento: {
    actos_operaciones: 1,
    tipo_cliente: 2,
    geografia: 1.5,
    transacciones_canales: 0.5,
  },
  indicadores: [
    { elemento: 'actos_operaciones', peso: 10, delitos: ['art_139_quater', 'art_400_bis'] },
    { elemento: 'tipo_cliente', peso: 20, delitos: ['art_139_quater', 'art_400_bis'] },
    { elemento: 'geografia', peso: 30, delitos: ['art_139_quater', 'art_400_bis'] },
    { elemento: 'transacciones_canales', peso: 5, delitos: ['art_139_quater', 'art_400_bis'] },
  ],
  mitigantes: [
    { descripcion: 'Doble revisión', efecto: 'Reduce identidades incompletas', elementos: ['tipo_cliente'] },
  ],
}

const requisito = (m: MetodologiaConfigurada, clave: string) =>
  coberturaDeLaMetodologia(m).find((r) => r.clave === clave)

describe('cuándo el Art. 10 Septies 1 queda acreditado', () => {
  it('la metodología completa acredita las cuatro exigencias', () => {
    const c = coberturaDeLaMetodologia(COMPLETA)
    expect(c).toHaveLength(4)
    expect(metodologiaCompleta(c)).toBe(true)
  })

  it('fr. I: falta un elemento sin indicadores, y lo nombra como el artículo', () => {
    const m = { ...COMPLETA, indicadores: COMPLETA.indicadores.filter((i) => i.elemento !== 'geografia') }
    const r = requisito(m, 'fr_i')
    expect(r?.acreditado).toBe(false)
    expect(r?.falta.join(' ')).toContain('países y áreas geográficas')
  })

  it('fr. II: guardar los pesos NO basta si el método no los aplica', () => {
    // Un peso que el método ignora es un número decorativo, no «utilizar un
    // método que asigne valores».
    const m = { ...COMPLETA, metodoMedicion: 'suma_ponderada' }
    const r = requisito(m, 'fr_ii')
    expect(r?.acreditado).toBe(false)
    expect(r?.falta.join(' ')).toContain('no aplica el valor de los elementos')
  })

  it('fr. II: y sin el valor de un elemento tampoco', () => {
    const { geografia: _, ...resto } = COMPLETA.pesosPorElemento
    const r = requisito({ ...COMPLETA, pesosPorElemento: resto }, 'fr_ii')
    expect(r?.acreditado).toBe(false)
    expect(r?.falta.join(' ')).toContain('segunda oración')
  })

  it('fr. III: sin mitigantes no se acredita', () => {
    expect(requisito({ ...COMPLETA, mitigantes: [] }, 'fr_iii')?.acreditado).toBe(false)
  })

  it('fr. III: UN MITIGANTE QUE NO DICE SOBRE QUÉ ACTÚA NO ACREDITA', () => {
    // El artículo pide «establecer el efecto que estos tendrán sobre los
    // indicadores y elementos». Sin elemento no hay efecto que establecer.
    const m = {
      ...COMPLETA,
      mitigantes: [{ descripcion: 'Una política', efecto: 'Algún efecto', elementos: [] }],
    }
    const r = requisito(m, 'fr_iii')
    expect(r?.acreditado).toBe(false)
    expect(r?.falta.join(' ')).toContain('sobre qué elemento actúan')
  })

  it('¶ final: la exigencia es POR ELEMENTO Y POR DELITO, no una sola vez', () => {
    // Un indicador de 400 Bis en geografía no cubre a 139 Quáter en geografía
    // ni a 400 Bis en los otros tres elementos.
    const m: MetodologiaConfigurada = {
      ...COMPLETA,
      indicadores: COMPLETA.indicadores.map((i) =>
        i.elemento === 'geografia' ? { ...i, delitos: ['art_400_bis' as const] } : i,
      ),
    }
    const r = requisito(m, 'parrafo_final')
    expect(r?.acreditado).toBe(false)
    expect(r?.falta).toEqual(['Sin indicador del Art. 139 Quáter del CPF en «países y áreas geográficas».'])
  })

  it('¶ final: sin ningún indicador de delito faltan las OCHO celdas', () => {
    const m: MetodologiaConfigurada = {
      ...COMPLETA,
      indicadores: COMPLETA.indicadores.map((i) => ({ ...i, delitos: [] })),
    }
    // Cuatro elementos × dos delitos. Que sean ocho y no cuatro es el punto.
    expect(requisito(m, 'parrafo_final')?.falta).toHaveLength(8)
  })

  it('«tres de cuatro» no es completa', () => {
    const m = { ...COMPLETA, mitigantes: [] }
    const c = coberturaDeLaMetodologia(m)
    expect(c.filter((r) => r.acreditado)).toHaveLength(3)
    expect(metodologiaCompleta(c)).toBe(false)
  })
})

describe('el borrador sin método declarado', () => {
  it('no dice «el método declarado («»)»: dice que aún no hay método', () => {
    const m = { ...COMPLETA, metodoMedicion: '' }
    const r = coberturaDeLaMetodologia(m).find((x) => x.clave === 'fr_ii')
    expect(r?.falta).toContain('Todavía no se declara un método de medición.')
    expect(r?.falta.join(' ')).not.toContain('(«»)')
  })
})
