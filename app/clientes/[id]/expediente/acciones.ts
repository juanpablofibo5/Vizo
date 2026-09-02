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
  DatoDePerfilInvalido,
  registrarPerfil,
  type DatosPerfil,
} from '../../../../src/persistencia/perfil'
import { montoCapturado } from '../../../../src/persistencia/operaciones'
import {
  DatoDeAprobacionInvalido,
  asentarAprobacion,
} from '../../../../src/persistencia/aprobacion'
import {
  DeclaracionPepInvalida,
  RevisionPepImposible,
  registrarDeclaracionPep,
  revisarDeclaracionPep,
  type ResultadoDeclaracion,
  type VinculoDeclarado,
} from '../../../../src/persistencia/pep'
import { evaluarClienteYRegistrar } from '../../../../src/persistencia/riesgo'
import { DocumentoInvalido } from '../../../../src/dominio/documentos'
import { hoyEnMexico } from '../../../../src/dominio/fechas'
import { createHash } from 'node:crypto'
import {
  DatoDeCuestionarioInvalido,
  asentarCuestionario,
} from '../../../../src/persistencia/cuestionario'
import type { EvidenciaDeFirma } from '../../../../src/dominio/cuestionario'
import {
  DatoDeMedidasInvalido,
  asentarMedidasReforzadas,
} from '../../../../src/persistencia/medidas-reforzadas'
import {
  DatoDeBeneficiarioInvalido,
  identificarBeneficiarioControlador,
  registrarExcepcion,
} from '../../../../src/persistencia/beneficiario-controlador'
import type {
  EvidenciaDeConsulta,
  PersonaVinculada,
} from '../../../../src/dominio/medidas-reforzadas'
import { consultarScreening, resolverScreening } from '../../../../src/persistencia/screening'
import {
  DatoDeScreeningInvalido,
  ListasIncompletas,
} from '../../../../src/dominio/screening'
import { leerComoUsuario } from '../../../../src/supabase/conexion'

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

/**
 * El Grado de Riesgo del cliente (Cap. III Bis).
 *
 * Quien evalúa marca qué factores aplican; el motor calcula. Si el obligado no
 * tiene metodología vigente, la persistencia devuelve el hueco SIN escribir, y
 * aquí se dice con esas palabras en vez de traducirlo a un error técnico: no es
 * que algo falló, es que no hay con qué clasificar (ADR-21).
 */
export async function evaluarRiesgo(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const factoresPresentes = form.getAll('factores').map(String)

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const r = await evaluarClienteYRegistrar(db, {
      sesion: ctx,
      clienteId,
      factoresPresentes,
      hoy: hoy(),
    })

    if (r.resultado.estado !== 'evaluado') {
      return {
        ok: false,
        mensaje:
          'No se evaluó nada, y no es un error: el obligado todavía no tiene una metodología de ' +
          'riesgo vigente. Se configura en Configuración → Modelo de riesgo.',
      }
    }

    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje:
        `Grado ${r.resultado.gradoClave}, con ${String(r.resultado.puntaje)} puntos de ` +
        `${String(r.resultado.aplicados.length)} factor(es). ` +
        (r.resultado.esAlto
          ? 'Es grado alto: aplican las medidas reforzadas del Cap. III Ter.'
          : 'Queda registrado con tu nombre y la hora.'),
    }
  } catch (e) {
    const bruto = e instanceof Error ? e.message : String(e)
    if (/insufficient_privilege|admin/i.test(bruto)) {
      return { ok: false, mensaje: 'Solo un administrador evalúa el Grado de Riesgo.' }
    }
    return { ok: false, mensaje: bruto }
  } finally {
    await db.end()
  }
}

/**
 * El Perfil transaccional del cliente (Art. 23 Ter 1).
 *
 * El monto lo declara el cliente; aquí solo se asienta. El vencimiento NO se
 * captura —lo deriva la persistencia del catálogo y el trigger de la base lo
 * vuelve a calcular—, así que desde esta pantalla no hay forma de comprar
 * tiempo. Y el ancla es la fecha del acto, no la de hoy: por eso se elige cuál.
 */
