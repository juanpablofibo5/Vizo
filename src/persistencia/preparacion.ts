import type { EjecutorSql } from '../catalogo/cargador'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'

/**
 * La preparación del CATÁLOGO para las actividades de un obligado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL EJE QUE FALTABA, Y LOS CUATRO DEFECTOS QUE LO PIDIERON
 * ────────────────────────────────────────────────────────────────────────────
 * `arranque.ts` responde qué le falta AL OBLIGADO: contratar su actividad,
 * declarar su fecha de alta, abrir un expediente. Este módulo responde la otra
 * mitad, que nadie estaba respondiendo: **qué le falta a VIZO** para que la
 * actividad de ese obligado funcione. Son ejes distintos y se confundían — un
 * obligado con todo su arranque en verde puede toparse con una pantalla
 * inservible porque el catálogo de su fracción está a medias.
 *
 * Los cuatro defectos que encontró el ensayo de la demo del 30-ago-2026 eran
 * el mismo error escrito cuatro veces: **la pantalla decidía por su cuenta lo
 * que el catálogo ya sabía.**
 *
 *   1. La captura de operaciones exigía desarrollo inmobiliario a todos,
 *      cuando `actividades_vulnerables.requiere_desarrollo` ya lo decía.
 *   2. Instrumento y moneda se pintaban como campos obligatorios aunque el
 *      catálogo del SAT de esa actividad estuviera vacío — un `select`
 *      requerido sin opciones bloquea el envío EN SILENCIO.
 *   3. «Generar aviso» enseñaba el mensaje del backoffice al obligado.
 *   4. El expediente se abría contra la Fr. V Bis escrita en el código.
 *
 * Ninguno lo vio la suite, porque cada pantalla preguntaba a su manera. Aquí
 * se pregunta UNA vez, y las pantallas pintan la respuesta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ ES UNA PIEZA
 * ────────────────────────────────────────────────────────────────────────────
 * Cada pieza es un dato del catálogo del que depende algo concreto, y lleva
 * escrito **qué deja de funcionar sin ella**. Esa frase es la que se le enseña
 * al obligado: no «falta catalogos_sat», sino qué no va a poder hacer y quién
 * lo resuelve.
 *
 * Una pieza que falta NUNCA se rellena ni se supone. La pantalla que depende
 * de ella no ofrece su acción — es la regla dura 6 aplicada a la interfaz:
 * mejor una acción ausente y explicada que una que revienta a medio camino, o
 * peor, una que parece funcionar.
 */

/** Las piezas del catálogo que una actividad necesita para operar. */
export type ClaveDePieza = 'umbrales' | 'expediente' | 'catalogos_captura' | 'formato_aviso'

export interface PiezaDelCatalogo {
  clave: ClaveDePieza
  /** Cómo se llama en la pantalla del obligado. */
  nombre: string
  cargada: boolean
  /** Qué deja de funcionar sin ella, dicho para quien lo va a leer. */
  bloquea: string
}

export interface PreparacionDeActividad {
  actividadId: string
  fraccion: string
  nombre: string
  /** Lo dice el catálogo, no la pantalla: la V Bis describe un desarrollo. */
  requiereDesarrollo: boolean
  piezas: PiezaDelCatalogo[]
  /** Qué SÍ se puede hacer hoy con esta actividad. */
  puedeCapturarOperacion: boolean
  puedeAbrirExpediente: boolean
  puedeGenerarAviso: boolean
  /** Las piezas que faltan, para enseñarlas sin recorrer la lista. */
  faltantes: PiezaDelCatalogo[]
}

interface FilaPreparacion {
  actividad_id: string
  fraccion: string
  nombre: string
  requiere_desarrollo: boolean
  umbrales: number
  campos: number
  catalogos_captura: number
  formatos: number
  clave_sppld: string | null
}

/**
 * Los dos catálogos del SAT que el formulario de captura pinta como
 * obligatorios. Si el catálogo de la actividad no los tiene, el campo no se
 * pinta — y sin esta consulta, se pintaba vacío y sin explicación.
 */
const CATALOGOS_DE_CAPTURA = ['instrumento_monetario', 'moneda']

