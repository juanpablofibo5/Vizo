import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  centavosAPesosTexto,
  formatearPesos,
  pesosTextoACentavos,
  type Centavos,
} from '../dominio/dinero'
import {
  contrastarConElPerfil,
  mesDe,
  primerDiaReevaluable,
  reevaluacionDebida,
  vencimientoDelPerfil,
  type OperacionDelMes,
  type OrigenPerfil,
  type PerfilVigente,
  type PlazosDelPerfil,
  type ResultadoPerfil,
} from '../dominio/perfil-transaccional'

/**
 * El Perfil transaccional en la base (Cap. III Ter del Acuerdo 115/2026).
 *
 * Este módulo NO decide nada: escribe lo que el cliente declaró, deriva los
 * vencimientos del catálogo y levanta la alerta del Art. 23 Ter 2 cuando el
 * motor dice que hubo desviación. La base ya impide lo peor —mover el reloj,
 * reevaluar antes de tiempo, abrir un segundo perfil inicial—, así que aquí no
 * se repiten esas reglas: se traducen sus errores a algo atendible.
 *
 * DÓNDE VIVE EL RELOJ. Los dos plazos vienen de `parametros_motor` con su
 * fuente. Si faltan, esto se detiene: un `?? 6` cómodo sobreviviría a la
 * reforma que los cambie y nadie lo notaría hasta una revisión.
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export class DatoDePerfilInvalido extends Error {
  readonly problemas: readonly string[]
  constructor(problemas: readonly string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDePerfilInvalido'
    this.problemas = problemas
  }
}

export class PlazoDelPerfilAusente extends Error {
  constructor(clave: string) {
    super(
      `El catálogo regulatorio no tiene el plazo "${clave}". De él se deriva cuándo vence un ` +
        'Perfil transaccional (Art. 23 Ter 1), y sin fuente no se calcula: suponer seis meses ' +
        'lo dejaría cableado donde una reforma no lo alcanzaría.',
    )
    this.name = 'PlazoDelPerfilAusente'
  }
}

export interface PlazosVigentes extends PlazosDelPerfil {
  /** Transitorio Cuarto: 1 de marzo de 2027. */
  readonly exigibleDesde: string
}

async function plazo(db: EjecutorSql, clave: string): Promise<{ meses: number; desde: string }> {
  const { rows } = await db.query(
    `select (valor #>> '{}')::int as meses, vigente_desde::text as desde
       from parametros_motor
      where clave = $1 and actividad_id is null
      order by vigente_desde desc limit 1`,
    [clave],
  )
  const fila = rows[0] as { meses: number; desde: string } | undefined
  if (fila === undefined) throw new PlazoDelPerfilAusente(clave)
  return fila
}

/**
 * La fecha del acto desde la que rige el Transitorio Cuarto.
 *
 * Vive en su propia fila del catálogo y no en el `vigente_desde` de un plazo.
 * Antes se leía de ahí y daba la respuesta correcta por coincidencia: ese
 * `vigente_desde` dice desde cuándo rige el PLAZO, no desde cuándo es exigible
 * el capítulo. Dos hechos distintos con el mismo valor son justo lo que
 * `RIESGO-EBR.md` §3.1 mandó no fusionar.
 */
export async function exigibilidadDelTransitorioCuarto(db: EjecutorSql): Promise<string> {
  const { rows } = await db.query(
    `select valor #>> '{}' as fecha from parametros_motor
      where clave = 'exigibilidad_transitorio_cuarto' and actividad_id is null
      order by vigente_desde desc limit 1`,
  )
  const f = (rows[0] as { fecha: string } | undefined)?.fecha
  if (f === undefined) throw new PlazoDelPerfilAusente('exigibilidad_transitorio_cuarto')
  return f
}

export async function plazosDelPerfil(db: EjecutorSql): Promise<PlazosVigentes> {
  const maduracion = await plazo(db, 'perfil_maduracion_meses')
  const cadencia = await plazo(db, 'reevaluacion_perfil_meses')
  return {
    maduracionMeses: maduracion.meses,
    cadenciaMeses: cadencia.meses,
    exigibleDesde: await exigibilidadDelTransitorioCuarto(db),
  }
}

