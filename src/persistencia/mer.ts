import { createHash } from 'node:crypto'
import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'
import { DatoDeRiesgoInvalido, estadoDelRiesgo } from './riesgo'
import { estadoDeLaEntidad, type EvaluacionDeEntidad } from './entidad'
import {
  componerMer,
  escribirMer,
  type DatosDelMer,
  type EvaluacionDelMer,
  type GradoDelMer,
  type VersionAnterior,
} from '../dominio/mer'

/**
 * La emisión del MER (ADR-29): el documento de la metodología, congelado.
 *
 * Emitir es un acto, no una descarga — el mismo criterio de la Constancia
 * (ADR-20): el texto se congela, se hashea y queda en la bitácora con quién y
 * cuándo, porque el Manual lo va a referenciar (Art. 37 ¶2) y una referencia a
 * un blanco móvil no es una referencia. Solo se emite del modelo VIGENTE: un
 * MER de un borrador documentaría, con el nombre del obligado, una metodología
 * que nadie aprobó.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export class MerNoEmitido extends Error {
  constructor() {
    super(
      'El MER no se escribió y tampoco existe uno idéntico previo. Eso solo pasa si la base ' +
        'rechazó la escritura (RLS): emitir lo firma un admin del obligado.',
    )
    this.name = 'MerNoEmitido'
  }
}

export interface MerEmitido {
  merId: string
  /** false cuando ya existía uno idéntico del mismo día: se devuelve ese. */
  nueva: boolean
  contenido: string
  hash: string
  version: number
  total: number
  acreditadas: number
  conPendientes: number
}

export interface MerListado {
  id: string
  fecha: string
  version: number
  hash: string
  total: number
  acreditadas: number
  conPendientes: number
  gradoEntidad: string | null
  emitidoEn: string
}

const aEvaluacionDelMer = (e: EvaluacionDeEntidad): EvaluacionDelMer => ({
  evaluadoEn: e.evaluadoEn,
  baseInformacion: e.baseInformacion,
  inherente: e.inherente,
  mitigacion: e.mitigacion,
  residual: e.residual,
  gradoClave: e.gradoClave,
  esAlto: e.esAlto,
  vence: e.vence,
})

/**
 * Compone, escribe y registra el MER del modelo vigente.
 *
 * Sin modelo vigente no hay documento: habría que inventar una metodología, y
 * eso es exactamente lo que este documento existe para no hacer.
 */
