import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import { exigibilidadDelTransitorioCuarto } from './perfil'
import { estadoPepDelCliente } from './pep'
import { riesgoDelCliente } from './riesgo'
import {
  actosSinConsentir,
  exigenciaDeAprobacion,
  viaQueCorresponde,
  type ActoDelCliente,
  type AprobacionAsentada,
  type ExigenciaDeAprobacion,
  type SituacionPep,
  type SituacionRiesgo,
  type ViaDeAprobacion,
} from '../dominio/aprobacion-directivo'

/**
 * La aprobación del Art. 23 Ter 5 en la base.
 *
 * Este módulo traduce dos hechos que ya existen —la declaración PEP del Cap.
 * III Quáter y el Grado de Riesgo del Cap. III Bis— a las dos mitades de la
 * conjunción, ejecuta el disparador y asienta lo que una persona decidió.
 *
 * NO decide nada: ni si alguien es PEP (`ALCANCE.md`, frontera 6), ni qué grado
 * le toca (ADR-21), ni quién es «un directivo o su equivalente» (eso lo dice el
 * Manual del obligado, Art. 37 Bis fr. IV). Ejecuta y conserva.
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export class DatoDeAprobacionInvalido extends Error {
  readonly problemas: readonly string[]
  constructor(problemas: readonly string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeAprobacionInvalido'
    this.problemas = problemas
  }
}

/**
 * Qué es el obligado, leído de la base y no recibido como parámetro.
 *
 * De este dato depende cuál de las dos ramas del ¶2 aplica, y las dos son
 * excluyentes: una persona física no tiene directivos que firmen, una moral no
 * se subsana con una constancia. Si llegara como argumento, un llamador que lo
 * pasara mal haría que la pantalla pidiera los campos equivocados y que se
 * asentara la rama que no era. No se puede pasar, así que no se puede errar.
 */
async function tipoPersonaDelObligado(
  db: EjecutorSql,
  sesion: ContextoSesion,
): Promise<string> {
  const { rows } = await db.query(
    `select tipo_persona::text as tipo from tenants where id = $1`,
    [sesion.tenantId],
  )
  const t = (rows[0] as { tipo: string } | undefined)?.tipo
  if (t === undefined) {
    throw new DatoDeAprobacionInvalido([
      'No se encontró el obligado de la sesión, y de qué es el obligado depende cuál de las dos ' +
        'ramas del Art. 23 Ter 5 ¶2 aplica.',
    ])
  }
  return t
}

/**
 * De `EstadoPep.motivo` a las tres situaciones del dominio.
 *
 * El mapeo es donde vive la única decisión de este archivo, así que va
 * explícito y no con un `catalogado ?? false`: `sin_declaracion` es «no se
 * sabe», y `declaro_que_no` y `relojes_vencidos` son «no» de verdad — uno
 * porque el cliente lo declaró, el otro porque los dos relojes del Art. 23
 * Quáter ya corrieron.
 */
export function situacionPep(motivo: string): SituacionPep {
  if (motivo === 'sin_declaracion') return { conocida: false }
  return { conocida: true, catalogado: motivo === 'por_funcion' || motivo === 'asimilada' }
}

export interface AprobacionGuardada {
  readonly id: string
  readonly via: ViaDeAprobacion
  readonly momento: 'previa' | 'posterior'
  readonly aprobadorNombre: string | null
  readonly aprobadorCargo: string | null
  readonly motivos: string | null
  readonly fechaAprobacion: string
  readonly alcancePrevio: string | null
  readonly vigenteHasta: string | null
  readonly registradaPor: string
  readonly operacionesConsentidas: readonly string[]
}

export interface EstadoAprobacion {
  readonly exigencia: ExigenciaDeAprobacion
  /** La rama del ¶2 que le toca a este obligado. No se elige. */
  readonly via: ViaDeAprobacion
  readonly aprobaciones: readonly AprobacionGuardada[]
  /** Los actos ya exigibles que ninguna aprobación consiente. */
  readonly actosSinConsentir: readonly ActoDelCliente[]
  /** Todos los actos del cliente sujetos al capítulo, para poder nombrarlos. */
  readonly actos: readonly ActoDelCliente[]
  /**
   * Los dos hechos que la aprobación tiene que citar. `null` cuando falta
   * alguno — y entonces la exigencia es indeterminable, no «no se requiere».
   */
  readonly declaracionPepId: string | null
  readonly evaluacionRiesgoId: string | null
  readonly exigibleDesde: string
  readonly anticipado: boolean
}

