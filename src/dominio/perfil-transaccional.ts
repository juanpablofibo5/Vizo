/**
 * El Perfil transaccional y su desviación (Cap. III Ter del Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUIÉN PONE EL NÚMERO
 * ────────────────────────────────────────────────────────────────────────────
 * No VIZO, y tampoco el obligado: lo pone el CLIENTE. El Art. 23 Ter 1 ¶2 dice
 * que se considere «la información que proporcione cada uno de sus Clientes o
 * Usuarias en ese momento, relativa a los montos máximos mensuales de los
 * actos u operaciones que los propios Clientes o Usuarias estimen realizar»; y
 * el objeto de guardarlo, en el mismo párrafo, es «detectar inconsistencias
 * entre la información proporcionada por el Cliente o Usuaria y el monto de
 * los actos u operaciones que realice».
 *
 * Por eso este motor no interpreta nada: compara dos datos que ya existen. La
 * frontera del ADR-21 cae en otro lado que en el Grado de Riesgo —donde la
 * configuración vacía era del obligado—, y conviene no confundirlas.
 *
 * Lo que sí es criterio del obligado, y este archivo NO implementa, son «los
 * supuestos en que los actos u operaciones se aparten del Perfil
 * transaccional» del Art. 23 Ter fr. IV más allá de esa inconsistencia de
 * monto: tolerancias, patrones, criterios sobre origen y destino. No hay aquí
 * un margen del 10% ni nada parecido, porque un margen que nadie eligió es un
 * criterio de riesgo puesto por VIZO.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOS DECISIONES QUE HAY QUE PODER DEFENDER, Y NO SON OBVIAS
 * ────────────────────────────────────────────────────────────────────────────
 * 1. **«Mensual» se lee como MES DE CALENDARIO.** El ¶2 dice «montos máximos
 *    mensuales» sin más. Un cliente que estima «hasta 500 mil al mes» piensa
 *    en el mes del calendario, y es lo que puede verificar cuando se le
 *    pregunte. La alternativa —una ventana deslizante de 30 días— detectaría
 *    además el reparto a caballo entre dos meses, pero no sale del texto: la
 *    ventana deslizante de este proyecto tiene su propio fundamento (Art. 19
 *    de la Ley) y `docs/RIESGO-EBR.md` §3.1 pidió expresamente no fusionarlas.
 *    Queda como pregunta al especialista PLD; cambiarla sería cambiar esta
 *    función, no un dato.
 *
 * 2. **Se compara contra el monto TOTAL de la operación**, contribuciones
 *    incluidas. El Art. 6 del Reglamento resuelve la base de cálculo para el
 *    umbral del Art. 17 y para la restricción del Art. 32, y el Perfil
 *    transaccional no es ninguno de los dos: no hay regla que lo alcance. Se
 *    toma el total porque es lo que el cliente desembolsa y por tanto lo que
 *    estimó, y porque ante la duda detecta de más. También va a la lista del
 *    especialista.
 */

import { centavos, sumar, type Centavos } from './dinero'
import { partes, sumarMeses, type FechaISO } from './fechas'

export type OrigenPerfil = 'inicial' | 'reevaluacion' | 'correccion' | 'acto_unico'

export interface PerfilVigente {
  readonly perfilId: string
  readonly origen: OrigenPerfil
  /** Lo declarado por el cliente (Art. 23 Ter 1 ¶2). */
  readonly montoMaximoMensual: Centavos
  /**
   * El «número» del Art. 23 Ter 1 fr. II. `null` cuando el obligado no lo
   * recabó: entonces no se compara. Un tope por omisión sería inventarle al
   * cliente una declaración que no hizo.
   */
  readonly operacionesMaximasMensuales: number | null
  /** La fecha del «acto u operación de que se trate» (¶2). Hace correr el reloj. */
  readonly fechaAncla: FechaISO
  /** Desde cuándo debe reevaluarse. */
  readonly vence: FechaISO
}

export interface OperacionDelMes {
  readonly id: string
  readonly fecha: FechaISO
  /** El total del acto. Ver la decisión 2 del encabezado. */
  readonly monto: Centavos
}

