import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * El naranja de marca no puede decir un estado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UNA PRUEBA Y NO UNA CONVENCIÓN
 * ────────────────────────────────────────────────────────────────────────────
 * `app/globals.css` lo dice en su encabezado: en un portal de cumplimiento los
 * colores semánticos —en regla, por vencer, vencido— son parte de la
 * INFORMACIÓN, no del estilo. La decisión de identidad del 16-ago-2026 lo
 * acotó: el naranja es la marca, el verdigrís es el estado, y dentro del
 * producto el naranja solo entra donde no hay semáforo —barra lateral, acceso,
 * onboarding y estados vacíos—.
 *
 * Esa clase de regla se rompe sola con el tiempo. Alguien pinta un chip de
 * naranja «para que resalte», y a partir de ahí una tabla de estados tiene un
 * color que a veces significa marca y a veces significa «por vencer». Nadie lo
 * nota, porque nada falla: se ve bien.
 *
 * Esta prueba se escribió ANTES de que el token de marca existiera en el CSS,
 * a propósito, para que naciera vigilado.
 */

const CSS = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

/** Los naranjas de marca, en los dos temas (decisión del 16-ago-2026). */
const MARCA = ['#E8590C', '#FF7A1A']

/** Los selectores que dicen un estado regulatorio y no pueden llevar marca. */
const SEMAFORO = [
  '.chip',
  '.chip-alerta',
  '.estado',
  '.estado.ok',
  '.estado.aviso',
  '.estado.critico',
  '.estado.neutro',
  '.tarjeta-alerta',
  '.error',
  '.aviso',
  '.exito',
]

/** Un bloque `selector { … }` del CSS, sin comentarios. */
function bloque(selector: string): string {
  const sinComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const cuerpos: string[] = []
  const patron = new RegExp(
    `(^|[},;\\s])${selector.replace(/[.]/g, '\\.')}\\s*(,[^{]*)?\\{([^}]*)\\}`,
    'gm',
  )
  let m: RegExpExecArray | null
  while ((m = patron.exec(sinComentarios)) !== null) cuerpos.push(m[3] ?? '')
  return cuerpos.join('\n')
}

/** Los valores de un token, en todos los temas donde se declare. */
function valoresDelToken(token: string): string[] {
  const patron = new RegExp(`--${token}\\s*:\\s*([^;]+);`, 'g')
  const vals: string[] = []
  let m: RegExpExecArray | null
  while ((m = patron.exec(CSS)) !== null) vals.push((m[1] ?? '').trim().toUpperCase())
  return vals
}

/** Matiz en grados, 0–360. */
function matiz(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  const grados =
    max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return (grados + 360) % 360
}

describe('El naranja de marca no dice un estado', () => {
  it.each(SEMAFORO)('%s no lleva un naranja de marca literal', (selector) => {
    const cuerpo = bloque(selector).toUpperCase()
    for (const naranja of MARCA) {
      expect(cuerpo).not.toContain(naranja)
    }
  })

  it.each(SEMAFORO)('%s no usa el token de marca', (selector) => {
    const cuerpo = bloque(selector)
    // Cubre --marca, --marca-suave, --marca-vivo y cualquier variante futura.
    expect(cuerpo).not.toMatch(/var\(\s*--marca/)
  })

  /**
   * EL HUECO QUE ESTA PRUEBA TENÍA HASTA EL 22-AGO-2026.
   *
   * Vigilaba los hexes literales y `--marca`, y con eso bastaba mientras
   * `--acento` fuera el verdigrís. El rediseño movió el acento al naranja de
   * marca —para que el verdigrís signifique SOLO «en regla»— y de golpe
   * `.chip`, que usa `var(--acento)`, se volvió naranja sin que nada fallara.
   *
   * La regla de verdad no era «no uses estos hexes»: es que un selector que
   * dice un estado no puede pintarse con el color de la ACCIÓN, se llame como
   * se llame la ficha.
   */
  it.each(SEMAFORO)('%s no usa el token de acción', (selector) => {
    const cuerpo = bloque(selector)
    expect(cuerpo).not.toMatch(/var\(\s*--acento/)
    expect(cuerpo).not.toMatch(/var\(\s*--enlace/)
  })

  it('el acento ES el naranja de marca: si dejara de serlo, la prueba de arriba sobra', () => {
    // Si algún día vuelven a divergir, esta prueba falla y obliga a releer la
    // de arriba en vez de dejarla vigilando algo que ya no aplica.
    const acento = valoresDelToken('acento')
    expect(acento[0]).toBe('#E8590C')
    expect(acento[1]).toBe('#FF7A1A')
  })

  it('los selectores del semáforo existen: si alguien los renombra, esto avisa', () => {
    // Sin esto, borrar `.estado.aviso` volvería verdes todas las pruebas de
    // arriba por vacuidad — pasarían por no encontrar nada que revisar.
    for (const selector of SEMAFORO) {
      expect(bloque(selector).length, `no se encontró el bloque de ${selector}`).toBeGreaterThan(0)
    }
  })
})

describe('El favicon es marca, y su V va sólida a propósito', () => {
  const ICONO = readFileSync(new URL('../../app/icon.svg', import.meta.url), 'utf8')

  it('lleva el naranja de marca en los dos temas', () => {
    expect(ICONO.toUpperCase()).toContain('#E8590C')
    expect(ICONO.toUpperCase()).toContain('#FF7A1A')
  })

  it('no lleva ningún color semántico: un favicon no dice un estado', () => {
    for (const semantico of ['#1D6B58', '#A16207', '#8C2F2F', '#56B99B', '#D9A441', '#D2706A']) {
      expect(ICONO.toUpperCase()).not.toContain(semantico)
    }
  })

  it('la V va SÓLIDA, no calada — y esto es la parte que se va a querer «arreglar»', () => {
    // Dentro del portal la V se cala para tomar el color de lo que haya
    // detrás. En un favicon eso sería un error: vive en la barra de pestañas,
    // cuyo color no controlamos, y calada tomaría un color impredecible.
    // Sólida en blanco se lee igual en cualquier navegador.
    expect(ICONO).toContain('stroke="#FFFFFF"')
    expect(ICONO).not.toContain('<mask')
  })

  it('llena el mosaico: a 16 px no sobra margen', () => {
    // La marca del portal deja 4 u de margen; a 16 px eso es 1 px por lado
    // desperdiciado sobre un dibujo que ya solo mide 16.
    expect(ICONO).toMatch(/<rect[^>]*width="64"[^>]*height="64"/)
    expect(ICONO).not.toMatch(/<rect[^>]*x="4"/)
  })
})

describe('El ámbar de «por vencer» se distingue del naranja de marca', () => {
  // Medido el 22-ago-2026: el par claro aprobado (#A16207 contra #E8590C)
  // separa 14.5°. El oscuro venía a 0.2° —eran el mismo color— y por eso se
  // corrigió a #D9A441, que recupera 13.9°.
  const SEPARACION_MINIMA = 10

  it('--alerta está declarado en los dos temas', () => {
    expect(valoresDelToken('alerta')).toHaveLength(2)
  })

  it.each([0, 1])('el --alerta del tema %i se separa del naranja de su tema', (i) => {
    const alerta = valoresDelToken('alerta')[i]!
    const naranja = MARCA[i]!
    const separacion = Math.abs(matiz(alerta) - matiz(naranja))
    expect(
      separacion,
      `--alerta ${alerta} está a ${separacion.toFixed(1)}° de la marca ${naranja}`,
    ).toBeGreaterThan(SEPARACION_MINIMA)
  })
})
