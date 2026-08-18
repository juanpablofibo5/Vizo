import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * La estructura del obligado que actúa por fideicomiso u otra figura jurídica
 * (Cap. II Ter del Acuerdo 115/2026, Arts. 10 Sexies y 10 Sexies 1).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ REGISTRA, Y QUÉ NO HACE
 * ────────────────────────────────────────────────────────────────────────────
 * El trámite —generar el XML con la herramienta del Portal y firmarlo con la
 * e.firma del RFC del propio fideicomiso o figura (Art. 4 ¶3)— ocurre en el
 * SAT. VIZO registra la estructura ANTES (para llegar al Portal con los datos
 * exactos del Anexo, campo por campo) y el rastro DESPUÉS: qué integrantes
 * incluyó cada envío, cuándo, y las bajas.
 *
 * El ciclo es el del Art. 10 Sexies y la base lo garantiza: los datos de un
 * integrante son inmutables, el estado solo avanza (capturado → enviado →
 * baja) y corregir es dar de baja + capturar la fila nueva con `corrigeA`.
 */

export type TipoFigura = 'fideicomiso' | 'asociacion_en_participacion' | 'otra'
export type PapelIntegrante =
  | 'fiduciario'
  | 'delegado_fiduciario'
  | 'fideicomitente'
  | 'fideicomisario'
  | 'asociante'
  | 'asociado'
  | 'otro'
export type NaturalezaIntegrante = 'fisica' | 'moral' | 'fideicomiso'
export type EstadoIntegrante = 'capturado' | 'enviado' | 'baja'

export interface DatosFigura {
  tipoFigura: TipoFigura
  /** Anexo 2 Ter I.iii — solo cuando el tipo es 'otra'. */
  descripcionOtra?: string
  numeroReferencia: string
  fechaConstitucion: string
  rfc: string
  /** Anexo 2 Bis I.iv — solo del fideicomiso. */
  cotizaEnBolsa?: boolean
  /** Anexo 2 Ter I.vi — solo de la otra figura. */
  paisNacionalidad?: string
  /** Anexo 2 Bis IV.i — solo del fideicomiso, y «no» es una respuesta. */
  fideicomisariosDeterminados?: boolean
}

export interface DatosIntegrante {
  papel: PapelIntegrante
  /** Anexo 2 Ter II vii/viii — solo cuando el papel es 'otro'. */
  descripcionOtro?: string
  naturaleza: NaturalezaIntegrante
  rfc: string
  // Persona física:
  primerApellido?: string
  segundoApellido?: string
  nombres?: string
  fechaNacimiento?: string
  curp?: string
  paisNacimiento?: string
  // Persona moral:
  denominacion?: string
  /** Moral y fideicomiso anidado. */
  fechaConstitucion?: string
  /** Física y moral. */
  paisNacionalidad?: string
  // Fideicomiso anidado (la recursión aplanada del Anexo 2 Bis III.III/IV.III):
  numeroReferencia?: string
  denominacionFiduciario?: string
}

export interface IntegranteRegistrado extends DatosIntegrante {
  id: string
  estado: EstadoIntegrante
  fechaEnvio: string | null
  fechaBaja: string | null
  corrigeA: string | null
}

export interface EstadoEstructura {
  /** Cap. II Ter aplica a fideicomisos y figuras jurídicas, no a físicas ni morales. */
  aplica: boolean
  tipoPersona: string | null
  figura: (DatosFigura & { id: string }) | null
  integrantes: IntegranteRegistrado[]
  /**
   * Para el arranque: hay figura, al menos un integrante fue enviado, y no
   * queda ninguno capturado sin enviar. Es «llegué al Portal y mandé todo».
   */
  enviadaCompleta: boolean
}

export class DatoDeEstructuraInvalido extends Error {
  constructor(problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeEstructuraInvalido'
  }
}

