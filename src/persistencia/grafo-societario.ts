import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  resolverGrafo,
  type ParteDelGrafo,
  type ParticipacionDelGrafo,
  type ResolucionDelGrafo,
  type TipoDeParte,
} from '../dominio/grafo-societario'
import type { TenenciaCapital } from '../dominio/beneficiario-controlador'
import {
  identificarYaEnSesion,
  DatoDeBeneficiarioInvalido,
  type IdentidadDelTitular,
} from './beneficiario-controlador'

/**
 * El grafo societario en la base — y la identificación que se corre desde él.
 *
 * La estructura se captura como partes y participaciones con vigencia; el
 * motor multiplica las cadenas y alimenta la fracción I del Art. 23 Quinquies
 * con los porcentajes que antes tecleaba el capturista. Las identidades no se
 * vuelven a pedir: los nodos ya traen nombre, RFC y CURP.
 */

export class DatoDelGrafoInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDelGrafoInvalido'
  }
}

export class ParametroDelGrafoAusente extends Error {
  constructor(clave: string) {
    super(
      `El catálogo no tiene "${clave}" y sin él no se puede recorrer la estructura societaria. ` +
        'Se detiene en vez de suponer un valor (regla dura 1).',
    )
    this.name = 'ParametroDelGrafoAusente'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

// ─────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────

export interface ParteAsentada extends ParteDelGrafo {
  readonly nombre: string
  readonly rfc: string | null
  readonly curp: string | null
}

export interface ParticipacionAsentada extends ParticipacionDelGrafo {
  readonly vigenteDesde: string
  readonly vigenteHasta: string | null
}

export interface EstructuraDelCliente {
  readonly partes: readonly ParteAsentada[]
  /** TODAS las participaciones, vigentes o no: la pantalla enseña la historia. */
  readonly participaciones: readonly ParticipacionAsentada[]
}

export async function estructuraDelCliente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string },
): Promise<EstructuraDelCliente> {
  await exigirSesionActiva(db, p.sesion)

  const par = await db.query(
    `select id::text, tipo::text, nombre, rfc, curp, es_la_raiz
       from partes_societarias
      where tenant_id = $1 and cliente_id = $2
      order by es_la_raiz desc, created_at`,
    [p.sesion.tenantId, p.clienteId],
  )
  const art = await db.query(
    `select id::text, dueno_id::text, poseida_id::text, porcentaje::text,
            vigente_desde::text, vigente_hasta::text
       from participaciones_societarias
      where tenant_id = $1 and cliente_id = $2
      order by created_at`,
    [p.sesion.tenantId, p.clienteId],
  )

  return {
    partes: (par.rows as Array<{
      id: string; tipo: TipoDeParte; nombre: string; rfc: string | null
      curp: string | null; es_la_raiz: boolean
    }>).map((f) => ({
      id: f.id, tipo: f.tipo, nombre: f.nombre, rfc: f.rfc, curp: f.curp, esLaRaiz: f.es_la_raiz,
    })),
    participaciones: (art.rows as Array<{
      id: string; dueno_id: string; poseida_id: string; porcentaje: string
      vigente_desde: string; vigente_hasta: string | null
    }>).map((f) => ({
      id: f.id,
      duenoId: f.dueno_id,
      poseidaId: f.poseida_id,
      // `numeric` llega como texto; se convierte en el borde, una vez.
      porcentaje: Number(f.porcentaje),
      vigenteDesde: f.vigente_desde,
      vigenteHasta: f.vigente_hasta,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Captura
// ─────────────────────────────────────────────────────────────────────────

export async function agregarParte(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    tipo: TipoDeParte
    nombre: string
    rfc?: string | undefined
    curp?: string | undefined
    esLaRaiz?: boolean | undefined
  },
): Promise<{ parteId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (p.nombre.trim() === '') {
      throw new DatoDelGrafoInvalido(['Falta el nombre de la parte.'])
    }
    try {
      const { rows } = await db.query(
        `insert into partes_societarias (tenant_id, cliente_id, tipo, nombre, rfc, curp, es_la_raiz)
         values ($1,$2,$3::tipo_parte_societaria,$4,$5,$6,$7) returning id::text`,
        [
          p.sesion.tenantId,
          p.clienteId,
          p.tipo,
          p.nombre.trim(),
          (p.rfc ?? '').trim() || null,
          (p.curp ?? '').trim() || null,
          p.esLaRaiz ?? false,
        ],
      )
      return { parteId: (rows[0] as { id: string }).id }
    } catch (e) {
      const bruto = e instanceof Error ? e.message : String(e)
      if (/una_raiz_por_estructura/.test(bruto)) {
        throw new DatoDelGrafoInvalido([
          'Esta estructura ya tiene su raíz — el cliente evaluado es uno solo.',
        ])
      }
      throw e
    }
  })
}

export async function agregarParticipacion(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    duenoId: string
    poseidaId: string
    porcentaje: number
    vigenteDesde: string
    documentoId?: string | undefined
  },
): Promise<{ participacionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const problemas: string[] = []
    if (!(p.porcentaje > 0 && p.porcentaje <= 100)) {
      problemas.push(`El porcentaje ${String(p.porcentaje)} está fuera de (0, 100].`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vigenteDesde)) {
      problemas.push(
        'Falta desde cuándo es cierta esta participación — la fecha de la asamblea o del acto, ' +
          'no la de captura.',
      )
    }
    if (problemas.length > 0) throw new DatoDelGrafoInvalido(problemas)

    try {
      const { rows } = await db.query(
        `insert into participaciones_societarias
           (tenant_id, cliente_id, dueno_id, poseida_id, porcentaje, vigente_desde,
            documento_id, registrado_por)
         values ($1,$2,$3,$4,$5,$6::date,$7,$8) returning id::text`,
        [
          p.sesion.tenantId,
          p.clienteId,
          p.duenoId,
          p.poseidaId,
          p.porcentaje,
          p.vigenteDesde,
          p.documentoId ?? null,
          p.sesion.usuarioId,
        ],
      )
      return { participacionId: (rows[0] as { id: string }).id }
    } catch (e) {
      const bruto = e instanceof Error ? e.message : String(e)
      if (/dueño de una persona física/.test(bruto)) {
        throw new DatoDelGrafoInvalido([
          'Nadie puede ser dueño de una persona física: la cadena termina ahí.',
        ])
      }
      if (/participacion_sin_traslape/.test(bruto)) {
        throw new DatoDelGrafoInvalido([
          'Ese par ya tiene una participación vigente en esas fechas. Ciérrale la vigencia ' +
            'primero: corregir es cerrar e insertar, nunca encimar.',
        ])
      }
      if (/nadie_se_posee_a_si_mismo/.test(bruto)) {
        throw new DatoDelGrafoInvalido(['Una parte no puede ser dueña de sí misma.'])
      }
      if (/de_la_misma_estructura/.test(bruto)) {
        throw new DatoDelGrafoInvalido([
          'Las dos puntas de la participación tienen que ser partes de la estructura de ESTE cliente.',
        ])
      }
      throw e
    }
  })
}

