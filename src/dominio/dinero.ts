/**
 * Aritmética de dinero en centavos enteros.
 *
 * REGLA DURA (CLAUDE.md): los montos son enteros de centavos en TypeScript.
 * Nunca `float`. Un centavo perdido por redondeo binario no es un detalle
 * estético: el caso U-03 de docs/PRUEBAS.md es exactamente una operación un
 * centavo por debajo del umbral, y ahí la diferencia entre "alerta de
 * proximidad" y "aviso obligatorio" son 200 a 2,000 UMA de multa.
 */

/**
 * Centavos enteros. El tipo está marcado para que un `number` cualquiera no
 * se cuele donde se espera dinero: `500000` puede ser $5,000.00 o $500,000.00
 * según quién lo escribió, y ese malentendido es la clase de error que este
 * proyecto no se puede permitir.
 */
export type Centavos = number & { readonly __centavos: unique symbol }

/** Valor de la UMA diaria, también en centavos. */
export type UmaCentavos = number & { readonly __uma: unique symbol }

export function centavos(valor: number): Centavos {
  if (!Number.isInteger(valor)) {
    throw new Error(`Los centavos deben ser enteros, se recibió ${valor}`)
  }
  if (!Number.isSafeInteger(valor)) {
    throw new Error(`Monto fuera del rango seguro: ${valor}`)
  }
  return valor as Centavos
}

export function umaCentavos(valor: number): UmaCentavos {
  if (!Number.isInteger(valor)) {
    throw new Error(`La UMA en centavos debe ser entera, se recibió ${valor}`)
  }
  return valor as UmaCentavos
}

/**
 * Convierte el texto decimal que devuelve Postgres (`numeric`) a centavos.
 *
 * Se parsea el string carácter por carácter en vez de usar `parseFloat`:
 * `parseFloat('941412.75') * 100` da 94141274.99999999. Ese es el bug que
 * esta función existe para evitar.
 */
export function pesosTextoACentavos(texto: string): Centavos {
  const limpio = texto.trim()
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(limpio)
  if (!m) {
    throw new Error(`Monto con formato inesperado: "${texto}"`)
  }
  const [, signo, enteros, decimales = ''] = m
  const centavosTexto = (decimales ?? '').padEnd(2, '0')
  const total = Number(enteros) * 100 + Number(centavosTexto)
  return centavos(signo === '-' ? -total : total)
}

/** Para escribir montos legibles en tests y seeds: `pesos(941_412.75)`. */
export function pesos(valor: number): Centavos {
  return centavos(Math.round(valor * 100))
}

/** Formato para mensajes de error y bitácora. Nunca para cálculo. */
export function formatearPesos(monto: Centavos): string {
  const signo = monto < 0 ? '-' : ''
  const abs = Math.abs(monto)
  const enteros = Math.trunc(abs / 100).toLocaleString('es-MX')
  const decimales = String(abs % 100).padStart(2, '0')
  return `${signo}$${enteros}.${decimales}`
}

export function sumar(...montos: Centavos[]): Centavos {
  return centavos(montos.reduce((acc, m) => acc + m, 0))
}

/**
 * Convierte un umbral expresado en UMA a centavos.
 *
 * `valorUma` viene del catálogo como `numeric(10,2)`, así que puede traer
 * decimales. Se multiplica en enteros (centésimas de UMA × centavos de UMA)
 * y se divide al final, para no pasar nunca por punto flotante.
 *
 * Los umbrales publicados por el SAT son enteros (8,025 · 3,210 · 1,605), de
 * modo que la división es exacta en la práctica. Si algún día apareciera un
 * umbral con fracción de UMA, se redondea al centavo más cercano —criterio
 * asumido, no publicado: queda anotado como pendiente de confirmar.
 */
export function umaACentavos(valorUmaTexto: string, uma: UmaCentavos): Centavos {
  const centesimasDeUma = pesosTextoACentavos(valorUmaTexto)
  return centavos(Math.round((centesimasDeUma * uma) / 100))
}

/** Porcentaje entero sobre un monto, redondeado al centavo hacia arriba. */
export function porcentaje(monto: Centavos, pct: number): Centavos {
  return centavos(Math.ceil((monto * pct) / 100))
}