export async function registrarPerfilDelCliente(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const origen = String(form.get('origen') ?? '') as DatosPerfil['origen']
  const texto = (campo: string): string | undefined => {
    const v = String(form.get(campo) ?? '').trim()
    return v === '' ? undefined : v
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const numero = texto('operacionesMaximasMensuales')
    await registrarPerfil(db, {
      sesion: ctx,
      clienteId,
      hoy: hoy(),
      datos: {
        origen,
        fuente: (texto('fuente') ?? 'declarada_por_cliente') as DatosPerfil['fuente'],
        montoMaximoMensual: montoCapturado(
          String(form.get('montoMaximoMensual') ?? ''),
          'el monto máximo mensual',
        ),
        operacionesMaximasMensuales: numero === undefined ? undefined : Number(numero),
        frecuenciaEsperada: texto('frecuenciaEsperada'),
        zonaGeografica: texto('zonaGeografica'),
        origenRecursos: texto('origenRecursos'),
        destinoRecursos: texto('destinoRecursos'),
        actividadEconomica: texto('actividadEconomica'),
        operacionId: texto('operacionId'),
        motivo: texto('motivo'),
      },
    })

    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje:
        origen === 'reevaluacion'
          ? 'Reevaluación asentada. La anterior se conserva: el histórico del perfil no se reescribe.'
          : origen === 'correccion'
            ? 'Corrección asentada, con el mismo vencimiento que la fila que corrige.'
            : 'Perfil transaccional asentado. Desde ahora cada operación se contrasta contra lo que el cliente declaró.',
    }
  } catch (e) {
    if (e instanceof DatoDePerfilInvalido) return { ok: false, mensaje: e.problemas.join(' ') }
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : 'No se pudo asentar el Perfil transaccional.',
    }
  } finally {
    await db.end()
  }
}

/**
 * La aprobación de directivo del Art. 23 Ter 5, o la constancia que la subsana.
 *
 * La vía NO llega del formulario: la impone qué es el obligado (¶2). Y la
 * evidencia que la aprobación cita tampoco: se deriva del estado del cliente.
 * Si el disparador todavía no se puede resolver, la persistencia se niega — el
 * hueco no se cierra firmando.
 */
export async function asentarAprobacionDirectivo(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')
  const momento = String(form.get('momento') ?? '') === 'previa' ? 'previa' : 'posterior'
  const texto = (campo: string): string | undefined => {
    const v = String(form.get(campo) ?? '').trim()
    return v === '' ? undefined : v
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await asentarAprobacion(db, {
      sesion: ctx,
      clienteId,
      hoy: hoy(),
      datos: {
        momento,
        aprobadorNombre: texto('aprobadorNombre'),
        aprobadorCargo: texto('aprobadorCargo'),
        motivos: texto('motivos'),
        alcancePrevio: texto('alcancePrevio'),
        vigenteHasta: texto('vigenteHasta'),
        operaciones: form.getAll('operaciones').map(String),
      },
    })

    revalidatePath(`/clientes/${clienteId}/expediente`)
    revalidatePath('/alertas')
    return {
      ok: true,
      mensaje:
        momento === 'previa'
          ? 'Aprobación previa asentada, con su alcance y su plazo. Cubre los actos que ocurran dentro de esa ventana.'
          : 'Aprobación asentada sobre los actos que nombra. Queda con tu nombre y la hora, y no se reescribe.',
    }
  } catch (e) {
    if (e instanceof DatoDeAprobacionInvalido) return { ok: false, mensaje: e.problemas.join(' ') }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/insufficient_privilege|admin|row-level security/i.test(bruto)) {
      return { ok: false, mensaje: 'Solo un administrador asienta la aprobación del Art. 23 Ter 5.' }
    }
    return { ok: false, mensaje: bruto }
  } finally {
    await db.end()
  }
}

/**
 * La consulta a listas de control (ADR-30).
 *
 * El nombre y el RFC NO viajan en el formulario: se leen del cliente bajo RLS.
 * Un nombre que llega del navegador es un nombre que quien captura puede
 * teclear distinto, y entonces la evidencia diría que se consultó a alguien
 * que no es el cliente del expediente.
 */
