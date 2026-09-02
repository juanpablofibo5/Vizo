import { cargarConfigActividad, type EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'
import { historialParaAcumulacion, resolverIdentidad } from './historial'
import { registrarEvaluacion } from './evaluaciones'
import { evaluar } from '../dominio/motor'
import { centavos, centavosAPesosTexto, pesosTextoACentavos, type Centavos } from '../dominio/dinero'
import type { Evaluacion } from '../dominio/tipos'
import { asentarPerfil, contrastarConSuPerfil, perfilVigenteDe } from './perfil'
import { contrastarAprobacionAlOperar } from './aprobacion'
import { alertarPorRiesgoYPep } from './alertas-art41'
import type { ExigenciaDeAprobacion } from '../dominio/aprobacion-directivo'
import type { ResultadoPerfil } from '../dominio/perfil-transaccional'

/** Lo que el cliente estima, dicho por él, al realizar su acto. */
export interface DeclaracionDelCliente {
  /** `acto_unico` cuando la relación se extingue en este mismo acto (¶4). */
  readonly origen: 'inicial' | 'acto_unico'
  readonly fuente: 'declarada_por_cliente' | 'archivos_del_obligado'
  readonly montoMaximoMensual: Centavos
  readonly operacionesMaximasMensuales?: number | undefined
  readonly frecuenciaEsperada?: string | undefined
  readonly zonaGeografica?: string | undefined
  readonly origenRecursos?: string | undefined
  readonly destinoRecursos?: string | undefined
  readonly actividadEconomica?: string | undefined
}

/**
 * Registro de operaciones.
 *
 * Este es el punto donde el producto hace lo que promete: se captura un pago y
 * el sistema dice, en el mismo acto, si hay obligación. Antes de la semana 7 el
 * motor existía y nadie lo llamaba.
 *
 * TODO OCURRE EN UNA SOLA TRANSACCIÓN: la operación, su evaluación y sus
 * alertas. Una operación sin evaluación es una operación que nadie revisó —y
 * eso no se distingue de una que se revisó y no requería aviso—. Una
 * evaluación sin su operación no se puede explicar. Ninguna de las dos puede
 * existir sola.
 *
 * APPEND-ONLY: corregir una operación es insertar una fila nueva con
 * `corrige_a`. La vista `operaciones_vigentes` excluye las corregidas, y es la
 * que alimenta la acumulación.
 */

export interface EjecutorTransaccional extends EjecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<{ rows: unknown[] }>
}

export class OperacionInvalida extends Error {
  readonly problemas: readonly string[]
  constructor(problemas: readonly string[]) {
    super(problemas.join(' '))
    this.name = 'OperacionInvalida'
    this.problemas = problemas
  }
}

export interface DatosOperacion {
  sucursalId: string
  clienteId: string
  fechaOperacion: string
  /** Todos en centavos enteros. Nunca float: ver src/dominio/dinero.ts. */
  montoBase: Centavos
  iva: Centavos
  isai: Centavos
  otrosAccesorios: Centavos
  /** Catálogo c_FormaPago del SAT. '01' es efectivo. */
  formaPago: string
  descripcionBien?: string | undefined
  desarrolloId?: string | undefined
  /**
   * Bajo qué actividad vulnerable se evalúa.
   *
   * Opcional solo cuando el obligado tiene UNA contratada, que es el caso
   * normal. Con varias es obligatorio: ver la resolución más abajo.
   */
  actividadId?: string | undefined
  /**
   * Lo que el cliente declara AL MOMENTO DEL ACTO (Art. 23 Ter 1 ¶2): «la
   * información que proporcione […] en ese momento, relativa a los montos
   * máximos mensuales […] que los propios Clientes o Usuarias estimen
   * realizar».
   *
   * Va aquí, y no en una pantalla aparte, porque el texto lo ata al acto: un
   * perfil que se asienta después es un perfil que puede no asentarse nunca, y
   * mientras tanto la operación que debía anclarlo levanta el hueco. Solo
   * aplica cuando el cliente todavía no tiene perfil; si ya tiene, cambiarlo es
   * una reevaluación o una corrección, con su razón asentada.
   */
  perfilDeclarado?: DeclaracionDelCliente | undefined
  /** Id de la operación que esta corrige. La anterior no se borra jamás. */
  corrigeA?: string | undefined