export async function emitirMer(
  db: Client,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<MerEmitido> {
  if (!FECHA.test(p.hoy)) {
    throw new DatoDeRiesgoInvalido(['La fecha debe tener la forma AAAA-MM-DD.'])
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const riesgo = await estadoDelRiesgo(db, { sesion: p.sesion, hoy: p.hoy })
    if (riesgo.vigente === null) {
      throw new DatoDeRiesgoInvalido([
        'No hay ninguna versión vigente de la metodología. El MER documenta la que el obligado ' +
          'aprobó; hasta que apruebe una, no hay documento que emitir — y VIZO no lo inventa.',
      ])
    }
    const entidad = await estadoDeLaEntidad(db, { sesion: p.sesion, hoy: p.hoy })

    const ob = await db.query(`select razon_social, rfc from tenants where id = $1`, [
      p.sesion.tenantId,
    ])
    const obligado = ob.rows[0] as { razon_social: string; rfc: string } | undefined
    if (obligado === undefined) {
      throw new DatoDeRiesgoInvalido(['No se pudo leer el obligado de la sesión.'])
    }

    const ap = await db.query(
      `select u.nombre from modelos_riesgo m
         left join usuarios u on u.id = m.aprobado_por
        where m.id = $1`,
      [riesgo.vigente.id],
    )
    const aprobadoPor = (ap.rows[0] as { nombre: string | null } | undefined)?.nombre ?? null

    const gr = await db.query(
      `select clave, nombre, orden, es_alto, puntaje_minimo::text
         from grados_riesgo where tenant_id = $1 order by orden`,
      [p.sesion.tenantId],
    )
    const escala: GradoDelMer[] = (
      gr.rows as { clave: string; nombre: string; orden: number; es_alto: boolean; puntaje_minimo: string | null }[]
    ).map((g) => ({
      clave: g.clave,
      nombre: g.nombre,
      orden: g.orden,
      esAlto: g.es_alto,
      puntajeMinimo: g.puntaje_minimo === null ? Number.NaN : Number(g.puntaje_minimo),
    }))

    const vs = await db.query(
      `select version, vigente_desde::text as vigente_desde, aprobado_en::text as aprobado_en
         from modelos_riesgo
        where tenant_id = $1 and estado = 'sustituido' order by version desc`,
      [p.sesion.tenantId],
    )
    const versionesAnteriores = vs.rows as VersionAnterior[]

    // La evaluación citada es la del MODELO VIGENTE: citar la de una versión
    // anterior le colgaría a esta metodología un resultado que no produjo.
    const delVigente = [entidad.vigente, ...entidad.historico].find(
      (e): e is EvaluacionDeEntidad =>
        e !== null && e.modeloVersion === riesgo.vigente?.version,
    )

    const datos: DatosDelMer = {
      version: riesgo.vigente.version,
      vigenteDesde: riesgo.vigente.vigenteDesde,
      aprobadoPor,
      aprobadoEn: riesgo.vigente.aprobadoEn,
      metodoMedicion: riesgo.vigente.metodoMedicion,
      metodoEntidad: entidad.metodoEntidad,
      factores: riesgo.vigente.factores,
      pesosPorElemento: riesgo.vigente.pesosPorElemento,
      mitigantes: entidad.mitigantes,
      niveles: entidad.niveles,
      escala,
      evaluacionEntidad: delVigente === undefined ? null : aEvaluacionDelMer(delVigente),
      versionesAnteriores,
      cobertura: riesgo.vigente.cobertura,
    }

    const compuesto = componerMer(datos)
    const contenido = escribirMer(
      compuesto,
      { razonSocial: obligado.razon_social, rfc: obligado.rfc, fecha: p.hoy },
      riesgo.vigente.version,
    )
    const hash = createHash('sha256').update(contenido, 'utf8').digest('hex')

    const ins = await db.query(
      `insert into mer_emitidos
         (tenant_id, modelo_id, version, fecha, contenido, hash_sha256,
          total, acreditadas, con_pendientes, grado_entidad, emitido_por)
       values ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11)
       on conflict (tenant_id, fecha, hash_sha256) do nothing
       returning id::text`,
      [
        p.sesion.tenantId,
        riesgo.vigente.id,
        riesgo.vigente.version,
        p.hoy,
        contenido,
        hash,
        compuesto.total,
        compuesto.acreditadas,
        compuesto.conPendientes,
        compuesto.gradoEntidad,
        p.sesion.usuarioId,
      ],
    )

    const nueva = ins.rows.length > 0
    let merId = (ins.rows[0] as { id: string } | undefined)?.id
    if (merId === undefined) {
      const previa = await db.query(
        `select id::text from mer_emitidos
          where tenant_id = $1 and fecha = $2::date and hash_sha256 = $3`,
        [p.sesion.tenantId, p.hoy, hash],
      )
      merId = (previa.rows[0] as { id: string } | undefined)?.id
      if (merId === undefined) throw new MerNoEmitido()
    }

    // Solo la primera vez: registrar dos veces el mismo hecho llenaría la
    // bitácora de eventos que no ocurrieron.
    if (nueva) {
      await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
        p.sesion.tenantId,
        'mer.emitido',
        'mer',
        merId,
        JSON.stringify({
          version: riesgo.vigente.version,
          hash,
          acreditadas: compuesto.acreditadas,
          con_pendientes: compuesto.conPendientes,
          grado_entidad: compuesto.gradoEntidad,
        }),
        p.sesion.usuarioId,
      ])
    }

    return {
      merId,
      nueva,
      contenido,
      hash,
      version: riesgo.vigente.version,
      total: compuesto.total,
      acreditadas: compuesto.acreditadas,
      conPendientes: compuesto.conPendientes,
    }
  })
}

/** Los MER emitidos, para listarlos sin reparsear su texto. */
export async function listarMer(
  db: EjecutorSql,
  p: { sesion: ContextoSesion },
): Promise<MerListado[]> {
  const { rows } = await db.query(
    `select id::text, fecha::text as fecha, version, hash_sha256 as hash,
            total, acreditadas, con_pendientes, grado_entidad,
            emitido_en::text as emitido_en
       from mer_emitidos where tenant_id = $1
      order by fecha desc, emitido_en desc`,
    [p.sesion.tenantId],
  )
  return (
    rows as {
      id: string
      fecha: string
      version: number
      hash: string
      total: number
      acreditadas: number
      con_pendientes: number
      grado_entidad: string | null
      emitido_en: string
    }[]
  ).map((f) => ({
    id: f.id,
    fecha: f.fecha,
    version: f.version,
    hash: f.hash,
    total: f.total,
    acreditadas: f.acreditadas,
    conPendientes: f.con_pendientes,
    gradoEntidad: f.grado_entidad,
    emitidoEn: f.emitido_en,
  }))
}
