import Link from 'next/link'
import { Client } from 'pg'
import { Marco } from '../../../../componentes/marco'
import { obligadoDeSesion, sesionRequerida } from '../../../../../src/supabase/sesion'
import {
  reconstruirExpediente,
  SinRastroEnBitacora,
} from '../../../../../src/persistencia/reconstruccion'
import { fechaEn, hoyEnMexico } from '../../../../../src/dominio/fechas'

/**
 * Un instante UTC de la bitácora, dicho en fecha de México.
 *
 * SALIÓ AL VERLO EN PANTALLA. La reconstrucción devuelve instantes en UTC y el
 * corte se expresa en fecha de México, así que cortar "al 2026-08-11" y luego
 * decir "abierto el 2026-08-12" —el mismo evento, dos husos— se lee como una
 * contradicción del sistema. No lo era: el corte es el día completo en México,
 * y las 00:01 UTC del día siguiente caen dentro.
 *
 * Parecer incoherente le cuesta a un producto de cumplimiento casi lo mismo que
 * serlo. Todo lo que se pinta junto va en el mismo huso.
 */
const enFechaLocal = (instanteUtc: string): string => fechaEn(new Date(instanteUtc))

export const dynamic = 'force-dynamic'

/**
 * "¿Cómo estaba este expediente el día Y?"
 *
 * La pregunta que se hace en una visita de la autoridad, y la que ningún
 * sistema de estado puede responder: las tablas dicen cómo están las cosas HOY.
 * Un documento reemplazado la semana pasada seguía vigente el mes anterior, y
 * una completitud recalculada ayer no es la que regía entonces.
 *
 * La respuesta se arma leyendo SOLO la bitácora. Que no consulte `documentos`
 * ni `expedientes` no es purismo: es la prueba de que la bitácora basta, y por
 * lo tanto de que el registro se sostiene solo.
 */
