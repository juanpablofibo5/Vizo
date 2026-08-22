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

  it('los selectores del semáforo existen: si alguien los renombra, esto avisa', () => {
    // Sin esto, borrar `.estado.aviso` volvería verdes todas las pruebas de
    // arriba por vacuidad — pasarían por no encontrar nada que revisar.
    for (const selector of SEMAFORO) {
      expect(bloque(selector).length, `no se encontró el bloque de ${selector}`).toBeGreaterThan(0)
    }
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
