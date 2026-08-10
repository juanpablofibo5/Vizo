import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db'
import {
  ManifiestoInvalido,
  canonicalizar,
  construirManifiesto,
  hashDeManifiesto,
  type InsumosManifiesto,
  type ValorCanonico,
} from '../../src/dominio/manifiesto'

const INSUMOS: InsumosManifiesto = {
  expedienteId: '11111111-1111-4111-8111-111111111111',
  version: '1',
  clienteId: '22222222-2222-4222-8222-222222222222',
  actividad: 'V_BIS',
  estatus: 'aprobado',
  completitud: { estatus: 'completo', cubiertos: '13', totalObligatorios: '13' },
  documentos: [
    {
      campo: 'identificacion_oficial',
      hashSha256: 'a'.repeat(64),
      tamanoBytes: '20480',
      mime: 'application/pdf',
      registradoEn: '2026-08-01T10:00:00.000Z',
    },
    {
      campo: 'acta_constitutiva',
      hashSha256: 'b'.repeat(64),
      tamanoBytes: '51200',
      mime: 'application/pdf',
      registradoEn: '2026-08-01T10:05:00.000Z',
    },
  ],
  operaciones: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      fechaOperacion: '2026-05-15',
      montoBase: '400000.00',
      montoTotal: '400000.00',
      formaPago: '03',
      resultadoAviso: 'acumulacion',
    },
  ],
  catalogoVersion: '2026-02-01',
  hashBitacoraCabeza: 'c'.repeat(64),
  generadoEn: '2026-08-09T12:00:00.000Z',
}

describe('Manifiesto del expediente', () => {
  describe('la forma canónica', () => {
    it('el orden en que se escriben las claves NO cambia el hash', () => {
      const a: ValorCanonico = { z: '1', a: '2', m: { y: '3', b: '4' } }
      const b: ValorCanonico = { m: { b: '4', y: '3' }, a: '2', z: '1' }
      expect(canonicalizar(a)).toBe(canonicalizar(b))
      expect(hashDeManifiesto(a)).toBe(hashDeManifiesto(b))
    })

    it('el orden de un ARREGLO sí cambia el hash: ahí el orden es información', () => {
      expect(hashDeManifiesto(['a', 'b'])).not.toBe(hashDeManifiesto(['b', 'a']))
    })

    it('no admite números: son lo que rompe la reproducibilidad', () => {
      expect(() => canonicalizar({ monto: 400000 } as unknown as ValorCanonico)).toThrow(
        ManifiestoInvalido,
      )
    })

    it('no mete espacios ni saltos de línea', () => {
      expect(canonicalizar({ a: '1', b: ['x'] })).toBe('{"a":"1","b":["x"]}')
    })

    it('escapa lo que tiene que escapar', () => {
      // Una comilla o un acento mal serializados cambian el hash entre
      // implementaciones. JSON.stringify da la forma estándar.
      expect(canonicalizar({ 'a"b': 'ñ\n' })).toBe('{"a\\"b":"ñ\\n"}')
    })
  })

  describe('el contenido', () => {
    it('un expediente sin documentos ni operaciones no acredita nada', () => {
      expect(() =>
        construirManifiesto({ ...INSUMOS, documentos: [], operaciones: [] }),
      ).toThrow(/no acredita nada/)
    })

    it('cambiar el hash de UN documento cambia el del manifiesto', () => {
      const original = hashDeManifiesto(construirManifiesto(INSUMOS))
      const alterado = hashDeManifiesto(
        construirManifiesto({
          ...INSUMOS,
          documentos: [
            { ...INSUMOS.documentos[0]!, hashSha256: 'a'.repeat(63) + 'f' },
            INSUMOS.documentos[1]!,
          ],
        }),
      )
      expect(alterado).not.toBe(original)
    })

    it('REGLA 3: no lleva nombre, RFC ni CURP de nadie', () => {
      // El manifiesto puede terminar en manos de un tercero que lo selle.
      const texto = canonicalizar(construirManifiesto(INSUMOS))
      for (const campo of ['nombre', 'rfc', 'curp', 'razon_social', 'domicilio']) {
        expect(texto).not.toContain(campo)
      }
    })
  })

  /**
   * LA PRUEBA QUE JUSTIFICA TODO LO DEMÁS.
   *
   * Postgres `jsonb` no conserva el orden de las claves: las reordena por
   * longitud y luego por bytes. Un manifiesto hasheado con `JSON.stringify` y
   * guardado en jsonb verificaría al crearse y fallaría cada vez después,
   * porque al releerlo las claves vuelven en otro orden.
   *
   * Nadie lo notaría hasta el día en que haya que demostrar que un expediente
   * no cambió — que es el peor momento posible para descubrirlo.
   */
  describe('el hash sobrevive el viaje a la base', () => {
    let db: Client

    beforeAll(async () => {
      db = await conectar()
    })

    afterAll(async () => {
      await db.end()
    })

    it('jsonb REORDENA las claves: por eso no basta con JSON.stringify', async () => {
      const { rows } = await db.query(
        `select $1::jsonb::text as devuelto`,
        [JSON.stringify({ zzz: '1', a: '2', mm: '3' })],
      )
      const devuelto = (rows[0] as { devuelto: string }).devuelto
      // Postgres ordena por longitud de clave y luego por bytes: a, mm, zzz.
      expect(devuelto).toBe('{"a": "2", "mm": "3", "zzz": "1"}')
      // Que NO es el orden en que se escribió.
      expect(devuelto).not.toContain('{"zzz"')
    })

    it('el hash recomputado desde jsonb es idéntico al original', async () => {
      const manifiesto = construirManifiesto(INSUMOS)
      const hashOriginal = hashDeManifiesto(manifiesto)

      // Viaje completo: objeto -> jsonb -> objeto.
      const { rows } = await db.query(`select $1::jsonb as guardado`, [
        JSON.stringify(manifiesto),
      ])
      const releido = (rows[0] as { guardado: ValorCanonico }).guardado

      expect(hashDeManifiesto(releido)).toBe(hashOriginal)
    })

    it('y sigue siendo idéntico con anidamiento y acentos', async () => {
      const raro: ValorCanonico = {
        zzz: 'ñandú',
        a: { yy: 'á', b: ['1', '2'] },
        mm: null,
        t: true,
      }
      const { rows } = await db.query(`select $1::jsonb as g`, [JSON.stringify(raro)])
      expect(hashDeManifiesto((rows[0] as { g: ValorCanonico }).g)).toBe(hashDeManifiesto(raro))
    })
  })
})
