import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../../src/supabase/conexion'
import { Marco } from '../../componentes/marco'
import { detalleDeAviso, type PasoDelAviso } from '../../../src/persistencia/aviso'
import { EstadoAviso, nombreDePeriodo } from '../estados'
import { BotonAprobar, BotonListoRevision, FormularioAcuse } from '../formularios'

export const dynamic = 'force-dynamic'

/** El ciclo, tal como lo cuenta la bitácora. */
const ETAPAS: Array<{ evento: string; titulo: string; que: string }> = [
  { evento: 'aviso.generado', titulo: 'Generado y validado', que: 'El XML se armó y pasó el XSD oficial. Si no hubiera validado, no existiría.' },
  { evento: 'aviso.listo_revision', titulo: 'Listo para revisión', que: 'Alguien decidió que ya se puede revisar.' },
  { evento: 'aviso.aprobado', titulo: 'Aprobado', que: 'Una persona con nombre lo revisó y lo firmó.' },
  { evento: 'aviso.acuse_registrado', titulo: 'Presentado', que: 'El acuse del portal está guardado como prueba.' },
]

function Linea({ pasos }: { pasos: PasoDelAviso[] }) {
  const porEvento = new Map(pasos.map((p) => [p.evento, p]))

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.9rem' }}>
      {ETAPAS.map((etapa) => {
        const paso = porEvento.get(etapa.evento)
        const hecho = paso !== undefined
        return (
          <li
            key={etapa.evento}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '.75rem',
              opacity: hecho ? 1 : 0.5,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '.7rem',
                height: '.7rem',
                borderRadius: '50%',
                marginTop: '.4rem',
                background: hecho ? 'var(--ok)' : 'transparent',
                border: hecho ? 'none' : '1.5px solid var(--linea-fuerte)',
              }}
            />
            <span>
              <strong style={{ fontSize: '.94rem' }}>{etapa.titulo}</strong>
              <br />
              <span className="tenue pequeno">{etapa.que}</span>
              {paso !== undefined && (
                <>
                  <br />
                  {/* QUIÉN y CUÁNDO. Sin eso, la aprobación no acredita nada. */}
                  <span className="mono pequeno">
                    {paso.actor ?? 'sistema'} · {paso.ocurridoEn.replace('T', ' ').replace('Z', ' UTC')}
                  </span>
                </>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default async function DetalleAvisoPagina({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const detalle = await leerComoUsuario(db, sesion, () =>
      detalleDeAviso(db, { sesion, avisoId: id }),
    )

    if (detalle === null) {
      return (
        <Marco obligado={obligado} perfil={perfil}>
          <p className="error">Este aviso no existe en tu obligado.</p>
          <Link href="/avisos">← Volver a avisos</Link>
        </Marco>
      )
    }

    const esAdmin = perfil.rol === 'admin'

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <p className="pequeno" style={{ marginBottom: '.6rem' }}>
          <Link href="/avisos">← Avisos</Link>
        </p>

        <div style={{ display: 'flex', gap: '.8rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 style={{ textTransform: 'capitalize' }}>{nombreDePeriodo(detalle.periodo)}</h1>
          <EstadoAviso estatus={detalle.estatus} />
          {detalle.tipo === 'cero' && <span className="chip">informe en cero</span>}
        </div>
        <p className="sub">
          {detalle.operaciones === 0
            ? 'Sin operaciones reportables en el periodo.'
            : `${String(detalle.operaciones)} operación(es) reportadas.`}{' '}
          Formato <span className="mono">{detalle.formatoVersion}</span>.
        </p>

        <div className="rejilla" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)' }}>
          {/* ── Columna izquierda: el ciclo y la frontera ─────────────── */}
          <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
            <div className="tarjeta">
              <h3>Ciclo del aviso</h3>
              <p className="tenue pequeno" style={{ margin: '0 0 1rem' }}>
                Cada paso sale de la bitácora, no de la fila del aviso.
              </p>
              <Linea pasos={detalle.pasos} />
            </div>

            <div className="tarjeta" style={{ borderLeft: '3px solid var(--acento)' }}>
              <h3>VIZO no presenta el aviso</h3>
              <p className="pequeno" style={{ margin: 0 }}>
                Descarga los archivos, preséntalos en el portal del SPPLD con la e.firma del
                sujeto obligado, y registra aquí el acuse que te devuelva. La
                responsabilidad de la presentación es del obligado; VIZO deja el archivo
                listo y conserva la prueba.
              </p>
            </div>
          </div>

          {/* ── Columna derecha: archivos y acciones ──────────────────── */}
          <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
            <div className="tarjeta">
              <h3>
                Archivos a presentar
                {detalle.fragmentos > 1 && (
                  <span className="chip">{detalle.fragmentos} lotes</span>
                )}
              </h3>
              <p className="tenue pequeno" style={{ margin: '0 0 .8rem' }}>
                {detalle.fragmentos > 1
                  ? 'El SPPLD rechaza archivos de más de 2 MB, así que el informe va partido. Cada lote es un archivo completo y se presenta por separado.'
                  : 'Un solo archivo.'}
              </p>
              <div style={{ display: 'grid', gap: '.8rem' }}>
                {detalle.lotes.map((l) => (
                  <div key={l.lote} style={{ borderTop: '1px solid var(--linea)', paddingTop: '.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
                      <strong className="pequeno">
                        Lote {l.lote} de {l.totalLotes}
                      </strong>
                      <span className="tenue pequeno num">
                        {(l.bytes / 1024).toFixed(1)} KB · {l.avisosEnLote} aviso(s)
                      </span>
                    </div>
                    <a className="pequeno" href={`/avisos/${detalle.id}/lote/${String(l.lote)}`}>
                      Descargar XML
                    </a>
                    <span className="hash">{l.hashSha256}</span>
                  </div>
                ))}
              </div>
            </div>

            {detalle.estatus === 'validado' && (
              <div className="tarjeta">
                <h3>Siguiente paso</h3>
                <p className="tenue pequeno" style={{ margin: '0 0 .8rem' }}>
                  El XML pasó el XSD. Falta que una persona lo revise.
                </p>
                <BotonListoRevision avisoId={detalle.id} puede={esAdmin} />
              </div>
            )}

            {detalle.estatus === 'listo_revision' && (
              <div className="tarjeta">
                <h3>Aprobación</h3>
                <BotonAprobar avisoId={detalle.id} puede={esAdmin} />
              </div>
            )}

            {detalle.estatus === 'aprobado' && (
              <div className="tarjeta">
                <h3>Registrar el acuse</h3>
                <p className="tenue pequeno" style={{ margin: '0 0 .8rem' }}>
                  Cuando lo hayas presentado en el SPPLD, sube el acuse. El estado lo
                  declara la evidencia, no un clic.
                </p>
                <FormularioAcuse avisoId={detalle.id} puede={esAdmin} />
              </div>
            )}

            {detalle.estatus === 'presentado' && (
              <div className="tarjeta">
                <h3>Presentado</h3>
                <p className="pequeno" style={{ margin: 0 }}>
                  El acuse está guardado. Este periodo está cumplido y su evidencia es
                  verificable.
                </p>
              </div>
            )}
          </div>
        </div>
      </Marco>
    )
  })
}
