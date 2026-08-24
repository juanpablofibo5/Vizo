'use client'

import { useActionState } from 'react'
import { registrarPerfilDelCliente, type EstadoRevision } from './acciones'
import type { EstadoPerfil, PerfilGuardado } from '../../../../src/persistencia/perfil'
import { formatearPesos, formatearPesosTexto } from '../../../../src/dominio/dinero'

/**
 * El Perfil transaccional del cliente (Cap. III Ter, Art. 23 Ter 1).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA PANTALLA NO PROPONE UN MONTO
 * ────────────────────────────────────────────────────────────────────────────
 * El campo de abajo lo llena lo que el CLIENTE dijo que estima operar al mes.
 * No hay valor sugerido, ni un cálculo de «según su historial serían tantos»:
 * el ¶2 pide la información que el cliente proporciona, y prellenarla con lo
 * que ya operó convertiría la declaración en una descripción — el perfil nunca
 * se desviaría de sí mismo.
 *
 * Lo normal es que esto se capture AL REGISTRAR LA OPERACIÓN, que es donde el
 * texto lo pone. Esta pantalla existe para dos cosas: cerrar el hueco cuando
 * un cliente ya operó sin declarar, y hacer el ejercicio semestral del ¶3.
 */

const INICIAL: EstadoRevision = { ok: null, mensaje: '' }

const NOMBRE_ORIGEN: Record<string, string> = {
  inicial: 'inicial',
  reevaluacion: 'reevaluación',
  correccion: 'corrección',
  acto_unico: 'acto único',
}

function Ficha({ p, titulo }: { p: PerfilGuardado; titulo?: string }) {
  return (
    <div style={{ display: 'grid', gap: '.35rem' }}>
      <p style={{ margin: 0 }}>
        {titulo !== undefined && <span className="pequeno tenue">{titulo} · </span>}
        <span className="chip">{NOMBRE_ORIGEN[p.origen] ?? p.origen}</span>{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatearPesos(p.montoMaximoMensual)}
        </strong>{' '}
        <span className="pequeno tenue">máximo mensual declarado</span>
        {p.operacionesMaximasMensuales !== null && (
          <span className="pequeno tenue">
            {' '}
            · hasta {p.operacionesMaximasMensuales} operación(es) al mes
          </span>
        )}
      </p>
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Acto que lo ancla: {p.fechaAncla} · vigente desde {p.vigenteDesde} · se reevalúa a partir
        del {p.vence} ·{' '}
        {p.fuente === 'declarada_por_cliente'
          ? 'lo declaró el cliente'
          : 'consta en archivos del obligado'}
      </p>
      {p.motivo !== null && (
        <p className="pequeno" style={{ margin: 0 }}>
          <span className="tenue">Razón:</span> {p.motivo}
        </p>
      )}
      {(p.origenRecursos !== null || p.destinoRecursos !== null) && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          {p.origenRecursos !== null && <>Origen: {p.origenRecursos}. </>}
          {p.destinoRecursos !== null && <>Destino: {p.destinoRecursos}.</>}
        </p>
      )}
    </div>
  )
}

