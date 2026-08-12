import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import {
  aprobarAviso,
  generarAviso,
  marcarListoParaRevision,
  registrarAcuse,
  TransicionInvalida,
} from '../../src/persistencia/aviso'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const PERIODO = '2026-05-01'
const SOBRE_UMBRAL = 1_200_000

/**
 * El flujo humano alrededor del XML.
 *
 * La aprobación es el segundo paso bloqueante del pipeline, y no la hace VIZO:
 * la hace una persona con nombre, y queda su id y su hora. Automatizarla
 * destruiría el valor probatorio de todo lo demás — un aviso aprobado por un
 * proceso no lo aprobó nadie (regla dura 5).
 */
describe('Ciclo del aviso con dos roles', () => {
  let db: Client
  let admin: ContextoSesion
  let capturista: ContextoSesion
  let almacen: AlmacenDocumentos
  let actividadId: string
  let avisoId: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')

    // DOS USUARIOS DE VERDAD en el mismo obligado, no el mismo con otro rol
    // encima: la separación se prueba con dos personas distintas, que es como
    // ocurre.
    const u = await db.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1) returning id::text`,
      [`capturista${marca}@vizo.test`],
    )
    const capturistaId = (u.rows[0] as { id: string }).id
    await db.query(
      `insert into usuarios (id, tenant_id, email, nombre, rol)
       values ($1,$2,$3,'Capturista','capturista')`,
      [capturistaId, admin.tenantId, `capturista${marca}@vizo.test`],
    )
    capturista = { usuarioId: capturistaId, tenantId: admin.tenantId, rol: 'capturista' }

    almacen = almacenComo(admin, BUCKET_AVISOS)

    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      admin.tenantId,
      actividadId,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [admin.tenantId],
    )
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora del Ciclo SA','MX') returning id`,
      [admin.tenantId, `CIC${marca}`],
    )
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Ciclo','LIC20260002','31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [admin.tenantId],
    )

    // EL CAPTURISTA CAPTURA. Es su trabajo y lo hace con su sesión.
    await registrarOperacion(db, {
      sesion: capturista,
      datos: {
        sucursalId: (s.rows[0] as { id: string }).id,
        clienteId: (c.rows[0] as { id: string }).id,
        desarrolloId: (d.rows[0] as { id: string }).id,
        fechaOperacion: '2026-05-15',
        montoBase: pesos(SOBRE_UMBRAL),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        instrumentoMonetario: '1',
        monedaCodigo: '1',
        aportacionFideicomiso: false,
        nombreInstitucion: 'BANCO EJEMPLO',
      },
    })

    const r = await generarAviso(
      db,
      { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    avisoId = r.avisoId
  })

  const estatus = async (): Promise<string> => {
    const { rows } = await db.query(`select estatus::text from avisos where id = $1`, [avisoId])
    return (rows[0] as { estatus: string }).estatus
  }

  it('el ciclo completo: validado → listo_revision → aprobado → presentado', async () => {
    expect(await estatus()).toBe('validado')

    await marcarListoParaRevision(db, { sesion: admin, avisoId })
    expect(await estatus()).toBe('listo_revision')

    await aprobarAviso(db, { sesion: admin, avisoId })
    expect(await estatus()).toBe('aprobado')

    // El acuse lo trae de vuelta la PERSONA que presentó en el portal. Es el
    // acuse lo que mueve el aviso a `presentado`: el estado no lo declara VIZO,
    // lo declara la evidencia.
    await registrarAcuse(db, {
      sesion: admin,
      avisoId,
      storagePath: `${admin.tenantId}/${avisoId}/acuse.pdf`,
      folio: '2026-4471',
    })
    expect(await estatus()).toBe('presentado')

    const { rows } = await db.query(
      `select aprobado_por::text, aprobado_en, acuse_registrado_en from avisos where id = $1`,
      [avisoId],
    )
    const a = rows[0] as { aprobado_por: string; aprobado_en: Date; acuse_registrado_en: Date }
    // Queda QUIÉN aprobó y CUÁNDO. Sin eso, la aprobación no acredita nada.
    expect(a.aprobado_por).toBe(admin.usuarioId)
    expect(a.aprobado_en).toBeInstanceOf(Date)
    expect(a.acuse_registrado_en).toBeInstanceOf(Date)
  })

  it('EL CAPTURISTA NO PUEDE APROBAR', async () => {
    // El entregable de la semana. La regla no vive en un `if` de la
    // aplicación: `app.aviso_aprobar` la comprueba dentro, así que llamarla
    // directamente desde psql tampoco funciona.
    await marcarListoParaRevision(db, { sesion: admin, avisoId })

    await expect(aprobarAviso(db, { sesion: capturista, avisoId })).rejects.toThrow(
      /rol admin puede aprobar/,
    )
    expect(await estatus()).toBe('listo_revision')
  })

  it('el capturista tampoco registra el acuse', async () => {
    await marcarListoParaRevision(db, { sesion: admin, avisoId })
    await aprobarAviso(db, { sesion: admin, avisoId })

    await expect(
      registrarAcuse(db, { sesion: capturista, avisoId, storagePath: 'x/y.pdf' , folio: '2026-4471'}),
    ).rejects.toThrow(/rol admin/)
    expect(await estatus()).toBe('aprobado')
  })

  it('no se aprueba saltándose la revisión', async () => {
    // `validado` significa que el XML pasó el XSD, no que alguien lo miró.
    await expect(aprobarAviso(db, { sesion: admin, avisoId })).rejects.toThrow(
      /listo para revisión/,
    )
    expect(await estatus()).toBe('validado')
  })

  it('no se registra acuse de un aviso que nadie aprobó', async () => {
    await expect(
      registrarAcuse(db, { sesion: admin, avisoId, storagePath: 'x/y.pdf' , folio: '2026-4471'}),
    ).rejects.toThrow(/aprobado/)
  })

  it('un aviso aprobado ya NO se puede mover con un UPDATE directo', async () => {
    // La política de la base solo deja mover el aviso entre los estados
    // previos a la aprobación. Después, solo las funciones — y ninguna
    // desaprueba.
    await marcarListoParaRevision(db, { sesion: admin, avisoId })
    await aprobarAviso(db, { sesion: admin, avisoId })

    await expect(
      marcarListoParaRevision(db, { sesion: admin, avisoId }),
    ).rejects.toThrow(TransicionInvalida)
    expect(await estatus()).toBe('aprobado')
  })

  it('el XML quedó guardado y descargable, no solo devuelto', async () => {
    // Hasta esta semana `generarAviso` regresaba la cadena y dejaba
    // xml_storage_path en NULL: el Representante no tenía nada que bajar y el
    // aviso existía solo como fila.
    const { rows } = await db.query(
      `select l.storage_path, l.hash_sha256, l.bytes, a.fragmentos, a.xml_storage_path
         from aviso_lotes l join avisos a on a.id = l.aviso_id
        where l.aviso_id = $1 order by l.lote`,
      [avisoId],
    )
    expect(rows).toHaveLength(1)
    const l = rows[0] as { storage_path: string; hash_sha256: string; bytes: number }

    const bajado = await almacen.descargar(l.storage_path)
    expect(bajado.byteLength).toBe(l.bytes)

    const { createHash } = await import('node:crypto')
    expect(createHash('sha256').update(bajado).digest('hex')).toBe(l.hash_sha256)
    // Y lo que se bajó es el XML, no otra cosa.
    expect(new TextDecoder().decode(bajado)).toContain('<mes_reportado>202605</mes_reportado>')
  })

  it('el acuse NO puede apuntar a la carpeta de otro obligado', async () => {
    // AUDITORÍA DE LA SEMANA 10. `registrarAcuse` recibía una ruta de texto
    // libre y la guardaba sin mirarla. Un acuse que apunta fuera de la carpeta
    // del obligado marca el aviso como `presentado` señalando un archivo que
    // ni siquiera se puede leer —RLS de Storage lo impide—, así que la prueba
    // de que se cumplió no prueba nada. Y el estado ya no se puede corregir:
    // avisos es append-only a partir de aprobado.
    await marcarListoParaRevision(db, { sesion: admin, avisoId })
    await aprobarAviso(db, { sesion: admin, avisoId })

    await expect(
      registrarAcuse(db, {
        sesion: admin,
        avisoId,
        storagePath: `00000000-0000-0000-0000-000000000000/${avisoId}/acuse.pdf`,
        folio: '2026-4471',
      }),
    ).rejects.toThrow(/carpeta del obligado|acuse_ruta_del_obligado/)

    expect(await estatus()).toBe('aprobado')
  })

  it('la bitácora cuenta el ciclo completo, en orden', async () => {
    await marcarListoParaRevision(db, { sesion: admin, avisoId })
    await aprobarAviso(db, { sesion: admin, avisoId })
    await registrarAcuse(db, {
      sesion: admin,
      avisoId,
      storagePath: `${admin.tenantId}/${avisoId}/acuse.pdf`,
      folio: '2026-4471',
    })

    const { rows } = await db.query(
      `select evento from bitacora
        where tenant_id = $1 and objeto_id = $2 order by secuencia`,
      [admin.tenantId, avisoId],
    )
    expect((rows as Array<{ evento: string }>).map((r) => r.evento)).toEqual([
      'aviso.generado',
      'aviso.listo_revision',
      'aviso.aprobado',
      'aviso.acuse_registrado',
    ])
  })
})
