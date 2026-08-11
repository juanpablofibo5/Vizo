import Link from 'next/link'
import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { Marco } from '../componentes/marco'

export const dynamic = 'force-dynamic'

interface Datos {
  cadena: { rota: boolean; secuencia: number | null; motivo: string | null; eventos: number }
  cabeza: string | null
  manifiestos: Array<{
    id: string
    version: number
    hash: string
    generadoEn: string
    cliente: string
    hashCabeza: string
  }>
}

/**
 * La evidencia.
 *
 * Tres cosas que el sistema sabe hacer desde la semana 8 y que nunca se habían
 * podido ver: verificar que la bitácora no fue alterada, los manifiestos con su
 * huella, y la reconstrucción histórica de un expediente.
 *
 * Es la pantalla que ningún competidor del segmento puede enseñar, y la única
 * respuesta seria a "¿cómo sé que estos registros no los tocaron?". El
 * verificador NO se ejecuta al pintar sobre una copia ni sobre nada raro: corre
 * `app.bitacora_verificar` sobre la bitácora real, que es de solo lectura por
 * construcción.
 */
export default async function Evidencia() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const datos = await leerComoUsuario(db, sesion, async (): Promise<Datos> => {
      const v = await db.query(`select * from app.bitacora_verificar($1)`, [sesion.tenantId])
      const roto = v.rows[0] as { secuencia_rota: number; motivo: string } | undefined

      const n = await db.query(
        `select count(*)::int as n, app.bitacora_cabeza($1) as cabeza
           from bitacora where tenant_id = $1`,
        [sesion.tenantId],
      )
      const conteo = n.rows[0] as { n: number; cabeza: string | null }

      const m = await db.query(
        `select m.id::text, m.version, m.hash_sha256, m.hash_bitacora_cabeza,
                to_char(m.generado_en at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as generado_en,
                c.nombre_o_razon_social as cliente
           from manifiestos m
           join expedientes e on e.tenant_id = m.tenant_id and e.id = m.expediente_id
           join clientes_finales c on c.tenant_id = e.tenant_id and c.id = e.cliente_id
          where m.tenant_id = $1
          order by m.generado_en desc
          limit 20`,
        [sesion.tenantId],
      )

      return {
        cadena: {
          rota: roto !== undefined,
          secuencia: roto?.secuencia_rota ?? null,
          motivo: roto?.motivo ?? null,
          eventos: conteo.n,
        },
        cabeza: conteo.cabeza,
        manifiestos: (
          m.rows as Array<{
            id: string
            version: number
            hash_sha256: string
            hash_bitacora_cabeza: string
            generado_en: string
            cliente: string
          }>
        ).map((x) => ({
          id: x.id,
          version: x.version,
          hash: x.hash_sha256,
          hashCabeza: x.hash_bitacora_cabeza,
          generadoEn: x.generado_en,
          cliente: x.cliente,
        })),
      }
    })

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Evidencia</h1>
        <p className="sub">
          Lo que se enseña cuando alguien pregunta si estos registros son confiables.
        </p>

        <h2>Integridad de la bitácora</h2>
        <div
          className="tarjeta"
          style={{
            borderColor: datos.cadena.rota ? 'var(--critico)' : 'var(--ok)',
            background: datos.cadena.rota ? 'var(--critico-suave)' : 'var(--ok-suave)',
            borderWidth: '1.5px',
          }}
        >
          {datos.cadena.rota ? (
            <>
              <h3 style={{ color: 'var(--critico)' }}>
                La cadena está rota en el evento {datos.cadena.secuencia}
              </h3>
              <p className="pequeno" style={{ margin: '.3rem 0 0' }}>
                {datos.cadena.motivo}
              </p>
              <p className="pequeno" style={{ margin: '.6rem 0 0' }}>
                Esto significa que alguien con acceso directo a la base modificó o borró un
                registro. No es un error del sistema: es un hallazgo.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ color: 'var(--ok)' }}>Cadena íntegra</h3>
              <p className="pequeno" style={{ margin: '.3rem 0 0' }}>
                Los {datos.cadena.eventos} eventos registrados encadenan correctamente. Cada uno
                lleva el hash del anterior, así que alterar cualquiera rompe todos los
                siguientes.
              </p>
            </>
          )}

          {datos.cabeza !== null && (
            <div style={{ marginTop: '.9rem' }}>
              <span className="tenue pequeno">Cabeza de la cadena</span>
              <span className="hash">{datos.cabeza}</span>
            </div>
          )}
        </div>

        <div className="tarjeta" style={{ marginTop: '1rem' }}>
          <h3>Lo que esta verificación NO detecta</h3>
          <p className="pequeno" style={{ margin: 0 }}>
            Que le corten la cola. Si alguien borra los últimos eventos, lo que queda sigue
            siendo una cadena válida — solo que más corta. Eso no lo cierra el encadenamiento
            sino el ancla de los manifiestos: cada uno guarda la cabeza de la bitácora en el
            momento de generarse, así que un manifiesto viejo prueba hasta dónde llegaba la
            cadena entonces.
          </p>
        </div>

        <h2>Manifiestos</h2>
        <p className="pequeno tenue" style={{ marginTop: '-.2rem' }}>
          La foto sellable de un expediente: qué documentos lo integraban y con qué huella. Se
          generan desde el expediente del cliente.
        </p>
        {datos.manifiestos.length === 0 ? (
          <div className="tarjeta">
            <p className="tenue" style={{ margin: 0 }}>
              Todavía no hay manifiestos. Se generan desde{' '}
              <Link href="/clientes">el expediente de un cliente</Link> una vez evaluada su
              completitud.
            </p>
          </div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="num">Versión</th>
                  <th>Generado</th>
                  <th>Huella y ancla</th>
                </tr>
              </thead>
              <tbody>
                {datos.manifiestos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.cliente}</td>
                    <td className="num">v{m.version}</td>
                    <td className="mono pequeno">{m.generadoEn} UTC</td>
                    <td>
                      <span className="tenue pequeno">manifiesto</span>
                      <span className="hash">{m.hash}</span>
                      <span className="tenue pequeno">bitácora al generarlo</span>
                      <span className="hash">{m.hashCabeza}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Reconstrucción histórica</h2>
        <div className="tarjeta">
          <p className="pequeno" style={{ margin: 0 }}>
            &ldquo;¿Cómo estaba este expediente el 15 de mayo?&rdquo; se responde leyendo{' '}
            <strong>solo la bitácora</strong> — sin consultar las tablas de estado, que dicen
            cómo están las cosas hoy y no cómo estaban entonces. La consulta existe y está
            probada; su pantalla llega con el expediente del cliente.
          </p>
        </div>
      </Marco>
    )
  })
}
