import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Toda clase que el código usa tiene que existir en la hoja de estilos.
 *
 * Una clase sin regla no falla: pinta el elemento con el estilo por omisión y
 * se ve *casi* bien, así que sobrevive a las revisiones. `.casilla` llevaba
 * meses en el alta de operaciones sin una sola línea de CSS — el checkbox
 * salía encima del texto y con el ancho de un input, y nadie lo reportó.
 *
 * LO QUE ESTA PRUEBA NO ATRAPA, y conviene tenerlo escrito: la clase que SÍ
 * existe pero significa otra cosa. El mismo día que se escribió esto,
 * `<span className="chip alerta">` de la pantalla de configuración se infló
 * con el padding y el borde de una tarjeta, porque una `.alerta` nueva se
 * estrenó como tarjeta de la pantalla de alertas. La clase existía; el
 * choque era de significado. Eso solo lo ve alguien mirando la pantalla —y
 * por eso la tarjeta pasó a llamarse `.ficha-alerta`.
 */

const raiz = new URL('../../', import.meta.url).pathname

function archivos(dir: string, ext: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) archivos(p, ext, acc)
    else if (e.name.endsWith(ext)) acc.push(p)
  }
  return acc
}

const css = readFileSync(join(raiz, 'app/globals.css'), 'utf8')
const definidas = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1] as string))

/** Las clases de cada `className`, con las interpolaciones quitadas. */
function clasesDe(fuente: string): string[] {
  const clases: string[] = []
  for (const m of fuente.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const texto = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    for (const c of texto.split(/\s+/)) if (c !== '') clases.push(c)
  }
  return clases
}

describe('ninguna clase se usa sin regla que la pinte', () => {
  const tsx = archivos(join(raiz, 'app'), '.tsx')

  test('hay pantallas que revisar (si esto falla, el barrido no encontró nada)', () => {
    expect(tsx.length).toBeGreaterThan(15)
  })

  for (const f of tsx) {
    const corto = f.slice(f.indexOf('/app/') + 1)
    test(corto, () => {
      const huerfanas = clasesDe(readFileSync(f, 'utf8')).filter((c) => {
        if (definidas.has(c)) return false
        // Un fragmento que termina en `-` es lo que dejó una interpolación
        // (`tono-${s.tono}`). No se descarta: se comprueba COMO PREFIJO, así
        // que un prefijo mal escrito —`tonoo-`— sigue muriendo aquí.
        if (c.endsWith('-')) return ![...definidas].some((d) => d.startsWith(c))
        return true
      })
      expect(huerfanas, `clases sin regla en ${corto}`).toEqual([])
    })
  }
})
