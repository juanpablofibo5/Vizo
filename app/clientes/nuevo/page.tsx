import { Marco } from '../../componentes/marco'
import { obligadoDeSesion, sesionRequerida } from '../../../src/supabase/sesion'
import { FormularioAlta } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoCliente() {
  const sesion = await sesionRequerida()
  const obligado = await obligadoDeSesion()

  return (
    <Marco obligado={obligado} perfil={sesion}>
      <h1>Alta de cliente</h1>
      <p className="sub">El alta queda registrada en la bitácora con su hash encadenado.</p>
      <div className="tarjeta" style={{ maxWidth: '46rem' }}>
        <FormularioAlta />
      </div>
    </Marco>
  )
}