const COLUMNAS = `a.id::text, a.via::text as via, a.momento::text as momento,
       a.aprobador_nombre, a.aprobador_cargo, a.motivos,
       a.fecha_aprobacion::text, a.alcance_previo, a.vigente_hasta::text,
       u.nombre as registrada_por`

interface FilaAprobacion {
  id: string
  via: ViaDeAprobacion
  momento: 'previa' | 'posterior'
  aprobador_nombre: string | null
  aprobador_cargo: string | null
  motivos: string | null
  fecha_aprobacion: string
  alcance_previo: string | null
  vigente_hasta: string | null
  registrada_por: string
}

async function aprobacionesDe(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string },
): Promise<AprobacionGuardada[]> {
  const { rows } = await db.query(
    `select ${COLUMNAS},
            coalesce(
              (select array_agg(oc.operacion_id::text)
                 from operaciones_consentidas oc where oc.aprobacion_id = a.id),
              '{}'::text[]) as operaciones
       from aprobaciones_directivo a
       join usuarios u on u.id = a.registrada_por
      where a.tenant_id = $1 and a.cliente_id = $2
      order by a.secuencia desc`,
    [p.sesion.tenantId, p.clienteId],
  )
  return (rows as (FilaAprobacion & { operaciones: string[] })[]).map(aGuardada)
}

/** La fila cruda a la aprobación. Una sola vez: la usan las dos lecturas. */
function aGuardada(f: FilaAprobacion & { operaciones: string[] }): AprobacionGuardada {
  return {
    id: f.id,
    via: f.via,
    momento: f.momento,
    aprobadorNombre: f.aprobador_nombre,
    aprobadorCargo: f.aprobador_cargo,
    motivos: f.motivos,
    fechaAprobacion: f.fecha_aprobacion,
    alcancePrevio: f.alcance_previo,
    vigenteHasta: f.vigente_hasta,
    registradaPor: f.registrada_por,
    operacionesConsentidas: f.operaciones,
  }
}

function aAsentada(a: AprobacionGuardada): AprobacionAsentada {
  return a.momento === 'posterior'
    ? {
        id: a.id,
        momento: 'posterior',
        fechaAprobacion: a.fechaAprobacion,
        operacionesConsentidas: a.operacionesConsentidas,
      }
    : {
        id: a.id,
        momento: 'previa',
        fechaAprobacion: a.fechaAprobacion,
        // El CHECK `previa_fija_alcance_y_plazo` lo garantiza en la base; si
        // llegara nulo, el `??` de abajo lo volvería una ventana de un día en
        // vez de una infinita — nunca al revés.
        vigenteHasta: a.vigenteHasta ?? a.fechaAprobacion,
      }
}