export async function preparacionDelCatalogo(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string },
): Promise<PreparacionDeActividad[]> {
  await exigirSesionActiva(db, p.sesion)

  const { rows } = await db.query(
    `select av.id::text as actividad_id, av.fraccion, av.nombre,
            av.requiere_desarrollo, av.clave_sppld,
            (select count(*) from umbrales u
              where u.actividad_id = av.id
                and daterange(u.vigente_desde, u.vigente_hasta, '[]') @> $2::date)::int
              as umbrales,
            (select count(*) from campos_expediente ce
              where ce.actividad_id = av.id
                and daterange(ce.vigente_desde, ce.vigente_hasta, '[]') @> $2::date)::int
              as campos,
            (select count(distinct cs.catalogo) from catalogos_sat cs
              where cs.actividad_id = av.id
                and cs.catalogo = any($3::text[])
                and daterange(cs.vigente_desde, cs.vigente_hasta, '[]') @> $2::date)::int
              as catalogos_captura,
            (select count(*) from formatos_aviso fa
              where fa.actividad_id = av.id
                and daterange(fa.vigente_desde, fa.vigente_hasta, '[]') @> $2::date)::int
              as formatos
       from actividades_vulnerables av
       join actividades_tenant at on at.actividad_id = av.id and at.tenant_id = $1
      order by av.fraccion`,
    [p.sesion.tenantId, p.hoy, CATALOGOS_DE_CAPTURA],
  )

  return (rows as FilaPreparacion[]).map((f) => {
    const piezas: PiezaDelCatalogo[] = [
      {
        clave: 'umbrales',
        nombre: 'Umbrales de la actividad',
        cargada: f.umbrales > 0,
        bloquea:
          'Sin umbrales vigentes no se puede evaluar ninguna operación: no hay contra qué medirla.',
      },
      {
        clave: 'expediente',
        nombre: 'Qué integra el expediente',
        cargada: f.campos > 0,
        bloquea:
          'Sin el catálogo de expediente no se le puede abrir uno a ningún cliente. Un expediente ' +
          'sin requisitos contra los cuales medirse se vería «completo» sin estarlo.',
      },
      {
        clave: 'catalogos_captura',
        nombre: 'Catálogos del SAT para captura',
        cargada: f.catalogos_captura >= CATALOGOS_DE_CAPTURA.length,
        bloquea:
          'Instrumento monetario y moneda son códigos del SAT de esta actividad. Sin ellos la ' +
          'operación se captura igual, pero esos dos datos quedan pendientes hasta que lleguen ' +
          'con el formato del aviso.',
      },
      {
        clave: 'formato_aviso',
        nombre: 'Formato oficial del aviso',
        // La clave del SPPLD va en el mismo saco: un formato sin la clave con
        // la que el portal identifica a la actividad no produce un aviso
        // presentable, y descubrirlo al generarlo cuesta el plazo.
        cargada: f.formatos > 0 && f.clave_sppld !== null,
        bloquea:
          'Sin el formato oficial (el XSD que publica el SPPLD) no se puede generar el aviso. ' +
          'VIZO no supone un formato: un aviso con el formato equivocado es un aviso rechazado.',
      },
    ]

    const cargada = (c: ClaveDePieza): boolean =>
      piezas.find((x) => x.clave === c)?.cargada === true

    return {
      actividadId: f.actividad_id,
      fraccion: f.fraccion,
      nombre: f.nombre,
      requiereDesarrollo: f.requiere_desarrollo,
      piezas,
      // Capturar solo necesita con qué evaluar. Los catálogos del SAT afinan
      // el aviso, no el veredicto — por eso su ausencia no detiene la captura.
      puedeCapturarOperacion: cargada('umbrales'),
      puedeAbrirExpediente: cargada('expediente'),
      puedeGenerarAviso: cargada('umbrales') && cargada('formato_aviso'),
      faltantes: piezas.filter((x) => !x.cargada),
    }
  })
}

/** La preparación de UNA actividad, o null si el obligado no la tiene. */
export async function preparacionDeActividad(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; hoy: string; actividadId: string },
): Promise<PreparacionDeActividad | null> {
  const todas = await preparacionDelCatalogo(db, { sesion: p.sesion, hoy: p.hoy })
  return todas.find((a) => a.actividadId === p.actividadId) ?? null
}