  // ── Datos que el AVISO exige y la operación tiene que traer desde la captura
  //
  // No son derivables de lo de arriba. `instrumentoMonetario` y `moneda`
  // pertenecen a los catálogos del SPPLD, mientras que `formaPago` es el
  // c_FormaPago del SAT: catálogos distintos, sin correspondencia uno a uno.
  //
  // Van opcionales porque el motor de umbrales no los necesita para decidir, y
  // una operación bajo umbral nunca llega al aviso. Cuando SÍ llega y falta
  // alguno, `generarAviso` se detiene y dice cuál — en vez de emitir un XML al
  // que la autoridad le encuentra el hueco (regla dura 6).
  /** Catálogo `instrumento_monetario` del SPPLD. */
  instrumentoMonetario?: string | undefined
  /** Catálogo `moneda` del SPPLD. */
  monedaCodigo?: string | undefined
  aportacionFideicomiso?: boolean | undefined
  nombreInstitucion?: string | undefined
}

export interface ResultadoOperacion {
  operacionId: string
  evaluacionId: string
  evaluacion: Evaluacion
  alertas: string[]
  /**
   * El contraste contra el Perfil transaccional del cliente (Art. 23 Ter 2).
   * Va en el mismo resultado que la evaluación de umbral porque ocurre en el
   * mismo acto: son dos preguntas distintas sobre la misma operación.
   */
  perfil: ResultadoPerfil
  /**
   * Si este acto necesitaba el consentimiento del Art. 23 Ter 5. No impide
   * registrar: el ¶1 contempla detectarlo «con posterioridad al acto».
   */
  aprobacion: ExigenciaDeAprobacion
}

/** Formas de pago que el catálogo del SAT considera efectivo. */
const FORMA_PAGO_EFECTIVO = '01'

