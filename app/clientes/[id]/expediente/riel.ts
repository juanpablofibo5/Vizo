import type { EstadoAprobacion } from '../../../../src/persistencia/aprobacion'
import type { EstadoPep } from '../../../../src/persistencia/pep'
import type { EstadoPerfil } from '../../../../src/persistencia/perfil'
import type { RiesgoDelCliente } from '../../../../src/persistencia/riesgo'

/**
 * Lo que el riel dice de cada sección: la palabra, el color y el reloj.
 *
 * Este módulo NO calcula nada regulatorio — traduce a palabras estados que la
 * persistencia ya derivó. Aun así tiene prueba propia, porque el riel es el
 * resumen de cumplimiento que un admin mira de reojo, y un resumen que
 * tranquiliza de más es exactamente el modo de falla de la regla dura 6:
 * «indeterminable» pintado como «no requerida» no revienta nada, solo miente.
 */

export type TonoDeRiel = 'ok' | 'aviso' | 'critico' | 'neutro'

export interface EstadoDeRiel {
  /** La palabra del chip: corta, y nunca más tranquila que el estado real. */
  estado: string
  tono: TonoDeRiel
  /** La segunda línea: qué reloj corre, o por qué no corre ninguno. */
  reloj: string
}

/** Los timestamps de la base vienen con hora; el riel habla en días. */
const dia = (t: string): string => t.slice(0, 10)

export function rielRevisionAnual(p: {
  relacionNegocios: boolean | null
  vence: string | null
  hoy: string
}): EstadoDeRiel {
  // Sin respuesta no hay ciclo — y eso no es «al corriente», es no saber.
  if (p.relacionNegocios === null)
    return { estado: 'Sin declarar', tono: 'neutro', reloj: 'la Relación de negocios decide el ciclo' }
  if (!p.relacionNegocios)
    return { estado: 'Actos ocasionales', tono: 'neutro', reloj: 'sin ciclo anual (Art. 3 fr. XIV)' }
  if (p.vence === null)
    return { estado: 'Sin arrancar', tono: 'neutro', reloj: 'corre desde la aprobación' }
  if (p.vence < p.hoy)
    return { estado: 'Vencida', tono: 'critico', reloj: `venció el ${dia(p.vence)}` }
  return { estado: 'Vigente', tono: 'ok', reloj: `vence el ${dia(p.vence)}` }
}

export function rielGradoDeRiesgo(r: RiesgoDelCliente): EstadoDeRiel {
  if (!r.puedeClasificar)
    return { estado: 'Sin metodología', tono: 'neutro', reloj: 'falta configurar el modelo' }
  if (r.vigente === null)
    return { estado: 'Sin evaluar', tono: 'neutro', reloj: `reevaluación cada ${String(r.reevaluacionMeses)} meses` }
  // Que el grado esté vencido nunca lo vuelve más tranquilo: un alto vencido
  // sigue siendo alto, y un bajo vencido dejó de ser un dato confiable.
  if (r.vigente.vencida)
    return {
      estado: `${r.vigente.gradoNombre} · vencido`,
      tono: 'aviso',
      reloj: `venció el ${dia(r.vigente.vence)}`,
    }
  return {
    estado: r.vigente.gradoNombre,
    tono: r.vigente.esAlto ? 'aviso' : 'ok',
    reloj: `calificado el ${dia(r.vigente.evaluadoEn)}`,
  }
}

export function rielPerfil(p: EstadoPerfil): EstadoDeRiel {
  if (p.vigente === null) {
    // Antes de la exigibilidad el hueco es una vista anticipada; después, cada
    // operación va a levantar `perfil_ausente` y eso sí es rojo.
    return p.anticipado
      ? { estado: 'Sin declarar', tono: 'neutro', reloj: `exigible desde el ${p.plazos.exigibleDesde}` }
      : { estado: 'Sin declarar', tono: 'critico', reloj: 'toda operación levanta alerta' }
  }
  if (p.reevaluacionDebida)
    return {
      estado: 'Reevaluación debida',
      tono: 'aviso',
      reloj:
        p.reevaluableDesde === null
          ? 'ya toca reevaluar'
          : `reevaluable desde el ${p.reevaluableDesde}`,
    }
  return { estado: 'Declarado', tono: 'ok', reloj: `anclado al acto del ${p.vigente.fechaAncla}` }
}

