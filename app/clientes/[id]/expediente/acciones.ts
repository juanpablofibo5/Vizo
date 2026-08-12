'use server'

import { revalidatePath } from 'next/cache'
import { Client } from 'pg'
import { sesionRequerida } from '../../../../src/supabase/sesion'
import { almacenExpedientes } from '../../../../src/supabase/almacen'
import { registrarDocumento, FalloDeAlmacen } from '../../../../src/persistencia/documentos'
import {
  abrirExpediente,
  aprobarExpediente,
  recalcularCompletitud,
} from '../../../../src/persistencia/expediente'
import { DocumentoInvalido } from '../../../../src/dominio/documentos'
import { hoyEnMexico } from '../../../../src/dominio/fechas'

export interface EstadoSubida {
  problemas: string[]
  /** Hash del último documento subido: es lo que hace verificable el expediente. */
  ultimoHash?: string | undefined
}

function cadenaDeConexion(): string {
  const url = process.env['VIZO_DB_URL']
  if (url === undefined || url === '') {
    throw new Error('Falta VIZO_DB_URL. Cópiala de .env.example a .env.local.')
  }
  return url
}

/**
 * Hoy en México, no en UTC.
 *
 * Auditoría de la semana 6: esto era `toISOString().slice(0,10)`, que a partir
 * de las 18:00 en Mérida ya reportaba el día siguiente y resolvía la vigencia
 * del catálogo con la fecha equivocada. Ver `hoyEnMexico`.
 */
const hoy = hoyEnMexico

export async function abrir(clienteId: string): Promise<void> {
  const sesion = await sesionRequerida()
  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const { expedienteId } = await abrirExpediente(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
    })
    await recalcularCompletitud(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      expedienteId,
      fecha: hoy(),
    })
  } finally {
    await db.end()
  }
  revalidatePath(`/clientes/${clienteId}/expediente`)
}

export async function subirDocumento(
  _previo: EstadoSubida,
  form: FormData,
): Promise<EstadoSubida> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }

  const clienteId = String(form.get('clienteId') ?? '')
  const expedienteId = String(form.get('expedienteId') ?? '')
  const campo = String(form.get('campo') ?? '')
  const archivo = form.get('archivo')

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { problemas: ['Elige un archivo antes de subir.'] }
  }

  // Los bytes se materializan UNA vez y son los mismos que se hashean y se
  // suben. Volver a leer el File para cualquiera de las dos cosas abriría la
  // puerta a hashear algo distinto de lo que se guarda.
  const bytes = new Uint8Array(await archivo.arrayBuffer())

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const r = await registrarDocumento(db, await almacenExpedientes(), {
      sesion: ctx,
      expedienteId,
      documento: { campo, nombreArchivo: archivo.name, mime: archivo.type, bytes },
    })
    await recalcularCompletitud(db, { sesion: ctx, expedienteId, fecha: hoy() })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return { problemas: [], ultimoHash: r.hash }
  } catch (e) {
    if (e instanceof DocumentoInvalido) return { problemas: [e.message] }
    if (e instanceof FalloDeAlmacen) return { problemas: [e.message] }
    return { problemas: [e instanceof Error ? e.message : 'Error inesperado al subir.'] }
  } finally {
    await db.end()
  }
}

/**
 * La aprobación del expediente.
 *
 * No comprueba el rol aquí: `app.expediente_aprobar` lo verifica dentro de la
 * base, igual que el aviso. Lo que sí hace es traducir el error a algo que una
 * persona pueda leer y actuar.
 */
export interface EstadoAprobacion {
  ok: boolean
  mensaje: string
}

export async function accionAprobarExpediente(
  _previo: EstadoAprobacion | null,
  datos: FormData,
): Promise<EstadoAprobacion> {
  const expedienteId = String(datos.get('expedienteId') ?? '')
  const clienteId = String(datos.get('clienteId') ?? '')
  const sesion = await sesionRequerida()

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await aprobarExpediente(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      expedienteId,
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje: 'Expediente aprobado. Tu nombre y la hora quedaron en la bitácora.',
    }
  } catch (e) {
    const bruto = e instanceof Error ? e.message : String(e)
    if (/rol admin/i.test(bruto)) {
      return {
        ok: false,
        mensaje:
          'Solo un usuario con rol admin puede aprobar un expediente. La regla la aplica la base de datos, no la pantalla.',
      }
    }
    if (/expediente completo/i.test(bruto)) {
      return {
        ok: false,
        mensaje:
          'Solo se aprueba un expediente completo. Faltan requisitos por cubrir: súbelos y vuelve a evaluar la completitud.',
      }
    }
    return { ok: false, mensaje: bruto }
  } finally {
    await db.end()
  }
}
