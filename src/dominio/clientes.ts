import { normalizarClave } from '../persistencia/historial'

/**
 * Reglas del alta de clientes.
 *
 * REGLA DURA 6: la entrada humana es la frontera menos confiable del sistema.
 * Un RFC con un dígito de más no revienta nada — se guarda, y meses después el
 * aviso se rechaza en el portal o, peor, la acumulación no reconoce al mismo
 * cliente y se omite un aviso. Por eso se valida al capturar, no al generar.
 *
 * SOBRE LOS PATRONES: los formatos de RFC y CURP salen del XSD oficial
 * (`regulatorio/xsd/din.xsd`). No son umbrales ni valores regulatorios
 * versionados —son la forma de un identificador fiscal, estable desde hace
 * décadas— así que viven aquí y no en el catálogo. Un test lee el XSD y
 * verifica que estas expresiones siguen siendo las suyas: si el SAT publica un
 * XSD con otro formato, el test falla.
 */

/** `rfc_fisica_type` del XSD: cuatro letras iniciales. */
export const PATRON_RFC_FISICA = /^[A-ZÑ&%+]{4}\d{6}[A-Z0-9]{3}$/
/** `rfc_moral_type` del XSD: tres letras iniciales. */
export const PATRON_RFC_MORAL = /^[A-ZÑ&%+]{3}\d{6}[A-Z0-9]{3}$/
/** `curp_type` del XSD. */
export const PATRON_CURP = /^[A-Z]{4}\d{6}[MH][A-Z]{5}[A-Z0-9]{2}$/

export type TipoPersona = 'fisica' | 'moral' | 'fideicomiso'

export class DatosDeClienteInvalidos extends Error {
  readonly problemas: readonly string[]
  constructor(problemas: readonly string[]) {
    super(problemas.join(' '))
    this.name = 'DatosDeClienteInvalidos'
    this.problemas = problemas
  }
}

export interface DatosAltaCliente {
  tipoPersona: TipoPersona
  /** Persona física: nombre de pila. Moral o fideicomiso: razón social. */
  nombreORazonSocial: string
  nombrePila?: string | undefined
  apellidoPaterno?: string | undefined
  apellidoMaterno?: string | undefined
  rfc?: string | undefined
  curp?: string | undefined
  fechaNacimientoOConstitucion?: string | undefined
  nacionalidad?: string | undefined
  /** Extranjero sin RFC: `{tipo_doc, numero, pais}`. */
  identidadAlterna?: { tipo_doc: string; numero: string; pais: string } | undefined
}

/** Los mismos datos, ya normalizados y listos para guardar. */
export interface ClienteNormalizado extends DatosAltaCliente {
  rfc: string | undefined
  curp: string | undefined
  requiereRevisionIdentidad: boolean
}

/**
 * Valida y normaliza el alta de un cliente.
 *
 * Devuelve los datos listos para guardar o lanza con TODOS los problemas
 * juntos: quien captura no debería descubrir los errores de uno en uno.
 */
