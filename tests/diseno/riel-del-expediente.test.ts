import { describe, expect, test } from 'vitest'
import {
  rielAprobacion,
  rielGradoDeRiesgo,
  rielPep,
  rielPerfil,
  rielRevisionAnual,
  rielExpediente,
  peorEstado,
  peorTono,
  rielBeneficiario,
  seccionAbiertaPorDefecto,
} from '../../app/componentes/riel'
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
  pisoPepExtranjera: false,
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


describe('el expediente como píldora (completo NO es aprobado)', () => {
  test('13 de 13 sin aprobar no se pinta de verde', () => {
    const r = rielExpediente({ estatus: 'completo', cubiertos: 13, totalObligatorios: 13 })
    expect(r).toMatchObject({ estado: 'Falta aprobar', tono: 'aviso' })
  })

  test('aprobado sí', () => {
    expect(
      rielExpediente({ estatus: 'aprobado', cubiertos: 13, totalObligatorios: 13 }).tono,
    ).toBe('ok')
  })

  test('incompleto es rojo y dice la cuenta', () => {
    const r = rielExpediente({ estatus: 'incompleto', cubiertos: 4, totalObligatorios: 13 })
    expect(r).toMatchObject({ estado: 'Incompleto', tono: 'critico', reloj: '4 de 13' })
  })

  test('sin evaluar no es «completo»: es no saber qué falta', () => {
    const r = rielExpediente({ estatus: 'abierto', cubiertos: null, totalObligatorios: null })
    expect(r).toMatchObject({ estado: 'Sin evaluar', tono: 'neutro' })
  })

  test('sin expediente abierto (ADR-24) lo dice, no lo esconde', () => {
    expect(rielExpediente({ estatus: null, cubiertos: null, totalObligatorios: null }).estado).toBe(
      'Sin abrir',
    )
  })
})

describe('el resumen de la lista se queda con lo más grave', () => {
  const e = (tono: 'ok' | 'aviso' | 'critico' | 'neutro', estado: string) => ({
    estado,
    tono,
    reloj: '',
  })

  test('un rojo gana a todo lo demás', () => {
    expect(
      peorEstado([e('ok', 'Vigente'), e('neutro', 'Sin evaluar'), e('critico', 'Vencida')]).estado,
    ).toBe('Vencida')
  })

  test('un ámbar gana a un verde y a un neutro', () => {
    expect(peorEstado([e('ok', 'Vigente'), e('aviso', 'Alto'), e('neutro', '—')]).estado).toBe('Alto')
  })

  test('neutro NUNCA tapa un ámbar — es el caso que haría mentir a la lista', () => {
    expect(peorTono(['neutro', 'aviso'])).toBe('aviso')
    expect(peorTono(['neutro', 'critico'])).toBe('critico')
  })

  test('pero un verde sí gana al neutro: en regla no se ve igual que sin evaluar', () => {
    expect(peorTono(['neutro', 'ok'])).toBe('ok')
  })
})

describe('El Beneficiario Controlador en una palabra', () => {
  const base = { requiere: true, vigente: null, anticipado: false, exigibleDesde: '2027-03-01' }

  test('a una persona física NO se le pide este procedimiento', () => {
    const r = rielBeneficiario({ ...base, requiere: false })
    expect(r.tono).toBe('neutro')
    expect(r.estado).toBe('No aplica')
  })

  test('sin identificar y ya exigible es ROJO: el acto no espera', () => {
    expect(rielBeneficiario(base).tono).toBe('critico')
  })

  test('sin identificar pero ANTES del 1 de marzo de 2027 es neutro, no rojo', () => {
    const r = rielBeneficiario({ ...base, anticipado: true })
    expect(r.tono).toBe('neutro')
    expect(r.reloj).toMatch(/2027-03-01/)
  })

  test('la EXCEPCIÓN del Art. 23 Quinquies 2 sale verde: libera de recabar, no es un hueco', () => {
    const r = rielBeneficiario({
      ...base,
      vigente: { via: 'excepcion', fechaIdentificacion: '2027-04-01', hallazgos: [] },
    })
    expect(r.tono).toBe('ok')
    expect(r.estado).toBe('Exceptuado')
  })

  test('UN PROCEDIMIENTO SIN NINGUNA PERSONA no es verde: el capítulo pide llegar a una física', () => {
    const r = rielBeneficiario({
      ...base,
      vigente: { via: 'prelacion_persona_moral', fechaIdentificacion: '2027-04-01', hallazgos: [] },
    })
    expect(r.tono).toBe('aviso')
    expect(r.estado).toBe('Sin resultado')
  })

  test('con hallazgo, verde — y sin inventarle un vencimiento que el artículo no da', () => {
    const r = rielBeneficiario({
      ...base,
      vigente: { via: 'prelacion_persona_moral', fechaIdentificacion: '2027-04-01', hallazgos: [{}] },
    })
    expect(r.tono).toBe('ok')
    expect(r.reloj).not.toMatch(/vence|Vence/)
  })
})
