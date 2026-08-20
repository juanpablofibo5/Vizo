import { describe, expect, it } from 'vitest'
import {
  ConfiguracionInvalida,
  ExcepcionSinContrastar,
  InsumoIncoherente,
  determinarBeneficiarioControlador,
  type ConfiguracionBeneficiarioControlador,
  type ControlPorOtrosMedios,
  type FuncionarioAltaDireccion,
  type InsumosBeneficiarioControlador,
  type InsumosFideicomiso,
  type InsumosPersonaMoral,
  type TenenciaCapital,
} from '../../src/dominio/beneficiario-controlador'

/**
 * El orden de prelación del Beneficiario Controlador (Art. 23 Quinquies y 23
 * Quinquies 1 del Acuerdo 115/2026).
 *
 * El caso que justifica la suite: el orden es literal y en cascada — I antes
 * que II, II antes que III — y el Art. 23 Quinquies obliga a documentar el
 * PROCEDIMIENTO, no solo el resultado. Cada prueba de la cascada verifica
 * también el `camino`: que la fracción que no resolvió quedó registrada como
 * `sin_resultado` antes de avanzar.
 */

// El umbral Y su inclusividad SIEMPRE llegan en la configuración — regla dura
// 1. Nunca 25 ni el operador de comparación escritos en el módulo bajo
// prueba; aquí son datos de la prueba, no del código de producción. `true`
// es la lectura del Art. 23 Quinquies, fr. I: "25% o más" (inclusivo).
const CONFIG: ConfiguracionBeneficiarioControlador = {
  umbralControlPct: 25,
  umbralControlInclusivo: true,
}

function personaMoral(insumos: InsumosPersonaMoral): InsumosBeneficiarioControlador {
  return { sujeto: { tipo: 'persona_moral', insumos } }
}

const SIN_CONTROL_II: readonly ControlPorOtrosMedios[] = []
const FUNCIONARIO_UNICO: readonly FuncionarioAltaDireccion[] = [
  { titularId: 'func-1', esGrupo: false, cargo: 'Director General', rango: 1 },
]

