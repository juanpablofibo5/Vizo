'use server'

import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { armarConstancia } from '../../src/persistencia/constancia'
import { escribirConstancia } from '../../src/dominio/constancia-texto'
import { CatalogoDelManualVacio } from '../../src/dominio/constancia'
import { RecolectorDesconocido } from '../../src/persistencia/constancia'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Generar el archivo de la Constancia.
 *
 * La evidencia se recolecta EN EL SERVIDOR, contra la base y con la sesión del
 * usuario, así que RLS decide qué se puede ver. El navegador solo recibe el
 * texto ya armado: no hay forma de pedir la constancia de otro obligado.
 */

export interface EstadoDescarga {
  texto: { nombre: string; contenido: string } | null
  error: string | null
}

export async function descargarConstancia(
  _previo: EstadoDescarga,
  _datos: FormData,
): Promise<EstadoDescarga> {
  try {
    const { contenido, nombre } = await conBase(async ({ db, sesion, obligado }) => {
      const hoy = hoyEnMexico()
      const c = await leerComoUsuario(db, sesion, () => armarConstancia(db, { sesion, hoy }))

      return {
        contenido: escribirConstancia(c, {
          razonSocial: obligado.razonSocial,
          rfc: obligado.rfc,
          fecha: hoy,
        }),
        nombre: `constancia-de-mecanismos-${obligado.rfc}-${hoy}.md`,
      }
    })

    return { texto: { nombre, contenido }, error: null }
  } catch (e) {
    // Los dos errores de dominio ya traen un mensaje que dice qué hacer; el
    // resto se muestra crudo antes que inventar una explicación.
    if (e instanceof CatalogoDelManualVacio || e instanceof RecolectorDesconocido) {
      return { texto: null, error: e.message }
    }
    return {
      texto: null,
      error: e instanceof Error ? e.message : 'No se pudo generar la constancia.',
    }
  }
}