export async function cerrarParticipacion(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; participacionId: string; hasta: string },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, () => cerrarParticipacionYaEnSesion(db, p))
}

/**
 * El cierre, para quien YA está dentro de una transacción de sesión — el
 * evento estructural cierra vigencias en SU transacción, y `enTransaccionDeSesion`
 * no anida (ADR-39: el commit interno cerraría la externa a media faena).
 */
export async function cerrarParticipacionYaEnSesion(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; participacionId: string; hasta: string },
): Promise<void> {
  await exigirSesionActiva(db, p.sesion)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.hasta)) {
    throw new DatoDelGrafoInvalido(['Falta hasta cuándo fue cierta la participación.'])
  }
  const { rows } = await db.query(
    `update participaciones_societarias set vigente_hasta = $3::date
      where tenant_id = $1 and id = $2
    returning id::text`,
    [p.sesion.tenantId, p.participacionId, p.hasta],
  )
  if (rows.length === 0) {
    throw new DatoDelGrafoInvalido(['Esa participación no existe en este obligado.'])
  }
}

// ─────────────────────────────────────────────────────────────────────────
// La resolución y la identificación desde la estructura
// ─────────────────────────────────────────────────────────────────────────

async function parametroDelGrafo(db: EjecutorSql, clave: string): Promise<unknown> {
  const { rows } = await db.query(
    `select valor from parametros_motor
      where clave = $1 and actividad_id is null
      order by vigente_desde desc limit 1`,
    [clave],
  )
  const f = rows[0] as { valor: unknown } | undefined
  if (f === undefined) throw new ParametroDelGrafoAusente(clave)
  return f.valor
}