export function prepararAltaCliente(datos: DatosAltaCliente): ClienteNormalizado {
  const problemas: string[] = []

  const rfc = normalizarClave(datos.rfc) ?? undefined
  const curp = normalizarClave(datos.curp) ?? undefined
  const nombre = colapsarEspacios(datos.nombreORazonSocial)

  if (nombre === '') {
    problemas.push('Falta el nombre o la razón social.')
  }

  // El RFC de persona física y el de moral son formatos DISTINTOS (4 letras
  // contra 3). Validar contra el que no toca deja pasar RFC inválidos.
  if (rfc !== undefined) {
    const patron = datos.tipoPersona === 'fisica' ? PATRON_RFC_FISICA : PATRON_RFC_MORAL
    if (!patron.test(rfc)) {
      const forma = datos.tipoPersona === 'fisica' ? '4 letras' : '3 letras'
      problemas.push(
        `El RFC "${rfc}" no tiene el formato de persona ${datos.tipoPersona} (${forma}, 6 dígitos de fecha y 3 de homoclave).`,
      )
    }
  }

  if (curp !== undefined && !PATRON_CURP.test(curp)) {
    problemas.push(`La CURP "${curp}" no tiene el formato oficial de 18 caracteres.`)
  }

  if (datos.tipoPersona === 'fisica') {
    // El XSD pide nombre y apellidos POR SEPARADO. Partir un nombre completo
    // después es adivinar dónde termina el apellido paterno, y en un aviso
    // regulatorio eso no se adivina (docs/campos-aviso.md §3).
    if (colapsarEspacios(datos.nombrePila ?? '') === '') {
      problemas.push('Falta el nombre de pila: el aviso lo pide separado de los apellidos.')
    }
    if (colapsarEspacios(datos.apellidoPaterno ?? '') === '') {
      problemas.push('Falta el apellido paterno: el aviso lo pide separado.')
    }
    if (curp === undefined && rfc === undefined && datos.identidadAlterna === undefined) {
      problemas.push('Una persona física necesita RFC, CURP o un documento de identidad alterno.')
    }
  }

  if (datos.tipoPersona !== 'fisica' && rfc === undefined && datos.identidadAlterna === undefined) {
    problemas.push('Una persona moral o fideicomiso necesita RFC o identidad alterna.')
  }

  if (datos.fechaNacimientoOConstitucion !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaNacimientoOConstitucion)) {
      problemas.push('La fecha debe venir como AAAA-MM-DD.')
    }
  }

  if (datos.nacionalidad !== undefined && !/^[A-Z]{2}$/.test(datos.nacionalidad)) {
    problemas.push('La nacionalidad es el código de país de 2 letras (MX, US, ES).')
  }

  if (datos.identidadAlterna !== undefined) {
    const { tipo_doc, numero, pais } = datos.identidadAlterna
    if (colapsarEspacios(tipo_doc) === '' || colapsarEspacios(numero) === '') {
      problemas.push('La identidad alterna necesita tipo de documento y número.')
    }
    if (!/^[A-Z]{2}$/.test(pais)) {
      problemas.push('El país de la identidad alterna es el código de 2 letras.')
    }
  }

  if (problemas.length > 0) {
    throw new DatosDeClienteInvalidos(problemas)
  }

  return {
    ...datos,
    nombreORazonSocial: nombre,
    rfc,
    curp,
    // Sin RFC ni CURP la identidad se resuelve por documento alterno, y eso
    // escala a revisión humana en cada evaluación: el motor acumula
    // conservadoramente pero no se confía. Ver caso A-05 y POR CONFIRMAR-2.
    requiereRevisionIdentidad: rfc === undefined && curp === undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Beneficiario controlador
// ─────────────────────────────────────────────────────────────────────────

/**
 * Umbral de participación del beneficiario controlador.
 *
 * Bajó de 50% a 25% con la reforma de 2025. Se expone como constante nombrada
 * para que la UI pueda avisar, pero NO se usa para rechazar: la ley obliga a
 * identificar a quien controla, y el control puede ejercerse por otras vías
 * además de la participación accionaria (`control_por = 'control_efectivo'`).
 */
export const PARTICIPACION_BENEFICIARIO_PCT = 25

export interface DatosBeneficiario {
  nombre: string
  rfc?: string | undefined
  curp?: string | undefined
  participacionPct?: number | undefined
  controlPor: 'participacion' | 'control_efectivo'
  /** true cuando es la declaración de que NO existe beneficiario controlador. */
  esDeclaracion: boolean
}

export function prepararBeneficiario(b: DatosBeneficiario): DatosBeneficiario {
  const problemas: string[] = []
  const rfc = normalizarClave(b.rfc) ?? undefined
  const curp = normalizarClave(b.curp) ?? undefined

  if (!b.esDeclaracion && colapsarEspacios(b.nombre) === '') {
    problemas.push('Falta el nombre del beneficiario controlador.')
  }

  if (b.participacionPct !== undefined) {
    if (!Number.isFinite(b.participacionPct) || b.participacionPct < 0 || b.participacionPct > 100) {
      problemas.push('La participación debe estar entre 0 y 100.')
    }
  }

  if (b.controlPor === 'participacion' && b.participacionPct === undefined && !b.esDeclaracion) {
    problemas.push('Si el control es por participación, hay que capturar el porcentaje.')
  }

  // El RFC de un beneficiario puede ser de física o de moral (una empresa
  // puede controlar a otra), así que se acepta cualquiera de los dos formatos.
  if (rfc !== undefined && !PATRON_RFC_FISICA.test(rfc) && !PATRON_RFC_MORAL.test(rfc)) {
    problemas.push(`El RFC "${rfc}" del beneficiario no tiene formato válido.`)
  }
  if (curp !== undefined && !PATRON_CURP.test(curp)) {
    problemas.push(`La CURP "${curp}" del beneficiario no tiene formato válido.`)
  }

  if (problemas.length > 0) {
    throw new DatosDeClienteInvalidos(problemas)
  }

  return { ...b, nombre: colapsarEspacios(b.nombre), rfc, curp }
}

/**
 * ¿Este cliente necesita declarar beneficiario controlador?
 *
 * Personas morales y fideicomisos: sí, siempre. Personas físicas: se recaba la
 * declaración de si existe o no, que también es una obligación —por eso el
 * esquema tiene `es_declaracion`.
 */
export function requiereBeneficiario(tipoPersona: TipoPersona): boolean {
  return tipoPersona === 'moral' || tipoPersona === 'fideicomiso'
}

function colapsarEspacios(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ')
}
