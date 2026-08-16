import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db'
import { cargarConfigActividad, umbralDe } from '../../src/catalogo/cargador'
import { evaluar } from '../../src/dominio/motor'
import { casoPara } from '../soporte/fixtures'

const FECHA = '2026-05-15'

/**
 * El valor EXACTO del umbral.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ISSUE #17 — POR QUÉ FALTABA ESTE ARCHIVO
 * ────────────────────────────────────────────────────────────────────────────
 * La suite probaba «un centavo abajo» y «un centavo arriba», nunca el punto.
 * Y el punto es justo donde el Art. 17 deja de ser uniforme:
 *
 *   Fr. V Bis · aviso          «IGUAL O SUPERIOR al equivalente a ocho mil
 *                               veinticinco veces…»                      → >=
 *   Fr. XV    · identificación «por un valor mensual SUPERIOR al equivalente
 *                               a mil seiscientas cinco veces…»          → >
 *   Fr. XV    · aviso          «IGUAL O SUPERIOR…»                       → >=
 *
 * El motor comparaba con `>=` siempre, así que en exactamente 1,605 UMA de
 * renta mensual pedía identificación y la Ley no. Un peso menos y coinciden; un
 * peso más y coinciden. Solo difieren en el valor exacto — que es el único
 * lugar donde una frontera se puede equivocar.
 *
 * NINGÚN número está escrito aquí: el umbral se lee del catálogo y el caso se
 * construye con ESE valor. Si mañana cambia la UMA o el umbral, estas pruebas
 * siguen valiendo, porque lo que afirman es el comportamiento en la frontera,
 * no una cifra.
 */
describe('La frontera exacta del umbral', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  /** El umbral del catálogo, en pesos, para construir el caso justo encima. */
  const enPesos = async (fraccion: string, tipo: 'identificacion' | 'aviso'): Promise<number> => {
    const config = await cargarConfigActividad(db, fraccion, FECHA)
    const u = umbralDe(config, tipo)
    if (u?.enCentavos === undefined || u.enCentavos === null) {
      throw new Error(`El umbral ${tipo} de ${fraccion} no tiene monto en el catálogo.`)
    }
    // De centavos a pesos: el fixture recibe pesos y el catálogo guarda
    // centavos. Dividir aquí y no en el fixture mantiene la aritmética visible.
    return u.enCentavos / 100
  }

  describe('Fr. V Bis · aviso — la Ley dice «igual o superior»', () => {
    it('EN el umbral exacto, requiere aviso', async () => {
      const config = await cargarConfigActividad(db, 'V_BIS', FECHA)
      const exacto = await enPesos('V_BIS', 'aviso')

      const r = evaluar(casoPara(config, { fecha: FECHA, base: exacto }), config)
      expect(r.resultadoAviso).toBe('individual')
    })

    it('un centavo abajo, no', async () => {
      const config = await cargarConfigActividad(db, 'V_BIS', FECHA)
      const exacto = await enPesos('V_BIS', 'aviso')

      const r = evaluar(casoPara(config, { fecha: FECHA, base: exacto - 0.01 }), config)
      expect(r.resultadoAviso).toBe('no')
    })
  })

  describe('Fr. XV · identificación — la Ley dice «SUPERIOR a»', () => {
    it('EN el umbral exacto, NO requiere identificación', async () => {
      // El caso que el motor respondía al revés. Con `>=` decía que sí.
      const config = await cargarConfigActividad(db, 'XV', FECHA)
      const exacto = await enPesos('XV', 'identificacion')

      const r = evaluar(casoPara(config, { fecha: FECHA, base: exacto }), config)
      expect(r.requiereIdentificacion).toBe(false)
    })

    it('un centavo arriba, sí', async () => {
      // El control: la frontera se mueve un centavo, no desaparece.
      const config = await cargarConfigActividad(db, 'XV', FECHA)
      const exacto = await enPesos('XV', 'identificacion')

      const r = evaluar(casoPara(config, { fecha: FECHA, base: exacto + 0.01 }), config)
      expect(r.requiereIdentificacion).toBe(true)
    })
  })

  describe('Fr. XV · aviso — la Ley vuelve a decir «igual o superior»', () => {
    it('EN el umbral exacto, requiere aviso', async () => {
      // Dos umbrales de la MISMA fracción con reglas distintas. Si el motor
      // tuviera un `if` por fracción en vez de leer el dato, este caso y el de
      // arriba no podrían coexistir.
      const config = await cargarConfigActividad(db, 'XV', FECHA)
      const exacto = await enPesos('XV', 'aviso')

      const r = evaluar(casoPara(config, { fecha: FECHA, base: exacto }), config)
      expect(r.resultadoAviso).toBe('individual')
    })
  })

  it('la inclusividad es un DATO del catálogo, no una convención del motor', async () => {
    // Si esto dejara de ser cierto, las pruebas de arriba seguirían pasando por
    // casualidad —los valores coinciden hoy— y el siguiente umbral que se
    // sembrara heredaría la convención equivocada en silencio.
    const vbis = await cargarConfigActividad(db, 'V_BIS', FECHA)
    const xv = await cargarConfigActividad(db, 'XV', FECHA)

    expect(umbralDe(vbis, 'aviso')?.inclusivo).toBe(true)
    expect(umbralDe(xv, 'identificacion')?.inclusivo).toBe(false)
    expect(umbralDe(xv, 'aviso')?.inclusivo).toBe(true)
  })
})
