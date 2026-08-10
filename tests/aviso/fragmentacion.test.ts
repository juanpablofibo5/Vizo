import { describe, expect, it } from 'vitest'
import {
  AvisoDemasiadoGrande,
  fragmentarInforme,
  LIMITE_BYTES,
} from '../../src/aviso/fragmentacion'
import { construirInformeXml, referenciaAviso, type AvisoDelInforme, type Informe } from '../../src/aviso/informe'

const operacion = (descripcion?: string) => ({
  tipoOperacion: '1601',
  desarrollo: {
    objetoAvisoAnterior: 'NO' as const,
    modificacion: 'NO' as const,
    entidadFederativa: '31',
    registroLicencia: 'LIC20260001',
    codigoPostal: '97000',
    colonia: 'CENTRO',
    calle: 'CALLE 60 NUM 123',
    tipoDesarrollo: '5',
    ...(descripcion === undefined ? {} : { descripcionDesarrollo: descripcion }),
    montoDesarrollo: '50000000.00',
    unidadesComercializadas: '120.00',
    costoUnidad: '941412.75',
    otrasEmpresas: 'NO' as const,
  },
  aportacion: {
    fechaAportacion: '20260515',
    instrumentoMonetario: '1',
    moneda: '1',
    montoAportacion: '941412.75',
    aportacionFideicomiso: 'NO' as const,
    nombreInstitucion: 'BANCO EJEMPLO',
  },
})

const avisos = (n: number, descripcion?: string): AvisoDelInforme[] =>
  Array.from({ length: n }, (_, i) => ({
    referencia: referenciaAviso('202605', i + 1),
    prioridad: '1',
    tipoAlerta: '100',
    operaciones: [operacion(descripcion)],
  }))

const informe = (lista: AvisoDelInforme[]): Informe => ({
  mesReportado: '202605',
  claveSujetoObligado: 'ABC890505DF4',
  claveActividad: 'DIN',
  avisos: lista,
})

const pesar = (xml: string) => Buffer.byteLength(xml, 'utf8')

/**
 * El límite de 2 MB del SPPLD.
 *
 * El portal rechaza archivos más grandes, y el rechazo no llega con un mensaje
 * útil: llega como un archivo que no se pudo presentar el día 17.
 */
describe('Fragmentación por el límite del SPPLD', () => {
  it('un informe que cabe entero devuelve UN lote', () => {
    const f = fragmentarInforme(informe(avisos(3)))
    expect(f).toHaveLength(1)
    expect(f[0]?.lote).toBe(1)
    expect(f[0]?.totalLotes).toBe(1)
    expect(f[0]?.avisos).toBe(3)
  })

  it('el informe en cero sigue siendo un archivo que hay que presentar', () => {
    // Cero avisos no es cero archivos: el informe en cero es una obligación.
    const f = fragmentarInforme(informe([]))
    expect(f).toHaveLength(1)
    expect(f[0]?.avisos).toBe(0)
    expect(f[0]?.xml).not.toContain('<aviso>')
  })

  it('NINGÚN lote supera el límite, medido sobre el XML real', () => {
    // Se mide el archivo serializado, no la cuenta que hizo el fragmentador.
    // Si la cuenta y la realidad divergen, esto lo detecta.
    const relleno = 'A'.repeat(6_000)
    const f = fragmentarInforme(informe(avisos(400, relleno)))

    expect(f.length).toBeGreaterThan(1)
    for (const lote of f) {
      expect(pesar(lote.xml)).toBeLessThanOrEqual(LIMITE_BYTES)
      expect(lote.bytes).toBe(pesar(lote.xml))
    }
  })

  it('no se pierde ni se duplica un solo aviso al partir', () => {
    // Lo que más importa y lo que menos se nota: un aviso que se cae entre dos
    // lotes es una operación no reportada, y el archivo valida igual.
    const lista = avisos(400, 'B'.repeat(6_000))
    const f = fragmentarInforme(informe(lista))

    expect(f.length).toBeGreaterThan(1)
    const referenciasEmitidas = f.flatMap((lote) =>
      [...lote.xml.matchAll(/<referencia_aviso>([^<]+)</g)].map((m) => m[1]),
    )
    expect(referenciasEmitidas).toEqual(lista.map((a) => a.referencia))
    expect(new Set(referenciasEmitidas).size).toBe(lista.length)
    expect(f.reduce((n, l) => n + l.avisos, 0)).toBe(lista.length)
  })

  it('cada lote es un archivo COMPLETO, no un pedazo', () => {
    // El portal recibe archivos independientes. Un fragmento sin encabezado no
    // es presentable.
    const f = fragmentarInforme(informe(avisos(400, 'C'.repeat(6_000))))
    expect(f.length).toBeGreaterThan(1)
    for (const lote of f) {
      expect(lote.xml).toContain('<mes_reportado>202605</mes_reportado>')
      expect(lote.xml).toContain('<clave_sujeto_obligado>ABC890505DF4</clave_sujeto_obligado>')
      expect(lote.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    }
  })

  it('la numeración dice de cuántos: lote N de M', () => {
    const f = fragmentarInforme(informe(avisos(400, 'D'.repeat(6_000))))
    expect(f.length).toBeGreaterThan(1)
    expect(f.map((l) => l.lote)).toEqual(f.map((_, i) => i + 1))
    expect(new Set(f.map((l) => l.totalLotes))).toEqual(new Set([f.length]))
  })

  it('un aviso que por sí solo no cabe REVIENTA en vez de emitirse', () => {
    // Un aviso es indivisible: sus operaciones son de un mismo acto. Emitirlo
    // igual produce un archivo que el portal rechaza, y el obligado se entera
    // el día que no puede presentar.
    const gigante = avisos(1, 'E'.repeat(LIMITE_BYTES + 1_000))
    expect(() => fragmentarInforme(informe(gigante))).toThrow(AvisoDemasiadoGrande)
  })

  it('el peso por aviso que calcula el fragmentador es el real', () => {
    // El fragmentador mide cada aviso UNA vez y asume que su tamaño no depende
    // de sus hermanos. Es cierto porque el serializador concatena y la sangría
    // no varía, pero es la suposición de la que cuelga todo lo demás.
    const lista = avisos(5)
    const sobre = pesar(construirInformeXml(informe([])))
    const unoSolo = pesar(construirInformeXml(informe([lista[0] as AvisoDelInforme])))
    const cinco = pesar(construirInformeXml(informe(lista)))

    expect(cinco).toBe(sobre + (unoSolo - sobre) * 5)
  })
})
