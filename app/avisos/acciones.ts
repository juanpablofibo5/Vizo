'use server'

import { revalidatePath } from 'next/cache'
import { conBase } from '../../src/supabase/conexion'
import { almacenAvisos } from '../../src/supabase/almacen'
import {
  aprobarAviso,
  generarAviso,
  marcarListoParaRevision,
  registrarAcuse,
} from '../../src/persistencia/aviso'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Las acciones del pipeline del aviso.
 *
 * Ninguna comprueba el rol aquí. No es un descuido: `app.aviso_aprobar` y
 * `app.aviso_registrar_acuse` lo verifican DENTRO de la base, y las políticas
 * de RLS cubren el resto. Repetir la comprobación en TypeScript daría la
 * impresión de que ahí vive la regla — y entonces alguien la movería.
 *
 * Lo que sí hacen es traducir el error de la base a algo que una persona pueda
 * leer. Un `insufficient_privilege` en pantalla no le dice a nadie qué hacer.
 */

export interface Resultado {
  ok: boolean
  mensaje: string
}

async function ejecutar(
  cuerpo: (c: Parameters<Parameters<typeof conBase>[0]>[0]) => Promise<string>,
): Promise<Resultado> {
  try {
    const mensaje = await conBase(cuerpo)
    revalidatePath('/avisos')
    return { ok: true, mensaje }
  } catch (e) {
    const bruto = e instanceof Error ? e.message : String(e)
    return { ok: false, mensaje: legible(bruto) }
  }
}

function legible(bruto: string): string {
  if (/rol admin/i.test(bruto)) {
    return 'Solo un usuario con rol admin puede hacer esto. La regla la aplica la base de datos, no la pantalla.'
  }
  if (/listo para revisión/i.test(bruto)) {
    return 'El aviso todavía no está listo para revisión. Márcalo primero: validado significa que el XML pasó el XSD, no que alguien lo haya mirado.'
  }
  if (/avisos_unico_por_periodo/i.test(bruto)) {
    return 'Este periodo ya tiene un aviso. Corregir uno presentado es un aviso modificatorio, no volver a generarlo.'
  }
  if (/carpeta del obligado|ruta_del_obligado/i.test(bruto)) {
    return 'La ruta del acuse no pertenece a este obligado.'
  }
  return bruto
}

export async function accionGenerar(_previo: Resultado | null, datos: FormData): Promise<Resultado> {
  const periodo = String(datos.get('periodo') ?? '')
  const actividadId = String(datos.get('actividadId') ?? '')

  return ejecutar(async ({ db, sesion }) => {
    const r = await generarAviso(
      db,
      {
        sesion,
        actividadId,
        periodo,
        // Ver `Granularidad`: el Art. 24 Bis 1 no está contrastado contra el
        // DOF (issue #10), así que la lectura estricta —un aviso por acto— es
        // la que se emite. Es la que sobrevive a las dos interpretaciones.
        granularidad: 'un_aviso_por_operacion',
      },
      await almacenAvisos(),
    )
    return r.tipo === 'cero'
      ? 'Informe en cero generado y validado contra el XSD oficial.'
      : `Aviso generado con ${String(r.operacionesIncluidas)} operación(es), validado contra el XSD.`
  })
}

export async function accionListoRevision(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const avisoId = String(datos.get('avisoId') ?? '')
  return ejecutar(async ({ db, sesion }) => {
    await marcarListoParaRevision(db, { sesion, avisoId })
    return 'El aviso pasó a revisión.'
  })
}

export async function accionAprobar(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const avisoId = String(datos.get('avisoId') ?? '')
  return ejecutar(async ({ db, sesion }) => {
    await aprobarAviso(db, { sesion, avisoId })
    return 'Aviso aprobado. Tu nombre y la hora quedaron en la bitácora.'
  })
}

export async function accionRegistrarAcuse(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const avisoId = String(datos.get('avisoId') ?? '')
  const archivo = datos.get('acuse')

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: 'Adjunta el acuse que te devolvió el portal del SPPLD.' }
  }

  return ejecutar(async ({ db, sesion }) => {
    // El archivo se sube ANTES de mover el estado: `presentado` significa que
    // hay evidencia, y no debe existir ni un instante en que el estado lo
    // afirme sin que el acuse esté guardado.
    const ruta = `${sesion.tenantId}/${avisoId}/acuse-${hoyEnMexico()}.pdf`
    const almacen = await almacenAvisos()
    await almacen.subir(ruta, new Uint8Array(await archivo.arrayBuffer()), 'application/pdf')

    await registrarAcuse(db, { sesion, avisoId, storagePath: ruta })
    return 'Acuse registrado. El aviso quedó como presentado.'
  })
}
