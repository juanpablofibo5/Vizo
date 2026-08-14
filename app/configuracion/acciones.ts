'use server'

import { revalidatePath } from 'next/cache'
import { conBase } from '../../src/supabase/conexion'
import {
  FechaDeAltaInvalida,
  NoAutorizado,
  registrarFechaAlta,
} from '../../src/persistencia/obligado'

/**
 * Configuración del obligado.
 *
 * La fecha de alta ante la autoridad es el dato más consecuente de esta
 * pantalla: de él depende desde cuándo VIZO reclama informes en cero. Por eso
 * el cambio se registra en la bitácora — corregirlo mueve la lista de
 * obligaciones pendientes, y eso tiene que poder explicarse.
 */

export interface Resultado {
  ok: boolean
  mensaje: string
}

export async function guardarFechaAlta(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const fecha = String(datos.get('fechaAlta') ?? '').trim()

  try {
    const guardada = await conBase(({ db, sesion }) => registrarFechaAlta(db, { sesion, fecha }))

    revalidatePath('/configuracion')
    revalidatePath('/avisos')
    revalidatePath('/')
    return {
      ok: true,
      mensaje: `Fecha de alta registrada: ${guardada}. Los periodos pendientes se recalculan desde ahí.`,
    }
  } catch (e) {
    if (e instanceof FechaDeAltaInvalida || e instanceof NoAutorizado) {
      return { ok: false, mensaje: e.message }
    }

    const bruto = e instanceof Error ? e.message : String(e)
    if (/fecha_alta_autoridad_plausible/.test(bruto)) {
      return {
        ok: false,
        mensaje:
          'Esa fecha no es posible: el alta no puede ser futura ni anterior a la entrada en vigor de la Ley (17 de julio de 2013).',
      }
    }
    if (/row-level security|permission denied/i.test(bruto)) {
      return {
        ok: false,
        mensaje: 'Solo un administrador puede cambiar la configuración del obligado.',
      }
    }
    return { ok: false, mensaje: bruto }
  }
}

/*
 * NOTA DE SEGURIDAD, de la auditoría de F1.
 *
 * Aquí vivía `usuariosDelObligado`, exportada y usada por nadie: la pantalla de
 * configuración lee los usuarios directamente en su Server Component.
 *
 * En un módulo `'use server'` eso NO es código muerto normal. Next convierte
 * CADA export en un endpoint invocable desde el navegador, así que una función
 * sin usar es superficie de ataque sin contrapartida. Se borró.
 *
 * Regla para lo que venga: en un archivo `'use server'` no se exporta nada que
 * no se llame desde el cliente.
 */
