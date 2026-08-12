import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { registrarDocumento } from '../../src/persistencia/documentos'
import {
  abrirExpediente,
  aprobarExpediente,
  historialDelExpediente,
  recalcularCompletitud,
} from '../../src/persistencia/expediente'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2026-08-11'

/**
 * La aprobación del expediente.
 *
 * Estar completo y estar aprobado son cosas distintas, y confundirlas es el
 * error que estos tests existen para impedir: la completitud CUENTA documentos,
 * la aprobación afirma que sirven. Lo segundo no lo puede hacer una máquina.
 */
describe('Aprobación del expediente', () => {
  let db: Client
  let admin: ContextoSesion
  let capturista: ContextoSesion
  let clienteId: string
  let expedienteId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')

    const u = await db.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1) returning id::text`,
      [`cap${marca}@vizo.test`],
    )
    const capturistaId = (u.rows[0] as { id: string }).id
    await db.query(
      `insert into usuarios (id, tenant_id, email, nombre, rol)
       values ($1,$2,$3,'Capturista','capturista')`,
      [capturistaId, admin.tenantId, `cap${marca}@vizo.test`],
    )
    capturista = { usuarioId: capturistaId, tenantId: admin.tenantId, rol: 'capturista' }

    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion='V_BIS'`,
      [admin.tenantId],
    )
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Aprobable SA','MX') returning id`,
      [admin.tenantId, `APR${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const r = await abrirExpediente(db, { sesion: admin, clienteId })
    expedienteId = r.expedienteId
  })

  const estatus = async (): Promise<string> => {
    const { rows } = await db.query(`select estatus::text from expedientes where id = $1`, [
      expedienteId,
    ])
    return (rows[0] as { estatus: string }).estatus
  }

  /** Sube todo lo que el catálogo exige, para llegar a `completo`. */
  const completarExpediente = async (): Promise<void> => {
    const almacen = almacenComo(admin)
    const { rows } = await db.query(
      `select ce.campo
         from campos_expediente ce
         join expedientes e on e.actividad_id = ce.actividad_id
        where e.id = $1 and ce.obligatorio
          and ce.tipo_dato = 'documento'
          and ce.aplica_a in ('ambas','persona_moral')
          and daterange(ce.vigente_desde, ce.vigente_hasta, '[]') @> $2::date`,
      [expedienteId, HOY],
    )
    for (const f of rows as Array<{ campo: string }>) {
      await registrarDocumento(db, almacen, {
        sesion: admin,
        expedienteId,
        documento: {
          campo: f.campo,
          nombreArchivo: `${f.campo}.pdf`,
          mime: 'application/pdf',
          bytes: new Uint8Array(randomBytes(128)),
        },
      })
    }
    // Los datos de captura que el catálogo exige y que no son archivos.
    await db.query(
      `update clientes_finales
          set fecha_nacimiento_o_constitucion = '2018-03-12',
              domicilio = '{"calle":"CALLE 60","cp":"97000"}'::jsonb,
              giro_mercantil = '1'
        where id = $1`,
      [clienteId],
    )
    await recalcularCompletitud(db, { sesion: admin, expedienteId, fecha: HOY })
  }

  it('un expediente INCOMPLETO no se aprueba', async () => {
    // El caso que más importa: aprobar lo que le falta algo convierte la
    // aprobación en un trámite, y con eso deja de acreditar nada.
    await recalcularCompletitud(db, { sesion: admin, expedienteId, fecha: HOY })
    expect(await estatus()).toBe('incompleto')

    await expect(aprobarExpediente(db, { sesion: admin, expedienteId })).rejects.toThrow(
      /expediente completo/i,
    )
    expect(await estatus()).toBe('incompleto')
  })

  it('EL CAPTURISTA NO PUEDE APROBAR, aunque esté completo', async () => {
    await completarExpediente()
    expect(await estatus()).toBe('completo')

    // La regla no vive en la pantalla: `app.expediente_aprobar` es SECURITY
    // DEFINER, así que RLS no la protege y lo único que separa a un capturista
    // de aprobar es su comprobación interna.
    await expect(aprobarExpediente(db, { sesion: capturista, expedienteId })).rejects.toThrow(
      /rol admin/i,
    )
    expect(await estatus()).toBe('completo')
  })

  it('el admin aprueba, y queda QUIÉN y CUÁNDO', async () => {
    await completarExpediente()
    await aprobarExpediente(db, { sesion: admin, expedienteId })

    expect(await estatus()).toBe('aprobado')

    const { rows } = await db.query(
      `select aprobado_por::text, aprobado_en from expedientes where id = $1`,
      [expedienteId],
    )
    const e = rows[0] as { aprobado_por: string; aprobado_en: Date }
    // Sin nombre y hora, la aprobación no acredita nada.
    expect(e.aprobado_por).toBe(admin.usuarioId)
    expect(e.aprobado_en).toBeInstanceOf(Date)
  })

  it('un expediente aprobado NO se degrada solo al recalcular', async () => {
    // Si el catálogo cambia bajo un expediente ya aprobado, quitar la
    // aprobación en silencio borraría la firma de una persona. Eso es un caso
    // que un humano tiene que ver, no un efecto secundario.
    await completarExpediente()
    await aprobarExpediente(db, { sesion: admin, expedienteId })

    await recalcularCompletitud(db, { sesion: admin, expedienteId, fecha: HOY })
    expect(await estatus()).toBe('aprobado')
  })

  it('el historial cuenta cómo llegó ahí, no solo dónde está', async () => {
    await completarExpediente()
    await aprobarExpediente(db, { sesion: admin, expedienteId })

    const historial = await enTransaccionDeSesion(db, admin, () =>
      historialDelExpediente(db, { sesion: admin, expedienteId }),
    )

    const eventos = historial.map((h) => h.evento)
    expect(eventos).toContain('expediente.abierto')
    expect(eventos).toContain('documento.alta')
    expect(eventos).toContain('expediente.aprobado')

    const aprobacion = historial.find((h) => h.evento === 'expediente.aprobado')
    expect(aprobacion?.ocurridoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