/**
 * Resuelve la estructura vigente a una fecha: qué persona física tiene qué
 * participación efectiva, con las cadenas completas.
 */
export async function resolverEstructura(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; fecha: string },
): Promise<{
  resolucion: ResolucionDelGrafo
  partes: readonly ParteAsentada[]
  vigentes: readonly ParticipacionAsentada[]
  configuracion: { profundidadMaxima: number; reglaAgregacion: string }
}> {
  const estructura = await estructuraDelCliente(db, p)
  if (estructura.partes.length === 0) {
    throw new DatoDelGrafoInvalido([
      'Este cliente no tiene estructura capturada. Captura las partes y sus participaciones, o ' +
        'usa la identificación manual.',
    ])
  }
  const configuracion = {
    profundidadMaxima: Number(await parametroDelGrafo(db, 'grafo_profundidad_maxima')),
    reglaAgregacion: String(await parametroDelGrafo(db, 'grafo_regla_agregacion')),
  }

  // Vigentes A LA FECHA del acto, no a hoy: la estructura que importa es la
  // que era cierta cuando se identificó.
  const vigentes = estructura.participaciones.filter(
    (a) => a.vigenteDesde <= p.fecha && (a.vigenteHasta === null || a.vigenteHasta >= p.fecha),
  )

  return {
    resolucion: resolverGrafo({ partes: estructura.partes, participaciones: vigentes }, configuracion),
    partes: estructura.partes,
    vigentes,
    configuracion,
  }
}

/**
 * Corre el orden de prelación del Art. 23 Quinquies alimentando la fracción I
 * desde la estructura, y congela el snapshot completo en la identificación.
 *
 * La fracción I deja de depender de porcentajes tecleados: cada cadena del
 * grafo se vuelve una tenencia con su producto exacto. Las fracciones II y
 * III siguen siendo insumos del capturista — el control por otros medios no
 * vive en porcentajes.
 */
export async function identificarDesdeLaEstructura(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    fechaIdentificacion: string
    hoy: string
    /**
     * La fracción III se declara señalando la parte física que corresponde.
     * La fracción II NO se declara aquí: desde la Fase 2 (ADR-40) el control
     * efectivo entra solo por determinaciones CONFIRMADAS, y una propuesta
     * abierta bloquea la corrida — el motor nunca resuelve el nivel 2 solo.
     */
    funcionarios?: readonly FuncionarioDeclarado[] | undefined
  },
): Promise<{ identificacionId: string }> {
  // TODO dentro de UNA transacción de sesión: leer la estructura y escribir la
  // identificación por separado dejaría una ventana en la que alguien cierra
  // una vigencia entre la lectura y el snapshot — y el snapshot ya no sería
  // lo que alimentó la corrida. Por eso adentro se llama `identificarYaEnSesion`
  // y no la función pública: `enTransaccionDeSesion` NO anida, y el commit
  // interno cerraría esta transacción a media faena.
  return enTransaccionDeSesion(db, p.sesion, () => identificarConSesion(db, p))
}

export interface FuncionarioDeclarado {
  readonly parteId: string
  readonly cargo: string
  readonly rango: number
}

