'use server'

import { revalidatePath } from 'next/cache'
import { conBase } from '../../src/supabase/conexion'
import {
  DatoDeAuditoriaInvalido,
  PlazoDeAuditoriaAusente,
  SinEvaluacionDeEntidad,
  abrirPeriodo,
  designarAuditorExterno,
  designarAuditorInterno,
  sustituirAuditor,
  type DatosAuditorExterno,
} from '../../src/persistencia/auditoria'
import { FUNDAMENTO_DE_LA_RUTA, NOMBRE_DE_LA_RUTA } from '../../src/dominio/auditoria'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Las escrituras del Cap. XIV, Fase 1 (Arts. 42-45, 50 ¶1).
 *
 * Mismo reparto que `app/capacitacion/acciones.ts`: ningún cálculo
 * regulatorio vive aquí — la ruta, el periodo, la fecha límite y los cinco
 * incisos del Art. 45 los decide `src/persistencia/auditoria.ts`. Esta capa
 * solo traduce el FormData al `p` que cada función de persistencia espera, y
 * traduce el error de vuelta a algo que se pueda leer en pantalla.
 */

export interface Resultado {
  ok: boolean | null
  mensaje: string
  /** Lo capturado, para repintar el formulario tras un error (ver `useRepintado`). */
  valores?: Record<string, string | string[]>
}

/** Lo tecleado, tal cual, sin interpretarlo. Solo para repintar el formulario. */
function capturado(datos: FormData): Record<string, string | string[]> {
  const v: Record<string, string | string[]> = {}
  for (const [k, valor] of datos.entries()) {
    if (typeof valor === 'string') v[k] = valor
  }
  return v
}

/**
 * El mensaje completo de un error de Postgres.
 *
 * El driver `pg` separa el texto de un `raise exception` en `.message` y
 * `.detail` — y dos de los triggers de la migración 20260908120000
 * (`auditor_interno_no_es_el_rec`, `auditor_interno_con_capacitacion_acreditada`)
 * ponen la cita del artículo en `detail`, no en `message`. Quedarse solo con
 * `.message` perdería exactamente el texto que el trigger redactó para que el
 * usuario lo lea (ver la nota del encargo: "asegúrate de que ese texto llegue
 * al usuario en vez de perderse").
 */
function mensajeCompleto(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const conDetalle = e as Error & { detail?: unknown }
  const detalle = typeof conDetalle.detail === 'string' ? conDetalle.detail.trim() : ''
  return detalle === '' ? e.message : `${e.message} ${detalle}`
}

/** El código SQLSTATE de un error de Postgres, si lo trae. */
function codigoSql(e: unknown): string | undefined {
  if (!(e instanceof Error)) return undefined
  const c = (e as Error & { code?: unknown }).code
  return typeof c === 'string' ? c : undefined
}

/**
 * Las restricciones y triggers de la migración 20260908120000, para el caso
 * de que suban crudos en vez de venir ya traducidos por la persistencia.
 *
 * `un_periodo_por_anio` y `un_auditor_vigente_por_periodo` ya los traduce
 * `src/persistencia/auditoria.ts` antes de que lleguen aquí (`abrirPeriodo` y
 * `traducirErrorDeDesignacion`); se dejan igual, como red de seguridad, por si
 * algún día una llamada no pasa por esas funciones. Los otros cuatro
 * (`auditor_externo_con_sus_requisitos`, `auditor_interno_es_una_persona`,
 * `periodo_cierra_el_ultimo_dia_del_anio`, `sustitucion_completa`) son CHECKs
 * estructurales que la validación en JS ya debería impedir: si uno de estos
 * llega hasta acá es un hueco en esa validación, y vale más nombrarlo que
 * caer en un 500 con un digest opaco.
 */
const POR_RESTRICCION: Record<string, string> = {
  un_periodo_por_anio: 'Ya existe un periodo de auditoría abierto para ese año en este obligado.',
  un_auditor_vigente_por_periodo:
    'Este periodo ya tiene un auditor vigente. Sustitúyelo primero y vuelve a designar.',
  auditor_externo_con_sus_requisitos:
    'A la persona auditora externa le falta algún dato del Art. 45, o alguno de los incisos c), ' +
    'd) o e) no quedó declarado.',
  auditor_interno_es_una_persona:
    'Un auditor interno se designa como una persona de la plantilla del Cap. XII, sin los datos ' +
    'del auditor externo (Art. 44).',
  periodo_cierra_el_ultimo_dia_del_anio: 'El periodo de auditoría debe cerrar el 31 de diciembre (Arts. 42/43).',
  sustitucion_completa: 'La sustitución necesita fecha y motivo juntos: no se puede dejar a medias.',
}

