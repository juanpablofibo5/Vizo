'use client'

import { useActionState } from 'react'
import {
  accionAprobar,
  accionGenerar,
  accionListoRevision,
  accionRegistrarAcuse,
  type Resultado,
} from './acciones'

function Mensaje({ estado }: { estado: Resultado | null }) {
  if (estado === null) return null
  return <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
}

/**
 * Los botones del pipeline.
 *
 * `deshabilitado` refleja lo que la base haría, no lo que la pantalla decide.
 * Un capturista ve el botón de aprobar apagado porque `app.aviso_aprobar` lo
 * rechazaría — no al revés. Si algún día divergen, la que manda es la base y
 * esto es el bug.
 */

export function BotonGenerar({
  periodo,
  actividadId,
  puede,
}: {
  periodo: string
  actividadId: string
  puede: boolean
}) {
  const [estado, accion, pendiente] = useActionState(accionGenerar, null)
  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem' }}>
      <input type="hidden" name="periodo" value={periodo} />
      <input type="hidden" name="actividadId" value={actividadId} />
      <Mensaje estado={estado} />
      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Generando y validando…' : 'Generar aviso del periodo'}
      </button>
      {!puede && (
        <span className="tenue pequeno">Generar el aviso es una acción de administrador.</span>
      )}
    </form>
  )
}

export function BotonListoRevision({ avisoId, puede }: { avisoId: string; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionListoRevision, null)
  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem' }}>
      <input type="hidden" name="avisoId" value={avisoId} />
      <Mensaje estado={estado} />
      <button type="submit" className="secundario" disabled={!puede || pendiente}>
        {pendiente ? 'Enviando…' : 'Marcar listo para revisión'}
      </button>
    </form>
  )
}

export function BotonAprobar({ avisoId, puede }: { avisoId: string; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionAprobar, null)
  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem' }}>
      <input type="hidden" name="avisoId" value={avisoId} />
      <Mensaje estado={estado} />
      {/* El texto dice el peso del acto. Aprobar no es guardar: es firmar. */}
      <p className="pequeno" style={{ margin: 0 }}>
        Al aprobar declaras que revisaste este aviso. Tu nombre y la hora quedan en la
        bitácora, y no se puede deshacer.
      </p>
      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Registrando aprobación…' : 'Aprobar aviso'}
      </button>
      {!puede && (
        <span className="tenue pequeno">
          Solo un administrador aprueba. La regla la aplica la base de datos.
        </span>
      )}
    </form>
  )
}

export function FormularioAcuse({ avisoId, puede }: { avisoId: string; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionRegistrarAcuse, null)
  return (
    <form action={accion} style={{ display: 'grid', gap: '.7rem' }}>
      <input type="hidden" name="avisoId" value={avisoId} />
      <Mensaje estado={estado} />
      <label style={{ margin: 0 }}>
        <span>
          Acuse del SPPLD <span className="pista">PDF que devolvió el portal</span>
        </span>
        <input type="file" name="acuse" accept="application/pdf" disabled={!puede} />
      </label>
      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Registrando…' : 'Registrar acuse'}
      </button>
    </form>
  )
}
