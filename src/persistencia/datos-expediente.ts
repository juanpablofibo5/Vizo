import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, type ContextoSesion } from './transaccion'

/**
 * Los datos de captura del expediente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE ESTO
 * ────────────────────────────────────────────────────────────────────────────
 * El expediente exige campos que NO son documentos —domicilio, giro mercantil,
 * actividad económica— y el portal no tenía dónde capturarlos: el alta de
 * cliente no los pide y no existe pantalla de edición. La consecuencia es que
 * ningún expediente podía llegar nunca a «completo», y por lo tanto el botón
 * «Aprobar expediente» —construido, probado y funcional— era inalcanzable.
 *
 * Es el mismo patrón que el desarrollo faltante en el aviso: el producto
 * ofrecía un flujo que su propia interfaz no podía terminar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA LISTA DE CAMPOS SALE DE LA BASE Y NO DE AQUÍ
 * ────────────────────────────────────────────────────────────────────────────
 * Los nombres de los campos llegan de un formulario, o sea que son entrada del
 * atacante. Si esta función aceptara cualquier nombre y lo pusiera en un
 * `update`, sería una puerta para escribir CUALQUIER columna de
 * `clientes_finales` — `nivel_riesgo`, `requiere_revision_identidad`, lo que
 * fuera.
 *
 * La lista blanca es `campos_expediente.validacion->>'columna'`, filtrada por
 * la actividad y el tipo de persona de ESE expediente. Un campo que el catálogo
 * no declara no se puede escribir, y ni siquiera hay que acordarse de
 * validarlo: no está en el mapa que construye el UPDATE.
 *
 * Efecto secundario que es la mitad del valor: cuando el catálogo pida un campo
 * nuevo, la pantalla y esta función lo aceptan sin tocar código.
 */

export class CampoNoDeclarado extends Error {
  constructor(readonly campos: string[]) {
    super(
      `Estos campos no los declara el catálogo del expediente y no se pueden guardar: ${campos.join(', ')}.`,
    )
    this.name = 'CampoNoDeclarado'
  }
}

/**
 * Las partes de un domicilio nacional.
 *
 * `clientes_finales.domicilio` es `jsonb` a propósito —«el XSD tiene
 * estructuras distintas para nacional y extranjero», dice la migración que lo
 * creó—, así que capturarlo como una sola línea de texto sería tirar la
 * estructura que el aviso va a necesitar. Es la misma forma que documenta el
 * runbook de alta de obligado para `tenants.domicilio`.
 */
export const PARTES_DEL_DOMICILIO = [
  { clave: 'calle', etiqueta: 'Calle', obligatoria: true, pista: '' },
  // Un predio sin número existe —«S/N» es la convención—, así que exigirlo
  // dejaría expedientes legítimos incompletos para siempre. La pista va de
  // marcador de posición y no en el rótulo: «Número (opcional)» no cabe en una
  // columna de esa rejilla, se parte en dos renglones y deja su campo más abajo
  // que los otros cinco.
  { clave: 'numero', etiqueta: 'Número', obligatoria: false, pista: 'S/N si no tiene' },
  { clave: 'colonia', etiqueta: 'Colonia', obligatoria: true, pista: '' },
  { clave: 'cp', etiqueta: 'Código postal', obligatoria: true, pista: '' },
  { clave: 'municipio', etiqueta: 'Municipio', obligatoria: true, pista: '' },
  { clave: 'estado', etiqueta: 'Estado', obligatoria: true, pista: '' },
] as const

export class DomicilioIncompleto extends Error {
  constructor(readonly faltantes: string[]) {
    super(
      `El domicilio quedaría a medias: falta ${faltantes.join(', ')}. Un domicilio parcial cuenta como capturado y deja el expediente «completo» con una dirección que no sirve para el aviso.`,
    )
    this.name = 'DomicilioIncompleto'
  }
}

export interface CampoCapturable {
  campo: string
  etiqueta: string
  tipoDato: 'texto' | 'fecha' | 'catalogo' | 'numero'
  columna: string
  /** Nombre del catálogo del SAT, cuando `tipoDato` es 'catalogo'. */
  catalogo?: string | undefined
  /**
   * La columna destino es `jsonb`, así que el dato tiene partes.
   *
   * Sale del tipo REAL de la columna y no de `tipo_dato`, porque ahí está la
   * verdad: el catálogo declara `domicilio` como 'texto' y la columna es
   * jsonb. Escribir texto plano en ella revienta con «Token CALLE is invalid»,
   * que fue exactamente cómo se descubrió.
   */
  compuesto: boolean
}

/**
 * Qué campos de captura admite este expediente, según el catálogo vigente.
 *
 * Devuelve TODOS los capturables, no solo los faltantes: la pantalla decide
 * cuáles pinta, y esta función es también la lista blanca del guardado.
 */
export async function camposCapturables(
  db: EjecutorSql,
  p: { actividadId: string; tipoPersona: string; fecha: string },
): Promise<CampoCapturable[]> {
  const { rows } = await db.query(
    `select ce.campo, ce.etiqueta, ce.tipo_dato::text as tipo_dato,
            ce.validacion->>'columna'  as columna,
            ce.validacion->>'catalogo' as catalogo,
            col.data_type
       from campos_expediente ce
       left join information_schema.columns col
         on col.table_schema = 'public' and col.table_name = 'clientes_finales'
        and col.column_name = ce.validacion->>'columna'
      where ce.actividad_id = $1
        and ce.tipo_dato <> 'documento'
        and ce.aplica_a in ('ambas', $2::aplica_persona)
        and daterange(ce.vigente_desde, ce.vigente_hasta, '[]') @> $3::date
        and ce.validacion ? 'columna'
      order by ce.orden, ce.campo`,
    [p.actividadId, p.tipoPersona === 'fisica' ? 'persona_fisica' : 'persona_moral', p.fecha],
  )

  return (
    rows as Array<{
      campo: string
      etiqueta: string
      tipo_dato: string
      columna: string
      catalogo: string | null
      data_type: string | null
    }>
  ).map((r) => ({
    campo: r.campo,
    etiqueta: r.etiqueta,
    tipoDato: r.tipo_dato as CampoCapturable['tipoDato'],
    columna: r.columna,
    compuesto: r.data_type === 'jsonb',
    ...(r.catalogo === null ? {} : { catalogo: r.catalogo }),
  }))
}