interface FilaPerfil {
  id: string
  origen: OrigenPerfil
  fuente: string
  monto_maximo_mensual: string
  operaciones_maximas_mensuales: number | null
  frecuencia_esperada: string | null
  zona_geografica: string | null
  origen_recursos: string | null
  destino_recursos: string | null
  actividad_economica: string | null
  fecha_ancla: string
  vigente_desde: string
  vence: string
  motivo: string | null
  registrado_en: string
}

export interface PerfilGuardado extends PerfilVigente {
  readonly fuente: string
  readonly frecuenciaEsperada: string | null
  readonly zonaGeografica: string | null
  readonly origenRecursos: string | null
  readonly destinoRecursos: string | null
  readonly actividadEconomica: string | null
  readonly vigenteDesde: string
  readonly motivo: string | null
  readonly registradoEn: string
}

function aPerfil(f: FilaPerfil): PerfilGuardado {
  return {
    perfilId: f.id,
    origen: f.origen,
    fuente: f.fuente,
    montoMaximoMensual: pesosTextoACentavos(f.monto_maximo_mensual),
    operacionesMaximasMensuales: f.operaciones_maximas_mensuales,
    frecuenciaEsperada: f.frecuencia_esperada,
    zonaGeografica: f.zona_geografica,
    origenRecursos: f.origen_recursos,
    destinoRecursos: f.destino_recursos,
    actividadEconomica: f.actividad_economica,
    fechaAncla: f.fecha_ancla,
    vigenteDesde: f.vigente_desde,
    vence: f.vence,
    motivo: f.motivo,
    registradoEn: f.registrado_en,
  }
}

const COLUMNAS = `id::text, origen::text as origen, fuente::text as fuente,
       monto_maximo_mensual::text, operaciones_maximas_mensuales,
       frecuencia_esperada, zona_geografica, origen_recursos, destino_recursos,
       actividad_economica, fecha_ancla::text, vigente_desde::text, vence::text,
       motivo, registrado_en::text`

/** El perfil vigente de un cliente, o `null` si nunca se asentó ninguno. */
export async function perfilVigenteDe(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string },
): Promise<PerfilGuardado | null> {
  const { rows } = await db.query(
    `select ${COLUMNAS} from perfiles_transaccionales
      where tenant_id = $1 and cliente_id = $2
      order by secuencia desc limit 1`,
    [p.sesion.tenantId, p.clienteId],
  )
  const f = rows[0] as FilaPerfil | undefined
  return f === undefined ? null : aPerfil(f)
}

export interface ActoDelCliente {
  readonly id: string
  readonly fecha: string
  readonly monto: string
}

export interface EstadoPerfil {
  readonly vigente: PerfilGuardado | null
  /** Append-only: de la más reciente a la primera. */
  readonly historial: readonly PerfilGuardado[]
  readonly plazos: PlazosVigentes
  /** Ya cumplió la maduración del ¶3 y espera el ejercicio periódico. */
  readonly reevaluacionDebida: boolean
  /** Desde cuándo se le puede reevaluar. `null` si aún no hay perfil. */
  readonly reevaluableDesde: string | null
  /** El capítulo todavía no es exigible, y el obligado se adelantó. */
  readonly anticipado: boolean
  /**
   * Los actos del cliente, para poder anclar un perfil que faltó. El ancla no
   * es «hoy» ni «la fecha de captura»: es la del acto (¶2), así que hay que
   * elegir cuál.
   */
  readonly actos: readonly ActoDelCliente[]
}

