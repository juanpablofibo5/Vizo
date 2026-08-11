import { opcional, rama, serializarDocumento, texto, type Nodo } from './xml'

/**
 * Armado del informe del SPPLD para la Fr. V Bis (desarrollo inmobiliario).
 *
 * La estructura sale del XSD (`regulatorio/xsd/din.xsd`), NO del ejemplo
 * publicado por el SAT. Esa distinción no es doctrinaria: el ejemplo oficial no
 * valida contra su propio esquema (ver `src/aviso/validacion.ts`), así que
 * copiarlo produce avisos rechazados.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOS TRAMPAS DEL ESQUEMA QUE UNA LISTA DE ELEMENTOS NO REVELA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. Casi todo es `xsd:sequence`: **el orden de los elementos es parte de la
 *    especificación**. Equivocarlo falla con "This element is not expected",
 *    que no menciona el orden por ningún lado.
 *
 * 2. `tipo_aportacion_type` y `datos_aportacion_type` son `xsd:choice`. Sus
 *    elementos declaran `minOccurs="1"` cada uno —seis modalidades de
 *    aportación, dos formas de aportar—, y leído como lista eso dice "todos
 *    obligatorios". Dentro de un choice significa **exactamente uno**. El
 *    cruce mecánico XSD↔modelo de la semana 6 casaba elementos con una regex:
 *    no habría visto la diferencia.
 *
 * Por eso la estructura se transcribe a mano contra el esquema, con el orden
 * explícito en una lista, y la prueba es que el XML resultante valide.
 */

export const NAMESPACE_DIN = 'http://www.uif.shcp.gob.mx/recepcion/din'

/**
 * El texto libre, en la forma que el XSD admite.
 *
 * HALLAZGO AL VERIFICAR EL GUION DE DEMO. Los tipos de texto del esquema
 * —`descripcion_1-3000_type`, `direccion_1-50_type`— solo aceptan
 * `[A-ZÑ\d ...]`: MAYÚSCULAS SIN ACENTOS. Una dirección escrita como la
 * escribiría cualquiera —"Calle 33 Diagonal, Montes de Amé"— produce un XML que
 * no valida.
 *
 * Sin esto, el modo de falla era el peor posible: la captura se acepta sin
 * problema y el aviso revienta semanas después, al generarlo, con un volcado de
 * libxml en pantalla. El obligado descubre el día 16 que no puede presentar.
 *
 * NO es "cambiar el dato". El dato capturado se conserva intacto en la base;
 * esto es la representación que el formato oficial exige, igual que una fecha
 * viaja como AAAAMMDD sin que nadie diga que se alteró.
 *
 * Los caracteres sin equivalente —un emoji, un símbolo raro— se vuelven espacio
 * en vez de reventar. Es la decisión menos mala de las dos: un aviso rechazado
 * bloquea el cumplimiento; una descripción con un carácter exótico convertido
 * en espacio dice exactamente lo mismo.
 */
