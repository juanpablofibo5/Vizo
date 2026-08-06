import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, consultar, consultarUna } from '../soporte/db.js'

/**
 * La Capa 0 vista desde TypeScript.
 *
 * No prueba el motor (eso es la semana 2, en tests/umbrales). Prueba que el
 * catálogo regulatorio cargado por migración devuelve, desde código, los
 * mismos valores que publica el SAT — y que las consultas "as of" respetan
 * las vigencias.
 *
 * Sirve además como verificación de que el runner de tests está bien montado:
 * si esto corre, la semana 2 tiene dónde escribirse.
 */
describe('Capa 0 — catálogo regulatorio', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  describe('vigencias de la UMA', () => {
    // Los umbrales entran en vigor el 1 de FEBRERO, no el 1 de enero. Es el
    // error que un Excel comete y que aquí es un caso de prueba.
    it.each([
      ['2026-01-15', '113.14', 'enero de 2026 usa la UMA de 2025'],
      ['2026-01-31', '113.14', 'el 31 de enero todavía es UMA 2025'],
      ['2026-02-01', '117.31', 'el 1 de febrero ya es UMA 2026'],
      ['2026-02-15', '117.31', 'febrero de 2026 usa la UMA de 2026'],
    ])('%s → $%s (%s)', async (fecha, esperado) => {
      const fila = await consultarUna<{ uma: string }>(
        db,
        'select app.uma_vigente($1::date) as uma',
        [fecha],
      )
      expect(fila?.uma).toBe(esperado)
    })

    it('devuelve null antes de la primera vigencia cargada, para que el motor falle ruidosamente', async () => {
      const fila = await consultarUna<{ uma: string | null }>(
        db,
        'select app.uma_vigente($1::date) as uma',
        ['2024-06-01'],
      )
      expect(fila?.uma).toBeNull()
    })
  })

  describe('umbrales de la Fracción V Bis', () => {
    it('el umbral de aviso reproduce la tabla oficial del SPPLD: 8,025 UMA = $941,412.75', async () => {
      const fila = await consultarUna<{ valor_uma: string; pesos: string }>(
        db,
        `select u.valor_uma,
                round(u.valor_uma * app.uma_vigente($1::date), 2) as pesos
           from umbrales u
           join actividades_vulnerables a on a.id = u.actividad_id
          where a.fraccion = 'V_BIS' and u.tipo = 'aviso'
            and daterange(u.vigente_desde, u.vigente_hasta, '[]') @> $1::date`,
        ['2026-02-15'],
      )
      expect(fila?.valor_uma).toBe('8025.00')
      expect(fila?.pesos).toBe('941412.75')
    })

    it('la identificación es "siempre": expediente de cada aportante sin importar el monto', async () => {
      const fila = await consultarUna<{ siempre: boolean; valor_uma: string | null }>(
        db,
        `select u.siempre, u.valor_uma
           from umbrales u
           join actividades_vulnerables a on a.id = u.actividad_id
          where a.fraccion = 'V_BIS' and u.tipo = 'identificacion'`,
      )
      expect(fila?.siempre).toBe(true)
      expect(fila?.valor_uma).toBeNull()
    })

    it('la base de cálculo es un DATO por tipo de umbral, no un if en el motor', async () => {
      const filas = await consultar<{ tipo: string; base: string }>(
        db,
        `select u.tipo::text, u.base::text
           from umbrales u
           join actividades_vulnerables a on a.id = u.actividad_id
          where a.fraccion = 'V_BIS' order by u.tipo`,
      )
      const porTipo = Object.fromEntries(filas.map((f) => [f.tipo, f.base]))
      // Art. 32 (efectivo) se evalúa CON IVA; Art. 17 sin IVA es la postura
      // provisional — ver POR CONFIRMAR-4 en docs/DECISIONES.md.
      expect(porTipo['efectivo']).toBe('con_iva')
      expect(porTipo['aviso']).toBe('sin_iva')
      expect(porTipo['identificacion']).toBe('sin_iva')
    })
  })

  describe('parámetros del motor', () => {
    // Si alguno de estos valores apareciera como constante en el código,
    // la regla dura 1 estaría rota.
    it.each([
      ['ventana_acumulacion_meses', 6],
      ['dia_limite_presentacion', 17],
      ['umbral_proximidad_pct', 90],
      ['dia_alerta_presentacion', 10],
    ])('%s = %i y viene del catálogo', async (clave, esperado) => {
      const fila = await consultarUna<{ valor: number }>(
        db,
        'select app.parametro_vigente(null, $1, $2::date)::int as valor',
        [clave, '2026-02-15'],
      )
      expect(fila?.valor).toBe(esperado)
    })
  })

  describe('catálogos de valores del SAT', () => {
    it('el comprador en preventa tiene su código: tercero tipo 2', async () => {
      const fila = await consultarUna<{ descripcion: string }>(
        db,
        `select descripcion from app.catalogo_vigente('tipo_tercero', $1::date) where codigo = '2'`,
        ['2026-02-15'],
      )
      expect(fila?.descripcion).toContain('Preventa')
    })

    it('rechaza un código que no existe en el catálogo', async () => {
      const fila = await consultarUna<{ valido: boolean }>(
        db,
        `select app.codigo_valido('tipo_desarrollo', '7', $1::date) as valido`,
        ['2026-02-15'],
      )
      // El XSD aceptaría "7" porque solo valida \d{1,2}. El catálogo no.
      expect(fila?.valido).toBe(false)
    })
  })
})
