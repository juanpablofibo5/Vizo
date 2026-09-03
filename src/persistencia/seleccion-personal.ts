import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  coberturaDeSeleccion,
  type CoberturaDeSeleccion,
  type DeclaracionDePersonal,
  type PersonaContratable,
} from '../dominio/seleccion-personal'

/**
 * El Art. 39 Bis 2 en la base.
 *
 * Reusa la plantilla del Cap. XII (`personas_capacitables`) como registro de
 * personas en vez de crear un padrón nuevo. Son la misma gente vista por dos
 * artículos —a quién hay que capacitar, y de quién hay que recabar la
 * declaración de selección— y dos padrones darían dos respuestas posibles a
 * «quién trabaja aquí», que es el modo de falla que persigue la regla dura 6.
 */

export class DatoDeSeleccionInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeSeleccionInvalido'
  }
}

export class AlcanceDeSeleccionAusente extends Error {
  constructor() {
    super(
      'El catálogo no tiene "seleccion_personal_alcance" y sin él no se puede saber desde cuándo ' +
        'ni a quiénes alcanza el Art. 39 Bis 2. Se detiene en vez de suponer una fecha: la del ' +
        'Transitorio Sexto se siembra con su fuente del DOF (regla dura 1).',
    )
    this.name = 'AlcanceDeSeleccionAusente'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

export interface AlcanceDeSeleccion {
  readonly exigibleDesde: string
  readonly alcance: string
  readonly anticipado: boolean
}

export async function alcanceDeSeleccion(
  db: EjecutorSql,
  hoy: string,
): Promise<AlcanceDeSeleccion> {
  const { rows } = await db.query(
    `select (valor #>> '{}') as alcance, vigente_desde::text as desde
       from parametros_motor
      where clave = 'seleccion_personal_alcance' and actividad_id is null
      order by vigente_desde desc limit 1`,
  )
  const f = rows[0] as { alcance: string; desde: string } | undefined
  if (f === undefined) throw new AlcanceDeSeleccionAusente()
  return { exigibleDesde: f.desde, alcance: f.alcance, anticipado: hoy < f.desde }
}

export interface EstadoDeSeleccionPersonal {
  readonly personas: readonly PersonaContratable[]
  readonly declaraciones: readonly DeclaracionDePersonal[]
  readonly cobertura: CoberturaDeSeleccion
  readonly alcance: AlcanceDeSeleccion
}

interface FilaPersona {
  id: string
  nombre: string
  fecha_contratacion: string | null
  baja_del_area: string | null
}

interface FilaDeclaracion {
  id: string
  persona_id: string
  fecha_declaracion: string
  laboro_en_sector_obligado: boolean
  sectores_previos: string | null
  sin_sentencia_patrimonial: boolean
  sin_inhabilitacion_comercio: boolean
  sin_inhabilitacion_servicio_o_financiero: boolean
  con_firma: boolean
}

export async function estadoDeSeleccionPersonal(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<EstadoDeSeleccionPersonal> {
  await exigirSesionActiva(db, p.sesion)
  const alcance = await alcanceDeSeleccion(db, p.hoy)

  const per = await db.query(
    `select id::text, nombre, fecha_contratacion::text, baja_del_area::text
       from personas_capacitables where tenant_id = $1 order by nombre`,
    [p.sesion.tenantId],
  )
  const personas: PersonaContratable[] = (per.rows as FilaPersona[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fechaContratacion: f.fecha_contratacion,
    bajaDelArea: f.baja_del_area,
  }))

  const dec = await db.query(
    `select id::text, persona_id::text, fecha_declaracion::text,
            laboro_en_sector_obligado, sectores_previos,
            sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
            sin_inhabilitacion_servicio_o_financiero,
            (firma_hash is not null) as con_firma
       from declaraciones_personal where tenant_id = $1
      order by fecha_declaracion`,
    [p.sesion.tenantId],
  )
  const declaraciones: DeclaracionDePersonal[] = (dec.rows as FilaDeclaracion[]).map((f) => ({
    id: f.id,
    personaId: f.persona_id,
    fechaDeclaracion: f.fecha_declaracion,
    laboroEnSectorObligado: f.laboro_en_sector_obligado,
    sectoresPrevios: f.sectores_previos,
    manifestaciones: {
      sinSentenciaPatrimonial: f.sin_sentencia_patrimonial,
      sinInhabilitacionComercio: f.sin_inhabilitacion_comercio,
      sinInhabilitacionServicioOFinanciero: f.sin_inhabilitacion_servicio_o_financiero,
    },
    tieneFirmaConHuella: f.con_firma,
  }))

  return {
    personas,
    declaraciones,
    cobertura: coberturaDeSeleccion({
      personas,
      declaraciones,
      exigibleDesde: alcance.exigibleDesde,
    }),
    alcance,
  }
}

export interface DatosDeclaracion {
  readonly personaId: string
  readonly fechaDeclaracion: string
  readonly laboroEnSectorObligado: boolean
  readonly sectoresPrevios?: string | undefined
  readonly sinSentenciaPatrimonial: boolean
  readonly sinInhabilitacionComercio: boolean
  readonly sinInhabilitacionServicioOFinanciero: boolean
  readonly firma?: { readonly hash: string; readonly archivo: string } | undefined
}

/**
 * Asienta la declaración firmada del ¶2.
 *
 * Las tres manifestaciones de la fr. II se guardan tal como la persona las
 * firmó, incluso en falso. Un «sí fui sentenciado» no es un dato inválido: es
 * el hecho que el obligado necesita para aplicar las medidas de su Manual
 * (¶3), y rechazarlo empujaría a no registrarlo.
 */
export async function recabarDeclaracion(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; datos: DatosDeclaracion },
): Promise<{ declaracionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const d = p.datos
    const problemas: string[] = []
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fechaDeclaracion)) {
      problemas.push('Falta la fecha de la declaración.')
    }
    const sectores = (d.sectoresPrevios ?? '').trim()
    if (d.laboroEnSectorObligado && sectores === '') {
      problemas.push(
        'La fr. I pide «la información de cualquier otro sector en los que haya laborado ' +
          'previamente»: decir que sí sin decir cuál no cumple la fracción.',
      )
    }
    if (d.firma !== undefined && !/^[0-9a-f]{64}$/.test(d.firma.hash)) {
      problemas.push('La huella de la declaración firmada no es un SHA-256.')
    }
    if (problemas.length > 0) throw new DatoDeSeleccionInvalido(problemas)

    const { rows } = await db.query(
      `insert into declaraciones_personal
         (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado, sectores_previos,
          sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
          sin_inhabilitacion_servicio_o_financiero, firma_hash, firma_archivo, registrada_por)
       values ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id::text`,
      [
        p.sesion.tenantId,
        d.personaId,
        d.fechaDeclaracion,
        d.laboroEnSectorObligado,
        d.laboroEnSectorObligado ? sectores : null,
        d.sinSentenciaPatrimonial,
        d.sinInhabilitacionComercio,
        d.sinInhabilitacionServicioOFinanciero,
        d.firma?.hash ?? null,
        d.firma?.archivo ?? null,
        p.sesion.usuarioId,
      ],
    )
    return { declaracionId: (rows[0] as { id: string }).id }
  })
}

/**
 * Registra cuándo se contrató a alguien de la plantilla.
 *
 * Va aparte del alta en la plantilla porque de la gente que ya estaba, esta
 * fecha aparece después — y sin ella el Art. 39 Bis 2 no dice «no aplica»,
 * dice que no se sabe.
 */
export async function registrarFechaDeContratacion(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; personaId: string; fecha: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) {
      throw new DatoDeSeleccionInvalido(['Falta la fecha de contratación.'])
    }
    const { rows } = await db.query(
      `update personas_capacitables set fecha_contratacion = $3::date
        where tenant_id = $1 and id = $2
      returning id::text`,
      [p.sesion.tenantId, p.personaId, p.fecha],
    )
    if (rows.length === 0) {
      throw new DatoDeSeleccionInvalido(['Esa persona no está en la plantilla de este obligado.'])
    }
  })
}
