import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db'
import { camposVigentes } from '../../src/persistencia/expediente'
import {
  calcularCompletitud,
  CatalogoDeExpedienteVacio,
  type CampoExpediente,
} from '../../src/dominio/expediente'

/**
 * El expediente de identificación de la Fracción VIII.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTOS CASOS DEFIENDEN
 * ────────────────────────────────────────────────────────────────────────────
 * La Fr. VIII entró al catálogo el 30-ago-2026 con sus tres umbrales y CERO
 * campos de expediente, así que ningún obligado de vehículos podía abrirle
 * expediente a nadie. La migración 20260830140000 lo siembra, y estos casos
 * fijan las decisiones que se tomaron leyendo el texto — porque son las que se
 * ven raras si alguien las compara contra la V Bis sin leer la fuente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE PARECE A LA V BIS
 * ────────────────────────────────────────────────────────────────────────────
 * La V Bis se sembró desde DOS fuentes: los Anexos de las RCG y el XSD del
 * aviso. El XSD exige RFC, actividad económica y domicilio para poder emitir
 * el archivo, y por eso allá son obligatorios.
 *
 * La Fr. VIII **no tiene XSD** (`clave_sppld` es NULL a propósito), así que la
 * única fuente es el texto — y el texto condiciona: «cuando cuente con ellas»,
 * «para los casos en que se establezca una Relación de Negocios», «cuando el
 * domicilio manifestado no coincida con el de la identificación». Marcar eso
 * como obligatorio dejaría expedientes legítimos incompletos para siempre.
 *
 * Un campo no obligatorio SIGUE SIENDO capturable y visible: `camposCapturables`
 * no filtra por `obligatorio`. Lo que no hace es bloquear la aprobación.
 */
