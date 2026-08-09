import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { conectar } from '../soporte/db'

/**
 * Cruce del XSD oficial contra el modelo de datos.
 *
 * `docs/campos-aviso.md §6` hacía este cruce a mano, en una tabla de markdown.
 * Una tabla escrita a mano envejece: alguien renombra una columna en la
 * semana 9 y el documento sigue diciendo que todo calza. Esto lo hace la
 * máquina y contra el esquema real.
 *
 * Tres cosas se verifican, y la primera es la que más importa:
 *
 *   1. TODO elemento hoja del XSD tiene una entrada aquí. No se puede omitir
 *      un campo por olvido: si aparece uno nuevo, el test falla.
 *   2. Toda entrada de tipo `columna` apunta a una columna que EXISTE. Un
 *      rename rompe el test en vez de romper el aviso en la semana 9.
 *   3. Los huecos conocidos están contados. Cerrar uno obliga a bajar el
 *      número; abrir uno nuevo sin querer pone el test en rojo.
 *
 * El primer intento de escribir esto tenía un bug instructivo: el regex de
 * tipos era `[a-z_]+` y se saltaba en silencio 31 de los 108 elementos, porque
 * tipos como `direccion_1-100_type` llevan dígitos y guiones. Un cruce que
 * ignora un tercio del esquema y reporta "todo bien" es peor que no tenerlo.
 * Por eso el test también exige que CERO elementos queden sin tipo resuelto.
 */

type Origen =
  | { tabla: string; columna: string }
  /** Se deriva al generar el XML; no hay dato que guardar. */
  | { calculado: string }
  /** Fuera del alcance de Fracción V Bis. */
  | { noAplica: string }
  /** Hueco real y reconocido. Bloquea la semana 9, no hoy. */
  | { pendiente: string }

const cf = (columna: string) => ({ tabla: 'clientes_finales', columna })
const op = (columna: string) => ({ tabla: 'operaciones', columna })
const des = (columna: string) => ({ tabla: 'desarrollos_inmobiliarios', columna })

/**
 * El domicilio vive en una columna `jsonb` y no en columnas sueltas: el XSD
 * define estructuras DISTINTAS para nacional y extranjero (CP de 5 dígitos vs
 * alfanumérico, estado/provincia que solo existe en el extranjero). Aplanarlas
 * en columnas obligaría a dejar la mitad en NULL según el caso.
 */
const domicilio = (parte: string) => ({
  tabla: 'clientes_finales',
  columna: 'domicilio',
  nota: parte,
})

