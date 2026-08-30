/**
 * Los parsers de las listas de control (issue #34).
 *
 * Puros: reciben el TEXTO del archivo descargado y devuelven entradas
 * normalizables. Ni red ni base — el script de carga (scripts/) pone la red y
 * la conexión, y los tests los ejercitan con fixtures. Cada formato tiene sus
 * mañas y están escritas donde muerden.
 *
 * Formatos con parser hoy: OFAC SDN (sdn.csv) con sus alias (alt.csv) ·
 * ONU (consolidated.xml) con los suyos · SAT 69-B (CSV, latin1) · genérico
 * (nombre[,rfc], UTF-8). **LPB sigue pendiente y no por falta de código**: se
 * descarga con la cuenta del obligado en el portal de la UIF y su formato no
 * está confirmado (runbook 06). Escribir un lector para un formato que nadie
 * ha visto sería inventarlo, y una lista mal leída es peor que una ausente:
 * la consulta diría «consultada» sobre datos incompletos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UN ALIAS ES UNA ENTRADA, NO UN CAMPO
 * ────────────────────────────────────────────────────────────────────────────
 * Los alias se emiten como FILAS PROPIAS, no como un dato dentro de la entrada
 * principal. El matching corre sobre `nombre`, así que un alias guardado en
 * `datos` no se compara nunca — y la coincidencia que se pierde es la cara: se
 * opera con una persona listada porque venía con otro nombre. Cada fila de
 * alias lleva en `datos` el nombre principal y el identificador de la fuente,
 * que es lo que necesita ver quien resuelve la coincidencia.
 */

export interface EntradaDeLista {
  readonly nombre: string
  readonly tipo: string | null
  /** Ya en mayúsculas, o null. Solo el 69-B lo trae. */
  readonly rfc: string | null
  readonly datos: Record<string, string>
}

export class ArchivoDeListaInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ArchivoDeListaInvalido'
  }
}

/**
 * CSV mínimo con comillas y comas internas (RFC 4180 en lo que estas listas
 * usan). No maneja saltos de línea DENTRO de un campo: ninguna de las dos
 * fuentes los trae, y soportarlos a ciegas escondería un archivo corrupto.
 */
export function filasCsv(texto: string): string[][] {
  const filas: string[][] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === '') continue
    const campos: string[] = []
    let campo = ''
    let entreComillas = false
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]
      if (entreComillas) {
        if (c === '"' && linea[i + 1] === '"') {
          campo += '"'
          i++
        } else if (c === '"') {
          entreComillas = false
        } else {
          campo += c
        }
      } else if (c === '"') {
        entreComillas = true
      } else if (c === ',') {
        campos.push(campo)
        campo = ''
      } else {
        campo += c
      }
    }
    campos.push(campo)
    filas.push(campos)
  }
  return filas
}

/**
 * OFAC SDN — `sdn.csv` (treasury.gov). Sin encabezado; columnas fijas:
 * ent_num, SDN_Name, SDN_Type, Program(s), … y `-0-` como «sin valor».
 * Los alias viven en `alt.csv` y NO se cargan todavía: está dicho en el
 * runbook, porque un match que no probó alias no debe presumir que lo hizo.
 */
export function parseOfacSdn(texto: string): EntradaDeLista[] {
  const filas = filasCsv(texto)
  if (filas.length === 0) throw new ArchivoDeListaInvalido('El archivo de OFAC llegó vacío.')
  const entradas: EntradaDeLista[] = []
  for (const f of filas) {
    const nombre = (f[1] ?? '').trim()
    if (nombre === '' || nombre === '-0-') continue
    const tipo = (f[2] ?? '').trim()
    const programa = (f[3] ?? '').trim()
    // `ent_num` va a datos porque es la llave con la que `alt.csv` cuelga los
    // alias de esta entrada. Sin ella, una fila de alias sería un nombre
    // suelto sin forma de decir de quién es.
    const entNum = (f[0] ?? '').trim()
    const datos: Record<string, string> = {}
    if (programa !== '' && programa !== '-0-') datos['programa'] = programa
    if (entNum !== '') datos['ent_num'] = entNum
    entradas.push({
      nombre,
      tipo: tipo === '' || tipo === '-0-' ? null : tipo.toLowerCase(),
      rfc: null,
      datos,
    })
  }
  if (entradas.length === 0) {
    throw new ArchivoDeListaInvalido(
      'El archivo de OFAC no produjo ninguna entrada: o el formato cambió o no es sdn.csv.',
    )
  }
  return entradas
}

