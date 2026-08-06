import type { Centavos, UmaCentavos } from './dinero.js'

/**
 * Los tipos del motor de evaluación.
 *
 * PRINCIPIO (restricción no negociable #7): el motor es agnóstico de fracción.
 * Recibe una operación y una CONFIGURACIÓN; no consulta la base ni sabe qué es
 * la Fracción V Bis. Dar de alta la Fracción XV es cargar otra configuración
 * — la prueba de diseño X-01 de docs/PRUEBAS.md lo verifica en la semana 11.
 */

export type TipoUmbral = 'identificacion' | 'aviso' | 'efectivo'
export type BaseCalculo = 'sin_iva' | 'con_iva'
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
  readonly umbrales: readonly Umbral[]
  /** Ventana de acumulación en meses. Parámetro del catálogo, no constante. */
  readonly ventanaMeses: number
  /** % del umbral de aviso a partir del cual se alerta. Decisión de producto. */
  readonly proximidadPct: number
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
  /** Si la operación cae por sí sola en el supuesto de identificación. */
  readonly caeEnIdentificacion: boolean
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
  readonly requiereIdentificacion: boolean
  readonly resultadoAviso: ResultadoAviso
  readonly efectivoRestringido: boolean
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
    readonly catalogoVersion: string
    readonly ventanaMeses: number
    readonly proximidadPct: number
    readonly montoBaseConsiderado: Centavos
    readonly montoTotalConsiderado: Centavos
    readonly umbralesAplicados: readonly Umbral[]
  }
}
