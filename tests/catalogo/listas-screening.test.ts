import { describe, expect, it } from 'vitest'
import {
  ArchivoDeListaInvalido,
  filasCsv,
  parseGenerico,
  parseOfacAlt,
  parseOfacSdn,
  parseOnu,
  parseSat69b,
  principalesDeOfac,
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
      // `ent_num` viaja en datos desde que existen los alias: es la llave con
      // la que `alt.csv` los cuelga de esta entrada.
      datos: { programa: 'SDNTK', ent_num: '4106' },
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

/**
 * Los alias de OFAC (`alt.csv`).
 *
 * Los fixtures llevan el orden REAL de columnas —`ent_num` primero— porque
 * escribirlo al revés fue el defecto que la aserción de huérfanos cazó cuando
 * este parser corrió contra el archivo oficial por primera vez.
 */
describe('OFAC · alias', () => {
  const SDN = [
    '36,"AEROCARIBBEAN AIRLINES","-0-","CUBA"',
    '173,"ANGLO-CARIBBEAN CO., LTD.","-0-","CUBA"',
  ].join('\n')

  it('liga el alias con su principal por ent_num, que es la PRIMERA columna', () => {
    const alias = parseOfacAlt(
      '36,12,"aka","AERO-CARIBBEAN","-0-"',
      principalesDeOfac(parseOfacSdn(SDN)),
    )
    expect(alias).toEqual([
      {
        nombre: 'AERO-CARIBBEAN',
        tipo: 'alias',
        rfc: null,
        datos: { ent_num: '36', principal: 'AEROCARIBBEAN AIRLINES', tipo_alias: 'aka' },
      },
    ])
  })

  it('un alias es UNA ENTRADA: se compara por nombre, no se esconde en datos', () => {
    // Es la razón de todo este parser. El matching corre sobre `nombre`; un
    // alias guardado dentro de la entrada principal no se compararía nunca, y
    // la coincidencia que se pierde es la cara.
    const alias = parseOfacAlt(
      ['36,12,"aka","AERO-CARIBBEAN","-0-"', '36,13,"fka","AEROCARIBBEAN","-0-"'].join('\n'),
      principalesDeOfac(parseOfacSdn(SDN)),
    )
    expect(alias.map((a) => a.nombre)).toEqual(['AERO-CARIBBEAN', 'AEROCARIBBEAN'])
  })

  it('descarta el alias huérfano en vez de cargarlo sin dueño', () => {
    const alias = parseOfacAlt(
      ['36,12,"aka","AERO-CARIBBEAN","-0-"', '99999,1,"aka","FANTASMA","-0-"'].join('\n'),
      principalesDeOfac(parseOfacSdn(SDN)),
    )
    expect(alias.map((a) => a.nombre)).toEqual(['AERO-CARIBBEAN'])
  })

  it('SI CASI TODO ES HUÉRFANO, TRUENA: los dos archivos no son de la misma descarga', () => {
    // Esta aserción encontró el defecto del propio parser —columnas
    // invertidas— antes de que cargara un solo renglón. Sin ella habría
    // guardado miles de alias colgados de la persona equivocada, que es
    // exactamente el dato que hace que un humano descarte mal.
    const casiTodoHuerfano = [
      '36,12,"aka","AERO-CARIBBEAN","-0-"',
      '80001,1,"aka","UNO","-0-"',
      '80002,2,"aka","DOS","-0-"',
    ].join('\n')
    expect(() =>
      parseOfacAlt(casiTodoHuerfano, principalesDeOfac(parseOfacSdn(SDN))),
    ).toThrow(/no parecen de la misma descarga/)
  })

  it('un archivo vacío truena en vez de cargar nada', () => {
    expect(() => parseOfacAlt('', new Map())).toThrow(ArchivoDeListaInvalido)
  })
})

/**
 * ONU — la lista consolidada del Consejo de Seguridad.
 *
 * El fixture reproduce las cuatro mañas del archivo real: el nombre de persona
 * repartido en cuatro campos, el de entidad en uno solo, los alias con
 * ALIAS_NAME vacío que el archivo trae a cientos, y las entidades XML.
 */
describe('ONU', () => {
  const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<CONSOLIDATED_LIST dateGenerated="2026-08-29T23:00:02.417Z">
  <INDIVIDUALS>
    <INDIVIDUAL>
      <DATAID>6907994</DATAID>
      <FIRST_NAME>FRANK</FIRST_NAME>
      <SECOND_NAME>KAKOLELE</SECOND_NAME>
      <THIRD_NAME>BWAMBALE</THIRD_NAME>
      <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
      <REFERENCE_NUMBER>CDi.002</REFERENCE_NUMBER>
      <LISTED_ON>2005-11-01</LISTED_ON>
      <INDIVIDUAL_ALIAS>
        <QUALITY>Good</QUALITY>
        <ALIAS_NAME>FRANK KAKORERE</ALIAS_NAME>
      </INDIVIDUAL_ALIAS>
      <INDIVIDUAL_ALIAS>
        <QUALITY/>
        <ALIAS_NAME/>
      </INDIVIDUAL_ALIAS>
    </INDIVIDUAL>
  </INDIVIDUALS>
  <ENTITIES>
    <ENTITY>
      <DATAID>6908402</DATAID>
      <FIRST_NAME>COMERCIAL SMITH &amp; SONS</FIRST_NAME>
      <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
      <REFERENCE_NUMBER>CDe.001</REFERENCE_NUMBER>
      <LISTED_ON>2014-06-30</LISTED_ON>
      <ENTITY_ALIAS>
        <QUALITY>a.k.a.</QUALITY>
        <ALIAS_NAME>SMITH &amp; SONS</ALIAS_NAME>
      </ENTITY_ALIAS>
    </ENTITY>
  </ENTITIES>
</CONSOLIDATED_LIST>`

  it('arma el nombre de la persona con los cuatro campos, y el de la entidad con uno', () => {
    const e = parseOnu(FIXTURE)
    const persona = e.find((x) => x.tipo === 'individual')
    const entidad = e.find((x) => x.tipo === 'entity')
    expect(persona?.nombre).toBe('FRANK KAKOLELE BWAMBALE')
    expect(entidad?.nombre).toBe('COMERCIAL SMITH & SONS')
  })

  it('los alias salen como entradas propias, con su principal a la vista', () => {
    const alias = parseOnu(FIXTURE).filter((x) => x.tipo === 'alias')
    expect(alias.map((a) => a.nombre)).toEqual(['FRANK KAKORERE', 'SMITH & SONS'])
    expect(alias[0]?.datos['principal']).toBe('FRANK KAKOLELE BWAMBALE')
    expect(alias[0]?.datos['calidad_alias']).toBe('Good')
  })

  it('el alias sin nombre se ignora: el archivo real trae cientos', () => {
    // Un alias vacío cargado sería una fila con nombre '' que la base rechaza
    // — o peor, un nombre que empata con cualquier cosa.
    expect(parseOnu(FIXTURE).every((e) => e.nombre.trim() !== '')).toBe(true)
  })

  it('conserva el programa y la referencia, que es lo que mira quien resuelve', () => {
    const persona = parseOnu(FIXTURE).find((x) => x.tipo === 'individual')
    expect(persona?.datos).toEqual({
      data_id: '6907994',
      referencia: 'CDi.002',
      programa: 'DRC',
      listado_en: '2005-11-01',
    })
  })

  it('un archivo que no es la lista consolidada truena nombrando la fuente', () => {
    expect(() => parseOnu('<html><body>404</body></html>')).toThrow(/scsanctions\.un\.org/)
  })

  it('la lista sin entradas legibles truena: pudo truncarse la descarga', () => {
    expect(() =>
      parseOnu('<CONSOLIDATED_LIST><INDIVIDUALS/><ENTITIES/></CONSOLIDATED_LIST>'),
    ).toThrow(/no produjo ninguna entrada/)
  })
})