/**
 * SAT 69-B — el «Listado completo». Llega en latin1 (el script lo decodifica
 * antes) y con renglones de encabezado variables; el ancla es la fila que
 * contiene «RFC». La situación del contribuyente (Presunto / Desvirtuado /
 * Definitivo / Sentencia favorable) va en datos: el humano que resuelve la
 * coincidencia la necesita a la vista.
 */
export function parseSat69b(texto: string): EntradaDeLista[] {
  const filas = filasCsv(texto)
  const iEncabezado = filas.findIndex((f) => f.some((c) => c.trim().toUpperCase() === 'RFC'))
  if (iEncabezado === -1) {
    throw new ArchivoDeListaInvalido(
      'No se encontró la fila de encabezado con «RFC»: o el formato del 69-B cambió o el archivo no es el Listado completo.',
    )
  }
  const encabezado = filas[iEncabezado] ?? []
  const col = (busca: string): number =>
    encabezado.findIndex((c) => c.trim().toUpperCase().includes(busca))
  const iRfc = col('RFC')
  const iNombre = col('NOMBRE')
  const iSituacion = col('SITUACI')
  if (iNombre === -1) {
    throw new ArchivoDeListaInvalido('El encabezado del 69-B no trae la columna de nombre.')
  }

  const entradas: EntradaDeLista[] = []
  for (const f of filas.slice(iEncabezado + 1)) {
    const nombre = (f[iNombre] ?? '').trim()
    const rfc = (f[iRfc] ?? '').trim().toUpperCase()
    if (nombre === '') continue
    const situacion = iSituacion === -1 ? '' : (f[iSituacion] ?? '').trim()
    entradas.push({
      nombre,
      tipo: null,
      rfc: rfc === '' ? null : rfc,
      datos: situacion === '' ? {} : { situacion },
    })
  }
  if (entradas.length === 0) {
    throw new ArchivoDeListaInvalido('El 69-B no produjo ninguna entrada después del encabezado.')
  }
  return entradas
}

/** Genérico: CSV UTF-8 con encabezado `nombre[,rfc]`. Para cargas manuales. */
export function parseGenerico(texto: string): EntradaDeLista[] {
  const filas = filasCsv(texto)
  const encabezado = (filas[0] ?? []).map((c) => c.trim().toLowerCase())
  const iNombre = encabezado.indexOf('nombre')
  const iRfc = encabezado.indexOf('rfc')
  if (iNombre === -1) {
    throw new ArchivoDeListaInvalido('El CSV genérico exige encabezado con la columna «nombre».')
  }
  const entradas: EntradaDeLista[] = []
  for (const f of filas.slice(1)) {
    const nombre = (f[iNombre] ?? '').trim()
    if (nombre === '') continue
    const rfc = iRfc === -1 ? '' : (f[iRfc] ?? '').trim().toUpperCase()
    entradas.push({ nombre, tipo: null, rfc: rfc === '' ? null : rfc, datos: {} })
  }
  if (entradas.length === 0) {
    throw new ArchivoDeListaInvalido('El CSV genérico no trajo ninguna entrada.')
  }
  return entradas
}

