import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { conectar } from '../soporte/db'
import { formatoVigente } from '../../src/persistencia/formatos'
import { validarContraXsd } from '../../src/aviso/validacion'
import {
  construirInformeXml,
  InformeIncompleto,
  normalizarTextoDelAviso,
  PATRON_REFERENCIA,
  referenciaAviso,
  type Informe,
  type OperacionDelAviso,
} from '../../src/aviso/informe'
import { escaparTexto, XmlInvalido, serializarDocumento, texto } from '../../src/aviso/xml'

const operacion = (): OperacionDelAviso => ({
  tipoOperacion: '1601',
  desarrollo: {
    objetoAvisoAnterior: 'NO',
    modificacion: 'NO',
    entidadFederativa: '31',
    registroLicencia: 'LIC-2026-0001',
    codigoPostal: '97000',
    colonia: 'CENTRO',
    calle: 'CALLE 60 NUM 123',
    tipoDesarrollo: '5',
    montoDesarrollo: '941412.75',
    unidadesComercializadas: '1.00',
    costoUnidad: '941412.75',
    otrasEmpresas: 'NO',
  },
  aportacion: {
    fechaAportacion: '20260515',
    instrumentoMonetario: '1',
    moneda: '1',
    montoAportacion: '941412.75',
    aportacionFideicomiso: 'NO',
    nombreInstitucion: 'BANCO EJEMPLO',
  },
})

const informeBase = (avisos: Informe['avisos']): Informe => ({
  mesReportado: '202605',
  claveSujetoObligado: 'ABC890505DF4',
  claveActividad: 'DIN',
  avisos,
})

/**
 * El criterio de aceptación más duro del producto: el XML que genera VIZO
 * valida contra el XSD oficial descargado del SPPLD.
 *
 * Todo lo demás del pipeline puede estar bien y ser inútil si esto falla — el
 * portal rechaza el archivo y la obligación queda incumplida con su plazo
 * corriendo.
 */
describe('El XML del informe valida contra el XSD oficial', () => {
  let db: Client
  let rutaXsd: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    const f = await formatoVigente(db, {
      actividadId: (rows[0] as { id: string }).id,
      fecha: '2026-08-10',
    })
    rutaXsd = f.rutaXsd
  })

  afterAll(async () => {
    await db.end()
  })

  const validar = (xml: string) => validarContraXsd(xml, rutaXsd)

  it('un informe con una operación valida', () => {
    const xml = construirInformeXml(
      informeBase([
        { referencia: referenciaAviso('202605', 1), prioridad: '1', tipoAlerta: '100', operaciones: [operacion()] },
      ]),
    )
    const r = validar(xml)
    expect(r.errores).toEqual([])
    expect(r.valida).toBe(true)
  })

  it('el INFORME EN CERO es el mismo formato con cero avisos, no otro', () => {
    // El XSD declara `aviso` con minOccurs="0". No hay un segundo formato que
    // mantener ni que versionar: es esta misma función sin avisos.
    const xml = construirInformeXml(informeBase([]))
    expect(xml).not.toContain('<aviso>')

    const r = validar(xml)
    expect(r.errores).toEqual([])
    expect(r.valida).toBe(true)
  })

  it('varias operaciones en un aviso validan, y varios avisos también', () => {
    // Las DOS lecturas del Art. 24 Bis 1 producen XML válido: el esquema no
    // desempata cuál es la correcta. Por eso la granularidad es configuración
    // y no estructura — ver issue #10.
    const consolidado = construirInformeXml(
      informeBase([
        {
          referencia: referenciaAviso('202605', 1),
          prioridad: '1',
          tipoAlerta: '100',
          operaciones: [operacion(), operacion()],
        },
      ]),
    )
    const separados = construirInformeXml(
      informeBase([
        { referencia: referenciaAviso('202605', 1), prioridad: '1', tipoAlerta: '100', operaciones: [operacion()] },
        { referencia: referenciaAviso('202605', 2), prioridad: '1', tipoAlerta: '100', operaciones: [operacion()] },
      ]),
    )

    expect(validar(consolidado).valida).toBe(true)
    expect(validar(separados).valida).toBe(true)
  })

  it('el elemento opcional se OMITE cuando no hay dato, no va vacío', () => {
    const conDescripcion = construirInformeXml(
      informeBase([
        {
          referencia: referenciaAviso('202605', 1),
          prioridad: '1',
          tipoAlerta: '100',
          operaciones: [
            {
              ...operacion(),
              desarrollo: { ...operacion().desarrollo, descripcionDesarrollo: 'TORRE A' },
            },
          ],
        },
      ]),
    )
    expect(conDescripcion).toContain('<descripcion_desarrollo>TORRE A</descripcion_desarrollo>')
    expect(validar(conDescripcion).valida).toBe(true)

    const sinDescripcion = construirInformeXml(
      informeBase([
        { referencia: referenciaAviso('202605', 1), prioridad: '1', tipoAlerta: '100', operaciones: [operacion()] },
      ]),
    )
    expect(sinDescripcion).not.toContain('descripcion_desarrollo')
  })

  it('un aviso SIN operaciones revienta, no se confunde con un informe en cero', () => {
    // Los dos casos se ven parecidos y significan cosas distintas: "no hubo
    // nada que reportar" y "se armó un aviso y se perdió su operación".
    expect(() =>
      construirInformeXml(
        informeBase([
          { referencia: referenciaAviso('202605', 1), prioridad: '1', tipoAlerta: '100', operaciones: [] },
        ]),
      ),
    ).toThrow(InformeIncompleto)
  })

  it('la referencia sale conforme por construcción', () => {
    // El XSD la restringe a [A-ZÑ0-9]{1,14}. Una referencia "legible" tipo
    // VIZO-2026-05-0001 parece razonable y falla por DOS motivos a la vez:
    // guiones y longitud. Es de lo que VIZO genera, así que sale bien de
    // fábrica en vez de rebotar en el validador.
    expect(referenciaAviso('202605', 1)).toBe('V2026050000001')
    expect(referenciaAviso('202605', 1)).toHaveLength(14)
    expect(PATRON_REFERENCIA.test(referenciaAviso('202612', 9_999_999))).toBe(true)
  })

  it('una referencia que no cumple el patrón NO llega al validador', () => {
    expect(() =>
      construirInformeXml(
        informeBase([
          { referencia: 'VIZO-2026-05-0001', prioridad: '1', tipoAlerta: '100', operaciones: [operacion()] },
        ]),
      ),
    ).toThrow(/A-ZÑ0-9/)
  })

  it('el patrón del código sigue siendo el del XSD', () => {
    // Está duplicado a propósito —precondición accionable en vez de un error
    // crudo de libxml al final— y por eso hay que comprobar que no diverjan.
    // Mismo trato que los patrones de RFC y CURP de la semana 1.
    const xsd = readFileSync('regulatorio/xsd/din.xsd', 'utf8')
    const bloque = xsd.slice(xsd.indexOf('name="referencia_aviso_type"'))
    const patron = /<xsd:pattern value="([^"]+)"/.exec(bloque)?.[1]
    expect(patron).toBe('[A-ZÑ0-9]{1,14}')
    expect(PATRON_REFERENCIA.source).toBe(`^${patron}$`)
  })

  it('un mes_reportado con otra forma no llega al validador', () => {
    expect(() => construirInformeXml({ ...informeBase([]), mesReportado: '2026-05' })).toThrow(
      /AAAAMM/,
    )
  })
})

