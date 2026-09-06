import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import { cerrarParticipacionYaEnSesion } from './grafo-societario'

/**
 * Los eventos estructurales — Fase 3 del plano (ADR-41).
 *
 * «El alta pasa una vez; esto corre para siempre.» Un cambio accionario, una
 * fusión o un cambio de administrador vuelven vieja la identificación del
 * Beneficiario Controlador, y registrar el evento dispara las cuatro cosas
 * del plano EN UNA transacción: cierra las vigencias que el capturista
 * señale, deja la reevaluación encolada, arranca el plazo y levanta la
 * alerta que nombra al evento.
 *
 * Dos cosas que este módulo NO hace:
 *
 * - No adivina qué participaciones cerró el evento. Quién vendió y quién
 *   entró lo dice el capturista; adivinar sería la máquina inventando hechos
 *   societarios (regla dura 6).
 * - No inventa el plazo. El Art. 23 Quinquies manda mantener actualizado
 *   «durante la vigencia de la Relación de negocios» sin fijar días; los días
 *   vienen del catálogo como parámetro OPERATIVO declarado como tal.
 */

export type TipoDeEvento =
  | 'cambio_accionario'
  | 'fusion'
  | 'cesion_derechos_fideicomisarios'
  | 'cambio_administrador'
  | 'otro'

export const NOMBRE_DEL_EVENTO: Record<TipoDeEvento, string> = {
  cambio_accionario: 'cambio accionario',
  fusion: 'fusión',
  cesion_derechos_fideicomisarios: 'cesión de derechos fideicomisarios',
  cambio_administrador: 'cambio de administrador',
  otro: 'otro cambio estructural',
}

export class DatoDeEventoInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeEventoInvalido'
  }
}

export class PlazoDeEventoAusente extends Error {
  constructor() {
    super(
      'El catálogo no tiene "evento_plazo_actualizacion_dias" y sin él no se puede fijar la ' +
        'fecha límite de actualización. Se detiene en vez de suponer un número: aunque el plazo ' +
        'sea operativo, un plazo supuesto quedaría congelado en el evento como si alguien lo ' +
        'hubiera decidido.',
    )
    this.name = 'PlazoDeEventoAusente'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

export interface EventoEstructural {
  readonly id: string
  readonly tipo: TipoDeEvento
  readonly descripcion: string
  readonly fechaEvento: string
  readonly fechaLimite: string
  readonly atendido: boolean
  readonly atendidoEn: string | null
  readonly registradoEn: string
}

export async function eventosDelCliente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string },
): Promise<readonly EventoEstructural[]> {
  await exigirSesionActiva(db, p.sesion)
  const { rows } = await db.query(
    `select id::text, tipo::text, descripcion, fecha_evento::text, fecha_limite::text,
            (atendido_con_identificacion_id is not null) as atendido,
            atendido_en::text, created_at::text
       from eventos_estructurales
      where tenant_id = $1 and cliente_id = $2
      order by fecha_evento desc, created_at desc`,
    [p.sesion.tenantId, p.clienteId],
  )
  return (rows as Array<{
    id: string; tipo: TipoDeEvento; descripcion: string; fecha_evento: string
    fecha_limite: string; atendido: boolean; atendido_en: string | null; created_at: string
  }>).map((f) => ({
    id: f.id,
    tipo: f.tipo,
    descripcion: f.descripcion,
    fechaEvento: f.fecha_evento,
    fechaLimite: f.fecha_limite,
    atendido: f.atendido,
    atendidoEn: f.atendido_en,
    registradoEn: f.created_at,
  }))
}

/**
 * Registra el evento y dispara sus cuatro efectos en UNA transacción.
 *
 * Separados, quedaría una ventana donde el evento existe sin alerta — y una
 * alerta que puede no crearse nunca es la mitad de un sistema de alertas.
 */
