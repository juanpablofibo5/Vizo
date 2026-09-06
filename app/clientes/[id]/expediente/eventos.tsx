'use client'

import { useActionState, useState } from 'react'
import type { EstadoBeneficiarioControlador } from '../../../../src/persistencia/beneficiario-controlador'
import type { EstructuraDelCliente } from '../../../../src/persistencia/grafo-societario'
import { accionRegistrarEvento, type EstadoCaptura } from './acciones'

/**
 * Los eventos estructurales — «el alta pasa una vez; esto corre para siempre».
 *
 * Registrar el cambio dispara todo lo demás: cierra las vigencias señaladas,
 * encola la reevaluación, arranca el plazo y levanta la alerta. Lo que esta
 * pantalla NO hace es adivinar qué participaciones cerró el evento: quién
 * vendió lo dice quien captura.
 */

const INICIAL: EstadoCaptura = { ok: null, mensaje: '', problemas: [] }

const NOMBRE_EVENTO: Record<string, string> = {
  cambio_accionario: 'Cambio accionario',
  fusion: 'Fusión',
  cesion_derechos_fideicomisarios: 'Cesión de derechos fideicomisarios',
  cambio_administrador: 'Cambio de administrador',
  otro: 'Otro cambio estructural',
}

function Problemas({ estado }: { estado: EstadoCaptura }) {
  if (estado.ok === null) return null
  if (estado.ok) return <div className="exito">{estado.mensaje}</div>
  return (
    <div className="error">
      {estado.mensaje}
      {estado.problemas.length > 0 && (
        <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
          {estado.problemas.map((p) => (
            <li key={p} className="pequeno">{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EventosEstructurales({
  clienteId,
  eventos,
  estructura,
  puede,
}: {
  clienteId: string
  eventos: EstadoBeneficiarioControlador['eventos']
  estructura: EstructuraDelCliente
  puede: boolean
}) {
  const [estado, accion, registrando] = useActionState<EstadoCaptura, FormData>(
    accionRegistrarEvento,
    INICIAL,
  )
  const [abierto, setAbierto] = useState(false)

  const porId = new Map(estructura.partes.map((p) => [p.id, p]))
  const vigentes = estructura.participaciones.filter((a) => a.vigenteHasta === null)
  const pendientes = eventos.filter((e) => !e.atendido)

  return (
    <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1rem', display: 'grid', gap: '.8rem' }}>
      <div>
        <strong className="pequeno">Cambios en la estructura</strong>
        <p className="pequeno tenue" style={{ margin: '.3rem 0 0', maxWidth: '46rem' }}>
          Un cambio accionario o de administración vuelve vieja la identificación. Registrarlo
          arranca el plazo de actualización y deja la reevaluación pendiente hasta que se vuelva a
          correr el orden.
        </p>
      </div>

      <Problemas estado={estado} />

      {pendientes.length > 0 && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>
            {pendientes.length === 1
              ? 'Hay un cambio sin reevaluar.'
              : `Hay ${String(pendientes.length)} cambios sin reevaluar.`}
          </strong>{' '}
          <span className="pequeno">
            La identificación vigente es de una estructura anterior. Actualiza la estructura y
            vuelve a correr el orden — eso atiende lo pendiente.
          </span>
        </div>
      )}

      {eventos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '1.05rem' }}>
          {eventos.map((e) => (
            <li key={e.id} className="pequeno" style={{ marginBottom: '.35rem' }}>
              <span className={e.atendido ? 'estado ok' : 'estado aviso'}>
                {e.atendido ? 'reevaluado' : `actualizar antes del ${e.fechaLimite}`}
              </span>{' '}
              <strong>{NOMBRE_EVENTO[e.tipo] ?? e.tipo}</strong> · {e.fechaEvento}
              <br />
              <span className="tenue">{e.descripcion}</span>
            </li>
          ))}
        </ul>
      )}

      {puede &&
        (abierto ? (
          <form action={accion} style={{ display: 'grid', gap: '.55rem', maxWidth: '34rem' }}>
            <input type="hidden" name="clienteId" value={clienteId} />
            <div className="rejilla" style={{ gap: '.6rem' }}>
              <label style={{ margin: 0 }}>
                <span className="pequeno">Qué cambió</span>
                <select name="tipoEvento" defaultValue="cambio_accionario">
                  {Object.entries(NOMBRE_EVENTO).map(([v, n]) => (
                    <option key={v} value={v}>{n}</option>
                  ))}
                </select>
              </label>
              <label style={{ margin: 0 }}>
                <span className="pequeno">
                  Fecha del acto <span className="pista">la asamblea, no la de hoy</span>
                </span>
                <input type="date" name="fechaEvento" required />
              </label>
            </div>
            <label style={{ margin: 0 }}>
              <span className="pequeno">
                Qué pasó <span className="pista">«entró el fondo X con el 35%», no solo el tipo</span>
              </span>
              <input type="text" name="descripcionEvento" required />
            </label>

            {vigentes.length > 0 && (
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '.3rem' }}>
                <legend className="pequeno" style={{ padding: 0 }}>
                  Participaciones que este cambio cerró{' '}
                  <span className="pista">se cierran a la fecha del acto</span>
                </legend>
                {vigentes.map((a) => (
                  <label key={a.id} className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
                    <input type="checkbox" name="cierraParticipacion" value={a.id} />
                    <span>
                      {porId.get(a.duenoId)?.nombre ?? a.duenoId} · {a.porcentaje}% de{' '}
                      {porId.get(a.poseidaId)?.nombre ?? a.poseidaId}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button type="submit" className="secundario pequeno" disabled={registrando}>
                {registrando ? 'Registrando…' : 'Registrar el cambio'}
              </button>
              <button type="button" className="secundario pequeno" onClick={() => { setAbierto(false) }}>
                Cerrar
              </button>
            </div>
          </form>
        ) : (
          estructura.partes.length > 0 && (
            <button
              type="button"
              className="secundario pequeno"
              style={{ justifySelf: 'start' }}
              onClick={() => { setAbierto(true) }}
            >
              Registrar un cambio estructural
            </button>
          )
        ))}
    </div>
  )
}
