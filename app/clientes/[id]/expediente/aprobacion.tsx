'use client'

import { useActionState } from 'react'
import { asentarAprobacionDirectivo, type EstadoRevision } from './acciones'
import type { AprobacionGuardada, EstadoAprobacion } from '../../../../src/persistencia/aprobacion'

/**
 * La aprobación de directivo del Art. 23 Ter 5.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA PANTALLA TIENE TRES ESTADOS Y NO DOS
 * ────────────────────────────────────────────────────────────────────────────
 * El artículo pide una conjunción —Persona Políticamente Expuesta «y, además,
 * con Grado de Riesgo alto»— y cada mitad puede estar en tres situaciones: sí,
 * no, y todavía no se sabe. Un cliente sin declaración PEP no es un cliente que
 * no sea PEP; uno sin clasificar no es uno de riesgo bajo.
 *
 * Por eso aquí nunca aparece «no se requiere aprobación» cuando falta un dato:
 * aparece qué falta, y el formulario NO se ofrece. El hueco no se cierra
 * firmando — firmar sin saber si era exigible produce evidencia de algo que
 * nadie comprobó.
 */

const INICIAL: EstadoRevision = { ok: null, mensaje: '' }

const FALTA: Record<string, string> = {
  caracter_pep: 'la declaración PEP del cliente (Cap. III Quáter)',
  grado_de_riesgo: 'clasificar su Grado de Riesgo (Cap. III Bis)',
  grado_vencido: 'reevaluar su Grado de Riesgo, que ya venció',
}

function Ficha({ a }: { a: AprobacionGuardada }) {
  return (
    <div style={{ display: 'grid', gap: '.35rem' }}>
      <p style={{ margin: 0 }}>
        <span className="chip">{a.momento === 'previa' ? 'previa' : 'posterior'}</span>{' '}
        {a.via === 'directivo' ? (
          <>
            <strong>{a.aprobadorNombre}</strong>{' '}
            <span className="pequeno tenue">· {a.aprobadorCargo}</span>
          </>
        ) : (
          <strong>Constancia del obligado</strong>
        )}{' '}
        <span className="pequeno tenue">· {a.fechaAprobacion}</span>
      </p>
      {a.momento === 'previa' ? (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Alcance: {a.alcancePrevio} · vigente hasta el {a.vigenteHasta}
        </p>
      ) : (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Consiente {a.operacionesConsentidas.length} acto(s) nombrado(s).
        </p>
      )}
      {a.motivos !== null && (
        <p className="pequeno" style={{ margin: 0 }}>
          <span className="tenue">Motivos:</span> {a.motivos}
        </p>
      )}
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Asentada por {a.registradaPor}.
      </p>
    </div>
  )
}

