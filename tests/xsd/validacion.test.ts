import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { conectar } from '../soporte/db'
import { formatoVigente, FormatoNoVigente } from '../../src/persistencia/formatos'
import {
  ValidadorNoDisponible,
  validarContraXsd,
} from '../../src/aviso/validacion'

const CORREGIDO = 'regulatorio/ejemplos/ejemplo_din.CORREGIDO.xml'
const ORIGINAL_DEL_SAT = 'regulatorio/ejemplos/ejemplo_din.xml'

/**
 * El arnés de validación, construido ANTES que el generador.
 *
 * Esta suite es el criterio de aceptación más duro del producto: un aviso que
 * no valida contra el XSD oficial no existe. Si estos tests pasan por
 * complacencia —porque el validador no está instalado, porque el XSD no se
 * pudo leer— entonces todo lo que venga después se construye sobre un verde
 * que no significa nada.
 *
 * Por eso la mitad de los casos no prueban que algo valide: prueban que el
 * arnés MUERDE.
 */
describe('Validación contra el XSD oficial del SPPLD', () => {
  let db: Client
  let actividadId: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id
  })

  afterAll(async () => {
    await db.end()
  })

  describe('el XSD sale del catálogo, no del código', () => {
    it('resuelve el formato vigente de la fracción V Bis', async () => {
      const f = await formatoVigente(db, { actividadId, fecha: '2026-08-10' })
      expect(f.rutaXsd).toBe('regulatorio/xsd/din.xsd')
      expect(f.version).toBe('din-sppld-2026-08')
    })

    it('antes de que el formato entrara en vigor, NO inventa uno', async () => {
      // Ni "el más reciente" ni uno por omisión: un aviso con el formato
      // equivocado es un aviso rechazado (regla dura 6).
      await expect(
        formatoVigente(db, { actividadId, fecha: '2020-01-01' }),
      ).rejects.toThrow(FormatoNoVigente)
    })
  })

  describe('el arnés muerde', () => {
    it('EL EJEMPLO OFICIAL DEL SAT NO VALIDA CONTRA SU PROPIO XSD', async () => {
      // El hallazgo que justifica todo lo demás. El XSD declara
      // `caracteristicas_desarrollo`; el ejemplo publicado trae
      // `caractersiticas_desarrollo`, con la `i` traspuesta.
      //
      // Quien construya su generador copiando el ejemplo —que es lo natural—
      // publica avisos que un validador estricto rechaza. Este test existe
      // para que ese hecho quede fijado y no se olvide.
      const f = await formatoVigente(db, { actividadId, fecha: '2026-08-10' })
      const r = validarContraXsd(readFileSync(ORIGINAL_DEL_SAT, 'utf8'), f.rutaXsd)

      expect(r.valida).toBe(false)
      expect(r.errores.join('\n')).toContain('caractersiticas_desarrollo')
    })

    it('un XML mal formado no valida, y lo dice', async () => {
      const f = await formatoVigente(db, { actividadId, fecha: '2026-08-10' })
      const r = validarContraXsd('<archivo><sin cerrar>', f.rutaXsd)
      expect(r.valida).toBe(false)
      expect(r.errores.length).toBeGreaterThan(0)
    })

    it('un XML bien formado del namespace equivocado tampoco pasa', async () => {
      const f = await formatoVigente(db, { actividadId, fecha: '2026-08-10' })
      const r = validarContraXsd(
        '<?xml version="1.0" encoding="UTF-8"?><archivo xmlns="http://ejemplo.invalido/otro"/>',
        f.rutaXsd,
      )
      expect(r.valida).toBe(false)
    })
  })

  describe('lo que NO se puede confundir con un aviso inválido', () => {
    it('si falta el validador, REVIENTA: nunca se salta en silencio', () => {
      // Un paso bloqueante que se omite solo cuando falta su herramienta es
      // peor que no tenerlo: además tranquiliza. En CI esto es la diferencia
      // entre un verde real y un verde decorativo.
      expect(() =>
        validarContraXsd('<a/>', 'regulatorio/xsd/din.xsd', {
          binario: 'xmllint-que-no-existe',
        }),
      ).toThrow(ValidadorNoDisponible)
    })

    it('un XSD ilegible NO se reporta como "el aviso no valida"', () => {
      // Mandaría a corregir la captura cuando lo roto es la ruta del catálogo,
      // y el aviso correcto se quedaría sin enviar buscando un error que no
      // existe.
      expect(() =>
        validarContraXsd(
          readFileSync(CORREGIDO, 'utf8'),
          'regulatorio/xsd/no_existe_este_esquema.xsd',
        ),
      ).toThrow(/no se pudo leer/)
    })
  })

  describe('el fixture bueno', () => {
    it('el ejemplo con el typo corregido valida limpio', async () => {
      const f = await formatoVigente(db, { actividadId, fecha: '2026-08-10' })
      const r = validarContraXsd(readFileSync(CORREGIDO, 'utf8'), f.rutaXsd)

      expect(r.errores).toEqual([])
      expect(r.valida).toBe(true)
    })
  })
})
