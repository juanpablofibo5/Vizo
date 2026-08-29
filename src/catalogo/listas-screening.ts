/**
 * Los parsers de las listas de control (issue #34).
 *
 * Puros: reciben el TEXTO del archivo descargado y devuelven entradas
 * normalizables. Ni red ni base — el script de carga (scripts/) pone la red y
 * la conexión, y los tests los ejercitan con fixtures. Cada formato tiene sus
 * mañas y están escritas donde muerden.
 *
 * Formatos con parser hoy: OFAC SDN (sdn.csv) · SAT 69-B (CSV, latin1) ·
 * genérico (nombre[,rfc], UTF-8). ONU (XML) y LPB quedan documentados en el
 * runbook 06 como pendientes — cargar una lista a medias es peor que no
 * cargarla, porque la consulta diría «consultada» sobre datos incompletos.
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
    entradas.push({
      nombre,
      tipo: tipo === '' || tipo === '-0-' ? null : tipo.toLowerCase(),
      rfc: null,
      datos: programa === '' || programa === '-0-' ? {} : { programa },
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

export const PARSERS: Record<string, (texto: string) => EntradaDeLista[]> = {
  ofac_sdn: parseOfacSdn,
  sat_69b: parseSat69b,
  generico: parseGenerico,
}
