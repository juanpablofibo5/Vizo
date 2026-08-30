'use client'

import { useActionState } from 'react'
import { accionConsultarScreening, accionResolverScreening, type EstadoRevision } from './acciones'
import type { ConsultaListada, ConsultaPendiente } from '../../../../src/persistencia/screening'
import type { ListaVigente } from '../../../../src/dominio/screening'

/**
 * Las listas de control del cliente (ADR-30, issue #34).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUIÉN DECIDE QUÉ
 * ────────────────────────────────────────────────────────────────────────────
 * VIZO detecta DE MÁS a propósito: el costo de una coincidencia de sobra es
 * una revisión; el de una de menos, operar con una persona listada. Y VIZO no
 * descarta nada solo (regla dura 5): confirmar o descartar lo firma un admin,
 * con su razonamiento escrito — la base rechaza la resolución sin él.
 *
 * La consulta que no encuentra nada TAMBIÉN se registra: el folio con el
 * snapshot de versiones es la evidencia de que ese día se consultó, y contra
 * qué. Por eso el botón no dice «verificar» sino «consultar»: el acto es lo
 * que vale, no solo su resultado.
 */

const INICIAL: EstadoRevision = { ok: null, mensaje: '' }

const NOMBRE_DE_LISTA: Record<string, string> = {
  ofac_sdn: 'OFAC SDN',
  onu: 'ONU (Consejo de Seguridad)',
  sat_69b: 'SAT 69-B',
  lpb: 'Personas Bloqueadas (UIF)',
}

function nombreDeLista(clave: string): string {
  return NOMBRE_DE_LISTA[clave] ?? clave
}

const RESOLUCION_LEGIBLE: Record<string, string> = {
  pendiente: 'pendiente',
  confirmada: 'confirmada',
  descartada: 'descartada',
}

function FormularioResolver({
  consultaId,
  clienteId,
}: {
  consultaId: string
  clienteId: string
}) {
  const [estado, accion, resolviendo] = useActionState<EstadoRevision, FormData>(
    accionResolverScreening,
    INICIAL,
  )

  return (
    <form action={accion} style={{ display: 'grid', gap: '.6rem', marginTop: '.8rem' }}>
      <input type="hidden" name="consultaId" value={consultaId} />
      <input type="hidden" name="clienteId" value={clienteId} />

      {estado.ok !== null && (
        <div className={estado.ok ? 'exito' : 'error'} style={{ margin: 0 }}>
          {estado.mensaje}
        </div>
      )}

      <label className="casilla parrafo">
        <input type="radio" name="resolucion" value="descartada" required />
        <span>
          Descartar como homónimo{' '}
          <span className="pequeno tenue">· no es la persona listada</span>
        </span>
      </label>
      <label className="casilla parrafo">
        <input type="radio" name="resolucion" value="confirmada" required />
        <span>
          Confirmar la coincidencia{' '}
          <span className="pequeno tenue">· sí es la persona listada</span>
        </span>
      </label>

      <label>
        <span className="pequeno">Razonamiento (es la evidencia de la decisión)</span>
        <textarea
          name="razonamiento"
          rows={3}
          required
          minLength={15}
          placeholder="Por qué la coincidencia es —o no es— la persona listada: fecha de nacimiento, RFC, domicilio, nacionalidad…"
        />
      </label>

      <div>
        <button type="submit" disabled={resolviendo}>
          {resolviendo ? 'Registrando…' : 'Registrar la resolución'}
        </button>
      </div>
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Se resuelve UNA vez y queda con tu nombre y la hora. La coincidencia detectada no se
        puede editar: tu resolución se escribe junto a ella, nunca encima.
      </p>
    </form>
  )
}

