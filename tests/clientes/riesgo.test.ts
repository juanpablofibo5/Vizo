import { describe, expect, it } from 'vitest'
import {
  EscalaDeRiesgoInvalida,
  InsumoDeRiesgoIncoherente,
  MetodoDeMedicionDesconocido,
  PesoDeElementoAusente,
  evaluarRiesgo,
  type ConfiguracionRiesgo,
} from '../../src/dominio/riesgo'

const FACTORES = [
  { id: 'f1', factor: 'Domicilio en jurisdicción señalada', elemento: 'geografia', peso: 40 },
  { id: 'f2', factor: 'Persona moral de reciente constitución', elemento: 'tipo_cliente', peso: 20 },
  { id: 'f3', factor: 'Pago en efectivo', elemento: 'transacciones_canales', peso: 15 },
]

const ESCALA = [
  { id: 'g1', clave: 'bajo', orden: 1, esAlto: false, puntajeMinimo: 0 },
  { id: 'g2', clave: 'medio', orden: 2, esAlto: false, puntajeMinimo: 35 },
  { id: 'g3', clave: 'alto', orden: 3, esAlto: true, puntajeMinimo: 70 },
]

const CONFIG: ConfiguracionRiesgo = {
  modeloId: 'm1',
  metodoMedicion: 'suma_ponderada',
  factores: FACTORES,
  escala: ESCALA,
}

const evaluar = (presentes: readonly string[], config: ConfiguracionRiesgo = CONFIG) =>
  evaluarRiesgo({ clienteId: 'c1', factoresPresentes: presentes }, config)

/**
 * El motor del Grado de Riesgo.
 *
 * Lo que estas pruebas protegen no es la aritmética —una suma es una suma— sino
 * la frontera del ADR-21: que el motor ejecute la metodología del obligado y no
 * invente ninguna. Si alguna vez alguien mete un factor por omisión, un grado
 * de arranque o un corte cableado, algo de aquí muere.
 */
describe('El motor de Grado de Riesgo', () => {
  it('EL HUECO DEL ADR-21: sin factores configurados no devuelve grado alguno', () => {
    // La respuesta correcta cuando el obligado no ha configurado nada NO es
    // «bajo». Un grado por defecto sería VIZO decidiendo que un cliente es poco
    // riesgoso porque nadie llenó la tabla.
    const r = evaluar([], { ...CONFIG, factores: [] })
    expect(r).toEqual({ estado: 'sin_configuracion', falta: 'factores' })
  })

  it('y sin escala tampoco, aunque haya factores', () => {
    const r = evaluar(['f1'], { ...CONFIG, escala: [] })
    expect(r).toEqual({ estado: 'sin_configuracion', falta: 'escala' })
  })

  it('el hueco es un valor del resultado, no una excepción que alguien pueda tragarse', () => {
    // Si fuera una excepción, un `catch` descuidado la convertiría en un grado
    // por omisión. Siendo un estado del tipo, quien lo reciba tiene que
    // decidir explícitamente qué hacer con él.
    expect(() => evaluar([], { ...CONFIG, factores: [] })).not.toThrow()
  })

  it('suma los pesos de los factores presentes y aplica el corte del obligado', () => {
    const r = evaluar(['f2', 'f3'])
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.puntaje).toBe(35)
    expect(r.gradoClave).toBe('medio')
    expect(r.corteAplicado).toBe(35)
    expect(r.esAlto).toBe(false)
  })

  it('el corte es inclusivo en su borde exacto', () => {
    // 35 es exactamente el mínimo de «medio». Si el motor usara `>` en vez de
    // `>=`, ese puntaje caería en «bajo» y el obligado tendría una franja de
    // un punto que su escala no describe.
    const r = evaluar(['f2', 'f3'])
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.gradoClave).toBe('medio')
  })

  it('cero factores presentes es un cliente evaluado en el grado más bajo, no un hueco', () => {
    // Distinción que importa: «el obligado no configuró su modelo» y «el modelo
    // corrió y este cliente no disparó ningún factor» son cosas distintas y la
    // segunda SÍ es una clasificación válida.
    const r = evaluar([])
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.puntaje).toBe(0)
    expect(r.gradoClave).toBe('bajo')
    expect(r.aplicados).toHaveLength(0)
  })

  it('el grado alto sale de la escala, no de un umbral cableado', () => {
    const r = evaluar(['f1', 'f2', 'f3'])
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.puntaje).toBe(75)
    expect(r.esAlto).toBe(true)

    // Y con OTRA escala del obligado, el mismo insumo cambia de grado. Si el
    // corte estuviera en el código, esto no pasaría.
    const otra = evaluar(['f1', 'f2', 'f3'], {
      ...CONFIG,
      escala: [
        { id: 'x1', clave: 'bajo', orden: 1, esAlto: false, puntajeMinimo: 0 },
        { id: 'x2', clave: 'medio', orden: 2, esAlto: false, puntajeMinimo: 50 },
        { id: 'x3', clave: 'critico', orden: 3, esAlto: true, puntajeMinimo: 200 },
      ],
    })
    if (otra.estado !== 'evaluado') throw new Error('inesperado')
    expect(otra.gradoClave).toBe('medio')
    expect(otra.esAlto).toBe(false)
  })

  it('una escala con grados intermedios funciona igual: el Art. 23 Bis los permite', () => {
    const r = evaluar(['f1'], {
      ...CONFIG,
      escala: [
        { id: 'i1', clave: 'bajo', orden: 1, esAlto: false, puntajeMinimo: 0 },
        { id: 'i2', clave: 'medio_bajo', orden: 2, esAlto: false, puntajeMinimo: 20 },
        { id: 'i3', clave: 'medio', orden: 3, esAlto: false, puntajeMinimo: 35 },
        { id: 'i4', clave: 'medio_alto', orden: 4, esAlto: false, puntajeMinimo: 55 },
        { id: 'i5', clave: 'alto', orden: 5, esAlto: true, puntajeMinimo: 80 },
      ],
    })
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.gradoClave).toBe('medio')
  })

  it('devuelve el desglose, no solo el número', () => {
    // El Art. 41 fr. IV exige conservar el histórico; un puntaje sin su camino
    // no se puede defender dos años después.
    const r = evaluar(['f1', 'f3'])
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.aplicados).toEqual([
      // `pesoDelElemento: null` y no 1: este método no usa el segundo nivel de
      // la fr. II, y un 1 en el desglose parecería una decisión de alguien.
      { factorId: 'f1', factor: 'Domicilio en jurisdicción señalada', elemento: 'geografia', peso: 40, pesoDelElemento: null },
      { factorId: 'f3', factor: 'Pago en efectivo', elemento: 'transacciones_canales', peso: 15, pesoDelElemento: null },
    ])
  })

  it('un método de medición que el motor no conoce detiene, no aproxima', () => {
    expect(() => evaluar(['f1'], { ...CONFIG, metodoMedicion: 'promedio_ponderado' })).toThrow(
      MetodoDeMedicionDesconocido,
    )
    // Y se valida ANTES que el hueco: un modelo con método desconocido está mal
    // configurado aunque además esté vacío.
    expect(() =>
      evaluar([], { ...CONFIG, metodoMedicion: 'arbol_de_decision', factores: [] }),
    ).toThrow(MetodoDeMedicionDesconocido)
  })

  it('un factor que no pertenece al modelo revienta en vez de sumar', () => {
    expect(() => evaluar(['f1', 'fantasma'])).toThrow(InsumoDeRiesgoIncoherente)
  })

  it('un factor repetido revienta: contaría dos veces', () => {
    expect(() => evaluar(['f2', 'f2'])).toThrow(/repetidos/)
  })

  it('una escala que no empieza en cero deja puntajes sin grado, y eso se dice', () => {
    expect(() =>
      evaluar([], {
        ...CONFIG,
        escala: [{ id: 'g9', clave: 'medio', orden: 1, esAlto: false, puntajeMinimo: 10 }],
      }),
    ).toThrow(EscalaDeRiesgoInvalida)
  })
})

