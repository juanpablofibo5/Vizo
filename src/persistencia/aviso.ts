import { createHash } from 'node:crypto'
import { formatoVigente } from './formatos'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'
import type { EjecutorTransaccional } from './manifiesto'
import { validarContraXsd } from '../aviso/validacion'
import { fragmentarInforme } from '../aviso/fragmentacion'
import type { AlmacenDocumentos } from './documentos'
import {
  construirInformeXml,
  PATRON_FOLIO,
  referenciaAviso,
  type AvisoDelInforme,
  type Granularidad,
  type OperacionDelAviso,
} from '../aviso/informe'

/**
 * De operaciones reportables a un XML validado.
 *
 * La validación contra el XSD es un paso BLOQUEANTE dentro de la misma
 * transacción: si el XML no valida, no se guarda nada. Un aviso en estado
 * `generado` que en realidad no valida es peor que no tenerlo — alguien lo
 * daría por hecho hasta el día de presentarlo.
 *
 * Lo que esta función NO hace: presentar. El envío al SPPLD va siempre con la
 * e.firma del sujeto obligado y la aprobación humana llega en la semana 10
 * (regla dura 5).
 */

export class AvisoNoValida extends Error {
  constructor(
    mensaje: string,
    readonly errores: string[],
  ) {
    super(mensaje)
    this.name = 'AvisoNoValida'
  }
}

export class CatalogoDelAvisoIncompleto extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'CatalogoDelAvisoIncompleto'
  }
}

/**
 * Hay operaciones reportables que el aviso no puede describir.
 *
 * Existe para que el generador se DETENGA en vez de omitirlas. Omitir produce
 * un informe en cero sobre un periodo que sí tuvo obligación: el peor resultado
 * posible, porque se presenta y se acusa, y queda archivado como cumplimiento.
 */
/**
 * Se pidió consolidar el periodo y las operaciones son de desarrollos distintos.
 *
 * CONTRASTADO CONTRA EL DOF. El Art. 24 Bis 1 del Acuerdo 115/2026 —publicado
 * el 7 de agosto de 2026, edición vespertina— fija la regla general de **un
 * Aviso por cada acto u operación**, y abre una excepción para la Fr. V Bis:
 *
 *   «es posible enviar en un Aviso todos los actos u operaciones realizados
 *   durante el mes calendario correspondiente siempre que los recursos
 *   recibidos sean aplicados al mismo Desarrollo Inmobiliario…»
 *
 * O sea que consolidar no es una preferencia de quien genera: es una excepción
 * condicionada. Con dos desarrollos en el mismo periodo, el aviso consolidado
 * no cumple la condición — y saldría igual, válido contra el XSD, porque el
 * esquema no sabe de esta regla. El modo de falla de siempre: nada revienta.
 */
export class ConsolidacionNoPermitida extends Error {
  constructor(readonly desarrollos: string[]) {
    super(
      `El periodo tiene operaciones de ${String(desarrollos.length)} desarrollos inmobiliarios distintos, y el Art. 24 Bis 1 solo permite consolidar en un Aviso los recursos aplicados al MISMO desarrollo. Genera un aviso por operación.`,
    )
    this.name = 'ConsolidacionNoPermitida'
  }
}

export class AvisoIncompleto extends Error {
  constructor(
    mensaje: string,
    readonly operaciones: string[],
  ) {
    super(mensaje)
    this.name = 'AvisoIncompleto'
  }
}

export interface LoteGenerado {
  lote: number
  totalLotes: number
  storagePath: string
  hashSha256: string
  bytes: number
}

export interface ResultadoAviso {
  avisoId: string
  tipo: 'normal' | 'cero'
  /** El informe completo, sin fragmentar. Para inspección y pruebas. */
  xml: string
  hashXml: string
  operacionesIncluidas: number
  avisosEnElInforme: number
  formatoVersion: string
  /** Los archivos realmente presentables, en orden. */
  lotes: LoteGenerado[]
}

interface FilaReportable {
  operacion_id: string
  evaluacion_id: string
  desarrollo_id: string
  tipo_operacion: string
  fecha_aportacion: string
  instrumento_monetario: string | null
  moneda_codigo: string | null
  monto_aportacion: string
  aportacion_fideicomiso: boolean
  nombre_institucion: string | null
  objeto_aviso_anterior: boolean
  entidad_federativa: string
  registro_licencia: string
  codigo_postal: string
  colonia: string
  calle: string
  tipo_desarrollo: string
  descripcion_desarrollo: string | null
  monto_desarrollo: string
  unidades_comercializadas: string
  costo_unidad: string
  otras_empresas: boolean
}

const siNo = (v: boolean): 'SI' | 'NO' => (v ? 'SI' : 'NO')

