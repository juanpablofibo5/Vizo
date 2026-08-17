import { describe, expect, it } from 'vitest'
import { resolverConstancia, type ApartadoDelManual } from '../../src/dominio/constancia'
import { escribirIndiceDelManual } from '../../src/dominio/indice-manual'

/**
 * El índice del Manual.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PROPIEDAD QUE LO DEFINE
 * ────────────────────────────────────────────────────────────────────────────
 * **No repite un solo hecho acreditado: los REFERENCIA.**
 *
 * Es lo que autoriza el Art. 37 ¶2 —«se deberán incluir las referencias de
 * aquellos criterios […] que puedan quedar plasmados en un documento
 * distinto»— y lo que mantiene separados a los dos dueños: la Constancia la
 * afirma VIZO sobre sí mismo, el Manual lo adopta y lo firma el obligado.
 *
 * Copiar los hechos aquí rompería la referencia en el peor momento: el Manual
 * diría una cosa, la Constancia otra, y ninguna sabría cuál manda. Por eso el
 * caso central compara los dos documentos y exige que el índice NO contenga el
 * texto de un hecho.
 */
describe('El índice del Manual', () => {
  const obligado = {
    razonSocial: 'Desarrollos Ejemplo SA de CV',
    rfc: 'DEJ010101AAA',
    fecha: '2026-11-30',
  }
  const ref = { fecha: '2026-11-30', hashSha256: 'a'.repeat(64) }

  const acreditado: ApartadoDelManual = {
    fraccion: 'VIII',
    orden: 8,
    texto:
      'Los mecanismos para dar seguimiento y acumular actos u operaciones que en lo individual se celebren con las personas Clientes o Usuarias.',
    origen: 'acreditado',
    claveEvidencia: 'acumulacion',
    preguntas: [],
    fuente: 'Art. 37 Bis, fr. VIII',
  }

  const parcial: ApartadoDelManual = {
    fraccion: 'X',
    orden: 10,
    texto: 'Las funciones y responsabilidades de la persona Representante Encargada de Cumplimiento;',
    origen: 'acreditado_parcial',
    claveEvidencia: 'designacion_rec',
    porQueNo: 'Las funciones concretas del REC las define el obligado.',
    preguntas: ['¿Qué decisiones toma el REC y cuáles escala?'],
    fuente: 'Art. 37 Bis, fr. X',
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

  const HECHO = 'Las operaciones se acumulan en una ventana deslizante de 6 meses.'
  const RESPALDO = 'parametros_motor.ventana_acumulacion_meses'

  const armar = () =>
    resolverConstancia(
      [acreditado, parcial, hueco],
      new Map([
        ['acumulacion', [{ afirmacion: HECHO, respaldo: RESPALDO }]],
        ['designacion_rec', [{ afirmacion: 'El REC aceptó el 2026-03-12.', respaldo: 'designaciones_rec' }]],
      ]),
    )

  const indice = () => escribirIndiceDelManual(armar(), obligado, ref)

  describe('referencia, no repite', () => {
    it('NO copia el texto de un hecho acreditado', () => {
      // EL CASO CENTRAL. Si el índice repitiera los hechos, dejaría de ser una
      // referencia y pasaría a ser una segunda copia que puede divergir.
      const t = indice()

      expect(t).not.toContain(HECHO)
      expect(t).not.toContain(RESPALDO)
    })

    it('y en su lugar cita la Constancia por fecha y huella', () => {
      const t = indice()

      expect(t).toContain('Constancia de mecanismos implementados')
      expect(t).toContain(ref.hashSha256)
      expect(t).toContain('forma parte integrante de este Manual por referencia')
    })

    it('la huella aparece en cada apartado referido, no solo al final', () => {
      // Un Manual se lee por apartados, y a veces se fotocopia por apartados.
      // La huella al pie sola dejaría una página suelta sin forma de saber a
      // qué documento remite.
      const t = indice()
      const ocurrencias = t.split(ref.hashSha256).length - 1

      // Dos apartados referidos (VIII y X) más el pie.
      expect(ocurrencias).toBe(3)
    })
  })

  describe('los pendientes se ven como pendientes', () => {
    it('un hueco lleva la marca y sus preguntas, nunca una respuesta', () => {
      const t = indice()

      expect(t).toContain('[PENDIENTE DE REDACCIÓN]')
      expect(t).toContain('¿Quién imparte la capacitación?')
    })

    it('un apartado PARCIAL referencia Y además marca lo que falta', () => {
      // Es el caso que más fácil se simplifica mal: o se da por completo o se
      // da por vacío, y no es ninguno de los dos.
      const t = indice()
      const secX = t.slice(t.indexOf('## X.'), t.indexOf('## XI.'))

      expect(secX).toContain('forma parte integrante')
      expect(secX).toContain('[PENDIENTE DE REDACCIÓN]')
      expect(secX).toContain('¿Qué decisiones toma el REC')
    })

    it('un apartado ACREDITADO no lleva marca de pendiente', () => {
      const t = indice()
      const secVIII = t.slice(t.indexOf('## VIII.'), t.indexOf('## X.'))

      expect(secVIII).toContain('forma parte integrante')
      expect(secVIII).not.toContain('PENDIENTE')
    })
  })

  describe('el encabezado dice qué es y qué falta', () => {
    it('advierte que no está firmado ni adoptado', () => {
      // Un índice que se lea como Manual terminado es el error caro: se
      // entrega incompleto creyendo lo contrario.
      expect(indice()).toContain('no está firmado ni adoptado')
    })

    it('cuenta los apartados referidos y los pendientes', () => {
      const t = indice()
      // 1 acreditado + 1 parcial remiten; 1 hueco + 1 parcial quedan pendientes.
      expect(t).toContain('2 apartados remiten a la Constancia')
      expect(t).toContain('**2 apartados están marcados como PENDIENTES')
    })

    it('exige que la Constancia se entregue junto con el Manual', () => {
      // Sin ella, los apartados referidos quedan vacíos — y eso hay que
      // decirlo donde se lea, no en una nota al pie.
      expect(indice()).toContain('debe entregarse junto con este Manual')
    })
  })

  it('reproduce el texto de cada fracción para poder cotejarlo', () => {
    expect(indice()).toContain('dar seguimiento y acumular actos u operaciones')
  })
})