export function SeccionPerfilTransaccional({
  clienteId,
  perfil,
  puede,
}: {
  clienteId: string
  perfil: EstadoPerfil
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<EstadoRevision, FormData>(
    registrarPerfilDelCliente,
    INICIAL,
  )

  const vigente = perfil.vigente
  const origen =
    vigente === null ? 'inicial' : perfil.reevaluacionDebida ? 'reevaluacion' : 'correccion'
  const pideRazon = origen !== 'inicial'

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.1rem' }}>
      {perfil.anticipado && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          El Cap. III Ter es exigible a partir de los actos del {perfil.plazos.exigibleDesde}
          {' '}(Transitorio Cuarto). Lo que se asiente antes se contrasta desde ya.
        </p>
      )}

      {vigente === null ? (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Este cliente no tiene Perfil transaccional asentado.</strong>
          <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
            No es que esté dentro de su perfil: es que no hay perfil contra el cual comparar. El
            Art. 23 Ter 1 ¶2 pide recabar, al momento del acto, los montos máximos mensuales que el
            propio cliente estime realizar.
          </p>
        </div>
      ) : (
        <>
          <Ficha p={vigente} />
          <p className="pequeno" style={{ margin: 0 }}>
            {perfil.reevaluacionDebida ? (
              <span className="error">
                Le toca el ejercicio semestral del Art. 23 Ter 1 ¶3 desde el {vigente.vence}.
              </span>
            ) : (
              <span className="tenue">
                Hasta el {vigente.vence} gobierna lo que el cliente declaró, y no se puede
                sustituir: el ¶2 lo pone como piso, no como sugerencia. Si el dato quedó mal
                capturado, se corrige diciendo por qué — la corrección no mueve esa fecha.
              </span>
            )}
          </p>
        </>
      )}

      {estado.ok !== null && <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>}

      {puede && (vigente !== null || perfil.actos.length > 0) && (
        <form action={accion} style={{ display: 'grid', gap: '.7rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />
          <input type="hidden" name="origen" value={origen} />

          <h4 style={{ margin: 0 }}>
            {origen === 'inicial'
              ? 'Asentar lo que el cliente declaró'
              : origen === 'reevaluacion'
                ? 'Reevaluar el perfil'
                : 'Corregir lo capturado'}
          </h4>

          {origen === 'inicial' && (
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Acto en el que lo declaró</span>
              <select name="operacionId" required defaultValue="">
                <option value="" disabled>
                  Elige el acto…
                </option>
                {perfil.actos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fecha} · {formatearPesosTexto(a.monto)}
                  </option>
                ))}
              </select>
              <span className="pequeno tenue">
                De esta fecha corren los seis meses del ¶2, no de la de captura.
              </span>
            </label>
          )}

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>Monto máximo mensual que el cliente estima operar</span>
            {/* Ni valor ni placeholder con magnitud. El placeholder enseña el
                FORMATO, no una cantidad: un «500,000.00» de ejemplo es redondo
                y plausible, y en el campo donde el cliente declara su tope eso
                ancla a quien captura aunque nunca se guarde. En los montos de
                la operación el mismo placeholder no estorba —ahí se transcribe
                una cifra escrita en un documento—; aquí se captura una
                estimación hablada, y es justo donde el ADR-22 dice que la
                pantalla no sugiere ningún monto. */}
            <input name="montoMaximoMensual" inputMode="decimal" placeholder="0.00" required />
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>
              Número máximo de operaciones al mes <span className="tenue">(si lo declaró)</span>
            </span>
            <input name="operacionesMaximasMensuales" inputMode="numeric" />
            <span className="pequeno tenue">
              Si se deja vacío no se compara. Un tope por omisión sería inventarle al cliente una
              declaración que no hizo.
            </span>
          </label>

          <label style={{ display: 'grid', gap: '.25rem' }}>
            <span>De dónde sale el dato</span>
            <select name="fuente" defaultValue="declarada_por_cliente">
              <option value="declarada_por_cliente">Lo declaró el cliente</option>
              <option value="archivos_del_obligado">Consta en archivos del obligado</option>
            </select>
          </label>

          <div style={{ display: 'grid', gap: '.7rem', gridTemplateColumns: '1fr 1fr' }}>
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Origen de los recursos</span>
              <input name="origenRecursos" />
            </label>
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Destino de los recursos</span>
              <input name="destinoRecursos" />
            </label>
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Actividad económica</span>
              <input name="actividadEconomica" />
            </label>
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Zona o área geográfica</span>
              <input name="zonaGeografica" />
            </label>
          </div>

          {pideRazon && (
            <label style={{ display: 'grid', gap: '.25rem' }}>
              <span>Por qué</span>
              <textarea name="motivo" rows={2} required />
              <span className="pequeno tenue">
                {origen === 'reevaluacion'
                  ? 'Qué se revisó y por qué se mantiene o se cambia. El ¶3 pide determinar si resulta o no necesario modificarlo.'
                  : 'Qué se había capturado mal. La corrección conserva el vencimiento de la fila que corrige.'}
              </span>
            </label>
          )}

          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Asentar'}
          </button>
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Queda con tu nombre y la hora, y no se reescribe: cada cambio es una fila nueva. El
            vencimiento no se captura — sale del catálogo regulatorio.
          </p>
        </form>
      )}

      {puede && vigente === null && perfil.actos.length === 0 && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Este cliente todavía no tiene ningún acto registrado. El perfil se ancla en uno, así que
          se captura al registrar su primera operación.
        </p>
      )}

      {!puede && (
        <p className="pequeno tenue" style={{ margin: 0 }}>
          Solo un administrador asienta el Perfil transaccional.
        </p>
      )}

      {perfil.historial.length > 1 && (
        <div>
          <h4 style={{ margin: '0 0 .5rem' }}>
            Versiones anteriores{' '}
            <span className="pequeno tenue">
              el Art. 41 fr. IV exige conservar el histórico del perfil
            </span>
          </h4>
          <div style={{ display: 'grid', gap: '.9rem' }}>
            {perfil.historial.slice(1).map((h) => (
              <Ficha key={h.perfilId} p={h} titulo="anterior" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
