'use server'

import { conBase } from '../../src/supabase/conexion'
import { emitirConstancia, NoAutorizadoAEmitir } from '../../src/persistencia/constancia'
import { escribirIndiceDelManual } from '../../src/dominio/indice-manual'
import { CatalogoDelManualVacio } from '../../src/dominio/constancia'
import { RecolectorDesconocido } from '../../src/persistencia/constancia'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Emitir la Constancia y armar el índice del Manual.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LOS DOS ARCHIVOS SALEN JUNTOS
 * ────────────────────────────────────────────────────────────────────────────
 * El índice del Manual **referencia** la Constancia por su huella (Art. 37 ¶2).
 * Entregarlo solo dejaría siete apartados apuntando a un documento que el
 * lector no tiene — un Manual con agujeros que parecen completos.
 *
 * Descargarlos por separado invitaría exactamente a ese error, así que un solo
 * acto produce los dos, y el índice cita la huella de la Constancia que acaba
 * de emitirse.
 *
 * La evidencia se recolecta EN EL SERVIDOR con la sesión del usuario, así que
 * RLS decide qué se ve: no hay forma de pedir la constancia de otro obligado.
 */

export interface Archivo {
  nombre: string
  contenido: string
}

export interface EstadoEmision {
  archivos: Archivo[] | null
  /** Qué pasó, para decirlo en pantalla. */
  mensaje: string | null
  error: string | null
}

export async function emitirYDescargar(
  _previo: EstadoEmision,
  _datos: FormData,
): Promise<EstadoEmision> {
  try {
    const r = await conBase(async ({ db, sesion, obligado }) => {
      const hoy = hoyEnMexico()
      const emitida = await emitirConstancia(db, { sesion, hoy })

      const indice = escribirIndiceDelManual(
        emitida.constancia,
        {
          razonSocial: obligado.razonSocial,
          rfc: obligado.rfc,
          fecha: hoy,
          ...(emitida.anticipadaDesde === null
            ? {}
            : { anticipadaDesde: emitida.anticipadaDesde }),
        },
        { fecha: emitida.fecha, hashSha256: emitida.hashSha256 },
      )

      const sufijo = emitida.anticipadaDesde === null ? '' : '-VISTA-ANTICIPADA'
      return {
        nueva: emitida.nueva,
        hash: emitida.hashSha256,
        archivos: [
          {
            nombre: `constancia-de-mecanismos${sufijo}-${obligado.rfc}-${hoy}.md`,
            contenido: emitida.contenido,
          },
          {
            nombre: `manual-indice${sufijo}-${obligado.rfc}-${hoy}.md`,
            contenido: indice,
          },
        ],
      }
    })

    return {
      archivos: r.archivos,
      mensaje: r.nueva
        ? `Constancia emitida. Huella SHA-256: ${r.hash.slice(0, 16)}… El índice del Manual la referencia por esa huella.`
        : `Ya había una constancia idéntica de hoy, así que se reusó — emitir dos veces sin que nada cambie no crea dos evidencias. Huella: ${r.hash.slice(0, 16)}…`,
      error: null,
    }
  } catch (e) {
    if (
      e instanceof CatalogoDelManualVacio ||
      e instanceof RecolectorDesconocido ||
      e instanceof NoAutorizadoAEmitir
    ) {
      return { archivos: null, mensaje: null, error: e.message }
    }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(bruto)) {
      return {
        archivos: null,
        mensaje: null,
        error:
          'Solo un administrador puede emitir la constancia: es el documento que el obligado adopta y que su Manual va a referenciar.',
      }
    }
    return { archivos: null, mensaje: null, error: bruto }
  }
}