describe('Fracción I — tenencia de capital, directa e indirecta', () => {
  it('un titular con 30% directo se determina en la fracción I', () => {
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 30, via: 'directa' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    expect(r.tipo).toBe('persona_moral')
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('I')
    expect(r.beneficiarios).toEqual([
      { titularId: 'socio-1', esGrupo: false, fraccion: 'I', base: expect.stringContaining('30%') },
    ])
  })

  it('participación indirecta: 18% directo + 13% a través de otra moral suman 31% y cruzan el umbral', () => {
    // Ninguna de las dos partes por separado alcanza el 25%. Es la suma la
    // que cruza — el caso que el "directa o indirectamente" del texto exige
    // que este módulo sepa combinar.
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 18, via: 'directa' },
      { titularId: 'socio-1', esGrupo: false, porcentaje: 13, via: 'indirecta', intermediarioId: 'holding-a' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('I')
    expect(r.beneficiarios).toHaveLength(1)
    expect(r.beneficiarios[0]?.base).toContain('18% directo')
    expect(r.beneficiarios[0]?.base).toContain('13% indirecto')
  })

  it('participación indirecta que por sí sola NO cruza el umbral no determina nada (sin la directa)', () => {
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 13, via: 'indirecta', intermediarioId: 'holding-a' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('III')
  })

  it('dos titulares que cruzan el 25% de forma independiente: ambos son Beneficiario Controlador', () => {
    // La fracción I no dice "el mayor", dice "identificar a la persona
    // física o grupo": si más de una cruza el umbral, todas cuentan.
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 40, via: 'directa' },
      { titularId: 'socio-2', esGrupo: false, porcentaje: 26, via: 'directa' },
      { titularId: 'socio-3', esGrupo: false, porcentaje: 20, via: 'directa' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.beneficiarios.map((b) => b.titularId).sort()).toEqual(['socio-1', 'socio-2'])
  })

  it('un grupo de personas físicas actuando en conjunto se identifica como tal, no como individuo', () => {
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'grupo-familia-lopez', esGrupo: true, porcentaje: 35, via: 'directa' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.beneficiarios).toEqual([
      { titularId: 'grupo-familia-lopez', esGrupo: true, fraccion: 'I', base: expect.any(String) },
    ])
  })

  it('EL BORDE DONDE EL ART. 23 QUINQUIES Y EL ART. 3 FR. IV DISCREPAN: exactamente 25.00% de capital', () => {
    // El Art. 23 Quinquies, fr. I ("25% o más de la composición accionaria")
    // es INCLUSIVO y cuenta el 25.00% exacto. El Art. 3, fr. IV, inciso b)
    // ii) de la Ley ("más del 25%" del VOTO) es exclusivo y en este mismo
    // borde daría la respuesta contraria. No "corrijas" este resultado a `>`
    // sin releer por qué son dos artículos distintos — ver el comentario de
    // cabecera del módulo.
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 25, via: 'directa' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG, // umbralControlInclusivo: true — la lectura de la fr. I, no la del Art. 3.
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('I')
  })

  it('el mismo borde de 25.00%, pero con la configuración marcada como EXCLUSIVA, no determina en la fracción I', () => {
    // Prueba de que la inclusividad realmente viene de la configuración y no
    // es un ">=" fijo disfrazado: con `umbralControlInclusivo: false` (la
    // lectura "más del 25%"), el mismo 25.00% exacto que sí determinaba
    // arriba deja de alcanzar, y el caso avanza a la fracción III.
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 25, via: 'directa' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      { umbralControlPct: 25, umbralControlInclusivo: false },
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('III')
  })

  it('EL NÚMERO TAMBIÉN VIENE DEL CATÁLOGO: con el umbral en 30%, el 25% deja de determinar', () => {
    // HALLAZGO DE LA INTEGRACIÓN, 20-ago-2026.
    //
    // La suite protegía el OPERADOR —hay una prueba que muere si la
    // inclusividad se fija en el código— pero no el NÚMERO: al sustituir
    // `configuracion.umbralControlPct` por un `25` literal, las treinta
    // pruebas seguían en verde. Es decir que la mitad de la regla dura 1
    // estaba parametrizada solo de adorno: nada obligaba a leerla.
    //
    // Este caso lo vuelve exigible. Si alguien escribe el umbral en el
    // código, aquí muere.
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 25, via: 'directa' },
    ]
    const insumos = personaMoral({
      tenenciasCapital: tenencias,
      controlPorOtrosMedios: SIN_CONTROL_II,
      funcionariosAltaDireccion: FUNCIONARIO_UNICO,
    })

    // Con el umbral vigente del Art. 23 Quinquies (25%), determina en fr. I.
    const conVeinticinco = determinarBeneficiarioControlador(insumos, CONFIG)
    if (conVeinticinco.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(conVeinticinco.fraccionAplicada).toBe('I')

    // Con un umbral distinto en el catálogo, el MISMO insumo cambia de
    // fracción. Si el número estuviera en el código, esto no pasaría.
    const conTreinta = determinarBeneficiarioControlador(insumos, {
      umbralControlPct: 30,
      umbralControlInclusivo: true,
    })
    if (conTreinta.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(conTreinta.fraccionAplicada).toBe('III')
  })

  it('24.99% no cruza el umbral y cae a la fracción II o III', () => {
    const tenencias: readonly TenenciaCapital[] = [
      { titularId: 'socio-1', esGrupo: false, porcentaje: 24.99, via: 'directa' },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: tenencias, controlPorOtrosMedios: SIN_CONTROL_II, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('III')
  })
})

