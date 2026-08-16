import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { arranqueDelObligado, type ClaveDePaso } from '../../src/persistencia/arranque'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { pesos } from '../../src/dominio/dinero'

/**
 * El arranque del obligado.
 *
 * El defecto que originó esto: un obligado recién creado leía "Todo presentado"
 * en Inicio. El sistema no sabía nada de él —ni actividad contratada— y aun así
 * afirmaba cumplimiento. Estos tests fijan la diferencia entre *todavía no sé*
 * y *no debes nada*, que es la única distinción que esa pantalla no puede
 * equivocar.
 */
describe('Arranque del obligado', () => {
  let db: Client
  let sesion: ContextoSesion
  let vBisId: string
  let xvId: string
  let marca: string

  beforeAll(async () => {
    db = await conectar()
    const r = await db.query(
      `select fraccion::text, id::text from actividades_vulnerables
        where fraccion in ('V_BIS','XV')`,
    )
    const filas = r.rows as Array<{ fraccion: string; id: string }>
    vBisId = filas.find((f) => f.fraccion === 'V_BIS')?.id ?? ''
    xvId = filas.find((f) => f.fraccion === 'XV')?.id ?? ''
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
  })

  const leer = () => enTransaccionDeSesion(db, sesion, () => arranqueDelObligado(db, { sesion }))

  /** Los pasos que faltan, por clave: lo que el checklist va a pintar sin marca. */
  const faltan = async (): Promise<ClaveDePaso[]> =>
    (await leer()).pasos.filter((p) => !p.hecho).map((p) => p.clave)

  const contratar = async (actividadId: string): Promise<void> => {
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      actividadId,
    ])
  }

  it('un obligado recién creado NO está en regla: está sin arrancar', async () => {
    const a = await leer()

    // Lo importante no es que falte todo. Es que el sistema lo SEPA, en vez de
    // leer el silencio como cumplimiento.
    expect(a.puedeEvaluar).toBe(false)
    expect(a.completo).toBe(false)
    expect(a.hechos).toBe(0)
  })

  it('sin actividad contratada el semáforo no puede opinar', async () => {
    expect((await leer()).puedeEvaluar).toBe(false)
    await contratar(vBisId)
    expect((await leer()).puedeEvaluar).toBe(true)
  })

  describe('los pasos dependen de lo contratado', () => {
    it('desarrollo inmobiliario se pide a quien desarrolla (V Bis)', async () => {
      await contratar(vBisId)
      expect(await faltan()).toContain('desarrollo')
    })

    it('a un arrendador (Fr. XV) NO se le pide un desarrollo que no tiene', async () => {
      // Pedírselo sería una casilla imposible de marcar para siempre. Y es la
      // misma propiedad que probó la Fr. XV: lo que cambia entre actividades
      // vive en el catálogo, no en el código.
      await contratar(xvId)
      const a = await leer()
      expect(a.pasos.map((p) => p.clave)).not.toContain('desarrollo')
    })
  })

  it('la fecha de alta ante la autoridad marca su paso', async () => {
    await contratar(vBisId)
    expect(await faltan()).toContain('fecha_alta')

    await db.query(`update tenants set fecha_alta_autoridad = '2024-03-01' where id = $1`, [
      sesion.tenantId,
    ])
    expect(await faltan()).not.toContain('fecha_alta')
  })

  it('una sucursal DESACTIVADA no cuenta como sucursal', async () => {
    await contratar(vBisId)
    await db.query(
      `insert into sucursales (tenant_id,nombre,clave,activa) values ($1,'Cerrada','CER',false)`,
      [sesion.tenantId],
    )
    expect(await faltan()).toContain('sucursal')

    await db.query(`insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ')`, [
      sesion.tenantId,
    ])
    expect(await faltan()).not.toContain('sucursal')
  })

  it('el expediente cuenta cuando está APROBADO, no cuando está completo', async () => {
    // Completo lo declara el sistema al ver los documentos; aprobado lo declara
    // una persona. El arranque termina con la decisión humana, no con el
    // cálculo — es la misma frontera que el aviso.
    await contratar(vBisId)
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Cliente SA','MX') returning id`,
      [sesion.tenantId, `ARR${marca}`],
    )
    const clienteId = (c.rows[0] as { id: string }).id

    await db.query(
      `insert into expedientes (tenant_id,cliente_id,actividad_id,estatus)
       values ($1,$2,$3,'completo')`,
      [sesion.tenantId, clienteId, vBisId],
    )
    expect(await faltan()).toContain('expediente')

    await db.query(
      `update expedientes set estatus='aprobado', aprobado_por=$2, aprobado_en=now()
        where tenant_id=$1`,
      [sesion.tenantId, sesion.usuarioId],
    )
    expect(await faltan()).not.toContain('expediente')
  })

  it('el arranque NO termina al configurar: termina con un periodo presentado', async () => {
    await contratar(vBisId)
    const formato = await db.query(
      `select id from formatos_aviso where actividad_id = $1 limit 1`,
      [vBisId],
    )
    const formatoId = (formato.rows[0] as { id: string }).id

    // Un aviso aprobado todavía no salió: VIZO no presenta, presenta el
    // obligado. Mientras no haya acuse, el circuito no se probó de punta a
    // punta — y descubrir que no funciona el día 17 es tarde.
    await db.query(
      `insert into avisos (tenant_id,actividad_id,periodo,tipo,estatus,formato_aviso_id,
                           aprobado_por,aprobado_en)
       values ($1,$2,'2026-05-01','normal','aprobado',$3,$4,now())`,
      [sesion.tenantId, vBisId, formatoId, sesion.usuarioId],
    )
    expect(await faltan()).toContain('periodo')

    await db.query(
      `update avisos set estatus='presentado',
              acuse_storage_path = $1::text || '/acuse.pdf', acuse_folio='2026-44718'
        where tenant_id = $1`,
      [sesion.tenantId],
    )
    expect(await faltan()).not.toContain('periodo')
  })

  it('con todo hecho el checklist se declara completo', async () => {
    await contratar(vBisId)
    await db.query(`update tenants set fecha_alta_autoridad = '2024-03-01' where id = $1`, [
      sesion.tenantId,
    ])

    // Persona MORAL a propósito: es el camino más exigente, porque es a quien
    // el Art. 20 le pide designar REC. Con 'fisica' el paso ni aparecería y
    // este caso dejaría de vigilarlo — «completo» saldría verde por ser corto.
    await db.query(`update tenants set tipo_persona = 'moral' where id = $1`, [sesion.tenantId])
    await db.query(
      `insert into designaciones_rec
         (tenant_id, rfc, nombre, fecha_designacion, estado, fecha_respuesta)
       values ($1,'PEGJ800101AB1','Persona Designada',
               current_date - 30, 'aceptada', current_date - 25)`,
      [sesion.tenantId],
    )

    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [sesion.tenantId],
    )
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Cliente SA','MX') returning id`,
      [sesion.tenantId, `ARR${marca}`],
    )
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Arranque','LIC20260009','31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [sesion.tenantId],
    )
    const clienteId = (c.rows[0] as { id: string }).id

    await db.query(
      `insert into expedientes (tenant_id,cliente_id,actividad_id,estatus,aprobado_por,aprobado_en)
       values ($1,$2,$3,'aprobado',$4,now())`,
      [sesion.tenantId, clienteId, vBisId, sesion.usuarioId],
    )

    await registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId: (s.rows[0] as { id: string }).id,
        clienteId,
        desarrolloId: (d.rows[0] as { id: string }).id,
        fechaOperacion: '2026-05-15',
        montoBase: pesos(1_200_000),
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

    const formato = await db.query(
      `select id from formatos_aviso where actividad_id = $1 limit 1`,
      [vBisId],
    )
    await db.query(
      `insert into avisos (tenant_id,actividad_id,periodo,tipo,estatus,formato_aviso_id,
                           aprobado_por,aprobado_en,acuse_storage_path,acuse_folio)
       values ($1,$2,'2026-05-01','normal','presentado',$3,$4,now(),$5,'2026-44718')`,
      [
        sesion.tenantId,
        vBisId,
        (formato.rows[0] as { id: string }).id,
        sesion.usuarioId,
        `${sesion.tenantId}/acuse.pdf`,
      ],
    )

    const a = await leer()
    expect(a.pasos.filter((p) => !p.hecho)).toEqual([])
    expect(a.completo).toBe(true)
    expect(a.hechos).toBe(a.pasos.length)
  })

  it('el capturista ve el MISMO arranque que el admin', async () => {
    // Si alguna de estas lecturas quedara restringida al admin, el checklist le
    // mentiría al capturista: le pintaría como pendiente algo que ya está
    // hecho, y lo mandaría a rehacerlo.
    await contratar(vBisId)
    await db.query(`insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ')`, [
      sesion.tenantId,
    ])

    const comoAdmin = await leer()

    const u = await db.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
               'authenticated','authenticated',$1) returning id`,
      [`capturista-${marca}@ejemplo.mx`],
    )
    const capturistaId = (u.rows[0] as { id: string }).id
    await db.query(
      `insert into usuarios (id, tenant_id, rol, nombre, email)
       values ($1,$2,'capturista','Capturista',$3)`,
      [capturistaId, sesion.tenantId, `capturista-${marca}@ejemplo.mx`],
    )

    const sesionCapturista: ContextoSesion = {
      usuarioId: capturistaId,
      tenantId: sesion.tenantId,
      rol: 'capturista',
    }
    const comoCapturista = await enTransaccionDeSesion(db, sesionCapturista, () =>
      arranqueDelObligado(db, { sesion: sesionCapturista }),
    )

    expect(comoCapturista).toEqual(comoAdmin)
  })
})
