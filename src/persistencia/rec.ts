import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * El Representante Encargado de Cumplimiento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO NO ES UN CAMPO DE TEXTO
 * ────────────────────────────────────────────────────────────────────────────
 * Designar un REC parece un dato de configuración —un nombre y un RFC— y no lo
 * es. El Art. 20 de la LFPIORPI, párrafo 2:
 *
 *   «En tanto no haya una persona Representante Encargada del Cumplimiento **o
 *    la designación no sea aceptada**, el cumplimiento de las obligaciones que
 *    esta Ley señala corresponderá a los integrantes del órgano de
 *    administración o a quien funja como administrador único…»
 *
 * Es decir: mientras la designación esté pendiente, la responsabilidad es
 * personal de los administradores — legalmente idéntico a no haber designado a
 * nadie. Un campo de texto que dijera «REC: Juan Pérez» afirmaría lo contrario
 * y sería la clase de dato plausible y falso que este proyecto persigue.
 *
 * Por eso `designado` cuenta como paso NO cumplido en el arranque, y por eso el
 * portal nombra la consecuencia en vez de pintar una casilla gris.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FRONTERA
 * ────────────────────────────────────────────────────────────────────────────
 * Aceptar o rechazar ocurre en el Portal del SAT, con el RFC y la e.firma de la
 * persona designada (Art. 10 del Acuerdo 115/2026). VIZO **no** custodia esa
 * e.firma, no acepta por nadie y no presenta nada: registra qué pasó y cuándo,
 * que es lo que después hay que poder demostrar.
 */

export type EstadoDesignacion = 'designado' | 'aceptada' | 'rechazada' | 'sustituida'
export type TipoPersonaObligado = 'fisica' | 'moral' | 'fideicomiso' | 'figura_juridica'

export interface Designacion {
  id: string
  rfc: string
  nombre: string
  estado: EstadoDesignacion
  fechaDesignacion: string
  fechaRespuesta: string | null
  fechaNotificacionSat: string | null
}

export interface EstadoRec {
  /**
   * Si este obligado debe designar. Art. 20 ¶1: solo personas morales y quienes
   * actúen por fideicomiso u otra figura jurídica. Una persona física obligada
   * responde ella misma y no tiene a quién designar.
   */
  aplica: boolean
  /**
   * `null` mientras no se sepa qué clase de persona es el obligado. No es lo
   * mismo que «no aplica»: es que todavía no se puede responder.
   */
  tipoPersona: TipoPersonaObligado | null
  /** Designada y sin respuesta. Para el Art. 20 ¶2, esto NO es tener REC. */
  pendiente: Designacion | null
  /** Aceptada y en funciones. */
  vigente: Designacion | null
  /** La última rechazada, si la hay. El rechazo no libera de nada (Art. 10 ¶4). */
  rechazada: Designacion | null
}

export class DatoDelRecInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'DatoDelRecInvalido'
  }
}

export class NoAplicaDesignacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'NoAplicaDesignacion'
  }
}

export class RelevoExigeSustituir extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'RelevaExigeSustituir'
  }
}

export class NoAutorizado extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'NoAutorizado'
  }
}

/**
 * El RFC de una persona física: 4 letras, 6 dígitos de fecha y 3 de homoclave.
 *
 * Duplica el CHECK de la base a propósito. La base es la que garantiza; esto es
 * lo que produce un mensaje que una persona pueda atender, en vez del texto de
 * un `check_violation`. Si alguna vez dejaran de coincidir, gana la base.
 */
const RFC_PERSONA_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/
const FECHA = /^\d{4}-\d{2}-\d{2}$/

interface FilaDesignacion {
  id: string
  rfc: string
  nombre: string
  estado: EstadoDesignacion
  fecha_designacion: string
  fecha_respuesta: string | null
  fecha_notificacion_sat: string | null
}

