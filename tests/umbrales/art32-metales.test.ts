import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db'
import { cargarConfigActividad, type EjecutorSql } from '../../src/catalogo/cargador'
import { evaluar } from '../../src/dominio/motor'
import type { ConfigActividad } from '../../src/dominio/tipos'
import { casoPara } from '../soporte/fixtures'

/**
 * El Art. 32 alcanza los Metales Preciosos, no solo el efectivo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ HUECO TAPAN ESTAS PRUEBAS
 * ────────────────────────────────────────────────────────────────────────────
 * El motor derivaba la restricción de `forma_pago = '01'` y nada más. El texto
 * de la Ley dice otra cosa:
 *
 *   «Queda prohibido […] liquidar o pagar […] mediante el uso de MONEDAS Y
 *    BILLETES, en moneda nacional o divisas Y METALES PRECIOSOS […]»
 *    (Art. 32 ¶1)
 *
 * y el Art. 3 fr. IX define «Metales Preciosos, al oro, la plata y el platino».
 *
 * O sea: un pago de dos millones en oro pasaba como operación normal, sin la
 * alerta granate que sí levantaba el mismo monto en billetes. El dato entraba
 * —el formulario captura `instrumento_monetario` y la fila lo guardaba— y el
 * motor no lo miraba.
 *
 * Ningún código de instrumento se escribe aquí como regla: los restringidos
 * salen del catálogo (`art32_instrumentos_restringidos`) y lo que estas
 * pruebas afirman es el COMPORTAMIENTO.
 */

const V_BIS = 'V_BIS'
const FECHA = '2026-03-15'
/** Por encima del umbral del Art. 32 para la fr. V Bis (8,025 UMA). */
const SOBRE_EL_UMBRAL = 1_000_000

describe('La restricción del Art. 32', () => {
  let db: Client

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  const config = (fecha: string): Promise<ConfigActividad> =>
    cargarConfigActividad(db, V_BIS, fecha)

  it('LOS CÓDIGOS RESTRINGIDOS SALEN DEL CATÁLOGO, con su fuente', async () => {
    const c = await config(FECHA)
    // Efectivo, oro o platino amonedados, plata amonedada, metales preciosos.
    expect(c.instrumentosRestringidos).toEqual(['1', '13', '14', '15'])
  })

  it('ORO: por encima del umbral, restringido — aunque la forma de pago diga otra cosa', async () => {
    const c = await config(FECHA)
    const ev = evaluar(
      casoPara(c, { fecha: FECHA, base: SOBRE_EL_UMBRAL, efectivo: false, instrumento: '13' }),
      c,
    )
    expect(ev.efectivoRestringido).toBe(true)
    expect(ev.instrumentoRestringido).toBe('13')
  })

  it('PLATA y METALES PRECIOSOS igual', async () => {
    const c = await config(FECHA)
    for (const codigo of ['14', '15']) {
      const ev = evaluar(
        casoPara(c, { fecha: FECHA, base: SOBRE_EL_UMBRAL, efectivo: false, instrumento: codigo }),
        c,
      )
      expect(ev.efectivoRestringido).toBe(true)
      expect(ev.instrumentoRestringido).toBe(codigo)
    }
  })

  it('una transferencia por el mismo monto NO está restringida', async () => {
    const c = await config(FECHA)
    const ev = evaluar(
      casoPara(c, { fecha: FECHA, base: SOBRE_EL_UMBRAL, efectivo: false, instrumento: '10' }),
      c,
    )
    expect(ev.efectivoRestringido).toBe(false)
    expect(ev.instrumentoRestringido).toBeNull()
  })

  it('el metal POR DEBAJO del umbral no está restringido: la prohibición tiene monto', async () => {
    const c = await config(FECHA)
    const ev = evaluar(
      casoPara(c, { fecha: FECHA, base: 100_000, efectivo: false, instrumento: '13' }),
      c,
    )
    expect(ev.efectivoRestringido).toBe(false)
  })

  it('BASTA UNA DE LAS DOS DECLARACIONES: efectivo sin instrumento sigue disparando', async () => {
    // Es lo que protege lo capturado antes de que el instrumento se usara, y a
    // quien solo llena la forma de pago. Ante una prohibición, detectar de más
    // y que lo mire un humano es el error barato.
    const c = await config(FECHA)
    const ev = evaluar(casoPara(c, { fecha: FECHA, base: SOBRE_EL_UMBRAL, efectivo: true }), c)
    expect(ev.efectivoRestringido).toBe(true)
    // `null`: la disparó la forma de pago, no un código de instrumento.
    expect(ev.instrumentoRestringido).toBeNull()
  })

  it('CON OTRA LISTA, cambia qué se restringe — la regla es dato, no código', async () => {
    const c = await config(FECHA)
    const soloEfectivo = { ...c, instrumentosRestringidos: ['1'] }
    const ev = evaluar(
      casoPara(soloEfectivo, {
        fecha: FECHA, base: SOBRE_EL_UMBRAL, efectivo: false, instrumento: '13',
      }),
      soloEfectivo,
    )
    expect(ev.efectivoRestringido).toBe(false)
  })

  it('sin la lista en el catálogo, el motor NO calcula media prohibición', async () => {
    // Es el hueco que esta migración vino a tapar: si la lista desaparece, la
    // carga se detiene en vez de volver al comportamiento viejo.
    //
    // Se prueba con un ejecutor que MIENTE sobre esa consulta, no borrando la
    // fila. La primera versión hacía `delete` dentro de una transacción, y eso
    // toca catálogo GLOBAL: `parametros_motor` tiene una exclusion constraint,
    // así que cualquier otro archivo de la suite que escriba ahí en paralelo se
    // queda esperando el rollback. Costó una falla intermitente —un `afterAll`
    // colgado en `tests/xsd/informe.test.ts`, que no tiene nada que ver con
    // esto— antes de encontrarla. Una prueba que envenena a las demás es peor
    // que una prueba faltante: la falla aparece lejos de su causa.
    const sinLaLista: EjecutorSql = {
      query: async (sql, parametros) =>
        sql.includes('art32_instrumentos_restringidos')
          ? { rows: [] }
          : db.query(sql, parametros),
    }
    await expect(cargarConfigActividad(sinLaLista, V_BIS, FECHA)).rejects.toThrow(/Art\. 32/)
  })
})