const ORIGEN: Record<string, Origen> = {
  // ── Identidad del aportante ─────────────────────────────────────────────
  nombre: cf('nombre_pila'),
  apellido_paterno: cf('apellido_paterno'),
  apellido_materno: cf('apellido_materno'),
  denominacion_razon: cf('nombre_o_razon_social'),
  rfc: cf('rfc'),
  rfc_socio: cf('rfc'),
  curp: cf('curp'),
  fecha_nacimiento: cf('fecha_nacimiento_o_constitucion'),
  fecha_constitucion: cf('fecha_nacimiento_o_constitucion'),
  pais_nacionalidad: cf('nacionalidad'),
  actividad_economica: cf('actividad_economica'),
  giro_mercantil: cf('giro_mercantil'),
  identificador_fideicomiso: cf('identificador_fideicomiso'),
  correo_electronico: cf('correo_electronico'),
  numero_telefono: cf('telefono_numero'),

  // ── Domicilio (CHOICE nacional / extranjero) ────────────────────────────
  calle: domicilio('calle'),
  numero_exterior: domicilio('numero exterior'),
  numero_interior: domicilio('numero interior'),
  colonia: domicilio('colonia'),
  codigo_postal: domicilio('CP nacional de 5 dígitos o alfanumérico extranjero'),
  ciudad_poblacion: domicilio('solo en domicilio extranjero'),
  estado_provincia: domicilio('solo en domicilio extranjero'),
  pais: domicilio('solo en domicilio extranjero'),
  clave_pais: domicilio('clave de país del domicilio extranjero'),

  // ── El desarrollo inmobiliario ──────────────────────────────────────────
  registro_licencia: des('registro_licencia'),
  entidad_federativa: des('entidad_federativa'),
  tipo_desarrollo: des('tipo_desarrollo'),
  descripcion_desarrollo: des('descripcion_desarrollo'),
  monto_desarrollo: des('monto_desarrollo'),
  unidades_comercializadas: des('unidades_comercializadas'),
  costo_unidad: des('costo_unidad'),
  otras_empresas: des('otras_empresas'),
  objeto_aviso_anterior: des('objeto_aviso_anterior'),

  // ── La aportación ───────────────────────────────────────────────────────
  fecha_aportacion: op('fecha_operacion'),
  monto_aportacion: op('monto_base'),
  monto_estimado: op('monto_estimado_especie'),
  descripcion_bien: op('descripcion_bien'),
  moneda: op('moneda_codigo'),
  instrumento_monetario: op('instrumento_monetario'),
  valor_inmueble_preventa: op('valor_inmueble_preventa'),
  aportacion_fideicomiso: op('aportacion_fideicomiso'),
  nombre_institucion: op('nombre_institucion'),
  tipo_tercero: op('tipo_tercero'),

  // ── Cabecera del archivo y del aviso ────────────────────────────────────
  clave_sujeto_obligado: { tabla: 'tenants', columna: 'rfc' },
  mes_reportado: { tabla: 'avisos', columna: 'periodo' },
  modificacion: { tabla: 'avisos', columna: 'tipo' },
  clave_actividad: { calculado: 'constante "DIN" del XSD para Fracción V Bis' },
  fecha_emision: { calculado: 'momento de generación del XML, no se guarda como dato de negocio' },
  exento: { calculado: 'se deriva del resultado del motor: informe en cero' },
  numero_socios: { calculado: 'cuenta de socios del aviso' },
  numero_terceros: { calculado: 'cuenta de terceros del aviso' },
  // En Fracción V Bis el catálogo del SAT trae UN SOLO valor válido: 1601,
  // "Aportación a Desarrollo(s) Inmobiliario(s)". No es una elección por
  // operación, es una consecuencia de la fracción — como clave_actividad.
  // Sale de `catalogos_sat`, así que sigue siendo dato y no constante en código.
  tipo_operacion: { calculado: 'catalogos_sat.tipo_operacion de la actividad (V Bis: único valor 1601)' },

  clave_entidad_colegiada: {
    noAplica: 'solo para avisos presentados por entidad colegiada; V Bis los presenta el propio obligado',
  },

  // ── Huecos reconocidos ──────────────────────────────────────────────────
  // Rama `datos_prestamo`. `operaciones.modalidad` YA admite
  // prestamo_financiero y prestamo_no_financiero, así que la modalidad se
  // puede capturar pero su detalle no tiene dónde vivir.
  monto_prestamo: { pendiente: 'rama datos_prestamo: falta columna' },
  monto_recibido: { pendiente: 'rama datos_prestamo: falta columna' },
  monto_solicitado: { pendiente: 'rama datos_prestamo: falta columna' },
  plazo_meses: { pendiente: 'rama datos_prestamo: falta columna' },
  tipo_credito: { pendiente: 'rama datos_prestamo: falta columna' },
  tipo_institucion: { pendiente: 'rama datos_prestamo: falta columna' },
  institucion: { pendiente: 'rama datos_prestamo: falta columna' },

  // Nivel aviso: folio propio del obligado y datos del modificatorio.
  referencia_aviso: { pendiente: 'folio propio del obligado; falta definir cómo se genera (POR CONFIRMAR-7.4)' },
  folio_modificacion: { pendiente: 'solo en avisos modificatorios' },
  descripcion_modificacion: { pendiente: 'solo en avisos modificatorios' },
  prioridad: { pendiente: 'catálogo catalogos_sat.prioridad YA existe (1 normal, 2 = 24 h); falta la columna en avisos (issue #4)' },

  // Alertas del SAT: son códigos del catálogo del SAT por aviso, distintos de
  // la tabla `alertas`, que es el panel interno de VIZO.
  tipo_alerta: { pendiente: 'catálogo catalogos_sat.tipo_alerta YA existe (15 valores); falta la columna en avisos' },
  descripcion_alerta: { pendiente: 'acompaña a tipo_alerta' },

  aportacion_anterior_socio: { pendiente: 'SI/NO: si el socio ya había aportado antes' },
  descripcion_tercero: { pendiente: 'descripción libre del tercero' },
}

