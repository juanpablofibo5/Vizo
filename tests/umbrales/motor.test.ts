import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar } from '../soporte/db.js'
import { cargarConfigActividad, umbralDe } from '../../src/catalogo/cargador.js'
import { evaluar } from '../../src/dominio/motor.js'
import type { ConfigActividad } from '../../src/dominio/tipos.js'
import {
  CLIENTE_EXT,
  SUCURSAL_CENTRO,
  casoPara,
  cliente,
  mxn,
  previa,
} from '../soporte/fixtures.js'

/**
 * SUITE DEL MOTOR DE UMBRALES — el criterio de aceptación real del proyecto.
 *
 * Transcripción de docs/PRUEBAS.md. Cada caso trae su aritmética visible para
 * poder recalcularla con una calculadora: si el número esperado no se puede
 * verificar a mano, el caso está mal escrito.
 *
 * NINGÚN valor regulatorio se escribe aquí como constante. Los umbrales se
 * leen del catálogo con `cargarConfigActividad`; lo que se afirma es el
 * COMPORTAMIENTO. Si mañana cambia la UMA, estos tests siguen siendo válidos.
 *
 * Estado: individual, IVA y vigencia implementados (semana 3). Los casos de
 * acumulación (A-*) fallan a propósito hasta la semana 4.
 */

const V_BIS = 'V_BIS'

