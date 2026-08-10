import { cargarConfigActividad, type EjecutorSql } from '../catalogo/cargador'
import { ZONA_MEXICO } from '../dominio/fechas'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  construirManifiesto,
  hashDeManifiesto,
  type DocumentoDelManifiesto,
  type OperacionDelManifiesto,
  type ValorCanonico,
} from '../dominio/manifiesto'

/**
 * Generación del manifiesto contra la base.
 *
 * `manifiestos` es append-only: generar de nuevo es una versión más, nunca un
 * UPDATE. Dos manifiestos del mismo expediente en fechas distintas cuentan dos
 * historias verdaderas, y la vieja no deja de serlo porque llegó una nueva.
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export class ExpedienteSinManifiesto extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ExpedienteSinManifiesto'
  }
}

export interface ResultadoManifiesto {
  manifiestoId: string
  version: number
  hash: string
  contenido: ValorCanonico
}

export async function generarManifiesto(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; expedienteId: string },
): Promise<ResultadoManifiesto> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const exp = await db.query(
      `select e.id, e.version::text, e.cliente_id, e.estatus::text as estatus,
              e.completitud, av.fraccion
         from expedientes e
         join actividades_vulnerables av on av.id = e.actividad_id
        where e.id = $1`,
      [p.expedienteId],
    )
    if (exp.rows.length === 0) {
      throw new ExpedienteSinManifiesto(
        `No existe el expediente ${p.expedienteId} en este obligado, o RLS no lo deja ver.`,
      )
    }
    const e = exp.rows[0] as {
      id: string
      version: string
      cliente_id: string
      estatus: string
      completitud: { estatus?: string; cubiertos?: number; totalObligatorios?: number }
      fraccion: string
    }

    // Un expediente que nunca se evaluó no sabe si está completo, así que su
    // manifiesto afirmaría algo que nadie comprobó.
    if (typeof e.completitud.estatus !== 'string') {
      throw new ExpedienteSinManifiesto(
        'Este expediente no tiene completitud calculada. Un manifiesto sobre un expediente ' +
          'sin evaluar afirmaría un estado que nadie verificó: evalúalo primero.',
      )
    }

    // Solo los documentos VIGENTES: uno reemplazado sigue en la tabla —es
    // append-only— pero no es el que integra el expediente hoy.
    //
    // El ORDEN es parte del hash, así que se fija aquí de forma determinista y
    // no se deja al capricho del planificador de Postgres.
    const docs = await db.query(
      `select d.campo, d.hash_sha256, d.tamano_bytes::text, d.mime,
              to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as registrado_en
         from documentos d
        where d.expediente_id = $1
          and not exists (select 1 from documentos n where n.reemplaza_a = d.id)
        order by d.campo, d.hash_sha256`,
      [p.expedienteId],
    )

    const ops = await db.query(
      `select o.id, o.fecha_operacion::text, o.monto_base::text, o.monto_total::text,
              o.forma_pago,
              coalesce(ev.resultado_aviso::text, 'sin_evaluar') as resultado_aviso
         from operaciones_vigentes o
         left join lateral (
           select resultado_aviso from evaluaciones_umbral x
            where x.operacion_id = o.id order by x.evaluado_en desc limit 1
         ) ev on true
        where o.cliente_id = $1
        order by o.fecha_operacion, o.id`,
      [e.cliente_id],
    )

    const cabeza = await db.query(`select app.bitacora_cabeza($1) as h`, [p.sesion.tenantId])

    // UN SOLO reloj —el de la base— para las dos cosas que dependen del tiempo:
    // la marca que queda dentro del hash y la fecha con la que se resuelve la
    // vigencia del catálogo.
    //
    // AUDITORÍA DE LA SEMANA 8. Aquí había `new Date().toISOString()`, que es
    // el reloj del host y en UTC: el mismo defecto que la auditoría de la
    // semana 6 corrigió en la pantalla del expediente y que se volvió a colar
    // aquí. A partir de las 18:00 de Mérida el manifiesto resolvía el catálogo
    // con la fecha de MAÑANA, y en la frontera del 1 de febrero eso significa
    // sellar un expediente declarando una `catalogo_version` que no era la
    // vigente cuando se generó. Queda dentro del hash: no se puede corregir
    // después sin romper la firma.
    //
    // Que las dos salgan de la MISMA consulta tampoco es adorno. Con dos
    // relojes, `generado_en` podía caer el 1 de febrero y la vigencia
    // resolverse con el 31 de enero — un manifiesto que se contradice a sí
    // mismo y que nadie podría explicar años después.
    const reloj = await db.query(
      `select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as generado_en,
              (now() at time zone $1)::date::text as fecha_local`,
      [ZONA_MEXICO],
    )
    const { generado_en: generadoEn, fecha_local: fechaLocal } = reloj.rows[0] as {
      generado_en: string
      fecha_local: string
    }

    const config = await cargarConfigActividad(db, e.fraccion, fechaLocal)

    const documentos: DocumentoDelManifiesto[] = (
      docs.rows as Array<Record<string, string>>
    ).map((d) => ({
      campo: d['campo'] as string,
      hashSha256: d['hash_sha256'] as string,
      tamanoBytes: d['tamano_bytes'] as string,
      mime: d['mime'] as string,
      registradoEn: d['registrado_en'] as string,
    }))

    const operaciones: OperacionDelManifiesto[] = (
      ops.rows as Array<Record<string, string>>
    ).map((o) => ({
      id: o['id'] as string,
      fechaOperacion: o['fecha_operacion'] as string,
      montoBase: o['monto_base'] as string,
      montoTotal: o['monto_total'] as string,
      formaPago: o['forma_pago'] as string,
      resultadoAviso: o['resultado_aviso'] as string,
    }))

    const hashCabeza = (cabeza.rows[0] as { h: string }).h

    const contenido = construirManifiesto({
      expedienteId: e.id,
      version: e.version,
      clienteId: e.cliente_id,
      actividad: e.fraccion,
      estatus: e.estatus,
      completitud: {
        estatus: e.completitud.estatus,
        cubiertos: String(e.completitud.cubiertos ?? ''),
        totalObligatorios: String(e.completitud.totalObligatorios ?? ''),
      },
      documentos,
      operaciones,
      catalogoVersion: config.catalogoVersion,
      hashBitacoraCabeza: hashCabeza,
      generadoEn,
    })

    const hash = hashDeManifiesto(contenido)

    const siguiente = await db.query(
      `select coalesce(max(version), 0) + 1 as v from manifiestos where expediente_id = $1`,
      [p.expedienteId],
    )
    const version = Number((siguiente.rows[0] as { v: string }).v)

    const ins = await db.query(
      `insert into manifiestos (tenant_id, expediente_id, version, contenido,
                                hash_sha256, hash_bitacora_cabeza, catalogo_version)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7) returning id`,
      [
        p.sesion.tenantId,
        p.expedienteId,
        version,
        JSON.stringify(contenido),
        hash,
        hashCabeza,
        config.catalogoVersion,
      ],
    )
    const manifiestoId = (ins.rows[0] as { id: string }).id

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'manifiesto.generado',
      'manifiesto',
      manifiestoId,
      JSON.stringify({
        expediente_id: p.expedienteId,
        version: String(version),
        hash_sha256: hash,
        documentos: documentos.length,
        operaciones: operaciones.length,
        catalogo_version: config.catalogoVersion,
      }),
      p.sesion.usuarioId,
    ])

    return { manifiestoId, version, hash, contenido }
  })
}

/**
 * Recomputa el hash de un manifiesto guardado y lo compara con el registrado.
 *
 * Es la operación que importa años después: demuestra que el manifiesto no se
 * tocó. Si esto devuelve `false`, o el manifiesto cambió o la forma canónica
 * dejó de ser la misma — y las dos cosas hay que mirarlas de inmediato.
 */
export async function verificarManifiesto(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; manifiestoId: string },
): Promise<{ coincide: boolean; hashRegistrado: string; hashRecomputado: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    await exigirSesionActiva(db, p.sesion)

    // Quien de verdad bloquea el cruce entre obligados es RLS, y RLS solo
    // aplica porque esto ya corre dentro de la sesión. El `tenant_id` explícito
    // es la segunda capa: comprobado quitando cada una por separado, con la
    // otra puesta el aislamiento aguanta; hace falta tumbar las dos —que era el
    // estado original— para que un obligado verifique el manifiesto de otro.
    const { rows } = await db.query(
      `select contenido, hash_sha256 from manifiestos where id = $1 and tenant_id = $2`,
      [p.manifiestoId, p.sesion.tenantId],
    )
    if (rows.length === 0) {
      throw new ExpedienteSinManifiesto(
        `No existe el manifiesto ${p.manifiestoId} en este obligado.`,
      )
    }
    const m = rows[0] as { contenido: ValorCanonico; hash_sha256: string }
    const recomputado = hashDeManifiesto(m.contenido)

    return {
      coincide: recomputado === m.hash_sha256,
      hashRegistrado: m.hash_sha256,
      hashRecomputado: recomputado,
    }
  })
}