/** Sube cuando se cierra un hueco; nunca debe subir sin querer. */
const HUECOS_ESPERADOS = 15

describe('Cruce del XSD contra el modelo de datos', () => {
  let db: Client
  const xsd = readFileSync('regulatorio/xsd/din.xsd', 'utf8')

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  const simples = new Set(
    [...xsd.matchAll(/<xsd:simpleType name="([^"]+)"/g)].map((m) => m[1]),
  )
  const complejos = new Set(
    [...xsd.matchAll(/<xsd:complexType name="([^"]+)"/g)].map((m) => m[1]),
  )

  const elementos = [
    ...xsd.matchAll(/<xsd:element name="([a-z_]+)"(?:(?!\/>|>)[\s\S])*?type="din:([A-Za-z0-9_-]+)"/g),
  ].map((m) => ({ nombre: m[1] as string, tipo: m[2] as string }))

  const hojas = [
    ...new Set(elementos.filter((e) => simples.has(e.tipo)).map((e) => e.nombre)),
  ].sort()

  it('todo elemento del XSD resuelve a un tipo declarado', () => {
    // El regex de tipos falló una vez por no contemplar dígitos y guiones, y
    // se saltó 31 elementos sin decir nada. Esto lo vuelve imposible.
    const sinResolver = elementos.filter(
      (e) => !simples.has(e.tipo) && !complejos.has(e.tipo),
    )
    expect(sinResolver).toEqual([])
    expect(elementos.length).toBeGreaterThan(100)
  })

  it('todo elemento hoja tiene un origen declarado', () => {
    const sinOrigen = hojas.filter((h) => ORIGEN[h] === undefined)
    expect(sinOrigen).toEqual([])
  })

  it('no sobran entradas: el mapa no describe campos que el XSD no pide', () => {
    const enHojas = new Set(hojas)
    expect(Object.keys(ORIGEN).filter((k) => !enHojas.has(k))).toEqual([])
  })

  it('toda columna declarada EXISTE en el esquema', async () => {
    const { rows } = await db.query(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'`,
    )
    const reales = new Set(
      (rows as Array<{ table_name: string; column_name: string }>).map(
        (r) => `${r.table_name}.${r.column_name}`,
      ),
    )

    const rotas = Object.entries(ORIGEN)
      .filter(([, o]) => 'tabla' in o)
      .map(([campo, o]) => {
        const c = o as { tabla: string; columna: string }
        return { campo, ref: `${c.tabla}.${c.columna}` }
      })
      .filter((x) => !reales.has(x.ref))

    expect(rotas).toEqual([])
  })

  it('los huecos conocidos son exactamente los contados', () => {
    const huecos = Object.entries(ORIGEN)
      .filter(([, o]) => 'pendiente' in o)
      .map(([campo]) => campo)
      .sort()

    // Si esto falla hacia arriba, se abrió un hueco nuevo sin querer.
    // Si falla hacia abajo, se cerró uno: baja el número y celebra.
    expect(huecos).toHaveLength(HUECOS_ESPERADOS)
  })

  it('ningún hueco pendiente está en la ruta crítica del aviso de V Bis', () => {
    // Los campos que SIEMPRE aparecen en un aviso de Fracción V Bis, sea cual
    // sea la modalidad, tienen que tener columna. Si alguno de estos cae en
    // `pendiente`, la semana 9 no puede generar un XML válido.
    const criticos = [
      'clave_sujeto_obligado', 'clave_actividad', 'mes_reportado',
      'rfc', 'denominacion_razon', 'nombre', 'apellido_paterno',
      'fecha_aportacion', 'monto_aportacion',
      'registro_licencia', 'entidad_federativa', 'tipo_desarrollo',
    ]
    const bloqueados = criticos.filter((c) => 'pendiente' in (ORIGEN[c] ?? {}))
    expect(bloqueados).toEqual([])
  })
})