describe('Motor de umbrales', () => {
  let db: Client

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  /** Config "as of" la fecha, igual que la usaría el motor en producción. */
  const config = (fecha: string): Promise<ConfigActividad> =>
    cargarConfigActividad(db, V_BIS, fecha)

  // ═══════════════════════════════════════════════════════════════════════
  // Operación individual
  // ═══════════════════════════════════════════════════════════════════════
  describe('operación individual', () => {
    it('U-01 · V Bis identifica SIEMPRE: $200,000 pide expediente pero no aviso', async () => {
      const c = await config('2026-02-15')
      const ev = evaluar(casoPara(c, { fecha: '2026-02-15', base: 200_000 }), c)

      // La identificación en V Bis no depende del monto: se integra expediente
      // de cada aportante. Es lo que multiplica el volumen de expedientes.
      expect(ev.requiereIdentificacion).toBe(true)
      expect(ev.resultadoAviso).toBe('no')
      expect(ev.efectivoRestringido).toBe(false)
      // 200,000 < 847,271.48 (90% del umbral)
      expect(ev.alertaProximidad).toBe(false)
    })

    it('U-02 · aviso individual: $950,000 rebasa 8,025 UMA = $941,412.75', async () => {
      const c = await config('2026-02-15')
      // 8,025 × $117.31 = $941,412.75
      expect(umbralDe(c, 'aviso')?.enCentavos).toBe(mxn(941_412.75))

      const ev = evaluar(casoPara(c, { fecha: '2026-02-15', base: 950_000 }), c)
      expect(ev.resultadoAviso).toBe('individual')
      // La restricción del Art. 32 aplica al pago en efectivo; esta fue
      // transferencia.
      expect(ev.efectivoRestringido).toBe(false)
    })

    it('U-03 · un centavo por debajo: alerta de proximidad, sin aviso', async () => {
      const c = await config('2026-02-15')
      // $941,412.74 = el umbral menos un centavo. Este caso es la razón de que
      // los montos sean enteros de centavos y nunca float.
      const ev = evaluar(casoPara(c, { fecha: '2026-02-15', base: 941_412.74 }), c)

      expect(ev.resultadoAviso).toBe('no')
      // 941,412.74 ≥ 847,271.48 (90% de 941,412.75, redondeado al centavo)
      expect(ev.alertaProximidad).toBe(true)
      expect(ev.requiereIdentificacion).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Las tres bases sobre el mismo número
  // ═══════════════════════════════════════════════════════════════════════
  describe('IVA: Art. 17 sin IVA, Art. 32 con IVA', () => {
    it('V-01 · $900,000 + IVA: NO rebasa el umbral de aviso pero SÍ el de efectivo', async () => {
      const c = await config('2026-03-15')
      const ev = evaluar(
        casoPara(c, { fecha: '2026-03-15', base: 900_000, iva: 144_000, efectivo: true }),
        c,
      )

      // Umbral de aviso vs. base SIN IVA: 900,000 < 941,412.75
      expect(ev.resultadoAviso).toBe('no')
      // Límite de efectivo vs. total CON IVA: 1,044,000 ≥ 941,412.75
      expect(ev.efectivoRestringido).toBe(true)
      // 900,000 ≥ 847,271.48
      expect(ev.alertaProximidad).toBe(true)
    })

    it('V-02 · $1,000,000 + IVA: rebasa ambos', async () => {
      const c = await config('2026-03-15')
      const ev = evaluar(
        casoPara(c, { fecha: '2026-03-15', base: 1_000_000, iva: 160_000, efectivo: true }),
        c,
      )

      expect(ev.resultadoAviso).toBe('individual') // 1,000,000 ≥ 941,412.75
      expect(ev.efectivoRestringido).toBe(true) // 1,160,000 ≥ 941,412.75
      // El aviso reportará $1,160,000 (el total), distinto de la base con la
      // que se evaluó el umbral. Eso se verifica en test:xsd, no aquí.
      expect(ev.insumos.montoTotalConsiderado).toBe(mxn(1_160_000))
      expect(ev.insumos.montoBaseConsiderado).toBe(mxn(1_000_000))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Vigencia de la UMA: la frontera es el 1 de febrero
  // ═══════════════════════════════════════════════════════════════════════
  describe('vigencia de la UMA', () => {
    it('G-01 · el 15 de enero de 2026 se evalúa con la UMA de 2025', async () => {
      const c = await config('2026-01-15')
      // 8,025 × $113.14 = $907,948.50
      expect(umbralDe(c, 'aviso')?.enCentavos).toBe(mxn(907_948.5))

      const ev = evaluar(casoPara(c, { fecha: '2026-01-15', base: 910_000 }), c)
      expect(ev.resultadoAviso).toBe('individual') // 910,000 ≥ 907,948.50
      expect(ev.insumos.uma).toBe(11_314) // $113.14 en centavos
    })

    it('G-02 · el MISMO monto el 15 de febrero ya no rebasa', async () => {
      const c = await config('2026-02-15')
      const ev = evaluar(casoPara(c, { fecha: '2026-02-15', base: 910_000 }), c)

      // El umbral subió a $941,412.75 con la UMA 2026
      expect(ev.resultadoAviso).toBe('no')
      expect(ev.alertaProximidad).toBe(true) // 910,000 ≥ 847,271.48
      expect(ev.insumos.uma).toBe(11_731) // $117.31 en centavos
    })

    it('G-03 · frontera: el 31 de enero todavía es UMA 2025', async () => {
      const c = await config('2026-01-31')
      const ev = evaluar(casoPara(c, { fecha: '2026-01-31', base: 920_000 }), c)
      expect(ev.resultadoAviso).toBe('individual') // 920,000 ≥ 907,948.50
    })

    it('G-04 · frontera: el 1 de febrero ya es UMA 2026', async () => {
      const c = await config('2026-02-01')
      const ev = evaluar(casoPara(c, { fecha: '2026-02-01', base: 920_000 }), c)
      // Un error de límite (< vs <=) en la vigencia truena exactamente aquí.
      expect(ev.resultadoAviso).toBe('no')
      expect(ev.alertaProximidad).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Acumulación: ventana deslizante de 6 meses
  // ═══════════════════════════════════════════════════════════════════════
  describe('acumulación de 6 meses', () => {
    it('A-01 · pagos parciales de preventa: el aviso se dispara en el pago que cruza', async () => {
      const c = await config('2026-05-15')

      // Pago 3 de 3, con los dos anteriores en la ventana.
      // 400,000 × 3 = 1,200,000 ≥ 941,412.75
      const ev = evaluar(
        casoPara(c, { fecha: '2026-05-15', base: 400_000 }, [
          previa('2026-03-15', 400_000),
          previa('2026-04-15', 400_000),
        ]),
        c,
      )

      expect(ev.resultadoAviso).toBe('acumulacion')
      expect(ev.sumaVentana).toBe(mxn(1_200_000))
      expect(ev.operacionesAcumuladas).toHaveLength(2)
    })

    it('A-01b · el segundo pago todavía no dispara nada', async () => {
      const c = await config('2026-04-15')
      // 400,000 + 400,000 = 800,000 < 847,271.48 → ni aviso ni proximidad
      const ev = evaluar(
        casoPara(c, { fecha: '2026-04-15', base: 400_000 }, [
          previa('2026-03-15', 400_000),
        ]),
        c,
      )

      expect(ev.resultadoAviso).toBe('no')
      expect(ev.alertaProximidad).toBe(false)
      expect(ev.sumaVentana).toBe(mxn(800_000))
    })

    it('A-02 · ventana vencida: 8 meses de diferencia no acumulan', async () => {
      const c = await config('2026-09-10')
      // Ventana = 6 meses hacia atrás desde el 10 sep 2026 → 10 mar 2026.
      // El pago de enero queda FUERA.
      const ev = evaluar(
        casoPara(c, { fecha: '2026-09-10', base: 500_000 }, [
          previa('2026-01-10', 500_000),
        ]),
        c,
      )

      expect(ev.resultadoAviso).toBe('no')
      expect(ev.sumaVentana).toBe(mxn(500_000))
      expect(ev.operacionesAcumuladas).toHaveLength(0)
    })

    it('A-03 · cross-sucursal: la suma cruza sucursales del mismo obligado', async () => {
      const c = await config('2026-07-15')
      // 500,000 (Norte) + 480,000 (Centro) = 980,000 ≥ 941,412.75
      // Un sistema por sucursal —el Excel— daría "no" aquí. Es el diferenciador.
      const ev = evaluar(
        casoPara(c, { fecha: '2026-07-15', base: 480_000, sucursalId: SUCURSAL_CENTRO }, [previa('2026-06-01', 500_000)],
        ),
        c,
      )

      expect(ev.resultadoAviso).toBe('acumulacion')
      expect(ev.sumaVentana).toBe(mxn(980_000))
    })

    it('A-05 · extranjero sin RFC: acumula conservadoramente y escala a revisión', async () => {
      const c = await config('2026-08-01')
      // 500,000 + 500,000 = 1,000,000 ≥ 941,412.75.
      // El motor NO asume que son clientes distintos: suma y marca para que un
      // humano lo revise. Un falso positivo cuesta minutos; un falso negativo
      // es un aviso omitido.
      const ev = evaluar(
        casoPara(c, {
            fecha: '2026-08-01',
            base: 500_000,
            clienteId: CLIENTE_EXT,
            sucursalId: SUCURSAL_CENTRO,
          }, [previa('2026-06-01', 500_000)],
          cliente(CLIENTE_EXT, 'identidad_alterna'),
        ),
        c,
      )

      expect(ev.resultadoAviso).toBe('acumulacion')
      expect(ev.requiereRevisionIdentidad).toBe(true)
    })

    it('A-06 · proximidad por suma de ventana, no solo por operación', async () => {
      const c = await config('2026-07-15')
      // 430,000 + 430,000 = 860,000. Menos que 941,412.75 pero ≥ 847,271.48.
      const ev = evaluar(
        casoPara(c, { fecha: '2026-07-15', base: 430_000 }, [
          previa('2026-06-15', 430_000),
        ]),
        c,
      )

      expect(ev.resultadoAviso).toBe('no')
      expect(ev.alertaProximidad).toBe(true)
      expect(ev.sumaVentana).toBe(mxn(860_000))
    })

    it('A-XX · solo acumulan las operaciones que caen en el supuesto de identificación', async () => {
      const c = await config('2026-05-15')
      // Regla del webinar SAT-UIF: a la suma solo entran los actos que
      // INDIVIDUALMENTE se ubican en el supuesto de identificación. En V Bis
      // eso es todo, pero el motor no puede darlo por hecho: la Fr. XV tiene
      // umbral de identificación y ahí sí discrimina.
      const ev = evaluar(
        casoPara(c, { fecha: '2026-05-15', base: 400_000 }, [
          previa('2026-03-15', 400_000, true),
          previa('2026-04-15', 400_000, false), // no cae en el supuesto
        ]),
        c,
      )

      expect(ev.sumaVentana).toBe(mxn(800_000))
      expect(ev.resultadoAviso).toBe('no')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Registro defendible
  // ═══════════════════════════════════════════════════════════════════════
  describe('insumos de la evaluación', () => {
    it('registra la UMA, el catálogo y los umbrales usados', async () => {
      const c = await config('2026-02-15')
      const ev = evaluar(casoPara(c, { fecha: '2026-02-15', base: 500_000 }), c)

      // Sin esto no hay forma de explicar el cálculo tres años después.
      expect(ev.insumos.uma).toBe(11_731)
      expect(ev.insumos.umaVigenteDesde).toBe('2026-02-01')
      expect(ev.insumos.catalogoVersion).toHaveLength(64) // sha256 hex
      expect(ev.insumos.ventanaMeses).toBe(6)
      expect(ev.insumos.umbralesAplicados.length).toBeGreaterThanOrEqual(3)
      expect(ev.motivo).toBeTruthy()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Casos que dependen de la Fracción XV (semana 11)
  // ═══════════════════════════════════════════════════════════════════════
  describe('agnosticismo de fracción', () => {
    it.todo('A-04 · fracciones independientes: V Bis y XV nunca se suman entre sí')
    it.todo('X-01 · Fr. XV evaluada correctamente sin tocar el motor')
    // Ambos requieren la Fr. XV cargada en el catálogo, que es parte de la
    // prueba de diseño de la semana 11: darla de alta SOLO con INSERTs.
    // Escribirlos ahora con la fracción ausente probaría el cargador, no el
    // agnosticismo.
  })
})

// ═════════════════════════════════════════════════════════════════════════
// Casos del pipeline del aviso — semanas 9 y 10, no del motor
// ═════════════════════════════════════════════════════════════════════════
describe('pipeline del aviso (semanas 9-10)', () => {
  it.todo('P-00 · el ejemplo oficial corregido valida contra el XSD')
  it.todo('P-01 · el XML del periodo valida contra din.xsd')
  it.todo('P-02 · informe en cero: un informe sin avisos, y también valida')
  it.todo('P-03 · un capturista no puede aprobar')
  it.todo('P-04 · el admin aprueba y queda en bitácora')
  it.todo('P-05 · fragmentación por el límite de 2 MB del SPPLD')
})