export class NoAplicaEstructura extends Error {
  constructor(tipoPersona: string | null) {
    super(
      tipoPersona === null
        ? 'Antes de registrar la estructura hay que decir qué clase de persona es el obligado (Configuración → El obligado).'
        : `La estructura del Cap. II Ter es de quienes actúan por fideicomiso u otra figura jurídica; este obligado es ${tipoPersona} y se identifica con su propio anexo.`,
    )
    this.name = 'NoAplicaEstructura'
  }
}

export class EnvioImposible extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'EnvioImposible'
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const RFC_FIGURA = /^[A-ZÑ&0-9]{12,13}$/

/** Los requisitos de la base, dichos para que una persona los atienda. */
function problemasDeLaFigura(f: DatosFigura): string[] {
  const problemas: string[] = []
  if (f.numeroReferencia.trim() === '') {
    problemas.push('Falta el número, identificador o referencia de la figura (Anexo, sección I).')
  }
  if (!FECHA.test(f.fechaConstitucion)) {
    problemas.push('La fecha de constitución debe tener la forma AAAA-MM-DD.')
  }
  if (!RFC_FIGURA.test(f.rfc.trim().toUpperCase())) {
    problemas.push('El RFC de la figura debe tener 12 o 13 caracteres.')
  }
  if (f.tipoFigura === 'otra' && (f.descripcionOtra === undefined || f.descripcionOtra.trim() === '')) {
    problemas.push('Cuando el tipo es «otra», el Anexo 2 Ter exige describirla (I.iii).')
  }
  if (f.tipoFigura !== 'otra' && f.descripcionOtra !== undefined) {
    problemas.push('La descripción solo aplica cuando el tipo de figura es «otra».')
  }
  if (f.tipoFigura === 'fideicomiso') {
    if (f.cotizaEnBolsa === undefined) {
      problemas.push('Falta responder si el fideicomiso cotiza en bolsa (Anexo 2 Bis I.iv).')
    }
    if (f.fideicomisariosDeterminados === undefined) {
      problemas.push('Falta responder si los fideicomisarios están determinados (Anexo 2 Bis IV.i).')
    }
    if (f.paisNacionalidad !== undefined) {
      problemas.push('El país de nacionalidad es de la otra figura (Anexo 2 Ter), no del fideicomiso.')
    }
  } else {
    if (f.paisNacionalidad === undefined || f.paisNacionalidad.trim() === '') {
      problemas.push('Falta el país de nacionalidad de la figura (Anexo 2 Ter I.vi).')
    }
    if (f.cotizaEnBolsa !== undefined || f.fideicomisariosDeterminados !== undefined) {
      problemas.push('Cotiza en bolsa y fideicomisarios determinados son preguntas del fideicomiso (Anexo 2 Bis).')
    }
  }
  return problemas
}

