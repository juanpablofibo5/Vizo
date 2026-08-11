'use client'

import { useActionState } from 'react'
import { guardarFechaAlta, type Resultado } from './acciones'

/**
 * El dato más consecuente de la configuración.
 *
 * De la fecha de alta depende desde cuándo VIZO reclama informes en cero. El
 * texto lo dice antes de que alguien la escriba: sin ella el sistema cubre
 * menos de lo que debería, y con una fecha equivocada reclama meses que no
 * tocan.
 */
export function FormularioFechaAlta({
  valor,
  puede,
}: {
  valor: string | null
  puede: boolean
}) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarFechaAlta,
    null,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '26rem' }}>
      {estado !== null && <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>}

      {valor === null && (
        <div className="aviso">
          Sin esta fecha, los periodos pendientes se cuentan desde la primera operación
          registrada. Un mes en el que no operaste también debe su informe en cero.
        </div>
      )}

      <label style={{ margin: 0 }}>
        <span>
          Fecha de alta y registro ante el SAT{' '}
          <span className="pista">no es la fecha en que empezaste a usar VIZO</span>
        </span>
        <input
          type="date"
          name="fechaAlta"
          defaultValue={valor ?? ''}
          disabled={!puede}
          required
        />
      </label>

      <button type="submit" disabled={!puede || pendiente}>
        {pendiente ? 'Guardando…' : 'Guardar fecha de alta'}
      </button>

      {!puede && (
        <span className="tenue pequeno">
          Solo un administrador cambia la configuración del obligado.
        </span>
      )}
    </form>
  )
}