export async function registrarEvento(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    tipo: TipoDeEvento
    descripcion: string
    fechaEvento: string
    documentoId?: string | undefined
    /** Las participaciones que el evento cerró — las señala el capturista. */
    cierraParticipaciones?: readonly string[] | undefined
  },
): Promise<{ eventoId: string; alertaId: string; fechaLimite: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const problemas: string[] = []
    if (p.descripcion.trim() === '') {
      problemas.push('Falta qué pasó: «entró el fondo X con el 35%», no solo el tipo.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fechaEvento)) {
      problemas.push('Falta la fecha del acto — la asamblea o la fusión, no la de captura.')
    }
    if (problemas.length > 0) throw new DatoDeEventoInvalido(problemas)

    // El plazo, del catálogo, congelado en el evento.
    const plazo = await db.query(
      `select (valor #>> '{}')::int as dias from parametros_motor
        where clave = 'evento_plazo_actualizacion_dias' and actividad_id is null
        order by vigente_desde desc limit 1`,
    )
    const dias = (plazo.rows[0] as { dias: number } | undefined)?.dias
    if (dias === undefined) throw new PlazoDeEventoAusente()

    const ev = await db.query(
      `insert into eventos_estructurales
         (tenant_id, cliente_id, tipo, descripcion, fecha_evento, fecha_limite,
          documento_id, registrado_por)
       values ($1,$2,$3::tipo_evento_estructural,$4,$5::date,
               ($5::date + ($6 || ' days')::interval)::date, $7, $8)
       returning id::text, fecha_limite::text`,
      [
        p.sesion.tenantId,
        p.clienteId,
        p.tipo,
        p.descripcion.trim(),
        p.fechaEvento,
        String(dias),
        p.documentoId ?? null,
        p.sesion.usuarioId,
      ],
    )
    const eventoId = (ev.rows[0] as { id: string }).id
    const fechaLimite = (ev.rows[0] as { fecha_limite: string }).fecha_limite

    // Las vigencias que el capturista señaló, cerradas a la fecha del evento.
    // La variante YaEnSesion, no la pública: enTransaccionDeSesion no anida
    // (ADR-39) y ésta es la transacción del evento.
    for (const participacionId of p.cierraParticipaciones ?? []) {
      await cerrarParticipacionYaEnSesion(db, {
        sesion: p.sesion, participacionId, hasta: p.fechaEvento,
      })
    }

    // La alerta, nombrando su evento — sin nombre ni RFC (regla dura 3).
    const al = await db.query(
      `insert into alertas (tenant_id, tipo, evento_estructural_id, titulo, detalle)
       values ($1,'cambio_estructural',$2,$3,$4::jsonb) returning id::text`,
      [
        p.sesion.tenantId,
        eventoId,
        `La estructura del cliente cambió: ${NOMBRE_DEL_EVENTO[p.tipo]}`,
        JSON.stringify({
          por: 'cambio_estructural',
          motivo:
            'La identificación del Beneficiario Controlador se hizo sobre una estructura que ya ' +
            'cambió. El Art. 23 Quinquies manda mantenerla actualizada durante la vigencia de ' +
            'la Relación de negocios; actualiza la estructura y vuelve a correr el orden.',
          tipo_evento: NOMBRE_DEL_EVENTO[p.tipo],
          fecha_evento: p.fechaEvento,
          fecha_limite: fechaLimite,
        }),
      ],
    )

    return { eventoId, alertaId: (al.rows[0] as { id: string }).id, fechaLimite }
  })
}

/**
 * Atiende los eventos pendientes con la identificación recién corrida.
 *
 * La llama `identificarYaEnSesion` DENTRO de su transacción: si la
 * identificación entra, los eventos quedan atendidos; si algo revienta, ni
 * una ni la otra. Solo atiende eventos cuyo acto es ANTERIOR o igual a la
 * fecha de identificación — reevaluar hoy no atiende el cambio de mañana.
 */
export async function atenderEventosPendientes(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    clienteId: string
    identificacionId: string
    fechaIdentificacion: string
  },
): Promise<number> {
  const { rows } = await db.query(
    `update eventos_estructurales
        set atendido_con_identificacion_id = $3, atendido_en = now()
      where tenant_id = $1 and cliente_id = $2
        and atendido_con_identificacion_id is null
        and fecha_evento <= $4::date
    returning id::text`,
    [p.sesion.tenantId, p.clienteId, p.identificacionId, p.fechaIdentificacion],
  )
  return rows.length
}
