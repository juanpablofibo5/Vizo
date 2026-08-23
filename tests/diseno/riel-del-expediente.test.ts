import { describe, expect, test } from 'vitest'
import {
  rielAprobacion,
  rielGradoDeRiesgo,
  rielPep,
  rielPerfil,
  rielPorConstruir,
  rielRevisionAnual,
  seccionAbiertaPorDefecto,
} from '../../app/clientes/[id]/expediente/riel'
import type { EstadoAprobacion } from '../../src/persistencia/aprobacion'
import type { EstadoPep } from '../../src/persistencia/pep'
import type { EstadoPerfil } from '../../src/persistencia/perfil'
import type { RiesgoDelCliente } from '../../src/persistencia/riesgo'

/**
 * El riel es el resumen de cumplimiento que un admin mira de reojo. Estas
 * pruebas guardan las celdas donde una palabra más tranquila que el estado
 * real sería una mentira silenciosa — el modo de falla de la regla dura 6,
 * aplicado a una pantalla.
 */

// ── Fábricas mínimas: solo lo que el riel lee ──────────────────────────

const riesgoBase = (v: Partial<RiesgoDelCliente>): RiesgoDelCliente =>
  ({
    puedeClasificar: true,
    faltaParaClasificar: [],
    factores: [],
    vigente: null,
    historico: [],
    reevaluacionMeses: 6,
    ...v,
  }) as RiesgoDelCliente

const evaluacion = (v: { esAlto: boolean; vencida: boolean }) => ({
  id: 'e1',
  grado: 'alto',
  gradoNombre: v.esAlto ? 'Alto' : 'Bajo',
  esAlto: v.esAlto,
  puntaje: 10,
  evaluadoEn: '2026-03-03T12:00:00',
  vence: '2026-09-03',
  vencida: v.vencida,
  aplicados: [],
  modeloVersion: 1,
})

const aprobacionBase = (v: Partial<EstadoAprobacion>): EstadoAprobacion =>
  ({
    exigencia: { estado: 'no_exigible', porque: 'no_es_pep' },
    via: 'consentimiento',
    aprobaciones: [],
    actosSinConsentir: [],
    actos: [],
    declaracionPepId: null,
    evaluacionRiesgoId: null,
    exigibleDesde: '2027-03-01',
    anticipado: false,
    ...v,
  }) as EstadoAprobacion

const perfilBase = (v: Partial<EstadoPerfil>): EstadoPerfil =>
  ({
    vigente: null,
    historial: [],
    plazos: { exigibleDesde: '2027-03-01', maduracionMeses: 6, reevaluacionMeses: 6 },
    reevaluacionDebida: false,
    reevaluableDesde: null,
    anticipado: true,
    actos: [],
    ...v,
  }) as EstadoPerfil

const pepBase = (v: Partial<EstadoPep>): EstadoPep =>
  ({
    declaracion: null,
    catalogado: false,
    motivo: 'sin_declaracion',
    exigibleDesde: '2026-11-30',
    anticipada: true,
    ...v,
  }) as EstadoPep

// ── Las celdas que no pueden mentir ────────────────────────────────────

describe('aprobación de directivo (la tabla de tres valores, en palabras)', () => {
  test('indeterminable NUNCA se pinta como «no requerida»', () => {
    const r = rielAprobacion(
      aprobacionBase({
        exigencia: { estado: 'indeterminable', falta: ['caracter_pep'] },
      }),
    )
    expect(r.estado).toBe('No se sabe')
    expect(r.tono).toBe('aviso')
    expect(r.reloj).toContain('sin declaración PEP')
  })

  test('exigible con actos sin consentir es rojo — y el reloj cuenta actos', () => {
    const r = rielAprobacion(
      aprobacionBase({
        exigencia: { estado: 'exigible', conGradoVencido: false },
        actosSinConsentir: [{ id: 'op1' }, { id: 'op2' }] as never,
      }),
    )
    expect(r).toMatchObject({ estado: 'Falta aprobación', tono: 'critico' })
    expect(r.reloj).toBe('2 actos sin consentir')
  })

  test('lo mismo, anticipado, baja a ámbar: la omisión aún no corre', () => {
    const r = rielAprobacion(
      aprobacionBase({
        exigencia: { estado: 'exigible', conGradoVencido: false },
        actosSinConsentir: [{ id: 'op1' }] as never,
        anticipado: true,
      }),
    )
    expect(r.tono).toBe('aviso')
  })

  test('no exigible por no ser PEP dice por qué', () => {
    const r = rielAprobacion(aprobacionBase({}))
    expect(r).toMatchObject({ estado: 'No requerida', tono: 'neutro' })
    expect(r.reloj).toBe('no hay carácter PEP')
  })

  test('otorgada solo cuando hay una aprobación registrada', () => {
    const r = rielAprobacion(
      aprobacionBase({
        exigencia: { estado: 'exigible', conGradoVencido: false },
        aprobaciones: [{ fechaAprobacion: '2026-08-10' }] as never,
      }),
    )
    expect(r).toMatchObject({ estado: 'Otorgada', tono: 'ok' })
  })
})

