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
import {
  CampoNoDeclarado,
  DomicilioIncompleto,
  guardarDatosDeCaptura,
  valoresCapturados,
} from '../../../../src/persistencia/datos-expediente'
import {
  VerificacionImposible,
  declararRelacionDeNegocios,
  verificarExpediente,
} from '../../../../src/persistencia/reverificacion'
import {
  DeclaracionPepInvalida,
  RevisionPepImposible,
  registrarDeclaracionPep,
  revisarDeclaracionPep,
  type ResultadoDeclaracion,
  type VinculoDeclarado,
} from '../../../../src/persistencia/pep'
import { DocumentoInvalido } from '../../../../src/dominio/documentos'
import { hoyEnMexico } from '../../../../src/dominio/fechas'

export interface EstadoSubida {
  problemas: string[]
  /** Hash del último documento subido: es lo que hace verificable el expediente. */
  ultimoHash?: string | undefined
}

/** `ok: null` = todavía no se ha intentado nada, que no es lo mismo que fallar. */
export interface EstadoRevision {
  ok: boolean | null
  mensaje: string
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
  // Solo llega cuando el catálogo la exige: el formulario pinta el campo únicamente
  // para los documentos con regla de antigüedad.
  const fechaEmision = String(form.get('fechaEmision') ?? '').trim()
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
      ...(fechaEmision === '' ? {} : { fechaEmision }),
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

export async function declararRelacion(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const hay = String(form.get('hay') ?? '')

  if (hay !== 'true' && hay !== 'false') {
    return { ok: false, mensaje: 'Elige una respuesta antes de guardar.' }
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await declararRelacionDeNegocios(db, { sesion: ctx, clienteId, hay: hay === 'true' })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    revalidatePath('/')
    return {
      ok: true,
      mensaje:
        hay === 'true'
          ? 'Guardado. Este expediente entra al ciclo de revisión anual del Art. 21.'
          : 'Guardado como acto ocasional: el Art. 21 excluye estos casos del ciclo anual.',
    }
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo guardar.' }
  } finally {
    await db.end()
  }
}

export async function registrarRevisionAnual(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const expedienteId = String(form.get('expedienteId') ?? '')

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const r = await verificarExpediente(db, { sesion: ctx, expedienteId, hoy: hoy() })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    revalidatePath('/')
    return {
      ok: true,
      mensaje: `Revisión registrada: ${String(r.cubiertos)} de ${String(r.totalObligatorios)} requisitos, todos cubiertos con las reglas vigentes hoy.`,
    }
  } catch (e) {
    // El mensaje de VerificacionImposible ya trae la lista de lo que falta: es
    // la respuesta útil, no un fallo que traducir.
    if (e instanceof VerificacionImposible) return { ok: false, mensaje: e.message }

    const bruto = e instanceof Error ? e.message : String(e)
    if (/insufficient_privilege|admin/i.test(bruto)) {
      return { ok: false, mensaje: 'Solo un administrador registra la revisión anual.' }
    }
    return { ok: false, mensaje: bruto }
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

/**
 * Los datos de captura que no se resuelven subiendo un archivo.
 *
 * Existe porque sin ella el expediente nunca llegaba a «completo»: domicilio y
 * giro mercantil los exige el catálogo y no había dónde escribirlos. Vive en
 * la pantalla del expediente —y no en el alta del cliente— por dos razones:
 * arregla también a los clientes que YA existen, y pone el formulario justo
 * donde la pantalla acaba de decir qué falta.
 */
export interface EstadoDatos {
  ok: boolean
  mensaje: string
}

export async function guardarDatos(
  _previo: EstadoDatos | null,
  form: FormData,
): Promise<EstadoDatos> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const expedienteId = String(form.get('expedienteId') ?? '')

  // Todo lo que no sea un identificador —ni fontanería de Next— se trata como
  // campo del catálogo, y el catálogo decide cuáles existen. Aquí no hay lista
  // que mantener sincronizada.
  const valores = valoresCapturados(form.entries(), ['clienteId', 'expedienteId'])

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const guardados = await guardarDatosDeCaptura(db, {
      sesion: ctx,
      expedienteId,
      valores,
      fecha: hoy(),
    })
    if (guardados.length === 0) {
      return { ok: false, mensaje: 'No capturaste ningún dato.' }
    }

    // Recalcular aquí y no en el guardado: es lo que hace que la pantalla
    // refleje el cambio, y deja el registro de la evaluación donde ya vivía.
    const completitud = await recalcularCompletitud(db, {
      sesion: ctx,
      expedienteId,
      fecha: hoy(),
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)

    return {
      ok: true,
      mensaje:
        completitud.estatus === 'completo'
          ? `Datos guardados. El expediente quedó completo: ${String(completitud.cubiertos)} de ${String(completitud.totalObligatorios)} requisitos. Falta que alguien lo apruebe.`
          : `Datos guardados. Van ${String(completitud.cubiertos)} de ${String(completitud.totalObligatorios)} requisitos.`,
    }
  } catch (e) {
    if (e instanceof CampoNoDeclarado) return { ok: false, mensaje: e.message }
    if (e instanceof DomicilioIncompleto) return { ok: false, mensaje: e.message }
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : 'Error inesperado al guardar los datos.',
    }
  } finally {
    await db.end()
  }
}

