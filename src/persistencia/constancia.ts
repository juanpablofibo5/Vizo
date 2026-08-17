import type { EjecutorSql } from '../catalogo/cargador'
import {
  resolverConstancia,
  type ApartadoDelManual,
  type Constancia,
  type HechoAcreditado,
} from '../dominio/constancia'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * Los recolectores de evidencia de la Constancia de mecanismos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PROPIEDAD QUE TIENEN QUE CUMPLIR TODOS
 * ────────────────────────────────────────────────────────────────────────────
 * **Un recolector devuelve hechos del OBLIGADO, no capacidades del producto.**
 *
 * La diferencia decide si el documento sirve. «VIZO guarda cada documento con
 * su huella SHA-256» es cierto siempre, incluso en una cuenta recién abierta
 * donde nunca se subió un archivo — y escribirlo ahí sería exactamente la
 * frase plausible y falsa que el ADR-20 prohíbe. «Este obligado conserva 12
 * documentos, cada uno con su huella» solo es cierto si lo es.
 *
 * Por eso cada consulta cruza `tenant_id` y **devuelve lista vacía cuando el
 * obligado no tiene nada**. Ahí el dominio degrada la sección a hueco, que es
 * la respuesta honesta: todavía no hay mecanismo que acreditar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ ES UN «RESPALDO»
 * ────────────────────────────────────────────────────────────────────────────
 * La segunda mitad de cada hecho. No es una nota al pie decorativa: es dónde
 * mirar para comprobar la afirmación — la tabla, la cuenta, la versión de
 * catálogo, el hash. Un hecho sin respaldo verificable no es un hecho, es una
 * opinión bien escrita.
 */

type Recolector = (
  db: EjecutorSql,
  tenantId: string,
  hoy: string,
) => Promise<HechoAcreditado[]>

const filas = async <T>(db: EjecutorSql, sql: string, p: unknown[]): Promise<T[]> => {
  const { rows } = await db.query(sql, p)
  return rows as T[]
}

/** Fracción I · criterios de identificación y conocimiento. */
const camposDelExpediente: Recolector = async (db, tenantId, hoy) => {
  const r = await filas<{ obligatorios: number; documentales: number; version: string | null }>(
    db,
    `select count(*) filter (where ce.obligatorio)::int as obligatorios,
            count(*) filter (where ce.obligatorio and ce.tipo_dato = 'documento')::int as documentales,
            max(ce.vigente_desde)::text as version
       from campos_expediente ce
       join actividades_tenant at on at.actividad_id = ce.actividad_id
      where at.tenant_id = $1
        and ce.vigente_desde <= $2::date
        and (ce.vigente_hasta is null or ce.vigente_hasta >= $2::date)`,
    [tenantId, hoy],
  )
  const c = r[0]
  if (c === undefined || c.obligatorios === 0) return []

  const e = await filas<{ aprobados: number; total: number }>(
    db,
    `select count(*) filter (where estatus = 'aprobado')::int as aprobados,
            count(*)::int as total
       from expedientes where tenant_id = $1`,
    [tenantId],
  )
  const exp = e[0]

  const hechos: HechoAcreditado[] = [
    {
      afirmacion: `El expediente de identificación exige ${String(c.obligatorios)} datos y documentos obligatorios, de los cuales ${String(c.documentales)} son documentos que se conservan en el sistema.`,
      respaldo: `catálogo campos_expediente, vigencia ${c.version ?? '—'} · cada campo con su fuente citada`,
    },
    {
      afirmacion:
        'La completitud del expediente no se declara: se calcula cruzando el catálogo vigente a la fecha contra lo capturado, y el resultado queda registrado.',
      respaldo: 'expedientes.completitud · recalculada en cada alta de dato o documento',
    },
  ]

  if (exp !== undefined && exp.total > 0) {
    hechos.push({
      afirmacion: `Un expediente pasa a aprobado por decisión de una persona con rol de administrador, que queda registrada con nombre y hora. Hoy hay ${String(exp.aprobados)} de ${String(exp.total)} expedientes aprobados.`,
      respaldo: 'expedientes.aprobado_por y aprobado_en · función app.expediente_aprobar',
    })
  }
  return hechos
}

