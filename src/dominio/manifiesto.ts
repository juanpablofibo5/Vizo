import { createHash } from 'node:crypto'
import type { HashSha256 } from './documentos'

/**
 * El manifiesto del expediente: la foto que se defiende ante la autoridad.
 *
 * Es un JSON que dice, para una versión concreta de un expediente: qué
 * documentos lo integran y con qué huella, qué operaciones cubre, con qué
 * versión del catálogo se evaluó, y en qué punto estaba la bitácora. Su hash
 * queda registrado, y a futuro ese hash es lo que se sella con una constancia
 * NOM-151 (ADR-10) — sin rediseñar nada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY UNA SERIALIZACIÓN CANÓNICA Y NO SE USA JSON.stringify A SECAS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Un hash solo sirve si se puede RECOMPUTAR años después y dar lo mismo. Y ahí
 * hay una trampa que no se ve hasta que es tarde:
 *
 *   · `JSON.stringify` respeta el orden de inserción de las claves.
 *   · Postgres `jsonb` NO conserva ese orden: reordena por longitud de clave y
 *     luego por bytes.
 *
 * Así que si se hashea el objeto de JavaScript y se guarda en una columna
 * jsonb, al releerlo las claves vuelven en otro orden y el hash recomputado NO
 * coincide. El manifiesto verificaría en el instante de crearlo y fallaría
 * todas las veces siguientes — y nadie se enteraría hasta el día en que haya
 * que demostrar que un expediente no cambió, que es el peor momento posible.
 *
 * La solución es fijar UNA forma canónica: claves ordenadas alfabéticamente en
 * todos los niveles, sin espacios. Así el hash sale igual venga el manifiesto
 * del objeto recién armado o de la columna jsonb releída.
 *
 * REGLA ACOMPAÑANTE: ningún número flota aquí. Los montos van como TEXTO, tal
 * como los devuelve Postgres. Un `numeric` que pasa por el `number` de
 * JavaScript puede volver con otro valor, y entonces el hash cambia sin que
 * nada haya cambiado.
 */

export type ValorCanonico =
  | string
  | boolean
  | null
  | ValorCanonico[]
  | { [clave: string]: ValorCanonico }

export class ManifiestoInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ManifiestoInvalido'
  }
}

/**
 * Serializa de forma determinista: mismo contenido, misma cadena, siempre.
 *
 * Los OBJETOS se ordenan por clave; los ARREGLOS conservan su orden, porque en
 * un arreglo el orden es información (la secuencia de la bitácora, por
 * ejemplo). Quien construye el manifiesto decide el orden de las listas, y esa
 * decisión queda fijada en el hash.
 */
export function canonicalizar(valor: ValorCanonico): string {
  if (valor === null) return 'null'
  if (typeof valor === 'boolean') return valor ? 'true' : 'false'
  if (typeof valor === 'string') return JSON.stringify(valor)

  if (Array.isArray(valor)) {
    return `[${valor.map(canonicalizar).join(',')}]`
  }

  if (typeof valor === 'number') {
    // Inalcanzable por tipos, pero un `as` en el borde podría colarlo. Un
    // número aquí es exactamente lo que rompe la reproducibilidad del hash.
    throw new ManifiestoInvalido(
      `El manifiesto no admite números (llegó ${String(valor)}). Los montos van como texto: ` +
        'un numeric de Postgres que pasa por el number de JavaScript puede volver distinto.',
    )
  }

  const claves = Object.keys(valor).sort()
  const partes = claves.map((k) => `${JSON.stringify(k)}:${canonicalizar(valor[k] as ValorCanonico)}`)
  return `{${partes.join(',')}}`
}

/** El hash del manifiesto: SHA-256 de su forma canónica. */
export function hashDeManifiesto(manifiesto: ValorCanonico): HashSha256 {
  return createHash('sha256').update(canonicalizar(manifiesto), 'utf8').digest('hex') as HashSha256
}

// ─────────────────────────────────────────────────────────────────────────
// La forma del manifiesto
// ─────────────────────────────────────────────────────────────────────────

export interface DocumentoDelManifiesto {
  campo: string
  hashSha256: string
  tamanoBytes: string
  mime: string
  /** Momento en que se registró, en UTC. */
  registradoEn: string
}

export interface OperacionDelManifiesto {
  id: string
  fechaOperacion: string
  montoBase: string
  montoTotal: string
  formaPago: string
  resultadoAviso: string
}

export interface InsumosManifiesto {
  expedienteId: string
  version: string
  clienteId: string
  actividad: string
  estatus: string
  completitud: { estatus: string; cubiertos: string; totalObligatorios: string }
  /** Ordenados por campo y luego por hash: el orden es parte del hash. */
  documentos: DocumentoDelManifiesto[]
  /** Ordenadas por fecha y luego por id. */
  operaciones: OperacionDelManifiesto[]
  catalogoVersion: string
  /** Hash del último eslabón de la bitácora del obligado al generar. */
  hashBitacoraCabeza: string
  generadoEn: string
}

/**
 * Arma el manifiesto.
 *
 * NO lleva nombre, RFC ni CURP de nadie: el manifiesto puede terminar en manos
 * de un tercero de confianza para sellarlo (regla dura 3). Lleva IDs opacos y
 * huellas, que es exactamente lo que hace falta para demostrar que el
 * expediente no cambió — sin revelar qué contiene.
 */
export function construirManifiesto(i: InsumosManifiesto): ValorCanonico {
  if (i.documentos.length === 0 && i.operaciones.length === 0) {
    throw new ManifiestoInvalido(
      'Un manifiesto sin documentos ni operaciones no acredita nada. Si el expediente está ' +
        'realmente vacío, no hay qué sellar todavía.',
    )
  }

  return {
    version_formato: '1',
    expediente: {
      id: i.expedienteId,
      version: i.version,
      cliente_id: i.clienteId,
      actividad: i.actividad,
      estatus: i.estatus,
      completitud: {
        estatus: i.completitud.estatus,
        cubiertos: i.completitud.cubiertos,
        total_obligatorios: i.completitud.totalObligatorios,
      },
    },
    documentos: i.documentos.map((d) => ({
      campo: d.campo,
      hash_sha256: d.hashSha256,
      tamano_bytes: d.tamanoBytes,
      mime: d.mime,
      registrado_en: d.registradoEn,
    })),
    operaciones: i.operaciones.map((o) => ({
      id: o.id,
      fecha_operacion: o.fechaOperacion,
      monto_base: o.montoBase,
      monto_total: o.montoTotal,
      forma_pago: o.formaPago,
      resultado_aviso: o.resultadoAviso,
    })),
    catalogo_version: i.catalogoVersion,
    bitacora_cabeza: i.hashBitacoraCabeza,
    generado_en: i.generadoEn,
  }
}