/**
 * Los dos niveles del Art. 10 Septies 1 fr. II.
 *
 * La fracción pide un valor por indicador Y, «a su vez», uno por elemento.
 * `suma_ponderada` solo tiene el primero, así que no acredita la segunda
 * oración; `suma_ponderada_por_elemento` tiene los dos.
 *
 * Lo que estas pruebas protegen antes que nada: que añadir el segundo nivel
 * NO haya movido el puntaje de los modelos que ya estaban configurados. Un
 * cambio silencioso ahí reclasificaría clientes sin que nadie lo decidiera.
 */
describe('El segundo nivel de la fr. II: el valor de cada elemento', () => {
  const PESOS = { geografia: 2, transacciones_canales: 0.5, tipo_cliente: 1 }

  it('EL MÉTODO VIEJO NO CAMBIÓ DE PUNTAJE: 40 + 15 sigue siendo 55', () => {
    const r = evaluar(['f1', 'f3'])
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.puntaje).toBe(55)
  })

  it('y el método nuevo pondera por elemento: 40×2 + 15×0.5 = 87.5', () => {
    const r = evaluar(['f1', 'f3'], {
      ...CONFIG,
      metodoMedicion: 'suma_ponderada_por_elemento',
      pesosPorElemento: PESOS,
    })
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.puntaje).toBe(87.5)
  })

  it('el desglose enseña LOS DOS pesos, no solo el producto', () => {
    // Sin esto, «87.5» es un número que nadie puede reproducir dos años
    // después: no se sabría qué parte vino del indicador y qué del elemento.
    const r = evaluar(['f1'], {
      ...CONFIG,
      metodoMedicion: 'suma_ponderada_por_elemento',
      pesosPorElemento: PESOS,
    })
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.aplicados[0]).toMatchObject({ peso: 40, pesoDelElemento: 2 })
  })

  it('SIN el valor de un elemento se DETIENE: no supone 1', () => {
    // Suponer 1 sería VIZO decidiendo la importancia de un elemento de la
    // metodología del obligado — y el puntaje saldría plausible y equivocado.
    expect(() =>
      evaluar(['f1'], {
        ...CONFIG,
        metodoMedicion: 'suma_ponderada_por_elemento',
        pesosPorElemento: { transacciones_canales: 0.5 },
      }),
    ).toThrow(PesoDeElementoAusente)
  })

  it('y sin ningún peso de elemento también, en vez de degradarse al método viejo', () => {
    expect(() =>
      evaluar(['f1'], { ...CONFIG, metodoMedicion: 'suma_ponderada_por_elemento' }),
    ).toThrow(PesoDeElementoAusente)
  })

  it('un peso de elemento en cero anula ese elemento, y eso es una decisión válida', () => {
    // Cero no es «falta»: es el obligado diciendo que ese elemento no describe
    // su exposición. Distinguirlo de `undefined` es el punto del error de arriba.
    const r = evaluar(['f1', 'f3'], {
      ...CONFIG,
      metodoMedicion: 'suma_ponderada_por_elemento',
      pesosPorElemento: { ...PESOS, geografia: 0 },
    })
    if (r.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.puntaje).toBe(7.5)
  })
})
