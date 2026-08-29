import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'
import {
  DatoDeScreeningInvalido,
  LISTAS_EXIGIDAS,
  ListasIncompletas,
  normalizarNombre,
  type CoincidenciaScreening,
  type ListaVigente,
} from '../dominio/screening'

/**
 * La consulta a listas de control y su resolución humana (issue #34, ADR-30).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE MÓDULO GARANTIZA
 * ────────────────────────────────────────────────────────────────────────────
 * 1. **Sin las cuatro listas vigentes, se detiene** — nunca consulta parcial
 *    que diga «sin coincidencias» sobre lo que no miró (regla dura 6).
 * 2. **Toda consulta escribe**, con o sin coincidencias: el folio con el
 *    snapshot de versiones ES la evidencia de que se consultó ese día.
 * 3. **Detecta de más y resuelve el humano**: RFC exacto + trigramas sobre el
 *    umbral operativo del catálogo. VIZO no descarta nada solo (regla dura 5);
 *    la base además lo vuelve inexpresable (triggers de la migración).
 */

export class UmbralDeScreeningAusente extends Error {
  constructor() {
    super(
      'El catálogo no tiene el parámetro umbral_similitud_screening, y sin él el matching no ' +
        'sabe desde qué similitud reportar. Se detiene en vez de suponer un número: el umbral ' +
        'es una decisión versionada (ADR-30), no un default.',
    )
    this.name = 'UmbralDeScreeningAusente'
  }
}

export interface ResultadoConsulta {
  consultaId: string
  resultado: 'sin_coincidencia' | 'coincidencia'
  coincidencias: CoincidenciaScreening[]
  listas: ListaVigente[]
  alertaId: string | null
}

interface FilaListaVigente {
  id: string
  clave: string
  descargada_en: string
  hash_sha256: string
  registros: number
}

/** Las versiones vigentes (la más reciente por clave). Falta una → se detiene. */
export async function listasVigentes(db: EjecutorSql): Promise<ListaVigente[]> {
  const { rows } = await db.query(
    `select distinct on (clave) id::text, clave, descargada_en::text as descargada_en,
            hash_sha256, registros
       from listas_screening
      order by clave, descargada_en desc`,
  )
  const vigentes = (rows as FilaListaVigente[]).map((f) => ({
    id: f.id,
    clave: f.clave,
    descargadaEn: f.descargada_en,
    hash: f.hash_sha256,
    registros: f.registros,
  }))
  const claves = new Set(vigentes.map((v) => v.clave))
  const faltantes = LISTAS_EXIGIDAS.filter((c) => !claves.has(c))
  if (faltantes.length > 0) throw new ListasIncompletas(faltantes)
  return vigentes
}

/**
 * Consulta a un sujeto contra las listas vigentes y registra la evidencia.
 * Si hay coincidencias, levanta la alerta que las nombra.
 */
export async function consultarScreening(
  db: Client,
  p: {
    sesion: ContextoSesion
    sujetoTipo: 'cliente' | 'beneficiario'
    sujetoId: string
    nombre: string
    rfc?: string
  },
): Promise<ResultadoConsulta> {
  const problemas: string[] = []
  if (p.nombre.trim().length < 3) problemas.push('El nombre a consultar está vacío o incompleto.')
  const rfc = p.rfc?.trim().toUpperCase() ?? ''
  if (problemas.length > 0) throw new DatoDeScreeningInvalido(problemas)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    // El sujeto tiene que existir en ESTE obligado: una consulta colgada de un
    // id ajeno sería evidencia de nadie (regla dura 6).
    const tablaSujeto =
      p.sujetoTipo === 'cliente' ? 'clientes_finales' : 'beneficiarios_controladores'
    const existe = await db.query(
      `select 1 from ${tablaSujeto} where id = $1 and tenant_id = $2`,
      [p.sujetoId, p.sesion.tenantId],
    )
    if (existe.rows.length === 0) {
      throw new DatoDeScreeningInvalido([
        `El ${p.sujetoTipo} a consultar no existe en tu obligado.`,
      ])
    }

    const listas = await listasVigentes(db)

    const u = await db.query(
      `select (valor #>> '{}')::real as umbral from parametros_motor
        where clave = 'umbral_similitud_screening' and actividad_id is null
        order by vigente_desde desc limit 1`,
    )
    const umbral = (u.rows[0] as { umbral: number } | undefined)?.umbral
    if (umbral === undefined) throw new UmbralDeScreeningAusente()

    // El % usa el índice de trigramas; el umbral entra por set_config LOCAL a
    // la transacción, así dos consultas concurrentes no se pisan el número.
    const normalizado = normalizarNombre(p.nombre)
    await db.query(`select set_config('pg_trgm.similarity_threshold', $1, true)`, [String(umbral)])
    const m = await db.query(
      `select e.id::text as entrada_id, e.nombre, e.datos, l.clave as lista,
              extensions.similarity(e.nombre_normalizado, $1) as similitud,
              (coalesce($2, '') <> '' and e.rfc = $2) as por_rfc
         from entradas_lista e
         join (select distinct on (clave) id, clave from listas_screening
                order by clave, descargada_en desc) l on l.id = e.lista_id
        where e.nombre_normalizado % $1
           or (coalesce($2, '') <> '' and e.rfc = $2)
        order by similitud desc`,
      [normalizado, rfc === '' ? null : rfc],
    )
    const coincidencias: CoincidenciaScreening[] = (
      m.rows as {
        entrada_id: string
        nombre: string
        datos: Record<string, string>
        lista: string
        similitud: number
        por_rfc: boolean
      }[]
    ).map((f) => ({
      lista: f.lista,
      entradaId: f.entrada_id,
      nombreEnLista: f.nombre,
      criterio: f.por_rfc ? 'rfc' : 'nombre',
      similitud: Number(f.similitud),
      datos: f.datos,
    }))

    const resultado = coincidencias.length > 0 ? 'coincidencia' : 'sin_coincidencia'
    const snapshot: Record<string, unknown> = {}
    for (const l of listas) {
      snapshot[l.clave] = {
        lista_id: l.id,
        descargada_en: l.descargadaEn,
        hash: l.hash,
        registros: l.registros,
      }
    }

    const ins = await db.query(
      `insert into consultas_screening
         (tenant_id, sujeto_tipo, sujeto_id, listas_consultadas, coincidencias, resultado)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6) returning id::text`,
      [
        p.sesion.tenantId,
        p.sujetoTipo,
        p.sujetoId,
        JSON.stringify(snapshot),
        JSON.stringify(coincidencias),
        resultado,
      ],
    )
    const consultaId = (ins.rows[0] as { id: string }).id

    let alertaId: string | null = null
    if (resultado === 'coincidencia') {
      const al = await db.query(
        `insert into alertas (tenant_id, tipo, titulo, detalle, consulta_screening_id)
         values ($1,'screening','Coincidencia en listas de control',$2::jsonb,$3)
         returning id::text`,
        [
          p.sesion.tenantId,
          JSON.stringify({
            coincidencias: coincidencias.length,
            listas: [...new Set(coincidencias.map((c) => c.lista))],
          }),
          consultaId,
        ],
      )
      alertaId = (al.rows[0] as { id: string }).id
    }

    // REGLA DURA 3: ni el nombre consultado ni el de la lista van a la
    // bitácora — el sujeto va como id opaco y las cifras cuentan la historia.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'screening.consultado',
      'consulta_screening',
      consultaId,
      JSON.stringify({
        sujeto_tipo: p.sujetoTipo,
        listas: listas.map((l) => l.clave),
        coincidencias: coincidencias.length,
        resultado,
      }),
      p.sesion.usuarioId,
    ])

    return { consultaId, resultado, coincidencias, listas, alertaId }
  })
}

