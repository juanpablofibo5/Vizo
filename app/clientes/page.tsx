import Link from 'next/link'
import { Marco } from '../componentes/marco'
import { clienteServidor } from '../../src/supabase/servidor'
import { obligadoDeSesion, sesionRequerida } from '../../src/supabase/sesion'

export const dynamic = 'force-dynamic'

interface FilaCliente {
  id: string
  tipo_persona: string
  nombre_o_razon_social: string
  rfc: string | null
  curp: string | null
  requiere_revision_identidad: boolean
  created_at: string
}

export default async function Clientes() {
  const sesion = await sesionRequerida()
  const obligado = await obligadoDeSesion()
  const supabase = await clienteServidor()

  // Sin filtro de tenant a propósito: RLS lo aplica. Si esta consulta
  // devolviera clientes de otro obligado, sería un incidente de seguridad, y
  // el smoke test estructural lo verifica en cada corrida del CI.
  const { data, error } = await supabase
    .from('clientes_finales')
    .select('id, tipo_persona, nombre_o_razon_social, rfc, curp, requiere_revision_identidad, created_at')
    .order('created_at', { ascending: false })

  const clientes = (data ?? []) as FilaCliente[]

  return (
    <Marco obligado={obligado} perfil={sesion}>
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

        {error !== null && (
          <div className="error">No se pudieron cargar los clientes: {error.message}</div>
        )}

        <table>
          <thead>
            <tr>
              <th>Nombre o razón social</th>
              <th>Tipo</th>
              <th>RFC</th>
              <th>Identidad</th>
              <th>Expediente</th>
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
              clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre_o_razon_social}</td>
                  <td>{etiquetaTipo(c.tipo_persona)}</td>
                  <td>{c.rfc ?? c.curp ?? '—'}</td>
                  <td>
                    {c.requiere_revision_identidad ? (
                      <span className="chip" title="Sin RFC ni CURP: la acumulación se revisa a mano">
                        revisar
                      </span>
                    ) : (
                      'resuelta'
                    )}
                  </td>
                  <td>
                    <Link href={`/clientes/${c.id}/expediente`}>Ver expediente</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
    </Marco>
  )
}

function etiquetaTipo(tipo: string): string {
  if (tipo === 'fisica') return 'Persona física'
  if (tipo === 'moral') return 'Persona moral'
  return 'Fideicomiso'
}
