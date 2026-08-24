import type { ExigenciaDeAprobacion } from '../../src/dominio/aprobacion-directivo'
import type { MotivoPep } from '../../src/persistencia/pep'

/**
 * Lo que el riel dice de cada sección: la palabra, el color y el reloj.
 *
 * Este módulo NO calcula nada regulatorio — traduce a palabras estados que la
 * persistencia ya derivó. Aun así tiene prueba propia, porque el riel es el
 * resumen de cumplimiento que un admin mira de reojo, y un resumen que
 * tranquiliza de más es exactamente el modo de falla de la regla dura 6:
 * «indeterminable» pintado como «no requerida» no revienta nada, solo miente.
 *
 * Cada función recibe UNA INTERFAZ ESTRECHA con exactamente los campos que
 * lee, no el estado gordo de la persistencia. No es purismo: el expediente
 * alimenta estas funciones con `EstadoPerfil`, `RiesgoDelCliente` y compañía
 * —que encajan de sobra, porque TypeScript es estructural— y la lista de
 * clientes las alimenta con filas compactas de una consulta por lote. Así las
 * dos pantallas dicen la misma palabra sobre el mismo cliente **porque es el
 * mismo código**, no porque alguien recuerde actualizar las dos.
 */

export type TonoDeRiel = 'ok' | 'aviso' | 'critico' | 'neutro'

/** Ordenados de más grave a menos: el resumen se queda con el primero. */
const GRAVEDAD: readonly TonoDeRiel[] = ['critico', 'aviso', 'ok', 'neutro']

/**
 * El peor de varios estados, que es lo que resume una sola píldora.
 *
 * `neutro` es el menos grave A PROPÓSITO, y merece explicación: neutro no
 * quiere decir «bien», quiere decir «no corre ningún reloj» —sin metodología,
 * acto ocasional, capítulo aún no exigible—. Si ganara sobre `ok`, un cliente
 * en regla se vería igual que uno sin evaluar. Lo que nunca puede pasar es que
 * neutro tape un ámbar o un rojo, y por eso van delante.
 */
export function peorTono(tonos: readonly TonoDeRiel[]): TonoDeRiel {
  return GRAVEDAD.find((g) => tonos.includes(g)) ?? 'neutro'
}

/** El más grave de varios estados, con su palabra y su reloj. */
export function peorEstado(estados: readonly EstadoDeRiel[]): EstadoDeRiel {
  const peor = peorTono(estados.map((e) => e.tono))
  return estados.find((e) => e.tono === peor) ?? { estado: '—', tono: 'neutro', reloj: '' }
}

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

export interface RiesgoParaRiel {
  readonly puedeClasificar: boolean
  readonly vigente: {
    readonly gradoNombre: string
    readonly esAlto: boolean
    readonly vencida: boolean
    readonly vence: string
    readonly evaluadoEn: string
  } | null
  readonly reevaluacionMeses: number
}