/**
 * Registra la resolución HUMANA de una coincidencia: una vez, con quién,
 * cuándo y por qué. La base rechaza todo lo demás (triggers de la migración);
 * aquí solo se traduce el error a algo que una persona pueda atender.
 */
export async function resolverScreening(
  db: Client,
  p: {
    sesion: ContextoSesion
    consultaId: string
    resolucion: 'confirmada' | 'descartada'
    razonamiento: string
  },
): Promise<void> {
  if (p.razonamiento.trim().length < 15) {
    throw new DatoDeScreeningInvalido([
      'El razonamiento es la evidencia de la decisión: escribe por qué la coincidencia es —o ' +
        'no es— la persona listada (mínimo una oración).',
    ])
  }

  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(
      `update consultas_screening
          set resolucion = $2, razonamiento = $3, resuelto_por = $4, resuelto_en = now()
        where id = $1`,
      [p.consultaId, p.resolucion, p.razonamiento.trim(), p.sesion.usuarioId],
    )
    if ((r.rowCount ?? 0) === 0) {
      throw new DatoDeScreeningInvalido([
        'Esa consulta no existe en tu obligado, o tu rol no puede resolverla (la resolución la firma un admin).',
      ])
    }

    // La alerta que la nombraba queda atendida por el mismo acto.
    await db.query(
      `update alertas set estado = 'atendida', atendida_por = $2, atendida_en = now()
        where consulta_screening_id = $1 and estado = 'abierta'`,
      [p.consultaId, p.sesion.usuarioId],
    )

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'screening.resuelto',
      'consulta_screening',
      p.consultaId,
      JSON.stringify({ resolucion: p.resolucion }),
      p.sesion.usuarioId,
    ])
  })
}

export interface ConsultaListada {
  id: string
  sujetoTipo: 'cliente' | 'beneficiario'
  resultado: 'sin_coincidencia' | 'coincidencia'
  resolucion: 'pendiente' | 'confirmada' | 'descartada'
  coincidencias: number
  consultadoEn: string
  resueltoEn: string | null
}

/** El historial de consultas de un sujeto, para su expediente. */
export async function screeningDelSujeto(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; sujetoTipo: 'cliente' | 'beneficiario'; sujetoId: string },
): Promise<ConsultaListada[]> {
  const { rows } = await db.query(
    `select id::text, sujeto_tipo::text as sujeto_tipo, resultado::text as resultado,
            resolucion::text as resolucion, jsonb_array_length(coincidencias) as coincidencias,
            created_at::text as consultado_en, resuelto_en::text as resuelto_en
       from consultas_screening
      where tenant_id = $1 and sujeto_tipo = $2 and sujeto_id = $3
      order by created_at desc`,
    [p.sesion.tenantId, p.sujetoTipo, p.sujetoId],
  )
  return (
    rows as {
      id: string
      sujeto_tipo: 'cliente' | 'beneficiario'
      resultado: 'sin_coincidencia' | 'coincidencia'
      resolucion: 'pendiente' | 'confirmada' | 'descartada'
      coincidencias: number
      consultado_en: string
      resuelto_en: string | null
    }[]
  ).map((f) => ({
    id: f.id,
    sujetoTipo: f.sujeto_tipo,
    resultado: f.resultado,
    resolucion: f.resolucion,
    coincidencias: f.coincidencias,
    consultadoEn: f.consultado_en,
    resueltoEn: f.resuelto_en,
  }))
}
