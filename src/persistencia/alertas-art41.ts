import type { EjecutorSql } from '../catalogo/cargador'
import type { ContextoSesion } from './transaccion'

/**
 * El sistema de alertas del Art. 41 fr. V.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA ALERTA CUELGA DEL ACTO, NO DEL CLIENTE
 * ────────────────────────────────────────────────────────────────────────────
 * El texto es explícito y decide el diseño entero:
 *
 *   «Ejecutar un sistema de alertas respecto de aquellos ACTOS U OPERACIONES
 *    QUE SE PRETENDAN LLEVAR A CABO CON Clientes o Usuarias de Grado de Riesgo
 *    alto, Personas Políticamente Expuestas o que se encuentren incluidas en el
 *    listado a que hace referencia el primer párrafo del artículo 38 […]»
 *
 * No pide una alerta cuando se clasifica a alguien como de riesgo alto: pide
 * una por cada acto que se pretenda realizar con esa clase de cliente. Por eso
 * esto se llama desde `registrarOperacion`, en la misma transacción, y no
 * desde la pantalla de clasificación. Una operación guardada cuya alerta se
 * levanta después es una alerta que puede no levantarse nunca.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS CUATRO SUPUESTOS, Y CUÁLES CUBRE ESTE MÓDULO
 * ────────────────────────────────────────────────────────────────────────────
 * 1. Grado de Riesgo alto ......................... aquí
 * 2. Persona Políticamente Expuesta ............... aquí
 * 3. Listado del Art. 38 ¶1 ....................... ya existe: `screening` (ADR-30)
 * 4. Países o jurisdicciones (regímenes fiscales preferentes, o determinados
 *    sin medidas suficientes) ..................... NO se construye
 *
 * El cuarto NO se construye y no es olvido. La regla es citable, pero la LISTA
 * no está en el Acuerdo: remite a «la legislación mexicana» y a lo que
 * «autoridades mexicanas, organismos internacionales o agrupaciones
 * intergubernamentales […] determinen». Sembrar un catálogo de jurisdicciones
 * sin contrastar su fuente sería exactamente lo que la regla dura 1 prohíbe —
 * y una alerta que no dispara sobre la lista correcta es peor que ninguna,
 * porque tranquiliza. Queda anotado en el ROADMAP con lo que necesitaría.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL «NO SE SABE» NO LEVANTA ALERTA, Y ESO ES UN HUECO CONOCIDO
 * ────────────────────────────────────────────────────────────────────────────
 * Un cliente sin clasificar y sin declaración PEP no dispara nada aquí.
 *
 * La primera versión de este comentario decía que ese caso ya lo cubría
 * `aprobacion_directivo_pendiente` (ADR-23). **Es falso**, y lo encontró una
 * prueba: `contrastarAprobacionAlOperar` solo levanta su alerta cuando la
 * exigencia es `exigible`; cuando es `indeterminable` devuelve `alertaId:
 * null`. Se deja escrito porque el error era plausible y la suposición
 * cómoda: dar por cubierto un caso mirando el nombre de otra alerta.
 *
 * Hoy ese hueco se ve en el riel del cliente —secciones 02 y 04 dicen «sin
 * clasificar» y «no se sabe»— pero NO llega a la bandeja de alertas, que es
 * donde un admin mira. Cerrarlo es una decisión de producto pendiente: el
 * Art. 41 fr. V no pide alertar sobre lo que no se sabe, así que no es
 * incumplimiento, pero el precedente de `perfil_ausente` dice que operar con
 * un hueco es en sí un hallazgo.
 */

export interface AlertasDelArticulo41 {
  readonly riesgoAltoId: string | null
  readonly pepId: string | null
}

interface FilaRiesgo {
  evaluacion_id: string
  grado_nombre: string
  puntaje: string | null
  vence: string
}

interface FilaPep {
  id: string
  resultado: string
  fecha_declaracion: string
  revisada_en: string | null
}

/**
 * Levanta las alertas que correspondan a esta operación.
 *
 * Devuelve los ids en vez de escribirlos en algún lado: quien registra la
 * operación ya junta los suyos, y así esta función no decide nada sobre el
 * flujo de la operación — solo sobre qué hechos merecen alerta.
 */
export async function alertarPorRiesgoYPep(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    clienteId: string
    operacion: { readonly id: string; readonly fecha: string }
  },
): Promise<AlertasDelArticulo41> {
  return {
    riesgoAltoId: await alertaDeRiesgoAlto(db, p),
    pepId: await alertaDePep(db, p),
  }
}

