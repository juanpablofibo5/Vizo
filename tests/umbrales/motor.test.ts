import { describe, it } from 'vitest'

/**
 * SUITE DEL MOTOR DE UMBRALES — el criterio de aceptación real del proyecto.
 *
 * Cada caso está declarado como `todo`: existe, tiene nombre, y vitest lo
 * reporta como pendiente. Eso es deliberado. La alternativa —un directorio
 * vacío con `--passWithNoTests`— daría un CI en verde que no prueba nada, que
 * es exactamente el modo de falla que encontró la auditoría de la semana 1.
 *
 * La semana 2 convierte estos `todo` en tests reales, fallando, ANTES de que
 * exista el motor. La entrada exacta y la salida esperada de cada uno están en
 * docs/PRUEBAS.md, con su aritmética visible para poder recalcularla a mano.
 *
 * Los valores NO se escriben aquí como constantes: se leen del catálogo
 * (regla dura 1). Estos tests cargan el seed y le preguntan a la Capa 0.
 */

describe('Motor de umbrales · operación individual', () => {
  it.todo('U-01 · V Bis identifica siempre: $200,000 requiere expediente, no aviso')
  it.todo('U-02 · aviso individual: $950,000 rebasa los 8,025 UMA')
  it.todo('U-03 · un centavo por debajo del umbral: alerta de proximidad, sin aviso')
})

describe('Motor de umbrales · las tres bases de IVA', () => {
  it.todo('V-01 · $900,000 + IVA: no rebasa el umbral (sin IVA) pero sí el límite de efectivo (con IVA)')
  it.todo('V-02 · $1,000,000 + IVA: rebasa ambos')
})

describe('Motor de umbrales · vigencia de la UMA', () => {
  it.todo('G-01 · operación del 15 de enero de 2026 se evalúa con la UMA de 2025')
  it.todo('G-02 · el mismo monto el 15 de febrero de 2026 ya no rebasa')
  it.todo('G-03 · frontera exacta: 31 de enero todavía es UMA 2025')
  it.todo('G-04 · frontera exacta: 1 de febrero ya es UMA 2026')
})

describe('Motor de umbrales · acumulación de 6 meses', () => {
  it.todo('A-01 · pagos parciales de preventa: el aviso se dispara en el pago que cruza')
  it.todo('A-02 · ventana vencida: dos pagos con 8 meses de diferencia no acumulan')
  it.todo('A-03 · cross-sucursal: la suma cruza sucursales del mismo obligado')
  it.todo('A-04 · fracciones independientes: V Bis y XV nunca se suman entre sí')
  it.todo('A-05 · extranjero sin RFC: acumula conservadoramente y escala a revisión humana')
  it.todo('A-06 · proximidad por suma de ventana, no solo por operación individual')
})

describe('Motor de umbrales · agnosticismo de fracción', () => {
  // La prueba de diseño de la semana 11: dar de alta la Fr. XV solo con
  // INSERTs al catálogo, sin tocar src/.
  it.todo('X-01 · Fr. XV evaluada correctamente sin cambios en el motor')
})
