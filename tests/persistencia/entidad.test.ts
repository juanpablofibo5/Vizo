import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  activarModelo,
  agregarFactor,
  crearModelo,
  definirGrado,
} from '../../src/persistencia/riesgo'
import {
  agregarMitigante,
  declararMetodoEntidad,
  definirNivelEfectividad,
  estadoDeLaEntidad,
  evaluarEntidadYRegistrar,
} from '../../src/persistencia/entidad'
import {
  MetodoDeEntidadDesconocido,
  MitiganteSinCobertura,
  MitiganteSinEfectividad,
  evaluarEntidad,
  type ConfiguracionEntidad,
} from '../../src/dominio/entidad'

const HOY = '2027-03-15'

/**
 * La evaluación de ENTIDAD (ADR-28): el riesgo del propio obligado, del que
 * cuelga su tipo de auditoría (Arts. 44/45 del Acuerdo 115/2026).
 *
 * Lo que estas pruebas protegen es la frontera del ADR-21 en su versión de
 * entidad: sin configuración el sistema NO evalúa y NO escribe, un mitigante a
 * medias DETIENE en vez de contar cero, y el tope por elemento es estructural
 * — la resta no produce exposiciones negativas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// El motor puro, sin base
// ─────────────────────────────────────────────────────────────────────────────

const ESCALA = [
  { id: 'g1', clave: 'bajo', orden: 1, esAlto: false, puntajeMinimo: 0 },
  { id: 'g2', clave: 'medio', orden: 2, esAlto: false, puntajeMinimo: 35 },
  { id: 'g3', clave: 'alto', orden: 3, esAlto: true, puntajeMinimo: 70 },
] as const

const CUATRO = ['actos_operaciones', 'geografia', 'tipo_cliente', 'transacciones_canales'] as const

const base = (extra?: Partial<ConfiguracionEntidad>): ConfiguracionEntidad => ({
  modeloId: 'm1',
  metodoEntidad: 'residual_por_elemento',
  elementos: CUATRO,
  pesosPorElemento: {
    actos_operaciones: 25,
    geografia: 25,
    tipo_cliente: 25,
    transacciones_canales: 25,
  },
  mitigantes: [],
  escala: ESCALA,
  ...extra,
})

describe('El motor de entidad', () => {
  it('sin método declarado devuelve el hueco, nunca un método supuesto', () => {
    const r = evaluarEntidad(base({ metodoEntidad: null }))
    expect(r).toEqual({ estado: 'sin_configuracion', falta: 'metodo_entidad' })
  })

  it('ante un método que no conoce se detiene: de aquí cuelga la auditoría', () => {
    expect(() => evaluarEntidad(base({ metodoEntidad: 'promedio_magico' }))).toThrow(
      MetodoDeEntidadDesconocido,
    )
  })

  it('sin pesos por elemento o sin escala, el hueco correspondiente', () => {
    expect(evaluarEntidad(base({ pesosPorElemento: {} }))).toEqual({
      estado: 'sin_configuracion',
      falta: 'pesos_elemento',
    })
    expect(evaluarEntidad(base({ escala: [] }))).toEqual({
      estado: 'sin_configuracion',
      falta: 'escala',
    })
  })

  it('un mitigante sin nivel DETIENE: cero sería decidir que sus políticas no mitigan', () => {
    const config = base({
      mitigantes: [
        { id: 'm', descripcion: 'Doble revisión', elementos: ['tipo_cliente'], nivel: null },
      ],
    })
    expect(() => evaluarEntidad(config)).toThrow(MitiganteSinEfectividad)
  })

  it('un mitigante sin cobertura tampoco pasa: su valor no tiene dónde aplicarse', () => {
    const config = base({
      mitigantes: [
        {
          id: 'm',
          descripcion: 'Política flotante',
          elementos: [],
          nivel: { id: 'n', clave: 'auditado', orden: 3, valor: 20 },
        },
      ],
    })
    expect(() => evaluarEntidad(config)).toThrow(MitiganteSinCobertura)
  })

  it('evalúa: inherente 100, mitigación 20 sobre un elemento, residual 80 → alto → externa obligatoria', () => {
    const r = evaluarEntidad(
      base({
        mitigantes: [
          {
            id: 'm',
            descripcion: 'Doble revisión',
            elementos: ['tipo_cliente'],
            nivel: { id: 'n', clave: 'auditado', orden: 3, valor: 20 },
          },
        ],
      }),
    )
    expect(r.estado).toBe('evaluado')
    if (r.estado !== 'evaluado') return
    expect(r.inherente).toBe(100)
    expect(r.mitigacion).toBe(20)
    expect(r.residual).toBe(80)
    expect(r.gradoClave).toBe('alto')
    expect(r.auditoria).toBe('externa_obligatoria')
  })

  it('el tope es estructural: la mitigación declarada que excede el elemento no abarata a los demás', () => {
    // Dos mitigantes de 20 sobre un elemento que vale 25: declaran 40, aplican
    // 25, y el elemento queda en cero — nunca en −15 restándole a otros.
    const nivel = { id: 'n', clave: 'auditado', orden: 3, valor: 20 }
    const r = evaluarEntidad(
      base({
        mitigantes: [
          { id: 'm1', descripcion: 'Uno', elementos: ['geografia'], nivel },
          { id: 'm2', descripcion: 'Dos', elementos: ['geografia'], nivel },
        ],
      }),
    )
    expect(r.estado).toBe('evaluado')
    if (r.estado !== 'evaluado') return
    const geo = r.porElemento.find((e) => e.elemento === 'geografia')
    expect(geo?.mitigacionDeclarada).toBe(40)
    expect(geo?.mitigacionAplicada).toBe(25)
    expect(geo?.residual).toBe(0)
    expect(r.residual).toBe(75)
    expect(r.gradoClave).toBe('alto')
  })

  it('con residual bajo el corte de alto, la auditoría interna queda permitida', () => {
    const nivel = { id: 'n', clave: 'auditado', orden: 3, valor: 20 }
    const r = evaluarEntidad(
      base({
        mitigantes: CUATRO.map((e, i) => ({
          id: `m${String(i)}`,
          descripcion: `Mitigante ${e}`,
          elementos: [e],
          nivel,
        })),
      }),
    )
    expect(r.estado).toBe('evaluado')
    if (r.estado !== 'evaluado') return
    expect(r.residual).toBe(20)
    expect(r.gradoClave).toBe('bajo')
    expect(r.auditoria).toBe('interna_permitida')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// De punta a punta, contra la base
// ─────────────────────────────────────────────────────────────────────────────

describe('La evaluación de entidad del obligado', () => {
  let db: Client
  let admin: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
  })

  const escalaCompleta = async () => {
    await definirGrado(db, { sesion: admin, clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion: admin, clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion: admin, clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70, vigenteDesde: '2027-03-01' })
  }

  /** Deja un modelo vigente con método de entidad, pesos completos y un nivel. */
  const metodologiaLista = async (p?: { mitiganteConNivel?: boolean }) => {
    await escalaCompleta()
    const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    await declararMetodoEntidad(db, { sesion: admin, modeloId, metodo: 'residual_por_elemento' })

    const el = await db.query(`select id::text, clave from elementos_riesgo order by clave`)
    const elementos = el.rows as { id: string; clave: string }[]
    const tipoCliente = elementos.find((e) => e.clave === 'tipo_cliente')
    if (tipoCliente === undefined) throw new Error('falta el elemento tipo_cliente del catálogo')

    await agregarFactor(db, {
      sesion: admin,
      modeloId,
      elementoId: tipoCliente.id,
      factor: 'Factor de prueba',
      peso: 10,
    })
    await enTransaccionDeSesion(db, admin, async () => {
      for (const e of elementos) {
        await db.query(
          `insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso)
           values ($1,$2,$3,25)`,
          [admin.tenantId, modeloId, e.id],
        )
      }
    })

    const { nivelId } = await definirNivelEfectividad(db, {
      sesion: admin,
      modeloId,
      orden: 1,
      clave: 'documentado',
      nombre: 'Documentado',
      evidenciaExigible: 'Política escrita en el Manual, con apartado citado.',
      valor: 5,
    })
    const { nivelId: auditado } = await definirNivelEfectividad(db, {
      sesion: admin,
      modeloId,
      orden: 2,
      clave: 'auditado',
      nombre: 'Auditado',
      evidenciaExigible: 'Política aplicada y verificada, con constancia.',
      valor: 20,
    })

    await agregarMitigante(db, {
      sesion: admin,
      modeloId,
      descripcion: 'Doble revisión del expediente antes de operar.',
      efecto: 'Reduce la exposición del elemento tipo de cliente.',
      elementoIds: [tipoCliente.id],
      ...(p?.mitiganteConNivel === false ? {} : { nivelId: auditado }),
      evidenciaRef: 'Manual §7.2',
    })

    await activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2027-03-01' })
    return { modeloId, nivelDocumentado: nivelId }
  }

  const evaluar = () =>
    evaluarEntidadYRegistrar(db, {
      sesion: admin,
      hoy: HOY,
      base: 'anio_completo',
      periodoInicio: '2026-01-01',
      periodoFin: '2026-12-31',
      totalClientes: 120,
      totalOperaciones: 350,
      montoOperadoCentavos: 5_000_000_00,
    })

  it('sin modelo vigente devuelve el hueco y NO escribe nada', async () => {
    const { resultado, evaluacionId } = await evaluar()
    expect(resultado.estado).toBe('sin_configuracion')
    expect(evaluacionId).toBeNull()
    const n = await db.query(
      `select count(*)::int as n from evaluaciones_entidad where tenant_id = $1`,
      [admin.tenantId],
    )
    expect((n.rows[0] as { n: number }).n).toBe(0)
  })

  it('de punta a punta: configura, activa, evalúa, y la fila decide la auditoría', async () => {
    await metodologiaLista()
    const { resultado, evaluacionId } = await evaluar()

    expect(resultado.estado).toBe('evaluado')
    if (resultado.estado !== 'evaluado') return
    expect(resultado.inherente).toBe(100)
    expect(resultado.mitigacion).toBe(20)
    expect(resultado.residual).toBe(80)
    expect(resultado.auditoria).toBe('externa_obligatoria')
    expect(evaluacionId).not.toBeNull()

    // La fila guarda la resta que la base no deja mentir, el camino completo,
    // y un vencimiento derivado del catálogo (12 meses), nunca tecleado.
    const fila = await db.query(
      `select riesgo_residual::text as residual, detalle,
              (vence = (current_date + interval '12 months')::date) as vence_del_catalogo
         from evaluaciones_entidad where id = $1`,
      [evaluacionId],
    )
    const f = fila.rows[0] as {
      residual: string
      detalle: { metodo: string; por_elemento: unknown[] }
      vence_del_catalogo: boolean
    }
    expect(Number(f.residual)).toBe(80)
    expect(f.detalle.metodo).toBe('residual_por_elemento')
    expect(f.detalle.por_elemento).toHaveLength(4)
    expect(f.vence_del_catalogo).toBe(true)

    // Y la pantalla la lee ya resuelta, con la consecuencia de los Arts. 44/45.
    const estado = await enTransaccionDeSesion(db, admin, () =>
      estadoDeLaEntidad(db, { sesion: admin, hoy: HOY }),
    )
    expect(estado.vigente?.auditoria).toBe('externa_obligatoria')
    expect(estado.vigente?.vencida).toBe(false)
    expect(estado.faltaParaEvaluar).toEqual([])
  })

  it('un mitigante sin nivel declarado detiene la evaluación y no escribe', async () => {
    await metodologiaLista({ mitiganteConNivel: false })
    await expect(evaluar()).rejects.toThrow(MitiganteSinEfectividad)
    const n = await db.query(
      `select count(*)::int as n from evaluaciones_entidad where tenant_id = $1`,
      [admin.tenantId],
    )
    expect((n.rows[0] as { n: number }).n).toBe(0)

    // Y el estado lo dice como hueco, con el mitigante nombrado.
    const estado = await enTransaccionDeSesion(db, admin, () =>
      estadoDeLaEntidad(db, { sesion: admin, hoy: HOY }),
    )
    expect(estado.faltaParaEvaluar.join(' ')).toContain('nivel de efectividad')
  })

  it('la fila asentada no se reescribe: es la que se opone a una revisión', async () => {
    await metodologiaLista()
    const { evaluacionId } = await evaluar()
    await expect(
      db.query(`update evaluaciones_entidad set riesgo_residual = 0, mitigacion_aplicada = 100 where id = $1`, [
        evaluacionId,
      ]),
    ).rejects.toThrow()
  })

  it('el método de entidad no se declara sobre un modelo ya vigente', async () => {
    const { modeloId } = await metodologiaLista()
    await expect(
      declararMetodoEntidad(db, { sesion: admin, modeloId, metodo: 'residual_por_elemento' }),
    ).rejects.toThrow(/borrador/)
  })
})
