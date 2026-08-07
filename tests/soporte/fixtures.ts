import { centavos, pesos, type Centavos } from '../../src/dominio/dinero.js'
import type {
  Cliente,
  EntradaEvaluacion,
  Operacion,
  OperacionPrevia,
  ResolucionIdentidad,
} from '../../src/dominio/tipos.js'

/**
 * Constructores de casos para la suite del motor.
 *
 * El objetivo es que cada test de docs/PRUEBAS.md muestre SOLO lo que ese
 * caso pone a prueba: el monto, la fecha, la forma de pago. Todo lo demás son
 * defaults sin relevancia regulatoria.
 */

export const CLIENTE_A = 'cli-a'
export const CLIENTE_EXT = 'cli-ext'
export const SUCURSAL_NORTE = 'suc-norte'
export const SUCURSAL_CENTRO = 'suc-centro'

let contador = 0
function siguienteId(): string {
  contador += 1
  return `op-${contador}`
}

export interface OpcionesOperacion {
  /** Id real de la operación cuando el test la insertó en la base. */
  id?: string
  fecha: string
  /** Monto sin IVA ni accesorios: la base del Art. 17. */
  base: number
  iva?: number
  isai?: number
  accesorios?: number
  efectivo?: boolean
  clienteId?: string
  sucursalId?: string
  actividadId?: string
}

export function operacion(o: OpcionesOperacion): Operacion {
  const base = pesos(o.base)
  const iva = pesos(o.iva ?? 0)
  const isai = pesos(o.isai ?? 0)
  const accesorios = pesos(o.accesorios ?? 0)
  const total = centavos(base + iva + isai + accesorios)
  return {
    id: o.id ?? siguienteId(),
    clienteId: o.clienteId ?? CLIENTE_A,
    sucursalId: o.sucursalId ?? SUCURSAL_NORTE,
    actividadId: o.actividadId ?? 'act-v-bis',
    fechaOperacion: o.fecha,
    montoBase: base,
    iva,
    isai,
    otrosAccesorios: accesorios,
    montoTotal: total,
    // '03' = transferencia, '01' = efectivo (catálogo c_FormaPago del SAT)
    formaPago: o.efectivo ? '01' : '03',
    esEfectivo: o.efectivo ?? false,
  }
}

/**
 * Una operación del historial. `caeEnIdentificacion` es true por defecto
 * porque en Fr. V Bis la identificación es "siempre": TODAS las operaciones
 * entran a la suma de acumulación. Es lo que hace que la acumulación sea el
 * caso típico y no el borde.
 */
export function previa(fecha: string, base: number, caeEnIdentificacion = true): OperacionPrevia {
  return {
    id: siguienteId(),
    fechaOperacion: fecha,
    montoBase: pesos(base),
    caeEnIdentificacion,
  }
}

export function cliente(
  id: string = CLIENTE_A,
  resolucionIdentidad: ResolucionIdentidad = 'rfc',
): Cliente {
  return { id, resolucionIdentidad }
}

export function entrada(
  op: Operacion,
  historial: OperacionPrevia[] = [],
  cli: Cliente = cliente(op.clienteId),
): EntradaEvaluacion {
  return { operacion: op, cliente: cli, historial }
}

/**
 * Arma la entrada tomando la actividad de la configuración.
 *
 * El motor verifica que la operación pertenezca a la actividad de la config
 * (los umbrales nunca se cruzan entre fracciones). Este helper evita repetir
 * `actividadId: config.actividadId` en cada caso, y evita el error contrario:
 * un test que pasa porque el fixture inventó un id que nadie compara.
 */
export function casoPara(
  config: { actividadId: string },
  opciones: Omit<OpcionesOperacion, 'actividadId'>,
  historial: OperacionPrevia[] = [],
  cli?: Cliente,
): EntradaEvaluacion {
  const op = operacion({ ...opciones, actividadId: config.actividadId })
  return entrada(op, historial, cli ?? cliente(op.clienteId))
}

/** Para escribir expectativas legibles: `expect(x).toBe(mxn(941_412.75))`. */
export function mxn(valor: number): Centavos {
  return pesos(valor)
}
