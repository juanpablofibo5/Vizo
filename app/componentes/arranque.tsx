import Link from 'next/link'
import type { Route } from 'next'
import type { Arranque, ClaveDePaso } from '../../src/persistencia/arranque'

/**
 * El checklist de arranque.
 *
 * En F1 el onboarding es asistido: la mitad de estos pasos los ejecutamos
 * nosotros con el runbook de alta de tenant, y la otra mitad solo puede hacerla
 * el obligado. Por eso cada renglón dice **quién** lo hace: un checklist que le
 * pide al cliente algo que no está en sus manos lo deja mirando una casilla que
 * nunca va a marcar, y llamando a soporte para preguntarlo.
 *
 * Cada paso explica qué se rompe si falta. No es pedagogía: es la diferencia
 * entre "cárgame una sucursal porque el formulario la pide" y "sin sucursal no
 * se puede registrar una operación". Lo segundo se atiende; lo primero se
 * pospone.
 *
 * Los textos viven aquí y no en la capa de persistencia a propósito: allá se
 * responde en qué estado está la cuenta; aquí, cómo se le cuenta a una persona.
 */

interface Copia {
  titulo: string
  porQue: string
  ruta: Route
}

const COPIA: Record<ClaveDePaso, Copia> = {
  actividad: {
    titulo: 'Actividad vulnerable contratada',
    porQue: 'Sin ella el motor no evalúa nada: no hay umbral que aplicar ni periodo que presentar.',
    ruta: '/configuracion',
  },
  fecha_alta: {
    titulo: 'Fecha de alta ante la autoridad',
    porQue:
      'Marca desde qué mes corre la obligación. Sin ella no se puede saber si faltan informes en cero de meses anteriores.',
    ruta: '/configuracion',
  },
  tipo_persona: {
    titulo: 'Persona física, moral, fideicomiso u otra figura jurídica',
    porQue:
      'De esto depende si hay que designar un Representante Encargado de Cumplimiento: la Ley se lo pide a las morales y a las figuras jurídicas, no a las personas físicas.',
    ruta: '/configuracion',
  },
  estructura: {
    titulo: 'Estructura del fideicomiso o figura enviada al SAT',
    porQue:
      'Quien actúa por fideicomiso u otra figura jurídica registra a sus integrantes con la herramienta del Portal (Art. 10 Sexies del Acuerdo 115/2026). Aquí se captura la estructura con los datos exactos del Anexo y se deja constancia de qué se envió y cuándo.',
    ruta: '/configuracion',
  },
  rec: {
    titulo: 'Designación del REC aceptada',
    porQue:
      'Mientras la persona designada no acepte en el Portal del SAT, el cumplimiento sigue recayendo personalmente en el órgano de administración o en el administrador único (Art. 20 de la Ley). Designar no basta: hace falta la aceptación.',
    ruta: '/configuracion',
  },
  sucursal: {
    titulo: 'Al menos una sucursal',
    porQue: 'Toda operación se registra en una sucursal, y el aviso la reporta.',
    ruta: '/configuracion',
  },
  desarrollo: {
    titulo: 'Al menos un desarrollo inmobiliario',
    porQue: 'El aviso de la Fracción V Bis describe el desarrollo en el que ocurrió la operación.',
    ruta: '/configuracion',
  },
  expediente: {
    titulo: 'El primer expediente aprobado',
    porQue:
      'Identificar al cliente es la obligación que precede a todas las demás. Aprobar es una decisión humana, y queda registrada con nombre y hora.',
    ruta: '/clientes',
  },
  operacion: {
    titulo: 'La primera operación capturada',
    porQue: 'Capturarla dispara el motor: el veredicto se registra en ese momento, no después.',
    ruta: '/operaciones/nueva',
  },
  periodo: {
    titulo: 'El primer periodo presentado',
    porQue:
      'Con el acuse en la mano. Hasta entonces nadie sabe si el circuito completo funciona, y descubrirlo un día 17 es tarde.',
    ruta: '/avisos',
  },
}

function Marca({ hecho }: { hecho: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        flex: '0 0 auto',
        width: '1.15rem',
        height: '1.15rem',
        marginTop: '.15rem',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: '.72rem',
        fontWeight: 700,
        color: hecho ? 'var(--superficie)' : 'transparent',
        background: hecho ? 'var(--ok)' : 'transparent',
        border: hecho ? 'none' : '1.5px dashed var(--linea-fuerte)',
      }}
    >
      ✓
    </span>
  )
}

export function ChecklistDeArranque({ arranque }: { arranque: Arranque }) {
  const total = arranque.pasos.length

  return (
    <div className="tarjeta" style={{ padding: '1.3rem 1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Arranque de la cuenta</h2>
        <span className="tenue pequeno num">
          {arranque.hechos} de {total}
        </span>
      </div>

      <p className="pequeno tenue" style={{ margin: '.35rem 0 1.1rem' }}>
        Lo que hace falta para que VIZO pueda responder si estás en regla. Los pasos marcados
        &laquo;VIZO&raquo; los hacemos nosotros durante la implementación.
      </p>

      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: '.85rem',
        }}
      >
        {arranque.pasos.map((paso) => {
          const copia = COPIA[paso.clave]
          return (
            <li
              key={paso.clave}
              style={{
                display: 'flex',
                gap: '.7rem',
                alignItems: 'flex-start',
              }}
            >
              <Marca hecho={paso.hecho} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '.5rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 545,
                      color: paso.hecho ? 'var(--texto-tenue)' : 'var(--texto)',
                    }}
                  >
                    {copia.titulo}
                  </span>
                  {!paso.hecho && paso.quien === 'vizo' && (
                    <span
                      className="chip"
                      title="Lo ejecuta el equipo de VIZO en la implementación"
                    >
                      VIZO
                    </span>
                  )}
                </div>

                {/* Un paso hecho ya no necesita explicarse: ocupa espacio y
                    empuja hacia abajo lo que sí falta. */}
                {!paso.hecho && (
                  <p className="pequeno tenue" style={{ margin: '.2rem 0 0' }}>
                    {copia.porQue}{' '}
                    <Link href={copia.ruta} style={{ whiteSpace: 'nowrap' }}>
                      Ir →
                    </Link>
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
