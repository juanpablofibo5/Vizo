import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'
import {
  DocumentoInvalido,
  prepararDocumento,
  rutaDocumento,
  type DocumentoRecibido,
  type HashSha256,
} from '../dominio/documentos'

/**
 * Alta de documentos del expediente.
 *
 * Aquí conviven DOS sistemas que no comparten transacción: Postgres y Storage.
 * No hay commit de dos fases, así que el orden decide qué se rompe cuando algo
 * falla a la mitad, y las dos opciones NO son equivalentes:
 *
 *   subir → insertar   Si el insert falla, queda un archivo huérfano. Basura
 *                      inofensiva: nadie lo referencia.
 *   insertar → subir   Si la subida falla, la transacción revierte y no queda
 *                      ni fila ni archivo.
 *
 * Se elige el segundo. El primero tiene una ventana peor de la que parece: si
 * el proceso muere entre la subida y el insert, el expediente se queda con un
 * archivo que nadie sabe que existe. El segundo, en el mismo caso, no deja
 * nada — y "no pasó nada" siempre es más fácil de defender que "pasó algo a
 * medias" ante una autoridad.
 *
 * Consecuencia: la subida ocurre DENTRO de la transacción de Postgres. Es una
 * llamada de red dentro de una transacción, que en general se evita; aquí es
 * deliberado y acotado (un archivo de 20 MB como máximo).
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

/**
 * Lo que la persistencia necesita de Storage, y nada más.
 *
 * Es una interfaz y no el cliente de Supabase directo para que los tests
 * ejerciten el camino real —incluido el fallo de subida— sin depender de la
 * forma exacta del SDK.
 */
export interface AlmacenDocumentos {
  /** Sube los bytes. Lanza si no se pudo: el que llama revierte. */
  subir(ruta: string, bytes: Uint8Array, mime: string): Promise<void>
  /** Devuelve los bytes tal como están guardados, sin transformar. */
  descargar(ruta: string): Promise<Uint8Array>
}

export class FalloDeAlmacen extends Error {
  constructor(mensaje: string, readonly causa?: unknown) {
    super(mensaje)
    this.name = 'FalloDeAlmacen'
  }
}

export interface AltaDocumentoParams {
  sesion: ContextoSesion
  expedienteId: string
  documento: DocumentoRecibido
  /** Id del documento al que reemplaza. Corregir es una fila nueva, nunca un UPDATE. */
  reemplazaA?: string | undefined
}

export interface ResultadoDocumento {
  documentoId: string
  hash: HashSha256
  ruta: string
  tamanoBytes: number
}

export async function registrarDocumento(
  db: EjecutorTransaccional,
  almacen: AlmacenDocumentos,
  p: AltaDocumentoParams,
): Promise<ResultadoDocumento> {
  // Valida y hashea ANTES de abrir la transacción: no tiene sentido tocar la
  // base ni la red para descubrir que el archivo venía vacío.
  const listo = prepararDocumento(p.documento)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    // NIVEL 3, sobre lo que la migración 017 ya impide en la base.
    //
    // El propósito aquí NO es la seguridad —de eso se encarga la FK
    // compuesta— sino el mensaje. "violates foreign key constraint
    // documentos_reemplaza_mismo_campo" no le dice nada a quien captura.
    if (p.reemplazaA !== undefined) {
      const { rows } = await db.query(
        `select campo, expediente_id from documentos where id = $1`,
        [p.reemplazaA],
      )
      const previo = rows[0] as { campo: string; expediente_id: string } | undefined
      if (previo === undefined) {
        throw new DocumentoInvalido(
          `El documento ${p.reemplazaA} que se pretende reemplazar no existe en este obligado.`,
        )
      }
      if (previo.expediente_id !== p.expedienteId) {
        throw new DocumentoInvalido(
          'Ese documento pertenece a OTRO expediente. Un reemplazo nunca cruza expedientes: ' +
            'descubriría un requisito del cliente equivocado.',
        )
      }
      if (previo.campo !== listo.campo) {
        throw new DocumentoInvalido(
          `Se está subiendo un "${listo.campo}" que dice reemplazar a un "${previo.campo}". ` +
            'Un reemplazo sustituye al documento del MISMO campo; si no, el campo anterior ' +
            'queda descubierto sin que nadie lo note.',
        )
      }
    }

    // El id se pide primero porque la ruta lo contiene: sin él no se puede
    // insertar la fila con su `storage_path` definitivo.
    const { rows: idRows } = await db.query('select gen_random_uuid() as id')
    const documentoId = (idRows[0] as { id: string }).id
    const ruta = rutaDocumento(p.sesion.tenantId, p.expedienteId, documentoId)

    await db.query(
      `insert into documentos (
         id, tenant_id, expediente_id, campo, storage_path,
         hash_sha256, tamano_bytes, mime, reemplaza_a, subido_por
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        documentoId,
        p.sesion.tenantId,
        p.expedienteId,
        listo.campo,
        ruta,
        listo.hash,
        listo.tamanoBytes,
        listo.mime,
        p.reemplazaA ?? null,
        p.sesion.usuarioId,
      ],
    )

    // Si esto lanza, la transacción revierte y no queda rastro de la fila.
    try {
      await almacen.subir(ruta, listo.bytes, listo.mime)
    } catch (causa) {
      throw new FalloDeAlmacen(
        'No se pudo guardar el archivo en Storage; no quedó registrado nada. Vuelve a intentar.',
        causa,
      )
    }

    // REGLA DURA 3: el nombre del archivo NO se registra. "INE-Juan-Perez.pdf"
    // es dato personal y la bitácora se conserva diez años. El hash sí va: no
    // revela nada del contenido y es lo que permite demostrar, más adelante,
    // que el archivo verificado hoy es el mismo de entonces.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'documento.alta',
      'documento',
      documentoId,
      JSON.stringify({
        expediente_id: p.expedienteId,
        campo: listo.campo,
        hash_sha256: listo.hash,
        tamano_bytes: listo.tamanoBytes,
        mime: listo.mime,
        reemplaza_a: p.reemplazaA ?? null,
      }),
      p.sesion.usuarioId,
    ])

    return { documentoId, hash: listo.hash, ruta, tamanoBytes: listo.tamanoBytes }
  })
}