export async function accionConsultarScreening(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const clienteId = String(form.get('clienteId') ?? '')

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const cliente = await leerComoUsuario(db, ctx, async () => {
      const r = await db.query(
        `select nombre_o_razon_social, rfc from clientes_finales where id = $1`,
        [clienteId],
      )
      return r.rows[0] as { nombre_o_razon_social: string; rfc: string | null } | undefined
    })
    if (cliente === undefined) {
      return { ok: false, mensaje: 'Este cliente no existe en tu obligado.' }
    }

    const r = await consultarScreening(db, {
      sesion: ctx,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
      nombre: cliente.nombre_o_razon_social,
      ...(cliente.rfc === null ? {} : { rfc: cliente.rfc }),
    })

    revalidatePath(`/clientes/${clienteId}/expediente`)
    revalidatePath('/alertas')
    return r.resultado === 'sin_coincidencia'
      ? {
          ok: true,
          mensaje:
            `Sin coincidencias en las ${String(r.listas.length)} listas vigentes. La consulta quedó ` +
            'registrada con el snapshot de versiones: ese folio es la evidencia de que hoy se consultó.',
        }
      : {
          ok: true,
          mensaje:
            `${String(r.coincidencias.length)} coincidencia(s) detectada(s) y una alerta levantada. ` +
            'VIZO detecta de más a propósito; confirmar o descartar le toca a una persona, abajo.',
        }
  } catch (e) {
    if (e instanceof ListasIncompletas || e instanceof DatoDeScreeningInvalido) {
      return { ok: false, mensaje: e.message }
    }
    return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo consultar.' }
  } finally {
    await db.end()
  }
}

/** La resolución humana de una coincidencia: una vez, con quién, cuándo y por qué. */
export async function accionResolverScreening(
  _previo: EstadoRevision,
  form: FormData,
): Promise<EstadoRevision> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }
  const consultaId = String(form.get('consultaId') ?? '')
  const clienteId = String(form.get('clienteId') ?? '')
  const resolucion = String(form.get('resolucion') ?? '')
  const razonamiento = String(form.get('razonamiento') ?? '')

  if (resolucion !== 'confirmada' && resolucion !== 'descartada') {
    return { ok: false, mensaje: 'Elige si la coincidencia se confirma o se descarta.' }
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await resolverScreening(db, { sesion: ctx, consultaId, resolucion, razonamiento })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    revalidatePath('/alertas')
    return {
      ok: true,
      mensaje:
        resolucion === 'descartada'
          ? 'Descartada como homónimo. Tu razonamiento queda como la evidencia de por qué se puede operar.'
          : 'Coincidencia confirmada: sí es la persona listada. Queda con tu nombre y la hora; lo que proceda con la relación lo decide el obligado conforme a su Manual — VIZO no lo decide.',
    }
  } catch (e) {
    if (e instanceof DatoDeScreeningInvalido) return { ok: false, mensaje: e.message }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(bruto)) {
      return { ok: false, mensaje: 'Solo un administrador resuelve una coincidencia de screening.' }
    }
    return { ok: false, mensaje: bruto }
  } finally {
    await db.end()
  }
}

/** El resultado de una captura con varios problemas posibles a la vez. */
export interface EstadoCaptura {
  ok: boolean | null
  mensaje: string
  problemas: string[]
}

/**
 * Asienta el cuestionario del Art. 23 Ter 3.
 *
 * La huella del archivo firmado se calcula AQUÍ, del stream que llegó, y no se
 * acepta como parámetro. Un hash que viaja en el formulario es un hash que
 * quien captura puede escribir a mano, y entonces la evidencia acredita lo que
 * alguien tecleó en vez de lo que el cliente firmó.
 *
 * VIZO no valida la firma en sí: el ¶3 pide que el documento «contenga la
 * Firma Electrónica», y determinar si un mecanismo concreto cumple el estándar
 * del Código de Comercio es una pregunta jurídica (ALCANCE §0.5). Lo que VIZO
 * garantiza es que el archivo que se guardó es el mismo que se subió.
 */