export async function registrarOperacion(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; datos: DatosOperacion },
): Promise<ResultadoOperacion> {
  const d = p.datos
  const problemas: string[] = []

  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fechaOperacion)) {
    problemas.push('La fecha de la operación debe venir como AAAA-MM-DD.')
  }
  if (d.montoBase <= 0) {
    problemas.push('El monto de la operación tiene que ser mayor que cero.')
  }
  for (const [nombre, v] of [
    ['IVA', d.iva],
    ['ISAI', d.isai],
    ['los accesorios', d.otrosAccesorios],
  ] as const) {
    if (v < 0) problemas.push(`El importe de ${nombre} no puede ser negativo.`)
  }
  if (d.formaPago.trim() === '') {
    problemas.push('Falta la forma de pago: decide si la operación es en efectivo.')
  }
  if (problemas.length > 0) throw new OperacionInvalida(problemas)

  const montoTotal = centavos(d.montoBase + d.iva + d.isai + d.otrosAccesorios)

  return enTransaccionDeSesion(db, p.sesion, async () => {
    // ── De qué actividad es esta operación ──────────────────────────────
    //
    // HALLAZGO DE LA PRUEBA X-01. Aquí decía `where av.fraccion = 'V_BIS'`. El
    // motor siempre fue agnóstico de fracción —`evaluar(operacion, config)`—,
    // pero su PUERTA DE ENTRADA no: dar de alta la Fr. XV solo con INSERTs al
    // catálogo dejaba una fracción que el catálogo conocía y que ninguna
    // operación podía usar.
    //
    // Es justo el defecto que el caso X-01 existe para encontrar, y la
    // restricción no negociable #7 lo llama por su nombre: el motor es
    // agnóstico de fracción. Serlo a medias no cuenta.
    //
    // Se mantiene el principio original: la actividad sale de las que el
    // OBLIGADO tiene contratadas, no de un campo libre del formulario. Con una
    // sola contratada se resuelve sola; con varias hay que decir cuál, porque
    // adivinar evaluaría la operación contra los umbrales de otra fracción — y
    // eso produce un aviso omitido o uno que no tocaba.
    const act = await db.query(
      `select av.id, av.fraccion
         from actividades_vulnerables av
         join actividades_tenant at on at.actividad_id = av.id and at.tenant_id = $1
        where ($2::uuid is null or av.id = $2::uuid)
        order by av.fraccion`,
      [p.sesion.tenantId, d.actividadId ?? null],
    )
    if (act.rows.length === 0) {
      throw new OperacionInvalida([
        d.actividadId === undefined
          ? 'Este obligado no tiene ninguna actividad vulnerable contratada, así que no se ' +
            'puede evaluar la operación contra ningún umbral. Revisa actividades_tenant.'
          : `La actividad ${d.actividadId} no está contratada por este obligado.`,
      ])
    }
    if (act.rows.length > 1) {
      const fracciones = (act.rows as Array<{ fraccion: string }>).map((a) => a.fraccion)
      throw new OperacionInvalida([
        `Este obligado tiene varias actividades contratadas (${fracciones.join(', ')}) y la ` +
          'operación no dice a cuál pertenece. No se asume una: evaluarla contra los umbrales ' +
          'de otra fracción produce un aviso omitido o uno que no tocaba.',
      ])
    }
    const actividad = act.rows[0] as { id: string; fraccion: string }

    // `registrado_en` lo pone la BASE con now(), nunca el cliente ni el
    // servidor de aplicación: es la hora que se defiende como momento de
    // captura (restricción no negociable 2).
    const ins = await db.query(
      `insert into operaciones (
         tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
         monto_base, iva, isai, otros_accesorios, monto_total,
         forma_pago, descripcion_bien, desarrollo_id, corrige_a, registrado_por,
         instrumento_monetario, moneda_codigo, aportacion_fideicomiso, nombre_institucion
       ) values ($1,$2,$3,$4,$5::date,
                 $6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,
                 $11,$12,$13,$14,$15,
                 $16,$17,coalesce($18::boolean,false),$19)
       returning id, registrado_en::text`,
      [
        p.sesion.tenantId,
        d.sucursalId,
        d.clienteId,
        actividad.id,
        d.fechaOperacion,
        centavosAPesosTexto(d.montoBase),
        centavosAPesosTexto(d.iva),
        centavosAPesosTexto(d.isai),
        centavosAPesosTexto(d.otrosAccesorios),
        centavosAPesosTexto(montoTotal),
        d.formaPago,
        d.descripcionBien ?? null,
        d.desarrolloId ?? null,
        d.corrigeA ?? null,
        p.sesion.usuarioId,
        d.instrumentoMonetario ?? null,
        d.monedaCodigo ?? null,
        d.aportacionFideicomiso ?? null,
        d.nombreInstitucion ?? null,
      ],
    )
    const operacionId = (ins.rows[0] as { id: string }).id

    // ── El motor ────────────────────────────────────────────────────────────
    // El catálogo se carga a la FECHA DE LA OPERACIÓN, no a la de captura: una
    // operación de enero se evalúa con la UMA de enero aunque se registre en
    // marzo. Es el gotcha del 1 de febrero.
    const config = await cargarConfigActividad(db, actividad.fraccion, d.fechaOperacion)

    const cli = await db.query(
      `select rfc, curp, identidad_alterna from clientes_finales where id = $1`,
      [d.clienteId],
    )
    if (cli.rows.length === 0) {
      throw new OperacionInvalida([
        'El cliente de la operación no existe en este obligado.',
      ])
    }
    const resolucion = resolverIdentidad(
      cli.rows[0] as { rfc: string | null; curp: string | null; identidadAlterna?: unknown },
    )

    const historial = await historialParaAcumulacion(db, {
      sesion: p.sesion,
      clienteId: d.clienteId,
      actividadId: actividad.id,
      fechaOperacion: d.fechaOperacion,
      ventanaMeses: config.ventanaMeses,
      // La operación que se acaba de insertar NO puede estar en su propio
      // historial: se contaría dos veces. Lo encontró la auditoría de la
      // semana 4 y por eso el motor además lo verifica como precondición.
      excluirOperacionId: operacionId,
    })

    const evaluacion = evaluar(
      {
        operacion: {
          id: operacionId,
          clienteId: d.clienteId,
          sucursalId: d.sucursalId,
          actividadId: actividad.id,
          fechaOperacion: d.fechaOperacion,
          montoBase: d.montoBase,
          iva: d.iva,
          isai: d.isai,
          otrosAccesorios: d.otrosAccesorios,
          montoTotal,
          formaPago: d.formaPago,
          esEfectivo: d.formaPago === FORMA_PAGO_EFECTIVO,
        },
        cliente: { id: d.clienteId, resolucionIdentidad: resolucion },
        historial,
      },
      config,
    )

    const evaluacionId = await registrarEvaluacion(db, {
      sesion: p.sesion,
      evaluacion,
      config,
    })

    const alertas = await crearAlertas(db, p.sesion, evaluacionId, evaluacion)

    // Lo que el cliente declaró en este acto, antes de contrastar: el perfil
    // que ancla el reloj es el de esta misma operación (Art. 23 Ter 1 ¶2).
    if (d.perfilDeclarado !== undefined) {
      const yaTiene = await perfilVigenteDe(db, {
        sesion: p.sesion,
        clienteId: d.clienteId,
      })
      if (yaTiene !== null) {
        throw new OperacionInvalida([
          'Este cliente ya tiene Perfil transaccional asentado, así que no vuelve a declararlo ' +
            'con cada acto. Cambiarlo es una reevaluación o una corrección, y ambas piden decir ' +
            'por qué.',
        ])
      }
      await asentarPerfil(db, {
        sesion: p.sesion,
        clienteId: d.clienteId,
        hoy: d.fechaOperacion,
        datos: { ...d.perfilDeclarado, operacionId: operacionId },
      })
    }

    // El sistema de alertas del Art. 23 Ter 2, en la misma transacción. Una
    // operación guardada cuya desviación se calcula después es una desviación
    // que puede no calcularse nunca.
    const perfil = await contrastarConSuPerfil(db, {
      sesion: p.sesion,
      clienteId: d.clienteId,
      operacion: { id: operacionId, fecha: d.fechaOperacion, monto: montoTotal },
    })
    if (perfil.alertaId !== null) alertas.push(perfil.alertaId)

    // Art. 23 Ter 5. Va después del perfil porque responde otra pregunta: no
    // si la operación es rara, sino si quien la hace exige que alguien firme.
    const aprobacion = await contrastarAprobacionAlOperar(db, {
      sesion: p.sesion,
      clienteId: d.clienteId,
      operacion: { id: operacionId, fecha: d.fechaOperacion },
    })
    if (aprobacion.alertaId !== null) alertas.push(aprobacion.alertaId)

    // Art. 41 fr. V. Va aquí y no en la pantalla que clasifica al cliente
    // porque el texto habla de los ACTOS que se pretendan llevar a cabo con
    // esa clase de cliente, no de la clasificación en sí.
    const art41 = await alertarPorRiesgoYPep(db, {
      sesion: p.sesion,
      clienteId: d.clienteId,
      operacion: { id: operacionId, fecha: d.fechaOperacion },
    })
    if (art41.riesgoAltoId !== null) alertas.push(art41.riesgoAltoId)
    if (art41.pepId !== null) alertas.push(art41.pepId)

    // REGLA DURA 3: montos y resultado sí; nombre, RFC y CURP del cliente NO.
    // El cliente va como id opaco, que es lo que permite auditar sin filtrar.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      d.corrigeA === undefined ? 'operacion.registrada' : 'operacion.corregida',
      'operacion',
      operacionId,
      JSON.stringify({
        cliente_id: d.clienteId,
        sucursal_id: d.sucursalId,
        fecha_operacion: d.fechaOperacion,
        monto_base: centavosAPesosTexto(d.montoBase),
        monto_total: centavosAPesosTexto(montoTotal),
        forma_pago: d.formaPago,
        corrige_a: d.corrigeA ?? null,
        resultado_aviso: evaluacion.resultadoAviso,
        evaluacion_id: evaluacionId,
        catalogo_version: evaluacion.insumos.catalogoVersion,
      }),
      p.sesion.usuarioId,
    ])

    return {
      operacionId,
      evaluacionId,
      evaluacion,
      alertas,
      perfil: perfil.resultado,
      aprobacion: aprobacion.exigencia,
    }
  })
}

