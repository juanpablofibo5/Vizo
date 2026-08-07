import { sesionRequerida } from '../../../src/supabase/sesion'
import { FormularioAlta } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoCliente() {
  const sesion = await sesionRequerida()

  return (
    <>
      <header className="barra">
        <strong>VIZO</strong>
        <span>
          {sesion.nombre}
          <span className="chip">{sesion.rol}</span>
        </span>
      </header>

      <main style={{ maxWidth: '46rem' }}>
        <h1>Alta de cliente</h1>
        <p className="sub">
          El alta queda registrada en la bitácora con su hash encadenado.
        </p>
        <div className="tarjeta">
          <FormularioAlta />
        </div>
      </main>
    </>
  )
}
