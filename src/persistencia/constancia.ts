import { createHash } from 'node:crypto'
import type { EjecutorSql } from '../catalogo/cargador'
import {
  resolverConstancia,
  type ApartadoDelManual,
  type Constancia,
  type HechoAcreditado,
} from '../dominio/constancia'
import { escribirConstancia } from '../dominio/constancia-texto'
import type { EjecutorTransaccional } from './manifiesto'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'

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

/**
 * Cuenta con su sustantivo concordado.
 *
 * «Se conservan 1 documentos» apareció DOS veces —en la Fr. XII y en la VII— y
 * las dos se vieron al abrir el archivo, no en una prueba. En un documento que
 * se entrega a la autoridad, la concordancia se nota. Una cuenta de estas casi
 * siempre vale más de uno en producción y exactamente uno en una demo, que es
 * cuando alguien lo lee con calma.
 */
const cuenta = (n: number, singular: string, plural: string): string =>
  `${String(n)} ${n === 1 ? singular : plural}`

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
      afirmacion:
        'El aviso se genera desde las operaciones que el motor marcó como reportables, se valida ' +
        'contra el XSD oficial antes de guardarse, y solo entonces queda disponible. ' +
        `${a.total === 1 ? 'Se ha generado 1 aviso' : `Se han generado ${String(a.total)} avisos`}.`,
      respaldo: 'avisos + aviso_operaciones · validación XSD bloqueante en la generación',
    },
    {
      afirmacion: `El plazo de presentación se calcula al día ${String(p[0]?.dia ?? 17)} del mes siguiente al periodo, tomado del catálogo y no de una constante.`,
      respaldo: 'parametros_motor.dia_limite_presentacion',
    },
    {
      afirmacion:
        'Ningún aviso avanza a presentado sin una aprobación humana registrada, y VIZO no presenta ante el SPPLD: el envío lo hace el sujeto obligado con su e.firma y aquí se registra el acuse.',
      respaldo: `avisos.aprobado_por · función app.aviso_aprobar · ${cuenta(a.con_acuse, 'acuse registrado', 'acuses registrados')}`,
    },
  ]

  if (a.ceros > 0) {
    hechos.push({
      afirmacion:
        'Un periodo sin operaciones reportables genera informe en cero, que es una obligación por ' +
        `sí misma y no la ausencia de una. ${a.ceros === 1 ? 'Se ha generado 1' : `Se han generado ${String(a.ceros)}`}.`,
      respaldo: "avisos.tipo = 'cero'",
    })
  }
  return hechos
}

