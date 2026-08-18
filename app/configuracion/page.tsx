import { conBase, leerComoUsuario } from '../../src/supabase/conexion'
import { estadoDelRec, type EstadoRec } from '../../src/persistencia/rec'
import { Marco } from '../componentes/marco'
import { FormularioFechaAlta } from './formulario'
import { SeccionRec } from './rec'
import { SeccionEstructura } from './estructura'
import { estadoDeLaEstructura, type EstadoEstructura } from '../../src/persistencia/estructura'
import { hoyEnMexico } from '../../src/dominio/fechas'

export const dynamic = 'force-dynamic'

interface Datos {
  fechaAlta: string | null
  rec: EstadoRec
  estructura: EstadoEstructura
  actividades: Array<{ fraccion: string; nombre: string; claveSppld: string | null }>
  usuarios: Array<{ nombre: string; email: string; rol: string; activo: boolean }>
  sucursales: Array<{ nombre: string; clave: string }>
  desarrollos: Array<{ nombre: string; registroLicencia: string; activo: boolean }>
}

/**
 * La configuración del obligado.
 *
 * Todo lo que hoy solo se toca por SQL: quién es el obligado, desde cuándo debe
 * informar, qué actividades tiene contratadas, quién trabaja en la cuenta, sus
 * sucursales y sus desarrollos.
 *
 * Los catálogos operativos —sucursales, desarrollos, usuarios— se muestran en
 * solo lectura por ahora. Enseñarlos vacíos con un botón que no existe sería
 * peor que enseñarlos como están: al menos así se ve qué hay cargado y qué
 * falta antes de capturar la primera operación.
 */