/** Fracción VI · presentación de Avisos e Informes. */
const pipelineDelAviso: Recolector = async (db, tenantId) => {
  const r = await filas<{
    total: number
    presentados: number
    ceros: number
    con_acuse: number
  }>(
    db,
    `select count(*)::int as total,
            count(*) filter (where estatus = 'presentado')::int as presentados,
            count(*) filter (where tipo = 'cero')::int as ceros,
            count(*) filter (where acuse_folio is not null)::int as con_acuse
       from avisos where tenant_id = $1`,
    [tenantId],
  )
  const a = r[0]
  if (a === undefined || a.total === 0) return []

  const p = await filas<{ dia: number }>(
    db,
    `select (valor #>> '{}')::int as dia from parametros_motor
      where clave = 'dia_limite_presentacion' and actividad_id is null
      order by vigente_desde desc limit 1`,
    [],
  )

  const hechos: HechoAcreditado[] = [
    {
      afirmacion: `El aviso se genera desde las operaciones que el motor marcó como reportables, se valida contra el XSD oficial antes de guardarse, y solo entonces queda disponible. Se han generado ${String(a.total)} avisos.`,
      respaldo: 'avisos + aviso_operaciones · validación XSD bloqueante en la generación',
    },
    {
      afirmacion: `El plazo de presentación se calcula al día ${String(p[0]?.dia ?? 17)} del mes siguiente al periodo, tomado del catálogo y no de una constante.`,
      respaldo: 'parametros_motor.dia_limite_presentacion',
    },
    {
      afirmacion:
        'Ningún aviso avanza a presentado sin una aprobación humana registrada, y VIZO no presenta ante el SPPLD: el envío lo hace el sujeto obligado con su e.firma y aquí se registra el acuse.',
      respaldo: `avisos.aprobado_por · función app.aviso_aprobar · ${String(a.con_acuse)} acuses registrados`,
    },
  ]

  if (a.ceros > 0) {
    hechos.push({
      afirmacion: `Un periodo sin operaciones reportables genera informe en cero, que es una obligación por sí misma y no la ausencia de una. Se han generado ${String(a.ceros)}.`,
      respaldo: "avisos.tipo = 'cero'",
    })
  }
  return hechos
}

/** Fracción VII · conservación de información y documentación. */
const conservacionYHuellas: Recolector = async (db, tenantId) => {
  const r = await filas<{ documentos: number; manifiestos: number; eventos: number }>(
    db,
    `select (select count(*)::int from documentos where tenant_id = $1) as documentos,
            (select count(*)::int from manifiestos where tenant_id = $1) as manifiestos,
            (select count(*)::int from bitacora where tenant_id = $1) as eventos`,
    [tenantId],
  )
  const c = r[0]
  if (c === undefined || c.documentos === 0) return []

  const hechos: HechoAcreditado[] = [
    {
      afirmacion: `Se conservan ${String(c.documentos)} documentos, cada uno con su huella SHA-256 calculada sobre el archivo tal como se guarda. Un documento no se edita ni se borra: reemplazarlo es una versión nueva y la anterior permanece.`,
      respaldo: 'documentos.hash_sha256 · tabla append-only con trigger que impide UPDATE y DELETE',
    },
    {
      afirmacion: `Todo hecho con peso regulatorio queda en una bitácora encadenada por hash, donde cada evento apunta al anterior: ${String(c.eventos)} eventos. Alterar uno rompe la cadena y el verificador lo señala.`,
      respaldo: 'bitacora.hash y hash_previo · función app.bitacora_verificar',
    },
  ]

  if (c.manifiestos > 0) {
    hechos.push({
      afirmacion: `El estado de un expediente en un momento dado se puede congelar en un manifiesto verificable, que incluye las huellas de sus documentos y la cabeza de la bitácora: ${String(c.manifiestos)} generados.`,
      respaldo: 'manifiestos.hash_sha256 y hash_bitacora_cabeza',
    })
  }
  return hechos
}

