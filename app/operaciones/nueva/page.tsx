import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../../src/supabase/conexion'
import { hoyEnMexico } from '../../../src/dominio/fechas'
import { Marco } from '../marco'
import { FormularioOperacion, type Opcion } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaOperacion() {
  return conBase(async ({ db, sesion, perfil }) => {
    const { clientes, sucursales } = await leerComoUsuario(db, sesion, async () => {
      const c = await db.query(
        `select id, nombre_o_razon_social, rfc, curp from clientes_finales
          order by nombre_o_razon_social`,
      )
      const s = await db.query(`select id, nombre, clave from sucursales order by nombre`)
      return {
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
    })

    if (clientes.length === 0 || sucursales.length === 0) {
      return (
        <Marco nombre={perfil.nombre} rol={perfil.rol}>
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
          </div>
        </Marco>
      )
    }

    return (
      <Marco nombre={perfil.nombre} rol={perfil.rol}>
        <h1>Registrar operación</h1>
        <p className="sub">
          Al guardar, el motor evalúa contra el catálogo vigente <strong>a la fecha de la
          operación</strong> y suma la ventana de seis meses de ese aportante, cruzando sucursales.
        </p>
        <FormularioOperacion clientes={clientes} sucursales={sucursales} hoy={hoyEnMexico()} />
      </Marco>
    )
  })
}
