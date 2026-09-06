import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import type { AreaDeControl } from '../dominio/beneficiario-controlador'

/**
 * La determinación humana de control efectivo — Fase 2 del plano (ADR-40).
 *
 * El «cuello de botella» que el diagrama pinta en naranja: decidir si un
 * convenio parasocial o un voto de calidad constituyen control efectivo no es
 * automatizable. Aquí la captura y la determinación son dos actos:
 *
 *   proponer → resolver (confirmada | rechazada, con fundamento obligatorio)
 *
 * La fracción II del Art. 23 Quinquies solo come CONFIRMADAS; una propuesta
 * abierta bloquea tanto la corrida desde la estructura como la aprobación del
 * expediente — esto último lo impone la base, no esta capa.
 */

export class DatoDeDeterminacionInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeDeterminacionInvalido'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

export interface DeterminacionDeControl {
  readonly id: string
  readonly parteId: string
  readonly parteNombre: string
  readonly medio: string
  readonly areas: readonly AreaDeControl[]
  readonly estado: 'propuesta' | 'confirmada' | 'rechazada'
  readonly fundamento: string | null
  readonly reglaId: string | null
  readonly reglaPatron: string | null
  readonly resueltaEn: string | null
  readonly creadaEn: string
}

export interface ReglaDeCriterio {
  readonly id: string
  readonly patron: string
  readonly conclusion: 'constituye_control' | 'no_constituye_control'
  readonly fundamento: string
  /** Cuántas determinaciones la citaron: los «casos donde se aplicó» del plano. */
  readonly vecesAplicada: number
}

export async function determinacionesDelCliente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string },
): Promise<readonly DeterminacionDeControl[]> {
  await exigirSesionActiva(db, p.sesion)
  const { rows } = await db.query(
    `select d.id::text, d.parte_id::text, ps.nombre as parte_nombre, d.medio,
            d.areas::text[] as areas, d.estado::text as estado, d.fundamento,
            d.regla_id::text, r.patron as regla_patron,
            d.resuelta_en::text, d.created_at::text
       from determinaciones_control d
       join partes_societarias ps on ps.id = d.parte_id
       left join reglas_de_criterio r on r.id = d.regla_id
      where d.tenant_id = $1 and d.cliente_id = $2
      order by d.created_at`,
    [p.sesion.tenantId, p.clienteId],
  )
  return (rows as Array<{
    id: string; parte_id: string; parte_nombre: string; medio: string
    areas: AreaDeControl[]; estado: 'propuesta' | 'confirmada' | 'rechazada'
    fundamento: string | null; regla_id: string | null; regla_patron: string | null
    resuelta_en: string | null; created_at: string
  }>).map((f) => ({
    id: f.id,
    parteId: f.parte_id,
    parteNombre: f.parte_nombre,
    medio: f.medio,
    areas: f.areas,
    estado: f.estado,
    fundamento: f.fundamento,
    reglaId: f.regla_id,
    reglaPatron: f.regla_patron,
    resueltaEn: f.resuelta_en,
    creadaEn: f.created_at,
  }))
}

export async function reglasDelObligado(
  db: EjecutorSql,
  p: { sesion: ContextoSesion },
): Promise<readonly ReglaDeCriterio[]> {
  await exigirSesionActiva(db, p.sesion)
  const { rows } = await db.query(
    `select r.id::text, r.patron, r.conclusion::text as conclusion, r.fundamento,
            (select count(*)::int from determinaciones_control d where d.regla_id = r.id)
              as veces_aplicada
       from reglas_de_criterio r
      where r.tenant_id = $1
        and not exists (select 1 from reglas_de_criterio n where n.sustituye_a = r.id)
      order by r.created_at desc`,
    [p.sesion.tenantId],
  )
  return (rows as Array<{
    id: string; patron: string; conclusion: 'constituye_control' | 'no_constituye_control'
    fundamento: string; veces_aplicada: number
  }>).map((f) => ({
    id: f.id,
    patron: f.patron,
    conclusion: f.conclusion,
    fundamento: f.fundamento,
    vecesAplicada: f.veces_aplicada,
  }))
}

