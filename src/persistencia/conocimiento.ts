import type { EjecutorSql } from '../catalogo/cargador'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  estadoDeAprobacionDeClientes,
  situacionPep,
  type EstadoAprobacionResumen,
} from './aprobacion'
import type { SituacionRiesgo } from '../dominio/aprobacion-directivo'
import { estadoPepDeClientes, type EstadoPepResumen } from './pep'
import { exigibilidadDelTransitorioCuarto, plazosDelPerfil, type PlazosVigentes } from './perfil'
import { estadoDelRiesgo, plazoDeReevaluacionVigente } from './riesgo'
import { primerDiaReevaluable, reevaluacionDebida } from '../dominio/perfil-transaccional'

/**
 * El conocimiento del cliente de MUCHOS clientes, para la lista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * La lista de clientes enseña una píldora por cliente que resume las cinco
 * secciones de su expediente. Obtenerla llamando a `estadoDelPerfil`,
 * `riesgoDelCliente`, `estadoPepDelCliente` y `estadoDeAprobacion` cliente por
 * cliente son más de diez consultas por renglón: una lista de doscientos
 * clientes serían dos mil viajes a la base. Aquí son nueve, y no crecen con el
 * número de clientes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES UNA SEGUNDA IMPLEMENTACIÓN
 * ────────────────────────────────────────────────────────────────────────────
 * Este módulo NO vuelve a leer el Acuerdo. Los plazos salen del mismo catálogo,
 * la catalogación PEP la hace el mismo `catalogacionPep` con las mismas fechas
 * de actos, la tabla de tres valores del Art. 23 Ter 5 la resuelve el mismo
 * `exigenciaDeAprobacion`, y las palabras las pone el mismo riel. Lo único
 * distinto es la forma de traer las filas.
 *
 * Aun así, «es el mismo código» es una afirmación que se degrada sola en cuanto
 * alguien toca un lado. Por eso hay una prueba contra la base que compara, para
 * los clientes de la demo, lo que dice esta función contra lo que dicen las
 * cuatro de un solo cliente. Si divergen, revienta.
 *
 * La lista y el expediente diciendo cosas distintas del mismo cliente no sería
 * un defecto cosmético: es la regla dura 6 —un resumen plausible y equivocado—
 * en la pantalla que alguien usa para decidir a quién atender primero.
 */

/** Lo que la lista necesita por cliente. Encaja con los tipos del riel. */
export interface ConocimientoDeCliente {
  readonly revision: { readonly relacionNegocios: boolean | null; readonly vence: string | null }
  readonly riesgo: {
    readonly puedeClasificar: boolean
    readonly vigente: {
      readonly gradoNombre: string
      readonly esAlto: boolean
      readonly vencida: boolean
      readonly vence: string
      readonly evaluadoEn: string
    } | null
    readonly reevaluacionMeses: number
  }
  readonly perfil: {
    readonly vigente: { readonly fechaAncla: string } | null
    readonly plazos: PlazosVigentes
    readonly reevaluacionDebida: boolean
    readonly reevaluableDesde: string | null
    readonly anticipado: boolean
  }
  readonly aprobacion: EstadoAprobacionResumen
  /** `null` para quien no es persona física: el Art. 23 Quáter no le aplica. */
  readonly pep: EstadoPepResumen | null
}

interface ClienteAConsultar {
  readonly id: string
  readonly tipoPersona: string
  readonly relacionNegocios: boolean | null
}