/** Fracción VIII · seguimiento y acumulación. La cita textual del artículo. */
const acumulacion: Recolector = async (db, tenantId) => {
  const r = await filas<{ evaluaciones: number; por_acumulacion: number }>(
    db,
    `select count(*)::int as evaluaciones,
            count(*) filter (where resultado_aviso = 'acumulacion')::int as por_acumulacion
       from evaluaciones_umbral where tenant_id = $1`,
    [tenantId],
  )
  const e = r[0]
  if (e === undefined || e.evaluaciones === 0) return []

  const p = await filas<{ meses: number }>(
    db,
    `select (valor #>> '{}')::int as meses from parametros_motor
      where clave = 'ventana_acumulacion_meses' and actividad_id is null
      order by vigente_desde desc limit 1`,
    [],
  )

  return [
    {
      afirmacion: `Cada operación se evalúa al capturarse contra el umbral vigente a su fecha, y el veredicto queda registrado con la UMA, el umbral y la versión de catálogo que se usaron: ${String(e.evaluaciones)} evaluaciones.`,
      respaldo: 'evaluaciones_umbral · append-only, una fila por evaluación',
    },
    {
      afirmacion: `Las operaciones del mismo cliente se acumulan en una ventana deslizante de ${String(p[0]?.meses ?? 6)} meses, sumando todas las sucursales, y el aviso se dispara en la operación que hace que la suma alcance el umbral. Se han detectado ${String(e.por_acumulacion)} casos por acumulación.`,
      respaldo: 'parametros_motor.ventana_acumulacion_meses · evaluaciones_umbral.suma_ventana y operaciones_acumuladas',
    },
    {
      afirmacion:
        'El umbral se compara sin contribuciones ni demás accesorios, y el aviso reporta el monto total incluyéndolas, sin desglosar.',
      respaldo:
        'umbrales.base · Art. 6 del Reglamento de la LFPIORPI, reformado DOF 27-03-2026, citado en la fuente de cada umbral',
    },
  ]
}

/** Fracción X · el REC. Parcial: quién y desde cuándo, no sus funciones. */
const designacionRec: Recolector = async (db, tenantId) => {
  const r = await filas<{ nombre: string; fecha_respuesta: string; fecha_designacion: string }>(
    db,
    `select nombre, fecha_respuesta::text, fecha_designacion::text
       from designaciones_rec
      where tenant_id = $1 and estado = 'aceptada'`,
    [tenantId],
  )
  const d = r[0]
  if (d === undefined) return []

  return [
    {
      afirmacion: `La designación del Representante Encargado de Cumplimiento fue hecha el ${d.fecha_designacion} y ACEPTADA por la persona designada el ${d.fecha_respuesta}, conforme al Art. 10 del Acuerdo 115/2026.`,
      respaldo: 'designaciones_rec · estado y fechas, con su evento en bitácora',
    },
    {
      afirmacion:
        'El sistema distingue una designación pendiente de una aceptada, porque mientras no sea aceptada el cumplimiento recae en el órgano de administración (Art. 20 de la Ley, párrafo 2).',
      respaldo: 'designaciones_rec.estado · transiciones vigiladas por trigger',
    },
  ]
}

/**
 * Fracción XII · control interno. Parcial: la separación de funciones.
 *
 * EXIGE QUE LA SEPARACIÓN EXISTA DE VERDAD, no que el sistema la soporte.
 *
 * La primera versión acreditaba con un solo usuario, y entonces el documento
 * decía «el acceso está separado en dos funciones: 0 capturan y 1 aprueba» —
 * una frase que se contradice a sí misma. Lo cazó la prueba del obligado recién
 * creado.
 *
 * Un obligado donde la misma persona captura y aprueba **no tiene** separación
 * de funciones, por más que la base sepa imponerla. Afirmar lo contrario en un
 * Manual que se entrega a la autoridad es justo el tipo de frase plausible y
 * falsa que el ADR-20 existe para impedir. Sin dos roles vivos no hay control
 * interno que acreditar: sale como hueco y lo escribe el obligado.
 */
const separacionDeRoles: Recolector = async (db, tenantId) => {
  const r = await filas<{ admins: number; capturistas: number }>(
    db,
    `select count(*) filter (where rol = 'admin')::int as admins,
            count(*) filter (where rol = 'capturista')::int as capturistas
       from usuarios where tenant_id = $1 and activo`,
    [tenantId],
  )
  const u = r[0]
  if (u === undefined || u.admins === 0 || u.capturistas === 0) return []

  return [
    {
      afirmacion: `El acceso está separado en dos funciones: ${String(u.capturistas)} personas capturan clientes y operaciones, y ${String(u.admins)} además aprueban expedientes y avisos. Quien captura no aprueba.`,
      respaldo: 'usuarios.rol · la separación la impone la base de datos, no la pantalla',
    },
    {
      afirmacion:
        'Un intento de aprobar sin el rol correspondiente es rechazado por la base de datos aunque la interfaz lo permitiera, porque la comprobación vive en la función que aprueba.',
      respaldo: 'app.es_admin() dentro de app.expediente_aprobar y app.aviso_aprobar',
    },
  ]
}

