'use server'

import { revalidatePath } from 'next/cache'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { enTransaccionDeSesion } from '../../src/persistencia/transaccion'

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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, mensaje: 'La fecha debe tener la forma AAAA-MM-DD.' }
  }

  try {
    const mensaje = await conBase(async ({ db, sesion }) =>
      enTransaccionDeSesion(db, sesion, async () => {
        const r = (await db.query(
          `update tenants set fecha_alta_autoridad = $2::date where id = $1`,
          [sesion.tenantId, fecha],
        )) as unknown as { rowCount: number }

        if (r.rowCount !== 1) {
          throw new Error(
            'No se pudo actualizar el obligado. Solo un administrador puede cambiar su configuración.',
          )
        }

        await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
          sesion.tenantId,
          'obligado.fecha_alta_registrada',
          'tenant',
          sesion.tenantId,
          JSON.stringify({ fecha_alta_autoridad: fecha }),
          sesion.usuarioId,
        ])

        return `Fecha de alta registrada: ${fecha}. Los periodos pendientes se recalculan desde ahí.`
      }),
    )
    revalidatePath('/configuracion')
    revalidatePath('/avisos')
    revalidatePath('/')
    return { ok: true, mensaje }
  } catch (e) {
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

export interface UsuarioDelObligado {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
}

export async function usuariosDelObligado(): Promise<UsuarioDelObligado[]> {
  return conBase(({ db, sesion }) =>
    leerComoUsuario(db, sesion, async () => {
      const r = await db.query(
        `select id::text, nombre, email, rol::text, activo
           from usuarios where tenant_id = $1 order by rol, nombre`,
        [sesion.tenantId],
      )
      return r.rows as UsuarioDelObligado[]
    }),
  )
}
