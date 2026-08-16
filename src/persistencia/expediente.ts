import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'
import {
  calcularCompletitud,
  type CampoExpediente,
  type Completitud,
  type DocumentoDelCampo,
} from '../dominio/expediente'

/**
 * Completitud del expediente contra la base.
 *
 * Trae del catálogo los campos VIGENTES a una fecha, los cruza con lo
 * capturado y guarda el resultado. La fecha importa: un expediente integrado
 * en enero se juzga con los campos que exigía enero, igual que los umbrales.
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export class ExpedienteNoEncontrado extends Error {
  constructor(id: string) {
    super(`No existe el expediente ${id} en este obligado, o RLS no lo deja ver.`)
    this.name = 'ExpedienteNoEncontrado'
  }
}

/**
 * Campos vigentes para un expediente, filtrados por el tipo de persona.
 *
 * `aplica_a` vale 'ambas', 'persona_fisica' o 'persona_moral'. Un fideicomiso
 * se trata como persona moral para efectos del expediente: el XSD le pide la
 * misma forma (denominación y RFC de moral).
 */
export async function camposVigentes(
  db: EjecutorSql,
  actividadId: string,
  tipoPersona: string,
  fecha: string,
): Promise<CampoExpediente[]> {
  const aplica = tipoPersona === 'fisica' ? 'persona_fisica' : 'persona_moral'

  const { rows } = await db.query(
    `select campo, etiqueta, tipo_dato::text as tipo_dato, obligatorio,
            validacion->>'columna' as columna,
            (validacion->>'antiguedad_maxima_meses')::int as antiguedad_maxima_meses,
            orden
       from campos_expediente
      where actividad_id = $1
        and aplica_a::text in ('ambas', $2)
        and vigente_desde <= $3::date
        and (vigente_hasta is null or vigente_hasta >= $3::date)
      order by orden`,
    [actividadId, aplica, fecha],
  )

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    campo: r['campo'] as string,
    etiqueta: r['etiqueta'] as string,
    tipoDato: r['tipo_dato'] as CampoExpediente['tipoDato'],
    obligatorio: r['obligatorio'] as boolean,
    columna: (r['columna'] as string | null) ?? undefined,
    antiguedadMaximaMeses: (r['antiguedad_maxima_meses'] as number | null) ?? undefined,
    orden: r['orden'] as number,
  }))
}

/**
 * El documento vigente de cada campo, con su fecha de emisión.
 *
 * Excluye los documentos reemplazados: si un comprobante de domicilio se
 * sustituyó por uno nuevo, el viejo sigue en la tabla —es append-only— pero no
 * es el que cubre el campo.
 *
 * Cuando un mismo campo tiene varios documentos vigentes —posible, porque nada
 * obliga a reemplazar en vez de subir otro— gana **el más reciente por fecha de
 * emisión**. Es la lectura que favorece al obligado sin inventar nada: si tiene
 * un comprobante que cumple, cumple.
 */
export async function documentosDelExpediente(
  db: EjecutorSql,
  expedienteId: string,
): Promise<Map<string, DocumentoDelCampo>> {
  const { rows } = await db.query(
    `select distinct on (d.campo)
            d.campo, d.fecha_emision::text as fecha_emision
       from documentos d
      where d.expediente_id = $1
        and not exists (
          select 1 from documentos nuevo where nuevo.reemplaza_a = d.id
        )
      order by d.campo, d.fecha_emision desc nulls last, d.created_at desc`,
    [expedienteId],
  )

  return new Map(
    (rows as Array<{ campo: string; fecha_emision: string | null }>).map((r) => [
      r.campo,
      { fechaEmision: r.fecha_emision },
    ]),
  )
}

/**
 * Abre el expediente de un cliente, o devuelve el que ya existe.
 *
 * No se abre solo al entrar a la pantalla: abrir un expediente es un hecho que
 * queda en la bitácora con nombre y hora, y un GET que escribe convierte una
 * recarga del navegador en un evento. Se abre cuando alguien lo pide.
 */
export async function abrirExpediente(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; clienteId: string },
): Promise<{ expedienteId: string; yaExistia: boolean }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const previo = await db.query(
      `select id from expedientes where tenant_id = $1 and cliente_id = $2 order by version desc limit 1`,
      [p.sesion.tenantId, p.clienteId],
    )
    if (previo.rows.length > 0) {
      return { expedienteId: (previo.rows[0] as { id: string }).id, yaExistia: true }
    }

    const { rows } = await db.query(
      `insert into expedientes (tenant_id, cliente_id, actividad_id)
       select $1, $2, av.id
         from actividades_vulnerables av
         join actividades_tenant at on at.actividad_id = av.id and at.tenant_id = $1
        where av.fraccion = 'V_BIS'
       returning id`,
      [p.sesion.tenantId, p.clienteId],
    )
    if (rows.length === 0) {
      // Sin esta actividad dada de alta, el expediente no tendría catálogo
      // contra el cual medirse y saldría "completo" sin serlo.
      throw new Error(
        'Este obligado no tiene registrada la Fracción V Bis, así que no se le puede abrir ' +
          'un expediente de esa actividad. Revisa actividades_tenant.',
      )
    }
    const expedienteId = (rows[0] as { id: string }).id

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'expediente.abierto',
      'expediente',
      expedienteId,
      JSON.stringify({ cliente_id: p.clienteId }),
      p.sesion.usuarioId,
    ])

    return { expedienteId, yaExistia: false }
  })
}

