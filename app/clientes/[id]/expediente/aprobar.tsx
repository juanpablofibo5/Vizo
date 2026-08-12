'use client'

import { useActionState } from 'react'
import { accionAprobarExpediente, type EstadoAprobacion } from './acciones'

/**
 * El botón de aprobar el expediente.
 *
 * El texto pesa tanto como el botón. Aprobar un expediente no es marcar una
 * casilla: es declarar que el conocimiento del cliente sirve — que la
 * identificación es de quien dice ser, que el comprobante corresponde al
 * domicilio, que el beneficiario controlador está bien determinado. Ninguna de
 * esas cosas las puede comprobar el sistema, y por eso hace falta una persona.
 *
 * `puede` refleja lo que la base haría, no lo que la pantalla decide: un
 * capturista ve el botón apagado porque `app.expediente_aprobar` lo rechazaría.
 */
export function BotonAprobarExpediente({
  expedienteId,
  clienteId,
  esAdmin,
  completo,
}: {
  expedienteId: string
  clienteId: string
  esAdmin: boolean
  completo: boolean
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAprobacion | null, FormData>(
    accionAprobarExpediente,
    null,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.7rem' }}>
      <input type="hidden" name="expedienteId" value={expedienteId} />
      <input type="hidden" name="clienteId" value={clienteId} />

      {estado !== null && (
        <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
      )}

      <p className="pequeno" style={{ margin: 0 }}>
        Al aprobar declaras que revisaste este expediente y que los documentos
        corresponden al cliente. Tu nombre y la hora quedan en la bitácora, y no se
        puede deshacer.
      </p>

      <button type="submit" disabled={!esAdmin || !completo || pendiente}>
        {pendiente ? 'Registrando aprobación…' : 'Aprobar expediente'}
      </button>

      {!completo && (
        <span className="tenue pequeno">
          Faltan requisitos por cubrir. Un expediente incompleto no se aprueba.
        </span>
      )}
      {completo && !esAdmin && (
        <span className="tenue pequeno">
          Solo un administrador aprueba. La regla la aplica la base de datos.
        </span>
      )}
    </form>
  )
}
