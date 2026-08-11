'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AREAS } from './areas'

/**
 * La navegación lateral.
 *
 * Cliente únicamente porque necesita saber en qué ruta está para marcar el
 * área activa. Nada de lo que decide aquí es un permiso: los permisos los
 * aplica RLS en la base, y ocultar un enlace nunca fue una medida de
 * seguridad.
 */
export function Navegacion({ alertasAbiertas }: { alertasAbiertas?: number | undefined }) {
  const ruta = usePathname()

  return (
    <nav className="areas" aria-label="Áreas del portal">
      {AREAS.map((area) => {
        if (area.estado === 'en_construccion') {
          return (
            <span className="pendiente" key={area.nombre} aria-disabled="true">
              {area.nombre}
              <span className="marca-pendiente">pronto</span>
            </span>
          )
        }

        // '/' solo se marca activa en sí misma; las demás también en sus
        // subrutas, para que el detalle de un aviso siga iluminando Avisos.
        const activa =
          area.ruta === '/' ? ruta === '/' : ruta === area.ruta || ruta.startsWith(`${area.ruta}/`)

        return (
          <Link key={area.ruta} href={area.ruta} {...(activa ? { 'aria-current': 'page' } : {})}>
            {area.nombre}
            {area.ruta === '/alertas' &&
              alertasAbiertas !== undefined &&
              alertasAbiertas > 0 && <span className="chip chip-alerta">{alertasAbiertas}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
