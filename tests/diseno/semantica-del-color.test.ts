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

describe('El color de la barra del navegador no se desfasa del fondo', () => {
  const LAYOUT = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8')

  /**
   * `themeColor` es una COPIA de `--fondo` que Next necesita en tiempo de
   * build, y las copias se desfasan. Ya pasó una vez: quedó con la paleta fría
   * cuando el rediseño movió el fondo al mundo cálido, y la barra del navegador
   * pintaba el color viejo sobre el portal nuevo. Se descubrió leyendo el HTML
   * que sirve el dominio, no en local — que es tarde.
   */
  it.each([0, 1])('el themeColor del tema %i es exactamente el --fondo de ese tema', (i) => {
    const fondos = valoresDelToken('fondo')
    const declarados = [...LAYOUT.matchAll(/color:\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) =>
      (m[1] ?? '').toUpperCase(),
    )
    expect(declarados).toHaveLength(2)
    expect(declarados[i]).toBe(fondos[i]?.toUpperCase())
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

/**
 * El contraste de lo que se lee, medido y no supuesto.
 *
 * Se mide con la fórmula de la WCAG 2.1 (relative luminance + ratio). No es
 * una prueba de accesibilidad completa: es el guardián de los pocos valores
 * que ya se eligieron midiendo, para que nadie los mueva de vuelta.
 */
function luminancia(hex: string): number {
  const c = hex.replace('#', '')
  const canal = (i: number) => {
    const v = parseInt(c.slice(i * 2, i * 2 + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2)
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

describe('el botón deshabilitado se puede leer', () => {
  it('la fórmula reproduce un valor conocido: negro sobre blanco es 21:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('LO QUE SE REEMPLAZÓ: blanco sobre el naranja al 50% era ilegible', () => {
    // `opacity: .5` sobre una tarjeta blanca mezcla el naranja con el fondo.
    const mezcla = (fg: string, bg: string, a: number) =>
      '#' +
      [0, 1, 2]
        .map((i) => {
          const f = parseInt(fg.slice(1 + i * 2, 3 + i * 2), 16)
          const b = parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16)
          return Math.round(f * a + b * (1 - a))
            .toString(16)
            .padStart(2, '0')
        })
        .join('')
    const naranjaAlMedio = mezcla('#E8590C', '#FFFFFF', 0.5)
    // El texto también se difumina, pero incluso ignorando eso ya no llega.
    expect(contraste('#FFFFFF', naranjaAlMedio)).toBeLessThan(2.5)
  })

  it('lo que hay ahora: tinta tenue sobre la superficie apagada pasa el 4.5:1', () => {
    expect(contraste('#706C65', '#F7F6F2')).toBeGreaterThanOrEqual(4.5)
  })

  it('y en oscuro también', () => {
    // `--superficie-2` es la superficie más CLARA del tema oscuro: el peor
    // caso para una tinta tenue. El #8A857C original se quedaba en 4.494.
    expect(contraste('#8B867D', '#201F1C')).toBeGreaterThanOrEqual(4.5)
  })

  it('el CSS ya no apaga el botón con opacidad', () => {
    const regla = CSS.slice(CSS.indexOf('button:disabled'), CSS.indexOf('button:disabled') + 260)
    expect(regla).not.toMatch(/opacity:\s*\.5/)
    expect(regla).toContain('var(--texto-tenue)')
  })
})
