'use client'

import { useActionState } from 'react'
import {
  declararRelacion,
  registrarRevisionAnual,
  type EstadoRevision,
} from './acciones'

/**
 * La revisión anual del Art. 21.
 *
 * Dos preguntas distintas, deliberadamente separadas:
 *
 * 1. **¿Hay Relación de negocios con este cliente?** Decide si el ciclo anual
 *    aplica. La responde el obligado porque es una calificación jurídica —Art. 3
 *    fr. XIV: «formal y habitual», excluyendo lo ocasional— y no un conteo de
 *    operaciones que el sistema pudiera hacer solo. La definición se enseña
 *    completa: preguntar sin ella sería pedir una respuesta a ciegas.
 *
 * 2. **¿Sigue en orden?** Es la verificación, y solo se puede registrar si el
 *    expediente está completo HOY. Un botón que se dejara pulsar igual
 *    convertiría una obligación anual en un clic, y dejaría por escrito que
 *    alguien revisó lo que no revisó.
 */

const INICIAL: EstadoRevision = { ok: null, mensaje: '' }

export function SeccionRevisionAnual({
  clienteId,
  expedienteId,
  relacionNegocios,
  verificadoEn,
  venceEn,
  aprobado,
  puede,
}: {
  clienteId: string
  expedienteId: string
  relacionNegocios: boolean | null
  verificadoEn: string | null
  venceEn: string | null
  aprobado: boolean
  puede: boolean
}) {
  const [relacion, accionRelacion, guardandoRelacion] = useActionState<EstadoRevision, FormData>(
    declararRelacion,
    INICIAL,
  )
  const [revision, accionRevision, verificando] = useActionState<EstadoRevision, FormData>(
    registrarRevisionAnual,
    INICIAL,
  )

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.2rem' }}>
      <div>
        <h3 style={{ marginTop: 0 }}>Relación de negocios</h3>
        <p className="pequeno tenue" style={{ margin: '0 0 .8rem' }}>
          El Acuerdo 115/2026 la define como la establecida{' '}
          <strong>de manera formal y habitual</strong>, y excluye expresamente{' '}
          <strong>los actos u operaciones que se celebren ocasionalmente</strong> (Art. 3, fracción
          XIV). Si la hay, el expediente se revisa al menos una vez al año.
        </p>

        {relacion.ok !== null && (
          <div className={relacion.ok ? 'exito' : 'error'}>{relacion.mensaje}</div>
        )}

        <form action={accionRelacion} style={{ display: 'grid', gap: '.7rem', maxWidth: '26rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />
          <label style={{ margin: 0 }}>
            <span>¿Con este cliente hay Relación de negocios?</span>
            <select
              name="hay"
              defaultValue={relacionNegocios === null ? '' : String(relacionNegocios)}
              disabled={!puede}
              required
            >
              <option value="" disabled>
                Sin declarar
              </option>
              <option value="true">Sí, es formal y habitual</option>
              <option value="false">No, son actos ocasionales</option>
            </select>
          </label>
          <button type="submit" className="secundario" disabled={!puede || guardandoRelacion}>
            {guardandoRelacion ? 'Guardando…' : 'Guardar'}
          </button>
        </form>

        {relacionNegocios === null && (
          <p className="pequeno tenue" style={{ margin: '.6rem 0 0' }}>
            Mientras no se responda, este expediente no entra al ciclo anual. No es que no le toque:
            es que todavía no se sabe.
          </p>
        )}
      </div>

      {relacionNegocios === true && (
        <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1.1rem' }}>
          <h3 style={{ marginTop: 0 }}>Revisión anual</h3>

          <div className="rejilla" style={{ gap: '.9rem', marginBottom: '.9rem' }}>
            <div>
              <span className="tenue pequeno">Última revisión</span>
              <div className="mono">
                {verificadoEn ?? <span className="tenue">nunca — corre desde la aprobación</span>}
              </div>
            </div>
            <div>
              <span className="tenue pequeno">Vence</span>
              <div className="mono">{venceEn ?? '—'}</div>
            </div>
          </div>

          {revision.ok !== null && (
            <div className={revision.ok ? 'exito' : 'error'}>{revision.mensaje}</div>
          )}

          {!aprobado ? (
            <p className="pequeno tenue" style={{ margin: 0 }}>
              La revisión anual reafirma un expediente ya aprobado. Este todavía no lo está.
            </p>
          ) : (
            <form action={accionRevision}>
              <input type="hidden" name="clienteId" value={clienteId} />
              <input type="hidden" name="expedienteId" value={expedienteId} />
              <button type="submit" disabled={!puede || verificando}>
                {verificando ? 'Revisando…' : 'Registrar la revisión de este año'}
              </button>
              <p className="pequeno tenue" style={{ margin: '.6rem 0 0' }}>
                Antes de registrarla, VIZO vuelve a calcular la completitud con las reglas de hoy. Si
                algo falta o caducó, no se registra y te dice qué.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
