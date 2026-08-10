import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteServidor } from './servidor'
import type { AlmacenDocumentos } from '../persistencia/documentos'

/**
 * Adaptador de Storage sobre supabase-js.
 *
 * Va por la sesión del usuario (llave publicable + cookie), NO por la llave de
 * servicio: así las políticas de `storage.objects` deciden qué carpeta puede
 * tocar. Con la llave de servicio funcionaría igual de bien y sin aislamiento
 * ninguno, que es la clase de atajo que la auditoría de la semana 5 encontró
 * en el camino de escritura de la base.
 */
export const BUCKET_EXPEDIENTES = 'expedientes'

/**
 * El XML del aviso y su acuse van en SU PROPIO bucket.
 *
 * `expedientes` solo admite PDF e imágenes, y ensanchar esa lista para que
 * cupiera un XML abriría la puerta a subir XML donde va una identificación. Lo
 * que se le entrega a la autoridad y lo que prueba que se entregó tampoco
 * comparten conservación con los datos personales del expediente.
 */
export const BUCKET_AVISOS = 'avisos'

export function almacenSobre(
  cliente: SupabaseClient,
  nombreBucket: string = BUCKET_EXPEDIENTES,
): AlmacenDocumentos {
  const bucket = cliente.storage.from(nombreBucket)

  return {
    async subir(ruta, bytes, mime) {
      const { error } = await bucket.upload(ruta, bytes, {
        contentType: mime,
        // NUNCA sobrescribir. El bucket no tiene política de UPDATE ni de
        // DELETE: un documento de expediente es evidencia, y corregir es subir
        // uno nuevo con `reemplaza_a`, no pisar el anterior.
        upsert: false,
      })
      if (error !== null) throw error
    },

    async descargar(ruta) {
      const { data, error } = await bucket.download(ruta)
      if (error !== null) throw error
      // Los bytes tal cual. Nada de texto, nada de reencodear: el hash se
      // verifica contra esto y cualquier transformación lo rompería.
      return new Uint8Array(await data.arrayBuffer())
    },
  }
}

export async function almacenExpedientes(): Promise<AlmacenDocumentos> {
  return almacenSobre(await clienteServidor(), BUCKET_EXPEDIENTES)
}

export async function almacenAvisos(): Promise<AlmacenDocumentos> {
  return almacenSobre(await clienteServidor(), BUCKET_AVISOS)
}
