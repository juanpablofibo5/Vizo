import type { Centavos, UmaCentavos } from './dinero'

/**
 * Los tipos del motor de evaluación.
 *
 * PRINCIPIO (restricción no negociable #7): el motor es agnóstico de fracción.
 * Recibe una operación y una CONFIGURACIÓN; no consulta la base ni sabe qué es
 * la Fracción V Bis. Dar de alta la Fracción XV es cargar otra configuración
 * — la prueba de diseño X-01 de docs/PRUEBAS.md lo verifica en la semana 11.
 */

export type TipoUmbral = 'identificacion' | 'aviso' | 'efectivo'
export type BaseCalculo = 'sin_contribuciones' | 'con_contribuciones'
export type ResultadoAviso = 'no' | 'individual' | 'acumulacion'

/** Un umbral vigente, ya resuelto a pesos con la UMA de la fecha evaluada. */
export interface Umbral {
  readonly tipo: TipoUmbral
  /** `true` = la obligación existe sin importar el monto (identificación en V Bis). */
  readonly siempre: boolean
  /** Texto tal como viene del catálogo, para poder registrarlo sin perder precisión. */
  readonly valorUma: string | null
  /** El umbral convertido a centavos con la UMA vigente. `null` si `siempre`. */
  readonly enCentavos: Centavos | null
  /** Contra qué base se compara. Es un DATO del catálogo, no un `if` del motor. */
  readonly base: BaseCalculo
  /**
   * Si el umbral se alcanza CON su propio valor.
   *
   * `true` = «igual o superior» (>=), la fórmula habitual del Art. 17.
   * `false` = «superior a» (>), como la identificación de la Fr. XV.
   *
   * Sale del VERBO de la Ley, no de una convención del motor: el Art. 17 no
   * usa una sola fórmula, y suponer que sí desplaza la frontera un peso — que
   * es exactamente donde una frontera importa (issue #17).
   */
  readonly inclusivo: boolean
}

/**
 * Configuración de una actividad vulnerable, resuelta "as of" la fecha de la
 * operación. La arma el cargador (src/catalogo) leyendo la Capa 0.
 */
export interface ConfigActividad {
  readonly actividadId: string
  readonly fraccion: string
  /** UMA aplicable a la fecha de la operación, no "la actual". */
  readonly uma: UmaCentavos
  readonly umaVigenteDesde: string
  /** `null` = vigencia abierta. Se registra en cada evaluación. */
  readonly umaVigenteHasta: string | null
  readonly umbrales: readonly Umbral[]
  /** Ventana de acumulación en meses. Parámetro del catálogo, no constante. */
  readonly ventanaMeses: number
  /** % del umbral de aviso a partir del cual se alerta. Decisión de producto. */
  readonly proximidadPct: number
  /**
   * Códigos de `instrumento_monetario` cuyo uso prohíbe el Art. 32.
   *
   * Llegan del catálogo (`art32_instrumentos_restringidos`) con la cita del
   * Art. 32 ¶1 y de la definición del Art. 3 fr. IX que hace el mapeo. No se
   * escriben aquí: cuáles metales son «Metales Preciosos» lo dice la Ley.
   */
  readonly instrumentosRestringidos: readonly string[]
  /** Huella del catálogo con el que se evaluó. Sin esto no hay cómo defender el cálculo. */
  readonly catalogoVersion: string
}

/** Cómo quedó resuelta la identidad del cliente. Determina si se acumula. */
export type ResolucionIdentidad = 'rfc' | 'curp' | 'identidad_alterna'

export interface Cliente {
  readonly id: string
  readonly resolucionIdentidad: ResolucionIdentidad
}

/** Una operación ya registrada, para la ventana de acumulación. */
export interface OperacionPrevia {
  readonly id: string
  readonly fechaOperacion: string
  readonly montoBase: Centavos
  /**
   * Total con contribuciones y demás accesorios.
   *
   * Opcional porque el umbral de aviso del Art. 17 se evalúa SIN ellos —Art. 6
   * ¶1 del Reglamento, contrastado el 16-ago-2026— así que casi nunca hace
   * falta. Se conserva opcional y no se elimina: la ventana de acumulación
   * puede tener que compararse contra un umbral `con_contribuciones` si alguna
   * fracción futura lo pide, y entonces el historial ya trae el dato.
   */
  readonly montoTotal?: Centavos | undefined
  /** Si la operación cae por sí sola en el supuesto de identificación. */
  readonly caeEnIdentificacion: boolean
  /**
   * Opcional. Cuando viene, el motor verifica que el historial sea del mismo
   * cliente: acumular operaciones de otra persona dispararía un aviso falso.
   */
  readonly clienteId?: string | undefined
}