export async function conocimientoDeClientes(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clientes: readonly ClienteAConsultar[]; hoy: string },
): Promise<Map<string, ConocimientoDeCliente>> {
  await exigirSesionActiva(db, p.sesion)
  const resultado = new Map<string, ConocimientoDeCliente>()
  if (p.clientes.length === 0) return resultado

  const ids = p.clientes.map((c) => c.id)

  // ── Lo que es igual para todos: catálogo y metodología del obligado ──
  const plazos = await plazosDelPerfil(db)
  const exigibleDesde = await exigibilidadDelTransitorioCuarto(db)
  const reevaluacionMeses = await plazoDeReevaluacionVigente(db)
  const modelo = await estadoDelRiesgo(db, { sesion: p.sesion, hoy: p.hoy })
  const puedeClasificar = modelo.vigente !== null

  // ── Lo que varía por cliente ────────────────────────────────────────
  const rev = await db.query(
    `select cliente_id::text as cliente_id, vence::text as vence
       from expedientes_por_reverificar
      where tenant_id = $1 and cliente_id = any($2::uuid[])`,
    [p.sesion.tenantId, ids],
  )
  const vencePorCliente = new Map(
    (rev.rows as { cliente_id: string; vence: string }[]).map((f) => [f.cliente_id, f.vence]),
  )

  // Las dos vistas ya traen la fila vigente de cada cliente: es el mismo
  // `distinct on … order by secuencia desc` que usa la pantalla del expediente.
  const rie = await db.query(
    `select cliente_id::text as cliente_id, grado_nombre, es_alto, vencida,
            vence::text as vence, evaluado_en::text as evaluado_en
       from clientes_riesgo_vigente
      where tenant_id = $1 and cliente_id = any($2::uuid[])`,
    [p.sesion.tenantId, ids],
  )
  const riesgoPorCliente = new Map(
    (
      rie.rows as {
        cliente_id: string
        grado_nombre: string
        es_alto: boolean
        vencida: boolean
        vence: string
        evaluado_en: string
      }[]
    ).map((f) => [
      f.cliente_id,
      {
        gradoNombre: f.grado_nombre,
        esAlto: f.es_alto,
        vencida: f.vencida,
        vence: f.vence,
        evaluadoEn: f.evaluado_en,
      },
    ]),
  )

  const per = await db.query(
    `select cliente_id::text as cliente_id, fecha_ancla::text as fecha_ancla,
            vence::text as vence
       from clientes_perfil_vigente
      where tenant_id = $1 and cliente_id = any($2::uuid[])`,
    [p.sesion.tenantId, ids],
  )
  const perfilPorCliente = new Map(
    (per.rows as { cliente_id: string; fecha_ancla: string; vence: string }[]).map((f) => [
      f.cliente_id,
      { fechaAncla: f.fecha_ancla, vence: f.vence },
    ]),
  )

  // La declaración PEP solo se consulta para personas físicas: a una moral la
  // base se la niega, así que preguntarlo sería pedirle a Postgres algo que no
  // puede existir.
  const fisicas = p.clientes.filter((c) => c.tipoPersona === 'fisica').map((c) => c.id)
  const pepPorCliente = await estadoPepDeClientes(db, {
    sesion: p.sesion,
    clienteIds: fisicas,
    hoy: p.hoy,
  })

  const aprobacionPorCliente = await estadoDeAprobacionDeClientes(db, {
    sesion: p.sesion,
    hoy: p.hoy,
    clientes: p.clientes.map((c) => {
      const r = riesgoPorCliente.get(c.id)
      const situacionRiesgo: SituacionRiesgo =
        r === undefined
          ? { conocida: false }
          : { conocida: true, esAlto: r.esAlto, vencida: r.vencida }
      const pep = pepPorCliente.get(c.id)
      return {
        clienteId: c.id,
        // Sin declaración —y una persona moral nunca la tiene— la situación es
        // «no se sabe», que es justo lo que hace indeterminable la exigencia.
        pep: situacionPep(pep?.motivo ?? 'sin_declaracion'),
        riesgo: situacionRiesgo,
      }
    }),
  })

  for (const c of p.clientes) {
    const perfilVigente = perfilPorCliente.get(c.id)
    const aprobacion = aprobacionPorCliente.get(c.id)
    // No puede faltar: se sembró para todos los clientes de la entrada. Si
    // faltara, la lista pintaría un hueco silencioso en vez de reventar.
    if (aprobacion === undefined) {
      throw new Error(
        `No se obtuvo el estado de aprobación del cliente ${c.id}. La lista no puede ` +
          'pintar un resumen incompleto: diría que no hay nada pendiente sin haberlo mirado.',
      )
    }

    resultado.set(c.id, {
      revision: { relacionNegocios: c.relacionNegocios, vence: vencePorCliente.get(c.id) ?? null },
      riesgo: {
        puedeClasificar,
        vigente: riesgoPorCliente.get(c.id) ?? null,
        reevaluacionMeses,
      },
      perfil: {
        vigente: perfilVigente === undefined ? null : { fechaAncla: perfilVigente.fechaAncla },
        plazos,
        reevaluacionDebida:
          perfilVigente !== undefined &&
          reevaluacionDebida({ vence: perfilVigente.vence }, p.hoy),
        reevaluableDesde:
          perfilVigente === undefined
            ? null
            : primerDiaReevaluable(perfilVigente.fechaAncla, plazos),
        anticipado: p.hoy < exigibleDesde,
      },
      aprobacion,
      pep: c.tipoPersona === 'fisica' ? (pepPorCliente.get(c.id) ?? null) : null,
    })
  }
  return resultado
}