export async function estadoDeAprobacion(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<EstadoAprobacion> {
  await exigirSesionActiva(db, p.sesion)

  const exigibleDesde = await exigibilidadDelTransitorioCuarto(db)
  const pep = await estadoPepDelCliente(db, { sesion: p.sesion, clienteId: p.clienteId, hoy: p.hoy })
  const riesgo = await riesgoDelCliente(db, { sesion: p.sesion, clienteId: p.clienteId, hoy: p.hoy })

  const situacionRiesgo: SituacionRiesgo =
    riesgo.vigente === null
      ? { conocida: false }
      : { conocida: true, esAlto: riesgo.vigente.esAlto, vencida: riesgo.vigente.vencida }

  const exigencia = exigenciaDeAprobacion({
    pep: situacionPep(pep.motivo),
    riesgo: situacionRiesgo,
  })

  // Solo los actos que el Transitorio Cuarto alcanza. Comparar contra la fecha
  // del acto y no contra la de captura es lo que el transitorio dice: «a partir
  // de los actos u operaciones REALIZADOS el primero de marzo».
  const ops = await db.query(
    `select id::text, fecha_operacion::text as fecha
       from operaciones_vigentes
      where tenant_id = $1 and cliente_id = $2 and fecha_operacion >= $3::date
      order by fecha_operacion desc`,
    [p.sesion.tenantId, p.clienteId, exigibleDesde],
  )
  const actos = ops.rows as ActoDelCliente[]
  const aprobaciones = await aprobacionesDe(db, p)

  return {
    exigencia,
    via: viaQueCorresponde(await tipoPersonaDelObligado(db, p.sesion)),
    aprobaciones,
    actos,
    actosSinConsentir:
      exigencia.estado === 'exigible'
        ? actosSinConsentir({ actos, aprobaciones: aprobaciones.map(aAsentada) })
        : [],
    declaracionPepId: pep.declaracion?.id ?? null,
    evaluacionRiesgoId: riesgo.vigente?.id ?? null,
    exigibleDesde,
    anticipado: p.hoy < exigibleDesde,
  }
}

export interface DatosAprobacion {
  readonly momento: 'previa' | 'posterior'
  readonly aprobadorNombre?: string | undefined
  readonly aprobadorCargo?: string | undefined
  readonly motivos?: string | undefined
  readonly alcancePrevio?: string | undefined
  readonly vigenteHasta?: string | undefined
  /** Los actos que consiente. Obligatorio y solo para la posterior. */
  readonly operaciones?: readonly string[] | undefined
}

/**
 * Asienta la aprobación de un directivo, o la constancia que la subsana.
 *
 * `via`, `declaracion_pep_id` y `evaluacion_riesgo_id` NO llegan como
 * parámetros: se derivan del obligado y del estado del cliente. Que no se
 * puedan pasar es lo que impide asentar una aprobación citando la evidencia
 * equivocada desde la aplicación — la base además lo hace inexpresable, pero
 * la primera línea es no ofrecer el campo.
 */
export async function asentarAprobacion(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    datos: DatosAprobacion
    hoy: string
  },
): Promise<{ aprobacionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDeAprobacion(db, {
      sesion: p.sesion,
      clienteId: p.clienteId,
      hoy: p.hoy,
    })

    if (estado.exigencia.estado !== 'exigible') {
      throw new DatoDeAprobacionInvalido([
        estado.exigencia.estado === 'no_exigible'
          ? 'El Art. 23 Ter 5 no exige aprobación para este cliente: pide Persona Políticamente ' +
            'Expuesta Y, además, Grado de Riesgo alto, y consta que una de las dos no se cumple. ' +
            'Asentar una aprobación diría que sí era exigible.'
          : 'Todavía no se puede saber si el Art. 23 Ter 5 exige aprobación para este cliente. ' +
            'Falta ' +
            estado.exigencia.falta
              .map((f) =>
                f === 'caracter_pep'
                  ? 'la declaración PEP'
                  : f === 'grado_vencido'
                    ? 'reevaluar su Grado de Riesgo, que venció'
                    : 'clasificar su Grado de Riesgo',
              )
              .join(' y ') +
            '.',
      ])
    }

    // La exigencia sale de estos dos hechos, así que a estas alturas existen.
    // Si no existieran, la exigencia habría sido indeterminable.
    const declaracionPepId = estado.declaracionPepId
    const evaluacionRiesgoId = estado.evaluacionRiesgoId
    if (declaracionPepId === null || evaluacionRiesgoId === null) {
      throw new DatoDeAprobacionInvalido([
        'Falta la evidencia que la aprobación tiene que citar. Sin ella la fila no se puede ' +
          'defender, y el Art. 23 Ter 5 exige que consten las dos mitades.',
      ])
    }

    const d = p.datos
    const problemas: string[] = []
    if (d.momento === 'posterior' && (d.operaciones ?? []).length === 0) {
      problemas.push(
        'Falta decir qué actos consiente. El Art. 23 Ter 5 pide consentir «los actos u ' +
          'operaciones respectivos»: sin nombrarlos, la aprobación no consiente nada.',
      )
    }
    if (d.momento === 'previa') {
      if ((d.alcancePrevio ?? '').trim() === '') {
        problemas.push('Falta el alcance: qué actos consiente el directivo por adelantado.')
      }
      if ((d.vigenteHasta ?? '').trim() === '') {
        problemas.push(
          'Falta el plazo. Sin él, una sola firma consentiría todo lo que el cliente haga para ' +
            'siempre, y el artículo dice «los actos u operaciones respectivos».',
        )
      }
    }
    if (estado.via === 'directivo') {
      if ((d.aprobadorNombre ?? '').trim() === '' || (d.aprobadorCargo ?? '').trim() === '') {
        problemas.push('Falta quién aprobó y con qué cargo. Una aprobación anónima no es evidencia.')
      }
    } else if ((d.motivos ?? '').trim() === '') {
      problemas.push(
        'Falta señalar los motivos. Es lo único que el ¶2 le pide a la constancia del obligado ' +
          'persona física, y sin ellos la constancia está vacía.',
      )
    }
    if (problemas.length > 0) throw new DatoDeAprobacionInvalido(problemas)

    const { rows } = await db.query(
      `insert into aprobaciones_directivo
         (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo, motivos,
          fecha_aprobacion, alcance_previo, vigente_hasta,
          declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
       values ($1,$2,$3::via_aprobacion,$4::momento_aprobacion,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id::text`,
      [
        p.sesion.tenantId,
        p.clienteId,
        estado.via,
        d.momento,
        estado.via === 'directivo' ? (d.aprobadorNombre ?? null) : null,
        estado.via === 'directivo' ? (d.aprobadorCargo ?? null) : null,
        d.motivos ?? null,
        p.hoy,
        d.momento === 'previa' ? (d.alcancePrevio ?? null) : null,
        d.momento === 'previa' ? (d.vigenteHasta ?? null) : null,
        declaracionPepId,
        evaluacionRiesgoId,
        p.sesion.usuarioId,
      ],
    )
    const aprobacionId = (rows[0] as { id: string }).id

    for (const operacionId of d.operaciones ?? []) {
      await db.query(
        `insert into operaciones_consentidas (tenant_id, cliente_id, aprobacion_id, operacion_id)
         values ($1,$2,$3,$4)`,
        [p.sesion.tenantId, p.clienteId, aprobacionId, operacionId],
      )
    }

    // REGLA DURA 3: quién aprobó es dato de una persona identificada y vive en
    // la tabla, bajo RLS. En la bitácora van la vía, el momento y los ids.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'aprobacion.asentada',
      'aprobacion_directivo',
      aprobacionId,
      JSON.stringify({
        cliente_id: p.clienteId,
        via: estado.via,
        momento: d.momento,
        fecha_aprobacion: p.hoy,
        vigente_hasta: d.momento === 'previa' ? (d.vigenteHasta ?? null) : null,
        operaciones_consentidas: (d.operaciones ?? []).length,
        declaracion_pep_id: declaracionPepId,
        evaluacion_riesgo_id: evaluacionRiesgoId,
      }),
      p.sesion.usuarioId,
    ])

    return { aprobacionId }
  })
}