export default async function Configuracion() {
  return conBase(async ({ db, sesion, perfil, obligado }) => {
    const datos = await leerComoUsuario(db, sesion, async (): Promise<Datos> => {
      const t = await db.query(
        `select fecha_alta_autoridad::text from tenants where id = $1`,
        [sesion.tenantId],
      )
      const act = await db.query(
        `select av.fraccion::text, av.nombre, av.clave_sppld
           from actividades_tenant at
           join actividades_vulnerables av on av.id = at.actividad_id
          where at.tenant_id = $1 order by av.fraccion`,
        [sesion.tenantId],
      )
      const usr = await db.query(
        `select nombre, email, rol::text, activo from usuarios
          where tenant_id = $1 order by rol, nombre`,
        [sesion.tenantId],
      )
      const suc = await db.query(
        `select nombre, clave from sucursales where tenant_id = $1 order by clave`,
        [sesion.tenantId],
      )
      const des = await db.query(
        `select nombre, registro_licencia, activo from desarrollos_inmobiliarios
          where tenant_id = $1 order by nombre`,
        [sesion.tenantId],
      )

      return {
        fechaAlta: (t.rows[0] as { fecha_alta_autoridad: string | null } | undefined)
          ?.fecha_alta_autoridad ?? null,
        rec: await estadoDelRec(db, { sesion }),
        estructura: await estadoDeLaEstructura(db, { sesion }),
        actividades: (
          act.rows as Array<{ fraccion: string; nombre: string; clave_sppld: string | null }>
        ).map((a) => ({ fraccion: a.fraccion, nombre: a.nombre, claveSppld: a.clave_sppld })),
        usuarios: usr.rows as Datos['usuarios'],
        sucursales: suc.rows as Datos['sucursales'],
        desarrollos: (
          des.rows as Array<{ nombre: string; registro_licencia: string; activo: boolean }>
        ).map((d) => ({ nombre: d.nombre, registroLicencia: d.registro_licencia, activo: d.activo })),
      }
    })

    const esAdmin = perfil.rol === 'admin'

    return (
      <Marco obligado={obligado} perfil={perfil}>
        <h1>Configuración</h1>
        <p className="sub">Quién es el obligado, desde cuándo debe informar, y con qué opera.</p>

        <h2 id="obligado">El obligado</h2>
        <div className="tarjeta" style={{ display: 'grid', gap: '1.2rem' }}>
          <div className="rejilla" style={{ gap: '.9rem' }}>
            <div>
              <span className="tenue pequeno">Razón social</span>
              <div style={{ fontWeight: 560 }}>{obligado.razonSocial}</div>
            </div>
            <div>
              <span className="tenue pequeno">RFC</span>
              <div className="mono">{obligado.rfc}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--linea)', paddingTop: '1.1rem' }}>
            <FormularioFechaAlta valor={datos.fechaAlta} puede={esAdmin} />
          </div>
        </div>

        {/* La designación del REC va aquí y no en «Usuarios» a propósito: el REC
            no es un rol de la aplicación, es una figura con exposición personal
            ante la autoridad. Ponerlo junto a admin y capturista sugeriría que
            se resuelve dando de alta a alguien en el portal, y no. */}
        <h2 id="rec">Responsable del cumplimiento</h2>
        <SeccionRec estado={datos.rec} puede={esAdmin} />

        {/* Cap. II Ter: solo existe para quien actúa por fideicomiso u otra
            figura. A una moral no se le enseña un anexo que no es el suyo. */}
        {datos.estructura.aplica && (
          <>
            <h2 id="estructura">Estructura del fideicomiso o figura</h2>
            <SeccionEstructura estado={datos.estructura} puede={esAdmin} hoy={hoyEnMexico()} />
          </>
        )}

        <h2 id="actividades">Actividades contratadas</h2>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Fracción</th>
                <th>Actividad</th>
                <th>Clave del SPPLD</th>
              </tr>
            </thead>
            <tbody>
              {datos.actividades.length === 0 ? (
                <tr>
                  <td className="vacia" colSpan={3}>
                    Ninguna actividad contratada. Sin esto el motor no puede evaluar nada.
                  </td>
                </tr>
              ) : (
                datos.actividades.map((a) => (
                  <tr key={a.fraccion}>
                    <td className="mono">{a.fraccion}</td>
                    <td>{a.nombre}</td>
                    <td className="mono">
                      {a.claveSppld ?? (
                        // NULL no es un hueco de captura: significa que no se ha
                        // descargado el formato oficial de esa fracción. Adivinar
                        // la clave produce avisos que no validan.
                        <span className="tenue">sin formato descargado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h2 id="usuarios">Usuarios</h2>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.usuarios.map((u) => (
                <tr key={u.email}>
                  <td>{u.nombre}</td>
                  <td className="mono pequeno">{u.email}</td>
                  <td>
                    <span className="chip">{u.rol}</span>
                  </td>
                  <td>
                    <span className={`estado ${u.activo ? 'ok' : 'neutro'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tenue pequeno" style={{ marginTop: '.5rem' }}>
          El alta de usuarios la hace VIZO durante la implementación. El capturista registra
          clientes y operaciones; el administrador además genera y aprueba avisos — y esa
          separación la impone la base de datos, no la pantalla.
        </p>

        <h2 id="sucursales">Sucursales y desarrollos</h2>
        <div className="rejilla">
          <div className="tarjeta">
            <h3>Sucursales</h3>
            {datos.sucursales.length === 0 ? (
              <p className="tenue pequeno" style={{ margin: 0 }}>
                Ninguna. Toda operación se registra en una sucursal.
              </p>
            ) : (
              <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
                {datos.sucursales.map((s) => (
                  <li key={s.clave} className="pequeno">
                    {s.nombre} <span className="tenue mono">({s.clave})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="tarjeta">
            <h3>Desarrollos inmobiliarios</h3>
            {datos.desarrollos.length === 0 ? (
              <p className="tenue pequeno" style={{ margin: 0 }}>
                Ninguno. El aviso los exige con su registro o licencia.
              </p>
            ) : (
              <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
                {datos.desarrollos.map((d) => (
                  <li key={d.registroLicencia} className="pequeno">
                    {d.nombre} <span className="tenue mono">({d.registroLicencia})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Marco>
    )
  })
}
