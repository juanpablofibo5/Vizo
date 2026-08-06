import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db.js'
import { CatalogoIncompleto, cargarConfigActividad, umbralDe } from '../../src/catalogo/cargador.js'
import { mxn } from '../soporte/fixtures.js'

/**
 * El cargador de la Capa 0.
 *
 * Es la pieza que permite que el motor sea una función pura: toda la
 * conversación con la base ocurre aquí. Estos tests SÍ deben pasar en la
 * semana 2 — son el otro entregable, junto con la suite del motor en rojo.
 */
describe('Cargador del catálogo', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  describe('resuelve el umbral vigente según la fecha de la operación', () => {
    it('con UMA 2026: 8,025 × $117.31 = $941,412.75', async () => {
      const c = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      expect(umbralDe(c, 'aviso')?.enCentavos).toBe(mxn(941_412.75))
      expect(c.uma).toBe(11_731)
      expect(c.umaVigenteDesde).toBe('2026-02-01')
    })

    it('con UMA 2025: 8,025 × $113.14 = $907,948.50', async () => {
      const c = await cargarConfigActividad(db, 'V_BIS', '2026-01-15')
      expect(umbralDe(c, 'aviso')?.enCentavos).toBe(mxn(907_948.5))
      expect(c.uma).toBe(11_314)
    })

    it('la frontera del 1 de febrero cambia el umbral en un día', async () => {
      const enero = await cargarConfigActividad(db, 'V_BIS', '2026-01-31')
      const febrero = await cargarConfigActividad(db, 'V_BIS', '2026-02-01')

      expect(umbralDe(enero, 'aviso')?.enCentavos).toBe(mxn(907_948.5))
      expect(umbralDe(febrero, 'aviso')?.enCentavos).toBe(mxn(941_412.75))
      // $33,464.25 de diferencia entre dos días consecutivos: es lo que un
      // sistema con la UMA hardcodeada calcula mal todos los eneros.
      const diferencia =
        (umbralDe(febrero, 'aviso')?.enCentavos ?? 0) - (umbralDe(enero, 'aviso')?.enCentavos ?? 0)
      expect(diferencia).toBe(mxn(33_464.25))
    })
  })

  describe('la base de cálculo viene del catálogo', () => {
    it('identificación es "siempre" y no tiene monto', async () => {
      const c = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      const u = umbralDe(c, 'identificacion')
      expect(u?.siempre).toBe(true)
      expect(u?.enCentavos).toBeNull()
    })

    it('efectivo (Art. 32) se evalúa con IVA', async () => {
      const c = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      expect(umbralDe(c, 'efectivo')?.base).toBe('con_iva')
      expect(umbralDe(c, 'aviso')?.base).toBe('sin_iva')
    })
  })

  describe('parámetros del motor', () => {
    it('la ventana de acumulación y el % de proximidad son datos, no constantes', async () => {
      const c = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      expect(c.ventanaMeses).toBe(6)
      expect(c.proximidadPct).toBe(90)
    })

    it('registra la versión del catálogo para poder defender el cálculo después', async () => {
      const c = await cargarConfigActividad(db, 'V_BIS', '2026-02-15')
      expect(c.catalogoVersion).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('falla ruidosamente cuando falta catálogo', () => {
    // Un motor que asume un valor por defecto calcula mal en silencio, que es
    // lo peor que puede pasar en este dominio.
    it('sin UMA vigente para la fecha', async () => {
      await expect(cargarConfigActividad(db, 'V_BIS', '2024-06-01')).rejects.toThrow(
        CatalogoIncompleto,
      )
    })

    it('con una fracción que no está dada de alta', async () => {
      // La Fr. XV se carga en la semana 11, como prueba de que agregar una
      // fracción es solo INSERTs.
      await expect(cargarConfigActividad(db, 'XV', '2026-02-15')).rejects.toThrow(
        /no está dada de alta/,
      )
    })
  })
})