export function SeccionScreening({
  clienteId,
  historial,
  pendientes,
  listas,
  listasError,
  esAdmin,
}: {
  clienteId: string
  historial: ConsultaListada[]
  pendientes: ConsultaPendiente[]
  listas: ListaVigente[] | null
  listasError: string | null
  esAdmin: boolean
}) {
  const [estado, accion, consultando] = useActionState<EstadoRevision, FormData>(
    accionConsultarScreening,
    INICIAL,
  )

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Contra qué se consulta — o por qué hoy no se puede. */}
      {listasError !== null ? (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Hoy no se puede consultar, y es a propósito.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>{listasError}</p>
        </div>
      ) : (
        <div className="tarjeta" style={{ margin: 0 }}>
          <p className="pequeno tenue" style={{ margin: '0 0 .5rem' }}>
            Listas vigentes — la consulta corre contra estas versiones y el folio guarda su
            huella:
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {(listas ?? []).map((l) => (
              <span key={l.clave} className="chip">
                {nombreDeLista(l.clave)}{' '}
                <span className="tenue">
                  · {l.descargadaEn.slice(0, 10)} · {l.registros.toLocaleString('es-MX')} registros
                </span>
              </span>
            ))}
          </div>

          <form action={accion} style={{ marginTop: '.9rem', display: 'grid', gap: '.5rem' }}>
            <input type="hidden" name="clienteId" value={clienteId} />
            {estado.ok !== null && (
              <div className={estado.ok ? 'exito' : 'error'} style={{ margin: 0 }}>
                {estado.mensaje}
              </div>
            )}
            <div>
              <button type="submit" disabled={consultando}>
                {consultando ? 'Consultando…' : 'Consultar listas ahora'}
              </button>
            </div>
            <p className="pequeno tenue" style={{ margin: 0, maxWidth: '44rem' }}>
              Por nombre (similitud) y por RFC (exacto). Toda consulta queda registrada — también
              la que no encuentra nada: ese folio es la evidencia de que hoy se consultó.
            </p>
          </form>
        </div>
      )}

      {/* Lo que alguien tiene que mirar, abierto y con su formulario. */}
      {pendientes.map((p) => (
        <article key={p.consultaId} className="ficha-alerta" data-tono="critico">
          <div className="ficha-alerta-cabeza">
            <strong>Coincidencia sin resolver</strong>
            <span className="chip">consulta del {p.consultadoEn.slice(0, 10)}</span>
          </div>
          <p className="ficha-alerta-motivo">
            El nombre o el RFC de este cliente aparecen en listas de control. Hasta que una
            persona confirme o descarte, esto está detectado y nadie lo ha mirado.
          </p>
          <ul className="pequeno" style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {p.coincidencias.map((c) => (
              <li key={`${c.lista}-${c.entradaId}`} style={{ marginBottom: '.3rem' }}>
                <strong>{c.nombreEnLista}</strong>{' '}
                <span className="tenue">
                  · {nombreDeLista(c.lista)} ·{' '}
                  {c.criterio === 'rfc'
                    ? 'RFC exacto'
                    : `similitud ${String(Math.round(c.similitud * 100))}%`}
                </span>
              </li>
            ))}
          </ul>

          {esAdmin ? (
            <FormularioResolver consultaId={p.consultaId} clienteId={clienteId} />
          ) : (
            <p className="pequeno tenue" style={{ margin: '.6rem 0 0' }}>
              Solo un administrador resuelve la coincidencia — y VIZO no la resuelve nunca: la
              decisión, con su razonamiento, es de una persona (regla del producto).
            </p>
          )}
        </article>
      ))}

      {/* El historial: cada fila es una consulta que ocurrió. */}
      <div className="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Resultado</th>
              <th>Resolución</th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 ? (
              <tr>
                <td className="vacia" colSpan={3}>
                  Este cliente nunca se ha consultado contra las listas.
                </td>
              </tr>
            ) : (
              historial.map((h) => (
                <tr key={h.id}>
                  <td className="mono pequeno">{h.consultadoEn.slice(0, 10)}</td>
                  <td>
                    {h.resultado === 'sin_coincidencia' ? (
                      <span className="estado ok">sin coincidencias</span>
                    ) : (
                      <span className="estado aviso">
                        {h.coincidencias} coincidencia{h.coincidencias === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                  <td className="pequeno">
                    {h.resultado === 'sin_coincidencia' ? (
                      <span className="tenue">— no aplica —</span>
                    ) : h.resolucion === 'pendiente' ? (
                      <span className="estado critico">pendiente</span>
                    ) : (
                      <>
                        {RESOLUCION_LEGIBLE[h.resolucion]}
                        {h.resueltoEn !== null && (
                          <span className="tenue"> · {h.resueltoEn.slice(0, 10)}</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
