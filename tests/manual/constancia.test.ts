import { describe, expect, it } from 'vitest'
import { escribirConstancia } from '../../src/dominio/constancia-texto'
import {
  CatalogoDelManualVacio,
  resolverConstancia,
  type ApartadoDelManual,
  type HechoAcreditado,
} from '../../src/dominio/constancia'

/**
 * La frontera del ADR-20, hecha prueba.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ SE ESTÁ PROTEGIENDO
 * ────────────────────────────────────────────────────────────────────────────
 *   «VIZO no emite una sola frase que no pueda respaldar con un dato del
 *   sistema. Sin evidencia no hay prosa: hay hueco.»
 *
 * Sin estos casos, esa frase es una declaración de intenciones en un documento
 * de decisiones. Con ellos es una propiedad del código: se vacía la evidencia
 * de un apartado y se comprueba que sale el hueco, no un párrafo.
 *
 * El modo de falla que impiden no es un crash. Es un Manual entregado a la
 * autoridad que dice «el obligado cuenta con mecanismos de conservación de
 * información» sobre una cuenta donde nunca se subió un documento. Plausible,
 * bien redactado, y falso.
 */
describe('La Constancia de mecanismos', () => {
  const acreditado = (over: Partial<ApartadoDelManual> = {}): ApartadoDelManual => ({
    fraccion: 'VII',
    orden: 7,
    texto: 'Los mecanismos de conservación de información y documentación;',
    origen: 'acreditado',
    claveEvidencia: 'conservacion_y_huellas',
    preguntas: [],
    fuente: 'Art. 37 Bis, fr. VII',
    ...over,
  })

  const hueco = (over: Partial<ApartadoDelManual> = {}): ApartadoDelManual => ({
    fraccion: 'XI',
    orden: 11,
    texto: 'Los programas de capacitación;',
    origen: 'del_obligado',
    porQueNo: 'La capacitación ocurre fuera del sistema.',
    preguntas: ['¿Quién imparte la capacitación?'],
    fuente: 'Art. 37 Bis, fr. XI',
    ...over,
  })

  const hecho = (afirmacion: string): HechoAcreditado => ({
    afirmacion,
    respaldo: 'documentos · 12 filas · SHA-256 por archivo',
  })

  const con = (clave: string, hechos: HechoAcreditado[]) => new Map([[clave, hechos]])

  describe('sin evidencia no hay prosa', () => {
    it('un apartado ACREDITADO cuyo recolector no devuelve nada sale como HUECO', () => {
      // EL CASO CENTRAL DEL ADR-20. El catálogo dice que VIZO lo demuestra;
      // la evidencia dice que no hay nada. Gana la evidencia.
      const r = resolverConstancia([acreditado()], new Map())

      expect(r.secciones[0]?.resolucion).toBe('hueco')
      expect(r.secciones[0]?.hechos).toEqual([])
      expect(r.huecos).toBe(1)
      expect(r.acreditados).toBe(0)
    })

    it('y queda marcado como DEGRADADO, que no es lo mismo que un hueco de catálogo', () => {
      // Un hueco del catálogo es una decisión: ese apartado le toca al obligado.
      // Un degradado es una anomalía: el sistema debería poder demostrarlo y no
      // pudo. Confundirlos escondería una cuenta a medio configurar.
      const r = resolverConstancia([acreditado(), hueco()], new Map())

      expect(r.degradados).toEqual(['VII'])
      expect(r.secciones.find((s) => s.fraccion === 'XI')?.degradado).toBe(false)
    })

    it('un degradado explica qué pasó en vez de quedarse mudo', () => {
      const r = resolverConstancia([acreditado()], new Map())

      expect(r.secciones[0]?.porQueNo).toMatch(/no encontró evidencia/i)
    })

    it('una lista VACÍA es lo mismo que no haber recolectado nada', () => {
      // El recolector corrió y no encontró nada. Tratarlo distinto de «no
      // corrió» abriría la puerta a que un recolector roto pase por bueno.
      const r = resolverConstancia([acreditado()], con('conservacion_y_huellas', []))

      expect(r.secciones[0]?.resolucion).toBe('hueco')
      expect(r.secciones[0]?.degradado).toBe(true)
    })

    it('con evidencia sí acredita: la restricción no rechaza todo', () => {
      // El control. Sin este caso, los cuatro de arriba pasarían también con
      // una función que nunca acredite nada.
      const r = resolverConstancia(
        [acreditado()],
        con('conservacion_y_huellas', [hecho('Cada documento se guarda con su huella SHA-256.')]),
      )

      expect(r.secciones[0]?.resolucion).toBe('acreditado')
      expect(r.secciones[0]?.degradado).toBe(false)
      expect(r.acreditados).toBe(1)
    })
  })

  describe('el hueco lleva preguntas, nunca respuestas', () => {
    it('conserva el texto del artículo, el porqué y las preguntas', () => {
      const r = resolverConstancia([hueco()], new Map())
      const s = r.secciones[0]

      expect(s?.texto).toContain('programas de capacitación')
      expect(s?.porQueNo).toBeDefined()
      expect(s?.preguntas).toHaveLength(1)
      // Y no trae hechos: un hueco con hechos sería una contradicción.
      expect(s?.hechos).toEqual([])
    })

    it('un apartado PARCIAL acredita y además nombra lo que falta', () => {
      const parcial = acreditado({
        fraccion: 'X',
        orden: 10,
        origen: 'acreditado_parcial',
        claveEvidencia: 'designacion_rec',
        porQueNo: 'Las funciones concretas del REC las define el obligado.',
        preguntas: ['¿Qué decisiones toma el REC y cuáles escala?'],
      })

      const r = resolverConstancia(
        [parcial],
        con('designacion_rec', [hecho('El REC aceptó su designación el 12 de marzo de 2026.')]),
      )

      expect(r.secciones[0]?.resolucion).toBe('parcial')
      expect(r.secciones[0]?.hechos).toHaveLength(1)
      expect(r.secciones[0]?.preguntas).toHaveLength(1)
      expect(r.parciales).toBe(1)
    })

    it('un PARCIAL sin evidencia también cae a hueco, y conserva su explicación', () => {
      const parcial = acreditado({
        fraccion: 'X',
        origen: 'acreditado_parcial',
        claveEvidencia: 'designacion_rec',
        porQueNo: 'Las funciones concretas del REC las define el obligado.',
        preguntas: ['¿Qué decisiones toma el REC?'],
      })

      const r = resolverConstancia([parcial], new Map())

      expect(r.secciones[0]?.resolucion).toBe('hueco')
      expect(r.secciones[0]?.degradado).toBe(true)
      // La explicación del catálogo NO se pisa: sigue siendo verdad que las
      // funciones las define el obligado.
      expect(r.secciones[0]?.porQueNo).toMatch(/funciones concretas/i)
    })
  })

  it('el catálogo vacío revienta en vez de producir un documento de cero apartados', () => {
    // Mismo caso caro que la completitud del expediente: sin apartados no hay
    // nada que reclamar, así que el documento saldría «sin pendientes» — y un
    // catálogo que no cargó se ve idéntico a un Manual completo.
    expect(() => resolverConstancia([], new Map())).toThrow(CatalogoDelManualVacio)
  })

  it('las secciones salen en el orden del artículo, no en el que lleguen', () => {
    const r = resolverConstancia([hueco(), acreditado()], new Map())
    expect(r.secciones.map((s) => s.fraccion)).toEqual(['VII', 'XI'])
  })
})