function traducir(e: unknown, valores: Record<string, string | string[]>): Resultado {
  if (
    e instanceof DatoDeAuditoriaInvalido ||
    e instanceof PlazoDeAuditoriaAusente ||
    e instanceof SinEvaluacionDeEntidad
  ) {
    return { ok: false, mensaje: e.message, valores }
  }

  const bruto = mensajeCompleto(e)
  const restriccion = Object.keys(POR_RESTRICCION).find((c) => bruto.includes(c))
  if (restriccion !== undefined) {
    return { ok: false, mensaje: POR_RESTRICCION[restriccion] ?? bruto, valores }
  }

  // Los dos guardas del Art. 44 (REC, capacitación acreditada) no violan un
  // constraint con nombre: levantan su propio check_violation con el mensaje
  // ya redactado en español (mensajeCompleto ya le pegó la cita del artículo
  // que viaja en `detail`). Cualquier check_violation de esta migración es,
  // por diseño, seguro de enseñar tal cual.
  if (codigoSql(e) === '23514') {
    return { ok: false, mensaje: bruto, valores }
  }

  throw e
}

function refrescar(): void {
  revalidatePath('/auditoria')
  revalidatePath('/')
}

export async function accionAbrirPeriodo(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const anio = Number(datos.get('anio'))
  try {
    const periodo = await conBase(({ db, sesion }) =>
      abrirPeriodo(db, { sesion, anio, hoy: hoyEnMexico() }),
    )
    refrescar()

    const calendario = periodo.limiteConCalendario
      ? ''
      : ' El calendario de días inhábiles de ese año todavía no está cargado: el último día hábil ' +
        'real podría caer antes de esta fecha.'
    const advertencia = periodo.advertencia === null ? '' : ` ${periodo.advertencia}`

    return {
      ok: true,
      mensaje:
        `Periodo ${String(periodo.anio)} abierto: del ${periodo.inicio} al ${periodo.fin}. ` +
        `Ruta: ${NOMBRE_DE_LA_RUTA[periodo.ruta]} (${FUNDAMENTO_DE_LA_RUTA}). Entrega a más tardar ` +
        `el ${periodo.fechaLimiteEntrega} (Art. 50 ¶1).${calendario}${advertencia}`,
    }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}

export async function accionDesignarAuditorInterno(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  try {
    await conBase(({ db, sesion }) =>
      designarAuditorInterno(db, {
        sesion,
        periodoId: String(datos.get('periodoId') ?? ''),
        personaId: String(datos.get('personaId') ?? ''),
      }),
    )
    refrescar()
    return { ok: true, mensaje: 'Auditor interno designado (Art. 44).' }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}

export async function accionDesignarAuditorExterno(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const hash = String(datos.get('acreditaHash') ?? '').trim()
  const archivo = String(datos.get('acreditaArchivo') ?? '').trim()

  const externo: DatosAuditorExterno = {
    nombre: String(datos.get('nombre') ?? ''),
    profesion: String(datos.get('profesion') ?? ''),
    cedulaProfesional: String(datos.get('cedulaProfesional') ?? ''),
    // Vacío es NaN y no 0: `Number('')` da cero, y eso diría «declaró cero
    // años» donde lo cierto es que no declaró nada (mismo criterio que
    // accionRegistrarSesion en capacitacion/acciones.ts).
    aniosExperiencia: Number(String(datos.get('aniosExperiencia') ?? '').trim() || NaN),
    certificacionUifFolio: String(datos.get('certificacionUifFolio') ?? ''),
    certificacionUifVence: String(datos.get('certificacionUifVence') ?? ''),
    acreditacion: hash === '' ? undefined : { hash, archivo },
    sinSentenciaPatrimonial: datos.get('sinSentenciaPatrimonial') === 'si',
    sinServiciosPreviosEnConflicto: datos.get('sinServiciosPreviosEnConflicto') === 'si',
    sinCargoRecEnVeda: datos.get('sinCargoRecEnVeda') === 'si',
  }

  try {
    await conBase(({ db, sesion }) =>
      designarAuditorExterno(db, {
        sesion,
        periodoId: String(datos.get('periodoId') ?? ''),
        datos: externo,
      }),
    )
    refrescar()
    return { ok: true, mensaje: 'Persona auditora externa designada (Art. 45).' }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}

export async function accionSustituirAuditor(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  try {
    await conBase(({ db, sesion }) =>
      sustituirAuditor(db, {
        sesion,
        auditorId: String(datos.get('auditorId') ?? ''),
        motivo: String(datos.get('motivo') ?? ''),
        hoy: hoyEnMexico(),
      }),
    )
    refrescar()
    return {
      ok: true,
      mensaje:
        'Auditor sustituido. La designación anterior queda en la historia del periodo: un hecho ' +
        'no se borra, se sustituye.',
    }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}
