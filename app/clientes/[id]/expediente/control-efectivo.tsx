'use client'

import { useActionState, useState } from 'react'
import type {
  DeterminacionDeControl,
  ReglaDeCriterio,
} from '../../../../src/persistencia/determinacion-control'
import type { EstructuraDelCliente } from '../../../../src/persistencia/grafo-societario'
import { accionProponerControl, accionResolverControl, type EstadoCaptura } from './acciones'

/**
 * El control efectivo como pregunta con respuesta registrada — Fase 2.
 *
 * El cuello de botella del diagrama: decidir si un voto de calidad o un
 * convenio parasocial constituyen control NO es automatizable. Aquí la captura
 * abre una PREGUNTA; resolverla exige fundamento en ambos sentidos; y mientras
 * esté abierta, ni el orden corre ni el expediente se aprueba — eso lo impone
 * la base, no esta pantalla.
 */

const INICIAL: EstadoCaptura = { ok: null, mensaje: '', problemas: [] }

const NOMBRE_AREA: Record<string, string> = {
  estrategia: 'la estrategia',
  toma_de_decisiones: 'la toma de decisiones',
  politicas_principales: 'las políticas principales',
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

function Resolver({
  clienteId,
  determinacion,
  reglas,
}: {
  clienteId: string
  determinacion: DeterminacionDeControl
  reglas: readonly ReglaDeCriterio[]
}) {
  const [estado, accion, resolviendo] = useActionState<EstadoCaptura, FormData>(
    accionResolverControl,
    INICIAL,
  )
  const [guardarRegla, setGuardarRegla] = useState(false)

  return (
    <form action={accion} style={{ display: 'grid', gap: '.55rem', maxWidth: '34rem' }}>
      <Problemas estado={estado} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="determinacionId" value={determinacion.id} />

      <div className="rejilla" style={{ gap: '.6rem' }}>
        <label style={{ margin: 0 }}>
          <span className="pequeno">Resolución</span>
          <select name="conclusionControl" defaultValue="confirmada">
            <option value="confirmada">Sí constituye control efectivo</option>
            <option value="rechazada">No constituye control</option>
          </select>
        </label>
        {reglas.length > 0 && (
          <label style={{ margin: 0 }}>
            <span className="pequeno">
              Regla aplicada <span className="pista">el criterio ya resuelto una vez</span>
            </span>
            <select name="reglaExistente" defaultValue="">
              <option value="">Ninguna</option>
              {reglas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.patron} ({r.vecesAplicada}×)
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label style={{ margin: 0 }}>
        <span className="pequeno">
          Fundamento <span className="pista">obligatorio en ambos sentidos: un «no» sin razones no defiende nada</span>
        </span>
        <input type="text" name="fundamentoControl" required />
      </label>

      <label className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
        <input
          type="checkbox"
          checked={guardarRegla}
          onChange={(e) => { setGuardarRegla(e.target.checked) }}
        />
        <span>Guardar este criterio como regla reutilizable</span>
      </label>
      {guardarRegla && (
        <label style={{ margin: 0 }}>
          <span className="pequeno">
            El patrón <span className="pista">«cláusula de voto de calidad en el consejo», no el caso concreto</span>
          </span>
          <input type="text" name="patronRegla" required />
        </label>
      )}

      <button type="submit" className="secundario pequeno" disabled={resolviendo}>
        {resolviendo ? 'Resolviendo…' : 'Resolver'}
      </button>
    </form>
  )
}

export function ControlEfectivo({
  clienteId,
  determinaciones,
  reglas,
  estructura,
  puede,
}: {
  clienteId: string
  determinaciones: readonly DeterminacionDeControl[]
  reglas: readonly ReglaDeCriterio[]
  estructura: EstructuraDelCliente
  puede: boolean
}) {
  const [proponer, accionProponer, proponiendo] = useActionState<EstadoCaptura, FormData>(
    accionProponerControl,
    INICIAL,
  )
  const [abierto, setAbierto] = useState(false)
  const [resolviendoId, setResolviendoId] = useState<string | null>(null)

  const fisicas = estructura.partes.filter((p) => p.tipo === 'fisica')
  const abiertas = determinaciones.filter((d) => d.estado === 'propuesta')

  return (
    <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1rem', display: 'grid', gap: '.8rem' }}>
      <div>
        <strong className="pequeno">Control efectivo por otros medios</strong>
        <p className="pequeno tenue" style={{ margin: '.3rem 0 0', maxWidth: '46rem' }}>
          Un voto de calidad, un convenio parasocial, una facultad estatutaria. El motor{' '}
          <strong>nunca lo resuelve solo</strong>: aquí se abre la pregunta, un humano la resuelve
          con fundamento, y mientras esté abierta ni el orden corre ni el expediente se aprueba.
        </p>
      </div>

      {abiertas.length > 0 && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>
            {abiertas.length === 1
              ? 'Hay una pregunta de control abierta.'
              : `Hay ${String(abiertas.length)} preguntas de control abiertas.`}
          </strong>{' '}
          <span className="pequeno">
            Bloquean la corrida del orden y la aprobación del expediente — la respuesta puede
            cambiar quién es el Beneficiario Controlador.
          </span>
        </div>
      )}

      {determinaciones.length > 0 && (
        <div style={{ display: 'grid', gap: '.7rem' }}>
          {determinaciones.map((d) => (
            <div key={d.id} style={{ display: 'grid', gap: '.35rem' }}>
              <div className="pequeno">
                <span
                  className={
                    d.estado === 'propuesta'
                      ? 'estado aviso'
                      : d.estado === 'confirmada'
                        ? 'estado ok'
                        : 'estado neutro'
                  }
                >
                  {d.estado === 'propuesta'
                    ? 'sin resolver'
                    : d.estado === 'confirmada'
                      ? 'constituye control'
                      : 'no constituye control'}
                </span>{' '}
                <strong>{d.parteNombre}</strong>
                <span className="tenue"> · {d.medio} · {d.areas.map((a) => NOMBRE_AREA[a] ?? a).join(', ')}</span>
              </div>
              {d.fundamento !== null && (
                <p className="pequeno tenue" style={{ margin: 0, paddingLeft: '.2rem' }}>
                  {d.fundamento}
                  {d.reglaPatron !== null && <> · regla: «{d.reglaPatron}»</>}
                </p>
              )}
              {puede && d.estado === 'propuesta' && (
                resolviendoId === d.id ? (
                  <Resolver clienteId={clienteId} determinacion={d} reglas={reglas} />
                ) : (
                  <button
                    type="button"
                    className="secundario pequeno"
                    style={{ justifySelf: 'start' }}
                    onClick={() => { setResolviendoId(d.id) }}
                  >
                    Resolver
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {puede &&
        (abierto ? (
          <form action={accionProponer} style={{ display: 'grid', gap: '.55rem', maxWidth: '34rem' }}>
            <Problemas estado={proponer} />
            <input type="hidden" name="clienteId" value={clienteId} />
            <label style={{ margin: 0 }}>
              <span className="pequeno">Quién <span className="pista">una persona física de la estructura</span></span>
              <select name="parteControlId" required>
                <option value="">Selecciona…</option>
                {fisicas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
            <label style={{ margin: 0 }}>
              <span className="pequeno">
                Por qué medio <span className="pista">la cláusula, el convenio, la facultad</span>
              </span>
              <input type="text" name="medioControl" required />
            </label>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '.3rem' }}>
              <legend className="pequeno" style={{ padding: 0 }}>Sus funciones se relacionan con</legend>
              {Object.entries(NOMBRE_AREA).map(([valor, nombre]) => (
                <label key={valor} className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
                  <input type="checkbox" name="areasControl" value={valor} />
                  <span>{nombre}</span>
                </label>
              ))}
            </fieldset>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button type="submit" className="secundario pequeno" disabled={proponiendo}>
                {proponiendo ? 'Abriendo…' : 'Abrir la pregunta'}
              </button>
              <button type="button" className="secundario pequeno" onClick={() => { setAbierto(false) }}>
                Cerrar
              </button>
            </div>
          </form>
        ) : (
          fisicas.length > 0 && (
            <button
              type="button"
              className="secundario pequeno"
              style={{ justifySelf: 'start' }}
              onClick={() => { setAbierto(true) }}
            >
              Señalar posible control efectivo
            </button>
          )
        ))}
    </div>
  )
}