/** Un dato que el XSD exige y la operación no trae no se rellena: revienta. */
function exigido(valor: string | null, campo: string, operacionId: string): string {
  if (valor === null || valor === '') {
    throw new CatalogoDelAvisoIncompleto(
      `La operación ${operacionId} no tiene ${campo}, y el XSD lo exige. No se asume un ` +
        'valor: complétala antes de generar el aviso (regla dura 6).',
    )
  }
  return valor
}

function aOperacionDelAviso(f: FilaReportable): OperacionDelAviso {
  return {
    tipoOperacion: f.tipo_operacion,
    desarrollo: {
      objetoAvisoAnterior: siNo(f.objeto_aviso_anterior),
      // Este aviso no es modificatorio. El modificatorio tiene su propio tipo y
      // su propio bloque en el XSD, y llega en la semana 10.
      modificacion: 'NO',
      entidadFederativa: f.entidad_federativa,
      registroLicencia: f.registro_licencia,
      codigoPostal: f.codigo_postal,
      colonia: f.colonia,
      calle: f.calle,
      tipoDesarrollo: f.tipo_desarrollo,
      ...(f.descripcion_desarrollo === null
        ? {}
        : { descripcionDesarrollo: f.descripcion_desarrollo }),
      montoDesarrollo: f.monto_desarrollo,
      unidadesComercializadas: f.unidades_comercializadas,
      costoUnidad: f.costo_unidad,
      otrasEmpresas: siNo(f.otras_empresas),
    },
    aportacion: {
      fechaAportacion: f.fecha_aportacion,
      instrumentoMonetario: exigido(f.instrumento_monetario, 'instrumento_monetario', f.operacion_id),
      moneda: exigido(f.moneda_codigo, 'moneda', f.operacion_id),
      montoAportacion: f.monto_aportacion,
      aportacionFideicomiso: siNo(f.aportacion_fideicomiso),
      ...(f.nombre_institucion === null ? {} : { nombreInstitucion: f.nombre_institucion }),
    },
  }
}

async function codigoDeCatalogo(
  db: EjecutorTransaccional,
  p: { actividadId: string; catalogo: string; descripcion: string; fecha: string },
): Promise<string> {
  const { rows } = await db.query(
    `select codigo from catalogos_sat
      where actividad_id = $1 and catalogo = $2 and upper(descripcion) like upper($3)
        and daterange(vigente_desde, vigente_hasta, '[]') @> $4::date`,
    [p.actividadId, p.catalogo, `${p.descripcion}%`, p.fecha],
  )
  if (rows.length !== 1) {
    throw new CatalogoDelAvisoIncompleto(
      `El catálogo '${p.catalogo}' no resolvió exactamente un código para "${p.descripcion}" ` +
        `vigente en ${p.fecha} (encontró ${String(rows.length)}). El generador no inventa ` +
        'códigos del SAT: cárgalos con su vigencia.',
    )
  }
  return (rows[0] as { codigo: string }).codigo
}