export interface ResultadoCompletitud extends Completitud {
  expedienteId: string
}

/**
 * Recalcula la completitud y la guarda.
 *
 * No aprueba nada: 'aprobado' es una decisión humana con nombre y hora, y
 * llega en la semana 10 con el flujo de aprobación. Aquí solo se distingue
 * incompleto de completo.
 */
export async function recalcularCompletitud(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; expedienteId: string; fecha: string },
): Promise<ResultadoCompletitud> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `select e.actividad_id, e.estatus::text as estatus, c.tipo_persona::text as tipo_persona,
              to_jsonb(c) as cliente
         from expedientes e
         join clientes_finales c on c.tenant_id = e.tenant_id and c.id = e.cliente_id
        where e.id = $1`,
      [p.expedienteId],
    )
    if (rows.length === 0) throw new ExpedienteNoEncontrado(p.expedienteId)

    const fila = rows[0] as {
      actividad_id: string
      estatus: string
      tipo_persona: string
      cliente: Record<string, unknown>
    }

    const campos = await camposVigentes(db, fila.actividad_id, fila.tipo_persona, p.fecha)
    const documentos = await documentosDelExpediente(db, p.expedienteId)
    const resultado = calcularCompletitud(campos, fila.cliente, documentos, p.fecha)

    // Un expediente ya aprobado no se degrada solo: la aprobación es un acto
    // humano registrado y quitarla en silencio borraría esa firma. Si cambia
    // el catálogo bajo un expediente aprobado, eso es un caso que un humano
    // tiene que ver — llega con el flujo de aprobación de la semana 10.
    if (fila.estatus !== 'aprobado') {
      await db.query(
        `update expedientes set estatus = $2::estatus_expediente, completitud = $3::jsonb
          where id = $1`,
        [p.expedienteId, resultado.estatus, JSON.stringify(resultado)],
      )
    }

    // REGLA DURA 3: van las CLAVES de los campos que faltan, nunca su valor.
    // "falta comprobante_domicilio" es metadato; el domicilio es dato personal.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'expediente.completitud_evaluada',
      'expediente',
      p.expedienteId,
      JSON.stringify({
        estatus: resultado.estatus,
        cubiertos: resultado.cubiertos,
        total_obligatorios: resultado.totalObligatorios,
        faltantes: resultado.faltantes.map((f) => f.campo),
        fecha_evaluacion: p.fecha,
      }),
      p.sesion.usuarioId,
    ])

    return { ...resultado, expedienteId: p.expedienteId }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// La aprobación humana del expediente
// ─────────────────────────────────────────────────────────────────────────

export class AprobacionInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'AprobacionInvalida'
  }
}

/**
 * Aprobar el expediente: alguien declara que el conocimiento del cliente está
 * completo y es correcto.
 *
 * No es un cambio de estatus más. `recalcularCompletitud` dice si están todos
 * los documentos que el catálogo exige — eso es contar. Aprobar es afirmar que
 * lo que hay dentro SIRVE: que la identificación es del cliente, que el
 * comprobante corresponde al domicilio declarado, que el beneficiario
 * controlador es quien dice ser. Ninguna de esas cosas se puede contar.
 *
 * Por eso la regla vive en `app.expediente_aprobar` —SECURITY DEFINER, comprueba
 * el rol adentro— y esta función solo la envuelve: alguien que llame a la base
 * desde psql topa con lo mismo. Y por eso `recalcularCompletitud` NO aprueba
 * sola aunque el expediente quede completo: llegar a 13 de 13 no es que alguien
 * lo haya mirado.
 */
export async function aprobarExpediente(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; expedienteId: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    await db.query('select app.expediente_aprobar($1)', [p.expedienteId])
  })
}

export interface PasoDelExpediente {
  evento: string
  ocurridoEn: string
  actor: string | null
  datos: Record<string, unknown>
}

/**
 * El historial del expediente tal como lo cuenta la BITÁCORA.
 *
 * La fila de `expedientes` dice en qué estado está hoy; la bitácora dice cómo
 * llegó ahí — cada recálculo de completitud, cada documento, y quién aprobó.
 * Un expediente aprobado sin nombre no lo aprobó nadie.
 */
export async function historialDelExpediente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; expedienteId: string },
): Promise<PasoDelExpediente[]> {
  const { rows } = await db.query(
    `select b.evento,
            to_char(b.ocurrido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ocurrido_en,
            u.nombre as actor,
            b.datos
       from bitacora b
       left join usuarios u on u.tenant_id = b.tenant_id and u.id = b.actor_id
      where b.tenant_id = $1
        and (b.objeto_id = $2::uuid or b.datos->>'expediente_id' = $2::text)
      order by b.secuencia desc
      limit 50`,
    [p.sesion.tenantId, p.expedienteId],
  )

  // Se MAPEA, no se castea. Postgres devuelve `ocurrido_en` y la interfaz dice
  // `ocurridoEn`: un `as` habría dejado pasar `undefined` hasta la pantalla,
  // que lo habría pintado como "undefined UTC". El test lo atrapó; el
  // compilador no podía.
  return (
    rows as Array<{
      evento: string
      ocurrido_en: string
      actor: string | null
      datos: Record<string, unknown>
    }>
  ).map((r) => ({
    evento: r.evento,
    ocurridoEn: r.ocurrido_en,
    actor: r.actor,
    datos: r.datos,
  }))
}