/**
 * Las alertas que la evaluación deja abiertas.
 *
 * Una alerta NO es el aviso: es lo que un humano tiene que mirar. VIZO nunca
 * presenta nada solo (regla dura 5), así que el resultado del motor termina
 * aquí, en una bandeja, y no en un envío.
 *
 * `detalle` es jsonb y no una frase: la pantalla arma el texto, y así el dato
 * queda consultable ("cuántas alertas de acumulación cruzaron el umbral por
 * menos de X"). Una oración en español no se puede filtrar.
 *
 * No lleva nombre ni RFC: la alerta apunta a la evaluación, y de ahí se llega
 * al cliente por RLS cuando alguien con permiso lo abre.
 */
async function crearAlertas(
  db: EjecutorSql,
  sesion: ContextoSesion,
  evaluacionId: string,
  ev: Evaluacion,
): Promise<string[]> {
  const pendientes: Array<{
    tipo: string
    titulo: string
    detalle: Record<string, unknown>
  }> = []

  if (ev.resultadoAviso === 'individual') {
    pendientes.push({
      tipo: 'aviso_requerido',
      titulo: 'Aviso requerido por monto individual',
      detalle: {
        por: 'monto_individual',
        motivo: ev.motivo,
        monto_base: centavosAPesosTexto(ev.insumos.montoBaseConsiderado),
      },
    })
  } else if (ev.resultadoAviso === 'acumulacion') {
    pendientes.push({
      tipo: 'aviso_requerido',
      titulo: 'Aviso requerido por acumulación de 6 meses',
      detalle: {
        por: 'acumulacion',
        motivo: ev.motivo,
        suma_ventana: centavosAPesosTexto(ev.sumaVentana ?? centavos(0)),
        // +1 porque la operación evaluada no está en su propio historial.
        operaciones_en_ventana: ev.operacionesAcumuladas.length + 1,
        ventana_meses: ev.insumos.ventanaMeses,
      },
    })
  }

  if (ev.alertaProximidad) {
    pendientes.push({
      tipo: 'proximidad',
      titulo: 'Cerca del umbral de aviso',
      detalle: {
        por: 'proximidad',
        motivo: 'Quedó por debajo del umbral pero cerca; la siguiente operación puede cruzarlo.',
        umbral_proximidad_pct: ev.insumos.proximidadPct,
      },
    })
  }

  if (ev.efectivoRestringido) {
    pendientes.push({
      tipo: 'aviso_requerido',
      titulo: 'Efectivo por encima del límite del Art. 32',
      detalle: {
        por: 'efectivo_restringido',
        motivo: 'Recibir este monto en efectivo está prohibido, no solo sujeto a aviso.',
        monto_total: centavosAPesosTexto(ev.insumos.montoTotalConsiderado),
      },
    })
  }

  if (ev.requiereRevisionIdentidad) {
    pendientes.push({
      tipo: 'revision_identidad',
      titulo: 'La identidad del cliente necesita revisión humana',
      detalle: {
        por: 'identidad_sin_rfc_ni_curp',
        motivo:
          'La acumulación se resolvió por documento alterno; un humano tiene que confirmar ' +
          'que se trata del mismo aportante.',
      },
    })
  }

  const ids: string[] = []
  for (const a of pendientes) {
    const { rows } = await db.query(
      `insert into alertas (tenant_id, tipo, evaluacion_id, titulo, detalle)
       values ($1,$2::tipo_alerta,$3,$4,$5::jsonb) returning id`,
      [sesion.tenantId, a.tipo, evaluacionId, a.titulo, JSON.stringify(a.detalle)],
    )
    ids.push((rows[0] as { id: string }).id)
  }
  return ids
}