const aDesignacion = (f: FilaDesignacion): Designacion => ({
  id: f.id,
  rfc: f.rfc,
  nombre: f.nombre,
  estado: f.estado,
  fechaDesignacion: f.fecha_designacion,
  fechaRespuesta: f.fecha_respuesta,
  fechaNotificacionSat: f.fecha_notificacion_sat,
})

/** Lo que el portal necesita saber para responder «¿quién responde por mí?». */
export async function estadoDelRec(
  db: EjecutorSql,
  p: { sesion: ContextoSesion },
): Promise<EstadoRec> {
  await exigirSesionActiva(db, p.sesion)

  const t = await db.query(`select tipo_persona from tenants where id = $1`, [p.sesion.tenantId])
  const tipoPersona = (t.rows[0] as { tipo_persona: TipoPersonaObligado | null } | undefined)
    ?.tipo_persona ?? null

  const { rows } = await db.query(
    `select id::text, rfc, nombre, estado::text,
            fecha_designacion::text, fecha_respuesta::text, fecha_notificacion_sat::text
       from designaciones_rec
      where tenant_id = $1
      order by fecha_designacion desc, created_at desc`,
    [p.sesion.tenantId],
  )
  const filas = (rows as FilaDesignacion[]).map(aDesignacion)
  const primera = (estado: EstadoDesignacion) => filas.find((d) => d.estado === estado) ?? null

  return {
    // Mientras `tipoPersona` sea null la respuesta honesta es «todavía no sé»,
    // y se representa como `aplica: false` con `tipoPersona: null` — quien
    // consume esto tiene que mirar los dos campos, no solo el booleano.
    aplica:
      tipoPersona === 'moral' ||
      tipoPersona === 'fideicomiso' ||
      tipoPersona === 'figura_juridica',
    tipoPersona,
    pendiente: primera('designado'),
    vigente: primera('aceptada'),
    rechazada: primera('rechazada'),
  }
}

/** Registra a quién designó el obligado. El acto ante el SAT ya ocurrió. */
export async function designarRec(
  db: Client,
  p: { sesion: ContextoSesion; rfc: string; nombre: string; fecha: string },
): Promise<string> {
  const rfc = p.rfc.trim().toUpperCase()
  const nombre = p.nombre.trim()

  if (!RFC_PERSONA_FISICA.test(rfc)) {
    throw new DatoDelRecInvalido(
      'El REC tiene que ser una persona física (Art. 10 del Acuerdo 115/2026), y su RFC ' +
        'debe tener 13 caracteres: cuatro letras, seis dígitos de fecha y tres de homoclave.',
    )
  }
  if (nombre.length < 3) {
    throw new DatoDelRecInvalido('Falta el nombre de la persona designada.')
  }
  if (!FECHA.test(p.fecha)) {
    throw new DatoDelRecInvalido('La fecha de la designación debe tener la forma AAAA-MM-DD.')
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDelRec(db, p)

    if (!estado.aplica) {
      throw new NoAplicaDesignacion(
        estado.tipoPersona === null
          ? 'Antes de designar hay que decir si el obligado es persona física, moral o fideicomiso: ' +
            'de eso depende si la designación aplica (Art. 20 LFPIORPI).'
          : 'Una persona física que realiza la Actividad Vulnerable responde ella misma y no designa ' +
            'REC (Art. 20 LFPIORPI, párrafo 1).',
      )
    }
    if (estado.pendiente) {
      throw new RelevoExigeSustituir(
        'Ya hay una designación esperando respuesta. Registra primero si fue aceptada o rechazada.',
      )
    }

    const { rows } = await db.query(
      `insert into designaciones_rec (tenant_id, rfc, nombre, fecha_designacion)
       values ($1, $2, $3, $4::date) returning id::text`,
      [p.sesion.tenantId, rfc, nombre, p.fecha],
    )
    const id = (rows[0] as { id: string }).id

    // REGLA DURA 3: ni el RFC ni el nombre entran a la bitácora. Viven en la
    // tabla, con RLS. Aquí solo el hecho y su fecha.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'rec.designado',
      'designacion_rec',
      id,
      JSON.stringify({ fecha_designacion: p.fecha }),
      p.sesion.usuarioId,
    ])

    return id
  })
}