export function rielGradoDeRiesgo(r: RiesgoParaRiel): EstadoDeRiel {
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

export interface PerfilParaRiel {
  readonly vigente: { readonly fechaAncla: string } | null
  readonly plazos: { readonly exigibleDesde: string }
  readonly reevaluacionDebida: boolean
  readonly reevaluableDesde: string | null
  readonly anticipado: boolean
}

export function rielPerfil(p: PerfilParaRiel): EstadoDeRiel {
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

export interface AprobacionParaRiel {
  readonly exigencia: ExigenciaDeAprobacion
  readonly actosSinConsentir: readonly unknown[]
  readonly aprobaciones: readonly { readonly fechaAprobacion: string }[]
  readonly anticipado: boolean
}

export function rielAprobacion(a: AprobacionParaRiel): EstadoDeRiel {
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

export interface PepParaRiel {
  readonly declaracion: { readonly fechaDeclaracion: string } | null
  readonly motivo: MotivoPep
  readonly exigibleDesde: string
  readonly anticipada: boolean
}

/** `null` es persona moral: la declaración del Art. 23 Quáter no le aplica. */
export function rielPep(e: PepParaRiel | null): EstadoDeRiel {
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

/**
 * El estado del expediente como píldora, para la lista de clientes.
 *
 * Distingue COMPLETO de APROBADO, que es la distinción que la pantalla del
 * expediente explica con todas sus letras: estar completo es que no falte
 * nada; aprobarlo es que alguien haya comprobado que lo que hay sirve. Un
 * expediente 13 de 13 sin aprobar no está listo, y la lista no puede pintarlo
 * verde — es la misma trampa que «indeterminable» pintado de «no requerida».
 */
export interface ExpedienteParaRiel {
  /** `null` cuando el cliente todavía no tiene expediente abierto (ADR-24). */
  readonly estatus: string | null
  /** `null` cuando nunca se ha evaluado la completitud: no es «completo». */
  readonly cubiertos: number | null
  readonly totalObligatorios: number | null
}

export function rielExpediente(e: ExpedienteParaRiel): EstadoDeRiel {
  if (e.estatus === null)
    return { estado: 'Sin abrir', tono: 'neutro', reloj: 'no hay expediente' }
  if (e.cubiertos === null || e.totalObligatorios === null)
    return { estado: 'Sin evaluar', tono: 'neutro', reloj: 'no se sabe qué falta' }

  const cuenta = `${String(e.cubiertos)} de ${String(e.totalObligatorios)}`
  if (e.estatus === 'aprobado') return { estado: 'Aprobado', tono: 'ok', reloj: cuenta }
  if (e.cubiertos < e.totalObligatorios)
    return { estado: 'Incompleto', tono: 'critico', reloj: cuenta }
  // Completo y sin aprobar: nadie ha mirado que los documentos sirvan.
  return { estado: 'Falta aprobar', tono: 'aviso', reloj: cuenta }
}

/**
 * Las siete secciones del conocimiento del cliente, en su orden.
 *
 * Vive aquí y no en la página del expediente porque hay DOS pantallas que las
 * nombran: el expediente, que las pinta, y la puerta del ADR-24, que promete
 * cuáles se desbloquean al abrirlo. Con dos listas escritas a mano, la puerta
 * se queda prometiendo cinco el día que el expediente pase a siete —y nadie
 * se entera, porque las dos pantallas se ven bien por separado.
 *
 * El orden no es estético: la 04 depende de la 02 y de la 05, y sin alguna de
 * las dos no da «no se requiere» sino el hueco.
 */
export const SECCIONES_DEL_CONOCIMIENTO = [
  { id: 'revision', numero: '01', titulo: 'Revisión anual', articulo: 'Art. 21' },
  { id: 'riesgo', numero: '02', titulo: 'Grado de riesgo', articulo: 'Cap. III Bis' },
  { id: 'perfil', numero: '03', titulo: 'Perfil transaccional', articulo: 'Art. 23 Ter 1 y 2' },
  { id: 'aprobacion', numero: '04', titulo: 'Aprobación para operar', articulo: 'Art. 23 Ter 5' },
  { id: 'pep', numero: '05', titulo: 'Declaración PEP', articulo: 'Art. 23 Quáter' },
  {
    id: 'cuestionario',
    numero: '06',
    titulo: 'Cuestionario de identificación',
    articulo: 'Art. 23 Ter 3',
  },
  { id: 'reforzadas', numero: '07', titulo: 'Medidas reforzadas', articulo: 'Art. 23 Ter 4' },
] as const

export interface CuestionarioParaRiel {
  readonly exigencia:
    | { readonly estado: 'exigible'; readonly conGradoVencido: boolean }
    | { readonly estado: 'no_exigible'; readonly porque: string }
    | { readonly estado: 'indeterminable'; readonly falta: string }
  readonly cobertura:
    | { readonly estado: 'sin_cuestionario' }
    | { readonly estado: 'cubierto'; readonly cuestionario: { readonly fechaAplicacion: string } }
    | {
        readonly estado: 'sobre_otra_clasificacion'
        readonly cuestionario: { readonly fechaAplicacion: string }
      }
  readonly anticipado: boolean
  readonly exigibleDesde: string
}

/**
 * El cuestionario del Art. 23 Ter 3, en una palabra.
 *
 * `sobre_otra_clasificacion` sale ÁMBAR y no granate, y la palabra no dice
 * «vencido»: el artículo no da plazo de vigencia. Que haya una clasificación
 * más nueva es un hecho que alguien tiene que mirar, no un incumplimiento que
 * el sistema pueda declarar por su cuenta.
 */
export function rielCuestionario(c: CuestionarioParaRiel): EstadoDeRiel {
  if (c.exigencia.estado === 'no_exigible')
    return { estado: 'No requerido', tono: 'neutro', reloj: 'el grado no es alto' }
  if (c.exigencia.estado === 'indeterminable')
    return { estado: 'No se sabe', tono: 'aviso', reloj: 'sin Grado de riesgo' }

  switch (c.cobertura.estado) {
    case 'sin_cuestionario':
      return {
        estado: 'Falta aplicarlo',
        // Antes del Transitorio Cuarto la obligación todavía no corre.
        tono: c.anticipado ? 'aviso' : 'critico',
        reloj: c.anticipado ? `exigible desde el ${c.exigibleDesde}` : 'el grado es alto',
      }
    case 'sobre_otra_clasificacion':
      return {
        estado: 'De otra clasificación',
        tono: 'aviso',
        reloj: `aplicado el ${c.cobertura.cuestionario.fechaAplicacion}`,
      }
    case 'cubierto':
      return {
        estado: 'Aplicado',
        tono: 'ok',
        reloj: `el ${c.cobertura.cuestionario.fechaAplicacion}`,
      }
  }
}

export interface MedidasParaRiel {
  readonly exigencia:
    | { readonly estado: 'exigible'; readonly fraccion: 'fisica' | 'moral' }
    | { readonly estado: 'no_exigible'; readonly porque: string }
    | { readonly estado: 'indeterminable'; readonly falta: string }
    | { readonly estado: 'sin_fraccion'; readonly tipoPersona: string }
  readonly cobertura:
    | { readonly estado: 'sin_medidas' }
    | { readonly estado: 'cubierto'; readonly medidas: { readonly fechaAdopcion: string } }
    | {
        readonly estado: 'sobre_otra_clasificacion'
        readonly medidas: { readonly fechaAdopcion: string }
      }
  readonly anticipado: boolean
  readonly exigibleDesde: string
}

/**
 * Las medidas reforzadas del Art. 23 Ter 4, en una palabra.
 *
 * `sin_fraccion` es el estado más delicado y por eso tiene su propia palabra:
 * el cliente ES de grado alto —así que algo hay que hacer— pero el artículo no
 * nombra su clase de persona. Ni verde ni rojo: ámbar, porque es justo lo que
 * alguien tiene que mirar y decidir.
 */
export function rielMedidasReforzadas(m: MedidasParaRiel): EstadoDeRiel {
  if (m.exigencia.estado === 'no_exigible')
    return { estado: 'No requeridas', tono: 'neutro', reloj: 'el grado no es alto' }
  if (m.exigencia.estado === 'indeterminable')
    return { estado: 'No se sabe', tono: 'aviso', reloj: 'sin Grado de riesgo' }
  if (m.exigencia.estado === 'sin_fraccion')
    return {
      estado: 'Sin fracción',
      tono: 'aviso',
      reloj: `el artículo no nombra a ${m.exigencia.tipoPersona}`,
    }

  const fr = m.exigencia.fraccion === 'fisica' ? 'fr. I' : 'fr. II'
  switch (m.cobertura.estado) {
    case 'sin_medidas':
      return {
        estado: 'Faltan',
        tono: m.anticipado ? 'aviso' : 'critico',
        reloj: m.anticipado ? `exigible desde el ${m.exigibleDesde}` : `${fr} · el grado es alto`,
      }
    case 'sobre_otra_clasificacion':
      return {
        estado: 'De otra clasificación',
        tono: 'aviso',
        reloj: `adoptadas el ${m.cobertura.medidas.fechaAdopcion}`,
      }
    case 'cubierto':
      return {
        estado: 'Adoptadas',
        tono: 'ok',
        reloj: `${fr} · el ${m.cobertura.medidas.fechaAdopcion}`,
      }
  }
}