export type Desviacion =
  | {
      readonly por: 'monto_mensual'
      readonly declarado: Centavos
      readonly acumuladoDelMes: Centavos
      readonly excedente: Centavos
    }
  | {
      readonly por: 'numero_mensual'
      readonly declarado: number
      readonly operacionesDelMes: number
    }
  | {
      /**
       * El ¶4 supone «un solo acto u operación y en ese momento se extinga la
       * relación». Si el cliente vuelve a operar, la premisa se rompió: el
       * perfil de acto único ya no describe la relación que existe.
       */
      readonly por: 'acto_unico_roto'
      readonly operacionesDelMes: number
    }

export type ResultadoPerfil =
  /**
   * El hueco. No es un error ni un pase: el cliente operó sin que nadie
   * asentara lo que declaró, y el Art. 23 Ter 1 ¶2 pide justo eso. Quien lo
   * reciba tiene que mostrarlo, nunca sustituirlo por «dentro del perfil».
   */
  | { readonly estado: 'sin_perfil'; readonly mes: string }
  | {
      readonly estado: 'dentro_del_perfil'
      readonly perfilId: string
      readonly mes: string
      readonly acumuladoDelMes: Centavos
      readonly operacionesDelMes: number
    }
  | {
      readonly estado: 'desviado'
      readonly perfilId: string
      readonly mes: string
      readonly acumuladoDelMes: Centavos
      readonly operacionesDelMes: number
      readonly desviaciones: readonly Desviacion[]
    }

export class InsumoDePerfilIncoherente extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'InsumoDePerfilIncoherente'
  }
}

/** El mes de calendario de una fecha, como `YYYY-MM`. */
export function mesDe(fecha: FechaISO): string {
  const { anio, mes } = partes(fecha)
  return `${String(anio)}-${String(mes).padStart(2, '0')}`
}

/**
 * ¿La operación que se está registrando aparta al cliente de lo que declaró?
 *
 * `operacionesDelMes` debe traer **la operación evaluada incluida**. Se exige
 * así, y se verifica, por la lección más cara del motor de umbrales: cuando la
 * operación evaluada llegaba a veces dentro y a veces fuera de su propio
 * historial, la suma salía correcta unas veces y duplicada otras, y nada
 * reventaba. Aquí el contrato es uno solo y la función lo comprueba.
 */
export function contrastarConElPerfil(entrada: {
  readonly perfil: PerfilVigente | null
  readonly operacion: OperacionDelMes
  readonly operacionesDelMes: readonly OperacionDelMes[]
}): ResultadoPerfil {
  const { perfil, operacion, operacionesDelMes } = entrada
  const mes = mesDe(operacion.fecha)

  const ids = new Set(operacionesDelMes.map((o) => o.id))
  if (ids.size !== operacionesDelMes.length) {
    throw new InsumoDePerfilIncoherente(
      'Hay operaciones repetidas en el mes. Se contarían dos veces y el acumulado cruzaría el ' +
        'tope declarado sin que el cliente hubiera operado de más.',
    )
  }
  if (!ids.has(operacion.id)) {
    throw new InsumoDePerfilIncoherente(
      `La operación ${operacion.id} no viene en las operaciones del mes que se recibieron. O ` +
        'falta —y el acumulado sale de menos, que es una desviación no detectada—, o quien ' +
        'llama pensaba sumarla aparte, que la contaría dos veces.',
    )
  }
  for (const o of operacionesDelMes) {
    if (mesDe(o.fecha) !== mes) {
      throw new InsumoDePerfilIncoherente(
        `La operación ${o.id} es del mes ${mesDe(o.fecha)} y se está contrastando el mes ${mes}. ` +
          'Mezclar meses cambia el acumulado contra el que se compara lo declarado.',
      )
    }
  }

  if (perfil === null) {
    return { estado: 'sin_perfil', mes }
  }

  if (operacion.fecha < perfil.fechaAncla) {
    throw new InsumoDePerfilIncoherente(
      `La operación es del ${operacion.fecha} y el perfil vigente se ancló en el ` +
        `${perfil.fechaAncla}, que es posterior. Ese perfil no gobernaba cuando ocurrió el acto, ` +
        'y compararlos daría un veredicto que nadie puede sostener.',
    )
  }

  const acumuladoDelMes = sumar(...operacionesDelMes.map((o) => o.monto))
  const desviaciones: Desviacion[] = []

  if (acumuladoDelMes > perfil.montoMaximoMensual) {
    desviaciones.push({
      por: 'monto_mensual',
      declarado: perfil.montoMaximoMensual,
      acumuladoDelMes,
      excedente: centavos(acumuladoDelMes - perfil.montoMaximoMensual),
    })
  }

  if (
    perfil.operacionesMaximasMensuales !== null &&
    operacionesDelMes.length > perfil.operacionesMaximasMensuales
  ) {
    desviaciones.push({
      por: 'numero_mensual',
      declarado: perfil.operacionesMaximasMensuales,
      operacionesDelMes: operacionesDelMes.length,
    })
  }

  if (perfil.origen === 'acto_unico' && operacion.id !== primeraDelMes(operacionesDelMes).id) {
    desviaciones.push({ por: 'acto_unico_roto', operacionesDelMes: operacionesDelMes.length })
  }

  const comun = {
    perfilId: perfil.perfilId,
    mes,
    acumuladoDelMes,
    operacionesDelMes: operacionesDelMes.length,
  } as const

  return desviaciones.length === 0
    ? { estado: 'dentro_del_perfil', ...comun }
    : { estado: 'desviado', ...comun, desviaciones }
}