async function alertaDeRiesgoAlto(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    clienteId: string
    operacion: { readonly id: string; readonly fecha: string }
  },
): Promise<string | null> {
  // Se pide `vence` y no la columna `vencida` de la vista A PROPÓSITO: esa la
  // calcula la vista contra el reloj de la base —«¿está vencida hoy?»— y esta
  // alerta habla de UN ACTO. Lo que importa para el acto es si la
  // clasificación seguía viva el día en que ocurrió, no el día en que alguien
  // lo capturó. Registrar hoy una operación de hace tres meses no debe teñir
  // el hallazgo con el calendario de hoy.
  const { rows } = await db.query(
    `select evaluacion_id::text, grado_nombre, puntaje::text, vence::text
       from clientes_riesgo_vigente
      where tenant_id = $1 and cliente_id = $2 and es_alto`,
    [p.sesion.tenantId, p.clienteId],
  )
  const r = rows[0] as FilaRiesgo | undefined
  if (r === undefined) return null

  const ins = await db.query(
    `insert into alertas (tenant_id, tipo, evaluacion_riesgo_id, operacion_id, titulo, detalle)
     values ($1,'cliente_riesgo_alto',$2,$3,$4,$5::jsonb) returning id::text`,
    [
      p.sesion.tenantId,
      r.evaluacion_id,
      p.operacion.id,
      'Operación con Cliente de Grado de Riesgo alto',
      // Sin nombre ni RFC: se llega al cliente por la operación, bajo RLS
      // (regla dura 3). Y si la clasificación ya había vencido al momento del
      // acto va escrito, porque cambia qué hacer: el grado que disparó la
      // alerta describía un riesgo de hace más de un ciclo.
      JSON.stringify({
        // El `por` distingue los dos casos porque la pantalla elige el tono
        // con él —el mismo canal que usa `efectivo_restringido`—: operar
        // sobre una clasificación ya vencida no es «hay que revisar algo»,
        // es una reevaluación que ya se debía cuando ocurrió el acto.
        por: r.vence < p.operacion.fecha
          ? 'grado_de_riesgo_alto_vencido'
          : 'grado_de_riesgo_alto',
        fundamento: 'Art. 41 fr. V del Acuerdo 115/2026',
        grado: r.grado_nombre,
        puntaje: r.puntaje,
        vence: r.vence,
        clasificacion_vencida_al_acto: r.vence < p.operacion.fecha,
        fecha_operacion: p.operacion.fecha,
      }),
    ],
  )
  return (ins.rows[0] as { id: string }).id
}

async function alertaDePep(
  db: EjecutorSql,
  p: {
    sesion: ContextoSesion
    clienteId: string
    operacion: { readonly id: string; readonly fecha: string }
  },
): Promise<string | null> {
  // La declaración del Cap. III Quáter es de personas FÍSICAS —la base lo
  // impide para una moral— así que este supuesto solo alcanza a esos clientes.
  // Si el Beneficiario Controlador de una moral es PEP, el artículo no lo dice
  // con todas sus letras: es la pregunta que le toca al especialista, y hasta
  // que se conteste no se inventa aquí una alerta que el texto no pide.
  const { rows } = await db.query(
    `select d.id::text, d.resultado::text as resultado,
            d.fecha_declaracion::text as fecha_declaracion, d.revisada_en::text as revisada_en
       from declaraciones_pep d
      where d.tenant_id = $1 and d.cliente_id = $2
      order by d.fecha_declaracion desc, d.created_at desc
      limit 1`,
    [p.sesion.tenantId, p.clienteId],
  )
  const d = rows[0] as FilaPep | undefined
  if (d === undefined || d.resultado === 'niega') return null

  const ins = await db.query(
    `insert into alertas (tenant_id, tipo, declaracion_pep_id, operacion_id, titulo, detalle)
     values ($1,'cliente_pep',$2,$3,$4,$5::jsonb) returning id::text`,
    [
      p.sesion.tenantId,
      d.id,
      p.operacion.id,
      'Operación con Persona Políticamente Expuesta',
      JSON.stringify({
        por: d.resultado,
        fundamento: 'Art. 41 fr. V del Acuerdo 115/2026',
        fecha_declaracion: d.fecha_declaracion,
        // Que la declaración esté revisada o no cambia cuánto pesa: sin
        // revisión de admin es lo que el cliente dijo, nada más.
        declaracion_revisada: d.revisada_en !== null,
        fecha_operacion: p.operacion.fecha,
      }),
    ],
  )
  return (ins.rows[0] as { id: string }).id
}