function problemasDelIntegrante(v: DatosIntegrante): string[] {
  const problemas: string[] = []
  const texto = (x: string | undefined): boolean => x !== undefined && x.trim() !== ''

  if (!RFC_FIGURA.test(v.rfc.trim().toUpperCase())) {
    problemas.push('El RFC del integrante debe tener 12 o 13 caracteres.')
  }
  if (v.papel === 'otro' && !texto(v.descripcionOtro)) {
    problemas.push('El papel «otro» exige su descripción (Anexo 2 Ter II.viii).')
  }

  if (v.naturaleza === 'fisica') {
    if (!texto(v.primerApellido) || !texto(v.nombres)) {
      problemas.push('Una persona física lleva primer apellido y nombre(s), sin abreviaturas.')
    }
    if (v.fechaNacimiento === undefined || !FECHA.test(v.fechaNacimiento)) {
      problemas.push('Falta la fecha de nacimiento (AAAA-MM-DD).')
    }
    if (!texto(v.paisNacionalidad) || !texto(v.paisNacimiento)) {
      problemas.push('Faltan el país de nacionalidad y el de nacimiento.')
    }
  } else if (v.naturaleza === 'moral') {
    if (!texto(v.denominacion)) {
      problemas.push('Una persona moral lleva denominación o razón social.')
    }
    if (v.fechaConstitucion === undefined || !FECHA.test(v.fechaConstitucion)) {
      problemas.push('Falta la fecha de constitución de la moral (AAAA-MM-DD).')
    }
    if (!texto(v.paisNacionalidad)) {
      problemas.push('Falta el país de nacionalidad de la moral.')
    }
  } else {
    if (!texto(v.numeroReferencia) || !texto(v.denominacionFiduciario)) {
      problemas.push(
        'Un fideicomiso anidado se identifica con su referencia y la denominación de su fiduciario (Anexo 2 Bis III.III).',
      )
    }
    if (v.fechaConstitucion === undefined || !FECHA.test(v.fechaConstitucion)) {
      problemas.push('Falta la fecha de constitución del fideicomiso anidado (AAAA-MM-DD).')
    }
    if (v.papel !== 'fideicomitente' && v.papel !== 'fideicomisario') {
      problemas.push('Un fideicomiso solo puede ser fideicomitente o fideicomisario (Anexo 2 Bis III.III y IV.III).')
    }
  }

  if (v.papel === 'fiduciario' && v.naturaleza !== 'moral') {
    problemas.push('El fiduciario se identifica por denominación o razón social: es una persona moral (Anexo 2 Bis II).')
  }
  if (v.papel === 'delegado_fiduciario' && v.naturaleza !== 'fisica') {
    problemas.push('El delegado fiduciario es una persona física (Anexo 2 Bis II.I).')
  }

  return problemas
}

async function figuraDelTenant(
  db: EjecutorSql,
  tenantId: string,
): Promise<{ id: string; tipo_persona: string | null } | null> {
  const t = await db.query(`select tipo_persona::text from tenants where id = $1`, [tenantId])
  const tipo = (t.rows[0] as { tipo_persona: string | null } | undefined)?.tipo_persona ?? null
  if (tipo !== 'fideicomiso' && tipo !== 'figura_juridica') {
    throw new NoAplicaEstructura(tipo)
  }
  const e = await db.query(
    `select id::text from estructura_del_obligado where tenant_id = $1`,
    [tenantId],
  )
  const fila = e.rows[0] as { id: string } | undefined
  return fila === undefined ? null : { id: fila.id, tipo_persona: tipo }
}

/** Registra la figura (secciones I–II de su Anexo). Una sola por obligado. */
export async function registrarFigura(
  db: Client,
  p: { sesion: ContextoSesion; figura: DatosFigura },
): Promise<{ estructuraId: string }> {
  const problemas = problemasDeLaFigura(p.figura)
  if (problemas.length > 0) throw new DatoDeEstructuraInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const t = await db.query(`select tipo_persona::text from tenants where id = $1`, [
      p.sesion.tenantId,
    ])
    const tipo = (t.rows[0] as { tipo_persona: string | null } | undefined)?.tipo_persona ?? null
    if (tipo !== 'fideicomiso' && tipo !== 'figura_juridica') {
      throw new NoAplicaEstructura(tipo)
    }

    const f = p.figura
    const { rows } = await db.query(
      `insert into estructura_del_obligado
         (tenant_id, tipo_figura, descripcion_otra, numero_referencia,
          fecha_constitucion, rfc, cotiza_en_bolsa, pais_nacionalidad,
          fideicomisarios_determinados)
       values ($1, $2::tipo_figura, $3, $4, $5::date, $6, $7, $8, $9)
       returning id::text`,
      [
        p.sesion.tenantId,
        f.tipoFigura,
        f.descripcionOtra?.trim() ?? null,
        f.numeroReferencia.trim(),
        f.fechaConstitucion,
        f.rfc.trim().toUpperCase(),
        f.cotizaEnBolsa ?? null,
        f.paisNacionalidad?.trim() ?? null,
        f.fideicomisariosDeterminados ?? null,
      ],
    )
    const estructuraId = (rows[0] as { id: string }).id

    // REGLA DURA 3: ni referencias ni RFC en la bitácora. El hecho y su tipo.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'estructura.figura_registrada',
      'estructura_del_obligado',
      estructuraId,
      JSON.stringify({ tipo_figura: f.tipoFigura }),
      p.sesion.usuarioId,
    ])

    return { estructuraId }
  })
}