export interface Operacion {
  readonly id: string
  readonly clienteId: string
  readonly sucursalId: string
  readonly actividadId: string
  /** Fecha del acto. Determina qué UMA y qué umbrales aplican. */
  readonly fechaOperacion: string
  /** Sin IVA ni accesorios. */
  readonly montoBase: Centavos
  readonly iva: Centavos
  readonly isai: Centavos
  readonly otrosAccesorios: Centavos
  /** base + iva + isai + accesorios. */
  readonly montoTotal: Centavos
  readonly formaPago: string
  readonly esEfectivo: boolean
  /**
   * Código del catálogo `instrumento_monetario` del SPPLD, cuando se capturó.
   *
   * Existe además de `esEfectivo` porque son dos declaraciones distintas del
   * mismo pago y solo ésta puede decir «oro» — el Art. 32 prohíbe el efectivo
   * Y los Metales Preciosos, y `formaPago` no tiene cómo expresar los
   * segundos. `null` cuando no se capturó.
   */
  readonly instrumentoMonetario: string | null
}

/**
 * Entrada del motor: la operación, su cliente y el historial de la ventana.
 *
 * El historial lo aporta quien llama; el motor no consulta la base. Así se
 * puede probar cada caso de docs/PRUEBAS.md sin infraestructura.
 */
export interface EntradaEvaluacion {
  readonly operacion: Operacion
  readonly cliente: Cliente
  /**
   * Operaciones del MISMO cliente y MISMA actividad, anteriores a esta.
   * Nunca de otra fracción: los acumulados jamás se suman entre fracciones
   * (caso A-04).
   */
  readonly historial: readonly OperacionPrevia[]
}

/**
 * Salida del motor. Incluye los insumos además de los resultados: una
 * evaluación que no registra con qué UMA, qué umbrales y qué parámetros se
 * calculó no se puede defender tres años después.
 */
export interface Evaluacion {
  /**
   * A qué operación pertenece este resultado.
   *
   * Va DENTRO de la evaluación, no como parámetro suelto al guardarla: así no
   * existe la posibilidad de registrar el cálculo de una operación contra el
   * id de otra. La auditoría de la semana 4 demostró que con el id suelto se
   * podía guardar un registro que decía que una operación de $100,000 generó
   * aviso individual con un monto considerado de $950,000 — y eso vive en el
   * objeto que se defiende ante la autoridad.
   */
  readonly operacionId: string
  readonly requiereIdentificacion: boolean
  readonly resultadoAviso: ResultadoAviso
  readonly efectivoRestringido: boolean
  /**
   * Qué instrumento disparó la restricción del Art. 32.
   *
   * `null` cuando la disparó la forma de pago —efectivo— y no un código de
   * instrumento. El booleano de arriba conserva su nombre porque hay evidencia
   * histórica apuntándole; esto es lo que evita que sea un cajón único ahora
   * que también se prende con oro, plata y platino.
   */
  readonly instrumentoRestringido: string | null
  readonly alertaProximidad: boolean
  readonly requiereRevisionIdentidad: boolean
  /** Suma de la ventana incluyendo esta operación. `null` si no se evaluó acumulación. */
  readonly sumaVentana: Centavos | null
  /** Qué operaciones entraron a la ventana (sin incluir la evaluada). */
  readonly operacionesAcumuladas: readonly string[]
  readonly motivo: string
  readonly insumos: {
    readonly uma: UmaCentavos
    readonly umaVigenteDesde: string
    readonly umaVigenteHasta: string | null
    readonly catalogoVersion: string
    readonly ventanaMeses: number
    readonly proximidadPct: number
    readonly montoBaseConsiderado: Centavos
    readonly montoTotalConsiderado: Centavos
    readonly umbralesAplicados: readonly Umbral[]
  }
}
