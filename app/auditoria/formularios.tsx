'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { NOMBRE_DEL_ROL, type RolCapacitacion } from '../../src/dominio/capacitacion'
import { REQUISITOS_DEL_AUDITOR_EXTERNO } from '../../src/dominio/auditoria'
import {
  accionAbrirPeriodo,
  accionDesignarAuditorExterno,
  accionDesignarAuditorInterno,
  accionSustituirAuditor,
  type Resultado,
} from './acciones'

/**
 * Los cuatro formularios del Cap. XIV, Fase 1.
 *
 * Mismo patrón que `app/capacitacion/formularios.tsx`: `useActionState` para
 * el ciclo de la Server Action, `useRepintado` para no perder lo tecleado
 * cuando la base rechaza, y cliente solo donde hace falta estado del
 * navegador (la huella del acreditamiento externo, igual que en capacitación).
 */

const INICIAL: Resultado = { ok: null, mensaje: '' }

/** Repintar lo capturado tras un error. Idéntico a capacitacion/formularios.tsx. */
function useRepintado(estado: Resultado): { clave: string; texto: (campo: string) => string } {
  const intento = useRef(0)
  const [clave, setClave] = useState('form-0')

  useEffect(() => {
    if (estado.ok !== false) return
    intento.current += 1
    setClave(`form-${String(intento.current)}`)
  }, [estado])

  const texto = useCallback(
    (campo: string): string => {
      const v = estado.valores?.[campo]
      return typeof v === 'string' ? v : ''
    },
    [estado],
  )

  return { clave, texto }
}

function Mensaje({ estado }: { estado: Resultado }) {
  if (estado.ok === null) return null
  return <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
}

/**
 * Abre el periodo del año `anio` (Arts. 42/43). No hay ningún dato que
 * capturar —la persistencia decide sola el periodo, la ruta y la fecha
 * límite—, así que es un botón, no un formulario con campos.
 */
export function FormularioAbrirPeriodo({ anio, puede }: { anio: number; puede: boolean }) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionAbrirPeriodo,
    INICIAL,
  )
  const { clave } = useRepintado(estado)

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.6rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="anio" value={anio} />
      <button type="submit" disabled={!puede || guardando}>
        {guardando ? 'Abriendo…' : `Abrir el periodo ${String(anio)}`}
      </button>
    </form>
  )
}

export function FormularioDesignarAuditorInterno({
  periodoId,
  plantilla,
  puede,
}: {
  periodoId: string
  plantilla: readonly { id: string; nombre: string; rol: RolCapacitacion }[]
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionDesignarAuditorInterno,
    INICIAL,
  )
  const { clave, texto } = useRepintado(estado)

  if (plantilla.length === 0) {
    return (
      <p className="pequeno tenue" style={{ margin: 0 }}>
        La plantilla del Cap. XII está vacía. Sin nadie ahí no hay a quién designar como auditor
        interno.
      </p>
    )
  }

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.7rem', maxWidth: '26rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="periodoId" value={periodoId} />
      <label style={{ margin: 0 }}>
        <span>Persona de la plantilla</span>
        <select name="personaId" defaultValue={texto('personaId') || plantilla[0]?.id} disabled={!puede}>
          {plantilla.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} · {NOMBRE_DEL_ROL[p.rol]}
            </option>
          ))}
        </select>
      </label>
      <p className="pequeno tenue" style={{ margin: 0 }}>
        VIZO comprueba al designar que no sea la persona REC y que tenga al menos una acreditación
        de capacitación del Cap. XII (Art. 44).
      </p>
      <button type="submit" className="secundario" disabled={!puede || guardando}>
        {guardando ? 'Designando…' : 'Designar auditor interno'}
      </button>
    </form>
  )
}