export async function accionAplicarCuestionario(
  _previo: EstadoCaptura,
  datos: FormData,
): Promise<EstadoCaptura> {
  const clienteId = String(datos.get('clienteId') ?? '')
  const sesion = await sesionRequerida()
  const remoto = datos.get('remoto') === 'si'

  let firma: EvidenciaDeFirma | undefined
  if (remoto) {
    const archivo = datos.get('firma')
    if (!(archivo instanceof File) || archivo.size === 0) {
      return {
        ok: false,
        mensaje: 'Falta el archivo firmado.',
        problemas: [
          'Un cuestionario aplicado por vía remota debe contener la Firma Electrónica de quien ' +
            'lo suscribe (Art. 23 Ter 3 ¶3).',
        ],
      }
    }
    const bytes = Buffer.from(await archivo.arrayBuffer())
    firma = {
      hashSha256: createHash('sha256').update(bytes).digest('hex'),
      archivo: archivo.name,
      tamanoBytes: bytes.byteLength,
      mime: archivo.type === '' ? 'application/octet-stream' : archivo.type,
    }
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await asentarCuestionario(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
      datos: {
        modalidad: remoto ? 'remoto_digital' : 'presencial',
        fechaAplicacion: String(datos.get('fechaAplicacion') ?? ''),
        suscritoPor: String(datos.get('suscritoPor') ?? ''),
        actividadPreponderante: String(datos.get('actividadPreponderante') ?? ''),
        origenRecursos: String(datos.get('origenRecursos') ?? ''),
        destinoRecursos: String(datos.get('destinoRecursos') ?? ''),
        actosQueRealiza: String(datos.get('actosQueRealiza') ?? ''),
        actosQuePretende: String(datos.get('actosQuePretende') ?? ''),
        ...(firma === undefined ? {} : { firma }),
      },
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje: 'Cuestionario asentado. Queda atado a la clasificación de riesgo que lo exigió.',
      problemas: [],
    }
  } catch (e) {
    if (e instanceof DatoDeCuestionarioInvalido) {
      return { ok: false, mensaje: 'No se asentó el cuestionario.', problemas: e.problemas }
    }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/permission denied|admin/i.test(bruto)) {
      return {
        ok: false,
        mensaje:
          'Solo un administrador asienta el cuestionario. La regla la aplica la base de datos.',
        problemas: [],
      }
    }
    return { ok: false, mensaje: bruto, problemas: [] }
  } finally {
    await db.end()
  }
}

/**
 * Asienta las medidas reforzadas del Art. 23 Ter 4.
 *
 * La fracción NO viaja en el formulario: la deriva la persistencia de la clase
 * de persona del cliente. Y `aplicaPepExtranjera` tampoco: sale del Cap. III
 * Quáter que ya existe. Las dos son hechos que el sistema conoce, y ofrecerlas
 * como campo sería invitar a torcerlas.
 */
