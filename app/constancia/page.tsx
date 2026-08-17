import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { armarConstancia } from '../../src/persistencia/constancia'
import type { Constancia } from '../../src/dominio/constancia'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { Marco } from '../componentes/marco'
import { BotonDescargar } from './descargar'

export const dynamic = 'force-dynamic'

/**
 * La Constancia de mecanismos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA TIENE QUE LOGRAR
 * ────────────────────────────────────────────────────────────────────────────
 * Que nadie confunda esto con su Manual. El Art. 37 Bis pide catorce apartados;
 * VIZO acredita algunos y el resto los escribe el obligado. Si la pantalla
 * enseñara una lista bonita de palomas, el mensaje sería «ya está» — y estaría
 * entregando un Manual incompleto ante la autoridad, creyendo lo contrario.
 *
 * Por eso lo primero que se ve es cuántos apartados FALTAN, no cuántos hay.
 */

const TONO: Record<string, string> = {
  acreditado: 'ok',
  parcial: 'aviso',
  hueco: 'neutro',
}

const ETIQUETA: Record<string, string> = {
  acreditado: 'Acreditado',
  parcial: 'Parcial',
  hueco: 'Lo redacta usted',
}

export default async function PantallaConstancia() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const c = await leerComoUsuario(db, sesion, (): Promise<Constancia> =>
      armarConstancia(db, { sesion, hoy: hoyEnMexico() }),
    )

    const pendientes = c.huecos + c.parciales

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Constancia de mecanismos</h1>
        <p className="sub">
          Lo que su sistema de cumplimiento tiene implementado, con la evidencia que lo respalda.
        </p>

        {/* La frontera, antes que nada. No es un descargo legal al pie: es lo
            primero que la pantalla dice, porque es lo que evita el error caro. */}
        <div className="tarjeta" style={{ borderLeft: '3px solid var(--acento)' }}>
          <h3 style={{ marginTop: 0 }}>Esto no es su Manual de Políticas Internas</h3>
          <p className="pequeno" style={{ margin: 0 }}>
            El Art. 37 Bis del Acuerdo 115/2026 exige <strong>catorce apartados</strong>. VIZO
            acredita los que puede demostrar con datos de su operación; los demás los escribe usted,
            y aquí aparecen con las preguntas que hay que contestar en cada uno. Su Manual puede
            <strong> referenciar</strong> esta constancia, como permite el Art. 37, párrafo 2.
          </p>
        </div>

        <div className="rejilla" style={{ marginTop: '1.5rem' }}>
          <div className="tarjeta">
            <span className="tenue pequeno">Faltan por redactar</span>
            <div style={{ fontSize: '1.9rem', fontWeight: 620 }} className="num">
              {pendientes}
            </div>
            <span className="pequeno tenue">de 14 apartados</span>
          </div>
          <div className="tarjeta">
            <span className="tenue pequeno">Acreditados por VIZO</span>
            <div style={{ fontSize: '1.9rem', fontWeight: 620 }} className="num">
              {c.acreditados}
            </div>
            <span className="pequeno tenue">
              {c.parciales > 0 ? `y ${String(c.parciales)} parcial(es)` : 'completos'}
            </span>
          </div>
          <div className="tarjeta" style={{ display: 'grid', alignContent: 'center' }}>
            <BotonDescargar />
            <span className="pequeno tenue" style={{ marginTop: '.5rem' }}>
              Texto plano, para pegarse o referenciarse
            </span>
          </div>
        </div>

        {c.degradados.length > 0 && (
          <div className="aviso" style={{ marginTop: '1.2rem' }}>
            <strong>
              {c.degradados.length} apartado(s) que VIZO normalmente acredita se quedaron sin
              evidencia
            </strong>{' '}
            ({c.degradados.join(', ')}). Suele significar que la cuenta está a medio configurar o
            que todavía no hay operación registrada — no que el requisito no aplique. Conviene
            resolverlo antes de entregar nada.
          </div>
        )}

        <h2 style={{ marginTop: '2rem' }}>Los catorce apartados</h2>
        <div style={{ display: 'grid', gap: '.9rem' }}>
          {c.secciones.map((s) => (
            <div
              key={s.fraccion}
              className="tarjeta"
              style={{
                borderLeft:
                  s.resolucion === 'hueco'
                    ? '3px solid var(--linea-fuerte)'
                    : s.resolucion === 'parcial'
                      ? '3px solid var(--alerta)'
                      : '3px solid var(--ok)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '.7rem',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  marginBottom: '.5rem',
                }}
              >
                <span className="mono" style={{ fontWeight: 620 }}>
                  Fr. {s.fraccion}
                </span>
                <span className={`estado ${TONO[s.resolucion] ?? 'neutro'}`}>
                  {ETIQUETA[s.resolucion]}
                </span>
              </div>

              {/* El texto LITERAL del artículo. Es lo que permite cotejarlo
                  contra el DOF sin confiar en nuestra paráfrasis. */}
              <blockquote
                className="pequeno"
                style={{
                  margin: '0 0 .8rem',
                  paddingLeft: '.8rem',
                  borderLeft: '2px solid var(--linea)',
                  color: 'var(--texto-tenue)',
                }}
              >
                {s.texto}
              </blockquote>

              {s.hechos.length > 0 && (
                <ul style={{ margin: '0 0 .6rem', paddingLeft: '1.1rem' }}>
                  {s.hechos.map((h) => (
                    <li key={h.afirmacion} className="pequeno" style={{ marginBottom: '.5rem' }}>
                      {h.afirmacion}
                      <div className="tenue" style={{ fontSize: '.75rem', marginTop: '.15rem' }}>
                        Verificable en: {h.respaldo}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {s.preguntas.length > 0 && (
                <div>
                  {s.porQueNo !== undefined && (
                    <p className="pequeno tenue" style={{ margin: '0 0 .4rem' }}>
                      {s.porQueNo}
                    </p>
                  )}
                  <p className="pequeno" style={{ margin: '0 0 .3rem', fontWeight: 545 }}>
                    Qué hay que responder aquí:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {s.preguntas.map((q) => (
                      <li key={q} className="pequeno tenue">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Un hueco sin preguntas sería un hueco mudo. La base lo impide
                  al sembrar, pero si alguna vez llegara uno, se ve. */}
              {s.resolucion === 'hueco' && s.preguntas.length === 0 && (
                <p className="pequeno tenue" style={{ margin: 0 }}>
                  {s.porQueNo}
                </p>
              )}
            </div>
          ))}
        </div>
      </Marco>
    )
  })
}
