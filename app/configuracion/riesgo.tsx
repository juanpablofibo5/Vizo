'use client'

import { useActionState, useState } from 'react'
import {
  activarModeloRiesgo,
  guardarFactorRiesgo,
  guardarGradoRiesgo,
  nuevoModeloRiesgo,
  retirarFactorRiesgo,
  type Resultado,
} from './acciones'
import type { EstadoRiesgo } from '../../src/persistencia/riesgo'

/**
 * El modelo de Riesgos del obligado (Caps. II Quáter y III Bis).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA NO HACE, Y ES DELIBERADO
 * ────────────────────────────────────────────────────────────────────────────
 * No sugiere factores. No propone pesos. No trae una escala de arranque ni
 * cortes «típicos». Ningún campo nace con un valor puesto.
 *
 * El ADR-21 lo dice sin rodeos: un valor sugerido que nadie cambia se vuelve,
 * en los hechos, la metodología del obligado — y decidir qué hace a un cliente
 * riesgoso, y cuánto, es asesoría. Lo que sí trae es la ESTRUCTURA que la norma
 * fija: los cuatro elementos mínimos del Art. 10 Septies 1 fr. I, el piso de
 * tres clasificaciones del Art. 23 Bis, y la exigencia de marcar cuál grado es
 * el alto.
 *
 * Y donde falta configuración, la pantalla dice qué falta. No la rellena.
 */

const INICIAL: Resultado | null = null

function Mensaje({ estado }: { estado: Resultado | null }) {
  if (estado === null) return null
  return <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
}

function FormularioGrado({ hoy, siguienteOrden }: { hoy: string; siguienteOrden: number }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarGradoRiesgo,
    INICIAL,
  )
  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem', maxWidth: '30rem' }}>
      <Mensaje estado={estado} />
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <label style={{ margin: 0, maxWidth: '9rem' }}>
          <span>Clave</span>
          <input name="clave" required placeholder="medio_alto" />
        </label>
        <label style={{ margin: 0 }}>
          <span>Nombre</span>
          <input name="nombre" required placeholder="Medio alto" />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ margin: 0, maxWidth: '7rem' }}>
          <span>
            Orden <span className="pista">1 = menor</span>
          </span>
          <input type="number" name="orden" required min={1} defaultValue={siguienteOrden} />
        </label>
        <label style={{ margin: 0, maxWidth: '9rem' }}>
          <span>
            Desde el puntaje <span className="pista">lo decides tú</span>
          </span>
          <input type="number" name="puntajeMinimo" required min={0} step="0.001" />
        </label>
        <label style={{ margin: 0, display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <input type="checkbox" name="esAlto" value="true" />
          <span>Es el grado alto</span>
        </label>
      </div>
      <input type="hidden" name="vigenteDesde" value={hoy} />
      <button type="submit" disabled={pendiente} style={{ justifySelf: 'start' }}>
        {pendiente ? 'Guardando…' : 'Agregar grado'}
      </button>
    </form>
  )
}

function FormularioFactor({
  modeloId,
  elementos,
}: {
  modeloId: string
  elementos: EstadoRiesgo['elementos']
}) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarFactorRiesgo,
    INICIAL,
  )
  const [elemento, setElemento] = useState('')
  const fuente = elementos.find((e) => e.id === elemento)?.fuente

  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem', maxWidth: '32rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="modeloId" value={modeloId} />

      <label style={{ margin: 0 }}>
        <span>
          Elemento de exposición{' '}
          <span className="pista">los cuatro que fija el Art. 10 Septies 1</span>
        </span>
        <select
          name="elementoId"
          required
          value={elemento}
          onChange={(e) => { setElemento(e.target.value) }}
        >
          <option value="" disabled>
            Elige…
          </option>
          {elementos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </label>
      {fuente !== undefined && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          {fuente}
        </p>
      )}

      <label style={{ margin: 0 }}>
        <span>
          Factor de riesgo <span className="pista">lo describes tú, con tu criterio</span>
        </span>
        <input name="factor" required minLength={3} />
      </label>
      <label style={{ margin: 0, maxWidth: '9rem' }}>
        <span>Peso</span>
        <input type="number" name="peso" required min={0.001} max={100} step="0.001" />
      </label>

      <button type="submit" disabled={pendiente} style={{ justifySelf: 'start' }}>
        {pendiente ? 'Guardando…' : 'Agregar factor'}
      </button>
    </form>
  )
}

function BotonSimple({
  accion,
  campos,
  texto,
  className,
}: {
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>
  campos: Record<string, string>
  texto: string
  className?: string
}) {
  const [estado, correr, pendiente] = useActionState<Resultado | null, FormData>(accion, INICIAL)
  return (
    <form action={correr} style={{ margin: 0, display: 'inline-grid', gap: '.3rem' }}>
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pendiente} {...(className === undefined ? {} : { className })}>
        {pendiente ? '…' : texto}
      </button>
      {estado !== null && !estado.ok && <span className="error pequeno">{estado.mensaje}</span>}
    </form>
  )
}

