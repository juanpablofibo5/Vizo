'use client'

import { useActionState, useState } from 'react'
import { subirDocumento, type EstadoSubida } from './acciones'

const INICIAL: EstadoSubida = { problemas: [] }

export interface CampoPendiente {
  campo: string
  etiqueta: string
  /**
   * Meses de antigüedad máxima que el catálogo le exige a ESTE documento.
   *
   * Hoy solo el comprobante de domicilio, desde el 30 de noviembre de 2026
   * (Art. 21 del Acuerdo 115/2026). Viene del catálogo, así que el día que otro
   * documento la necesite este formulario ya lo sabe pedir.
   */
  antiguedadMaximaMeses?: number | undefined
  /** Por qué está pendiente: `vencido` y `ausente` piden cosas distintas. */
  motivo?: 'ausente' | 'vencido' | 'sin_fecha_emision' | undefined
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
  const [elegido, setElegido] = useState(campos[0]?.campo ?? '')

  const campo = campos.find((c) => c.campo === elegido)
  const meses = campo?.antiguedadMaximaMeses

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
          <select
            name="campo"
            required
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
          >
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

      {/* La fecha de emisión solo se pide donde el catálogo la exige. Pedirla
          siempre convertiría en obligatorio un dato que la Ley no pide para
          casi ningún documento, y la gente aprendería a inventarlo. */}
      {meses !== undefined && (
        <label>
          <span>
            Fecha de emisión del documento{' '}
            <span className="pista">
              no puede tener más de {meses} {meses === 1 ? 'mes' : 'meses'} · Art. 21 del Acuerdo
              115/2026
            </span>
          </span>
          <input type="date" name="fechaEmision" required />
        </label>
      )}

      {campo?.motivo === 'vencido' && (
        <div className="aviso">
          El comprobante que está en el expediente sí existe, pero ya rebasó los {meses} meses. Hay
          que pedir uno nuevo: no es un error de captura.
        </div>
      )}
      {campo?.motivo === 'sin_fecha_emision' && (
        <div className="aviso">
          El documento está en el expediente y no dice de cuándo es, así que no se puede afirmar que
          cumpla. Súbelo de nuevo con su fecha de emisión.
        </div>
      )}

      <button type="submit" disabled={enviando || campos.length === 0}>
        {enviando ? 'Calculando huella y guardando…' : 'Subir documento'}
      </button>
    </form>
  )
}
