import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { camposVigentes, documentosDelExpediente } from './expediente'
import { calcularCompletitud, type Completitud } from '../dominio/expediente'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * La revisión anual del expediente (Art. 21 del Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ CAMBIA ESTO EN EL PRODUCTO
 * ────────────────────────────────────────────────────────────────────────────
 * Hasta aquí el expediente era un acto: se integra, se aprueba, se acabó. El
 * Art. 21 lo convierte en un ciclo — «cuando menos una vez al año» — y eso es
 * trabajo que reaparece solo, para siempre, sobre cada cliente con Relación de
 * negocios. Un obligado con cuarenta clientes tiene cuarenta vencimientos que
 * nadie lleva en la cabeza.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * VERIFICAR NO ES MARCAR UNA CASILLA
 * ────────────────────────────────────────────────────────────────────────────
 * El artículo pide verificar que el expediente «cuente con todos los datos y
 * documentos […] y se encuentren actualizados». Así que verificar es AFIRMAR
 * que hoy está completo — y esta función se niega a registrar la afirmación si
 * no lo está, con la lista de lo que falta.
 *
 * La completitud se recalcula AQUÍ, a la fecha de hoy, y no se toma la que
 * está guardada: la guardada se congela al aprobar —una aprobación no se
 * degrada sola— y desde el 30 de noviembre de 2026 un expediente aprobado
 * puede tener el comprobante de domicilio vencido sin que su `estatus` lo
 * refleje. Reusar ese valor haría que la verificación anual firmara justo el
 * caso que existe para detectar.
 */

export class VerificacionImposible extends Error {
  constructor(
    mensaje: string,
    readonly completitud: Completitud,
  ) {
    super(mensaje)
    this.name = 'VerificacionImposible'
  }
}

export class NoAutorizado extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'NoAutorizado'
  }
}

export class ExpedienteNoVerificable extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ExpedienteNoVerificable'
  }
}

export interface PendienteDeRevision {
  expedienteId: string
  clienteId: string
  cliente: string
  /** Última verificación, o `null` si nunca se ha hecho. */
  verificadoEn: string | null
  /** Cuándo vence el año, 'AAAA-MM-DD'. */
  vence: string
  /** Negativo si ya se pasó. */
  diasRestantes: number
}

/**
 * Los expedientes cuya revisión anual vence dentro de `diasDeAviso`.
 *
 * Incluye los ya vencidos, que salen primero: el orden de la lista es el orden
 * en que hay que atenderlos, no el alfabético.
 */
export async function pendientesDeRevision(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string; diasDeAviso?: number },
): Promise<PendienteDeRevision[]> {
  await exigirSesionActiva(db, p.sesion)

  const { rows } = await db.query(
    `select r.expediente_id::text, r.cliente_id::text,
            c.nombre_o_razon_social as cliente,
            r.verificado_en::text, r.vence::text,
            (r.vence - $2::date) as dias
       from expedientes_por_reverificar r
       join clientes_finales c on c.tenant_id = r.tenant_id and c.id = r.cliente_id
      where r.tenant_id = $1
        and r.vence <= ($2::date + make_interval(days => $3::int))
      order by r.vence`,
    [p.sesion.tenantId, p.hoy, p.diasDeAviso ?? 30],
  )

  return (
    rows as Array<{
      expediente_id: string
      cliente_id: string
      cliente: string
      verificado_en: string | null
      vence: string
      dias: number
    }>
  ).map((r) => ({
    expedienteId: r.expediente_id,
    clienteId: r.cliente_id,
    cliente: r.cliente,
    verificadoEn: r.verificado_en,
    vence: r.vence,
    diasRestantes: r.dias,
  }))
}

/**
 * Registra la revisión anual de un expediente.
 *
 * @param p.hoy La fecha con la que se juzga: la misma que resuelve la vigencia
 *              del catálogo y la antigüedad de los documentos.
 */
export async function verificarExpediente(
  db: Client,
  p: { sesion: ContextoSesion; expedienteId: string; hoy: string },
): Promise<Completitud> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `select e.actividad_id, e.estatus::text as estatus, c.tipo_persona::text as tipo_persona,
              to_jsonb(c) as cliente
         from expedientes e
         join clientes_finales c on c.tenant_id = e.tenant_id and c.id = e.cliente_id
        where e.id = $1 and e.tenant_id = $2`,
      [p.expedienteId, p.sesion.tenantId],
    )
    if (rows.length === 0) {
      throw new ExpedienteNoVerificable(
        'No existe ese expediente en este obligado, o RLS no lo deja ver.',
      )
    }

    const fila = rows[0] as {
      actividad_id: string
      estatus: string
      tipo_persona: string
      cliente: Record<string, unknown>
    }

    const campos = await camposVigentes(db, fila.actividad_id, fila.tipo_persona, p.hoy)
    const documentos = await documentosDelExpediente(db, p.expedienteId)
    const completitud = calcularCompletitud(campos, fila.cliente, documentos, p.hoy)

    if (completitud.estatus !== 'completo') {
      throw new VerificacionImposible(
        'No se puede dar por verificado un expediente al que le falta algo. El Art. 21 pide ' +
          'comprobar que cuenta con todos los datos y documentos y que están actualizados; hoy ' +
          `faltan ${String(completitud.faltantes.length)}: ` +
          completitud.faltantes.map((f) => f.etiqueta).join(', ') +
          '.',
        completitud,
      )
    }

    // La función es SECURITY DEFINER y comprueba el rol adentro: la política de
    // UPDATE de `expedientes` prohíbe tocar los aprobados, y verificar es
    // precisamente escribir sobre uno aprobado.
    await db.query('select app.expediente_verificar($1, $2::jsonb)', [
      p.expedienteId,
      JSON.stringify(completitud),
    ])

    return completitud
  })
}

/**
 * Declara si con este cliente hay una Relación de negocios.
 *
 * No se deduce de las operaciones y no se puede: «formal y habitual» es una
 * calificación jurídica (Art. 3 fr. XIV), y quien la hace es el obligado. Lo
 * que VIZO aporta es enseñarle la definición y guardar su respuesta con fecha.
 */
export async function declararRelacionDeNegocios(
  db: Client,
  p: { sesion: ContextoSesion; clienteId: string; hay: boolean },
): Promise<void> {
  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(
      `update clientes_finales set relacion_negocios = $3 where tenant_id = $1 and id = $2`,
      [p.sesion.tenantId, p.clienteId, p.hay],
    )
    if (r.rowCount !== 1) {
      throw new NoAutorizado('No se pudo guardar: ese cliente no es de este obligado.')
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'cliente.relacion_negocios_declarada',
      'cliente',
      p.clienteId,
      JSON.stringify({ relacion_negocios: p.hay }),
      p.sesion.usuarioId,
    ])
  })
}
