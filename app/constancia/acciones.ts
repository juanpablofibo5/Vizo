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
      const r = await leerComoUsuario(db, sesion, () => armarConstancia(db, { sesion, hoy }))

      // Antes del 30 de noviembre de 2026 el Art. 37 Bis no rige, así que lo
      // que se descarga es una vista anticipada — y el archivo lo dice arriba,
      // con todas sus letras. Un documento anticipado que no se anuncia como
      // tal puede terminar entregado como si fuera el bueno.
      const anticipada = r.estado === 'aun_no_exigible'
      const c = anticipada ? r.vistaPrevia : r.constancia

      return {
        contenido: escribirConstancia(c, {
          razonSocial: obligado.razonSocial,
          rfc: obligado.rfc,
          fecha: hoy,
          ...(anticipada ? { anticipadaDesde: r.desde } : {}),
        }),
        nombre: anticipada
          ? `constancia-VISTA-ANTICIPADA-${obligado.rfc}-${hoy}.md`
          : `constancia-de-mecanismos-${obligado.rfc}-${hoy}.md`,
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