export async function estadoDelPerfil(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<EstadoPerfil> {
  await exigirSesionActiva(db, p.sesion)
  const plazos = await plazosDelPerfil(db)

  const { rows } = await db.query(
    `select ${COLUMNAS} from perfiles_transaccionales
      where tenant_id = $1 and cliente_id = $2
      order by secuencia desc`,
    [p.sesion.tenantId, p.clienteId],
  )
  const historial = (rows as FilaPerfil[]).map(aPerfil)
  const vigente = historial[0] ?? null

  const ops = await db.query(
    `select id::text, fecha_operacion::text as fecha, monto_total::text as monto
       from operaciones_vigentes
      where tenant_id = $1 and cliente_id = $2
      order by fecha_operacion desc limit 20`,
    [p.sesion.tenantId, p.clienteId],
  )

  return {
    actos: ops.rows as ActoDelCliente[],
    vigente,
    historial,
    plazos,
    reevaluacionDebida: vigente !== null && reevaluacionDebida(vigente, p.hoy),
    reevaluableDesde: vigente === null ? null : primerDiaReevaluable(vigente.fechaAncla, plazos),
    anticipado: p.hoy < plazos.exigibleDesde,
  }
}

export interface DatosPerfil {
  readonly origen: OrigenPerfil
  readonly fuente: 'declarada_por_cliente' | 'archivos_del_obligado'
  readonly montoMaximoMensual: Centavos
  readonly operacionesMaximasMensuales?: number | undefined
  readonly frecuenciaEsperada?: string | undefined
  readonly zonaGeografica?: string | undefined
  readonly origenRecursos?: string | undefined
  readonly destinoRecursos?: string | undefined
  readonly actividadEconomica?: string | undefined
  /** Obligatoria para `inicial` y `acto_unico`: es el acto que ancla el reloj. */
  readonly operacionId?: string | undefined
  readonly motivo?: string | undefined
}

/**
 * Asienta un perfil: el inicial del ¶2, la reevaluación del ¶3, una corrección
 * o el de acto único del ¶4.
 *
 * `vence` NO llega como parámetro: se deriva aquí del catálogo y el trigger de
 * la base lo vuelve a calcular. Que nadie pueda pasarlo es lo que impide
 * comprar tiempo con una captura.
 */
export async function registrarPerfil(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; clienteId: string; datos: DatosPerfil; hoy: string },
): Promise<{ perfilId: string }> {
  return enTransaccionDeSesion(db, p.sesion, () => asentarPerfil(db, p))
}

/**
 * El cuerpo de lo anterior, para llamarse DESDE DENTRO de una transacción ya
 * abierta — que es como lo usa `registrarOperacion`.
 *
 * No abre la suya: un `begin` anidado en Postgres es un no-op con warning y el
 * `commit` interno cerraría la transacción externa a media faena. Por eso exige
 * la sesión activa en vez de crearla.
 */
