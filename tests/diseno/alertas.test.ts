import { describe, expect, test } from 'vitest'
import { calculoDeLaAlerta, nombreDeTipo, tonoDeAlerta } from '../../app/componentes/alertas'

/**
 * La gravedad de una alerta y su desglose.
 *
 * Lo que se protege aquí es lo mismo de siempre por otra puerta: que la
 * pantalla no tranquilice más de lo que el hecho permite. Dos casos concretos
 * —el efectivo del Art. 32, que no es «un aviso más» sino una prohibición, y
 * el tipo de alerta que este módulo todavía no conoce— son los que se
 * escaparían solos.
 */

describe('cuánto salta cada alerta', () => {
  test('la aprobación del 23 Ter 5 es granate: la omisión ya está corriendo', () => {
    expect(tonoDeAlerta('aprobacion_directivo_pendiente', 'aprobacion_23_ter_5')).toBe('critico')
  })

  test('el aviso requerido es ámbar: tiene plazo hasta el día 17', () => {
    expect(tonoDeAlerta('aviso_requerido', 'acumulacion')).toBe('aviso')
    expect(tonoDeAlerta('aviso_requerido', 'monto_individual')).toBe('aviso')
  })

  test('pero el efectivo del Art. 32 es granate, aunque comparta tipo con ellos', () => {
    // Recibirlo está PROHIBIDO, no sujeto a aviso. Comparte `aviso_requerido`
    // con los otros dos, así que el discriminante tiene que ser `por`.
    expect(tonoDeAlerta('aviso_requerido', 'efectivo_restringido')).toBe('critico')
  })

  test('proximidad es neutro: nada se cruzó todavía', () => {
    expect(tonoDeAlerta('proximidad', 'proximidad')).toBe('neutro')
  })

  test('UN TIPO DESCONOCIDO SE PINTA ÁMBAR, NUNCA NEUTRO', () => {
    // El día que se añada un tipo de alerta nuevo y nadie pase por este
    // módulo, la pantalla tiene que pedir que lo miren. Neutro lo escondería.
    expect(tonoDeAlerta('capitulo_nuevo_que_no_existe', null)).toBe('aviso')
    expect(tonoDeAlerta('capitulo_nuevo_que_no_existe', 'lo_que_sea')).toBe('aviso')
  })

  test('el nombre del tipo se lee, y uno desconocido sale sin guiones bajos', () => {
    expect(nombreDeTipo('desviacion_perfil')).toBe('desviación de perfil')
    expect(nombreDeTipo('un_tipo_nuevo')).toBe('un tipo nuevo')
  })
})

describe('«Con qué se calculó»', () => {
  test('«por» y «motivo» no se repiten: ya se leen en la tarjeta', () => {
    const pares = calculoDeLaAlerta({ por: 'acumulacion', motivo: 'Lo que sea', mes: '2026-06' })
    expect(pares.map((p) => p.clave)).toEqual(['mes'])
  })

  test('UNA CLAVE DESCONOCIDA SE ENSEÑA, NO SE DESCARTA', () => {
    // `detalle` crece con cada capítulo. Esconder lo que no se reconoce sería
    // borrar un dato del cálculo de la explicación sin que nadie se entere.
    const pares = calculoDeLaAlerta({ por: 'x', clave_del_futuro: 42 })
    expect(pares).toEqual([
      { clave: 'clave_del_futuro', etiqueta: 'clave_del_futuro', valor: '42' },
    ])
  })

  test('los montos llevan EL formato del portal, no el crudo de la base', () => {
    // El bug que esto guarda ya está contado en `formatearPesosTexto`: dos
    // formateadores son dos formatos. Sin esta línea, dentro de la misma caja
    // del «Por qué» convivían `1000000.00` y `$1,000,000.00` para el mismo
    // importe — el de arriba de la alerta, el de abajo del motor.
    const pares = calculoDeLaAlerta({ por: 'acumulacion', suma_ventana: '1905300.00' })
    expect(pares[0]).toEqual({
      clave: 'suma_ventana',
      etiqueta: 'Suma de la ventana',
      valor: '$1,905,300.00',
    })
  })

  test('pero lo que NO es dinero no se disfraza de dinero', () => {
    const pares = calculoDeLaAlerta({ por: 'x', operaciones_en_ventana: 5, mes: '2026-06' })
    expect(pares.map((p) => p.valor)).toEqual(['5', '2026-06'])
  })

  test('los booleanos se dicen en español, no como «true»', () => {
    const pares = calculoDeLaAlerta({ por: 'x', grado_vencido: true })
    expect(pares[0]?.valor).toBe('sí')
    expect(calculoDeLaAlerta({ por: 'x', grado_vencido: false })[0]?.valor).toBe('no')
  })

  test('la vía del ¶2 se traduce a lo que el obligado tiene que producir', () => {
    expect(calculoDeLaAlerta({ por: 'x', via: 'directivo' })[0]?.valor).toBe(
      'aprobación de un directivo',
    )
    expect(calculoDeLaAlerta({ por: 'x', via: 'constancia_persona_fisica' })[0]?.valor).toBe(
      'constancia de motivos',
    )
  })

  test('las desviaciones se abren en sus propios pares, sin perder de cuál salen', () => {
    const pares = calculoDeLaAlerta({
      por: 'monto_mensual',
      motivo: 'Se pasó',
      mes: '2026-06',
      desviaciones: [
        { por: 'monto_mensual', declarado: '450,000.00', excedente: '50,000.00' },
      ],
    })
    expect(pares.map((p) => p.etiqueta)).toEqual([
      'Mes',
      'Declarado (monto mensual)',
      'Excedente (monto mensual)',
    ])
  })

  test('un detalle vacío no produce pares: entonces no hay «Por qué» que abrir', () => {
    expect(calculoDeLaAlerta({ por: 'identidad_sin_rfc_ni_curp', motivo: 'Revísalo' })).toEqual([])
  })

  test('una lista de textos se lee como lista, no como JSON', () => {
    // La alerta de screening trae las listas donde hubo coincidencia. Salía en
    // pantalla como ["ofac_sdn"] —corchetes y comillas incluidos— porque el
    // único camino para lo que no fuera texto o número era JSON.stringify.
    const pares = calculoDeLaAlerta({ por: 'x', listas: ['ofac_sdn', 'onu'], coincidencias: 2 })
    expect(pares.map((p) => p.valor)).toEqual(['ofac_sdn, onu', '2'])
  })

  test('pero una lista de objetos NO se aplana a la fuerza', () => {
    // `desviaciones` tiene su propio camino; cualquier otra lista de objetos
    // que aparezca mañana debe seguir viéndose entera, aunque sea fea. Fea es
    // un recordatorio de que falta traducirla; aplanada es un dato perdido.
    const pares = calculoDeLaAlerta({ por: 'x', algo_nuevo: [{ a: 1 }] })
    expect(pares[0]?.valor).toBe('[{"a":1}]')
  })
})
