'use server'

import { revalidatePath } from 'next/cache'
import { conBase } from '../../src/supabase/conexion'
import {
  DatoDeCapacitacionInvalido,
  PlazoDeCapacitacionAusente,
  agregarAPlantilla,
  darDeBajaDelArea,
  evaluarYAcreditar,
  registrarSesion,
} from '../../src/persistencia/capacitacion'
import type { RolCapacitacion, TemaCapacitacion } from '../../src/dominio/capacitacion'
import {
  AlcanceDeSeleccionAusente,
  DatoDeSeleccionInvalido,
  recabarDeclaracion,
  registrarFechaDeContratacion,
} from '../../src/persistencia/seleccion-personal'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Las escrituras del Cap. XII.
 *
 * Ninguna de las tres decide nada regulatorio: el mínimo de años sale del
 * catálogo dentro de la persistencia, y aquí solo se traduce el formulario. Lo
 * único que esta capa aporta es que el error del artículo llegue a la pantalla
 * en palabras del artículo y no como un `check_violation` de Postgres.
 */

export interface Resultado {
  ok: boolean | null
  mensaje: string
  /**
   * Lo que el usuario había capturado, para devolvérselo cuando la acción
   * falla. React 19 vacía el DOM del formulario tras cada acción, y sin esto
   * el error «declaró 2 años y la fr. III pide 5» aparecería sobre un
   * formulario en blanco: el mensaje dice qué corregir y no queda qué
   * corregir. Es el mismo patrón del alta de clientes.
   */
  valores?: Record<string, string | string[]>
}

/** Lo tecleado, tal cual, sin interpretarlo. Solo para repintar el formulario. */
function capturado(datos: FormData, multiples: readonly string[] = []): Record<string, string | string[]> {
  const v: Record<string, string | string[]> = {}
  for (const campo of multiples) v[campo] = datos.getAll(campo).map(String)
  for (const [k, valor] of datos.entries()) {
    if (multiples.includes(k)) continue
    if (typeof valor === 'string') v[k] = valor
  }
  return v
}

/** Las restricciones que la base impone y que el usuario puede corregir. */
const POR_RESTRICCION: Record<string, string> = {
  anio_desde_el_primer_periodo:
    'Antes del primer periodo que fija el Transitorio Séptimo no hay programa que registrar: ' +
    'una sesión anterior no acreditaría ningún periodo.',
  constancia_exige_evaluacion_satisfactoria:
    'No se expide constancia sin evaluación satisfactoria (Art. 39 Bis 1 ¶2).',
  un_programa_por_anio: 'Ya existe un programa de ese periodo.',
  una_asistencia_por_persona_y_sesion: 'Esa persona ya está en la lista de asistencia.',
}

function traducir(e: unknown, valores: Record<string, string | string[]>): Resultado {
  if (e instanceof DatoDeCapacitacionInvalido || e instanceof PlazoDeCapacitacionAusente) {
    return { ok: false, mensaje: e.message, valores }
  }

  // Última red: una restricción de la base que llega hasta aquí es un hueco de
  // validación, y hasta que se tape vale más devolverla nombrada que dejar
  // caer la pantalla en un 500 con un digest opaco — eso pierde además todo lo
  // capturado. El nombre de la restricción va en el mensaje a propósito: es lo
  // que permite ir a taparla.
  const bruto = e instanceof Error ? e.message : String(e)
  const restriccion = Object.keys(POR_RESTRICCION).find((c) => bruto.includes(c))
  if (restriccion !== undefined) {
    return { ok: false, mensaje: POR_RESTRICCION[restriccion] ?? bruto, valores }
  }

  throw e
}

function refrescar(): void {
  revalidatePath('/capacitacion')
  revalidatePath('/')
}