/**
 * ¿Esta operación queda sin el consentimiento que el Art. 23 Ter 5 exige?
 *
 * Se llama DENTRO de la transacción de `registrarOperacion`, junto al contraste
 * de perfil.
 *
 * CUÁNDO NO LEVANTA ALERTA, Y POR QUÉ NO ES UN PASE SILENCIOSO. Solo alerta
 * cuando la exigencia es EXIGIBLE y el acto quedó sin consentir. Con la
 * exigencia indeterminable no alerta, y la razón no es prudencia: lo que suele
 * hacerla indeterminable —que el obligado no tenga metodología de riesgo
 * vigente— es un hueco único y global, ya señalado en Configuración y en la
 * sección de riesgo del expediente. Levantarlo otra vez por cada operación
 * produciría N alertas para un solo arreglo, y un panel que nadie mira es peor
 * que uno corto. El hueco se muestra en el expediente, con lo que falta.
 */
export async function contrastarAprobacionAlOperar(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    operacion: ActoDelCliente
  },
): Promise<{ exigencia: ExigenciaDeAprobacion; alertaId: string | null }> {
  await exigirSesionActiva(db, p.sesion)

  const exigibleDesde = await exigibilidadDelTransitorioCuarto(db)
  if (p.operacion.fecha < exigibleDesde) {
    // Transitorio Cuarto: el capítulo alcanza a los actos realizados desde esa
    // fecha, no a los anteriores.
    return { exigencia: { estado: 'indeterminable', falta: [] }, alertaId: null }
  }

  const estado = await estadoDeAprobacion(db, {
    sesion: p.sesion,
    clienteId: p.clienteId,
    hoy: p.operacion.fecha,
  })

  if (estado.exigencia.estado !== 'exigible') {
    return { exigencia: estado.exigencia, alertaId: null }
  }

  const cubierta = !estado.actosSinConsentir.some((a) => a.id === p.operacion.id)
  if (cubierta) return { exigencia: estado.exigencia, alertaId: null }

  const { rows } = await db.query(
    `insert into alertas (tenant_id, tipo, operacion_id, titulo, detalle)
     values ($1,'aprobacion_directivo_pendiente'::tipo_alerta,$2,$3,$4::jsonb)
     returning id::text`,
    [
      p.sesion.tenantId,
      p.operacion.id,
      estado.via === 'directivo'
        ? 'Falta la aprobación de un directivo para operar con este cliente'
        : 'Falta la constancia de motivos para operar con este cliente',
      JSON.stringify({
        por: 'aprobacion_23_ter_5',
        motivo:
          'El cliente es Persona Políticamente Expuesta y, además, de Grado de Riesgo alto. El ' +
          'Art. 23 Ter 5 pide ' +
          (estado.via === 'directivo'
            ? 'la aprobación de un directivo o su equivalente que consienta este acto.'
            : 'una constancia en la que el obligado señale los motivos que consideró para ' +
              'realizar este acto.') +
          ' La operación quedó registrada: el artículo contempla detectarlo con posterioridad.',
        via: estado.via,
        grado_vencido: estado.exigencia.conGradoVencido,
      }),
    ],
  )

  return { exigencia: estado.exigencia, alertaId: (rows[0] as { id: string }).id }
}