describe('Fracción VIII · qué integra el expediente', () => {
  let db: Client
  let actividadId: string

  /** Hoy: rige el texto de las RCG 2013 consolidado con la reforma de 2014. */
  const HOY = '2026-08-30'
  /** Un día antes de que entre el Acuerdo 115/2026. */
  const VISPERA = '2026-11-29'
  /** El día en que entra, por el Transitorio Primero. */
  const REFORMA = '2026-11-30'

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'VIII'`,
    )
    actividadId = (rows[0] as { id: string }).id
  })

  afterAll(async () => {
    await db.end()
  })

  const campos = (tipo: 'fisica' | 'moral', fecha: string): Promise<CampoExpediente[]> =>
    camposVigentes(db, actividadId, tipo, fecha)

  const campo = async (
    tipo: 'fisica' | 'moral',
    fecha: string,
    clave: string,
  ): Promise<CampoExpediente | undefined> =>
    (await campos(tipo, fecha)).find((c) => c.campo === clave)

  describe('la puerta que estaba cerrada', () => {
    it('el catálogo ya no está vacío, así que el expediente se puede evaluar', async () => {
      // Este es el caso que motivó todo. Con la tabla vacía,
      // `calcularCompletitud` se negaba —correctamente— antes que decir
      // «completo» sobre un expediente que nadie había empezado a integrar.
      for (const tipo of ['fisica', 'moral'] as const) {
        const lista = await campos(tipo, HOY)
        expect(lista.length).toBeGreaterThan(0)
        expect(() => calcularCompletitud(lista, {}, new Map(), HOY)).not.toThrow(
          CatalogoDeExpedienteVacio,
        )
      }
    })

    it('un cliente sin nada capturado sale INCOMPLETO, no completo', async () => {
      const lista = await campos('moral', HOY)
      const r = calcularCompletitud(lista, {}, new Map(), HOY)
      expect(r.estatus).toBe('incompleto')
      expect(r.cubiertos).toBe(0)
      expect(r.totalObligatorios).toBe(8)
    })

    it('persona física pide 7 obligatorios; persona moral, 8', async () => {
      // Los números se cuentan a mano contra los Anexos 3 y 4 en la doble
      // revisión. Si cambian sin que cambie el texto, algo se sembró de más.
      expect(calcularCompletitud(await campos('fisica', HOY), {}, new Map(), HOY)
        .totalObligatorios).toBe(7)
      expect(calcularCompletitud(await campos('moral', HOY), {}, new Map(), HOY)
        .totalObligatorios).toBe(8)
    })
  })

  describe('lo que el texto condiciona no bloquea', () => {
    it('el RFC no es obligatorio: el Anexo dice «cuando cuente con ella»', async () => {
      // Anexo 3 a) ix) y Anexo 4 a) viii). Sin XSD que lo exija, esto es todo
      // lo que hay. La identidad del cliente NO depende de este catálogo: la
      // resuelve el CHECK `cliente_identificable` (RFC, CURP o alterna).
      expect((await campo('moral', HOY, 'rfc'))?.obligatorio).toBe(false)
      expect((await campo('fisica', HOY, 'curp'))?.obligatorio).toBe(false)
    })

    it('la actividad y el giro solo se piden con Relación de negocios', async () => {
      // Anexo 3 a) v) y Anexo 4 a) iv), y el Art. 18 fr. II de la Ley. Una
      // venta única de vehículo es el acto ocasional que el Art. 3 fr. XIV
      // excluye de la definición de Relación de negocios.
      expect((await campo('fisica', HOY, 'actividad_economica'))?.obligatorio).toBe(false)
      expect((await campo('moral', HOY, 'giro_mercantil'))?.obligatorio).toBe(false)
    })

    it('pero siguen siendo campos del expediente, no desaparecen', async () => {
      // No obligatorio ≠ inexistente. La pantalla los pinta y se pueden
      // capturar; lo único que no hacen es impedir la aprobación.
      const claves = (await campos('fisica', HOY)).map((c) => c.campo)
      expect(claves).toContain('rfc')
      expect(claves).toContain('actividad_economica')
      expect(claves).toContain('carta_poder_apoderado')
    })
  })

  describe('el comprobante de domicilio: la diferencia es del texto', () => {
    it('en persona moral se pide siempre; en persona física, solo condicionado', async () => {
      // Anexo 4 b) iii) lo pide sin condición. Anexo 3 b) iii) lo pide «cuando
      // el domicilio manifestado […] no coincida con el de la identificación o
      // ésta no lo contenga». Son dos filas porque son dos reglas.
      expect((await campo('moral', HOY, 'comprobante_domicilio'))?.obligatorio).toBe(true)
      expect((await campo('fisica', HOY, 'comprobante_domicilio'))?.obligatorio).toBe(false)
    })

    it('NO trae la regla de tres meses, y eso es deliberado', async () => {
      // El Art. 21 la enuncia «conforme a los Anexos de estas reglas que así lo
      // solicitan», y los Anexos cuelgan el límite del «recibo de pago por
      // servicios domiciliados o estados de cuenta bancarios» — NO del
      // «contrato de arrendamiento vigente» ni de la «Constancia de inscripción
      // en el RFC», que el mismo numeral acepta sin límite.
      //
      // `documentos` no registra cuál de los tres se subió. Poner el límite
      // marcaría «vencido» un comprobante válido, y un rechazo falso se ve como
      // si el sistema tuviera razón.
      for (const fecha of [HOY, REFORMA]) {
        expect(
          (await campo('moral', fecha, 'comprobante_domicilio'))?.antiguedadMaximaMeses,
        ).toBeUndefined()
      }
    })
  })

  describe('la frontera del 30 de noviembre de 2026', () => {
    it('cada campo tiene UNA sola fila vigente a cada lado', async () => {
      // Dos filas vigentes del mismo campo harían que la completitud dependiera
      // del orden en que salieran de la consulta.
      for (const tipo of ['fisica', 'moral'] as const) {
        for (const fecha of [VISPERA, REFORMA]) {
          const claves = (await campos(tipo, fecha)).map((c) => c.campo)
          expect(new Set(claves).size).toBe(claves.length)
        }
      }
    })

    it('la constancia del BC de persona física cambia de fuente, no de exigencia', async () => {
      // Anexo 3 b) iv) reformado: «Beneficiario Controlador» en vez de «Dueño
      // Beneficiario», y admite Firma Electrónica además de la autógrafa.
      for (const fecha of [VISPERA, REFORMA]) {
        expect((await campo('fisica', fecha, 'constancia_conocimiento_bc'))?.obligatorio).toBe(
          true,
        )
      }
    })

    it('en persona moral la constancia se sustituye — y el expediente NO se afloja', async () => {
      // Anexo 4 b) v) deja de pedir una constancia firmada y pasa a exigir
      // IDENTIFICAR al Beneficiario Controlador (Art. 12 fr. VII ¶2, «en todos
      // los casos»). Es más estricto. Cerrar la vigencia vieja sin abrir la
      // nueva habría hecho el expediente MÁS FÁCIL justo el día en que la regla
      // se endurece — y eso no lanza ninguna excepción: se ve como expedientes
      // que de pronto están completos.
      expect((await campo('moral', VISPERA, 'declaracion_beneficiario'))?.obligatorio).toBe(true)
      expect(await campo('moral', REFORMA, 'declaracion_beneficiario')).toBeUndefined()

      expect(await campo('moral', VISPERA, 'identificacion_beneficiario_controlador'))
        .toBeUndefined()
      expect(
        (await campo('moral', REFORMA, 'identificacion_beneficiario_controlador'))?.obligatorio,
      ).toBe(true)

      const antes = calcularCompletitud(await campos('moral', VISPERA), {}, new Map(), VISPERA)
      const despues = calcularCompletitud(await campos('moral', REFORMA), {}, new Map(), REFORMA)
      expect(despues.totalObligatorios).toBeGreaterThanOrEqual(antes.totalObligatorios)
    })
  })

  describe('regla dura 1: ninguna fila sin fuente', () => {
    it('las 26 filas de la Fr. VIII citan artículo y anexo', async () => {
      // Las 17 originales de la V Bis nacieron sin `fuente` —la columna llegó
      // después— y por eso es nullable. Ninguna de la Fr. VIII puede repetirlo:
      // una fila que nadie puede defender es una fila que no debería exigir.
      const { rows } = await db.query(
        `select ce.campo, ce.fuente
           from campos_expediente ce
          where ce.actividad_id = $1`,
        [actividadId],
      )
      expect(rows).toHaveLength(26)
      for (const r of rows as Array<{ campo: string; fuente: string | null }>) {
        expect(r.fuente, `${r.campo} sin fuente`).toBeTruthy()
        expect(r.fuente, `${r.campo} no cita un Anexo`).toMatch(/Anexo \d/)
      }
    })
  })
})
