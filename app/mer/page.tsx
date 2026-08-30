import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { listarMer, type MerListado } from '../../src/persistencia/mer'
import { estadoDelRiesgo } from '../../src/persistencia/riesgo'
import { hoyEnMexico } from '../../src/dominio/fechas'
import { Marco } from '../componentes/marco'
import { BotonEmitirMer } from './descargar'

export const dynamic = 'force-dynamic'

/**
 * El MER: el documento de la Metodología de Evaluación de Riesgo, emitido.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA TIENE QUE LOGRAR
 * ────────────────────────────────────────────────────────────────────────────
 * Que nadie confunda de quién es el documento. El MER es DEL OBLIGADO: VIZO lo
 * compone con lo que el obligado declaró (su método, sus factores, sus pesos,
 * su escala, sus mitigantes) y con la evaluación de entidad que su modelo
 * vigente produjo — pero no le inventa ni una coma. Lo que el obligado no ha
 * declarado sale en el documento como hueco con nombre, no como un texto
 * plausible que lo tape (ADR-29, ADR-21).
 *
 * Emitir es un acto: el texto se congela con su huella y queda en bitácora.
 * Solo se emite del modelo VIGENTE — un MER de un borrador documentaría, con
 * el nombre del obligado, una metodología que nadie aprobó.
 */

export default async function PantallaMer() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const { emitidos, hayVigente } = await leerComoUsuario(db, sesion, async () => {
      const emitidos: MerListado[] = await listarMer(db, { sesion })
      const riesgo = await estadoDelRiesgo(db, { sesion, hoy: hoyEnMexico() })
      return { emitidos, hayVigente: riesgo.vigente !== null }
    })

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>MER — Metodología de Evaluación de Riesgo</h1>
        <p className="sub" style={{ maxWidth: '46rem' }}>
          El documento que responde «¿cuál es su metodología?» cuando la autoridad pregunta. Se
          emite del modelo vigente, congelado con su huella — y el Manual lo referencia por esa
          huella (Art. 37 ¶2 del Acuerdo 115/2026).
        </p>

        {/* De quién es el documento, antes que nada. */}
        <div className="tarjeta" style={{ borderLeft: '3px solid var(--acento)' }}>
          <h3 style={{ marginTop: 0 }}>Este documento es del obligado</h3>
          <p className="pequeno" style={{ margin: 0 }}>
            VIZO lo compone con lo que el obligado declaró — método, factores, pesos, escala de
            efectividad, mitigantes — y con la evaluación de entidad que su modelo vigente
            produjo. <strong>No le inventa ni una coma</strong>: lo que falta por declarar
            aparece en el texto como hueco con nombre, con la pregunta que hay que contestar. Un
            MER con huecos visibles es honesto; uno rellenado por el proveedor es de nadie.
          </p>
        </div>

        <div className="rejilla" style={{ marginTop: '1.5rem' }}>
          <div className="tarjeta">
            <span className="tenue pequeno">MER emitidos</span>
            <div style={{ fontSize: '1.9rem', fontWeight: 620 }} className="num">
              {emitidos.length}
            </div>
            <span className="pequeno tenue">
              {emitidos[0] === undefined
                ? 'todavía ninguno'
                : `el último, de la metodología v${String(emitidos[0].version)}`}
            </span>
          </div>
          <div className="tarjeta" style={{ display: 'grid', alignContent: 'center' }}>
            {hayVigente ? (
              <BotonEmitirMer puede={perfil.rol === 'admin'} />
            ) : (
              <p className="pequeno tenue" style={{ margin: 0 }}>
                No hay una versión vigente de la metodología, así que no hay documento que
                emitir — y VIZO no lo inventa. Se aprueba en Configuración → Modelo de riesgo.
              </p>
            )}
          </div>
        </div>

        <h2 style={{ marginTop: '2rem' }}>Emisiones</h2>
        <p className="sub" style={{ maxWidth: '46rem' }}>
          Cada emisión quedó congelada con su huella. Si dos difieren, difieren porque la
          metodología o su evaluación cambiaron entre una y otra — nunca porque el texto se haya
          editado.
        </p>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Metodología</th>
                <th>Secciones</th>
                <th>Grado de la entidad</th>
                <th>Huella SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {emitidos.length === 0 ? (
                <tr>
                  <td className="vacia" colSpan={5}>
                    Todavía no se emite ningún MER.
                  </td>
                </tr>
              ) : (
                emitidos.map((m) => (
                  <tr key={m.id}>
                    <td className="mono pequeno">{m.fecha}</td>
                    <td>v{m.version}</td>
                    <td className="pequeno">
                      {m.acreditadas} de {m.total} acreditadas
                      {m.conPendientes > 0 && (
                        <span className="tenue"> · {m.conPendientes} con pendientes</span>
                      )}
                    </td>
                    <td className="pequeno">
                      {m.gradoEntidad ?? <span className="tenue">sin evaluación citada</span>}
                    </td>
                    <td>
                      <code className="hash">{m.hash}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Marco>
    )
  })
}