export async function asentarPerfil(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; clienteId: string; datos: DatosPerfil; hoy: string },
): Promise<{ perfilId: string }> {
  await exigirSesionActiva(db, p.sesion)
  const d = p.datos
  const problemas: string[] = []

  if (d.montoMaximoMensual <= 0) {
    problemas.push(
      'El monto máximo mensual que declara el cliente tiene que ser mayor que cero. ' +
        'Un tope en cero no es un perfil: haría que toda operación se desviara.',
    )
  }
  if (d.operacionesMaximasMensuales !== undefined && d.operacionesMaximasMensuales <= 0) {
    problemas.push('El número máximo de operaciones al mes, si se declara, tiene que ser mayor que cero.')
  }
  if ((d.origen === 'inicial' || d.origen === 'acto_unico') && d.operacionId === undefined) {
    problemas.push(
      'Falta el acto que ancla el perfil. El Art. 23 Ter 1 ¶2 cuenta los seis meses desde el ' +
        'acto u operación, no desde la captura.',
    )
  }
  if (
    (d.origen === 'reevaluacion' || d.origen === 'correccion') &&
    (d.motivo === undefined || d.motivo.trim() === '')
  ) {
    problemas.push('Falta decir por qué. Una reevaluación o una corrección sin razón asentada no se puede defender.')
  }
  if (problemas.length > 0) throw new DatoDePerfilInvalido(problemas)

  {
    const plazos = await plazosDelPerfil(db)
    const previo = await perfilVigenteDe(db, { sesion: p.sesion, clienteId: p.clienteId })

    // El ancla: la fecha del acto que se nombra, o la del perfil que se hereda.
    let fechaAncla: string
    if (d.operacionId !== undefined) {
      const { rows } = await db.query(
        `select fecha_operacion::text as fecha from operaciones
          where tenant_id = $1 and id = $2 and cliente_id = $3`,
        [p.sesion.tenantId, d.operacionId, p.clienteId],
      )
      const op = rows[0] as { fecha: string } | undefined
      if (op === undefined) {
        throw new DatoDePerfilInvalido([
          'El acto que se indicó no es una operación de este cliente. El ancla del perfil tiene ' +
            'que ser un acto suyo, o los seis meses correrían desde una fecha ajena.',
        ])
      }
      fechaAncla = op.fecha
    } else {
      if (previo === null) {
        throw new DatoDePerfilInvalido([
          'Este cliente no tiene Perfil transaccional que reevaluar ni corregir. El primero se ' +
            'asienta con lo que el cliente declaró al realizar su acto (Art. 23 Ter 1 ¶2).',
        ])
      }
      fechaAncla = previo.fechaAncla
    }

    const vigenteDesde = d.origen === 'correccion' ? (previo?.vigenteDesde ?? p.hoy) : p.hoy
    const vence = vencimientoDelPerfil(
      d.origen === 'reevaluacion'
        ? { origen: 'reevaluacion', vigenteDesde }
        : d.origen === 'correccion'
          ? { origen: 'correccion', venceDelCorregido: previo!.vence }
          : { origen: d.origen, fechaAncla },
      plazos,
    )

    const { rows } = await db.query(
      `insert into perfiles_transaccionales
         (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
          operaciones_maximas_mensuales, frecuencia_esperada, zona_geografica,
          origen_recursos, destino_recursos, actividad_economica,
          fecha_ancla, operacion_id, vigente_desde, vence, corrige_a, motivo, registrado_por)
       values ($1,$2,$3::origen_perfil,$4::fuente_perfil,$5,$6,$7,$8,$9,$10,$11,
               $12,$13,$14,$15,$16,$17,$18)
       returning id::text`,
      [
        p.sesion.tenantId,
        p.clienteId,
        d.origen,
        d.fuente,
        centavosAPesosTexto(d.montoMaximoMensual),
        d.operacionesMaximasMensuales ?? null,
        d.frecuenciaEsperada ?? null,
        d.zonaGeografica ?? null,
        d.origenRecursos ?? null,
        d.destinoRecursos ?? null,
        d.actividadEconomica ?? null,
        fechaAncla,
        d.operacionId ?? null,
        vigenteDesde,
        vence,
        d.origen === 'correccion' ? previo!.perfilId : null,
        d.motivo ?? null,
        p.sesion.usuarioId,
      ],
    )
    const perfilId = (rows[0] as { id: string }).id

    // REGLA DURA 3: el tope y las fechas sí; quién es el cliente, no. El
    // cliente va como id opaco, igual que en el resto de la bitácora.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      `perfil.${d.origen}`,
      'perfil_transaccional',
      perfilId,
      JSON.stringify({
        cliente_id: p.clienteId,
        origen: d.origen,
        fuente: d.fuente,
        monto_maximo_mensual: centavosAPesosTexto(d.montoMaximoMensual),
        operaciones_maximas_mensuales: d.operacionesMaximasMensuales ?? null,
        fecha_ancla: fechaAncla,
        vigente_desde: vigenteDesde,
        vence,
      }),
      p.sesion.usuarioId,
    ])

    return { perfilId }
  }
}

/**
 * El sistema de alertas del Art. 23 Ter 2, corriendo en el mismo acto en que se
 * registra la operación.
 *
 * Se llama DENTRO de la transacción de `registrarOperacion`: una operación
 * guardada cuya desviación se calcula después es una desviación que puede no
 * calcularse nunca. El texto pide «detección oportuna», no un lote nocturno.
 *
 * CUÁNDO NO HACE NADA, Y POR QUÉ NO ES UN PASE SILENCIOSO. El Cap. III Ter es
 * exigible a partir de los actos realizados el 1 de marzo de 2027 (Transitorio
 * Cuarto). Antes de esa fecha, un cliente sin perfil no genera alerta: el
 * hueco existe pero todavía no es incumplimiento, y llenar el panel de alertas
 * por una obligación que no ha entrado enseña a la gente a ignorarlo. Si el
 * obligado ya asentó un perfil, se contrasta desde el primer día — se adelantó
 * a propósito.
 */
