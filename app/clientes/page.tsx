import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../componentes/marco'
import { conocimientoDeClientes } from '../../src/persistencia/conocimiento'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { formatearPesosTexto as pesos } from '../../src/dominio/dinero'
import {
  peorEstado,
  rielAprobacion,
  rielExpediente,
  rielGradoDeRiesgo,
  rielPep,
  rielPerfil,
  rielRevisionAnual,
} from '../componentes/riel'

export const dynamic = 'force-dynamic'

interface FilaCliente {
  id: string
  tipo_persona: string
  nombre_o_razon_social: string
  rfc: string | null
  curp: string | null
  relacion_negocios: boolean | null
  requiere_revision_identidad: boolean
  estatus_expediente: string | null
  cubiertos: number | null
  total_obligatorios: number | null
  /** Lo que el motor acumuló para la operación más reciente de este cliente. */
  suma_ventana: string | null
  fecha_ultima_operacion: string | null
}

const TIPO: Record<string, string> = {
  fisica: 'Persona física',
  moral: 'Persona moral',
  fideicomiso: 'Fideicomiso',
}

export default async function Clientes() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const { clientes, conocimiento } = await leerComoUsuario(db, sesion, async () => {
      // Sin filtro de tenant a propósito en las tablas con RLS, pero explícito
      // donde se puede: el smoke test estructural verifica el aislamiento en
      // cada corrida, y salvarse por accidente no es salvarse.
      //
      // El expediente entra con un lateral que toma la ÚLTIMA versión, igual
      // que la pantalla del expediente. La completitud se LEE del jsonb que
      // dejó `recalcularCompletitud`; contarla aquí sería el segundo cálculo
      // que ya salió mal una vez.
      const r = await db.query(
        `select c.id::text, c.tipo_persona::text as tipo_persona, c.nombre_o_razon_social,
                c.rfc, c.curp, c.relacion_negocios, c.requiere_revision_identidad,
                e.estatus::text as estatus_expediente,
                (e.completitud ->> 'cubiertos')::int as cubiertos,
                (e.completitud ->> 'totalObligatorios')::int as total_obligatorios,
                v.suma_ventana::text as suma_ventana,
                v.fecha::text as fecha_ultima_operacion
           from clientes_finales c
           left join lateral (
             select estatus, completitud from expedientes x
              where x.cliente_id = c.id order by x.version desc limit 1
           ) e on true
           left join lateral (
             select ev.suma_ventana, o.fecha_operacion as fecha
               from operaciones_vigentes o
               join evaluaciones_umbral ev on ev.operacion_id = o.id
              where o.cliente_id = c.id
              order by o.fecha_operacion desc, ev.evaluado_en desc
              limit 1
           ) v on true
          where c.tenant_id = $1
          order by c.created_at desc`,
        [sesion.tenantId],
      )
      const clientes = r.rows as FilaCliente[]

      // UNA consulta por lote para las cinco secciones de todos los clientes,
      // no cuatro lecturas por renglón. Y es el mismo código que arma el
      // expediente — hay una prueba contra la base que lo verifica.
      const conocimiento = await conocimientoDeClientes(db, {
        sesion,
        hoy: hoyEnMexico(),
        clientes: clientes.map((c) => ({
          id: c.id,
          tipoPersona: c.tipo_persona,
          relacionNegocios: c.relacion_negocios,
        })),
      })
      return { clientes, conocimiento }
    })

    const hoy = hoyEnMexico()

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Clientes</h1>
            <p className="sub">
              En Fracción V Bis se integra expediente de <strong>cada aportante</strong>, sin
              importar el monto.
            </p>
          </div>
          <Link href="/clientes/nuevo">
            <button type="button">Dar de alta</button>
          </Link>
        </div>

        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>RFC</th>
                <th>Expediente</th>
                <th>Conocimiento</th>
                <th className="num">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr>
                  <td className="vacia" colSpan={5}>
                    Todavía no hay clientes dados de alta.
                  </td>
                </tr>
              ) : (
                clientes.map((c) => {
                  const exp = rielExpediente({
                    estatus: c.estatus_expediente,
                    cubiertos: c.cubiertos,
                    totalObligatorios: c.total_obligatorios,
                  })
                  const k = conocimiento.get(c.id)
                  // El resumen es el PEOR de las cinco secciones. Que sea el
                  // peor y no un promedio es el punto: una lista de triaje que
                  // suaviza lo grave con lo que está bien no sirve para triar.
                  const con =
                    k === undefined
                      ? null
                      : peorEstado([
                          rielRevisionAnual({
                            relacionNegocios: k.revision.relacionNegocios,
                            vence: k.revision.vence,
                            hoy,
                          }),
                          rielGradoDeRiesgo(k.riesgo),
                          rielPerfil(k.perfil),
                          rielAprobacion(k.aprobacion),
                          rielPep(k.pep),
                        ])
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clientes/${c.id}/expediente`} className="nombre-cliente">
                          {c.nombre_o_razon_social}
                        </Link>
                        <span className="pista">
                          {TIPO[c.tipo_persona] ?? c.tipo_persona}
                          {c.requiere_revision_identidad && ' · identidad por revisar'}
                        </span>
                      </td>
                      <td className="mono pequeno">{c.rfc ?? c.curp ?? '— sin RFC'}</td>
                      <td>
                        <span className={`estado ${exp.tono}`} title={exp.reloj}>
                          {exp.estado}
                        </span>
                      </td>
                      <td>
                        {con === null ? (
                          <span className="estado neutro">Sin leer</span>
                        ) : (
                          <span className={`estado ${con.tono}`} title={con.reloj}>
                            {con.estado}
                          </span>
                        )}
                      </td>
                      {/*
                        La cifra es la que el motor ACUMULÓ al evaluar la última
                        operación, y por eso lleva su fecha debajo. No es «lo
                        acumulado hoy»: la ventana de seis meses corre, y las
                        operaciones viejas se salen de ella. Poner el número sin
                        la fecha lo convertiría en un dato plausible y vencido.
                      */}
                      <td className="num">
                        {c.suma_ventana === null ? (
                          <span className="tenue">—</span>
                        ) : (
                          <>
                            {pesos(c.suma_ventana)}
                            <span className="pista">al {c.fecha_ultima_operacion}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="sub pequeno" style={{ marginTop: '1rem' }}>
          «Conocimiento» resume las cinco secciones del expediente —revisión anual, grado de
          riesgo, perfil transaccional, aprobación para operar y declaración PEP— con la más
          grave de las cinco. El expediente las enseña una por una.
        </p>
      </Marco>
    )
  })
}