export async function generarAviso(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    actividadId: string
    /** Primer día del mes reportado, 'AAAA-MM-01'. */
    periodo: string
    granularidad: Granularidad
  },
  almacen: AlmacenDocumentos,
): Promise<ResultadoAviso> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const formato = await formatoVigente(db, { actividadId: p.actividadId, fecha: p.periodo })

    // El JOIN con `actividades_tenant` NO es adorno.
    //
    // AUDITORÍA DE F1. Aquí se leía de `actividades_vulnerables` a secas, sin
    // comprobar que el obligado tuviera esa actividad CONTRATADA. Y
    // `actividadId` llega desde un campo oculto del formulario, así que es
    // entrada del atacante: basta abrir las herramientas del navegador.
    //
    // Lo que producía no era un error sino un aviso perfectamente válido bajo
    // una fracción que el obligado no ejerce — declarándole a la autoridad una
    // actividad que no realiza. `registrarOperacion` sí lo comprobaba, así que
    // el mismo obligado quedaba protegido por un camino y expuesto por el otro.
    const cab = await db.query(
      `select t.rfc, av.clave_sppld,
              to_char($2::date, 'YYYYMM') as mes_reportado
         from tenants t
         join actividades_tenant at on at.tenant_id = t.id
         join actividades_vulnerables av on av.id = at.actividad_id
        where t.id = $1 and av.id = $3`,
      [p.sesion.tenantId, p.periodo, p.actividadId],
    )
    if (cab.rows.length === 0) {
      throw new CatalogoDelAvisoIncompleto(
        `Este obligado no tiene contratada la actividad ${p.actividadId}, así que no puede ` +
          'presentar avisos bajo ella. Revisa actividades_tenant.',
      )
    }
    const c = cab.rows[0] as { rfc: string; clave_sppld: string | null; mes_reportado: string }
    if (c.clave_sppld === null) {
      throw new CatalogoDelAvisoIncompleto(
        `La actividad ${p.actividadId} no tiene clave_sppld. Sin ella no se puede armar ` +
          '<clave_actividad> y ningún aviso valida. Se carga con el formato oficial de esa ' +
          'fracción, no se adivina.',
      )
    }

    // Reportables: las que el MOTOR marcó, no las que superan un número aquí.
    // El umbral ya se calculó y quedó registrado en evaluaciones_umbral; volver
    // a decidirlo en esta consulta abriría la puerta a que las dos respuestas
    // difieran, y el aviso se defiende con la evaluación.
    //
    // PENDIENTE #10: el periodo se acota con `fecha_operacion`. El Art. 24 Bis
    // del Acuerdo 115/2026 definiría, fracción por fracción, qué fecha cuenta
    // como la del acto. Cuando se contraste contra el DOF, esa regla es un dato
    // del Layer 0 y esta consulta la lee — no cambia de forma.
    const reportables = await db.query(
      `select o.id::text as operacion_id, ev.id::text as evaluacion_id,
              o.desarrollo_id::text as desarrollo_id,
              $4::text as tipo_operacion,
              to_char(o.fecha_operacion, 'YYYYMMDD') as fecha_aportacion,
              o.instrumento_monetario, o.moneda_codigo,
              o.monto_total::text as monto_aportacion,
              o.aportacion_fideicomiso, o.nombre_institucion,
              d.objeto_aviso_anterior, d.entidad_federativa, d.registro_licencia,
              d.codigo_postal, d.colonia, d.calle, d.tipo_desarrollo,
              d.descripcion_desarrollo,
              d.monto_desarrollo::text, d.unidades_comercializadas::text,
              d.costo_unidad::text, d.otras_empresas
         from operaciones_vigentes o
         join desarrollos_inmobiliarios d
           on d.tenant_id = o.tenant_id and d.id = o.desarrollo_id
         join lateral (
           select x.id, x.resultado_aviso
             from evaluaciones_umbral x
            where x.operacion_id = o.id
            order by x.evaluado_en desc limit 1
         ) ev on true
        where o.tenant_id = $3
          and o.actividad_id = $1
          and o.fecha_operacion >= $2::date
          and o.fecha_operacion < ($2::date + interval '1 month')
          and ev.resultado_aviso <> 'no'
        order by o.fecha_operacion, o.id`,
      [p.actividadId, p.periodo, p.sesion.tenantId, await codigoDeCatalogo(db, {
        actividadId: p.actividadId,
        catalogo: 'tipo_operacion',
        descripcion: 'Aportación a Desarrollo',
        fecha: p.periodo,
      })],
    )

    const filas = reportables.rows as FilaReportable[]

    // ────────────────────────────────────────────────────────────────────────
    // LA RED: ninguna operación reportable se queda fuera en silencio
    // ────────────────────────────────────────────────────────────────────────
    // La consulta de arriba une contra `desarrollos_inmobiliarios`. Una
    // operación reportable sin desarrollo NO produce un error: desaparece del
    // resultado, y el periodo sale como informe en cero. El obligado
    // presentaría «no operé» habiendo operado.
    //
    // El trigger `operaciones_exigen_desarrollo` ya impide guardarlas, así que
    // esto cubre lo que entró ANTES de que existiera —y cualquier camino futuro
    // que lo esquive—. Detenerse es la única respuesta correcta: un aviso que
    // omite una operación reportable es peor que no generarlo, porque se
    // presenta, se acusa, y el incumplimiento queda archivado como cumplimiento.
    const huerfanas = await db.query(
      `select o.id::text
         from operaciones_vigentes o
         join lateral (
           select x.resultado_aviso from evaluaciones_umbral x
            where x.operacion_id = o.id order by x.evaluado_en desc limit 1
         ) ev on true
        where o.tenant_id = $3
          and o.actividad_id = $1
          and o.fecha_operacion >= $2::date
          and o.fecha_operacion < ($2::date + interval '1 month')
          and ev.resultado_aviso <> 'no'
          and o.desarrollo_id is null`,
      [p.actividadId, p.periodo, p.sesion.tenantId],
    )

    if (huerfanas.rows.length > 0) {
      const ids = (huerfanas.rows as Array<{ id: string }>).map((r) => r.id)
      throw new AvisoIncompleto(
        `El periodo ${p.periodo} tiene ${String(ids.length)} operación(es) que el motor marcó ` +
          'reportables y que no se pueden describir en el aviso porque no tienen desarrollo ' +
          'inmobiliario asignado. No se generó nada: un aviso sin ellas diría que no hubo qué ' +
          'reportar. Asigna el desarrollo a estas operaciones y vuelve a generar.',
        ids,
      )
    }

    // Consolidar exige un solo desarrollo (Art. 24 Bis 1, tercer párrafo). Se
    // comprueba ANTES de construir el XML: después ya sería un archivo válido
    // contra el XSD y prohibido por la regla, que es la peor combinación.
    if (p.granularidad === 'un_aviso_por_periodo') {
      const desarrollos = [...new Set(filas.map((f) => f.desarrollo_id))]
      if (desarrollos.length > 1) throw new ConsolidacionNoPermitida(desarrollos)
    }

    const operaciones = filas.map(aOperacionDelAviso)

    const prioridad = await codigoDeCatalogo(db, {
      actividadId: p.actividadId,
      catalogo: 'prioridad',
      descripcion: 'NORMAL',
      fecha: p.periodo,
    })

    // "Sin alerta" es lo único que la máquina puede afirmar.
    //
    // El <alerta> del XSD es el catálogo de OPERACIÓN INUSUAL del SAT (3901 a
    // 3913): el cliente se rehúsa a identificarse, paga un tercero sin relación
    // aparente, hay indicios de que no actúa en nombre propio. Todos son juicio
    // humano.
    //
    // Las `alertas` que VIZO genera en la semana 7 son otra cosa: proximidad al
    // umbral y acumulación, que son aritmética. Ponerlas aquí metería una señal
    // automática en el campo donde la autoridad espera la sospecha de una
    // persona — y la regla dura dice que nada automático decide riesgo.
    const tipoAlerta = await codigoDeCatalogo(db, {
      actividadId: p.actividadId,
      catalogo: 'tipo_alerta',
      descripcion: 'Sin alerta',
      fecha: p.periodo,
    })

    // Un aviso por operación, o uno solo con todas: ver `Granularidad`. El XSD
    // admite las dos y la norma no está contrastada (issue #10).
    const avisos: AvisoDelInforme[] =
      p.granularidad === 'un_aviso_por_operacion'
        ? operaciones.map((o, i) => ({
            referencia: referenciaAviso(c.mes_reportado, i + 1),
            prioridad,
            tipoAlerta,
            operaciones: [o],
          }))
        : operaciones.length === 0
          ? []
          : [
              {
                referencia: referenciaAviso(c.mes_reportado, 1),
                prioridad,
                tipoAlerta,
                operaciones,
              },
            ]

    const informe = {
      mesReportado: c.mes_reportado,
      claveSujetoObligado: c.rfc,
      claveActividad: c.clave_sppld,
      avisos,
    }
    const xml = construirInformeXml(informe)

    // BLOQUEANTE, y dentro de la transacción: si no valida no se guarda nada.
    const validacion = validarContraXsd(xml, formato.rutaXsd)
    if (!validacion.valida) {
      throw new AvisoNoValida(
        `El XML del periodo ${p.periodo} no valida contra ${formato.version}. No se guardó ` +
          `nada.\n${validacion.errores.join('\n')}`,
        validacion.errores,
      )
    }

    // Sin operaciones reportables el informe va en cero — mismo formato, cero
    // avisos. Es una obligación por sí misma, no la ausencia de una.
    const tipo = operaciones.length === 0 ? 'cero' : 'normal'
    const hashXml = createHash('sha256').update(xml, 'utf8').digest('hex')

    const ins = await db.query(
      `insert into avisos (tenant_id, actividad_id, periodo, tipo, estatus,
                           formato_aviso_id, hash_xml)
       values ($1,$2,$3::date,$4::tipo_aviso,'validado'::estatus_aviso,$5,$6)
       returning id::text`,
      [p.sesion.tenantId, p.actividadId, p.periodo, tipo, formato.id, hashXml],
    )
    const avisoId = (ins.rows[0] as { id: string }).id

    // ── Fragmentación y guardado ────────────────────────────────────────────
    // El XML no se devuelve y ya: se GUARDA. Hasta esta semana `generarAviso`
    // regresaba la cadena y dejaba `xml_storage_path` en NULL, así que el
    // Representante no tenía nada que descargar y el aviso existía solo como
    // fila. Un aviso que no se puede bajar no se puede presentar.
    // AUDITORÍA DE LA SEMANA 10 — lo que este bucle deja atrás si algo falla.
    //
    // Storage no participa de la transacción. Si un lote se sube y el INSERT
    // que sigue revienta, la base se revierte y el archivo SE QUEDA. Y el
    // bucket no tiene política de DELETE —a propósito: lo que se presentó es
    // evidencia—, así que la aplicación tampoco puede limpiarlo.
    //
    // Se deja así, con el orden puesto para que el daño sea el menor posible:
    // se sube ANTES de insertar la fila, de modo que un lote registrado
    // siempre tiene su archivo. Al revés habría filas apuntando a la nada, que
    // es el fallo que importa. Lo que queda son archivos huérfanos que nadie
    // referencia — basura, no un dato equivocado, y un reintento genera otro
    // avisoId con otras rutas, así que tampoco chocan.
    //
    // La conciliación —listar el bucket contra aviso_lotes— va en su issue. Y
    // sí: esto mantiene la transacción abierta durante N subidas HTTP.
    const fragmentos = fragmentarInforme(informe)
    const lotes: LoteGenerado[] = []

    for (const f of fragmentos) {
      const bytes = new TextEncoder().encode(f.xml)
      const hashLote = createHash('sha256').update(f.xml, 'utf8').digest('hex')
      // El tenant_id ABRE la ruta porque la política de Storage lee
      // storage.foldername(name)[1]. No es estilo: es la frontera.
      const ruta = `${p.sesion.tenantId}/${avisoId}/lote-${String(f.lote).padStart(3, '0')}.xml`

      await almacen.subir(ruta, bytes, 'application/xml')
      await db.query(
        `insert into aviso_lotes (tenant_id, aviso_id, lote, total_lotes,
                                  storage_path, hash_sha256, bytes, avisos_en_lote)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [p.sesion.tenantId, avisoId, f.lote, f.totalLotes, ruta, hashLote, f.bytes, f.avisos],
      )
      lotes.push({
        lote: f.lote,
        totalLotes: f.totalLotes,
        storagePath: ruta,
        hashSha256: hashLote,
        bytes: f.bytes,
      })
    }

    await db.query(
      `update avisos set fragmentos = $2, xml_storage_path = $3 where id = $1`,
      [avisoId, fragmentos.length, lotes[0]?.storagePath ?? null],
    )

    // Qué operación y con QUÉ EVALUACIÓN entró. Sin la evaluación, el aviso
    // afirma un resultado sin dejar ver de qué cálculo salió.
    for (const f of filas) {
      await db.query(
        `insert into aviso_operaciones (tenant_id, aviso_id, operacion_id, evaluacion_id)
         values ($1,$2,$3,$4)`,
        [p.sesion.tenantId, avisoId, f.operacion_id, f.evaluacion_id],
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'aviso.generado',
      'aviso',
      avisoId,
      JSON.stringify({
        periodo: p.periodo,
        tipo,
        formato_version: formato.version,
        granularidad: p.granularidad,
        avisos: avisos.length,
        operaciones: operaciones.length,
        hash_xml: hashXml,
        lotes: lotes.length,
      }),
      p.sesion.usuarioId,
    ])

    return {
      avisoId,
      tipo,
      xml,
      hashXml,
      operacionesIncluidas: operaciones.length,
      avisosEnElInforme: avisos.length,
      formatoVersion: formato.version,
      lotes,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// El flujo humano
// ─────────────────────────────────────────────────────────────────────────
/**
 * Estas tres funciones envuelven a `app.aviso_*`, que son SECURITY DEFINER y
 * viven en la migración 001. Es a propósito que la regla dura no esté aquí:
 *
 * · el rol se comprueba dentro de la función de la base, con `app.es_admin()`
 * · la transición de estado se comprueba ahí mismo
 * · el evento de bitácora se registra ahí mismo, en la misma transacción
 *
 * Así, alguien que llame a la base saltándose este archivo —desde psql, desde
 * otro servicio, desde una consola— topa con las mismas reglas. Si la
 * comprobación viviera en TypeScript, sería una sugerencia.
 */

export class TransicionInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'TransicionInvalida'
  }
}

/**
 * `validado` → `listo_revision`: el aviso pasa a manos de una persona.
 *
 * Existe como paso propio y no como parte de generar, porque son dos actos
 * distintos: la máquina terminó su parte, y alguien decide que eso ya se puede
 * revisar. Van por UPDATE porque la política de la base solo deja mover el
 * aviso entre los estados PREVIOS a la aprobación — pasar a `aprobado` por
 * esta vía lo rechaza el `with check`.
 */
export async function marcarListoParaRevision(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; avisoId: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rowCount } = (await db.query(
      `update avisos set estatus = 'listo_revision'::estatus_aviso
        where id = $1 and tenant_id = $2 and estatus = 'validado'::estatus_aviso`,
      [p.avisoId, p.sesion.tenantId],
    )) as unknown as { rowCount: number }

    if (rowCount !== 1) {
      throw new TransicionInvalida(
        `El aviso ${p.avisoId} no pasó a revisión. O no es de este obligado, o no está en ` +
          "'validado', o quien lo intenta no es admin. Un aviso solo llega a revisión " +
          'después de validar contra el XSD.',
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'aviso.listo_revision',
      'aviso',
      p.avisoId,
      JSON.stringify({}),
      p.sesion.usuarioId,
    ])
  })
}

/**
 * La aprobación humana: el segundo paso bloqueante del pipeline.
 *
 * No la hace VIZO. La hace una persona con nombre, y queda su id y su hora en
 * la bitácora. Automatizar esto destruiría el valor probatorio de todo lo
 * demás: un aviso aprobado por un proceso no lo aprobó nadie.
 */
export async function aprobarAviso(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; avisoId: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    await db.query('select app.aviso_aprobar($1)', [p.avisoId])
  })
}

/**
 * El acuse que devuelve el portal, después de que la PERSONA presentó.
 *
 * VIZO no presenta. El archivo se sube al SPPLD con la e.firma del sujeto
 * obligado, y lo que vuelve —el acuse— se registra aquí como prueba de que se
 * cumplió. Registrar el acuse es lo que mueve el aviso a `presentado`: el
 * estado no lo declara VIZO, lo declara la evidencia.
 */
export async function registrarAcuse(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; avisoId: string; storagePath: string; folio: string },
): Promise<void> {
  // El folio se valida ANTES de guardarlo. Un folio con otra forma no rompe
  // nada hoy: rompe el día que haya que corregir este aviso, meses después,
  // cuando el modificatorio no valide y ya no se pueda cambiar —la fila es
  // append-only a partir de presentado—.
  if (!PATRON_FOLIO.test(p.folio)) {
    throw new CatalogoDelAvisoIncompleto(
      `El folio "${p.folio}" no tiene la forma que el SPPLD asigna (AAAA-N, por ejemplo ` +
        '2026-12345). Cópialo del acuse tal como viene: es lo que identifica este aviso si ' +
        'algún día hay que corregirlo.',
    )
  }
  return enTransaccionDeSesion(db, p.sesion, async () => {
    await db.query('select app.aviso_registrar_acuse($1,$2,$3)', [
      p.avisoId,
      p.storagePath,
      p.folio,
    ])
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Lectura para la pantalla
// ─────────────────────────────────────────────────────────────────────────

export interface PasoDelAviso {
  evento: string
  ocurridoEn: string
  /** Nombre de quien lo hizo; null si el evento no llevó actor. */
  actor: string | null
}

export interface DetalleAviso {
  id: string
  periodo: string
  tipo: string
  estatus: string
  formatoVersion: string
  hashXml: string | null
  fragmentos: number
  operaciones: number
  lotes: Array<{
    lote: number
    totalLotes: number
    storagePath: string
    hashSha256: string
    bytes: number
    avisosEnLote: number
  }>
  /** El ciclo tal como quedó en la bitácora, en orden. */
  pasos: PasoDelAviso[]
  acuseStoragePath: string | null
}

/**
 * Todo lo que la pantalla del aviso necesita, en una lectura.
 *
 * Los pasos salen de la BITÁCORA, no de las columnas de `avisos`. La fila dice
 * en qué estado está hoy; la bitácora dice cómo llegó ahí y quién lo movió — y
 * eso último es lo que se defiende. Un aviso aprobado sin nombre no lo aprobó
 * nadie.
 */
export async function detalleDeAviso(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; avisoId: string },
): Promise<DetalleAviso | null> {
  const cab = await db.query(
    `select a.id::text, a.periodo::text, a.tipo::text, a.estatus::text,
            a.hash_xml, a.fragmentos, a.acuse_storage_path,
            f.version as formato_version,
            (select count(*)::int from aviso_operaciones ao where ao.aviso_id = a.id) as operaciones
       from avisos a
       join formatos_aviso f on f.id = a.formato_aviso_id
      where a.id = $1 and a.tenant_id = $2`,
    [p.avisoId, p.sesion.tenantId],
  )
  if (cab.rows.length === 0) return null

  const a = cab.rows[0] as {
    id: string
    periodo: string
    tipo: string
    estatus: string
    hash_xml: string | null
    fragmentos: number
    acuse_storage_path: string | null
    formato_version: string
    operaciones: number
  }

  const lotes = await db.query(
    `select lote, total_lotes, storage_path, hash_sha256, bytes, avisos_en_lote
       from aviso_lotes where aviso_id = $1 and tenant_id = $2 order by lote`,
    [p.avisoId, p.sesion.tenantId],
  )

  const pasos = await db.query(
    `select b.evento,
            to_char(b.ocurrido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ocurrido_en,
            u.nombre as actor
       from bitacora b
       left join usuarios u on u.tenant_id = b.tenant_id and u.id = b.actor_id
      where b.tenant_id = $1 and b.objeto_id = $2 and b.objeto_tipo = 'aviso'
      order by b.secuencia`,
    [p.sesion.tenantId, p.avisoId],
  )

  return {
    id: a.id,
    periodo: a.periodo,
    tipo: a.tipo,
    estatus: a.estatus,
    formatoVersion: a.formato_version,
    hashXml: a.hash_xml,
    fragmentos: a.fragmentos,
    operaciones: a.operaciones,
    acuseStoragePath: a.acuse_storage_path,
    lotes: (
      lotes.rows as Array<{
        lote: number
        total_lotes: number
        storage_path: string
        hash_sha256: string
        bytes: number
        avisos_en_lote: number
      }>
    ).map((l) => ({
      lote: l.lote,
      totalLotes: l.total_lotes,
      storagePath: l.storage_path,
      hashSha256: l.hash_sha256,
      bytes: l.bytes,
      avisosEnLote: l.avisos_en_lote,
    })),
    pasos: (
      pasos.rows as Array<{ evento: string; ocurrido_en: string; actor: string | null }>
    ).map((s) => ({ evento: s.evento, ocurridoEn: s.ocurrido_en, actor: s.actor })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// El aviso modificatorio
// ─────────────────────────────────────────────────────────────────────────

export class ModificatorioInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ModificatorioInvalido'
  }
}

/**
 * Corrige un aviso YA PRESENTADO.
 *
 * No es volver a generar: es presentar otro archivo que dice cuál corrige —por
 * su folio del SPPLD— y por qué. El aviso original no se toca ni se marca: a
 * partir de `aprobado` la fila es inmutable, y así debe ser. Los dos coexisten,
 * y el historial cuenta que hubo una corrección.
 *
 * Solo se corrige lo PRESENTADO. Un aviso que todavía no salió no necesita
 * modificatorio — necesita corregirse antes de salir, que es otra cosa y no
 * deja rastro ante la autoridad.
 *
 * Un periodo admite varios modificatorios: si el primero también sale con un
 * dato equivocado hay que corregirlo otra vez, y la base lo permite a
 * propósito (ver la migración del modificatorio).
 */
export async function generarModificatorio(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    /** El aviso presentado que se corrige. */
    avisoOriginalId: string
    /** Qué se corrige y por qué. Va en el XML, así que se normaliza. */
    descripcion: string
    granularidad: Granularidad
  },
  almacen: AlmacenDocumentos,
): Promise<ResultadoAviso> {
  if (p.descripcion.trim().length === 0) {
    throw new ModificatorioInvalido(
      'Un modificatorio sin explicación no le dice a la autoridad qué cambió. Describe la ' +
        'corrección.',
    )
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const orig = await db.query(
      `select a.id::text, a.actividad_id::text, a.periodo::text, a.estatus::text,
              a.acuse_folio, a.formato_aviso_id::text,
              t.rfc, av.clave_sppld,
              to_char(a.periodo, 'YYYYMM') as mes_reportado
         from avisos a
         join tenants t on t.id = a.tenant_id
         join actividades_vulnerables av on av.id = a.actividad_id
        where a.id = $1 and a.tenant_id = $2`,
      [p.avisoOriginalId, p.sesion.tenantId],
    )
    if (orig.rows.length === 0) {
      throw new ModificatorioInvalido(`No existe el aviso ${p.avisoOriginalId} en este obligado.`)
    }
    const o = orig.rows[0] as {
      id: string
      actividad_id: string
      periodo: string
      estatus: string
      acuse_folio: string | null
      formato_aviso_id: string
      rfc: string
      clave_sppld: string | null
      mes_reportado: string
    }

    if (o.estatus !== 'presentado') {
      throw new ModificatorioInvalido(
        `Solo se corrige un aviso ya presentado (estatus actual: ${o.estatus}). Uno que ` +
          'todavía no salió se arregla antes de presentarlo, y eso no es un modificatorio.',
      )
    }
    if (o.acuse_folio === null) {
      throw new ModificatorioInvalido(
        'El aviso original no tiene folio del acuse, y el XSD lo exige para decir cuál se ' +
          'corrige. Regístralo en el acuse antes de poder corregirlo.',
      )
    }
    if (o.clave_sppld === null) {
      throw new ModificatorioInvalido(
        `La actividad ${o.actividad_id} no tiene clave_sppld cargada.`,
      )
    }

    // El formato es el MISMO del original, no el vigente hoy: se corrige un
    // aviso que se presentó con cierto esquema, y cambiar de formato a medio
    // camino produce un archivo que la autoridad no puede casar con el
    // anterior.
    const fmt = await db.query(
      `select version, ruta_xsd from formatos_aviso where id = $1`,
      [o.formato_aviso_id],
    )
    const formato = fmt.rows[0] as { version: string; ruta_xsd: string }

    // Las MISMAS operaciones del aviso original, con sus mismas evaluaciones.
    // Un modificatorio corrige la presentación, no vuelve a decidir qué era
    // reportable: eso ya lo resolvió el motor y quedó registrado.
    const reportables = await db.query(
      `select o.id::text as operacion_id, ao.evaluacion_id::text,
              $3::text as tipo_operacion,
              to_char(o.fecha_operacion, 'YYYYMMDD') as fecha_aportacion,
              o.instrumento_monetario, o.moneda_codigo,
              o.monto_total::text as monto_aportacion,
              o.aportacion_fideicomiso, o.nombre_institucion,
              d.objeto_aviso_anterior, d.entidad_federativa, d.registro_licencia,
              d.codigo_postal, d.colonia, d.calle, d.tipo_desarrollo,
              d.descripcion_desarrollo,
              d.monto_desarrollo::text, d.unidades_comercializadas::text,
              d.costo_unidad::text, d.otras_empresas
         from aviso_operaciones ao
         join operaciones o on o.tenant_id = ao.tenant_id and o.id = ao.operacion_id
         join desarrollos_inmobiliarios d
           on d.tenant_id = o.tenant_id and d.id = o.desarrollo_id
        where ao.tenant_id = $1 and ao.aviso_id = $2
        order by o.fecha_operacion, o.id`,
      [
        p.sesion.tenantId,
        p.avisoOriginalId,
        await codigoDeCatalogo(db, {
          actividadId: o.actividad_id,
          catalogo: 'tipo_operacion',
          descripcion: 'Aportación a Desarrollo',
          fecha: o.periodo,
        }),
      ],
    )

    const filas = reportables.rows as FilaReportable[]
    // `modificacion` en SÍ: el bloque del desarrollo también lo declara, y es
    // lo que distingue este envío del original a nivel de operación.
    const operaciones = filas.map((f) => {
      const op = aOperacionDelAviso(f)
      return { ...op, desarrollo: { ...op.desarrollo, modificacion: 'SI' as const } }
    })

    const prioridad = await codigoDeCatalogo(db, {
      actividadId: o.actividad_id,
      catalogo: 'prioridad',
      descripcion: 'NORMAL',
      fecha: o.periodo,
    })
    const tipoAlerta = await codigoDeCatalogo(db, {
      actividadId: o.actividad_id,
      catalogo: 'tipo_alerta',
      descripcion: 'Sin alerta',
      fecha: o.periodo,
    })

    const modificatorio = {
      folioModificacion: o.acuse_folio,
      descripcionModificacion: p.descripcion,
    }

    const avisos: AvisoDelInforme[] =
      p.granularidad === 'un_aviso_por_operacion'
        ? operaciones.map((op, i) => ({
            referencia: referenciaAviso(o.mes_reportado, i + 1),
            modificatorio,
            prioridad,
            tipoAlerta,
            operaciones: [op],
          }))
        : operaciones.length === 0
          ? []
          : [
              {
                referencia: referenciaAviso(o.mes_reportado, 1),
                modificatorio,
                prioridad,
                tipoAlerta,
                operaciones,
              },
            ]

    const informe = {
      mesReportado: o.mes_reportado,
      claveSujetoObligado: o.rfc,
      claveActividad: o.clave_sppld,
      avisos,
    }
    const xml = construirInformeXml(informe)

    const validacion = validarContraXsd(xml, formato.ruta_xsd)
    if (!validacion.valida) {
      throw new AvisoNoValida(
        `El modificatorio no valida contra ${formato.version}. No se guardó nada.\n` +
          validacion.errores.join('\n'),
        validacion.errores,
      )
    }

    const hashXml = createHash('sha256').update(xml, 'utf8').digest('hex')
    const ins = await db.query(
      `insert into avisos (tenant_id, actividad_id, periodo, tipo, estatus,
                           formato_aviso_id, hash_xml, modifica_a)
       values ($1,$2,$3::date,'modificatorio'::tipo_aviso,'validado'::estatus_aviso,$4,$5,$6)
       returning id::text`,
      [p.sesion.tenantId, o.actividad_id, o.periodo, o.formato_aviso_id, hashXml, o.id],
    )
    const avisoId = (ins.rows[0] as { id: string }).id

    const fragmentos = fragmentarInforme(informe)
    const lotes: LoteGenerado[] = []
    for (const f of fragmentos) {
      const bytes = new TextEncoder().encode(f.xml)
      const hashLote = createHash('sha256').update(f.xml, 'utf8').digest('hex')
      const ruta = `${p.sesion.tenantId}/${avisoId}/lote-${String(f.lote).padStart(3, '0')}.xml`
      await almacen.subir(ruta, bytes, 'application/xml')
      await db.query(
        `insert into aviso_lotes (tenant_id, aviso_id, lote, total_lotes,
                                  storage_path, hash_sha256, bytes, avisos_en_lote)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [p.sesion.tenantId, avisoId, f.lote, f.totalLotes, ruta, hashLote, f.bytes, f.avisos],
      )
      lotes.push({
        lote: f.lote,
        totalLotes: f.totalLotes,
        storagePath: ruta,
        hashSha256: hashLote,
        bytes: f.bytes,
      })
    }

    await db.query(`update avisos set fragmentos = $2, xml_storage_path = $3 where id = $1`, [
      avisoId,
      fragmentos.length,
      lotes[0]?.storagePath ?? null,
    ])

    for (const f of filas) {
      await db.query(
        `insert into aviso_operaciones (tenant_id, aviso_id, operacion_id, evaluacion_id)
         values ($1,$2,$3,$4)`,
        [p.sesion.tenantId, avisoId, f.operacion_id, f.evaluacion_id],
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'aviso.modificatorio_generado',
      'aviso',
      avisoId,
      JSON.stringify({
        periodo: o.periodo,
        modifica_a: o.id,
        folio_original: o.acuse_folio,
        descripcion: p.descripcion,
        hash_xml: hashXml,
      }),
      p.sesion.usuarioId,
    ])

    return {
      avisoId,
      tipo: 'normal',
      xml,
      hashXml,
      operacionesIncluidas: operaciones.length,
      avisosEnElInforme: avisos.length,
      formatoVersion: formato.version,
      lotes,
    }
  })
}