const ADMITIDOS = /[^A-ZÑ0-9 \-_.,;:/()[\]"'&#@$+]/g

export function normalizarTextoDelAviso(valor: string): string {
  return valor
    // La Ñ sobrevive: el esquema la admite, y descomponerla la perdería.
    .replaceAll('ñ', '\u0001')
    .replaceAll('Ñ', '\u0001')
    .normalize('NFD')
    // Quita los diacríticos ya separados de su letra: á → a + ´ → a.
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('\u0001', 'Ñ')
    .toUpperCase()
    .replace(ADMITIDOS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class InformeIncompleto extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'InformeIncompleto'
  }
}

/**
 * Cuántas operaciones caben en un aviso.
 *
 * NO tiene valor por omisión, y es a propósito. El Acuerdo 115/2026 (Art. 24
 * Bis 1) diría —según fuentes secundarias sin contrastar contra el DOF— que va
 * un aviso por cada acto u operación, sin consolidar. El XSD **no desempata**:
 * declara `aviso maxOccurs="unbounded"` y, dentro, `datos_operacion
 * maxOccurs="unbounded"`, así que las dos lecturas producen XML válido.
 *
 * Cuando el esquema admite dos lecturas y la norma no está verificada, elegir
 * una en silencio es exactamente el modo de falla de este proyecto: nada
 * revienta y el resultado es plausible. Así que quien llama lo declara, y
 * cambiar de una a otra es un dato — no una reescritura del generador.
 *
 * Se resuelve al cerrar el issue #10.
 */
export type Granularidad = 'un_aviso_por_operacion' | 'un_aviso_por_periodo'

export interface Aportacion {
  /** AAAAMMDD. */
  fechaAportacion: string
  instrumentoMonetario: string
  moneda: string
  /** Texto tal como lo devuelve Postgres. Nunca un number. */
  montoAportacion: string
  aportacionFideicomiso: 'SI' | 'NO'
  nombreInstitucion?: string
}

export interface Desarrollo {
  objetoAvisoAnterior: 'SI' | 'NO'
  modificacion: 'SI' | 'NO'
  entidadFederativa: string
  registroLicencia: string
  codigoPostal: string
  colonia: string
  calle: string
  tipoDesarrollo: string
  descripcionDesarrollo?: string
  montoDesarrollo: string
  unidadesComercializadas: string
  costoUnidad: string
  otrasEmpresas: 'SI' | 'NO'
}

export interface OperacionDelAviso {
  tipoOperacion: string
  desarrollo: Desarrollo
  aportacion: Aportacion
}

export interface AvisoDelInforme {
  referencia: string
  prioridad: string
  tipoAlerta: string
  descripcionAlerta?: string
  operaciones: OperacionDelAviso[]
}

/**
 * La referencia del aviso, conforme por construcción.
 *
 * El XSD la restringe a `[A-ZÑ0-9]{1,14}`: sin guiones, sin minúsculas, máximo
 * catorce. Es fácil no notarlo —una referencia "legible" tipo
 * `VIZO-2026-05-0001` parece razonable y falla por dos motivos a la vez— y es
 * de las cosas que VIZO GENERA, así que tiene que salir bien de fábrica en vez
 * de rebotar en el validador.
 *
 * `V` + AAAAMM + consecutivo de 7 dígitos = exactamente 14. El consecutivo es
 * por informe, así que la referencia dice de un vistazo a qué periodo pertenece
 * y qué lugar ocupa.
 *
 * El patrón está duplicado aquí y en el XSD, y hay un test que comprueba que
 * sigan siendo el mismo — el mismo trato que los patrones de RFC y CURP de la
 * semana 1.
 */
export const PATRON_REFERENCIA = /^[A-ZÑ0-9]{1,14}$/

export function referenciaAviso(mesReportado: string, consecutivo: number): string {
  if (!Number.isInteger(consecutivo) || consecutivo < 1 || consecutivo > 9_999_999) {
    throw new InformeIncompleto(
      `El consecutivo del aviso debe ser un entero entre 1 y 9,999,999 y llegó ${String(consecutivo)}.`,
    )
  }
  return `V${mesReportado}${String(consecutivo).padStart(7, '0')}`
}

export interface Informe {
  /** AAAAMM. */
  mesReportado: string
  claveSujetoObligado: string
  claveActividad: string
  claveEntidadColegiada?: string
  avisos: AvisoDelInforme[]
}

// ─────────────────────────────────────────────────────────────────────────
// Árbol, en el orden que fija el xsd:sequence
// ─────────────────────────────────────────────────────────────────────────

function nodoAportacion(a: Aportacion): Nodo {
  // `datos_aportacion` es un CHOICE: numerario o especie, nunca las dos.
  const numerario = rama('aportacion_numerario', [
    texto('instrumento_monetario', a.instrumentoMonetario),
    texto('moneda', a.moneda),
    texto('monto_aportacion', a.montoAportacion),
    texto('aportacion_fideicomiso', a.aportacionFideicomiso),
    ...opcional(
      'nombre_institucion',
      a.nombreInstitucion === undefined ? undefined : normalizarTextoDelAviso(a.nombreInstitucion),
    ),
  ])

  return rama('aportaciones', [
    texto('fecha_aportacion', a.fechaAportacion),
    // `tipo_aportacion` también es CHOICE. Aquí solo se emite
    // `recursos_propios`: las otras cinco modalidades —socios, terceros, los
    // dos préstamos y bursátil— siguen abiertas en el issue #1, y emitir una
    // vacía produciría un aviso que declara una aportación que no existió.
    rama('tipo_aportacion', [rama('recursos_propios', [rama('datos_aportacion', [numerario])])]),
  ])
}

function nodoDesarrollo(d: Desarrollo): Nodo {
  return rama('desarrollos_inmobiliarios', [
    rama('datos_desarrollo', [
      texto('objeto_aviso_anterior', d.objetoAvisoAnterior),
      texto('modificacion', d.modificacion),
      texto('entidad_federativa', d.entidadFederativa),
      texto('registro_licencia', normalizarTextoDelAviso(d.registroLicencia)),
      rama('caracteristicas_desarrollo', [
        texto('codigo_postal', d.codigoPostal),
        texto('colonia', normalizarTextoDelAviso(d.colonia)),
        texto('calle', normalizarTextoDelAviso(d.calle)),
        texto('tipo_desarrollo', d.tipoDesarrollo),
        ...opcional(
          'descripcion_desarrollo',
          d.descripcionDesarrollo === undefined
            ? undefined
            : normalizarTextoDelAviso(d.descripcionDesarrollo),
        ),
        texto('monto_desarrollo', d.montoDesarrollo),
        texto('unidades_comercializadas', d.unidadesComercializadas),
        texto('costo_unidad', d.costoUnidad),
        texto('otras_empresas', d.otrasEmpresas),
      ]),
    ]),
  ])
}

function nodoAviso(a: AvisoDelInforme): Nodo {
  if (a.operaciones.length === 0) {
    // El XSD exige `datos_operacion` al menos una vez. Un aviso sin
    // operaciones no es un informe en cero: es un aviso vacío, que además no
    // valida. Los dos casos se confundirían en silencio (regla dura 6).
    throw new InformeIncompleto(
      `El aviso ${a.referencia} no tiene ninguna operación. Un periodo sin operaciones ` +
        'reportables se declara como informe en cero —sin avisos—, no como un aviso vacío.',
    )
  }

  if (!PATRON_REFERENCIA.test(a.referencia)) {
    throw new InformeIncompleto(
      `La referencia "${a.referencia}" no cumple el patrón del XSD [A-ZÑ0-9]{1,14}: sin ` +
        'guiones, sin minúsculas, máximo catorce. Constrúyela con `referenciaAviso`.',
    )
  }

  return rama('aviso', [
    texto('referencia_aviso', a.referencia),
    texto('prioridad', a.prioridad),
    rama('alerta', [
      texto('tipo_alerta', a.tipoAlerta),
      ...opcional('descripcion_alerta', a.descripcionAlerta),
    ]),
    rama(
      'detalle_operaciones',
      a.operaciones.map((o) =>
        rama('datos_operacion', [
          texto('tipo_operacion', o.tipoOperacion),
          nodoDesarrollo(o.desarrollo),
          nodoAportacion(o.aportacion),
        ]),
      ),
    ),
  ])
}

/**
 * Arma el XML del archivo.
 *
 * Un informe SIN avisos es válido y es el informe en cero: el XSD declara
 * `aviso` con `minOccurs="0"`, así que no hay un formato aparte que mantener
 * — es el mismo con cero avisos.
 */
export function construirInformeXml(informe: Informe): string {
  if (!/^\d{6}$/.test(informe.mesReportado)) {
    throw new InformeIncompleto(
      `mes_reportado debe ser AAAAMM y llegó "${informe.mesReportado}".`,
    )
  }

  const raiz = rama('archivo', [
    rama('informe', [
      texto('mes_reportado', informe.mesReportado),
      rama('sujeto_obligado', [
        ...opcional('clave_entidad_colegiada', informe.claveEntidadColegiada),
        texto('clave_sujeto_obligado', informe.claveSujetoObligado),
        texto('clave_actividad', informe.claveActividad),
      ]),
      ...informe.avisos.map(nodoAviso),
    ]),
  ])

  return serializarDocumento(raiz, { xmlns: NAMESPACE_DIN })
}
