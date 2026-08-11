import type { Route } from 'next'

/**
 * Las ocho áreas del portal, en un solo lugar.
 *
 * El mapa completo del producto se pinta desde el primer día, incluidas las
 * áreas que todavía no existen. Eso no es adorno: un portal que solo muestra
 * lo construido esconde la forma del producto justo a quien tiene que
 * evaluarlo, y en una demo la pregunta "¿y esto qué más hace?" se responde
 * sola.
 *
 * La forma del tipo dice la verdad: **un área en construcción no tiene ruta**,
 * porque no hay a dónde ir. No es un detalle de estilo — `next` verifica las
 * rutas en compilación, así que darle una ruta inventada a un área pendiente
 * ni siquiera compila. Cuando se construya, aparece su `ruta` y el compilador
 * confirma que existe de verdad.
 */
export type Area =
  | { estado: 'lista'; ruta: Route; nombre: string }
  | { estado: 'en_construccion'; nombre: string }

export const AREAS: Area[] = [
  { estado: 'lista', ruta: '/', nombre: 'Inicio' },
  { estado: 'lista', ruta: '/clientes', nombre: 'Clientes' },
  { estado: 'lista', ruta: '/operaciones', nombre: 'Operaciones' },
  { estado: 'lista', ruta: '/alertas', nombre: 'Alertas' },
  { estado: 'lista', ruta: '/avisos', nombre: 'Avisos' },
  { estado: 'lista', ruta: '/evidencia', nombre: 'Evidencia' },
  { estado: 'lista', ruta: '/calendario', nombre: 'Calendario' },
  { estado: 'lista', ruta: '/configuracion', nombre: 'Configuración' },
]
