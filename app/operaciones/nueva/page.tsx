import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../../src/supabase/conexion'
import { hoyEnMexico } from '../../../src/dominio/fechas'
import { Marco } from '../../componentes/marco'
import { FormularioOperacion, type Opcion } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaOperacion() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const { clientes, sucursales, desarrollos, instrumentos, monedas, yaDeclararon } =
      await leerComoUsuario(
      db,
      sesion,
      async () => {
      const c = await db.query(
        `select id, nombre_o_razon_social, rfc, curp from clientes_finales
          order by nombre_o_razon_social`,
      )
      const s = await db.query(`select id, nombre, clave from sucursales order by nombre`)
      // El desarrollo que el aviso describe. Se pide en la captura porque el
      // aviso lo exige y porque sin él la operación quedaría fuera del aviso
      // sin que nada falle — el defecto que encontró
      // `tests/aviso/operacion-sin-desarrollo.test.ts`.
      const d = await db.query(
        `select id, nombre, registro_licencia from desarrollos_inmobiliarios order by nombre`,
      )
      // Los dos catálogos del SAT que el bloque <aportacion> exige. Vienen de
      // `catalogos_sat` y no de una lista en el código: son dato regulatorio.
      const cat = async (catalogo: string) =>
        (
          await db.query(
            `select c.codigo, c.descripcion from catalogos_sat c
              where c.actividad_id = (select at.actividad_id from actividades_tenant at
                                       where at.tenant_id = $1 limit 1)
                and c.catalogo = $2
                and daterange(c.vigente_desde, c.vigente_hasta, '[]') @> current_date
              order by length(c.codigo), c.codigo`,
            [sesion.tenantId, catalogo],
          )
        ).rows as Array<{ codigo: string; descripcion: string }>
      const instrumentos = await cat('instrumento_monetario')
      const monedas = await cat('moneda')
      // Quién ya tiene Perfil transaccional. Decide si el formulario pide la
      // declaración del Art. 23 Ter 1 ¶2: se pide UNA vez, al primer acto, y
      // después cambiarla es una reevaluación con su razón asentada.
      const yd = await db.query(
        `select distinct cliente_id::text as id from perfiles_transaccionales`,
      )
      return {
        yaDeclararon: (yd.rows as Array<{ id: string }>).map((r) => r.id),
        desarrollos: (d.rows as Array<Record<string, string>>).map(
          (r): Opcion => ({
            id: String(r['id']),
            etiqueta: `${String(r['nombre'])} · ${String(r['registro_licencia'])}`,
          }),
        ),
        instrumentos,
        monedas,
        clientes: (c.rows as Array<Record<string, string | null>>).map(
          (r): Opcion => ({
            id: r['id'] as string,
            etiqueta: `${r['nombre_o_razon_social']} · ${r['rfc'] ?? r['curp'] ?? 'sin clave'}`,
          }),
        ),
        sucursales: (s.rows as Array<Record<string, string>>).map(
          (r): Opcion => ({
            id: String(r['id']),
            etiqueta: `${String(r['nombre'])} (${String(r['clave'])})`,
          }),
        ),
      }
    },
    )

    if (clientes.length === 0 || sucursales.length === 0 || desarrollos.length === 0) {
      return (
        <Marco obligado={obligado} perfil={perfil}>
          <h1>Registrar operación</h1>
          <div className="aviso">
            {clientes.length === 0 && (
              <p>
                No hay aportantes dados de alta. Una operación siempre es de alguien:{' '}
                <Link href="/clientes/nuevo">da de alta al aportante primero</Link>.
              </p>
            )}
            {sucursales.length === 0 && (
              <p>Este obligado no tiene sucursales registradas.</p>
            )}
            {desarrollos.length === 0 && (
              <p>
                No hay desarrollos inmobiliarios registrados, y el aviso de esta fracción tiene que
                describir uno. Sin desarrollo la operación no se puede reportar, así que tampoco se
                captura: el alta de desarrollos la hace VIZO durante la implementación.
              </p>
            )}
          </div>
        </Marco>
      )
    }

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Registrar operación</h1>
        <p className="sub">
          Al guardar, el motor evalúa contra el catálogo vigente <strong>a la fecha de la
          operación</strong> y suma la ventana de seis meses de ese aportante, cruzando sucursales.
        </p>
        <FormularioOperacion
          clientes={clientes}
          sucursales={sucursales}
          desarrollos={desarrollos}
          instrumentos={instrumentos}
          monedas={monedas}
          yaDeclararon={yaDeclararon}
          hoy={hoyEnMexico()}
        />
      </Marco>
    )
  })
}