describe('El orden literal I → II → III, con el camino como evidencia', () => {
  it('sin nadie en la fracción I, se evalúa y determina en la fracción II — y el camino documenta el salto', () => {
    const control: readonly ControlPorOtrosMedios[] = [
      {
        titularId: 'apoderado-1',
        esGrupo: false,
        medio: 'poder general para actos de dominio y veto estatutario',
        areasControladas: ['estrategia', 'toma_de_decisiones'],
      },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: [], controlPorOtrosMedios: control, funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('II')
    expect(r.beneficiarios).toEqual([
      { titularId: 'apoderado-1', esGrupo: false, fraccion: 'II', base: expect.any(String) },
    ])

    // El camino es el dato estructurado que exige el artículo: qué se evaluó
    // y por qué se avanzó, no solo el resultado final.
    expect(r.camino).toHaveLength(2)
    expect(r.camino[0]).toMatchObject({ fraccion: 'I', resultado: 'sin_resultado' })
    expect(r.camino[0]).toHaveProperty('tenenciasEvaluadas', [])
    expect(r.camino[1]).toMatchObject({ fraccion: 'II', resultado: 'determinado' })
    expect(r.camino[1]).toHaveProperty('controlEvaluado', control)
  })

  it('sin nadie en I ni en II, se determina en la III — el camino documenta las tres fracciones', () => {
    const r = determinarBeneficiarioControlador(
      personaMoral({
        tenenciasCapital: [],
        controlPorOtrosMedios: [],
        funcionariosAltaDireccion: FUNCIONARIO_UNICO,
      }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.fraccionAplicada).toBe('III')
    expect(r.beneficiarios).toEqual([
      { titularId: 'func-1', esGrupo: false, fraccion: 'III', base: expect.any(String) },
    ])
    expect(r.camino.map((p) => p.fraccion)).toEqual(['I', 'II', 'III'])
    expect(r.camino[0]?.resultado).toBe('sin_resultado')
    expect(r.camino[1]?.resultado).toBe('sin_resultado')
    expect(r.camino[2]?.resultado).toBe('determinado')
  })

  it('con alguien en la fracción I, NO se evalúa ni II ni III: el camino trae un solo paso', () => {
    const r = determinarBeneficiarioControlador(
      personaMoral({
        tenenciasCapital: [{ titularId: 'socio-1', esGrupo: false, porcentaje: 60, via: 'directa' }],
        controlPorOtrosMedios: SIN_CONTROL_II,
        funcionariosAltaDireccion: FUNCIONARIO_UNICO,
      }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.camino).toHaveLength(1)
    expect(r.camino[0]).toMatchObject({ fraccion: 'I', resultado: 'determinado' })
  })
})

describe('Fracción III — funcionario de mayor grado, con empate', () => {
  it('dos funcionarios comparten el rango 1: el texto no rompe el empate, ambos cuentan', () => {
    const funcionarios: readonly FuncionarioAltaDireccion[] = [
      { titularId: 'director-general', esGrupo: false, cargo: 'Director General', rango: 1 },
      { titularId: 'director-operaciones', esGrupo: false, cargo: 'Director de Operaciones', rango: 1 },
      { titularId: 'gerente', esGrupo: false, cargo: 'Gerente', rango: 2 },
    ]
    const r = determinarBeneficiarioControlador(
      personaMoral({ tenenciasCapital: [], controlPorOtrosMedios: [], funcionariosAltaDireccion: funcionarios }),
      CONFIG,
    )
    if (r.tipo !== 'persona_moral') throw new Error('inesperado')
    expect(r.beneficiarios.map((b) => b.titularId).sort()).toEqual([
      'director-general',
      'director-operaciones',
    ])
  })
})

describe('Fideicomisos — Art. 23 Quinquies 1: control efectivo, con descenso', () => {
  const fideicomiso = (insumos: InsumosFideicomiso): InsumosBeneficiarioControlador => ({
    sujeto: { tipo: 'fideicomiso', insumos },
  })

  const SIN_FACULTADES = {
    disponerAdministrarDirigirBienes: false,
    instruirAutorizarDistribuciones: false,
    modificarOExtinguirFideicomiso: false,
    nombrarORemoverAdministracion: false,
    imponerDecisionesDeOperacionOAdministracion: false,
  }

  it('una persona física fiduciaria con UNA sola facultad de control efectivo se determina directamente', () => {
    const r = determinarBeneficiarioControlador(
      fideicomiso({
        partes: [
          {
            titularId: 'fiduciario-1',
            rol: 'fiduciario',
            tipoPersona: 'fisica',
            facultades: { ...SIN_FACULTADES, nombrarORemoverAdministracion: true },
          },
        ],
      }),
      CONFIG,
    )
    expect(r.tipo).toBe('fideicomiso')
    if (r.tipo !== 'fideicomiso') throw new Error('inesperado')
    expect(r.beneficiarios).toEqual([
      { titularId: 'fiduciario-1', rolOriginal: 'fiduciario', viaDescenso: false, base: expect.any(String) },
    ])
  })

  it('una persona física SIN ninguna facultad marcada no cuenta como Beneficiario Controlador', () => {
    const r = determinarBeneficiarioControlador(
      fideicomiso({
        partes: [
          { titularId: 'fideicomisario-pasivo', rol: 'fideicomisario', tipoPersona: 'fisica', facultades: SIN_FACULTADES },
          {
            titularId: 'fideicomitente-activo',
            rol: 'fideicomitente',
            tipoPersona: 'fisica',
            facultades: { ...SIN_FACULTADES, modificarOExtinguirFideicomiso: true },
          },
        ],
      }),
      CONFIG,
    )
    if (r.tipo !== 'fideicomiso') throw new Error('inesperado')
    expect(r.beneficiarios.map((b) => b.titularId)).toEqual(['fideicomitente-activo'])
  })

  it('cuando quien controla es persona moral, DESCIENDE aplicando el Art. 23 Quinquies hasta la persona física', () => {
    const r = determinarBeneficiarioControlador(
      fideicomiso({
        partes: [
          {
            titularId: 'fideicomitente-corporativo',
            rol: 'fideicomitente',
            tipoPersona: 'moral',
            facultades: { ...SIN_FACULTADES, disponerAdministrarDirigirBienes: true },
            insumosPersonaMoral: {
              tenenciasCapital: [{ titularId: 'duena-final', esGrupo: false, porcentaje: 51, via: 'directa' }],
              controlPorOtrosMedios: [],
              funcionariosAltaDireccion: FUNCIONARIO_UNICO,
            },
          },
        ],
      }),
      CONFIG,
    )
    if (r.tipo !== 'fideicomiso') throw new Error('inesperado')
    expect(r.beneficiarios).toHaveLength(1)
    const b = r.beneficiarios[0]
    // El resultado final es la PERSONA FÍSICA encontrada por el descenso, no
    // la persona moral que aparecía como parte del fideicomiso.
    expect(b?.titularId).toBe('duena-final')
    expect(b?.rolOriginal).toBe('fideicomitente')
    expect(b?.viaDescenso).toBe(true)
    expect(b?.caminoDescenso?.fraccionAplicada).toBe('I')
    expect(b?.caminoDescenso?.beneficiarios[0]?.titularId).toBe('duena-final')
  })

  it('persona moral con control efectivo pero SIN insumosPersonaMoral: el descenso no se puede completar, se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        fideicomiso({
          partes: [
            {
              titularId: 'fideicomitente-corporativo',
              rol: 'fideicomitente',
              tipoPersona: 'moral',
              facultades: { ...SIN_FACULTADES, disponerAdministrarDirigirBienes: true },
              // insumosPersonaMoral ausente: el descenso del Art. 23 Quinquies
              // 1, segundo párrafo, no tiene con qué completarse.
            },
          ],
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('ninguna parte del fideicomiso tiene control efectivo: no hay resultado por defecto, se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        fideicomiso({
          partes: [
            { titularId: 'fideicomisario-1', rol: 'fideicomisario', tipoPersona: 'fisica', facultades: SIN_FACULTADES },
          ],
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('un fideicomiso sin ninguna parte capturada se detiene, no asume que no hay Beneficiario Controlador', () => {
    expect(() => determinarBeneficiarioControlador(fideicomiso({ partes: [] }), CONFIG)).toThrow(
      InsumoIncoherente,
    )
  })
})

describe('El Art. 23 Quinquies 2 (excepciones) queda fuera de alcance', () => {
  it('bolsa de valores reconocida: se detiene con un error accionable, nunca calcula un resultado', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        {
          excepcion: { tipo: 'bolsa_reconocida', detalle: 'cotiza en la BMV, clave de pizarra XYZ' },
          sujeto: {
            tipo: 'persona_moral',
            insumos: { tenenciasCapital: [], controlPorOtrosMedios: [], funcionariosAltaDireccion: FUNCIONARIO_UNICO },
          },
        },
        CONFIG,
      ),
    ).toThrow(ExcepcionSinContrastar)
  })

  it('anexo excluido: mismo error, mismo criterio — no se sustituye por un resultado vacío o por defecto', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        {
          excepcion: { tipo: 'anexo_excluido', detalle: 'Anexo 6 Bis' },
          sujeto: { tipo: 'fideicomiso', insumos: { partes: [] } },
        },
        CONFIG,
      ),
    ).toThrow(ExcepcionSinContrastar)
  })
})