export function SeccionRiesgo({
  estado,
  puede,
  hoy,
}: {
  estado: EstadoRiesgo
  puede: boolean
  hoy: string
}) {
  const enCurso = estado.borrador ?? estado.vigente
  const editable = estado.borrador !== null

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.3rem' }}>
      {estado.anticipada && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Vista anticipada.</strong> El Cap. III Bis es exigible desde el{' '}
          {estado.exigibleDesde}; configurar desde hoy deja el modelo listo para ese día.
        </div>
      )}

      <p className="pequeno tenue" style={{ margin: 0 }}>
        VIZO ejecuta esta metodología, la documenta y la conserva — pero{' '}
        <strong>no propone factores ni ponderaciones</strong>. Decidir qué hace a un cliente más
        riesgoso, y cuánto pesa cada cosa, es criterio del obligado (Art. 10 Septies ¶1: la
        metodología se ata al contexto de cada Actividad Vulnerable). Lo que sí viene de la norma
        son los cuatro elementos de exposición y el piso de tres clasificaciones.
      </p>

      {estado.faltaParaClasificar.length > 0 && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Todavía no se puede clasificar a nadie.</strong>
          <ul className="pequeno" style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
            {estado.faltaParaClasificar.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 style={{ margin: '0 0 .5rem' }}>La escala</h3>
        {estado.escala.length === 0 ? (
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Sin grados definidos. El Art. 23 Bis pide al menos tres, y admite los intermedios que
            quieras.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Grado</th>
                  <th>Desde el puntaje</th>
                  <th>Alto</th>
                </tr>
              </thead>
              <tbody>
                {estado.escala.map((g) => (
                  <tr key={g.id}>
                    <td>{g.orden}</td>
                    <td>{g.clave}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {Number.isNaN(g.puntajeMinimo) ? (
                        <span className="error pequeno">sin corte</span>
                      ) : (
                        g.puntajeMinimo
                      )}
                    </td>
                    <td>{g.esAlto ? <span className="chip alerta">sí</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puede && (
          <div style={{ marginTop: '.8rem' }}>
            <FormularioGrado hoy={hoy} siguienteOrden={estado.escala.length + 1} />
          </div>
        )}
      </div>

      <div>
        <h3 style={{ margin: '0 0 .5rem' }}>
          La metodología{' '}
          {enCurso !== null && (
            <span className="pequeno tenue">
              versión {enCurso.version} ·{' '}
              {enCurso.estado === 'vigente' ? `vigente desde ${enCurso.vigenteDesde ?? ''}` : 'borrador'}
            </span>
          )}
        </h3>

        {enCurso === null ? (
          <>
            <p className="pequeno tenue" style={{ margin: '0 0 .6rem' }}>
              Todavía no hay ninguna versión. Al crearla eliges el método de medición del Art. 10
              Septies 1 fr. II — hoy VIZO ejecuta la suma ponderada.
            </p>
            {puede && (
              <BotonSimple
                accion={nuevoModeloRiesgo}
                campos={{ metodoMedicion: 'suma_ponderada' }}
                texto="Crear la versión 1"
              />
            )}
          </>
        ) : (
          <>
            {enCurso.factores.length === 0 ? (
              <p className="pequeno tenue" style={{ margin: '0 0 .6rem' }}>
                Sin factores. Esta tabla nace vacía a propósito y solo tú la llenas.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Elemento</th>
                      <th>Factor</th>
                      <th>Peso</th>
                      {editable && puede && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {enCurso.factores.map((f) => (
                      <tr key={f.id}>
                        <td className="pequeno">{f.elementoNombre}</td>
                        <td>{f.factor}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{f.peso}</td>
                        {editable && puede && (
                          <td>
                            <BotonSimple
                              accion={retirarFactorRiesgo}
                              campos={{ factorId: f.id }}
                              texto="Quitar"
                              className="secundario"
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {puede && editable && (
              <div style={{ marginTop: '.9rem', display: 'grid', gap: '1rem' }}>
                <FormularioFactor modeloId={enCurso.id} elementos={estado.elementos} />
                <div>
                  <BotonSimple
                    accion={activarModeloRiesgo}
                    campos={{ modeloId: enCurso.id, vigenteDesde: hoy }}
                    texto="Aprobar y poner en vigor"
                  />
                  <p className="pequeno tenue" style={{ margin: '.4rem 0 0' }}>
                    Al aprobarla queda tu nombre y la hora. Después los factores se congelan: para
                    cambiarlos se crea una versión nueva, y el histórico conserva con cuál se
                    clasificó a cada cliente.
                  </p>
                </div>
              </div>
            )}

            {puede && !editable && (
              <div style={{ marginTop: '.9rem' }}>
                <BotonSimple
                  accion={nuevoModeloRiesgo}
                  campos={{ metodoMedicion: 'suma_ponderada' }}
                  texto={`Crear la versión ${String(enCurso.version + 1)}`}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
