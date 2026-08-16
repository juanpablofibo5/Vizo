'use client'

import { useActionState } from 'react'
import type { EstadoRec } from '../../src/persistencia/rec'
import {
  guardarDesignacionRec,
  guardarRespuestaRec,
  guardarSustitucionRec,
  guardarTipoPersona,
  type Resultado,
} from './acciones'

/**
 * El Representante Encargado de Cumplimiento.
 *
 * Esta pantalla existe para decir una cosa que un campo de texto no puede: que
 * **designar no es tener REC**. El Art. 20 de la LFPIORPI, párrafo 2, deja el
 * cumplimiento en manos del órgano de administración «en tanto no haya» REC
 * **o la designación no sea aceptada** — los dos casos, la misma consecuencia.
 *
 * Por eso una designación pendiente se pinta como advertencia y no como
 * progreso, y por eso el texto nombra a quién le toca mientras tanto. Un
 * palomeado gris diciendo «designado» sería técnicamente cierto y prácticamente
 * una mentira.
 */

const ETIQUETA_TIPO: Record<string, string> = {
  fisica: 'Persona física',
  moral: 'Persona moral',
  fideicomiso: 'Fideicomiso u otra figura jurídica',
}

function Mensaje({ estado }: { estado: Resultado | null }) {
  if (estado === null) return null
  return <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
}

function FormularioTipoPersona({ valor, puede }: { valor: string | null; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarTipoPersona,
    null,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '26rem' }}>
      <Mensaje estado={estado} />

      <label style={{ margin: 0 }}>
        <span>
          Clase de persona del obligado{' '}
          <span className="pista">decide si hay que designar REC</span>
        </span>
        <select name="tipoPersona" defaultValue={valor ?? ''} disabled={!puede} required>
          <option value="" disabled>
            Selecciona…
          </option>
          <option value="fisica">Persona física</option>
          <option value="moral">Persona moral</option>
          <option value="fideicomiso">Fideicomiso u otra figura jurídica</option>
        </select>
      </label>

      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

function FormularioDesignar({ puede }: { puede: boolean }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarDesignacionRec,
    null,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '30rem' }}>
      <Mensaje estado={estado} />

      <label style={{ margin: 0 }}>
        <span>Nombre de la persona designada</span>
        <input type="text" name="nombre" disabled={!puede} required />
      </label>

      <label style={{ margin: 0 }}>
        <span>
          RFC <span className="pista">de persona física, 13 caracteres</span>
        </span>
        <input
          type="text"
          name="rfc"
          className="mono"
          maxLength={13}
          disabled={!puede}
          required
        />
      </label>

      <label style={{ margin: 0 }}>
        <span>
          Fecha de la designación{' '}
          <span className="pista">cuando se hizo ante el SAT, no hoy</span>
        </span>
        <input type="date" name="fechaDesignacion" disabled={!puede} required />
      </label>

      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Registrando…' : 'Registrar designación'}
      </button>
    </form>
  )
}

function FormularioRespuesta({ designacionId, puede }: { designacionId: string; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarRespuestaRec,
    null,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '30rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="designacionId" value={designacionId} />

      <label style={{ margin: 0 }}>
        <span>Qué respondió la persona designada en el Portal del SAT</span>
        <select name="respuesta" defaultValue="aceptada" disabled={!puede}>
          <option value="aceptada">Aceptó la designación</option>
          <option value="rechazada">La rechazó</option>
        </select>
      </label>

      <label style={{ margin: 0 }}>
        <span>Fecha de la respuesta</span>
        <input type="date" name="fechaRespuesta" disabled={!puede} required />
      </label>

      <label style={{ margin: 0 }}>
        <span>
          Fecha en que el SAT te notificó{' '}
          <span className="pista">opcional — tiene diez días hábiles para hacerlo</span>
        </span>
        <input type="date" name="fechaNotificacionSat" disabled={!puede} />
      </label>

      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Registrando…' : 'Registrar la respuesta'}
      </button>
    </form>
  )
}

function FormularioSustituir({ designacionId, puede }: { designacionId: string; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarSustitucionRec,
    null,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="designacionId" value={designacionId} />
      <button type="submit" className="secundario" disabled={!puede || pendiente}>
        {pendiente ? 'Registrando…' : 'Esta persona dejó el cargo'}
      </button>
    </form>
  )
}