/**
 * Fracción XIII · confidencialidad.
 *
 * LA PRIMERA VERSIÓN DE ESTE RECOLECTOR ESTABA MAL, y lo cazó la prueba de
 * `tests/manual/recoleccion.test.ts`. Contaba las tablas con RLS activa y las
 * filas de `app.privilegios_declarados` — datos **del producto**, no del
 * obligado. Reventó con `permission denied` porque el rol de la aplicación no
 * puede leer el inventario interno de seguridad, y hacía bien en no poder:
 * exponerlo a cada inquilino sería lo contrario de confidencialidad.
 *
 * Pero el `permission denied` fue el síntoma; la causa era que el recolector
 * había derivado a describir a VIZO. Ahora el SUJETO de cada afirmación son
 * los datos de este obligado, y el mecanismo va en el respaldo, que es su
 * lugar. La cuenta la filtra RLS sola: si esta sesión ve esas filas, es
 * precisamente porque el aislamiento funciona.
 */
const aislamientoYPrivilegios: Recolector = async (db, tenantId) => {
  const r = await filas<{ clientes: number; documentos: number; operaciones: number }>(
    db,
    `select (select count(*)::int from clientes_finales where tenant_id = $1) as clientes,
            (select count(*)::int from documentos where tenant_id = $1) as documentos,
            (select count(*)::int from operaciones where tenant_id = $1) as operaciones`,
    [tenantId],
  )
  const s = r[0]
  // Una constancia de confidencialidad sobre una cuenta sin datos no acredita
  // nada: no hay información que se esté protegiendo todavía.
  if (s === undefined || s.clientes === 0) return []

  return [
    {
      afirmacion: `Los datos de este sujeto obligado —${String(s.clientes)} clientes, ${String(s.documentos)} documentos y ${String(s.operaciones)} operaciones— están aislados por políticas de la propia base de datos. Ninguna consulta de otro obligado los alcanza, y una consulta sin sesión válida no devuelve una sola fila.`,
      respaldo:
        'Row Level Security por tenant_id en cada tabla · comprobado con dos obligados en el smoke test estructural',
    },
    {
      afirmacion:
        'El acceso a esta información está limitado a los usuarios dados de alta en este obligado, y los permisos de escritura de la aplicación están declarados uno por uno: la base rechaza cualquiera que no esté en esa lista.',
      respaldo:
        'usuarios del tenant · inventario interno de privilegios, verificado en cada migración',
    },
    {
      afirmacion:
        'El personal de VIZO no puede entrar como este obligado. No existe función de suplantación, y su ausencia es una frontera del producto, no una funcionalidad pendiente.',
      respaldo: 'docs/ALCANCE.md §0, frontera 6 · runbook 04 de soporte',
    },
  ]
}

const RECOLECTORES: Record<string, Recolector> = {
  campos_del_expediente: camposDelExpediente,
  pipeline_del_aviso: pipelineDelAviso,
  conservacion_y_huellas: conservacionYHuellas,
  acumulacion,
  designacion_rec: designacionRec,
  separacion_de_roles: separacionDeRoles,
  aislamiento_y_privilegios: aislamientoYPrivilegios,
}

export class RecolectorDesconocido extends Error {
  constructor(clave: string) {
    super(
      `El catálogo pide la evidencia "${clave}" y no hay recolector para ella. La sección se ` +
        'detiene en vez de salir sin respaldo: un apartado que promete acreditar y no sabe de ' +
        'dónde sacar los hechos es exactamente lo que el ADR-20 prohíbe.',
    )
    this.name = 'RecolectorDesconocido'
  }
}