/**
 * Guarda los datos de captura y devuelve qué campos se escribieron.
 *
 * No recalcula la completitud: eso lo hace quien llama, para que el recálculo
 * y su registro en bitácora queden donde ya viven.
 */
export async function guardarDatosDeCaptura(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    expedienteId: string
    /** `campo` del catálogo → valor capturado. Los vacíos se ignoran. */
    valores: Record<string, string>
    fecha: string
  },
): Promise<string[]> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { rows } = await db.query(
      `select e.actividad_id, e.cliente_id, c.tipo_persona::text as tipo_persona
         from expedientes e
         join clientes_finales c on c.tenant_id = e.tenant_id and c.id = e.cliente_id
        where e.id = $1`,
      [p.expedienteId],
    )
    if (rows.length === 0) {
      throw new Error(`El expediente ${p.expedienteId} no existe en este obligado.`)
    }
    const e = rows[0] as { actividad_id: string; cliente_id: string; tipo_persona: string }

    const capturables = await camposCapturables(db, {
      actividadId: e.actividad_id,
      tipoPersona: e.tipo_persona,
      fecha: p.fecha,
    })
    const porCampo = new Map(capturables.map((c) => [c.campo, c]))

    // Un campo compuesto llega repartido: `domicilio.calle`, `domicilio.cp`…
    // Se agrupan por el nombre antes del punto, que es el campo del catálogo.
    const partesPorCampo = new Map<string, Record<string, string>>()
    const simples: Array<[string, string]> = []
    for (const [clave, valor] of Object.entries(p.valores)) {
      if (valor.trim() === '') continue // vacío no borra lo que ya había
      const punto = clave.indexOf('.')
      if (punto === -1) {
        simples.push([clave, valor.trim()])
        continue
      }
      const campo = clave.slice(0, punto)
      const parte = clave.slice(punto + 1)
      const acumulado = partesPorCampo.get(campo) ?? {}
      acumulado[parte] = valor.trim()
      partesPorCampo.set(campo, acumulado)
    }

    // Un compuesto se guarda entero o no se guarda. Con solo la calle,
    // `tieneValor` lo da por cubierto —es un objeto no vacío—, el expediente
    // pasa a «completo» y nadie vuelve a mirarlo: media dirección archivada
    // como si estuviera integrada.
    for (const partes of partesPorCampo.values()) {
      const faltan = PARTES_DEL_DOMICILIO.filter(
        (p) => p.obligatoria && (partes[p.clave] ?? '') === '',
      ).map((p) => p.etiqueta.toLowerCase())
      if (faltan.length > 0) throw new DomicilioIncompleto(faltan)
    }

    const conValor: Array<[string, string]> = [
      ...simples,
      // El objeto se serializa aquí y entra a la consulta como UN parámetro
      // con `::jsonb`: las claves vienen del formulario pero nunca tocan el
      // texto del SQL.
      ...[...partesPorCampo].map(([campo, partes]): [string, string] => [
        campo,
        JSON.stringify(partes),
      ]),
    ]

    const intrusos = conValor.filter(([campo]) => !porCampo.has(campo)).map(([campo]) => campo)
    if (intrusos.length > 0) throw new CampoNoDeclarado(intrusos)
    if (conValor.length === 0) return []

    // El SET se arma con las COLUMNAS del catálogo, nunca con texto del
    // formulario. `pg` parametriza los valores; los nombres de columna no se
    // pueden parametrizar, y por eso vienen de la base y no de la petición.
    const asignaciones = conValor
      .map(([campo], i) => {
        const c = porCampo.get(campo) as CampoCapturable
        // El `::jsonb` sale del tipo real de la columna. Sin él, Postgres
        // intenta leer el texto como JSON y muere con «Token X is invalid».
        return `"${c.columna}" = $${String(i + 2)}${c.compuesto ? '::jsonb' : ''}`
      })
      .join(', ')
    const parametros = conValor.map(([, valor]) => valor)

    // `returning` y no `rowCount`: el ejecutor que reciben estas funciones
    // expone solo `rows`, y contar las filas devueltas dice lo mismo sin
    // depender de la forma del cliente de base de datos.
    const r = await db.query(
      `update clientes_finales set ${asignaciones} where id = $1 returning id`,
      [e.cliente_id, ...parametros],
    )
    if (r.rows.length !== 1) {
      throw new Error(
        'No se pudo actualizar al cliente. Un capturista sí puede corregir datos del expediente; si esto falla, la sesión no corresponde a este obligado.',
      )
    }

    // REGLA DURA 3: las CLAVES de los campos, nunca sus valores. El domicilio
    // de una persona es dato personal; que se haya capturado el domicilio es
    // metadato.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'expediente.datos_capturados',
      'expediente',
      p.expedienteId,
      JSON.stringify({ campos: conValor.map(([campo]) => campo) }),
      p.sesion.usuarioId,
    ])

    return conValor.map(([campo]) => campo)
  })
}
