import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db.js'
import { cargarConfigActividad } from '../../src/catalogo/cargador.js'
import { EntradaInvalida, evaluar } from '../../src/dominio/motor.js'
import { centavos } from '../../src/dominio/dinero.js'
import { CLIENTE_A, casoPara, entrada, mxn, operacion, previa } from '../soporte/fixtures.js'

/**
 * PRECONDICIONES DEL MOTOR.
 *
 * Los tres primeros casos se reprodujeron en la auditoría de la semana 3: el
 * motor obedecía en silencio entradas incoherentes. Quedan como pruebas
 * permanentes porque son la clase de error más cara del dominio — no producen
 * un crash, producen un aviso omitido.
 *
 * Una función pura que decide obligaciones regulatorias no puede confiar en su
 * entrada. Se detiene antes que calcular con datos que no cuadran.
 */
describe('Precondiciones del motor', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  it('rechaza una configuración que no corresponde a la fecha de la operación', async () => {
    // El caso real: cargar la config una vez y reutilizarla para operaciones
    // de meses distintos. Con la UMA de 2026 ($941,412.75) esta operación
    // sale "sin aviso"; con la de 2025 ($907,948.50), que es la que le toca,
    // es aviso obligatorio. Silencio = aviso omitido.
    const configFebrero = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')

    expect(() =>
      evaluar(entrada(operacion({ fecha: '2026-01-15', base: 910_000 })), configFebrero),
    ).toThrow(EntradaInvalida)

    expect(() =>
      evaluar(entrada(operacion({ fecha: '2026-01-15', base: 910_000 })), configFebrero),
    ).toThrow(/omite avisos/)
  })

  it('acepta cualquier fecha DENTRO de la vigencia de la configuración', async () => {
    // No es una validación de fecha exacta: la misma config sirve para todo el
    // periodo de esa UMA, que es lo que hace eficiente el batch mensual.
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    expect(() => evaluar(casoPara(config, { fecha: '2026-02-01', base: 100 }), config)).not.toThrow()
    expect(() => evaluar(casoPara(config, { fecha: '2026-12-31', base: 100 }), config)).not.toThrow()
  })

  it('rechaza una operación de otra actividad vulnerable', async () => {
    // Los umbrales y los acumulados nunca se cruzan entre fracciones (A-04).
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    expect(() =>
      evaluar(
        entrada(operacion({ fecha: '2026-02-15', base: 400_000, actividadId: 'otra-fraccion' })),
        config,
      ),
    ).toThrow(/no se cruzan entre fracciones/)
  })

  it('rechaza un monto total que no cuadra con sus componentes', async () => {
    // La base de datos lo garantiza con un CHECK, pero el motor también recibe
    // operaciones armadas en memoria: parser CFDI, importaciones, tests.
    // Un total falseado evalúa mal la restricción del Art. 32.
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
    const caso = casoPara(config, { fecha: '2026-02-15', base: 900_000, iva: 144_000, efectivo: true })
    const falseada = { ...caso.operacion, montoTotal: centavos(10_000_000) } // debería ser 1,044,000.00

    expect(() => evaluar({ ...caso, operacion: falseada }, config)).toThrow(/no cuadra/)
  })

  it('rechaza un historial con operaciones de otro cliente', async () => {
    // Sin esto, la acumulación de la semana 4 podría sumar los pagos de otra
    // persona y disparar un aviso falso sobre alguien que no lo debe.
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-05-15')
    const ajena = { ...previa('2026-03-15', 400_000), clienteId: 'otro-cliente' }

    expect(() =>
      evaluar(casoPara(config, { fecha: '2026-05-15', base: 400_000 }, [ajena]), config),
    ).toThrow(/de otro cliente/)
  })

  it('acepta un historial del mismo cliente', async () => {
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-05-15')
    const propia = { ...previa('2026-03-15', 400_000), clienteId: CLIENTE_A }

    expect(() =>
      evaluar(casoPara(config, { fecha: '2026-05-15', base: 400_000 }, [propia]), config),
    ).not.toThrow()
  })

  it('rechaza un historial con operaciones posteriores a la evaluada', async () => {
    // La ventana se cuenta hacia atrás. Una operación futura en el historial
    // es un error de quien consulta, no un caso a resolver.
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-05-15')

    expect(() =>
      evaluar(
        casoPara(config, { fecha: '2026-05-15', base: 400_000 }, [previa('2026-06-15', 400_000)]),
        config,
      ),
    ).toThrow(/posterior a la operación evaluada/)
  })
})

/**
 * Hallazgos de la auditoría de la semana 4.
 *
 * Los dos primeros eran defectos: producían un cálculo mal sin avisar. El
 * tercero es una ambigüedad del marco regulatorio, no un error — se prueba
 * para dejar el comportamiento elegido a la vista.
 */
describe('Acumulación: precondiciones y decisiones', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  it('rechaza que la operación evaluada venga en su propio historial', async () => {
    // Sin esto, olvidar `excluirOperacionId` al consultar cuenta el monto dos
    // veces y dispara un aviso por una suma que no existe.
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-05-15')
    const caso = casoPara(config, { fecha: '2026-05-15', base: 500_000 })
    const duplicada = { ...previa('2026-05-15', 500_000), id: caso.operacion.id }

    expect(() =>
      evaluar({ ...caso, historial: [duplicada] }, config),
    ).toThrow(/se contaría dos veces/)
  })

  it('con umbral "con_iva", exige el monto total de cada operación previa', async () => {
    // Escenario de POR CONFIRMAR-4: si la base del Art. 17 cambia a "con
    // impuestos", sumar solo la base de las previas omitiría parte de la
    // acumulación — en silencio, que es la peor forma.
    const base = await cargarConfigActividad(db, 'V_BIS', '2026-05-15')
    const configConIva = {
      ...base,
      umbrales: base.umbrales.map((u) =>
        u.tipo === 'aviso' ? { ...u, base: 'con_iva' as const } : u,
      ),
    }
    const caso = casoPara(configConIva, { fecha: '2026-05-15', base: 500_000, iva: 80_000 }, [
      previa('2026-03-15', 500_000), // sin montoTotal
    ])

    expect(() => evaluar(caso, configConIva)).toThrow(/no trae monto total/)
  })

  it('POR CONFIRMAR-8 · tras el primer aviso por acumulación, el pago siguiente vuelve a marcar', async () => {
    // No es un bug: el marco no dice qué pasa después del primer aviso. Se
    // eligió la conducta conservadora —seguir marcando— porque un aviso de más
    // se corrige y uno omitido se sanciona. Este test documenta la elección
    // para que un cambio de criterio sea deliberado y no accidental.
    const config = await cargarConfigActividad(db, 'V_BIS', '2026-06-15')
    const ev = evaluar(
      casoPara(config, { fecha: '2026-06-15', base: 400_000 }, [
        previa('2026-03-15', 400_000),
        previa('2026-04-15', 400_000),
        previa('2026-05-15', 400_000), // aquí ya se disparó un aviso
      ]),
      config,
    )

    expect(ev.resultadoAviso).toBe('acumulacion')
    expect(ev.sumaVentana).toBe(mxn(1_600_000))
  })
})