/**
 * La declaración PEP (Art. 23 Quáter). El JSON del formulario es transporte:
 * la validación con mensajes vive en la persistencia y la garantía en la base.
 */
function interpretarVinculos(crudo: string): VinculoDeclarado[] {
  const datos: unknown = JSON.parse(crudo)
  if (!Array.isArray(datos)) throw new Error('Los vínculos no llegaron como lista.')
  return datos.map((v) => {
    const o = v as Record<string, unknown>
    return {
      tipo: String(o['tipo'] ?? '') as VinculoDeclarado['tipo'],
      ...(o['grado'] === undefined ? {} : { grado: Number(o['grado']) as 1 | 2 }),
      ...(o['nombrePep'] === undefined ? {} : { nombrePep: String(o['nombrePep']) }),
      cargo: String(o['cargo'] ?? ''),
      ambito: String(o['ambito'] ?? '') as VinculoDeclarado['ambito'],
      ...(o['pais'] === undefined ? {} : { pais: String(o['pais']) }),
      enFunciones: o['enFunciones'] === true,
      ...(o['fechaCese'] === undefined ? {} : { fechaCese: String(o['fechaCese']) }),
      ...(o['detalle'] === undefined ? {} : { detalle: String(o['detalle']) }),
    }
  })
}

export async function declararPep(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const resultado = String(form.get('resultado') ?? '')
  const fechaDeclaracion = String(form.get('fechaDeclaracion') ?? '')

  if (resultado !== 'niega' && resultado !== 'pep_por_funcion' && resultado !== 'pep_asimilada') {
    return { ok: false, mensaje: 'Elige qué declaró la persona antes de registrar.' }
  }

  let vinculos: VinculoDeclarado[]
  try {
    vinculos = interpretarVinculos(String(form.get('vinculos') ?? '[]'))
  } catch {
    return { ok: false, mensaje: 'Los vínculos del formulario no se pudieron leer. Recarga e intenta de nuevo.' }
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await registrarDeclaracionPep(db, {
      sesion: ctx,
      clienteId,
      resultado: resultado as ResultadoDeclaracion,
      fechaDeclaracion,
      vinculos,
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje:
        resultado === 'niega'
          ? 'Registrado: la persona declaró que ni ella ni su red tienen función pública. Esa respuesta también es evidencia.'
          : `Declaración registrada con ${String(vinculos.length)} ${vinculos.length === 1 ? 'vínculo' : 'vínculos'}. Queda pendiente la revisión de un administrador, que la congela.`,
    }
  } catch (e) {
    if (e instanceof DeclaracionPepInvalida) return { ok: false, mensaje: e.message }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/personas físicas/i.test(bruto)) {
      return {
        ok: false,
        mensaje:
          'La declaración PEP es de personas físicas. Para una persona moral la pregunta correcta es su Beneficiario Controlador.',
      }
    }
    return { ok: false, mensaje: bruto }
  } finally {
    await db.end()
  }
}

export async function revisarPep(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const declaracionId = String(form.get('declaracionId') ?? '')

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await revisarDeclaracionPep(db, { sesion: ctx, declaracionId, hoy: hoy() })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje: 'Revisión registrada. La declaración y su red quedaron congeladas como evidencia.',
    }
  } catch (e) {
    if (e instanceof RevisionPepImposible) return { ok: false, mensaje: e.message }
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo registrar la revisión.' }
  } finally {
    await db.end()
  }
}