/** El nombre principal de cada entrada de OFAC, por `ent_num`. */
export function principalesDeOfac(
  entradas: readonly EntradaDeLista[],
): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of entradas) {
    const n = e.datos['ent_num']
    if (n !== undefined && !m.has(n)) m.set(n, e.nombre)
  }
  return m
}

/**
 * OFAC — `alt.csv`, los alias del SDN.
 *
 * Columnas: ent_num, alt_num, tipo (aka / fka / nka), nombre, notas. El
 * `ent_num` va PRIMERO —igual que en `sdn.csv`— y es la liga entre los dos
 * archivos; `alt_num` solo identifica al alias dentro de su entrada. La
 * primera versión de este parser los leyó al revés y la aserción de abajo lo
 * cazó: 15,735 alias huérfanos contra 4,412 ligados. Sin esa aserción se
 * habrían cargado esos 4,412 con el nombre principal de otra persona, que es
 * peor que no cargarlos. Por eso este parser recibe el mapa de
 * principales: sin el nombre principal a la vista, quien resuelve una
 * coincidencia por alias no sabría a quién está mirando.
 *
 * Un alias cuyo `ent_num` no exista en el SDN se DESCARTA con cuidado: no es
 * un nombre huérfano que valga la pena cargar, es señal de que los dos
 * archivos no son de la misma descarga. Si son muchos, el script lo dirá.
 */
export function parseOfacAlt(
  texto: string,
  principales: ReadonlyMap<string, string>,
): EntradaDeLista[] {
  const filas = filasCsv(texto)
  if (filas.length === 0) {
    throw new ArchivoDeListaInvalido('El archivo de alias de OFAC llegó vacío.')
  }
  const entradas: EntradaDeLista[] = []
  let huerfanos = 0
  for (const f of filas) {
    const nombre = (f[3] ?? '').trim()
    if (nombre === '' || nombre === '-0-') continue
    const entNum = (f[0] ?? '').trim()
    const principal = principales.get(entNum)
    if (principal === undefined) {
      huerfanos++
      continue
    }
    const tipoAlias = (f[2] ?? '').trim().toLowerCase()
    entradas.push({
      nombre,
      tipo: 'alias',
      rfc: null,
      datos: {
        ent_num: entNum,
        principal,
        ...(tipoAlias === '' || tipoAlias === '-0-' ? {} : { tipo_alias: tipoAlias }),
      },
    })
  }
  if (entradas.length === 0) {
    throw new ArchivoDeListaInvalido(
      'El archivo de alias de OFAC no produjo ninguna entrada. Si los dos archivos no son de ' +
        'la misma descarga, ningún alias encuentra su principal: vuelve a bajar sdn.csv y alt.csv juntos.',
    )
  }
  if (huerfanos > entradas.length) {
    throw new ArchivoDeListaInvalido(
      `Se descartaron ${String(huerfanos)} alias por no encontrar su entrada en el SDN, más que ` +
        `los ${String(entradas.length)} que sí la encontraron. Los dos archivos no parecen de la ` +
        'misma descarga.',
    )
  }
  return entradas
}

