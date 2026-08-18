import type { Route } from 'next'

/**
 * El mapa del portal, en un solo lugar.
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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ GRUPOS Y NO UNA LISTA
 * ────────────────────────────────────────────────────────────────────────────
 * Ocho enlaces seguidos obligan a leerlos todos para encontrar uno. Agrupados
 * por el momento en que se usan —lo de todos los días, lo del cierre mensual,
 * lo que se toca una vez— el ojo salta al grupo y después al renglón.
 *
 * El orden no es estético: sigue el ciclo del obligado. Capturas clientes y
 * operaciones, el motor levanta alertas, del periodo sale el aviso, el
 * calendario dice cuándo vence y la evidencia es lo que se enseña si preguntan.
 *
 * Los sub-enlaces son las acciones y secciones que antes solo se alcanzaban
 * navegando dentro de la pantalla. Aparecen cuando su área está activa: el
 * panel muestra todo lo que se puede hacer sin convertirse en un muro de
 * enlaces.
 */

/** Clave del icono. El dibujo vive en `iconos.tsx`; aquí solo el nombre. */
export type Icono =
  | 'inicio'
  | 'clientes'
  | 'operaciones'
  | 'alertas'
  | 'avisos'
  | 'evidencia'
  | 'calendario'
  | 'configuracion'

export interface SubEnlace {
  /** Ruta del área a la que pertenece; el ancla la afina. */
  ruta: Route
  /** `id` de la sección dentro de esa pantalla, cuando el destino es una parte. */
  ancla?: string
  nombre: string
}

export type Area =
  | {
      estado: 'lista'
      ruta: Route
      nombre: string
      icono: Icono
      /** Qué se puede hacer dentro. Se despliega cuando el área está activa. */
      sub?: SubEnlace[]
    }
  | { estado: 'en_construccion'; nombre: string; icono: Icono }

export interface Grupo {
  /** Sin título el grupo no lleva encabezado: es el caso de Inicio. */
  titulo?: string
  areas: Area[]
}

export const NAVEGACION: Grupo[] = [
  {
    areas: [{ estado: 'lista', ruta: '/', nombre: 'Inicio', icono: 'inicio' }],
  },
  {
    titulo: 'Operación',
    areas: [
      {
        estado: 'lista',
        ruta: '/clientes',
        nombre: 'Clientes',
        icono: 'clientes',
        sub: [
          { ruta: '/clientes', nombre: 'Todos los clientes' },
          { ruta: '/clientes/nuevo', nombre: 'Dar de alta un cliente' },
        ],
      },
      {
        estado: 'lista',
        ruta: '/operaciones',
        nombre: 'Operaciones',
        icono: 'operaciones',
        sub: [
          { ruta: '/operaciones', nombre: 'Todas las operaciones' },
          { ruta: '/operaciones/nueva', nombre: 'Registrar una operación' },
        ],
      },
      { estado: 'lista', ruta: '/alertas', nombre: 'Alertas', icono: 'alertas' },
    ],
  },
  {
    titulo: 'Cumplimiento',
    areas: [
      { estado: 'lista', ruta: '/avisos', nombre: 'Avisos', icono: 'avisos' },
      { estado: 'lista', ruta: '/calendario', nombre: 'Calendario', icono: 'calendario' },
      // La Constancia vive en Cumplimiento y no en Evidencia a propósito: no es
      // una herramienta de verificación, es un documento que el obligado
      // entrega. Ver ADR-20.
      { estado: 'lista', ruta: '/constancia', nombre: 'Constancia', icono: 'evidencia' },
      {
        estado: 'lista',
        ruta: '/evidencia',
        nombre: 'Evidencia',
        icono: 'evidencia',
        sub: [
          { ruta: '/evidencia', ancla: 'cadena', nombre: 'Integridad de la bitácora' },
          { ruta: '/evidencia', ancla: 'manifiestos', nombre: 'Manifiestos' },
          { ruta: '/evidencia', ancla: 'reconstruccion', nombre: 'Reconstrucción histórica' },
        ],
      },
    ],
  },
  {
    titulo: 'Administración',
    areas: [
      {
        estado: 'lista',
        ruta: '/configuracion',
        nombre: 'Configuración',
        icono: 'configuracion',
        sub: [
          { ruta: '/configuracion', ancla: 'obligado', nombre: 'El obligado' },
          { ruta: '/configuracion', ancla: 'rec', nombre: 'Responsable del cumplimiento' },
          { ruta: '/configuracion', ancla: 'estructura', nombre: 'Estructura del fideicomiso o figura' },
          { ruta: '/configuracion', ancla: 'actividades', nombre: 'Actividades contratadas' },
          { ruta: '/configuracion', ancla: 'usuarios', nombre: 'Usuarios' },
          { ruta: '/configuracion', ancla: 'sucursales', nombre: 'Sucursales y desarrollos' },
        ],
      },
    ],
  },
]

/**
 * El destino de un sub-enlace, como objeto y no como texto.
 *
 * `"/evidencia#cadena"` sería más corto pero NO compila, y eso es una virtud:
 * las rutas tipadas de Next son una unión de literales exactos, así que una
 * ruta inventada revienta en compilación. Separar la ruta del ancla conserva
 * esa verificación —`ruta` sigue siendo `Route`— y deja el ancla como lo que
 * es: una parte de la pantalla, no otra pantalla.
 *
 * Si un ancla desaparece de la página, el enlace sigue llevando al lugar
 * correcto y solo deja de bajar a la sección. Degrada, no rompe.
 */
export function destino(s: SubEnlace): { pathname: Route; hash?: string } {
  return s.ancla === undefined ? { pathname: s.ruta } : { pathname: s.ruta, hash: s.ancla }
}

/** Clave estable para listas de React. */
export function claveDe(s: SubEnlace): string {
  return s.ancla === undefined ? s.ruta : `${s.ruta}#${s.ancla}`
}