export function FormularioDesignarAuditorExterno({
  periodoId,
  puede,
}: {
  periodoId: string
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionDesignarAuditorExterno,
    INICIAL,
  )
  const { clave, texto } = useRepintado(estado)
  const [hash, setHash] = useState('')

  useEffect(() => {
    if (estado.ok === false) setHash(texto('acreditaHash'))
  }, [estado, texto])

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '1rem', maxWidth: '38rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="periodoId" value={periodoId} />

      <div className="rejilla" style={{ gap: '.8rem' }}>
        <label style={{ margin: 0 }}>
          <span>Nombre</span>
          <input type="text" name="nombre" defaultValue={texto('nombre')} disabled={!puede} required />
        </label>
        <label style={{ margin: 0 }}>
          <span>
            Profesión <span className="pista">inciso a)</span>
          </span>
          <input
            type="text"
            name="profesion"
            defaultValue={texto('profesion')}
            disabled={!puede}
            required
          />
        </label>
      </div>

      <div className="rejilla" style={{ gap: '.8rem' }}>
        <label style={{ margin: 0 }}>
          <span>Cédula profesional</span>
          <input
            type="text"
            name="cedulaProfesional"
            className="mono"
            defaultValue={texto('cedulaProfesional')}
            disabled={!puede}
            required
          />
        </label>
        <label style={{ margin: 0 }}>
          <span>
            Años de experiencia en PLD <span className="pista">inciso a)</span>
          </span>
          <input
            type="number"
            name="aniosExperiencia"
            min={0}
            max={70}
            defaultValue={texto('aniosExperiencia')}
            disabled={!puede}
            required
          />
        </label>
      </div>

      <div className="rejilla" style={{ gap: '.8rem' }}>
        <label style={{ margin: 0 }}>
          <span>
            Folio de la certificación UIF <span className="pista">inciso b)</span>
          </span>
          <input
            type="text"
            name="certificacionUifFolio"
            className="mono"
            defaultValue={texto('certificacionUifFolio')}
            disabled={!puede}
            required
          />
        </label>
        <label style={{ margin: 0 }}>
          <span>Vigente hasta</span>
          <input
            type="date"
            name="certificacionUifVence"
            defaultValue={texto('certificacionUifVence')}
            disabled={!puede}
            required
          />
        </label>
      </div>

      <label style={{ margin: 0 }}>
        <span>
          Huella del documento que acredita a la persona{' '}
          <span className="pista">SHA-256 · opcional</span>
        </span>
        <input
          type="text"
          name="acreditaHash"
          className="mono pequeno"
          value={hash}
          onChange={(e) => { setHash(e.target.value.trim()) }}
          disabled={!puede}
        />
      </label>

      {hash !== '' && (
        <label style={{ margin: 0 }}>
          <span>Nombre del archivo</span>
          <input
            type="text"
            name="acreditaArchivo"
            defaultValue={texto('acreditaArchivo')}
            disabled={!puede}
          />
        </label>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '.45rem' }}>
        <legend className="pequeno" style={{ padding: 0, marginBottom: '.2rem' }}>
          Declaraciones del Art. 45 <span className="pista">marca solo lo que la persona declaró</span>
        </legend>
        {[
          ['sinSentenciaPatrimonial', 'c) No ha sido sentenciada por delitos patrimoniales'],
          [
            'sinServiciosPreviosEnConflicto',
            'd) No ha prestado servicios previos al auditado que generen conflicto de interés',
          ],
          [
            'sinCargoRecEnVeda',
            'e) No ha aceptado el cargo de Representante Encargada de Cumplimiento del auditado ' +
              'durante el periodo auditado ni los dos años posteriores',
          ],
        ].map(([campo, dice]) => (
          <label key={campo} className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
            <input type="checkbox" name={campo} value="si" disabled={!puede} />
            <span>{dice}</span>
          </label>
        ))}
      </fieldset>

      <div className="pequeno tenue" style={{ display: 'grid', gap: '.25rem' }}>
        <span>Los cinco incisos del Art. 45:</span>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {REQUISITOS_DEL_AUDITOR_EXTERNO.map((r) => (
            <li key={r.inciso}>
              {r.inciso}) {r.resumen}
            </li>
          ))}
        </ul>
      </div>

      <button type="submit" disabled={!puede || guardando}>
        {guardando ? 'Designando…' : 'Designar persona auditora externa'}
      </button>
    </form>
  )
}

/**
 * Sustituir al auditor vigente. El motivo es obligatorio: la base lo exige
 * (`sustitucion_completa`) y es lo único que distingue una sustitución de un
 * borrado — un hecho no se borra, se sustituye.
 */
export function FormularioSustituirAuditor({
  auditorId,
  puede,
}: {
  auditorId: string
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionSustituirAuditor,
    INICIAL,
  )
  const { clave, texto } = useRepintado(estado)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button
        type="button"
        className="secundario pequeno"
        onClick={() => { setAbierto(true) }}
        disabled={!puede}
      >
        Sustituir
      </button>
    )
  }

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.5rem', maxWidth: '30rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="auditorId" value={auditorId} />
      <label style={{ margin: 0 }}>
        <span className="pequeno">Motivo de la sustitución</span>
        <input type="text" name="motivo" defaultValue={texto('motivo')} disabled={!puede} required />
      </label>
      <button type="submit" className="secundario pequeno" disabled={!puede || guardando}>
        {guardando ? 'Sustituyendo…' : 'Confirmar sustitución'}
      </button>
    </form>
  )
}