export default async function HistoricoExpediente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ hasta?: string }>
}) {
  const { id: clienteId } = await params
  const { hasta } = await searchParams
  const sesion = await sesionRequerida()
  const obligado = await obligadoDeSesion()

  // Sin fecha, hoy: la reconstrucción de hoy debe coincidir con lo que muestra
  // el expediente, y verlas iguales es lo que da confianza en las que no.
  const corte = hasta !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : hoyEnMexico()

  const db = new Client({ connectionString: process.env['VIZO_DB_URL'] ?? '' })
  await db.connect()

  try {
    await db.query('begin')
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated',
           'app_metadata', json_build_object('tenant_id',$2::text,'rol',$3::text))::text, true)`,
      [sesion.usuarioId, sesion.tenantId, sesion.rol],
    )
    await db.query('set local role authenticated')

    const cli = await db.query(
      `select nombre_o_razon_social from clientes_finales where id = $1`,
      [clienteId],
    )
    const exp = await db.query(
      `select id from expedientes where cliente_id = $1 order by version desc limit 1`,
      [clienteId],
    )

    const cliente = (cli.rows[0] as { nombre_o_razon_social: string } | undefined)
    const expedienteId = (exp.rows[0] as { id: string } | undefined)?.id

    if (cliente === undefined || expedienteId === undefined) {
      await db.query('rollback')
      return (
        <Marco obligado={obligado} perfil={sesion}>
          <p className="error">Este cliente no tiene expediente en tu obligado.</p>
          <Link href="/clientes">← Volver a clientes</Link>
        </Marco>
      )
    }

    let estado = null
    let sinRastro: string | null = null
    try {
      estado = await reconstruirExpediente(db, {
        sesion: { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol },
        expedienteId,
        hasta: corte,
      })
    } catch (e) {
      // "No existía todavía" y "sus eventos no se registraron" se ven igual
      // desde aquí, y la segunda es un problema. Se dice tal cual en vez de
      // pintar un expediente vacío, que las confundiría en silencio.
      if (e instanceof SinRastroEnBitacora) sinRastro = e.message
      else throw e
    }

    await db.query('rollback')

    return (
      <Marco obligado={obligado} perfil={sesion}>
        <p className="pequeno" style={{ marginBottom: '.6rem' }}>
          <Link href={`/clientes/${clienteId}/expediente`}>← Expediente</Link>
        </p>

        <h1>{cliente.nombre_o_razon_social}</h1>
        <p className="sub">
          Estado del expediente <strong>a una fecha</strong>, reconstruido leyendo solo la
          bitácora.
        </p>

        <form className="tarjeta" style={{ marginBottom: '1.5rem' }}>
          <label style={{ margin: 0, maxWidth: '18rem' }}>
            <span>
              Ver cómo estaba el <span className="pista">día completo, hora de México</span>
            </span>
            <input type="date" name="hasta" defaultValue={corte} max={hoyEnMexico()} />
          </label>
          <button type="submit" style={{ marginTop: '.7rem' }}>
            Reconstruir
          </button>
        </form>

        {sinRastro !== null ? (
          <div className="aviso">
            <strong>A esa fecha no hay nada que reconstruir.</strong>
            <p className="pequeno" style={{ margin: '.5rem 0 0' }}>
              O el expediente no existía todavía, o sus eventos no llegaron a la bitácora — y
              esas dos cosas no son lo mismo. La segunda es un problema, así que el sistema
              lo dice en vez de enseñar un expediente vacío que las confundiría.
            </p>
            <p className="tenue pequeno" style={{ margin: '.5rem 0 0' }}>{sinRastro}</p>
          </div>
        ) : estado === null ? null : (
          <>
            <div className="tarjeta" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '.7rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Al {corte}</h3>
                {estado.completitud === null ? (
                  <span className="estado neutro">Sin evaluar entonces</span>
                ) : (
                  <span className="estado neutro">
                    {estado.completitud.estatus} · {estado.completitud.cubiertos} de{' '}
                    {estado.completitud.totalObligatorios}
                  </span>
                )}
              </div>
              <p className="tenue pequeno" style={{ margin: '.5rem 0 0' }}>
                {/* El número de eventos hace auditable la propia reconstrucción:
                    se puede comprobar contra la bitácora. */}
                Se leyeron {estado.eventosConsiderados} evento(s) de la bitácora
                {estado.abiertoEn !== null &&
                  ` · expediente abierto el ${enFechaLocal(estado.abiertoEn)}`}
                .
              </p>
            </div>

            <h2>Documentos vigentes entonces</h2>
            <p className="sub">
              No los de hoy: los que integraban el expediente a esa fecha. Uno reemplazado
              después sigue apareciendo aquí, porque entonces era el bueno.
            </p>
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Huella SHA-256</th>
                    <th>Registrado</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.documentos.length === 0 ? (
                    <tr>
                      <td className="vacia" colSpan={3}>
                        A esa fecha el expediente no tenía documentos.
                      </td>
                    </tr>
                  ) : (
                    estado.documentos.map((d) => (
                      <tr key={d.documentoId}>
                        <td>{d.campo}</td>
                        <td>
                          <span className="hash">{d.hashSha256}</span>
                        </td>
                        <td className="mono pequeno">{enFechaLocal(d.registradoEn)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {estado.completitud !== null && estado.completitud.faltantes.length > 0 && (
              <div className="aviso" style={{ marginTop: '1rem' }}>
                <strong>Faltaba entonces:</strong> {estado.completitud.faltantes.join(', ')}.
              </div>
            )}

            {estado.manifiestos.length > 0 && (
              <>
                <h2>Manifiestos generados hasta esa fecha</h2>
                <div className="tabla-envoltura">
                  <table>
                    <thead>
                      <tr>
                        <th>Versión</th>
                        <th>Huella SHA-256</th>
                        <th>Generado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estado.manifiestos.map((m) => (
                        <tr key={m.manifiestoId}>
                          <td>v{m.version}</td>
                          <td>
                            <span className="hash">{m.hashSha256}</span>
                          </td>
                          <td className="mono pequeno">{enFechaLocal(m.generadoEn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="tarjeta" style={{ marginTop: '1.5rem', borderLeft: '3px solid var(--acento)' }}>
              <h3>De dónde sale esto</h3>
              <p className="pequeno" style={{ margin: 0 }}>
                Solo de la bitácora. Ni una consulta a las tablas de documentos o
                expedientes, que dicen cómo están las cosas <strong>hoy</strong>. Hay un test
                que lo demuestra sin ambigüedad: borra el expediente y sus documentos de las
                tablas de estado, y esta reconstrucción sigue devolviendo lo que había.
              </p>
            </div>
          </>
        )}
      </Marco>
    )
  } finally {
    await db.end()
  }
}
