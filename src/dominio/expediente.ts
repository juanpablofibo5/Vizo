/**
 * Completitud del expediente.
 *
 * Quién decide qué falta: el CATÁLOGO (`campos_expediente`), no este archivo.
 * Aquí solo se cruza lo que el catálogo exige contra lo que hay. Agregar un
 * documento obligatorio es una fila nueva; quitarlo es cerrar su vigencia. Si
 * alguna vez hace falta editar este archivo para cambiar qué integra un
 * expediente, la Capa 0 dejó de servir.
 */

export type TipoDatoCampo = 'texto' | 'fecha' | 'monto' | 'catalogo' | 'documento'

export interface CampoExpediente {
  campo: string
  etiqueta: string
  tipoDato: TipoDatoCampo
  obligatorio: boolean
  /** Columna de `clientes_finales` que lo satisface. Solo si no es documento. */
  columna?: string | undefined
  orden: number
}

export interface Faltante {
  campo: string
  etiqueta: string
  tipoDato: TipoDatoCampo
}

export interface Completitud {
  estatus: 'incompleto' | 'completo'
  faltantes: Faltante[]
  /** Obligatorios satisfechos / obligatorios totales. */
  cubiertos: number
  totalObligatorios: number
}

export class CatalogoDeExpedienteVacio extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'CatalogoDeExpedienteVacio'
  }
}

export class CampoSinOrigen extends Error {
  constructor(campo: string) {
    super(
      `El campo "${campo}" no es documento y no dice de qué columna sale ` +
        '(validacion->>\'columna\' en campos_expediente). No se puede saber si está cubierto.',
    )
    this.name = 'CampoSinOrigen'
  }
}

/**
 * Cruza el catálogo contra lo capturado.
 *
 * @param campos       Campos VIGENTES a la fecha, ya filtrados por tipo de persona.
 * @param datosCliente Fila de `clientes_finales` como objeto.
 * @param conDocumento Campos que tienen un documento vigente que los satisface.
 */
export function calcularCompletitud(
  campos: readonly CampoExpediente[],
  datosCliente: Readonly<Record<string, unknown>>,
  conDocumento: ReadonlySet<string>,
): Completitud {
  // REGLA DURA 6, y este es el caso caro.
  //
  // Con el catálogo vacío no hay ningún obligatorio que incumplir, así que el
  // expediente saldría COMPLETO. De ahí pasa a aprobado, y de aprobado a un
  // aviso presentado sobre un expediente que nunca se integró. Un catálogo que
  // no cargó y un expediente genuinamente completo se ven idénticos desde
  // aquí; la única diferencia es que uno de los dos es indefendible.
  //
  // Así que no se asume: se detiene.
  if (campos.length === 0) {
    throw new CatalogoDeExpedienteVacio(
      'No hay campos de expediente vigentes para esta actividad y fecha. ' +
        'Sin catálogo no se puede afirmar que un expediente esté completo: ' +
        'revisa campos_expediente y sus vigencias.',
    )
  }

  const obligatorios = campos.filter((c) => c.obligatorio)
  const faltantes: Faltante[] = []

  for (const c of obligatorios) {
    if (!estaCubierto(c, datosCliente, conDocumento)) {
      faltantes.push({ campo: c.campo, etiqueta: c.etiqueta, tipoDato: c.tipoDato })
    }
  }

  faltantes.sort(
    (a, b) =>
      (obligatorios.find((c) => c.campo === a.campo)?.orden ?? 0) -
      (obligatorios.find((c) => c.campo === b.campo)?.orden ?? 0),
  )

  return {
    estatus: faltantes.length === 0 ? 'completo' : 'incompleto',
    faltantes,
    cubiertos: obligatorios.length - faltantes.length,
    totalObligatorios: obligatorios.length,
  }
}

function estaCubierto(
  c: CampoExpediente,
  datos: Readonly<Record<string, unknown>>,
  conDocumento: ReadonlySet<string>,
): boolean {
  if (c.tipoDato === 'documento') {
    return conDocumento.has(c.campo)
  }

  // Un campo de dato sin columna no se puede evaluar. Tratarlo como cubierto
  // inflaría la completitud; tratarlo como faltante dejaría el expediente
  // incompleto para siempre sin que nadie pueda explicar por qué. Ninguna de
  // las dos es aceptable, así que revienta.
  if (c.columna === undefined || c.columna === '') {
    throw new CampoSinOrigen(c.campo)
  }

  return tieneValor(datos[c.columna])
}

/**
 * Un valor cuenta como capturado si no es nulo y no está en blanco.
 *
 * La cadena vacía y `{}` importan: un domicilio guardado como `{}` es una fila
 * con dato y un expediente sin domicilio.
 */
function tieneValor(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false
  if (typeof valor === 'string') return valor.trim() !== ''
  if (Array.isArray(valor)) return valor.length > 0
  if (typeof valor === 'object') return Object.keys(valor as object).length > 0
  return true
}
