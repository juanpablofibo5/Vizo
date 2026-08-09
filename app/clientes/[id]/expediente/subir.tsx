'use client'

import { useActionState } from 'react'
import { subirDocumento, type EstadoSubida } from './acciones'

const INICIAL: EstadoSubida = { problemas: [] }

export interface CampoPendiente {
  campo: string
  etiqueta: string
}

export function FormularioSubida({
  clienteId,
  expedienteId,
  campos,
}: {
  clienteId: string
  expedienteId: string
  campos: CampoPendiente[]
}) {
  const [estado, accion, enviando] = useActionState(subirDocumento, INICIAL)

  return (
    <form action={accion} className="tarjeta">
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="expedienteId" value={expedienteId} />

      {estado.problemas.length > 0 && (
        <div className="error">
          <ul>
            {estado.problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {estado.ultimoHash !== undefined && (
        <div className="aviso">
          Documento registrado. Su huella SHA-256:
          <code className="hash">{estado.ultimoHash}</code>
          Es lo que permite demostrar, dentro de diez años, que el archivo no cambió.
        </div>
      )}

      <div className="fila">
        <label>
          <span>Qué documento es</span>
          <select name="campo" required defaultValue={campos[0]?.campo ?? ''}>
            {campos.map((c) => (
              <option key={c.campo} value={c.campo}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Archivo <span className="pista">(PDF, JPEG, PNG o WebP · máx. 20 MB)</span>
          </span>
          <input type="file" name="archivo" accept=".pdf,.jpg,.jpeg,.png,.webp" required />
        </label>
      </div>

      <button type="submit" disabled={enviando || campos.length === 0}>
        {enviando ? 'Calculando huella y guardando…' : 'Subir documento'}
      </button>
    </form>
  )
}
