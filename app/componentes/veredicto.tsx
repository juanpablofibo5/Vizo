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

/**
 * El desglose, SIN su disclosure.
 *
 * Se separó del `<details>` porque dos pantallas lo abren de formas distintas:
 * operaciones con su propio `<details>` por renglón, y alertas dentro de la
 * caja del «Por qué» que ya trae la tarjeta. Anidar un `<details>` dentro de
 * otro abierto se lee como un error de maquetación, y duplicar el desglose
 * para evitarlo sería peor: una alerta y su operación no pueden explicar el
 * mismo veredicto de dos maneras.
 */
export function DesgloseDelVeredicto({
  v,
  sinMotivo = false,
}: {
  v: Veredicto
  /**
   * Omite la frase del motor porque quien llama ya la enseñó.
   *
   * Pasa en alertas: para un `aviso_requerido`, el `motivo` de la alerta ES
   * `ev.motivo` —el mismo string, copiado al crearla—, así que la tarjeta lo
   * pintaba como párrafo y el desglose lo repetía entero unas líneas abajo.
   * No se decide aquí ni por tipo de alerta: quien llama compara los dos
   * textos, y si difieren se enseñan los dos. Así nunca se pierde una frase
   * por deduplicar de más.
   */
  sinMotivo?: boolean
}) {
  const umbralAviso = v.umbrales.find((u) => u.tipo === 'aviso')
  const identificacion = v.umbrales.find((u) => u.tipo === 'identificacion')

  return (
    <>
      <div
        style={{
          padding: '.9rem 1rem',
          background: 'var(--superficie-2)',
          border: '1px solid var(--linea)',
          borderRadius: 'var(--radio-control)',
          display: 'grid',
          gap: '.9rem',
        }}
      >
        {/* Lo que el motor escribió al decidir, palabra por palabra. */}
        {!sinMotivo && (
          <p className="pequeno" style={{ margin: 0 }}>
            {v.motivo}
          </p>
        )}

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
                {/* «sin IVA» decía menos que la norma: el Art. 6 del Reglamento
                    excluye «las contribuciones y demás accesorios», y el ISAI es
                    una contribución que no es IVA. En una pantalla que explica
                    un veredicto, la palabra corta es la que confunde. */}
                {umbralAviso.valorUma} UMA ·{' '}
                {umbralAviso.base === 'sin_contribuciones'
                  ? 'sin contribuciones ni accesorios'
                  : 'con contribuciones y accesorios'}
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
    </>
  )
}

export function VeredictoExplicable({ v }: { v: Veredicto }) {
  return (
    <details style={{ marginTop: '.4rem' }}>
      {/* `--enlace` y no `--acento`: el naranja de marca es para lo que se
          pulsa —botones, píldora activa—, y este es texto que se lee como
          enlace. La misma separación que sostiene el semáforo. */}
      <summary className="por-que">Por qué</summary>
      <div style={{ marginTop: '.7rem' }}>
        <DesgloseDelVeredicto v={v} />
      </div>
    </details>
  )
}