export function SeccionRec({ estado, puede }: { estado: EstadoRec; puede: boolean }) {
  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.3rem' }}>
      <div>
        <div className="tenue pequeno">Clase de persona</div>
        <div style={{ fontWeight: 560, marginBottom: '.9rem' }}>
          {estado.tipoPersona === null ? (
            <span className="tenue">Sin registrar</span>
          ) : (
            ETIQUETA_TIPO[estado.tipoPersona]
          )}
        </div>
        <FormularioTipoPersona valor={estado.tipoPersona} puede={puede} />
      </div>

      {estado.tipoPersona === null && (
        <div className="aviso">
          Hasta saber esto, VIZO no puede decirte si te falta designar un Representante Encargado de
          Cumplimiento. La Ley se lo exige a las personas morales y a las figuras jurídicas; a una
          persona física, no.
        </div>
      )}

      {estado.tipoPersona === 'fisica' && (
        <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1.1rem' }}>
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Una persona física que realiza la Actividad Vulnerable responde ella misma de las
            obligaciones y no designa REC (Art. 20 de la Ley, párrafo 1). No hay nada que registrar
            aquí.
          </p>
        </div>
      )}

      {estado.aplica && (
        <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1.1rem' }}>
          <h3 style={{ marginTop: 0 }}>Representante Encargado de Cumplimiento</h3>

          {estado.vigente !== null ? (
            <>
              <div className="rejilla" style={{ gap: '.9rem', marginBottom: '1rem' }}>
                <div>
                  <span className="tenue pequeno">Persona designada</span>
                  <div style={{ fontWeight: 560 }}>{estado.vigente.nombre}</div>
                </div>
                <div>
                  <span className="tenue pequeno">RFC</span>
                  <div className="mono">{estado.vigente.rfc}</div>
                </div>
                <div>
                  <span className="tenue pequeno">Aceptó el</span>
                  <div className="mono">{estado.vigente.fechaRespuesta}</div>
                </div>
                <div>
                  <span className="tenue pequeno">Estado</span>
                  <div>
                    <span className="estado ok">Designación completa</span>
                  </div>
                </div>
              </div>
              <FormularioSustituir designacionId={estado.vigente.id} puede={puede} />
            </>
          ) : estado.pendiente !== null ? (
            <>
              <div className="aviso">
                <strong>{estado.pendiente.nombre}</strong> fue designada el{' '}
                <span className="mono">{estado.pendiente.fechaDesignacion}</span> y todavía no
                responde. Mientras no acepte en el Portal del SAT, el cumplimiento de las
                obligaciones recae en los integrantes del órgano de administración o en quien funja
                como administrador único (Art. 20 de la Ley, párrafo 2).
              </div>
              <p className="pequeno tenue" style={{ margin: '.8rem 0 1rem' }}>
                La persona designada acepta o rechaza entrando al Portal del SAT con su propio RFC y
                su e.firma. VIZO no puede hacerlo por ella: aquí solo se registra qué respondió.
              </p>
              <FormularioRespuesta designacionId={estado.pendiente.id} puede={puede} />
            </>
          ) : (
            <>
              {estado.rechazada !== null && (
                <div className="error">
                  La designación de <strong>{estado.rechazada.nombre}</strong> fue rechazada el{' '}
                  <span className="mono">{estado.rechazada.fechaRespuesta}</span>. El rechazo no
                  libera al obligado de ninguna de sus obligaciones (Art. 10 del Acuerdo 115/2026):
                  hay que designar a alguien más.
                </div>
              )}
              <p className="pequeno tenue" style={{ margin: '.6rem 0 1rem' }}>
                Sin REC aceptado, las obligaciones de la Ley recaen personalmente en el órgano de
                administración. Exigible desde el 30 de noviembre de 2026.
              </p>
              <FormularioDesignar puede={puede} />
            </>
          )}
        </div>
      )}

      {!puede && (
        <span className="tenue pequeno">
          Solo un administrador cambia la configuración del obligado.
        </span>
      )}
    </div>
  )
}
