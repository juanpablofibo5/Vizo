'use server'

import { conBase } from '../../src/supabase/conexion'
import { emitirMer, MerNoEmitido } from '../../src/persistencia/mer'
import { DatoDeRiesgoInvalido } from '../../src/persistencia/riesgo'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Emitir el MER y bajarlo.
 *
 * El mismo criterio que la Constancia (ADR-20, ADR-29): emitir es un acto, no
 * una descarga. El texto se congela, se hashea y queda en bitácora con quién y
 * cuándo, porque el Manual va a referenciarlo (Art. 37 ¶2) y una referencia a
 * un blanco móvil no es una referencia. Emitir dos veces sin que nada cambie
 * devuelve el MISMO documento — dos evidencias de un solo hecho serían mentira.
 */

export interface EstadoEmisionMer {
  archivo: { nombre: string; contenido: string } | null
  mensaje: string | null
  error: string | null
}

export async function emitirYDescargarMer(
  _previo: EstadoEmisionMer,
  _datos: FormData,
): Promise<EstadoEmisionMer> {
  try {
    const r = await conBase(async ({ db, sesion, obligado }) => {
      const hoy = hoyEnMexico()
      const emitido = await emitirMer(db, { sesion, hoy })
      return {
        nueva: emitido.nueva,
        hash: emitido.hash,
        version: emitido.version,
        archivo: {
          nombre: `mer-v${String(emitido.version)}-${obligado.rfc}-${hoy}.md`,
          contenido: emitido.contenido,
        },
      }
    })

    return {
      archivo: r.archivo,
      mensaje: r.nueva
        ? `MER de la metodología v${String(r.version)} emitido. Huella SHA-256: ${r.hash.slice(0, 16)}… — con esa huella lo referencia el Manual.`
        : `Ya había un MER idéntico de hoy, así que se devuelve ese — emitir dos veces sin que nada cambie no crea dos evidencias. Huella: ${r.hash.slice(0, 16)}…`,
      error: null,
    }
  } catch (e) {
    if (e instanceof DatoDeRiesgoInvalido || e instanceof MerNoEmitido) {
      return { archivo: null, mensaje: null, error: e.message }
    }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(bruto)) {
      return {
        archivo: null,
        mensaje: null,
        error:
          'Solo un administrador emite el MER: es el documento que el obligado adopta como su metodología.',
      }
    }
    return { archivo: null, mensaje: null, error: bruto }
  }
}
