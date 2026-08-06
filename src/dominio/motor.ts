import type { ConfigActividad, EntradaEvaluacion, Evaluacion } from './tipos.js'

/**
 * EL MOTOR DE EVALUACIÓN — todavía no implementado.
 *
 * Esto es deliberado y es el orden que manda docs/03_EJECUCION_CLAUDE_CODE.md:
 * la suite existe ANTES que el motor. No es dogma de TDD, es gestión de riesgo
 * penal — un umbral mal calculado no produce un bug, produce un aviso omitido,
 * que se sanciona con 10,000 a 65,000 UMA.
 *
 * Semana 2 (ahora): los 16 casos de docs/PRUEBAS.md corren y fallan aquí.
 * Semana 3: se implementa hasta que los individuales y de IVA pasen.
 * Semana 4: acumulación, hasta que la suite completa esté en verde.
 *
 * FIRMA — no cambia al implementar:
 *   - Función PURA. No consulta la base, no lee la hora, no usa aleatoriedad.
 *     La misma entrada da siempre la misma salida, que es lo que permite
 *     defender un cálculo años después.
 *   - No sabe qué es la Fracción V Bis. Recibe `config` y evalúa. Agregar la
 *     Fracción XV no toca este archivo (prueba X-01, semana 11).
 *   - Ningún LLM participa aquí. Restricción no negociable #4.
 */
export function evaluar(_entrada: EntradaEvaluacion, _config: ConfigActividad): Evaluacion {
  throw new MotorNoImplementado()
}

export class MotorNoImplementado extends Error {
  constructor() {
    super(
      'El motor de umbrales todavía no está implementado (semanas 3-4). ' +
        'La suite de docs/PRUEBAS.md existe antes que el motor a propósito.',
    )
    this.name = 'MotorNoImplementado'
  }
}
