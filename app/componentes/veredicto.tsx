import type { Veredicto } from '../../src/persistencia/veredicto'
import { formatearPesosTexto } from '../../src/dominio/dinero'

/**
 * El veredicto del motor, contado en lenguaje humano.
 *
 * Es la pieza de producto más importante del portal. La mayor ansiedad de un
 * sujeto obligado no es "¿tengo que avisar?" sino "¿por qué dice el sistema que
 * tengo que avisar, y qué le contesto a la autoridad si me pregunta?".
 *
 * Cada número de aquí sale de `evaluaciones_umbral` — la UMA con su vigencia,
 * el umbral aplicado, la base con o sin IVA, la ventana y las operaciones que
 * la integran, la versión del catálogo. **Nada se recalcula al pintar.** Si
 * esta pantalla hiciera su propia cuenta habría dos respuestas posibles, y la
 * que se defiende es la que quedó registrada.
 *
 * Va en un `<details>` cerrado por omisión: el veredicto se lee de un vistazo y
 * el desglose está ahí para quien lo pida — normalmente el día que alguien
 * pregunta.
 */

const RESULTADO: Record<Veredicto['resultadoAviso'], { texto: string; tono: string }> = {
  no: { texto: 'No requiere aviso', tono: 'neutro' },
  individual: { texto: 'Requiere aviso', tono: 'aviso' },
  acumulacion: { texto: 'Aviso por acumulación', tono: 'aviso' },
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: '.1rem' }}>
      <span
        className="tenue"
        style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.07em' }}
      >
        {etiqueta}
      </span>
      <span className="pequeno num">{children}</span>
    </div>
  )
}

export function EtiquetaVeredicto({ v }: { v: Veredicto }) {
  const r = RESULTADO[v.resultadoAviso]
  return <span className={`estado ${r.tono}`}>{r.texto}</span>
}

export function VeredictoExplicable({ v }: { v: Veredicto }) {
  const umbralAviso = v.umbrales.find((u) => u.tipo === 'aviso')
  const identificacion = v.umbrales.find((u) => u.tipo === 'identificacion')

  return (
    <details style={{ marginTop: '.4rem' }}>
      <summary style={{ cursor: 'pointer', fontSize: '.85rem', color: 'var(--acento)' }}>
        Por qué
      </summary>

      <div
        style={{
          marginTop: '.7rem',
          padding: '.9rem 1rem',
          background: 'var(--superficie-2)',
          border: '1px solid var(--linea)',
          borderRadius: 'var(--radio)',
          display: 'grid',
          gap: '.9rem',
        }}
      >
        {/* Lo que el motor escribió al decidir, palabra por palabra. */}
        <p className="pequeno" style={{ margin: 0 }}>
          {v.motivo}
        </p>

        <div
          style={{
            display: 'grid',
            gap: '.7rem 1.4rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
            borderTop: '1px solid var(--linea)',
            paddingTop: '.8rem',
          }}
        >
          <Dato etiqueta="UMA aplicada">
            ${v.umaValor}
            <br />
            <span className="tenue" style={{ fontSize: '.75rem' }}>
              vigencia {v.umaVigencia}
            </span>
          </Dato>

          {umbralAviso?.enPesos != null && (
            <Dato etiqueta="Umbral de aviso">
              {formatearPesosTexto(umbralAviso.enPesos)}
              <br />
              <span className="tenue" style={{ fontSize: '.75rem' }}>
                {umbralAviso.valorUma} UMA · {umbralAviso.base === 'sin_iva' ? 'sin IVA' : 'con IVA'}
              </span>
            </Dato>
          )}

          <Dato etiqueta="Base considerada">
            {formatearPesosTexto(v.montoBaseConsiderado)}
            {v.montoTotalConsiderado !== v.montoBaseConsiderado && (
              <>
                <br />
                <span className="tenue" style={{ fontSize: '.75rem' }}>
                  total {formatearPesosTexto(v.montoTotalConsiderado)}
                </span>
              </>
            )}
          </Dato>

          {v.sumaVentana !== null && (
            <Dato etiqueta={`Suma de ${String(v.ventanaMeses ?? 6)} meses`}>
              {formatearPesosTexto(v.sumaVentana)}
            </Dato>
          )}
        </div>

        {/* Las operaciones que el motor sumó. Sin esto, "por acumulación" es
            una afirmación que nadie puede comprobar. */}
        {v.acumuladas.length > 0 && (
          <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '.8rem' }}>
            <span
              className="tenue"
              style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.07em' }}
            >
              Operaciones que suman en la ventana
            </span>
            <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
              {v.acumuladas.map((o) => (
                <li key={o.id} className="pequeno num">
                  {o.fecha} · {formatearPesosTexto(o.montoBase)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          style={{
            borderTop: '1px solid var(--linea)',
            paddingTop: '.7rem',
            display: 'grid',
            gap: '.3rem',
          }}
        >
          {identificacion?.siempre === true && (
            <span className="pequeno tenue">
              · La identificación del cliente es obligatoria en esta actividad sin importar el
              monto.
            </span>
          )}
          {v.alertaProximidad && v.proximidadPct !== null && (
            <span className="pequeno tenue">
              · Alerta de proximidad: superó el {v.proximidadPct}% del umbral.
            </span>
          )}
          {v.efectivoRestringido && (
            <span className="pequeno tenue">
              · El efectivo de esta operación rebasa la restricción del Art. 32.
            </span>
          )}
          {v.requiereRevisionIdentidad && (
            <span className="pequeno tenue">
              · El cliente no tiene RFC ni CURP: la acumulación no puede resolver si es el
              mismo en otra operación, y requiere revisión humana.
            </span>
          )}
        </div>

        {/* La huella del cálculo. Es lo que permite reproducirlo años después:
            misma versión de catálogo, mismo resultado. */}
        <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '.7rem' }}>
          <span className="tenue" style={{ fontSize: '.7rem' }}>
            Evaluado el {v.evaluadoEn.replace('T', ' ').replace('Z', ' UTC')} · catálogo
          </span>
          <span className="hash">{v.catalogoVersion}</span>
        </div>
      </div>
    </details>
  )
}