const FALTA: Record<string, string> = {
  caracter_pep: 'sin declaración PEP',
  grado_de_riesgo: 'sin Grado de riesgo',
  grado_vencido: 'el grado venció',
}

export function rielAprobacion(a: EstadoAprobacion): EstadoDeRiel {
  const e = a.exigencia
  if (e.estado === 'no_exigible')
    return {
      estado: 'No requerida',
      tono: 'neutro',
      reloj: e.porque === 'no_es_pep' ? 'no hay carácter PEP' : 'el grado no es alto',
    }
  // La celda vacía de la tabla de tres valores. «No se sabe» NUNCA se pinta
  // como «no requerida»: es lo que la prueba de abajo existe para impedir.
  if (e.estado === 'indeterminable')
    return {
      estado: 'No se sabe',
      tono: 'aviso',
      reloj: e.falta.map((f) => FALTA[f] ?? f).join(' · '),
    }
  if (a.actosSinConsentir.length > 0) {
    const n = a.actosSinConsentir.length
    return {
      estado: 'Falta aprobación',
      // Antes del Transitorio Cuarto la omisión todavía no corre; después sí.
      tono: a.anticipado ? 'aviso' : 'critico',
      reloj: n === 1 ? '1 acto sin consentir' : `${String(n)} actos sin consentir`,
    }
  }
  const ultima = a.aprobaciones[0]
  if (ultima !== undefined)
    return { estado: 'Otorgada', tono: 'ok', reloj: `registrada el ${dia(ultima.fechaAprobacion)}` }
  return { estado: 'Requerida', tono: 'aviso', reloj: 'antes de operar' }
}

/** `null` es persona moral: la declaración del Art. 23 Quáter no le aplica. */
export function rielPep(e: EstadoPep | null): EstadoDeRiel {
  if (e === null)
    return { estado: 'No aplica', tono: 'neutro', reloj: 'de personas físicas' }
  const declarada =
    e.declaracion === null ? 'sin fecha' : `declarada el ${dia(e.declaracion.fechaDeclaracion)}`
  switch (e.motivo) {
    case 'sin_declaracion':
      return e.anticipada
        ? { estado: 'Sin declaración', tono: 'neutro', reloj: `exigible desde el ${e.exigibleDesde}` }
        : { estado: 'Sin declaración', tono: 'aviso', reloj: 'la captura está pendiente' }
    case 'declaro_que_no':
      return { estado: 'Niega', tono: 'ok', reloj: declarada }
    case 'por_funcion':
      return { estado: 'PEP por función', tono: 'aviso', reloj: declarada }
    case 'asimilada':
      return { estado: 'PEP asimilada', tono: 'aviso', reloj: declarada }
    case 'relojes_vencidos':
      return { estado: 'Caducada', tono: 'aviso', reloj: 'toca redeclarar' }
  }
}

/** Las secciones del Art. 23 Ter 3 y 4, declaradas antes de existir. */
export function rielPorConstruir(exigibleDesde: string): EstadoDeRiel {
  return { estado: 'Por construir', tono: 'neutro', reloj: `exigible desde el ${exigibleDesde}` }
}

/**
 * Cuál sección amanece abierta: la más grave. Si ninguna pide atención, todas
 * cerradas — el riel ya cuenta la historia completa.
 */
export function seccionAbiertaPorDefecto(
  secciones: ReadonlyArray<{ id: string; tono: TonoDeRiel }>,
): string | null {
  return (
    secciones.find((s) => s.tono === 'critico')?.id ??
    secciones.find((s) => s.tono === 'aviso')?.id ??
    null
  )
}
