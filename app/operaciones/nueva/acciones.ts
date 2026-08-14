'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { conBase } from '../../../src/supabase/conexion'
import {
  OperacionInvalida,
  montoCapturado,
  registrarOperacion,
} from '../../../src/persistencia/operaciones'

export interface EstadoOperacion {
  problemas: string[]
  /** Lo capturado, para no perderlo cuando algo falla (lección de la semana 5). */
  valores: Record<string, string>
}

/**
 * Alta de una operación.
 *
 * La validación NO vive aquí: vive en `registrarOperacion` y en el motor. Esta
 * función traduce el FormData al tipo del dominio y los errores del dominio a
 * algo que se pueda pintar.
 *
 * Nótese qué NO se recibe del formulario: la actividad, la fecha de captura y
 * el resultado de la evaluación. Las tres las decide el servidor. Un capturista
 * no elige bajo qué fracción se le evalúa ni a qué hora dice que capturó.
 */
export async function crearOperacion(
  _previo: EstadoOperacion,
  form: FormData,
): Promise<EstadoOperacion> {
  const valores: Record<string, string> = {}
  for (const [k, v] of form.entries()) if (typeof v === 'string') valores[k] = v

  const texto = (campo: string): string => String(form.get(campo) ?? '').trim()

  try {
    await conBase(async ({ db, sesion }) => {
      await registrarOperacion(db, {
        sesion,
        datos: {
          sucursalId: texto('sucursalId'),
          clienteId: texto('clienteId'),
          fechaOperacion: texto('fechaOperacion'),
          montoBase: montoCapturado(texto('montoBase'), 'Monto de la operación'),
          iva: montoCapturado(texto('iva'), 'IVA'),
          isai: montoCapturado(texto('isai'), 'ISAI'),
          otrosAccesorios: montoCapturado(texto('otrosAccesorios'), 'Otros accesorios'),
          formaPago: texto('formaPago'),
          // Lo que el AVISO describe. Va aquí y no en un valor por omisión del
          // servidor: adivinar el desarrollo o la moneda sería inventar un dato
          // que se le declara a la autoridad.
          desarrolloId: texto('desarrolloId') === '' ? undefined : texto('desarrolloId'),
          instrumentoMonetario:
            texto('instrumentoMonetario') === '' ? undefined : texto('instrumentoMonetario'),
          monedaCodigo: texto('monedaCodigo') === '' ? undefined : texto('monedaCodigo'),
          aportacionFideicomiso: texto('aportacionFideicomiso') === 'si',
          nombreInstitucion:
            texto('nombreInstitucion') === '' ? undefined : texto('nombreInstitucion'),
          descripcionBien: texto('descripcionBien') === '' ? undefined : texto('descripcionBien'),
          corrigeA: texto('corrigeA') === '' ? undefined : texto('corrigeA'),
        },
      })
    })
  } catch (e) {
    if (e instanceof OperacionInvalida) return { problemas: [...e.problemas], valores }
    return {
      problemas: [e instanceof Error ? e.message : 'Error inesperado al registrar.'],
      valores,
    }
  }

  revalidatePath('/operaciones')
  revalidatePath('/alertas')
  redirect('/operaciones')
}
