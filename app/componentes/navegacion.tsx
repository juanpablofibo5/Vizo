'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { claveDe, destino, NAVEGACION, type Area } from './areas'
import { IconoArea } from './iconos'

/**
 * La navegación lateral.
 *
 * Cliente únicamente porque necesita saber en qué ruta está: para marcar el
 * área activa y para desplegar sus sub-enlaces. Nada de lo que decide aquí es
 * un permiso — los permisos los aplica RLS en la base, y ocultar un enlace
 * nunca fue una medida de seguridad. Se le muestra todo a todos, y la base
 * rechaza lo que no le toca a cada quien.
 */

/** '/' solo se marca en sí misma; las demás también en sus subrutas, para que
 *  el detalle de un aviso siga iluminando Avisos. */
function estaActiva(ruta: string, actual: string): boolean {
  return ruta === '/' ? actual === '/' : actual === ruta || actual.startsWith(`${ruta}/`)
}

export function Navegacion({
  alertasAbiertas,
  alCambiarDeArea,
}: {
  alertasAbiertas?: number | undefined
  /** En pantalla angosta el panel se cierra al navegar; en escritorio no hace nada. */
  alCambiarDeArea?: (() => void) | undefined
}) {
  const ruta = usePathname()
  const alNavegar = () => alCambiarDeArea?.()

  const enlaceDeArea = (area: Extract<Area, { estado: 'lista' }>) => {
    const activa = estaActiva(area.ruta, ruta)

    return (
      <li key={area.ruta} className="area">
        <Link
          href={area.ruta}
          onClick={alNavegar}
          {...(activa ? { 'aria-current': 'page' as const } : {})}
        >
          <IconoArea nombre={area.icono} />
          <span className="rotulo">{area.nombre}</span>
          {area.ruta === '/alertas' && alertasAbiertas !== undefined && alertasAbiertas > 0 && (
            <span className="chip chip-alerta">{alertasAbiertas}</span>
          )}
        </Link>

        {/* Los sub-enlaces existen siempre en el DOM y se despliegan cuando el
            área está activa. Montarlos y desmontarlos cortaría la transición,
            y un panel que salta en vez de abrirse se siente roto. */}
        {area.sub !== undefined && (
          <div className="sub-envoltura" data-abierta={activa ? 'sí' : 'no'} aria-hidden={!activa}>
            <ul className="sub">
              {area.sub.map((s) => {
                // El sub-enlace se marca por coincidencia EXACTA: dentro de
                // Clientes, "Todos" no debe encenderse mientras se ve el alta.
                // Los que llevan ancla no se marcan solos —la sección activa
                // depende del scroll, que esto no observa— y encenderlos por
                // estar en la pantalla diría algo falso.
                const exacta = s.ancla === undefined && ruta === s.ruta

                return (
                  <li key={claveDe(s)}>
                    <Link
                      href={destino(s)}
                      onClick={alNavegar}
                      {...(exacta ? { 'aria-current': 'page' as const } : {})}
                      {...(activa ? {} : { tabIndex: -1 })}
                    >
                      {s.nombre}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </li>
    )
  }

  return (
    <nav className="areas" aria-label="Áreas del portal">
      {NAVEGACION.map((grupo, i) => (
        <div className="grupo" key={grupo.titulo ?? `grupo-${i}`}>
          {grupo.titulo !== undefined && <h2 className="grupo-titulo">{grupo.titulo}</h2>}
          <ul>
            {grupo.areas.map((area) =>
              area.estado === 'en_construccion' ? (
                <li className="area" key={area.nombre}>
                  <span className="pendiente" aria-disabled="true">
                    <IconoArea nombre={area.icono} />
                    <span className="rotulo">{area.nombre}</span>
                    <span className="marca-pendiente">pronto</span>
                  </span>
                </li>
              ) : (
                enlaceDeArea(area)
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  )
}