/**
 * Convierte lo que teclea una persona a centavos, o falla diciendo por qué.
 *
 * OJO CON LAS COMAS. La primera versión de esto hacía
 * `texto.replace(/[\s,$]/g,'')` ANTES de validar, así que "8,2" se convertía
 * en "82" y entraba como ochenta y dos pesos sin queja. Lo encontró su propio
 * test: "8,2" es 8.2 en buena parte del mundo y 82 si borras la coma, y
 * adivinar cuál de las dos cosas quiso decir quien captura es exactamente lo
 * que la regla dura 6 prohíbe.
 *
 * Ahora se valida la FORMA ORIGINAL: las comas solo se aceptan donde un
 * separador de miles va, y solo entonces se quitan.
 */
export function montoCapturado(texto: string, campo: string): Centavos {
  const sinEspacios = texto.replace(/[\s$]/g, '')
  if (sinEspacios === '') return centavos(0)

  // Con separadores de miles bien puestos, o sin ninguno. Nada intermedio.
  const conMiles = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/
  const sinMiles = /^\d+(\.\d{1,2})?$/
  if (!conMiles.test(sinEspacios) && !sinMiles.test(sinEspacios)) {
    throw new OperacionInvalida([
      `${campo}: "${texto}" no es un importe válido. Usa pesos y centavos, con punto ` +
        'decimal (ejemplos: 941412.75 o 941,412.75).',
    ])
  }
  return pesosTextoACentavos(sinEspacios.replace(/,/g, ''))
}