describe('Cómo se escribe la Constancia', () => {
  const obligado = { razonSocial: 'Desarrollos Ejemplo SA de CV', rfc: 'DEJ010101AAA', fecha: '2027-03-01' }

  const acreditado: ApartadoDelManual = {
    fraccion: 'VIII',
    orden: 8,
    texto: 'Los mecanismos para dar seguimiento y acumular actos u operaciones…',
    origen: 'acreditado',
    claveEvidencia: 'acumulacion',
    preguntas: [],
    fuente: 'Art. 37 Bis, fr. VIII',
  }
  const hueco: ApartadoDelManual = {
    fraccion: 'XI',
    orden: 11,
    texto: 'Los programas de capacitación;',
    origen: 'del_obligado',
    porQueNo: 'La capacitación ocurre fuera del sistema.',
    preguntas: ['¿Quién imparte la capacitación?'],
    fuente: 'Art. 37 Bis, fr. XI',
  }

  const texto = () =>
    escribirConstancia(
      resolverConstancia(
        [acreditado, hueco],
        new Map([['acumulacion', [{ afirmacion: 'Se acumula en ventana de 6 meses.', respaldo: 'parametros_motor' }]]]),
      ),
      obligado,
    )

  it('dice en el primer párrafo que NO es el Manual', () => {
    // Es la frontera hecha texto. Quien recibe algo llamado Manual lo entrega
    // como completo; si le faltan apartados, lo entrega incompleto creyendo
    // que no. El aviso va antes que cualquier otra cosa, no en el pie.
    const t = texto()
    const antesDelCuerpo = t.slice(0, t.indexOf('## Fracción'))

    expect(antesDelCuerpo).toContain('NO es su Manual de Políticas Internas')
    expect(t.startsWith('# Constancia de mecanismos implementados')).toBe(true)
  })

  it('dice cuántos apartados quedan pendientes, con número', () => {
    expect(texto()).toContain('Quedan 1 apartados que usted debe redactar')
  })

  it('cada hecho acreditado dice dónde se comprueba', () => {
    expect(texto()).toContain('Verificable en: parametros_motor')
  })

  it('un pendiente lleva PREGUNTAS y ninguna respuesta sugerida', () => {
    const t = texto()
    expect(t).toContain('Pendiente — lo redacta el sujeto obligado')
    expect(t).toContain('¿Quién imparte la capacitación?')
  })

  it('reproduce el texto del artículo literal, para poder cotejarlo', () => {
    expect(texto()).toContain('dar seguimiento y acumular actos u operaciones')
  })

  it('un apartado DEGRADADO no deja un encabezado de preguntas vacío', () => {
    // EL DEFECTO QUE APARECIÓ EN EL ARCHIVO DESCARGADO. Un degradado no trae
    // preguntas —el catálogo lo daba por acreditado— y el documento salía con
    // «Qué hay que responder aquí:» seguido de nada. Un hueco mudo, que es lo
    // que el CHECK de la tabla impide sembrar, colándose por el renderizado.
    //
    // Ninguna prueba lo vio porque todas miraban secciones CON preguntas.
    const t = escribirConstancia(resolverConstancia([acreditado], new Map()), obligado)

    expect(t).toContain('Pendiente — lo redacta el sujeto obligado')
    expect(t).not.toContain('Qué hay que responder')
  })

  it('y tampoco repite dos veces que no encontró evidencia', () => {
    const t = escribirConstancia(resolverConstancia([acreditado], new Map()), obligado)
    expect(t).not.toContain('**Nota:**')
  })

  it('la lista final no queda pegada al separador', () => {
    // Sin línea en blanco, un `---` pegado a una lista deja de ser separador en
    // Markdown y se come el último elemento. Se ve al abrir el archivo, no al
    // leer la cadena.
    const t = escribirConstancia(resolverConstancia([acreditado, hueco], new Map()), obligado)
    expect(t).not.toMatch(/\n- [^\n]+\n---/)
  })

  it('cuando algo se degradó, lo advierte al final en vez de callarlo', () => {
    const t = escribirConstancia(resolverConstancia([acreditado, hueco], new Map()), obligado)
    expect(t).toContain('Atención:')
    expect(t).toContain('VIII')
  })
})
