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
  /**
   * Antigüedad máxima del documento, en meses. Sale del catálogo
   * (`validacion->>'antiguedad_maxima_meses'`), nunca de aquí.
   *
   * Hoy la usa el comprobante de domicilio por el Art. 21 del Acuerdo
   * 115/2026, desde el 30 de noviembre de 2026. Si mañana otro documento la
   * necesita, es una fila del catálogo y este archivo no se entera.
   */
  antiguedadMaximaMeses?: number | undefined
  orden: number
}

/**
 * Por qué falta.
 *
 * `ausente` y `vencido` piden cosas distintas —conseguirlo contra pedirlo de
 * nuevo— y `sin_fecha_emision` pide una tercera: capturar un dato del documento
 * que ya está ahí. Un solo «falta» las volvería la misma tarea, y dos de las
 * tres se atenderían mal.
 */
export type MotivoFaltante = 'ausente' | 'vencido' | 'sin_fecha_emision'

export interface Faltante {
  campo: string
  etiqueta: string
  tipoDato: TipoDatoCampo
  motivo: MotivoFaltante
}

/** Lo que hay para un campo de tipo documento. */
export interface DocumentoDelCampo {
  /** `null` si se subió antes de que existiera la columna, o si no se capturó. */
  fechaEmision: string | null
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
 * @param documentos   Por campo, el documento vigente que lo satisface.
 * @param fechaReferencia La fecha contra la que se mide la antigüedad, 'AAAA-MM-DD'.
 *                     Es la MISMA con la que se eligieron los campos vigentes: un
 *                     expediente se juzga entero en una fecha, no a caballo entre dos.
 */
export function calcularCompletitud(
  campos: readonly CampoExpediente[],
  datosCliente: Readonly<Record<string, unknown>>,
  documentos: ReadonlyMap<string, DocumentoDelCampo>,
  fechaReferencia: string,
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
    const motivo = porQueFalta(c, datosCliente, documentos, fechaReferencia)
    if (motivo !== null) {
      faltantes.push({ campo: c.campo, etiqueta: c.etiqueta, tipoDato: c.tipoDato, motivo })
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

/** `null` si el campo está cubierto; el motivo si no. */
function porQueFalta(
  c: CampoExpediente,
  datos: Readonly<Record<string, unknown>>,
  documentos: ReadonlyMap<string, DocumentoDelCampo>,
  fechaReferencia: string,
): MotivoFaltante | null {
  if (c.tipoDato === 'documento') {
    const doc = documentos.get(c.campo)
    if (doc === undefined) return 'ausente'

    // Sin regla de antigüedad, tenerlo basta — que es como se comportó siempre
    // y como se sigue comportando para todo lo que el catálogo no acote.
    if (c.antiguedadMaximaMeses === undefined) return null

    // REGLA DURA 6. Con regla de antigüedad y sin fecha de emisión no se puede
    // afirmar que cumpla. Darlo por bueno sería el fallback razonable que este
    // proyecto no se permite: el documento existe, y no se sabe si sirve.
    if (doc.fechaEmision === null) return 'sin_fecha_emision'

    return dentroDeLaVentana(doc.fechaEmision, fechaReferencia, c.antiguedadMaximaMeses)
      ? null
      : 'vencido'
  }

  // Un campo de dato sin columna no se puede evaluar. Tratarlo como cubierto
  // inflaría la completitud; tratarlo como faltante dejaría el expediente
  // incompleto para siempre sin que nadie pueda explicar por qué. Ninguna de
  // las dos es aceptable, así que revienta.
  if (c.columna === undefined || c.columna === '') {
    throw new CampoSinOrigen(c.campo)
  }

  return tieneValor(datos[c.columna]) ? null : 'ausente'
}

/**
 * Si un documento emitido en `emision` sigue dentro de `meses` al `referencia`.
 *
 * Se cuenta en MESES DE CALENDARIO, no en días: la Ley dice «antigüedad no
 * mayor a tres meses» y tres meses desde el 30 de noviembre es el 28 de
 * febrero, no «noventa días». Aproximarlo con 90 días adelantaría o atrasaría
 * la frontera según el mes, que es justo donde una regla se equivoca.
 *
 * El desbordamiento de día se resuelve hacia atrás: si el 31 de marzo se
 * suman tres meses y junio no tiene 31, el límite es el 30 de junio. La otra
 * opción —rodar al 1 de julio— alargaría la ventana un día, y alargarla es la
 * dirección que produce incumplimiento.
 */
function dentroDeLaVentana(emision: string, referencia: string, meses: number): boolean {
  const anio = Number(emision.slice(0, 4))
  const mes = Number(emision.slice(5, 7))
  const dia = Number(emision.slice(8, 10))

  const totalMeses = mes - 1 + meses
  const anioLimite = anio + Math.floor(totalMeses / 12)
  const mesLimite = (totalMeses % 12) + 1
  const ultimoDia = new Date(Date.UTC(anioLimite, mesLimite, 0)).getUTCDate()
  const diaLimite = Math.min(dia, ultimoDia)

  const limite = `${String(anioLimite).padStart(4, '0')}-${String(mesLimite).padStart(2, '0')}-${String(diaLimite).padStart(2, '0')}`

  // Comparación de cadenas AAAA-MM-DD: es orden lexicográfico y cronológico a
  // la vez, y no mete zonas horarias donde no hacen falta.
  return referencia <= limite
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
