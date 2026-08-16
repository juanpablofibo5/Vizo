'use client'

import { useActionState } from 'react'
import { guardarDatos, type EstadoDatos } from './acciones'
import { PARTES_DEL_DOMICILIO } from '../../../../src/persistencia/datos-expediente'

const INICIAL: EstadoDatos | null = null

export interface CampoPendiente {
  campo: string
  etiqueta: string
  tipoDato: 'texto' | 'fecha' | 'catalogo' | 'numero'
  /** Códigos del catálogo del SAT, cuando el campo es de tipo catálogo. */
  opciones?: Array<{ codigo: string; descripcion: string }> | undefined
  /** La columna destino es `jsonb`: el dato se captura por partes. */
  compuesto: boolean
}

/**
 * Los datos que no se resuelven subiendo un archivo.
 *
 * El formulario no tiene campos escritos a mano: recibe los que faltan y los
 * pinta según su `tipoDato`. Si mañana el catálogo exige uno más, aparece solo
 * — la misma propiedad que la prueba X-01 demostró para el motor, aplicada a
 * la pantalla.
 */
export function FormularioDatos({
  clienteId,
  expedienteId,
  pendientes,
}: {
  clienteId: string
  expedienteId: string
  pendientes: CampoPendiente[]
}) {
  const [estado, accion, enviando] = useActionState(guardarDatos, INICIAL)

  if (pendientes.length === 0) return null

  return (
    <form action={accion} className="tarjeta" style={{ marginBottom: '1.5rem' }}>
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="expedienteId" value={expedienteId} />

      <h3>Faltan datos de captura</h3>
      <p className="tenue pequeno" style={{ margin: '0 0 .9rem' }}>
        No se resuelven subiendo un archivo: el catálogo los pide como dato del cliente. Los
        capturas aquí y la completitud se recalcula al guardar.
      </p>

      {estado !== null && (
        <div className={estado.ok ? 'exito' : 'error'} style={{ marginBottom: '.9rem' }}>
          {estado.mensaje}
        </div>
      )}

      {/* Los compuestos van en su propio bloque: seis campos dentro de la
          rejilla común se leerían como seis requisitos distintos, y son uno. */}
      {pendientes
        .filter((p) => p.compuesto)
        .map((p) => (
          <fieldset key={p.campo}>
            <legend>{p.etiqueta}</legend>
            <div className="fila">
              {PARTES_DEL_DOMICILIO.map((parte) => (
                <label key={parte.clave}>
                  <span>{parte.etiqueta}</span>
                  <input
                    name={`${p.campo}.${parte.clave}`}
                    required={parte.obligatoria}
                    {...(parte.pista === '' ? {} : { placeholder: parte.pista })}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}

      <div className="fila">
        {pendientes.filter((p) => !p.compuesto).map((p) => (
          <label key={p.campo}>
            <span>{p.etiqueta}</span>
            {p.tipoDato === 'catalogo' && p.opciones !== undefined ? (
              <select name={p.campo} defaultValue="">
                <option value="">Elige…</option>
                {p.opciones.map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.descripcion}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={p.campo}
                type={p.tipoDato === 'fecha' ? 'date' : p.tipoDato === 'numero' ? 'number' : 'text'}
              />
            )}
          </label>
        ))}
      </div>

      <button type="submit" disabled={enviando} style={{ marginTop: '.4rem' }}>
        {enviando ? 'Guardando…' : 'Guardar datos'}
      </button>
    </form>
  )
}