export async function proponerControl(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    parteId: string
    medio: string
    areas: readonly AreaDeControl[]
  },
): Promise<{ determinacionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const problemas: string[] = []
    if (p.medio.trim() === '') {
      problemas.push('Falta el medio: qué cláusula, convenio o facultad daría el control.')
    }
    if (p.areas.length === 0) {
      problemas.push(
        'Falta con qué se relacionan sus funciones: estrategia, toma de decisiones o políticas ' +
          'principales (fr. II del Art. 23 Quinquies).',
      )
    }
    if (problemas.length > 0) throw new DatoDeDeterminacionInvalido(problemas)

    try {
      const { rows } = await db.query(
        `insert into determinaciones_control
           (tenant_id, cliente_id, parte_id, medio, areas, propuesta_por)
         values ($1,$2,$3,$4,$5::area_de_control[],$6) returning id::text`,
        [p.sesion.tenantId, p.clienteId, p.parteId, p.medio.trim(),
         `{${p.areas.join(',')}}`, p.sesion.usuarioId],
      )
      return { determinacionId: (rows[0] as { id: string }).id }
    } catch (e) {
      const bruto = e instanceof Error ? e.message : String(e)
      if (/una_propuesta_abierta_por_parte/.test(bruto)) {
        throw new DatoDeDeterminacionInvalido([
          'Esa persona ya tiene una propuesta de control abierta. Resuélvela — dos preguntas ' +
            'iguales esperando respuestas que pueden diferir no son diligencia.',
        ])
      }
      if (/persona física/.test(bruto)) {
        throw new DatoDeDeterminacionInvalido([
          'La determinación de control señala a una persona física de la estructura: la fr. II ' +
            'identifica personas, no sociedades.',
        ])
      }
      throw e
    }
  })
}

/**
 * Resuelve la propuesta — el acto que el motor jamás hace solo.
 *
 * `guardarComoRegla` es el punto 5 del plano: el criterio queda como patrón
 * reutilizable, y esta determinación lo cita como su primer caso. La próxima
 * estructura equivalente ya no cuesta seis horas de abogado.
 */
export async function resolverControl(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    determinacionId: string
    conclusion: 'confirmada' | 'rechazada'
    fundamento: string
    documentoSoporteId?: string | undefined
    reglaId?: string | undefined
    guardarComoRegla?: { readonly patron: string } | undefined
  },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (p.fundamento.trim() === '') {
      throw new DatoDeDeterminacionInvalido([
        'El fundamento es obligatorio en ambos sentidos: por qué sí constituye control, o por ' +
          'qué no. Un «no» sin razones no defiende nada ante una revisión.',
      ])
    }
    if (p.reglaId !== undefined && p.guardarComoRegla !== undefined) {
      throw new DatoDeDeterminacionInvalido([
        'O se cita una regla existente o se crea una nueva con este criterio — las dos cosas a ' +
          'la vez duplicarían el precedente.',
      ])
    }

    let reglaId = p.reglaId ?? null
    if (p.guardarComoRegla !== undefined) {
      if (p.guardarComoRegla.patron.trim() === '') {
        throw new DatoDeDeterminacionInvalido([
          'Para guardar el criterio como regla hay que nombrar el patrón: «cláusula de voto de ' +
            'calidad en el consejo», no el caso concreto.',
        ])
      }
      const r = await db.query(
        `insert into reglas_de_criterio (tenant_id, patron, conclusion, fundamento, creada_por)
         values ($1,$2,$3::conclusion_de_criterio,$4,$5) returning id::text`,
        [
          p.sesion.tenantId,
          p.guardarComoRegla.patron.trim(),
          p.conclusion === 'confirmada' ? 'constituye_control' : 'no_constituye_control',
          p.fundamento.trim(),
          p.sesion.usuarioId,
        ],
      )
      reglaId = (r.rows[0] as { id: string }).id
    }

    const { rows } = await db.query(
      `update determinaciones_control
          set estado = $3::estado_determinacion, resuelta_por = $4, resuelta_en = now(),
              fundamento = $5, documento_soporte_id = $6, regla_id = $7
        where tenant_id = $1 and id = $2 and estado = 'propuesta'
      returning id::text`,
      [
        p.sesion.tenantId,
        p.determinacionId,
        p.conclusion,
        p.sesion.usuarioId,
        p.fundamento.trim(),
        p.documentoSoporteId ?? null,
        reglaId,
      ],
    )
    if (rows.length === 0) {
      throw new DatoDeDeterminacionInvalido([
        'Esa propuesta no existe en este obligado, o ya se resolvió — una resolución no se repite.',
      ])
    }
  })
}