describe('Serialización XML', () => {
  it('escapa &, < y > — y el & primero, o se escaparía a sí mismo', () => {
    // El error clásico: si `&` fuera después de `<`, `a<b` daría `a&amp;lt;b`.
    expect(escaparTexto('CONSTRUCTORA A & B <SA> "X"')).toBe(
      'CONSTRUCTORA A &amp; B &lt;SA&gt; "X"',
    )
  })

  it('un texto con & produce XML bien formado', () => {
    const xml = serializarDocumento(texto('a', 'PÉREZ & HIJOS'))
    expect(xml).toContain('PÉREZ &amp; HIJOS')
  })

  it('un número NO pasa: los montos viajan como texto', () => {
    // Un numeric de Postgres que pasa por el number de JavaScript puede volver
    // distinto, y aquí eso es la cifra que se le reporta a la autoridad.
    expect(() =>
      serializarDocumento(texto('monto_aportacion', 941412.75 as unknown as string)),
    ).toThrow(XmlInvalido)
  })
})

/**
 * El texto libre y lo que el XSD admite.
 *
 * Hallazgo al verificar el guion de demo: los tipos de texto del esquema solo
 * aceptan MAYÚSCULAS SIN ACENTOS. Una dirección escrita como la escribiría
 * cualquiera producía un XML que no valida — y el obligado se enteraba semanas
 * después, al generar el aviso.
 */
describe('Normalización del texto libre', () => {
  it('sube a mayúsculas y quita acentos, pero CONSERVA la Ñ', () => {
    // La Ñ está en el patrón del XSD. Descomponerla la convertiría en N y
    // cambiaría nombres propios: "Peña" no es "Pena".
    expect(normalizarTextoDelAviso('Montes de Amé, Peña Ñandú')).toBe('MONTES DE AME, PEÑA ÑANDU')
  })

  it('un carácter que el esquema no admite se vuelve espacio, no revienta', () => {
    // La decisión menos mala: un aviso rechazado bloquea el cumplimiento; una
    // descripción con un símbolo raro vuelto espacio dice lo mismo.
    expect(normalizarTextoDelAviso('Torre A ✦ nivel 3')).toBe('TORRE A NIVEL 3')
  })

  it('el texto que una persona escribiría de verdad VALIDA', async () => {
    const conTextoNatural = construirInformeXml(
      informeBase([
        {
          referencia: referenciaAviso('202605', 1),
          prioridad: '1',
          tipoAlerta: '100',
          operaciones: [
            {
              ...operacion(),
              desarrollo: {
                ...operacion().desarrollo,
                colonia: 'Montes de Amé',
                calle: 'Calle 33 Diagonal núm. 240',
                descripcionDesarrollo: 'Condominio vertical de 48 unidades, preventa',
              },
            },
          ],
        },
      ]),
    )

    // Antes de normalizar, esto fallaba con un volcado de libxml sobre el
    // patrón del esquema.
    const r = validarContraXsd(conTextoNatural, 'regulatorio/xsd/din.xsd')
    expect(r.errores).toEqual([])
    expect(conTextoNatural).toContain('<colonia>MONTES DE AME</colonia>')
  })
})