/**
 * Captura un integrante. Si corrige a otro, el corregido ya debe estar dado
 * de baja: el Art. 10 Sexies ¶4 pone la baja ANTES del reenvío.
 */
export async function capturarIntegrante(
  db: Client,
  p: { sesion: ContextoSesion; integrante: DatosIntegrante; corrigeA?: string },
): Promise<{ integranteId: string }> {
  const problemas = problemasDelIntegrante(p.integrante)
  if (problemas.length > 0) throw new DatoDeEstructuraInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const figura = await figuraDelTenant(db, p.sesion.tenantId)
    if (figura === null) {
      throw new DatoDeEstructuraInvalido([
        'Primero se registra la figura (los datos del Anexo, sección I) y luego sus integrantes.',
      ])
    }

    if (p.corrigeA !== undefined) {
      const previo = await db.query(
        `select estado::text from integrantes_estructura where id = $1`,
        [p.corrigeA],
      )
      const fila = previo.rows[0] as { estado: string } | undefined
      if (fila === undefined) {
        throw new DatoDeEstructuraInvalido(['El integrante que se corrige no existe en tu obligado.'])
      }
      if (fila.estado !== 'baja') {
        throw new DatoDeEstructuraInvalido([
          `El integrante que se corrige sigue en estado «${fila.estado}». El Art. 10 Sexies ¶4 exige primero su baja y después la captura corregida.`,
        ])
      }
    }

    const v = p.integrante
    const { rows } = await db.query(
      `insert into integrantes_estructura
         (tenant_id, estructura_id, papel, descripcion_otro, naturaleza,
          primer_apellido, segundo_apellido, nombres, fecha_nacimiento, curp,
          pais_nacimiento, denominacion, fecha_constitucion, rfc,
          pais_nacionalidad, numero_referencia, denominacion_fiduciario, corrige_a)
       values ($1, $2, $3::papel_integrante, $4, $5::naturaleza_integrante,
               $6, $7, $8, $9::date, $10, $11, $12, $13::date, $14, $15, $16, $17, $18)
       returning id::text`,
      [
        p.sesion.tenantId,
        figura.id,
        v.papel,
        v.descripcionOtro?.trim() ?? null,
        v.naturaleza,
        v.primerApellido?.trim() ?? null,
        v.segundoApellido?.trim() ?? null,
        v.nombres?.trim() ?? null,
        v.fechaNacimiento ?? null,
        v.curp?.trim() ?? null,
        v.paisNacimiento?.trim() ?? null,
        v.denominacion?.trim() ?? null,
        v.fechaConstitucion ?? null,
        v.rfc.trim().toUpperCase(),
        v.paisNacionalidad?.trim() ?? null,
        v.numeroReferencia?.trim() ?? null,
        v.denominacionFiduciario?.trim() ?? null,
        p.corrigeA ?? null,
      ],
    )
    const integranteId = (rows[0] as { id: string }).id

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'estructura.integrante_capturado',
      'integrante_estructura',
      integranteId,
      JSON.stringify({
        papel: v.papel,
        naturaleza: v.naturaleza,
        corrige: p.corrigeA !== undefined,
      }),
      p.sesion.usuarioId,
    ])

    return { integranteId }
  })
}

/**
 * Registra que el envío al SAT ya ocurrió: todos los integrantes capturados
 * pasan a enviados con la fecha del trámite. Es el ¶1 (alta) y el ¶3
 * (adiciones) del Art. 10 Sexies — la herramienta manda lo pendiente.
 */
