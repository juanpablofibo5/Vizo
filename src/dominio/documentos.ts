import { createHash } from 'node:crypto'

/**
 * Documentos del expediente: hash, ruta y validación de lo que entra.
 *
 * REGLA DURA 6, en su forma más literal. Un archivo externo es la frontera
 * menos confiable después de la entrada humana, y aquí el modo de falla no es
 * el crash: es un expediente que se ve completo con un PDF de cero bytes
 * dentro, o un hash que no corresponde al archivo guardado. Ninguna de las dos
 * cosas se nota hasta que alguien pide verificar el expediente, que es el peor
 * momento posible para enterarse.
 */

/** SHA-256 en hexadecimal minúscula: 64 caracteres. */
export type HashSha256 = string & { readonly __marca: 'sha256' }

export const PATRON_HASH = /^[0-9a-f]{64}$/

/**
 * El hash de los bytes EXACTOS que se van a guardar.
 *
 * No recibe una ruta ni un stream a propósito: recibe los bytes ya materia-
 * lizados, los mismos que se suben. Hashear un archivo que después se
 * recomprime, se reencoda o se vuelve a leer del disco produce un manifiesto
 * que no se puede defender — y el error solo aparece al verificar.
 */
export function calcularHash(bytes: Uint8Array): HashSha256 {
  return createHash('sha256').update(bytes).digest('hex') as HashSha256
}

export function esHashValido(valor: string): valor is HashSha256 {
  return PATRON_HASH.test(valor)
}

/**
 * La convención de ruta, en un solo lugar.
 *
 * `{tenant_id}/{expediente_id}/{documento_id}`
 *
 * El tenant va PRIMERO porque las políticas de `storage.objects` leen
 * `storage.foldername(name)[1]` para decidir quién puede ver el archivo. Si
 * esta función y la política dejaran de coincidir, el aislamiento entre
 * obligados se rompería en silencio: por eso la ruta se arma aquí y en ningún
 * otro lado, y hay un test que la contrasta contra la política real.
 */
export function rutaDocumento(
  tenantId: string,
  expedienteId: string,
  documentoId: string,
): string {
  for (const [nombre, valor] of [
    ['tenant', tenantId],
    ['expediente', expedienteId],
    ['documento', documentoId],
  ] as const) {
    if (!/^[0-9a-f-]{36}$/i.test(valor)) {
      throw new DocumentoInvalido(
        `El id de ${nombre} no parece un UUID ("${valor}"). La ruta de Storage es lo que ` +
          'aísla a un obligado de otro; no se arma con un valor de forma inesperada.',
      )
    }
  }
  return `${tenantId}/${expedienteId}/${documentoId}`
}

export class DocumentoInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'DocumentoInvalido'
  }
}

/**
 * Tipos aceptados. Duplica la lista del bucket (migración 015) a propósito:
 * el bucket rechaza en el borde y esto rechaza antes de gastar la subida, con
 * un mensaje que dice qué hacer. Un test verifica que las dos listas siguen
 * siendo la misma — si divergen, un archivo pasaría una validación y moriría
 * en la otra con un error de Storage que no explica nada.
 */
export const MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/** 20 MiB, el mismo límite del bucket. */
export const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024

export interface DocumentoRecibido {
  campo: string
  nombreArchivo: string
  mime: string
  bytes: Uint8Array
}

export interface DocumentoListo extends DocumentoRecibido {
  hash: HashSha256
  tamanoBytes: number
}

/**
 * Valida lo que llegó y calcula su hash. Lanza con TODOS los problemas juntos.
 */
export function prepararDocumento(d: DocumentoRecibido): DocumentoListo {
  const problemas: string[] = []

  if (d.campo.trim() === '') {
    problemas.push('Falta indicar qué campo del expediente satisface este documento.')
  }

  // Un archivo vacío es el caso peligroso: sube sin error, cuenta como
  // documento presente y deja el expediente "completo" sin evidencia dentro.
  if (d.bytes.byteLength === 0) {
    problemas.push('El archivo está vacío (0 bytes). No sirve como evidencia.')
  }

  if (d.bytes.byteLength > TAMANO_MAXIMO_BYTES) {
    const mb = (d.bytes.byteLength / 1024 / 1024).toFixed(1)
    problemas.push(`El archivo pesa ${mb} MB y el máximo son 20 MB.`)
  }

  if (!(MIMES_PERMITIDOS as readonly string[]).includes(d.mime)) {
    problemas.push(
      `El tipo "${d.mime}" no se acepta. Se admiten PDF, JPEG, PNG y WebP.`,
    )
  }

  if (problemas.length > 0) {
    throw new DocumentoInvalido(problemas.join(' '))
  }

  return {
    ...d,
    hash: calcularHash(d.bytes),
    tamanoBytes: d.bytes.byteLength,
  }
}
