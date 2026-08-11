/**
 * El tamaño de un archivo, legible.
 *
 * Un `(bytes / 1024).toFixed(0)` redondea 192 bytes a **0 KB**, y "0 KB" al
 * lado de un documento se lee como "el archivo está vacío" — justo lo que nadie
 * quiere pensar del comprobante que acaba de subir. Salió al correr la demo
 * completa.
 *
 * Los bytes llegan como TEXTO porque Postgres los devuelve así (`bigint`), y
 * pasar por `Number` es seguro hasta 9 petabytes — pero el parseo se hace aquí,
 * en un solo lugar, en vez de repetirlo en cada pantalla.
 */
export function tamanoLegible(bytes: string | number): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes

  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${String(Math.round(n))} B`
  if (n < 1024 * 1024) {
    const kb = n / 1024
    // Un decimal por debajo de 10 KB: la diferencia entre 1.2 y 9.8 importa
    // cuando se está mirando si el archivo es el correcto.
    return `${kb < 10 ? kb.toFixed(1) : String(Math.round(kb))} KB`
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