export async function registrarEnvio(
  db: Client,
  p: { sesion: ContextoSesion; fecha: string },
): Promise<{ enviados: number }> {
  if (!FECHA.test(p.fecha)) {
    throw new EnvioImposible('La fecha del envío debe tener la forma AAAA-MM-DD.')
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const figura = await figuraDelTenant(db, p.sesion.tenantId)
    if (figura === null) {
      throw new EnvioImposible('No hay estructura registrada: no hay nada que enviar.')
    }

    const r = await db.query(
      `update integrantes_estructura
          set estado = 'enviado', fecha_envio = $2::date
        where estructura_id = $1 and estado = 'capturado'`,
      [figura.id, p.fecha],
    )
    const enviados = r.rowCount ?? 0
    if (enviados === 0) {
      throw new EnvioImposible(
        'No hay integrantes capturados pendientes de envío. Si el SAT recibió algo nuevo, primero se captura aquí.',
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'estructura.envio_registrado',
      'estructura_del_obligado',
      figura.id,
      JSON.stringify({ fecha: p.fecha, integrantes: enviados }),
      p.sesion.usuarioId,
    ])

    return { enviados }
  })
}

/** La baja del ¶2: por el servicio de actualización del Portal. */
export async function darDeBajaIntegrante(
  db: Client,
  p: { sesion: ContextoSesion; integranteId: string; fecha: string },
): Promise<void> {
  if (!FECHA.test(p.fecha)) {
    throw new EnvioImposible('La fecha de la baja debe tener la forma AAAA-MM-DD.')
  }

  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(
      `update integrantes_estructura
          set estado = 'baja', fecha_baja = $2::date
        where id = $1 and estado <> 'baja'`,
      [p.integranteId, p.fecha],
    )
    if ((r.rowCount ?? 0) === 0) {
      const existe = await db.query(
        `select estado::text from integrantes_estructura where id = $1`,
        [p.integranteId],
      )
      throw new EnvioImposible(
        existe.rows.length === 0
          ? 'Ese integrante no existe en tu obligado.'
          : 'Ese integrante ya está dado de baja.',
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'estructura.integrante_baja',
      'integrante_estructura',
      p.integranteId,
      JSON.stringify({ fecha: p.fecha }),
      p.sesion.usuarioId,
    ])
  })
}

interface FilaIntegrante {
  id: string
  papel: PapelIntegrante
  descripcion_otro: string | null
  naturaleza: NaturalezaIntegrante
  primer_apellido: string | null
  segundo_apellido: string | null
  nombres: string | null
  fecha_nacimiento: string | null
  curp: string | null
  pais_nacimiento: string | null
  denominacion: string | null
  fecha_constitucion: string | null
  rfc: string
  pais_nacionalidad: string | null
  numero_referencia: string | null
  denominacion_fiduciario: string | null
  estado: EstadoIntegrante
  fecha_envio: string | null
  fecha_baja: string | null
  corrige_a: string | null
}