/**
 * Registra la respuesta que la persona designada dio ante el SAT.
 *
 * `fechaNotificacionSat` es opcional porque el Art. 10 ¶3 le da al SAT diez
 * días hábiles para notificar: normalmente se conoce después, y exigirla aquí
 * obligaría a esperar para registrar un hecho que ya ocurrió.
 */
export async function registrarRespuestaRec(
  db: Client,
  p: {
    sesion: ContextoSesion
    designacionId: string
    respuesta: 'aceptada' | 'rechazada'
    fecha: string
    fechaNotificacionSat?: string
  },
): Promise<void> {
  if (!FECHA.test(p.fecha)) {
    throw new DatoDelRecInvalido('La fecha de la respuesta debe tener la forma AAAA-MM-DD.')
  }
  if (p.fechaNotificacionSat !== undefined && !FECHA.test(p.fechaNotificacionSat)) {
    throw new DatoDelRecInvalido('La fecha de notificación del SAT debe tener la forma AAAA-MM-DD.')
  }

  await enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDelRec(db, p)

    // Aceptar a alguien nuevo mientras hay un REC en funciones dejaría dos
    // designaciones vigentes, y el índice único lo detendría con un error que
    // no dice qué hacer. Se detiene antes, diciéndolo (regla dura 6).
    if (p.respuesta === 'aceptada' && estado.vigente) {
      throw new RelevoExigeSustituir(
        `El obligado ya tiene un REC en funciones desde el ${estado.vigente.fechaRespuesta ?? '—'}. ` +
          'Registra primero su sustitución, con la fecha en que dejó el cargo.',
      )
    }

    const r = await db.query(
      `update designaciones_rec
          set estado = $3::estado_designacion_rec,
              fecha_respuesta = $4::date,
              fecha_notificacion_sat = $5::date
        where tenant_id = $1 and id = $2`,
      [
        p.sesion.tenantId,
        p.designacionId,
        p.respuesta,
        p.fecha,
        p.fechaNotificacionSat ?? null,
      ],
    )

    if (r.rowCount !== 1) {
      throw new NoAutorizado(
        'No se pudo registrar la respuesta. Solo un administrador del obligado puede hacerlo, ' +
          'y la designación tiene que seguir esperando respuesta.',
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      p.respuesta === 'aceptada' ? 'rec.aceptada' : 'rec.rechazada',
      'designacion_rec',
      p.designacionId,
      JSON.stringify({
        fecha_respuesta: p.fecha,
        fecha_notificacion_sat: p.fechaNotificacionSat ?? null,
      }),
      p.sesion.usuarioId,
    ])
  })
}

/**
 * El REC en funciones deja el cargo.
 *
 * El Art. 20 obliga a «mantener vigente dicha designación», así que un REC que
 * se va deja al obligado en el supuesto del párrafo 2 hasta que otro acepte.
 * Registrarlo es lo que permite decir desde cuándo.
 */
export async function sustituirRec(
  db: Client,
  p: { sesion: ContextoSesion; designacionId: string },
): Promise<void> {
  await enTransaccionDeSesion(db, p.sesion, async () => {
    await exigirSesionActiva(db, p.sesion)

    const r = await db.query(
      `update designaciones_rec set estado = 'sustituida'
        where tenant_id = $1 and id = $2 and estado in ('designado','aceptada')`,
      [p.sesion.tenantId, p.designacionId],
    )

    if (r.rowCount !== 1) {
      throw new NoAutorizado(
        'No se pudo sustituir esa designación. Solo un administrador puede hacerlo, y solo sobre ' +
          'una designación pendiente o en funciones.',
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'rec.sustituida',
      'designacion_rec',
      p.designacionId,
      JSON.stringify({}),
      p.sesion.usuarioId,
    ])
  })
}
