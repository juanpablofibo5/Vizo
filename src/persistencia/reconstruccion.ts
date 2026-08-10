import type { EjecutorSql } from '../catalogo/cargador'
import { ZONA_MEXICO } from '../dominio/fechas'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * "¿Cómo estaba el expediente X el día Y?"
 *
 * La respuesta se arma SOLO con la bitácora. Ni una consulta a `documentos`,
 * `expedientes` o `manifiestos` — y eso no es purismo: es la prueba de que la
 * bitácora basta.
 *
 * Si para reconstruir el pasado hiciera falta mirar las tablas de estado, la
 * bitácora no serviría para lo que existe. Las tablas dicen cómo están las
 * cosas HOY; la pregunta es cómo estaban entonces, y esas dos cosas divergen
 * en cuanto alguien reemplaza un documento o se recalcula la completitud.
 *
 * Lo que sí necesita de las tablas es el catálogo de etiquetas para pintar —
 * eso va en la capa de presentación, no aquí.
 */

export interface DocumentoHistorico {
  documentoId: string
  campo: string
  hashSha256: string
  /** Momento del evento que lo registró, en UTC. */
  registradoEn: string
}

export interface ManifiestoHistorico {
  manifiestoId: string
  version: string
  hashSha256: string
  generadoEn: string
}

export interface EstadoHistorico {
  expedienteId: string
  /** Corte de la reconstrucción. */
  hasta: string
  abiertoEn: string | null
  /** Documentos VIGENTES a esa fecha: excluye los ya reemplazados entonces. */
  documentos: DocumentoHistorico[]
  /** Última evaluación de completitud anterior al corte. */
  completitud: {
    estatus: string
    cubiertos: string
    totalObligatorios: string
    faltantes: string[]
    evaluadaEn: string
  } | null
  manifiestos: ManifiestoHistorico[]
  /** Cuántos eventos se leyeron: hace auditable la propia reconstrucción. */
  eventosConsiderados: number
}

/**
 * Un corte de solo fecha significa el FINAL de ese día en México.
 *
 * AUDITORÍA DE LA SEMANA 8. La pregunta que este módulo existe para responder
 * es "¿cómo estaba el expediente el día Y?", así que pasar `'2026-08-09'` es lo
 * natural — y era justo lo que fallaba. La sesión de Postgres corre en UTC, así
 * que `'2026-08-09'::timestamptz` es el 8 de agosto a las 18:00 de Mérida: la
 * respuesta se daba con seis horas MENOS y todo un día de menos, sin avisar.
 *
 * Un instante completo se respeta tal cual. Solo la fecha desnuda —que es
 * ambigua por naturaleza— se resuelve, y se resuelve como la entiende quien
 * pregunta: el día Y completo, en la jurisdicción donde el obligado cumple.
 *
 * El instante que se usó de verdad vuelve en `hasta`, para que la respuesta no
 * dependa de que alguien recuerde esta regla.
 */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

export class SinRastroEnBitacora extends Error {
  constructor(expedienteId: string, hasta: string) {
    super(
      `La bitácora no tiene ningún evento del expediente ${expedienteId} anterior a ${hasta}. ` +
        'O no existía todavía, o sus eventos no se registraron — y esas dos cosas no son lo ' +
        'mismo: la segunda es un problema. Revisa la cadena antes de concluir nada.',
    )
    this.name = 'SinRastroEnBitacora'
  }
}

interface FilaEvento {
  evento: string
  objeto_id: string | null
  datos: Record<string, unknown>
  ocurrido_en: string
}

export async function reconstruirExpediente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; expedienteId: string; hasta: string },
): Promise<EstadoHistorico> {
  await exigirSesionActiva(db, p.sesion)

  // El corte se resuelve ANTES de consultar, y se resuelve en la base: la zona
  // horaria de México la conoce Postgres, no este proceso. Ver `SOLO_FECHA`.
  const corte = SOLO_FECHA.test(p.hasta)
    ? (
        (
          await db.query(
            `select to_char(
                      ($1::date + interval '1 day' - interval '1 microsecond')
                        at time zone $2 at time zone 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`,
            [p.hasta, ZONA_MEXICO],
          )
        ).rows[0] as { t: string }
      ).t
    : p.hasta

  // Un evento pertenece al expediente si ES el expediente (objeto_id) o si lo
  // nombra en sus datos — así entran documentos y manifiestos, que tienen id
  // propio.
  const { rows } = await db.query(
    `select evento, objeto_id::text, datos,
            to_char(ocurrido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ocurrido_en
       from bitacora
      where tenant_id = $1
        and ocurrido_en <= $2::timestamptz
        -- El cast explícito en AMBOS lados no es adorno: Postgres infiere el
        -- tipo del parámetro por su primer uso, y sin él compara texto con uuid.
        and (objeto_id = $3::uuid or datos->>'expediente_id' = $3::text)
      order by secuencia`,
    [p.sesion.tenantId, corte, p.expedienteId],
  )

  const eventos = rows as FilaEvento[]
  if (eventos.length === 0) {
    throw new SinRastroEnBitacora(p.expedienteId, corte)
  }

  let abiertoEn: string | null = null
  let completitud: EstadoHistorico['completitud'] = null
  const manifiestos: ManifiestoHistorico[] = []

  // Los documentos se pliegan en dos pasos: primero todos los registrados,
  // después se descartan los que ya habían sido reemplazados AL CORTE. Un
  // documento reemplazado la semana pasada seguía vigente el mes anterior.
  const documentos = new Map<string, DocumentoHistorico>()
  const reemplazados = new Set<string>()

  for (const e of eventos) {
    switch (e.evento) {
      case 'expediente.abierto':
        abiertoEn = e.ocurrido_en
        break

      case 'expediente.completitud_evaluada':
        completitud = {
          estatus: String(e.datos['estatus'] ?? ''),
          cubiertos: String(e.datos['cubiertos'] ?? ''),
          totalObligatorios: String(e.datos['total_obligatorios'] ?? ''),
          faltantes: Array.isArray(e.datos['faltantes'])
            ? (e.datos['faltantes'] as string[])
            : [],
          evaluadaEn: e.ocurrido_en,
        }
        break

      case 'documento.alta': {
        if (e.objeto_id === null) break
        documentos.set(e.objeto_id, {
          documentoId: e.objeto_id,
          campo: String(e.datos['campo'] ?? ''),
          hashSha256: String(e.datos['hash_sha256'] ?? ''),
          registradoEn: e.ocurrido_en,
        })
        const reemplaza = e.datos['reemplaza_a']
        if (typeof reemplaza === 'string') reemplazados.add(reemplaza)
        break
      }

      case 'manifiesto.generado':
        if (e.objeto_id === null) break
        manifiestos.push({
          manifiestoId: e.objeto_id,
          version: String(e.datos['version'] ?? ''),
          hashSha256: String(e.datos['hash_sha256'] ?? ''),
          generadoEn: e.ocurrido_en,
        })
        break
    }
  }

  const vigentes = [...documentos.values()]
    .filter((d) => !reemplazados.has(d.documentoId))
    .sort((a, b) => a.campo.localeCompare(b.campo) || a.hashSha256.localeCompare(b.hashSha256))

  return {
    expedienteId: p.expedienteId,
    // El instante REALMENTE usado, no el que llegó: si era solo una fecha, aquí
    // se ve en qué se convirtió.
    hasta: corte,
    abiertoEn,
    documentos: vigentes,
    completitud,
    manifiestos,
    eventosConsiderados: eventos.length,
  }
}