/** El estado completo, para Configuración y para el arranque. */
export async function estadoDeLaEstructura(
  db: EjecutorSql,
  p: { sesion: ContextoSesion },
): Promise<EstadoEstructura> {
  await exigirSesionActiva(db, p.sesion)

  const t = await db.query(`select tipo_persona::text from tenants where id = $1`, [
    p.sesion.tenantId,
  ])
  const tipoPersona =
    (t.rows[0] as { tipo_persona: string | null } | undefined)?.tipo_persona ?? null
  const aplica = tipoPersona === 'fideicomiso' || tipoPersona === 'figura_juridica'

  if (!aplica) {
    return { aplica, tipoPersona, figura: null, integrantes: [], enviadaCompleta: false }
  }

  const e = await db.query(
    `select id::text, tipo_figura::text as tipo_figura, descripcion_otra,
            numero_referencia, fecha_constitucion::text as fecha_constitucion, rfc,
            cotiza_en_bolsa, pais_nacionalidad, fideicomisarios_determinados
       from estructura_del_obligado where tenant_id = $1`,
    [p.sesion.tenantId],
  )
  const fe = e.rows[0] as
    | {
        id: string
        tipo_figura: TipoFigura
        descripcion_otra: string | null
        numero_referencia: string
        fecha_constitucion: string
        rfc: string
        cotiza_en_bolsa: boolean | null
        pais_nacionalidad: string | null
        fideicomisarios_determinados: boolean | null
      }
    | undefined

  if (fe === undefined) {
    return { aplica, tipoPersona, figura: null, integrantes: [], enviadaCompleta: false }
  }

  const v = await db.query(
    `select id::text, papel::text as papel, descripcion_otro,
            naturaleza::text as naturaleza, primer_apellido, segundo_apellido,
            nombres, fecha_nacimiento::text as fecha_nacimiento, curp,
            pais_nacimiento, denominacion,
            fecha_constitucion::text as fecha_constitucion, rfc,
            pais_nacionalidad, numero_referencia, denominacion_fiduciario,
            estado::text as estado, fecha_envio::text as fecha_envio,
            fecha_baja::text as fecha_baja, corrige_a::text as corrige_a
       from integrantes_estructura
      where estructura_id = $1
      order by created_at`,
    [fe.id],
  )

  const integrantes: IntegranteRegistrado[] = (v.rows as FilaIntegrante[]).map((f) => ({
    id: f.id,
    papel: f.papel,
    ...(f.descripcion_otro === null ? {} : { descripcionOtro: f.descripcion_otro }),
    naturaleza: f.naturaleza,
    rfc: f.rfc,
    ...(f.primer_apellido === null ? {} : { primerApellido: f.primer_apellido }),
    ...(f.segundo_apellido === null ? {} : { segundoApellido: f.segundo_apellido }),
    ...(f.nombres === null ? {} : { nombres: f.nombres }),
    ...(f.fecha_nacimiento === null ? {} : { fechaNacimiento: f.fecha_nacimiento }),
    ...(f.curp === null ? {} : { curp: f.curp }),
    ...(f.pais_nacimiento === null ? {} : { paisNacimiento: f.pais_nacimiento }),
    ...(f.denominacion === null ? {} : { denominacion: f.denominacion }),
    ...(f.fecha_constitucion === null ? {} : { fechaConstitucion: f.fecha_constitucion }),
    ...(f.pais_nacionalidad === null ? {} : { paisNacionalidad: f.pais_nacionalidad }),
    ...(f.numero_referencia === null ? {} : { numeroReferencia: f.numero_referencia }),
    ...(f.denominacion_fiduciario === null
      ? {}
      : { denominacionFiduciario: f.denominacion_fiduciario }),
    estado: f.estado,
    fechaEnvio: f.fecha_envio,
    fechaBaja: f.fecha_baja,
    corrigeA: f.corrige_a,
  }))

  const hayEnviado = integrantes.some((x) => x.estado === 'enviado')
  const hayPendiente = integrantes.some((x) => x.estado === 'capturado')

  return {
    aplica,
    tipoPersona,
    figura: {
      id: fe.id,
      tipoFigura: fe.tipo_figura,
      ...(fe.descripcion_otra === null ? {} : { descripcionOtra: fe.descripcion_otra }),
      numeroReferencia: fe.numero_referencia,
      fechaConstitucion: fe.fecha_constitucion,
      rfc: fe.rfc,
      ...(fe.cotiza_en_bolsa === null ? {} : { cotizaEnBolsa: fe.cotiza_en_bolsa }),
      ...(fe.pais_nacionalidad === null ? {} : { paisNacionalidad: fe.pais_nacionalidad }),
      ...(fe.fideicomisarios_determinados === null
        ? {}
        : { fideicomisariosDeterminados: fe.fideicomisarios_determinados }),
    },
    integrantes,
    enviadaCompleta: hayEnviado && !hayPendiente,
  }
}
