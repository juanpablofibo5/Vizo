'use server'

import { revalidatePath } from 'next/cache'
import { conBase } from '../../src/supabase/conexion'
import { almacenAvisos } from '../../src/supabase/almacen'
import {
  aprobarAviso,
  generarAviso,
  generarModificatorio,
  marcarListoParaRevision,
  registrarAcuse,
} from '../../src/persistencia/aviso'
import { createHash } from 'node:crypto'
import { PATRON_FOLIO } from '../../src/aviso/informe'

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
    // Generar o aprobar un aviso mueve el semáforo de Inicio y el Calendario,
    // no solo la lista. Revalidar únicamente `/avisos` dejaba la portada
    // diciendo "vencido, sin generar" JUSTO DESPUÉS de haberlo resuelto — el
    // sistema contradiciéndose sobre si el obligado está en regla.
    for (const ruta of ['/avisos', '/', '/calendario']) revalidatePath(ruta)
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
  if (/forma que el SPPLD asigna|acuse_folio_forma/i.test(bruto)) {
    return 'El folio no tiene la forma que asigna el SPPLD (AAAA-N, por ejemplo 2026-12345). Cópialo del acuse tal como viene.'
  }
  if (/carpeta del obligado|ruta_del_obligado/i.test(bruto)) {
    return 'La ruta del acuse no pertenece a este obligado.'
  }
  if (/formato de aviso vigente/i.test(bruto)) {
    // El mensaje del motor trae el UUID de la actividad y pide cargar
    // `formatos_aviso` — instrucciones para el backoffice de VIZO (runbook
    // 02), no para el obligado que está viendo esta pantalla. A él le toca
    // saber qué pasa y quién lo resuelve, no una tabla que no puede tocar.
    return (
      'El formato oficial de aviso de tu actividad todavía no está cargado en VIZO ' +
      '(el SPPLD lo publica como XSD y nosotros lo cargamos con doble revisión). Hasta ' +
      'entonces el aviso no se puede generar — VIZO no supone un formato, porque un aviso ' +
      'con el formato equivocado es un aviso rechazado. Avísanos y lo priorizamos.'
    )
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
  const folio = String(datos.get('folio') ?? '').trim()
  const archivo = datos.get('acuse')

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: 'Adjunta el acuse que te devolvió el portal del SPPLD.' }
  }
  if (folio === '') {
    return {
      ok: false,
      mensaje:
        'Captura el folio que trae el acuse. Es lo que identifica este aviso ante la autoridad si algún día hay que corregirlo.',
    }
  }

  // El folio se comprueba ANTES de tocar Storage.
  //
  // SALIÓ AL PROBARLO EN EL NAVEGADOR. El archivo se subía primero y el folio
  // se validaba después, así que un folio mal escrito dejaba el objeto subido
  // —el bucket no tiene DELETE, a propósito— y el reintento con el folio bueno
  // moría con "The resource already exists". El usuario quedaba atrapado por su
  // propia corrección.
  //
  // Lo barato y sin efectos va primero. Es la regla general, y aquí se paga.
  if (!PATRON_FOLIO.test(folio)) {
    return {
      ok: false,
      mensaje:
        'El folio no tiene la forma que asigna el SPPLD (AAAA-N, por ejemplo 2026-12345). Cópialo del acuse tal como viene.',
    }
  }

  return ejecutar(async ({ db, sesion }) => {
    // El archivo se sube ANTES de mover el estado: `presentado` significa que
    // hay evidencia, y no debe existir ni un instante en que el estado lo
    // afirme sin que el acuse esté guardado.
    const bytes = new Uint8Array(await archivo.arrayBuffer())

    // La ruta lleva el HASH del acuse, no la fecha. Con la fecha, dos intentos
    // el mismo día chocaban —el bucket no permite sobrescribir, a propósito— y
    // el segundo moría con un error de Storage que no dice nada. Con el hash,
    // archivos distintos nunca chocan y el mismo archivo es el mismo objeto.
    const huella = createHash('sha256').update(bytes).digest('hex')
    const ruta = `${sesion.tenantId}/${avisoId}/acuse-${huella.slice(0, 16)}.pdf`
    const almacen = await almacenAvisos()

    try {
      await almacen.subir(ruta, bytes, 'application/pdf')
    } catch (e) {
      // "Ya existe" NO es un fallo aquí, y solo aquí: la ruta ES el hash del
      // contenido, así que un objeto en esa ruta tiene por construcción los
      // mismos bytes. Reintentar con el mismo archivo es idempotente.
      //
      // En `documentos` la misma excepción sí es un fallo: allá la ruta no es
      // el contenido y sobrescribir borraría evidencia.
      const mensaje = e instanceof Error ? e.message : String(e)
      if (!/already exists/i.test(mensaje)) throw e
    }

    await registrarAcuse(db, { sesion, avisoId, storagePath: ruta, folio })
    return 'Acuse registrado. El aviso quedó como presentado.'
  })
}


/**
 * Corregir un aviso ya presentado.
 *
 * El original no se toca: se genera OTRO archivo que dice cuál corrige, por el
 * folio que el SPPLD le asignó. Los dos coexisten, que es exactamente lo que la
 * autoridad necesita para reconciliarlos.
 */
export async function accionCorregir(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const avisoOriginalId = String(datos.get('avisoId') ?? '')
  const descripcion = String(datos.get('descripcion') ?? '').trim()

  if (descripcion === '') {
    return {
      ok: false,
      mensaje:
        'Explica qué se corrige. Va dentro del archivo: es lo que le dice a la autoridad qué cambió respecto del aviso que ya presentaste.',
    }
  }

  return ejecutar(async ({ db, sesion }) => {
    const r = await generarModificatorio(
      db,
      { sesion, avisoOriginalId, descripcion, granularidad: 'un_aviso_por_operacion' },
      await almacenAvisos(),
    )
    return `Modificatorio generado y validado contra el XSD, con ${String(r.operacionesIncluidas)} operación(es).`
  })
}