/** Los apartados vigentes a una fecha. */
export async function apartadosVigentes(
  db: EjecutorSql,
  hoy: string,
): Promise<ApartadoDelManual[]> {
  const rows = await filas<{
    fraccion: string
    orden: number
    texto: string
    origen: ApartadoDelManual['origen']
    clave_evidencia: string | null
    por_que_no: string | null
    preguntas: string[]
    fuente: string
  }>(
    db,
    `select fraccion, orden, texto, origen::text as origen, clave_evidencia,
            por_que_no, preguntas, fuente
       from apartados_manual
      where vigente_desde <= $1::date
        and (vigente_hasta is null or vigente_hasta >= $1::date)
      order by orden`,
    [hoy],
  )

  return rows.map((r) => ({
    fraccion: r.fraccion,
    orden: r.orden,
    texto: r.texto,
    origen: r.origen,
    claveEvidencia: r.clave_evidencia ?? undefined,
    porQueNo: r.por_que_no ?? undefined,
    preguntas: r.preguntas,
    fuente: r.fuente,
  }))
}

/**
 * Qué salió al pedir la Constancia.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UNA UNIÓN Y NO UNA CONSTANCIA A SECAS
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 37 Bis entra en vigor el 30 de noviembre de 2026. Antes de esa fecha
 * **no hay apartados vigentes**, y eso NO es un error: es que la obligación
 * todavía no existe.
 *
 * La primera versión no distinguía los dos casos y reventaba con
 * `CatalogoDelManualVacio` —«el catálogo no cargó»— sobre una cuenta donde en
 * realidad todo estaba bien. Es el mismo par que este proyecto separa en todas
 * partes: **«todavía no» no es «no hay»**, igual que «sin evaluar» no es
 * «completo» y una designación pendiente no es una aceptada.
 *
 * La unión obliga a quien consume a distinguirlos. Y la vista previa se arma
 * con la fecha de entrada en vigor, no con hoy: leer un catálogo que aún no
 * rige sería justo lo que el versionado por vigencia existe para impedir, así
 * que se hace explícito y se etiqueta.
 */
export type ResultadoConstancia =
  | { estado: 'vigente'; constancia: Constancia }
  | { estado: 'aun_no_exigible'; desde: string; vistaPrevia: Constancia }

/** La primera vigencia del Manual posterior a una fecha, si la hay. */
async function proximaVigencia(db: EjecutorSql, hoy: string): Promise<string | null> {
  const r = await filas<{ desde: string | null }>(
    db,
    `select min(vigente_desde)::text as desde from apartados_manual
      where vigente_desde > $1::date`,
    [hoy],
  )
  return r[0]?.desde ?? null
}

async function recolectar(
  db: EjecutorSql,
  tenantId: string,
  fecha: string,
  apartados: readonly ApartadoDelManual[],
): Promise<Constancia> {
  const hechos = new Map<string, readonly HechoAcreditado[]>()
  for (const a of apartados) {
    if (a.claveEvidencia === undefined) continue
    const recolector = RECOLECTORES[a.claveEvidencia]
    // REGLA DURA 6. Una clave sin recolector no se salta en silencio —eso
    // degradaría la sección a hueco por un error de programación y parecería
    // una decisión de producto—: se detiene.
    if (recolector === undefined) throw new RecolectorDesconocido(a.claveEvidencia)
    hechos.set(a.claveEvidencia, await recolector(db, tenantId, fecha))
  }
  return resolverConstancia(apartados, hechos)
}

/**
 * Arma la Constancia de un obligado a una fecha.
 *
 * No escribe nada en la base: generar el documento es una LECTURA. Guardarlo
 * con su huella es un acto aparte, y deliberado — igual que el aviso.
 */
export async function armarConstancia(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<ResultadoConstancia> {
  await exigirSesionActiva(db, p.sesion)

  const apartados = await apartadosVigentes(db, p.hoy)

  if (apartados.length === 0) {
    const desde = await proximaVigencia(db, p.hoy)
    // Sin apartados hoy Y sin ninguno por venir, el catálogo sí está roto.
    // Ahí el error de dominio es la respuesta correcta y se deja subir.
    if (desde === null) return { estado: 'vigente', constancia: resolverConstancia([], new Map()) }

    // La evidencia se recolecta a la fecha de ENTRADA EN VIGOR, que es la
    // misma con la que se eligieron los apartados. Un documento no se juzga a
    // caballo entre dos fechas.
    const futuros = await apartadosVigentes(db, desde)
    return {
      estado: 'aun_no_exigible',
      desde,
      vistaPrevia: await recolectar(db, p.sesion.tenantId, desde, futuros),
    }
  }

  return { estado: 'vigente', constancia: await recolectar(db, p.sesion.tenantId, p.hoy, apartados) }
}