/**
 * La operación más antigua del mes, y ante empate la de id menor: hace falta
 * un criterio determinista para saber si la que se evalúa es «la única» de un
 * perfil de acto único, y `fecha` sola no lo es.
 */
function primeraDelMes(operaciones: readonly OperacionDelMes[]): OperacionDelMes {
  return [...operaciones].sort((a, b) =>
    a.fecha === b.fecha ? a.id.localeCompare(b.id) : a.fecha.localeCompare(b.fecha),
  )[0]!
}

export interface PlazosDelPerfil {
  /** Art. 23 Ter 1 ¶2 y ¶3 segunda oración. */
  readonly maduracionMeses: number
  /** Art. 23 Ter 1 ¶3 primera oración. */
  readonly cadenciaMeses: number
}

function exigirPlazo(valor: number, clave: string): void {
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new InsumoDePerfilIncoherente(
      `El plazo "${clave}" llegó como ${String(valor)}. Viene del catálogo regulatorio con su ` +
        'fuente; sin un entero de meses no se puede derivar cuándo vence un perfil, y ' +
        'suponer seis lo dejaría hardcodeado donde la reforma que lo cambie no lo alcanzaría.',
    )
  }
}

/**
 * Desde cuándo el cliente queda sujeto a la reevaluación del ¶3.
 *
 * Antes de esa fecha gobierna lo que declaró, y por eso el perfil no se puede
 * sustituir: es un piso, no una sugerencia.
 */
export function primerDiaReevaluable(fechaAncla: FechaISO, plazos: PlazosDelPerfil): FechaISO {
  exigirPlazo(plazos.maduracionMeses, 'perfil_maduracion_meses')
  return sumarMeses(fechaAncla, plazos.maduracionMeses)
}

/**
 * El vencimiento que le toca a un perfil según su origen.
 *
 * La misma aritmética que recalcula el trigger de la base. Que las dos existan
 * no es duplicación: la de aquí produce el valor y la de allá lo rechaza si no
 * cuadra, así que un cálculo que se desvíe no llega a guardarse.
 */
export function vencimientoDelPerfil(
  entrada:
    | { readonly origen: 'inicial' | 'acto_unico'; readonly fechaAncla: FechaISO }
    | { readonly origen: 'reevaluacion'; readonly vigenteDesde: FechaISO }
    | { readonly origen: 'correccion'; readonly venceDelCorregido: FechaISO },
  plazos: PlazosDelPerfil,
): FechaISO {
  switch (entrada.origen) {
    case 'inicial':
    case 'acto_unico':
      return primerDiaReevaluable(entrada.fechaAncla, plazos)
    case 'reevaluacion':
      exigirPlazo(plazos.cadenciaMeses, 'reevaluacion_perfil_meses')
      return sumarMeses(entrada.vigenteDesde, plazos.cadenciaMeses)
    case 'correccion':
      // Una corrección compra exactitud, nunca tiempo.
      return entrada.venceDelCorregido
  }
}

/** ¿Al cliente ya le toca el ejercicio periódico del Art. 23 Ter 1 ¶3? */
export function reevaluacionDebida(perfil: PerfilVigente, hoy: FechaISO): boolean {
  return hoy >= perfil.vence
}
