import { describe, expect, it } from 'vitest'
import {
  ArchivoDeListaInvalido,
  filasCsv,
  parseGenerico,
  parseOfacSdn,
  parseSat69b,
} from '../../src/catalogo/listas-screening'

/**
 * Los parsers de listas, contra fixtures con las mañas reales de cada fuente:
 * comillas con comas adentro, «-0-» como vacío en OFAC, encabezado flotante en
 * el 69-B. Un parser que truena ante el formato cambiado es el comportamiento
 * correcto — cargar a medias y decir «cargada» no lo es.
 */

describe('El CSV mínimo', () => {
  it('respeta comillas, comas internas y comillas escapadas', () => {
    const filas = filasCsv('a,"b, con coma","di""jo"\nx,y,z')
    expect(filas).toEqual([
      ['a', 'b, con coma', 'di"jo'],
      ['x', 'y', 'z'],
    ])
  })
})

describe('OFAC SDN', () => {
  const FIXTURE = [
    '36,"AEROCARIBBEAN AIRLINES","-0-","CUBA","-0-","-0-","-0-","-0-","-0-","-0-","-0-","-0-"',
    '173,"ANGLO-CARIBBEAN CO., LTD.","-0-","CUBA","-0-","-0-","-0-","-0-","-0-","-0-","-0-","-0-"',
    '4106,"LOPEZ GOMEZ, Jose Angel","individual","SDNTK","-0-","-0-","-0-","-0-","-0-","-0-","-0-","-0-"',
  ].join('\n')

  it('extrae nombre, tipo y programa, y trata «-0-» como vacío', () => {
    const e = parseOfacSdn(FIXTURE)
    expect(e).toHaveLength(3)
    expect(e[2]).toEqual({
      nombre: 'LOPEZ GOMEZ, Jose Angel',
      tipo: 'individual',
      rfc: null,
      datos: { programa: 'SDNTK' },
    })
    expect(e[0]?.tipo).toBeNull()
  })

  it('con un archivo vacío o irreconocible, truena en vez de cargar nada', () => {
    expect(() => parseOfacSdn('')).toThrow(ArchivoDeListaInvalido)
    expect(() => parseOfacSdn('"-0-","-0-"')).toThrow(ArchivoDeListaInvalido)
  })
})

describe('SAT 69-B', () => {
  const FIXTURE = [
    'Listado completo de contribuyentes,,,',
    'Actualizado al cierre,,,',
    'No,RFC,Nombre del Contribuyente,Situación del contribuyente',
    '1,EFA010101AAA,"EMPRESA FACHADA, SA DE CV",Definitivo',
    '2,pre020202bb2,"PRESUNTA COMERCIALIZADORA SA",Presunto',
  ].join('\n')

  it('encuentra el encabezado flotante y se queda con RFC, nombre y situación', () => {
    const e = parseSat69b(FIXTURE)
    expect(e).toHaveLength(2)
    expect(e[0]).toEqual({
      nombre: 'EMPRESA FACHADA, SA DE CV',
      tipo: null,
      rfc: 'EFA010101AAA',
      datos: { situacion: 'Definitivo' },
    })
    // El RFC sube a mayúsculas: el match exacto no perdona la caja.
    expect(e[1]?.rfc).toBe('PRE020202BB2')
  })

  it('sin la fila con «RFC», truena nombrando el formato', () => {
    expect(() => parseSat69b('a,b,c\n1,2,3')).toThrow(/RFC/)
  })
})

describe('El genérico', () => {
  it('lee nombre y rfc con encabezado, y exige la columna nombre', () => {
    const e = parseGenerico('nombre,rfc\n"Juan Pérez",JUAP010101AAA\n"Sola Nombre",')
    expect(e).toHaveLength(2)
    expect(e[0]?.rfc).toBe('JUAP010101AAA')
    expect(e[1]?.rfc).toBeNull()
    expect(() => parseGenerico('col1,col2\nx,y')).toThrow(/nombre/)
  })
})