/** Fracción VII · conservación de información y documentación. */
const conservacionYHuellas: Recolector = async (db, tenantId) => {
  const r = await filas<{ documentos: number; manifiestos: number; eventos: number }>(
    db,
    // `evento <> 'constancia.emitida'` NO es un detalle: SIN ESA LÍNEA LA
    // CONSTANCIA SE CUENTA A SÍ MISMA.
    //
    // Emitirla escribe su propio evento en la bitácora, esta consulta lo
    // contaba, y la siguiente emisión reportaba un evento más — texto distinto,
    // huella distinta, y la reutilización sin disparar nunca. En producción
    // salieron tres constancias seguidas con 21, 22 y 23 eventos, idénticas en
    // todo lo demás. Un documento que se modifica por el acto de emitirlo no
    // puede ser referenciado por nadie.
    //
    // Conceptualmente la exclusión también es la correcta: lo que este apartado
    // acredita es que los hechos del OBLIGADO quedan en bitácora. Emitir el
    // documento es metadato sobre el documento, no operación del obligado.
    `select (select count(*)::int from documentos where tenant_id = $1) as documentos,
            (select count(*)::int from manifiestos where tenant_id = $1) as manifiestos,
            (select count(*)::int from bitacora
              where tenant_id = $1 and evento <> 'constancia.emitida') as eventos`,
    [tenantId],
  )
  const c = r[0]
  if (c === undefined || c.documentos === 0) return []

  const hechos: HechoAcreditado[] = [
    {
      afirmacion:
        `El expediente conserva ${cuenta(c.documentos, 'documento', 'documentos')}, ` +
        `${c.documentos === 1 ? 'con su' : 'cada uno con su'} huella SHA-256 calculada sobre el archivo tal como se guarda. ` +
        'Un documento no se edita ni se borra: reemplazarlo es una versión nueva y la anterior permanece.',
      respaldo: 'documentos.hash_sha256 · tabla append-only con trigger que impide UPDATE y DELETE',
    },
    {
      afirmacion:
        'Todo hecho con peso regulatorio queda en una bitácora encadenada por hash, donde cada ' +
        `evento apunta al anterior: ${cuenta(c.eventos, 'evento registrado', 'eventos registrados')}. ` +
        'Alterar uno rompe la cadena y el verificador lo señala.',
      respaldo: 'bitacora.hash y hash_previo · función app.bitacora_verificar',
    },
  ]

  if (c.manifiestos > 0) {
    hechos.push({
      afirmacion:
        'El estado de un expediente en un momento dado se puede congelar en un manifiesto ' +
        'verificable, que incluye las huellas de sus documentos y la cabeza de la bitácora: ' +
        `${cuenta(c.manifiestos, 'uno generado', 'generados')}.`,
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
      afirmacion:
        'Cada operación se evalúa al capturarse contra el umbral vigente a su fecha, y el ' +
        'veredicto queda registrado con la UMA, el umbral y la versión de catálogo que se ' +
        `usaron: ${cuenta(e.evaluaciones, 'evaluación', 'evaluaciones')}.`,
      respaldo: 'evaluaciones_umbral · append-only, una fila por evaluación',
    },
    {
      afirmacion:
        `Las operaciones del mismo cliente se acumulan en una ventana deslizante de ${String(p[0]?.meses ?? 6)} ` +
        'meses, sumando todas las sucursales, y el aviso se dispara en la operación que hace que ' +
        `la suma alcance el umbral. ${e.por_acumulacion === 1 ? 'Se ha detectado 1 caso' : `Se han detectado ${String(e.por_acumulacion)} casos`} por acumulación.`,
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

  // Concordancia: «1 personas capturan» se leía mal en un documento que se
  // entrega. Lo vio la primera descarga real, no una prueba.
  const gente = (n: number): string =>
    n === 1 ? '1 persona captura' : `${String(n)} personas capturan`
  const aprueban = (n: number): string =>
    n === 1 ? '1 además aprueba' : `${String(n)} además aprueban`

  return [
    {
      afirmacion: `El acceso está separado en dos funciones: ${gente(u.capturistas)} clientes y operaciones, y ${aprueban(u.admins)} expedientes y avisos. Quien captura no aprueba.`,
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
      afirmacion:
        `Los datos de este sujeto obligado —${cuenta(s.clientes, 'cliente', 'clientes')}, ` +
        `${cuenta(s.documentos, 'documento', 'documentos')} y ${cuenta(s.operaciones, 'operación', 'operaciones')}— ` +
        'están aislados por políticas de la propia base de datos. Ninguna consulta de otro ' +
        'obligado los alcanza, y una consulta sin sesión válida no devuelve una sola fila.',
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

/**
 * Apartado IV: identificación y seguimiento reforzado de PEP.
 *
 * Acredita DÓNDE quedan las cosas, nunca QUIÉN puede autorizar — eso lo remite
 * el propio Art. 23 Ter 5 al Manual, y es lo que este apartado sigue pidiendo
 * al obligado en sus preguntas.
 *
 * NO AFIRMA CAPACIDADES DEL SISTEMA, SOLO HECHOS DE ESTE OBLIGADO. La primera
 * versión de este recolector describía lo que VIZO sabe hacer —la red de
 * vínculos, los relojes derivados, la aprobación con su evidencia atada— y por
 * eso devolvía hechos incluso para un obligado recién creado que no ha
 * preguntado a nadie si es PEP. Lo delató `recoleccion.test.ts`, que fija el
 * invariante correcto: **un obligado que no ha demostrado nada sale en hueco**.
 * Un catálogo de funciones no es evidencia de cumplimiento, y el ADR-20 existe
 * justamente para no confundir las dos cosas.
 */
const pepYAprobacion: Recolector = async (db, tenantId, hoy) => {
  const decl = await filas<{ total: string; revisadas: string }>(
    db,
    `select count(*)::text as total,
            count(*) filter (where revisada_por is not null)::text as revisadas
       from declaraciones_pep where tenant_id = $1`,
    [tenantId],
  )
  const total = Number(decl[0]?.total ?? '0')
  // Sin una sola declaración recabada no hay procedimiento que acreditar: la
  // sección se degrada a hueco y el obligado la contesta él.
  if (total === 0) return []

  const revisadas = Number(decl[0]?.revisadas ?? '0')

  const hechos: HechoAcreditado[] = [
    {
      afirmacion:
        `Este obligado tiene ${String(total)} declaración(es) de carácter PEP recabada(s) como red declarada —vínculo por vínculo, con el cargo, el ámbito y las fechas—, que admite el cónyuge, la concubina o concubinario, el parentesco por consanguinidad o afinidad hasta el segundo grado y los socios con vínculos patrimoniales, conforme al Art. 23 Quáter, párrafo 3.`,
      respaldo: 'declaraciones_pep y vinculos_pep · vínculos tipificados con sus fechas',
    },
    {
      afirmacion:
        'La vigencia del carácter PEP no se captura: se DERIVA de los dos plazos del Art. 23 Quáter, párrafos 4 y 5, que viven en el catálogo regulatorio con su fuente del DOF.',
      respaldo: 'parametros_motor · los dos relojes del Art. 23 Quáter',
    },
  ]

  if (revisadas > 0) {
    hechos.push({
      afirmacion: `${String(revisadas)} de esas declaraciones fueron revisadas por una persona, con su nombre y la hora, y quedaron congeladas como evidencia: una corrección es una declaración nueva, no una edición.`,
      respaldo: 'declaraciones_pep.revisada_por y revisada_en · append-only',
    })
  }

  const aps = await filas<{ total: string; via: string; actos: string }>(
    db,
    `select count(*)::text as total,
            coalesce(max(a.via::text), '') as via,
            coalesce(count(oc.operacion_id)::text, '0') as actos
       from aprobaciones_directivo a
       left join operaciones_consentidas oc on oc.aprobacion_id = a.id
      where a.tenant_id = $1`,
    [tenantId],
  )
  const nAp = Number(aps[0]?.total ?? '0')
  if (nAp > 0) {
    const esConstancia = aps[0]?.via === 'constancia_persona_fisica'
    hechos.push({
      afirmacion:
        `Para operar con quien es Persona Políticamente Expuesta y, además, de Grado de Riesgo alto, consta(n) ${String(nAp)} ` +
        (esConstancia
          ? 'constancia(s) en la(s) que este obligado, por ser persona física, señaló los motivos que consideró (Art. 23 Ter 5, párrafo 2)'
          : 'aprobación(es) de un directivo o su equivalente, con su nombre y su cargo (Art. 23 Ter 5, párrafo 1)') +
        `, sobre ${aps[0]?.actos ?? '0'} acto(s) nombrado(s) uno por uno.`,
      respaldo: 'aprobaciones_directivo y operaciones_consentidas · append-only',
    })
    hechos.push({
      afirmacion:
        'Cada aprobación cita la declaración PEP y la evaluación de Grado de Riesgo que la hicieron exigible, de modo que puede reconstruirse por qué se pidió, y no puede citar la evidencia de otra persona.',
      respaldo: 'claves compuestas (tenant, cliente, evidencia) sobre aprobaciones_directivo',
    })
  } else {
    // Que no haya aprobaciones puede ser correcto —ningún cliente reúne las dos
    // mitades— o puede ser el faltante. La constancia no adivina cuál de las
    // dos: dice desde cuándo aplica y deja la pregunta al obligado.
    const exig = await filas<{ fecha: string }>(
      db,
      `select valor #>> '{}' as fecha from parametros_motor
        where clave = 'exigibilidad_transitorio_cuarto' and actividad_id is null
        order by vigente_desde desc limit 1`,
      [],
    )
    const desde = exig[0]?.fecha
    if (desde !== undefined) {
      hechos.push({
        afirmacion:
          'No consta ninguna autorización del Art. 23 Ter 5 para este obligado. Es exigible ' +
          `a partir de los actos u operaciones realizados el ${desde} (Transitorio Cuarto)` +
          (hoy < desde ? ', que aún no llega.' : '.'),
        respaldo: 'aprobaciones_directivo · sin filas para este obligado',
      })
    }
  }

  return hechos
}

const RECOLECTORES: Record<string, Recolector> = {
  pep_y_aprobacion: pepYAprobacion,
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

// ─────────────────────────────────────────────────────────────────────────
// Emitir: congelar la Constancia para que el Manual pueda referenciarla
// ─────────────────────────────────────────────────────────────────────────

export interface ConstanciaEmitida {
  id: string
  fecha: string
  hashSha256: string
  contenido: string
  constancia: Constancia
  anticipadaDesde: string | null
  /** `false` cuando ya existía una idéntica y se reusó. */
  nueva: boolean
}

/**
 * Emite la Constancia: la arma, la escribe, la hashea y la guarda.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EMITIR ES UN ACTO Y NO UNA DESCARGA
 * ────────────────────────────────────────────────────────────────────────────
 * Porque el Manual va a REFERENCIARLA, y una referencia a un documento que se
 * regenera distinto cada vez no es una referencia. Si el Manual dice «ver
 * Constancia» y esa constancia cambia cuando el obligado sube un documento o
 * presenta un aviso, entonces el Manual remite a un blanco móvil y nadie puede
 * decir qué decía el día que se citó.
 *
 * Emitir congela el texto con su huella y lo deja en la bitácora. Es el mismo
 * criterio del aviso y del manifiesto.
 *
 * **Emitir dos veces sin que nada haya cambiado no produce dos evidencias.** El
 * índice único por (obligado, fecha, huella) hace que la segunda emisión reuse
 * la primera: dos filas idénticas no son dos hechos, son el mismo hecho
 * contado dos veces, y al listarlas parecerían actividad que no ocurrió.
 */
export async function emitirConstancia(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<ConstanciaEmitida> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const t = await filas<{ razon_social: string; rfc: string }>(
      db,
      `select razon_social, rfc from tenants where id = $1`,
      [p.sesion.tenantId],
    )
    const obligado = t[0]
    if (obligado === undefined) {
      throw new Error('No se encontró el obligado de la sesión al emitir la constancia.')
    }

    const r = await armarConstancia(db, p)
    const anticipada = r.estado === 'aun_no_exigible'
    const c = anticipada ? r.vistaPrevia : r.constancia
    const desde = anticipada ? r.desde : null

    const contenido = escribirConstancia(c, {
      razonSocial: obligado.razon_social,
      rfc: obligado.rfc,
      fecha: p.hoy,
      ...(desde === null ? {} : { anticipadaDesde: desde }),
    })
    const hash = createHash('sha256').update(contenido, 'utf8').digest('hex')

    const ins = await db.query(
      `insert into constancias
         (tenant_id, fecha, contenido, hash_sha256, total, acreditados, parciales, huecos,
          degradados, anticipada_desde, emitida_por)
       values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::text[],$10::date,$11)
       on conflict (tenant_id, fecha, hash_sha256) do nothing
       returning id::text`,
      [
        p.sesion.tenantId,
        p.hoy,
        contenido,
        hash,
        c.secciones.length,
        c.acreditados,
        c.parciales,
        c.huecos,
        c.degradados,
        desde,
        p.sesion.usuarioId,
      ],
    )

    const nueva = ins.rows.length > 0
    let id = (ins.rows[0] as { id: string } | undefined)?.id

    if (id === undefined) {
      const previa = await filas<{ id: string }>(
        db,
        `select id::text from constancias
          where tenant_id = $1 and fecha = $2::date and hash_sha256 = $3`,
        [p.sesion.tenantId, p.hoy, hash],
      )
      id = previa[0]?.id
      if (id === undefined) {
        // El INSERT no escribió y tampoco hay fila previa: eso solo pasa si RLS
        // rechazó la escritura. Se dice, en vez de devolver una constancia sin
        // respaldo que el Manual acabaría referenciando.
        throw new NoAutorizadoAEmitir()
      }
    }

    // Solo la primera vez: registrar dos veces el mismo hecho llenaría la
    // bitácora de eventos que no ocurrieron.
    if (nueva) {
      await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
        p.sesion.tenantId,
        'constancia.emitida',
        'constancia',
        id,
        // REGLA DURA 3: el reparto, no el contenido. El texto lleva nombres de
        // clientes en ninguna parte, pero la bitácora tampoco necesita el texto.
        JSON.stringify({
          fecha: p.hoy,
          hash_sha256: hash,
          acreditados: c.acreditados,
          parciales: c.parciales,
          huecos: c.huecos,
          anticipada_desde: desde,
        }),
        p.sesion.usuarioId,
      ])
    }

    return {
      id,
      fecha: p.hoy,
      hashSha256: hash,
      contenido,
      constancia: c,
      anticipadaDesde: desde,
      nueva,
    }
  })
}

export class NoAutorizadoAEmitir extends Error {
  constructor() {
    super(
      'No se pudo emitir la constancia. Emitirla es el acto por el que el obligado adopta un ' +
        'documento que su Manual va a referenciar, así que lo firma un administrador.',
    )
    this.name = 'NoAutorizadoAEmitir'
  }
}
