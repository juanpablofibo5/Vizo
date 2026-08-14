import type { Client } from 'pg'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'

/**
 * La configuración del obligado.
 *
 * La fecha de alta ante la autoridad es el dato más consecuente del portal: de
 * él depende desde qué mes VIZO reclama informes en cero. Un obligado que se
 * dio de alta en marzo y no operó **debe** su informe de marzo, y sin esta
 * fecha nadie —ni el sistema— tiene cómo saberlo.
 *
 * Por eso el cambio se registra en la bitácora: corregirlo mueve la lista de
 * obligaciones pendientes, y eso tiene que poder explicarse después.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO VIVE AQUÍ Y NO EN LA ACCIÓN
 * ────────────────────────────────────────────────────────────────────────────
 * Estaba dentro del Server Action, y ahí no había forma de probarlo sin un
 * navegador. El formulario se envió a producción sin poder guardar nunca —
 * faltaban el `grant` y la política de UPDATE sobre `tenants`— y ninguna prueba
 * lo notó porque ninguna prueba podía ejercerlo. Movido aquí, es una función
 * que la suite llama con una sesión de verdad.
 */

export class FechaDeAltaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'FechaDeAltaInvalida'
  }
}

export class NoAutorizado extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'NoAutorizado'
  }
}

export async function registrarFechaAlta(
  db: Client,
  p: { sesion: ContextoSesion; fecha: string },
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) {
    throw new FechaDeAltaInvalida('La fecha debe tener la forma AAAA-MM-DD.')
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(
      `update tenants set fecha_alta_autoridad = $2::date where id = $1`,
      [p.sesion.tenantId, p.fecha],
    )

    // Cero filas bajo RLS significa que la política no dejó pasar la
    // actualización, y la política pide dos cosas: que la fila sea del obligado
    // de la sesión y que quien escribe sea admin. Lo primero no puede fallar
    // —el id sale de la propia sesión—, así que lo que queda es el rol.
    if (r.rowCount !== 1) {
      throw new NoAutorizado(
        'Solo un administrador puede cambiar la configuración del obligado.',
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'obligado.fecha_alta_registrada',
      'tenant',
      p.sesion.tenantId,
      JSON.stringify({ fecha_alta_autoridad: p.fecha }),
      p.sesion.usuarioId,
    ])

    return p.fecha
  })
}