/**
 * La exigencia y los actos sin consentir, para muchos clientes de una vez.
 *
 * Igual que su hermana de un cliente, pero sin volver a preguntar por PEP y
 * por el Grado: las dos situaciones llegan ya derivadas, porque quien llama
 * —la lista de clientes— las obtuvo por lote para todos. La tabla de tres
 * valores la resuelve `exigenciaDeAprobacion`, la MISMA función pura del
 * dominio: aquí no hay una segunda lectura del Art. 23 Ter 5.
 */
export interface EstadoAprobacionResumen {
  readonly exigencia: ExigenciaDeAprobacion
  readonly actosSinConsentir: readonly ActoDelCliente[]
  readonly aprobaciones: readonly { readonly fechaAprobacion: string }[]
  readonly anticipado: boolean
}

export async function estadoDeAprobacionDeClientes(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    clientes: ReadonlyArray<{
      readonly clienteId: string
      readonly pep: SituacionPep
      readonly riesgo: SituacionRiesgo
    }>
    hoy: string
  },
): Promise<Map<string, EstadoAprobacionResumen>> {
  await exigirSesionActiva(db, p.sesion)
  const exigibleDesde = await exigibilidadDelTransitorioCuarto(db)
  const anticipado = p.hoy < exigibleDesde
  const resumen = new Map<string, EstadoAprobacionResumen>()
  if (p.clientes.length === 0) return resumen

  const ids = p.clientes.map((c) => c.clienteId)
  const ops = await db.query(
    `select cliente_id::text as cliente_id, id::text, fecha_operacion::text as fecha
       from operaciones_vigentes
      where tenant_id = $1 and cliente_id = any($2::uuid[]) and fecha_operacion >= $3::date
      order by fecha_operacion desc`,
    [p.sesion.tenantId, ids, exigibleDesde],
  )
  const actosPorCliente = new Map<string, ActoDelCliente[]>()
  for (const f of ops.rows as { cliente_id: string; id: string; fecha: string }[]) {
    const lista = actosPorCliente.get(f.cliente_id) ?? []
    lista.push({ id: f.id, fecha: f.fecha })
    actosPorCliente.set(f.cliente_id, lista)
  }

  const aps = await db.query(
    `select a.cliente_id::text as cliente_id, ${COLUMNAS},
            coalesce(
              (select array_agg(oc.operacion_id::text)
                 from operaciones_consentidas oc where oc.aprobacion_id = a.id),
              '{}'::text[]) as operaciones
       from aprobaciones_directivo a
       join usuarios u on u.id = a.registrada_por
      where a.tenant_id = $1 and a.cliente_id = any($2::uuid[])
      order by a.secuencia desc`,
    [p.sesion.tenantId, ids],
  )
  const aprobacionesPorCliente = new Map<string, AprobacionGuardada[]>()
  for (const f of aps.rows as (FilaAprobacion & {
    cliente_id: string
    operaciones: string[]
  })[]) {
    const lista = aprobacionesPorCliente.get(f.cliente_id) ?? []
    lista.push(aGuardada(f))
    aprobacionesPorCliente.set(f.cliente_id, lista)
  }

  for (const c of p.clientes) {
    const exigencia = exigenciaDeAprobacion({ pep: c.pep, riesgo: c.riesgo })
    const actos = actosPorCliente.get(c.clienteId) ?? []
    const aprobaciones = aprobacionesPorCliente.get(c.clienteId) ?? []
    resumen.set(c.clienteId, {
      exigencia,
      aprobaciones,
      anticipado,
      actosSinConsentir:
        exigencia.estado === 'exigible'
          ? actosSinConsentir({ actos, aprobaciones: aprobaciones.map(aAsentada) })
          : [],
    })
  }
  return resumen
}
