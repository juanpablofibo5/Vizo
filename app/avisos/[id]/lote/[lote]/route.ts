import { conBase, leerComoUsuario } from '../../../../../src/supabase/conexion'
import { almacenAvisos } from '../../../../../src/supabase/almacen'

/**
 * La descarga del lote.
 *
 * Es el punto en que el sistema deja de ser una promesa: sin esto, el
 * Representante no tiene qué subir al portal y todo el pipeline termina en una
 * fila de base de datos.
 *
 * La ruta del archivo se resuelve DESDE LA BASE con la sesión del usuario, no
 * desde la URL. Si viniera de la URL, cambiar un número bajaría el aviso de
 * otro obligado — y las políticas de Storage lo impedirían, pero la primera
 * defensa es no dejar que se pueda pedir.
 */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string; lote: string }> },
): Promise<Response> {
  const { id, lote } = await params

  return conBase(async ({ db, sesion }) => {
    const fila = await leerComoUsuario(db, sesion, async () => {
      const r = await db.query(
        `select storage_path, lote from aviso_lotes
          where tenant_id = $1 and aviso_id = $2 and lote = $3::int`,
        [sesion.tenantId, id, lote],
      )
      return r.rows[0] as { storage_path: string; lote: number } | undefined
    })

    if (fila === undefined) {
      return new Response('No existe ese lote en este obligado.', { status: 404 })
    }

    const bytes = await (await almacenAvisos()).descargar(fila.storage_path)
    const nombre = `aviso-${id.slice(0, 8)}-lote-${String(fila.lote).padStart(3, '0')}.xml`

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        // Un aviso es evidencia: no se cachea en ningún intermediario.
        'Cache-Control': 'no-store',
      },
    })
  })
}