export async function accionAgregarAPlantilla(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  try {
    await conBase(({ db, sesion }) =>
      agregarAPlantilla(db, {
        sesion,
        nombre: String(datos.get('nombre') ?? ''),
        rol: String(datos.get('rol') ?? '') as RolCapacitacion,
        ingresoAlArea: String(datos.get('ingresoAlArea') ?? ''),
      }),
    )
    refrescar()
    return { ok: true, mensaje: 'Persona agregada a la plantilla del periodo.' }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}

export async function accionRegistrarSesion(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const hash = String(datos.get('acreditaHash') ?? '').trim()
  const archivo = String(datos.get('acreditaArchivo') ?? '').trim()

  try {
    await conBase(({ db, sesion }) =>
      registrarSesion(db, {
        sesion,
        anio: Number(datos.get('anio')),
        hoy: hoyEnMexico(),
        datos: {
          titulo: String(datos.get('titulo') ?? ''),
          fecha: String(datos.get('fecha') ?? ''),
          temas: datos.getAll('temas').map(String) as TemaCapacitacion[],
          instructorNombre: String(datos.get('instructorNombre') ?? ''),
          // Un campo vacío es NaN y no 0: `Number('')` da cero, y eso diría
          // «declaró cero años» donde lo cierto es que no declaró nada.
          instructorAniosExperiencia: Number(String(datos.get('anios') ?? '').trim() || NaN),
          acreditacion: hash === '' ? undefined : { hash, archivo },
          asistentes: datos.getAll('asistentes').map(String),
        },
      }),
    )
    refrescar()
    return { ok: true, mensaje: 'Sesión registrada con su lista de asistencia.' }
  } catch (e) {
    return traducir(e, capturado(datos, ['temas', 'asistentes']))
  }
}

export async function accionEvaluar(_previo: Resultado, datos: FormData): Promise<Resultado> {
  const satisfactoria = datos.get('resultado') === 'satisfactoria'
  const folio = String(datos.get('folio') ?? '').trim()

  try {
    await conBase(({ db, sesion }) =>
      evaluarYAcreditar(db, {
        sesion,
        asistenciaId: String(datos.get('asistenciaId') ?? ''),
        satisfactoria,
        fecha: String(datos.get('fecha') ?? ''),
        detalle: String(datos.get('detalle') ?? '').trim() || undefined,
        folio: folio === '' ? undefined : folio,
      }),
    )
    refrescar()
    return {
      ok: true,
      mensaje: satisfactoria
        ? `Evaluación satisfactoria asentada y constancia ${folio} expedida.`
        : 'Evaluación asentada. Sin resultado satisfactorio no hay constancia: lo que sigue lo ' +
          'dice el Manual de Políticas Internas.',
    }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}

export async function accionDarDeBaja(_previo: Resultado, datos: FormData): Promise<Resultado> {
  try {
    await conBase(({ db, sesion }) =>
      darDeBajaDelArea(db, {
        sesion,
        personaId: String(datos.get('personaId') ?? ''),
        fecha: String(datos.get('fechaBaja') ?? ''),
      }),
    )
    refrescar()
    return {
      ok: true,
      mensaje:
        'Baja registrada. Sigue contando en los periodos en los que estuvo en su área: la baja ' +
        'dice desde cuándo dejó de contar, no borra lo anterior.',
    }
  } catch (e) {
    return traducir(e, capturado(datos))
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Art. 39 Bis 2 · Selección de personal
// ─────────────────────────────────────────────────────────────────────────

function traducirSeleccion(e: unknown, valores: Record<string, string | string[]>): Resultado {
  if (e instanceof DatoDeSeleccionInvalido || e instanceof AlcanceDeSeleccionAusente) {
    return { ok: false, mensaje: e.message, valores }
  }
  const bruto = e instanceof Error ? e.message : String(e)
  if (/contratacion_no_posterior_al_ingreso/.test(bruto)) {
    return {
      ok: false,
      valores,
      mensaje:
        'La fecha de contratación no puede ser posterior a la de ingreso al área: nadie entra a ' +
        'un área antes de ser contratado.',
    }
  }
  throw e
}

export async function accionRegistrarContratacion(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  try {
    await conBase(({ db, sesion }) =>
      registrarFechaDeContratacion(db, {
        sesion,
        personaId: String(datos.get('personaId') ?? ''),
        fecha: String(datos.get('fechaContratacion') ?? ''),
      }),
    )
    refrescar()
    return {
      ok: true,
      mensaje:
        'Fecha de contratación registrada. Con ella ya se puede decir si le alcanza el Art. 39 ' +
        'Bis 2, que el Transitorio Sexto acota a las nuevas contrataciones.',
    }
  } catch (e) {
    return traducirSeleccion(e, capturado(datos))
  }
}

export async function accionRecabarDeclaracion(
  _previo: Resultado,
  datos: FormData,
): Promise<Resultado> {
  const hash = String(datos.get('firmaHash') ?? '').trim()
  const archivo = String(datos.get('firmaArchivo') ?? '').trim()
  const sectores = String(datos.get('sectoresPrevios') ?? '').trim()

  try {
    await conBase(({ db, sesion }) =>
      recabarDeclaracion(db, {
        sesion,
        datos: {
          personaId: String(datos.get('personaId') ?? ''),
          fechaDeclaracion: String(datos.get('fechaDeclaracion') ?? ''),
          laboroEnSectorObligado: datos.get('laboroEnSectorObligado') === 'si',
          ...(sectores === '' ? {} : { sectoresPrevios: sectores }),
          // Las tres del texto vienen como casillas MARCADAS por omisión no:
          // que la persona afirme cada una es un acto, no un valor por defecto.
          sinSentenciaPatrimonial: datos.get('sinSentenciaPatrimonial') === 'si',
          sinInhabilitacionComercio: datos.get('sinInhabilitacionComercio') === 'si',
          sinInhabilitacionServicioOFinanciero:
            datos.get('sinInhabilitacionServicioOFinanciero') === 'si',
          ...(hash === '' ? {} : { firma: { hash, archivo } }),
        },
      }),
    )
    refrescar()
    return { ok: true, mensaje: 'Declaración asentada tal como se firmó.' }
  } catch (e) {
    return traducirSeleccion(e, capturado(datos))
  }
}