export async function contrastarConSuPerfil(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    operacion: OperacionDelMes
  },
): Promise<{ resultado: ResultadoPerfil; alertaId: string | null }> {
  await exigirSesionActiva(db, p.sesion)
  const perfil = await perfilVigenteDe(db, { sesion: p.sesion, clienteId: p.clienteId })
  const plazos = await plazosDelPerfil(db)

  if (perfil === null && p.operacion.fecha < plazos.exigibleDesde) {
    return { resultado: { estado: 'sin_perfil', mes: mesDe(p.operacion.fecha) }, alertaId: null }
  }

  const mes = mesDe(p.operacion.fecha)
  const { rows } = await db.query(
    `select id::text, fecha_operacion::text as fecha, monto_total::text as monto
       from operaciones_vigentes
      where tenant_id = $1 and cliente_id = $2
        and to_char(fecha_operacion, 'YYYY-MM') = $3`,
    [p.sesion.tenantId, p.clienteId, mes],
  )
  const delMes: OperacionDelMes[] = (rows as { id: string; fecha: string; monto: string }[]).map(
    (o) => ({ id: o.id, fecha: o.fecha, monto: pesosTextoACentavos(o.monto) }),
  )

  const resultado = contrastarConElPerfil({
    perfil,
    operacion: p.operacion,
    operacionesDelMes: delMes,
  })

  if (resultado.estado === 'dentro_del_perfil') return { resultado, alertaId: null }

  const titulo =
    resultado.estado === 'sin_perfil'
      ? 'Operación sin Perfil transaccional asentado'
      : 'La operación se aparta del Perfil transaccional declarado'

  // `detalle` es jsonb y no una frase: la pantalla arma el texto y el dato
  // queda consultable. Y no lleva nombre ni RFC — se llega al cliente por la
  // operación, bajo RLS.
  const detalle =
    resultado.estado === 'sin_perfil'
      ? {
          por: 'sin_perfil',
          motivo:
            'El cliente operó sin que se asentara el monto máximo mensual que declaró. El ' +
            'Art. 23 Ter 1 ¶2 lo pide al momento del acto, y sin él no hay contra qué comparar.',
          mes: resultado.mes,
        }
      : {
          por: resultado.desviaciones.map((d) => d.por).join('+'),
          motivo: motivoDeLaDesviacion(resultado.desviaciones),
          mes: resultado.mes,
          acumulado_del_mes: centavosAPesosTexto(resultado.acumuladoDelMes),
          operaciones_del_mes: resultado.operacionesDelMes,
          desviaciones: resultado.desviaciones.map((d) =>
            d.por === 'monto_mensual'
              ? {
                  por: d.por,
                  declarado: centavosAPesosTexto(d.declarado),
                  acumulado_del_mes: centavosAPesosTexto(d.acumuladoDelMes),
                  excedente: centavosAPesosTexto(d.excedente),
                }
              : d,
          ),
        }

  // Dos tipos y no uno: el hueco y la desviación se atienden distinto, y
  // separarlos es lo que permite exigir en la base que una desviación SIEMPRE
  // pueda decir contra qué perfil se desvió.
  const ins = await db.query(
    `insert into alertas (tenant_id, tipo, perfil_id, operacion_id, titulo, detalle)
     values ($1,$2::tipo_alerta,$3,$4,$5,$6::jsonb) returning id::text`,
    [
      p.sesion.tenantId,
      resultado.estado === 'sin_perfil' ? 'perfil_ausente' : 'desviacion_perfil',
      resultado.estado === 'sin_perfil' ? null : resultado.perfilId,
      p.operacion.id,
      titulo,
      JSON.stringify(detalle),
    ],
  )
  return { resultado, alertaId: (ins.rows[0] as { id: string }).id }
}

function motivoDeLaDesviacion(
  desviaciones: readonly (
    | { por: 'monto_mensual'; declarado: Centavos; acumuladoDelMes: Centavos; excedente: Centavos }
    | { por: 'numero_mensual'; declarado: number; operacionesDelMes: number }
    | { por: 'acto_unico_roto'; operacionesDelMes: number }
  )[],
): string {
  return desviaciones
    .map((d) => {
      if (d.por === 'monto_mensual') {
        return (
          `El mes acumula ${formatearPesos(d.acumuladoDelMes)} y el cliente declaró un máximo ` +
          `mensual de ${formatearPesos(d.declarado)}: ${formatearPesos(d.excedente)} por encima.`
        )
      }
      if (d.por === 'numero_mensual') {
        return (
          `Van ${String(d.operacionesDelMes)} operaciones en el mes y el cliente declaró un ` +
          `máximo de ${String(d.declarado)}.`
        )
      }
      return (
        'El perfil se asentó como de acto único, y el cliente volvió a operar: la relación no ' +
        'se extinguió en aquel acto, así que ese perfil ya no la describe.'
      )
    })
    .join(' ')
}