describe('grado de riesgo (vencido nunca tranquiliza)', () => {
  test('un grado vencido no vuelve al verde, ni siquiera el bajo', () => {
    const r = rielGradoDeRiesgo(riesgoBase({ vigente: evaluacion({ esAlto: false, vencida: true }) }))
    expect(r.tono).toBe('aviso')
    expect(r.estado).toBe('Bajo · vencido')
  })

  test('el alto vigente es ámbar, no verde', () => {
    const r = rielGradoDeRiesgo(riesgoBase({ vigente: evaluacion({ esAlto: true, vencida: false }) }))
    expect(r).toMatchObject({ estado: 'Alto', tono: 'aviso' })
  })

  test('sin metodología no es «bajo»: es no poder clasificar', () => {
    const r = rielGradoDeRiesgo(riesgoBase({ puedeClasificar: false }))
    expect(r).toMatchObject({ estado: 'Sin metodología', tono: 'neutro' })
  })
})

describe('perfil transaccional (el hueco cambia de peso con la exigibilidad)', () => {
  test('sin perfil, anticipado: neutro con la fecha del Transitorio Cuarto', () => {
    const r = rielPerfil(perfilBase({}))
    expect(r.tono).toBe('neutro')
    expect(r.reloj).toContain('2027-03-01')
  })

  test('sin perfil, ya exigible: rojo — toda operación levanta alerta', () => {
    const r = rielPerfil(perfilBase({ anticipado: false }))
    expect(r).toMatchObject({ estado: 'Sin declarar', tono: 'critico' })
  })

  test('la reevaluación debida no se disfraza de «declarado»', () => {
    const r = rielPerfil(
      perfilBase({
        vigente: { fechaAncla: '2026-02-01' } as never,
        reevaluacionDebida: true,
        reevaluableDesde: '2026-08-01',
      }),
    )
    expect(r).toMatchObject({ estado: 'Reevaluación debida', tono: 'aviso' })
  })
})

describe('revisión anual y PEP', () => {
  test('vencida es rojo; vigente dice cuándo vence', () => {
    expect(
      rielRevisionAnual({ relacionNegocios: true, vence: '2026-08-01', hoy: '2026-08-23' }),
    ).toMatchObject({ estado: 'Vencida', tono: 'critico' })
    expect(
      rielRevisionAnual({ relacionNegocios: true, vence: '2026-11-12', hoy: '2026-08-23' }).reloj,
    ).toBe('vence el 2026-11-12')
  })

  test('sin declarar la relación no hay ciclo — y no es «al corriente»', () => {
    const r = rielRevisionAnual({ relacionNegocios: null, vence: null, hoy: '2026-08-23' })
    expect(r.tono).toBe('neutro')
    expect(r.estado).toBe('Sin declarar')
  })

  test('PEP por función es ámbar; negar es verde; caducada vuelve a ámbar', () => {
    expect(rielPep(pepBase({ motivo: 'por_funcion', catalogado: true })).tono).toBe('aviso')
    expect(rielPep(pepBase({ motivo: 'declaro_que_no' })).tono).toBe('ok')
    expect(rielPep(pepBase({ motivo: 'relojes_vencidos' })).tono).toBe('aviso')
  })

  test('persona moral: la sección lo dice en vez de esconderse', () => {
    expect(rielPep(null)).toMatchObject({ estado: 'No aplica', tono: 'neutro' })
  })
})

describe('la sección abierta por defecto es la más grave', () => {
  const s = (id: string, tono: 'ok' | 'aviso' | 'critico' | 'neutro') => ({ id, tono })

  test('un crítico gana aunque venga después de un ámbar', () => {
    expect(
      seccionAbiertaPorDefecto([s('a', 'aviso'), s('b', 'critico'), s('c', 'ok')]),
    ).toBe('b')
  })

  test('sin crítico, abre el primer ámbar', () => {
    expect(seccionAbiertaPorDefecto([s('a', 'ok'), s('b', 'aviso')])).toBe('b')
  })

  test('todo en orden: ninguna abierta, el riel cuenta la historia', () => {
    expect(seccionAbiertaPorDefecto([s('a', 'ok'), s('b', 'neutro')])).toBeNull()
  })

  test('las por construir (neutro) jamás amanecen abiertas', () => {
    expect(seccionAbiertaPorDefecto([s('cuestionario', 'neutro')])).toBeNull()
  })
})

describe('por construir', () => {
  test('cita la fecha del catálogo, no una escrita a mano', () => {
    expect(rielPorConstruir('2027-03-01').reloj).toBe('exigible desde el 2027-03-01')
  })
})
