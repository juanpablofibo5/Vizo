import Link from 'next/link'

/**
 * El encabezado con la navegación.
 *
 * `rol` se pinta pero NO decide nada: los permisos los aplica RLS en la base.
 * Ocultar un botón no es una medida de seguridad, es una comodidad.
 */
export function Marco({
  nombre,
  rol,
  alertasAbiertas,
  children,
}: {
  nombre: string
  rol: string
  alertasAbiertas?: number | undefined
  children: React.ReactNode
}) {
  return (
    <>
      <header className="barra">
        <span style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
          <strong>VIZO</strong>
          <Link href="/clientes">Clientes</Link>
          <Link href="/operaciones">Operaciones</Link>
          <Link href="/alertas">
            Alertas
            {alertasAbiertas !== undefined && alertasAbiertas > 0 && (
              <span className="chip chip-alerta">{alertasAbiertas}</span>
            )}
          </Link>
        </span>
        <span>
          {nombre}
          <span className="chip">{rol}</span>
        </span>
      </header>
      <main>{children}</main>
    </>
  )
}