export async function accionAdoptarMedidas(
  _previo: EstadoCaptura,
  datos: FormData,
): Promise<EstadoCaptura> {
  const clienteId = String(datos.get('clienteId') ?? '')
  const sesion = await sesionRequerida()

  const cuantas = Number(datos.get('cuantasPersonas') ?? '0')
  const personas: PersonaVinculada[] = []
  for (let i = 0; i < cuantas; i += 1) {
    const nombre = String(datos.get(`nombre${String(i)}`) ?? '').trim()
    // Un renglón vacío es un renglón que el usuario abrió y no llenó: se
    // ignora en silencio en vez de reventar con «nombre vacío».
    if (nombre === '') continue
    personas.push({
      vinculo: String(datos.get(`vinculo${String(i)}`) ?? 'conyuge') as PersonaVinculada['vinculo'],
      nombre,
      datosObtenidos: datos.get(`datos${String(i)}`) === 'si',
      documentacionObtenida: datos.get(`documentacion${String(i)}`) === 'si',
    })
  }

  let evidencia: EvidenciaDeConsulta | undefined
  const archivo = datos.get('consultaSeArchivo')
  if (archivo instanceof File && archivo.size > 0) {
    const bytes = Buffer.from(await archivo.arrayBuffer())
    evidencia = {
      hashSha256: createHash('sha256').update(bytes).digest('hex'),
      archivo: archivo.name,
      tamanoBytes: bytes.byteLength,
      mime: archivo.type === '' ? 'application/octet-stream' : archivo.type,
    }
  }

  const texto = (k: string): string | undefined => {
    const v = datos.get(k)
    return typeof v === 'string' && v.trim() !== '' ? v : undefined
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await asentarMedidasReforzadas(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      hoy: hoyEnMexico(),
      datos: {
        fechaAdopcion: String(datos.get('fechaAdopcion') ?? ''),
        ...(texto('medidasOrigenDestino') === undefined
          ? {}
          : { medidasOrigenDestino: texto('medidasOrigenDestino') }),
        // Solo se manda cuando el formulario de la fr. I estuvo en pantalla:
        // `undefined` significa «no se preguntó», y la persistencia lo
        // distingue de «se decidió que no».
        ...(datos.has('cuantasPersonas')
          ? { manualPreveVinculadas: datos.get('preveVinculadas') === 'si' }
          : {}),
        personasVinculadas: personas,
        ...(texto('informacionAccionistas') === undefined
          ? {}
          : { informacionAccionistas: texto('informacionAccionistas') }),
        ...(texto('consultaSeFecha') === undefined
          ? {}
          : { consultaSeFecha: texto('consultaSeFecha') }),
        ...(texto('consultaSeResultado') === undefined
          ? {}
          : { consultaSeResultado: texto('consultaSeResultado') }),
        ...(evidencia === undefined ? {} : { consultaSeEvidencia: evidencia }),
        ...(texto('documentacionPepExtranjera') === undefined
          ? {}
          : { documentacionPepExtranjera: texto('documentacionPepExtranjera') }),
      },
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje: 'Medidas asentadas, atadas a la clasificación de riesgo que las exigió.',
      problemas: [],
    }
  } catch (e) {
    if (e instanceof DatoDeMedidasInvalido) {
      return { ok: false, mensaje: 'No se asentaron las medidas.', problemas: e.problemas }
    }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/permission denied|admin/i.test(bruto)) {
      return {
        ok: false,
        mensaje: 'Solo un administrador asienta las medidas. La regla la aplica la base de datos.',
        problemas: [],
      }
    }
    return { ok: false, mensaje: bruto, problemas: [] }
  } finally {
    await db.end()
  }
}

/**
 * Corre el orden de prelación del Art. 23 Quinquies y asienta su camino.
 *
 * El formulario captura INSUMOS, no conclusiones: quién tiene cuánto, quién
 * controla por qué medio, quién es el funcionario de mayor grado. Cuál fracción
 * resuelve lo decide el motor con el umbral del catálogo — y por eso la
 * pantalla no tiene ningún selector de fracción. Elegirla a mano sería poder
 * declarar «fr. III» sin haber agotado la I y la II, que es justo lo que el
 * orden de prelación prohíbe.
 */