/** Las cinco entidades XML que las listas usan, más las numéricas. */
function desescaparXml(v: string): string {
  return v
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

/** El texto del primer hijo directo `<etiqueta>` del bloque, o ''. */
function campoXml(bloque: string, etiqueta: string): string {
  const m = new RegExp(`<${etiqueta}>([\\s\\S]*?)</${etiqueta}>`).exec(bloque)
  return m?.[1] === undefined ? '' : desescaparXml(m[1]).trim()
}

/** Todos los bloques `<etiqueta>…</etiqueta>` del texto. */
function bloquesXml(texto: string, etiqueta: string): string[] {
  const re = new RegExp(`<${etiqueta}>([\\s\\S]*?)</${etiqueta}>`, 'g')
  return [...texto.matchAll(re)].map((m) => m[1] ?? '')
}

/**
 * ONU — `consolidated.xml` del Consejo de Seguridad.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ SE LEE A MANO Y NO CON UNA LIBRERÍA
 * ────────────────────────────────────────────────────────────────────────────
 * El proyecto tiene cinco dependencias de ejecución y ninguna parsea XML. El
 * documento de la ONU es plano y generado por máquina: sin espacios de nombres
 * en los elementos que importan, sin CDATA, y sin anidar una etiqueta dentro
 * de otra del mismo nombre. Eso hace tratable leerlo por bloques, y el precio
 * de equivocarse está acotado por las dos aserciones de abajo: si el documento
 * cambia de forma, este parser TRUENA en vez de devolver menos nombres — que
 * es el modo de falla caro (un nombre que no se compara es una coincidencia
 * que no ocurre).
 *
 * Dos formas de nombre conviven en el mismo archivo:
 *   · persona  — FIRST_NAME + SECOND_NAME + THIRD_NAME + FOURTH_NAME
 *   · entidad  — solo FIRST_NAME, que trae el nombre completo
 *
 * Los alias (INDIVIDUAL_ALIAS / ENTITY_ALIAS) salen como filas propias; los que
 * vienen con ALIAS_NAME vacío —el archivo trae cientos— se ignoran.
 */
export function parseOnu(texto: string): EntradaDeLista[] {
  if (!texto.includes('<CONSOLIDATED_LIST')) {
    throw new ArchivoDeListaInvalido(
      'El archivo no es la lista consolidada de la ONU: falta <CONSOLIDATED_LIST>. Se descarga ' +
        'de https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    )
  }

  const entradas: EntradaDeLista[] = []

  const agregar = (
    bloque: string,
    nombre: string,
    tipo: 'individual' | 'entity',
    etiquetaAlias: string,
  ): void => {
    if (nombre === '') return
    const dataId = campoXml(bloque, 'DATAID')
    const referencia = campoXml(bloque, 'REFERENCE_NUMBER')
    const programa = campoXml(bloque, 'UN_LIST_TYPE')
    const listadoEn = campoXml(bloque, 'LISTED_ON')
    const base: Record<string, string> = {}
    if (dataId !== '') base['data_id'] = dataId
    if (referencia !== '') base['referencia'] = referencia
    if (programa !== '') base['programa'] = programa
    if (listadoEn !== '') base['listado_en'] = listadoEn

    entradas.push({ nombre, tipo, rfc: null, datos: base })

    for (const alias of bloquesXml(bloque, etiquetaAlias)) {
      const nombreAlias = campoXml(alias, 'ALIAS_NAME')
      if (nombreAlias === '') continue
      const calidad = campoXml(alias, 'QUALITY')
      entradas.push({
        nombre: nombreAlias,
        tipo: 'alias',
        rfc: null,
        datos: {
          ...base,
          principal: nombre,
          ...(calidad === '' ? {} : { calidad_alias: calidad }),
        },
      })
    }
  }

  for (const b of bloquesXml(texto, 'INDIVIDUAL')) {
    const nombre = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME']
      .map((e) => campoXml(b, e))
      .filter((v) => v !== '')
      .join(' ')
      .trim()
    agregar(b, nombre, 'individual', 'INDIVIDUAL_ALIAS')
  }

  for (const b of bloquesXml(texto, 'ENTITY')) {
    agregar(b, campoXml(b, 'FIRST_NAME'), 'entity', 'ENTITY_ALIAS')
  }

  if (entradas.length === 0) {
    throw new ArchivoDeListaInvalido(
      'La lista de la ONU no produjo ninguna entrada: el documento existe pero no trae ' +
        '<INDIVIDUAL> ni <ENTITY> legibles. O cambió el formato, o la descarga se truncó.',
    )
  }
  return entradas
}

export const PARSERS: Record<string, (texto: string) => EntradaDeLista[]> = {
  ofac_sdn: parseOfacSdn,
  onu: parseOnu,
  sat_69b: parseSat69b,
  generico: parseGenerico,
}