async function identificarConSesion(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    fechaIdentificacion: string
    hoy: string
    funcionarios?: readonly FuncionarioDeclarado[] | undefined
  },
): Promise<{ identificacionId: string }> {
  const { resolucion, partes, vigentes, configuracion } = await resolverEstructura(db, {
    sesion: p.sesion,
    clienteId: p.clienteId,
    fecha: p.fechaIdentificacion,
  })

  // Cada cadena es una tenencia: el motor de prelación las suma por titular,
  // igual que sumaba las que antes tecleaba el capturista — solo que ahora el
  // porcentaje es el producto exacto y trae su cadena en el snapshot.
  const tenencias: TenenciaCapital[] = resolucion.titulares.flatMap((t) =>
    t.cadenas.map((c) => ({
      titularId: t.titularId,
      esGrupo: false,
      porcentaje: c.porcentajeEfectivo,
      via: c.tramos.length === 1 ? ('directa' as const) : ('indirecta' as const),
      ...(c.tramos.length > 1 ? { intermediarioId: c.tramos[1]?.duenoId ?? '' } : {}),
    })),
  )

  // Las identidades salen de los nodos: nadie las teclea dos veces.
  const identidades: Record<string, IdentidadDelTitular> = {}
  const fisicas = new Set<string>()
  for (const parte of partes) {
    if (parte.tipo !== 'fisica') continue
    fisicas.add(parte.id)
    identidades[parte.id] = {
      nombre: parte.nombre,
      ...(parte.rfc === null ? {} : { rfc: parte.rfc }),
      ...(parte.curp === null ? {} : { curp: parte.curp }),
    }
  }

  // La fracción II: SOLO determinaciones confirmadas, y las abiertas detienen.
  // Es el caso 3 del plano — el control sin resolver marca el caso y bloquea,
  // en vez de correr un orden de prelación que puede cambiar con la respuesta.
  const dets = await db.query(
    `select d.parte_id::text, ps.nombre, d.medio, d.areas::text[] as areas, d.estado::text as estado
       from determinaciones_control d
       join partes_societarias ps on ps.id = d.parte_id
      where d.tenant_id = $1 and d.cliente_id = $2 and d.estado <> 'rechazada'`,
    [p.sesion.tenantId, p.clienteId],
  )
  const filasDet = dets.rows as Array<{
    parte_id: string; nombre: string; medio: string
    areas: ('estrategia' | 'toma_de_decisiones' | 'politicas_principales')[]; estado: string
  }>
  const abiertas = filasDet.filter((d) => d.estado === 'propuesta')
  if (abiertas.length > 0) {
    throw new DatoDelGrafoInvalido([
      `Hay ${String(abiertas.length)} determinación(es) de control efectivo sin resolver ` +
        `(${abiertas.map((d) => d.nombre).join(', ')}). El motor no corre el orden con una ` +
        'pregunta de control abierta: confírmalas o recházalas —con fundamento— primero.',
    ])
  }
  const confirmadas = filasDet.filter((d) => d.estado === 'confirmada')

  // Quien dirige tiene que SER una persona física de la estructura:
  // señalar a una moral, o a alguien de otra estructura, no identifica a nadie.
  for (const ref of [...(p.funcionarios ?? [])]) {
    if (!fisicas.has(ref.parteId)) {
      throw new DatoDelGrafoInvalido([
        `La parte ${ref.parteId} no es una persona física de esta estructura. Las fracciones II ` +
          'y III del Art. 23 Quinquies identifican personas físicas.',
      ])
    }
  }

  return identificarYaEnSesion(db, {
    sesion: p.sesion,
    hoy: p.hoy,
    datos: {
      clienteId: p.clienteId,
      fechaIdentificacion: p.fechaIdentificacion,
      insumos: {
        sujeto: {
          tipo: 'persona_moral',
          insumos: {
            tenenciasCapital: tenencias,
            controlPorOtrosMedios: confirmadas.map((c) => ({
              titularId: c.parte_id,
              esGrupo: false,
              medio: c.medio,
              areasControladas: c.areas,
            })),
            funcionariosAltaDireccion: (p.funcionarios ?? []).map((f) => ({
              titularId: f.parteId,
              esGrupo: false,
              cargo: f.cargo,
              rango: f.rango,
            })),
          },
        },
      },
      identidades,
      // Punto 9 del plano: la ENTRADA, congelada. Con esto la corrida se
      // repite años después y da idéntico resultado.
      resolucionGrafo: {
        partes,
        participaciones_vigentes: vigentes,
        cadenas: resolucion.titulares,
        advertencias: resolucion.advertencias,
        profundidad_recorrida: resolucion.profundidadRecorrida,
        configuracion,
      },
    },
  })
}

export { DatoDeBeneficiarioInvalido }