export async function accionIdentificarBeneficiario(
  _previo: EstadoCaptura,
  datos: FormData,
): Promise<EstadoCaptura> {
  const clienteId = String(datos.get('clienteId') ?? '')
  const sesion = await sesionRequerida()

  const identidades: Record<string, { nombre: string; rfc?: string; curp?: string }> = {}
  const tenencias: Array<{
    titularId: string; esGrupo: boolean; porcentaje: number
    via: 'directa' | 'indirecta'
  }> = []
  const control: Array<{
    titularId: string; esGrupo: boolean; medio: string
    areasControladas: Array<'estrategia' | 'toma_de_decisiones' | 'politicas_principales'>
  }> = []
  const funcionarios: Array<{
    titularId: string; esGrupo: boolean; cargo: string; rango: number
  }> = []

  const cuantos = Number(datos.get('cuantosCandidatos') ?? '0')
  for (let i = 0; i < cuantos; i += 1) {
    const nombre = String(datos.get(`nombre${String(i)}`) ?? '').trim()
    // Un renglón que se abrió y no se llenó no es un candidato.
    if (nombre === '') continue

    // El id es opaco y local a esta determinación: al dominio nunca le llega
    // un nombre (regla dura 3, que vale también dentro del dominio).
    const titularId = `t${String(i)}`
    const rfc = String(datos.get(`rfc${String(i)}`) ?? '').trim()
    const curp = String(datos.get(`curp${String(i)}`) ?? '').trim()
    identidades[titularId] = {
      nombre,
      ...(rfc === '' ? {} : { rfc }),
      ...(curp === '' ? {} : { curp }),
    }

    const clase = String(datos.get(`clase${String(i)}`) ?? 'tenencia')
    const esGrupo = datos.get(`grupo${String(i)}`) === 'si'

    if (clase === 'tenencia') {
      tenencias.push({
        titularId,
        esGrupo,
        porcentaje: Number(datos.get(`porcentaje${String(i)}`) ?? '0'),
        via: datos.get(`via${String(i)}`) === 'indirecta' ? 'indirecta' : 'directa',
      })
    } else if (clase === 'control') {
      const areas = datos.getAll(`areas${String(i)}`).map(String) as Array<
        'estrategia' | 'toma_de_decisiones' | 'politicas_principales'
      >
      control.push({
        titularId,
        esGrupo,
        medio: String(datos.get(`medio${String(i)}`) ?? '').trim(),
        areasControladas: areas,
      })
    } else {
      funcionarios.push({
        titularId,
        esGrupo,
        cargo: String(datos.get(`cargo${String(i)}`) ?? '').trim(),
        rango: Number(datos.get(`rango${String(i)}`) ?? '1'),
      })
    }
  }

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await identificarBeneficiarioControlador(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      hoy: hoyEnMexico(),
      datos: {
        clienteId,
        fechaIdentificacion: String(datos.get('fechaIdentificacion') ?? ''),
        insumos: {
          sujeto: {
            tipo: 'persona_moral',
            insumos: {
              tenenciasCapital: tenencias,
              controlPorOtrosMedios: control,
              funcionariosAltaDireccion: funcionarios,
            },
          },
        },
        identidades,
      },
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return {
      ok: true,
      mensaje:
        'Procedimiento asentado con el camino completo: qué fracción se evaluó, en qué orden y ' +
        'con qué resultado.',
      problemas: [],
    }
  } catch (e) {
    if (e instanceof DatoDeBeneficiarioInvalido) {
      return { ok: false, mensaje: 'No se asentó la identificación.', problemas: e.problemas }
    }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/permission denied|admin/i.test(bruto)) {
      return {
        ok: false,
        mensaje: 'Solo un administrador asienta la identificación. La regla la aplica la base.',
        problemas: [],
      }
    }
    return { ok: false, mensaje: bruto, problemas: [] }
  } finally {
    await db.end()
  }
}

/** La excepción del Art. 23 Quinquies 2. El motor no la evalúa: se registra. */
export async function accionRegistrarExcepcionBc(
  _previo: EstadoCaptura,
  datos: FormData,
): Promise<EstadoCaptura> {
  const clienteId = String(datos.get('clienteId') ?? '')
  const sesion = await sesionRequerida()
  const clave = String(datos.get('clavePizarra') ?? '').trim()
  const detalle = String(datos.get('detalleExcepcion') ?? '').trim()

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    await registrarExcepcion(db, {
      sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
      clienteId,
      fechaIdentificacion: String(datos.get('fechaIdentificacion') ?? ''),
      tipo: String(datos.get('tipoExcepcion') ?? 'bolsa_de_valores') as 'bolsa_de_valores',
      ...(clave === '' ? {} : { clavePizarra: clave }),
      ...(detalle === '' ? {} : { detalle }),
      hoy: hoyEnMexico(),
    })
    revalidatePath(`/clientes/${clienteId}/expediente`)
    return { ok: true, mensaje: 'Excepción registrada con su sustento.', problemas: [] }
  } catch (e) {
    if (e instanceof DatoDeBeneficiarioInvalido) {
      return { ok: false, mensaje: 'No se registró la excepción.', problemas: e.problemas }
    }
    return { ok: false, mensaje: e instanceof Error ? e.message : String(e), problemas: [] }
  } finally {
    await db.end()
  }
}