describe('Configuración e insumos incoherentes — regla dura 6: se detiene, no asume', () => {
  it('umbral de configuración en 0 se detiene: el catálogo no puede pedir "0% o más"', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({ tenenciasCapital: [], controlPorOtrosMedios: [], funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
        { umbralControlPct: 0, umbralControlInclusivo: true },
      ),
    ).toThrow(ConfiguracionInvalida)
  })

  it('umbral de configuración por encima de 100 se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({ tenenciasCapital: [], controlPorOtrosMedios: [], funcionariosAltaDireccion: FUNCIONARIO_UNICO }),
        { umbralControlPct: 101, umbralControlInclusivo: true },
      ),
    ).toThrow(ConfiguracionInvalida)
  })

  it('un porcentaje de tenencia negativo o mayor a 100 se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [{ titularId: 'socio-1', esGrupo: false, porcentaje: -5, via: 'directa' }],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [{ titularId: 'socio-1', esGrupo: false, porcentaje: 150, via: 'directa' }],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('una tenencia indirecta sin "intermediarioId" se detiene: falta la cadena que documenta el procedimiento', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [{ titularId: 'socio-1', esGrupo: false, porcentaje: 30, via: 'indirecta' }],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('la suma de tenencias DIRECTAS declaradas por encima de 100% del capital se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [
            { titularId: 'socio-1', esGrupo: false, porcentaje: 60, via: 'directa' },
            { titularId: 'socio-2', esGrupo: false, porcentaje: 55, via: 'directa' },
          ],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('el mismo titular marcado como grupo en una tenencia e individual en otra es un dato incoherente', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [
            { titularId: 'x', esGrupo: true, porcentaje: 10, via: 'directa' },
            { titularId: 'x', esGrupo: false, porcentaje: 20, via: 'indirecta', intermediarioId: 'holding' },
          ],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('un candidato de la fracción II sin ninguna área controlada se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [],
          controlPorOtrosMedios: [{ titularId: 'apoderado-1', esGrupo: false, medio: 'poder notarial', areasControladas: [] }],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('la fracción III vacía cuando I y II no resolvieron nada se detiene: siempre debe haber alguien', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({ tenenciasCapital: [], controlPorOtrosMedios: [], funcionariosAltaDireccion: [] }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('un rango no entero o no positivo en la fracción III se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: [{ titularId: 'func-1', esGrupo: false, cargo: 'Director', rango: 0 }],
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: [{ titularId: 'func-1', esGrupo: false, cargo: 'Director', rango: 1.5 }],
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })

  it('un titularId vacío en cualquier fracción se detiene', () => {
    expect(() =>
      determinarBeneficiarioControlador(
        personaMoral({
          tenenciasCapital: [{ titularId: '  ', esGrupo: false, porcentaje: 30, via: 'directa' }],
          controlPorOtrosMedios: [],
          funcionariosAltaDireccion: FUNCIONARIO_UNICO,
        }),
        CONFIG,
      ),
    ).toThrow(InsumoIncoherente)
  })
})
