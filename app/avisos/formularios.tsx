'use client'

import { useActionState } from 'react'
import {
  accionAprobar,
  accionCorregir,
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
      {/* SECUNDARIO, y no primario: en la lista de periodos este botón se
          repite en cada renglón, y cinco botones naranjas apilados gastan el
          único color de acción que tiene el portal. El primario se reserva
          para la acción de la pantalla —«Dar de alta», «Registrar»—, no para
          la que se repite. La acción sigue siendo la misma. */}
      <button type="submit" className="secundario" disabled={!puede || pendiente}>
        {pendiente ? 'Generando…' : 'Generar aviso'}
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
          Folio del acuse <span className="pista">como viene, por ejemplo 2026-12345</span>
        </span>
        <input type="text" name="folio" placeholder="2026-12345" disabled={!puede} />
      </label>
      {/* El folio no es burocracia: es lo ÚNICO que identifica este aviso ante
          la autoridad, y sin él no se puede presentar un modificatorio el día
          que haya que corregirlo. */}
      <span className="tenue pequeno" style={{ marginTop: '-.3rem' }}>
        Sin el folio no se podrá corregir este aviso más adelante.
      </span>
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


export function FormularioCorregir({ avisoId, puede }: { avisoId: string; puede: boolean }) {
  const [estado, accion, pendiente] = useActionState(accionCorregir, null)
  return (
    <form action={accion} style={{ display: 'grid', gap: '.7rem' }}>
      <input type="hidden" name="avisoId" value={avisoId} />
      <Mensaje estado={estado} />
      <p className="pequeno" style={{ margin: 0 }}>
        El aviso que ya presentaste <strong>no se modifica</strong>: se genera otro archivo
        que dice cuál corrige, por su folio. Los dos quedan, que es lo que la autoridad
        necesita para reconciliarlos.
      </p>
      <label style={{ margin: 0 }}>
        <span>
          Qué se corrige <span className="pista">va dentro del archivo</span>
        </span>
        <textarea
          name="descripcion"
          rows={3}
          placeholder="El monto de la aportación se capturó con un dígito de más"
          disabled={!puede}
        />
      </label>
      <button type="submit" className="secundario" disabled={!puede || pendiente}>
        {pendiente ? 'Generando y validando…' : 'Generar aviso modificatorio'}
      </button>
    </form>
  )
}
