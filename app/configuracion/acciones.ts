'use server'

import { revalidatePath } from 'next/cache'
import { conBase } from '../../src/supabase/conexion'
import {
  FechaDeAltaInvalida,
  NoAutorizado,
  registrarFechaAlta,
  registrarTipoPersona,
  TipoDePersonaInvalido,
} from '../../src/persistencia/obligado'
import {
  DatoDelRecInvalido,
  NoAplicaDesignacion,
  RelevoExigeSustituir,
  designarRec,
  registrarRespuestaRec,
  sustituirRec,
} from '../../src/persistencia/rec'

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

  try {
    const guardada = await conBase(({ db, sesion }) => registrarFechaAlta(db, { sesion, fecha }))

    revalidatePath('/configuracion')
    revalidatePath('/avisos')
    revalidatePath('/')
    return {
      ok: true,
      mensaje: `Fecha de alta registrada: ${guardada}. Los periodos pendientes se recalculan desde ahí.`,
    }
  } catch (e) {
    if (e instanceof FechaDeAltaInvalida || e instanceof NoAutorizado) {
      return { ok: false, mensaje: e.message }
    }

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

/**
 * Qué clase de persona es el obligado.
 *
 * Cambia el checklist de arranque: de aquí depende que aparezca —o no— el paso
 * de la designación del REC. Por eso revalida también la portada.
 */
export async function guardarTipoPersona(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const tipo = String(datos.get('tipoPersona') ?? '').trim()

  try {
    await conBase(({ db, sesion }) => registrarTipoPersona(db, { sesion, tipo }))

    revalidatePath('/configuracion')
    revalidatePath('/')
    return {
      ok: true,
      mensaje:
        tipo === 'fisica'
          ? 'Registrado como persona física. Una persona física que realiza la Actividad Vulnerable responde ella misma: no designa REC (Art. 20 de la Ley).'
          : 'Registrado. Falta la designación del Representante Encargado de Cumplimiento y su aceptación.',
    }
  } catch (e) {
    return traducir(e)
  }
}

export async function guardarDesignacionRec(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const rfc = String(datos.get('rfc') ?? '')
  const nombre = String(datos.get('nombre') ?? '')
  const fecha = String(datos.get('fechaDesignacion') ?? '').trim()

  try {
    await conBase(({ db, sesion }) => designarRec(db, { sesion, rfc, nombre, fecha }))

    revalidatePath('/configuracion')
    revalidatePath('/')
    return {
      ok: true,
      mensaje:
        'Designación registrada. Todavía no cuenta como REC: hasta que la persona designada acepte ' +
        'en el Portal del SAT, el cumplimiento sigue recayendo en el órgano de administración.',
    }
  } catch (e) {
    return traducir(e)
  }
}

export async function guardarRespuestaRec(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const designacionId = String(datos.get('designacionId') ?? '')
  const respuesta = String(datos.get('respuesta') ?? '')
  const fecha = String(datos.get('fechaRespuesta') ?? '').trim()
  const notificacion = String(datos.get('fechaNotificacionSat') ?? '').trim()

  if (respuesta !== 'aceptada' && respuesta !== 'rechazada') {
    return { ok: false, mensaje: 'La respuesta solo puede ser aceptación o rechazo.' }
  }

  try {
    await conBase(({ db, sesion }) =>
      registrarRespuestaRec(db, {
        sesion,
        designacionId,
        respuesta,
        fecha,
        ...(notificacion === '' ? {} : { fechaNotificacionSat: notificacion }),
      }),
    )

    revalidatePath('/configuracion')
    revalidatePath('/')
    return {
      ok: true,
      mensaje:
        respuesta === 'aceptada'
          ? `Aceptación registrada el ${fecha}. Desde esa fecha la designación está completa.`
          : `Rechazo registrado el ${fecha}. El rechazo no libera al obligado de ninguna obligación ` +
            '(Art. 10 del Acuerdo): hay que designar a alguien más.',
    }
  } catch (e) {
    return traducir(e)
  }
}

export async function guardarSustitucionRec(
  _previo: Resultado | null,
  datos: FormData,
): Promise<Resultado> {
  const designacionId = String(datos.get('designacionId') ?? '')

  try {
    await conBase(({ db, sesion }) => sustituirRec(db, { sesion, designacionId }))

    revalidatePath('/configuracion')
    revalidatePath('/')
    return {
      ok: true,
      mensaje:
        'Sustitución registrada. Mientras nadie más acepte la designación, el cumplimiento vuelve ' +
        'a recaer en el órgano de administración (Art. 20 de la Ley).',
    }
  } catch (e) {
    return traducir(e)
  }
}

/**
 * Un error que la persona pueda atender.
 *
 * Los errores de dominio ya traen su mensaje. Lo que se traduce aquí es lo que
 * llega crudo de la base: RLS y los CHECK hablan en su propio idioma, y ese
 * idioma en pantalla no le dice a nadie qué hacer.
 */
function traducir(e: unknown): Resultado {
  if (
    e instanceof DatoDelRecInvalido ||
    e instanceof NoAplicaDesignacion ||
    e instanceof RelevoExigeSustituir ||
    e instanceof TipoDePersonaInvalido ||
    e instanceof FechaDeAltaInvalida ||
    e instanceof NoAutorizado
  ) {
    return { ok: false, mensaje: e.message }
  }

  const bruto = e instanceof Error ? e.message : String(e)

  if (/rec_es_persona_fisica/.test(bruto)) {
    return {
      ok: false,
      mensaje: 'El REC tiene que ser una persona física, y ese RFC no lo es.',
    }
  }
  if (/respuesta_no_precede_designacion|notificacion_no_precede_respuesta/.test(bruto)) {
    return {
      ok: false,
      mensaje: 'Las fechas no van en ese orden: la respuesta no puede ser anterior a la designación.',
    }
  }
  if (/designacion_rec_una_pendiente|designacion_rec_una_vigente/.test(bruto)) {
    return {
      ok: false,
      mensaje:
        'El obligado ya tiene una designación en ese estado. Registra primero cómo terminó la anterior.',
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

/*
 * NOTA DE SEGURIDAD, de la auditoría de F1.
 *
 * Aquí vivía `usuariosDelObligado`, exportada y usada por nadie: la pantalla de
 * configuración lee los usuarios directamente en su Server Component.
 *
 * En un módulo `'use server'` eso NO es código muerto normal. Next convierte
 * CADA export en un endpoint invocable desde el navegador, así que una función
 * sin usar es superficie de ataque sin contrapartida. Se borró.
 *
 * Regla para lo que venga: en un archivo `'use server'` no se exporta nada que
 * no se llame desde el cliente.
 */