export function SeccionAprobacionDirectivo({
  clienteId,
  aprobacion,
  puede,
}: {
  clienteId: string
  aprobacion: EstadoAprobacion
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<EstadoRevision, FormData>(
    asentarAprobacionDirectivo,
    INICIAL,
  )

  const e = aprobacion.exigencia
  const esDirectivo = aprobacion.via === 'directivo'

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.1rem' }}>
      {aprobacion.anticipado && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          El Cap. III Ter es exigible a partir de los actos del {aprobacion.exigibleDesde}{' '}
          (Transitorio Cuarto). Los actos anteriores no entran en esta cuenta.
        </p>
      )}

      {e.estado === 'no_exigible' && (
        <p style={{ margin: 0 }}>
          El Art. 23 Ter 5 <strong>no exige aprobación</strong> para este cliente:{' '}
          {e.porque === 'no_es_pep'
            ? 'consta que no es Persona Políticamente Expuesta.'
            : 'consta que no es de Grado de Riesgo alto.'}{' '}
          <span className="tenue">
            El artículo pide las dos cosas a la vez, así que basta que una no se cumpla.
          </span>
        </p>
      )}

      {e.estado === 'indeterminable' && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Todavía no se puede saber si este cliente necesita aprobación.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            No es que no la necesite. El Art. 23 Ter 5 se dispara con dos cosas a la vez —ser
            Persona Políticamente Expuesta <em>y, además</em>, de Grado de Riesgo alto— y falta{' '}
            {e.falta.map((f) => FALTA[f] ?? f).join(' y ')}.
          </p>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            Mientras tanto no se ofrece asentar nada: una firma sin saber si era exigible es
            evidencia de algo que nadie comprobó.
          </p>
        </div>
      )}

      {e.estado === 'exigible' && (
        <>
          <div className="aviso" style={{ margin: 0 }}>
            <strong>
              Este cliente es Persona Políticamente Expuesta y, además, de Grado de Riesgo alto.
            </strong>
            <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
              El Art. 23 Ter 5 pide{' '}
              {esDirectivo
                ? 'la aprobación de un directivo o su equivalente que consienta los actos u operaciones respectivos'
                : 'una constancia en la que el obligado señale los motivos que consideró para realizar el acto'}
              . Quién es «un directivo o su equivalente» lo dice tu Manual de Políticas Internas;
              VIZO asienta quién aprobó, cuándo y sobre qué actos.
            </p>
            {e.conGradoVencido && (
              <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
                El Grado de Riesgo que la dispara está <strong>vencido</strong>. La exigencia vale
                igual: caducar no degrada a nadie. Conviene reevaluarlo (Art. 23 Bis 1).
              </p>
            )}
          </div>

          {aprobacion.actosSinConsentir.length > 0 ? (
            <div>
              <h4 style={{ margin: '0 0 .3rem' }}>
                {aprobacion.actosSinConsentir.length} acto(s) sin consentimiento
              </h4>
              <p className="pequeno tenue" style={{ margin: '0 0 .4rem' }}>
                Están registrados —el ¶1 contempla detectar esto con posterioridad al acto— y les
                falta la firma.
              </p>
              <ul className="pequeno" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {aprobacion.actosSinConsentir.map((a) => (
                  <li key={a.id}>Operación del {a.fecha}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="pequeno tenue" style={{ margin: 0 }}>
              Todos los actos sujetos al capítulo están consentidos.
            </p>
          )}
        </>
      )}

      {estado.ok !== null && <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>}

      {puede && e.estado === 'exigible' && (
        <form action={accion} style={{ display: 'grid', gap: '.7rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />

          <h4 style={{ margin: 0 }}>
            {esDirectivo ? 'Asentar la aprobación' : 'Emitir la constancia de motivos'}
          </h4>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>Cuándo se consintió</span>
            <select name="momento" defaultValue="posterior">
              <option value="posterior">
                Después del acto — se nombran los actos que consiente
              </option>
              <option value="previa">Antes del acto — con alcance y plazo</option>
            </select>
            <span className="pequeno tenue">
              Son los dos casos que el ¶1 nombra: «previamente o con posterioridad al acto u
              operación».
            </span>
          </label>

          {esDirectivo && (
            <div style={{ display: 'grid', gap: '.7rem', gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ display: 'grid', gap: '.25rem' }}>
                <span>Quién aprobó</span>
                <input name="aprobadorNombre" required />
              </label>
              <label style={{ display: 'grid', gap: '.25rem' }}>
                <span>Con qué cargo</span>
                <input name="aprobadorCargo" required />
              </label>
            </div>
          )}

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>
              Motivos {esDirectivo && <span className="tenue">(opcional)</span>}
            </span>
            <textarea name="motivos" rows={2} required={!esDirectivo} />
            <span className="pequeno tenue">
              {esDirectivo
                ? 'El ¶1 no los exige al directivo. Se piden por si quieres dejarlos asentados.'
                : 'El ¶2 pide exactamente esto: que la constancia «señale los motivos que consideró para realizar el acto u operación».'}
            </span>
          </label>

          {/* Los actos que consiente. Solo tienen sentido para la posterior; la
              previa consiente lo que aún no ocurre y por eso lleva plazo. Se
              muestran los dos bloques y el servidor usa el que corresponde al
              momento elegido. */}
          {aprobacion.actos.length > 0 && (
            <fieldset style={{ margin: 0 }}>
              <legend className="pequeno">Actos que consiente (si es posterior)</legend>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.3rem' }}>
                {aprobacion.actos.map((a) => (
                  <li key={a.id}>
                    <label style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
                      {/* Ninguna casilla viene marcada: consentir es un acto
                          deliberado sobre actos concretos. */}
                      <input type="checkbox" name="operaciones" value={a.id} />
                      <span>
                        Operación del {a.fecha}{' '}
                        {aprobacion.actosSinConsentir.some((s) => s.id === a.id) && (
                          <span className="chip">sin consentir</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          <div style={{ display: 'grid', gap: '.7rem', gridTemplateColumns: '2fr 1fr' }}>
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Alcance (si es previa)</span>
              <input name="alcancePrevio" placeholder="Qué actos consiente por adelantado" />
            </label>
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Vigente hasta (si es previa)</span>
              <input name="vigenteHasta" type="date" />
            </label>
          </div>

          <button type="submit" disabled={guardando} style={{ justifySelf: 'start' }}>
            {guardando ? 'Asentando…' : 'Asentar'}
          </button>
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Queda con tu nombre y la hora, y no se reescribe. La aprobación cita la declaración PEP
            y la evaluación de riesgo que la hicieron exigible, para poder reconstruir dentro de
            diez años por qué se pidió.
          </p>
        </form>
      )}

      {!puede && e.estado === 'exigible' && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Solo un administrador asienta la aprobación del Art. 23 Ter 5.
        </p>
      )}

      {aprobacion.aprobaciones.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 .5rem' }}>
            Aprobaciones asentadas{' '}
            <span className="pequeno tenue">append-only: ninguna se reescribe</span>
          </h4>
          <div style={{ display: 'grid', gap: '.9rem' }}>
            {aprobacion.aprobaciones.map((a) => (
              <Ficha key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
