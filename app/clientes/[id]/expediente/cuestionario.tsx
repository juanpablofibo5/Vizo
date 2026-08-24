'use client'

import { useActionState, useState } from 'react'
import type { EstadoDelCuestionario } from '../../../../src/persistencia/cuestionario'
import { accionAplicarCuestionario, type EstadoCaptura } from './acciones'

/**
 * El cuestionario de identificación del Art. 23 Ter 3.
 *
 * Las cinco preguntas del formulario son las que el ARTÍCULO nombra, no las
 * que VIZO cree buenas: la actividad preponderante del ¶1, y el origen y
 * destino de los recursos y los actos que realiza o pretende del ¶2. Lo que el
 * obligado pregunte además vive en su Manual de Políticas Internas — el mismo
 * criterio del ADR-21 con los factores de riesgo: VIZO pone el registro, el
 * obligado pone el criterio.
 *
 * Ningún campo trae valor sugerido. Un placeholder con un ejemplo de «origen
 * de los recursos» ancla la respuesta de quien captura, y lo que se registra
 * tiene que ser lo que el cliente dijo.
 */

const INICIAL: EstadoCaptura = { ok: null, mensaje: '', problemas: [] }

export function SeccionCuestionario({
  clienteId,
  estado,
  puede,
}: {
  clienteId: string
  estado: EstadoDelCuestionario
  puede: boolean
}) {
  const [resultado, accion, guardando] = useActionState<EstadoCaptura, FormData>(
    accionAplicarCuestionario,
    INICIAL,
  )
  const [remoto, setRemoto] = useState(false)

  const exigible = estado.exigencia.estado === 'exigible'

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.1rem' }}>
      {estado.anticipado && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          El Cap. III Ter es exigible a partir de los actos del {estado.exigibleDesde}{' '}
          (Transitorio Cuarto). Aplicarlo desde hoy deja el expediente listo para ese día.
        </p>
      )}

      {estado.exigencia.estado === 'no_exigible' && (
        <p className="pequeno tenue" style={{ margin: 0, maxWidth: '42rem' }}>
          El Art. 23 Ter 3 pide el cuestionario cuando el Grado de Riesgo del cliente es{' '}
          <strong>alto</strong>, y este no lo es. No hay nada que aplicar.
        </p>
      )}

      {estado.exigencia.estado === 'indeterminable' && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Todavía no se puede saber si este cliente necesita cuestionario.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            El Art. 23 Ter 3 se dispara con el Grado de Riesgo alto, y a este cliente nadie lo ha
            clasificado. No es que no lo necesite: es que no se sabe. Clasifícalo en la sección
            02 y esta sección se resuelve sola.
          </p>
        </div>
      )}

      {exigible && (
        <>
          <p className="pequeno tenue" style={{ margin: 0, maxWidth: '42rem' }}>
            El cliente es de Grado de Riesgo alto
            {estado.exigencia.estado === 'exigible' && estado.exigencia.conGradoVencido
              ? ' —con la clasificación vencida, que no reduce la obligación—'
              : ''}
            , así que el Art. 23 Ter 3 pide mayor información sobre su actividad preponderante y
            un cuestionario sobre el origen y destino de los recursos.
          </p>

          {estado.cobertura.estado === 'sobre_otra_clasificacion' && (
            <div className="aviso" style={{ margin: 0 }}>
              <strong>El último cuestionario responde a otra clasificación.</strong>
              <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
                Se aplicó el {estado.cobertura.cuestionario.fechaAplicacion} y desde entonces el
                cliente volvió a clasificarse. El artículo <strong>no dice</strong> que una
                reclasificación obligue a repetirlo, así que VIZO no lo llama vencido: lo pone a
                la vista para que alguien decida.
              </p>
            </div>
          )}
        </>
      )}

      {estado.historial.length > 0 && (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {estado.historial.map((c) => (
            <div key={c.id} className="calculo-caja">
              <p className="calculo-titulo">
                {c.modalidad === 'remoto_digital' ? 'Remoto · digital' : 'Presencial'} ·{' '}
                {c.fechaAplicacion}
              </p>
              <dl className="calculo-pares">
                <div className="calculo-par">
                  <dt>Actividad preponderante</dt>
                  <dd>{c.actividadPreponderante}</dd>
                </div>
                <div className="calculo-par">
                  <dt>Origen de los recursos</dt>
                  <dd>{c.origenRecursos}</dd>
                </div>
                <div className="calculo-par">
                  <dt>Destino de los recursos</dt>
                  <dd>{c.destinoRecursos}</dd>
                </div>
                <div className="calculo-par">
                  <dt>Actos que realiza</dt>
                  <dd>{c.actosQueRealiza}</dd>
                </div>
                <div className="calculo-par">
                  <dt>Actos que pretende</dt>
                  <dd>{c.actosQuePretende}</dd>
                </div>
                <div className="calculo-par">
                  <dt>Lo suscribe</dt>
                  <dd>{c.suscritoPor}</dd>
                </div>
                <div className="calculo-par">
                  <dt>Firma Electrónica</dt>
                  <dd>
                    {c.firma === null ? (
                      'firma autógrafa (presencial)'
                    ) : (
                      <span className="hash">{c.firma.hashSha256}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {resultado.ok !== null && (
        <div className={resultado.ok ? 'exito' : 'error'}>
          {resultado.mensaje}
          {resultado.problemas.length > 0 && (
            <ul>
              {resultado.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {exigible && (
        <form action={accion} style={{ display: 'grid', gap: '.8rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />

          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            {estado.historial.length === 0 ? 'Aplicar el cuestionario' : 'Aplicar uno nuevo'}
          </h3>

          <div className="fila">
            <label style={{ margin: 0 }}>
              <span>Fecha de aplicación</span>
              <input type="date" name="fechaAplicacion" required disabled={!puede} />
            </label>
            <label style={{ margin: 0 }}>
              <span>Quién lo suscribe</span>
              <input name="suscritoPor" required disabled={!puede} />
            </label>
          </div>

          <label className="casilla">
            <input
              type="checkbox"
              name="remoto"
              value="si"
              checked={remoto}
              onChange={(e) => {
                setRemoto(e.target.checked)
              }}
              disabled={!puede}
            />
            <span>Se aplicó por vía remota, por medios digitales o electrónicos</span>
          </label>

          {remoto && (
            <div className="aviso" style={{ margin: 0 }}>
              <p className="pequeno" style={{ margin: 0 }}>
                El ¶3 pide que el cuestionario remoto <strong>contenga la Firma Electrónica</strong>{' '}
                de quien lo suscribe. Sube el archivo firmado: VIZO guarda su huella SHA-256 como
                evidencia. <strong>VIZO no produce ni valida la firma</strong> — la del Art. 3
                fr. VIII Ter es la del Código de Comercio, no la e.firma del SAT.
              </p>
            </div>
          )}

          {remoto && (
            <label style={{ margin: 0 }}>
              <span>Archivo firmado (PDF, máx. 20 MB)</span>
              <input type="file" name="firma" accept="application/pdf" required disabled={!puede} />
            </label>
          )}

          <label style={{ margin: 0 }}>
            <span>
              Actividad preponderante <span className="pista">— ¶1</span>
            </span>
            <textarea name="actividadPreponderante" rows={2} required disabled={!puede} />
          </label>

          <div className="fila">
            <label style={{ margin: 0 }}>
              <span>
                Origen de los recursos <span className="pista">— ¶2</span>
              </span>
              <textarea name="origenRecursos" rows={2} required disabled={!puede} />
            </label>
            <label style={{ margin: 0 }}>
              <span>
                Destino de los recursos <span className="pista">— ¶2</span>
              </span>
              <textarea name="destinoRecursos" rows={2} required disabled={!puede} />
            </label>
          </div>

          <div className="fila">
            <label style={{ margin: 0 }}>
              <span>
                Actos u operaciones que realiza <span className="pista">— ¶2</span>
              </span>
              <textarea name="actosQueRealiza" rows={2} required disabled={!puede} />
            </label>
            <label style={{ margin: 0 }}>
              <span>
                Actos que <strong>pretende</strong> llevar a cabo{' '}
                <span className="pista">— ¶2, lo único que mira hacia adelante</span>
              </span>
              <textarea name="actosQuePretende" rows={2} required disabled={!puede} />
            </label>
          </div>

          <button type="submit" disabled={!puede || guardando}>
            {guardando ? 'Asentando…' : 'Asentar el cuestionario'}
          </button>

          {!puede && (
            <span className="tenue pequeno">
              Solo un administrador asienta el cuestionario. La regla la aplica la base de datos.
            </span>
          )}
        </form>
      )}
    </div>
  )
}
