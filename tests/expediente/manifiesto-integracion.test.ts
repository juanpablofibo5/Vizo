import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { registrarDocumento } from '../../src/persistencia/documentos'
import { recalcularCompletitud } from '../../src/persistencia/expediente'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import {
  ExpedienteSinManifiesto,
  generarManifiesto,
  verificarManifiesto,
} from '../../src/persistencia/manifiesto'
import { pesos } from '../../src/dominio/dinero'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2026-08-09'

describe('Manifiesto contra la base', () => {
  let db: Client
  let sesion: ContextoSesion
  let expedienteId: string
  let clienteId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca)

    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion='V_BIS'`,
      [sesion.tenantId],
    )
    const suc = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [sesion.tenantId],
    )
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Constructora del Manifiesto SA','MX') returning id`,
      [sesion.tenantId, `MAN${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const e = await db.query(
      `insert into expedientes (tenant_id,cliente_id,actividad_id)
       select $1,$2,id from actividades_vulnerables where fraccion='V_BIS' returning id`,
      [sesion.tenantId, clienteId],
    )
    expedienteId = (e.rows[0] as { id: string }).id

    // Un documento y una operación: lo mínimo para que el manifiesto acredite algo.
    await registrarDocumento(db, almacenComo(sesion), {
      sesion,
      expedienteId,
      documento: {
        campo: 'identificacion_oficial',
        nombreArchivo: 'ine.pdf',
        mime: 'application/pdf',
        bytes: new Uint8Array(randomBytes(1024)),
      },
    })
    // La Fr. V Bis exige desarrollo: sin él la operación saldría del aviso sin
    // que nada falle (`operaciones_exigen_desarrollo`).
    const des = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre del Manifiesto',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [sesion.tenantId, `LIC${marca}`],
    )
    await registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId: (suc.rows[0] as { id: string }).id,
        clienteId,
        desarrolloId: (des.rows[0] as { id: string }).id,
        fechaOperacion: '2026-05-15',
        montoBase: pesos(400_000),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
      },
    })
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
  })

  it('genera el manifiesto y su hash se puede recomputar', async () => {
    const m = await generarManifiesto(db, { sesion, expedienteId })

    expect(m.version).toBe(1)
    expect(m.hash).toMatch(/^[0-9a-f]{64}$/)

    const v = await verificarManifiesto(db, { sesion, manifiestoId: m.manifiestoId })
    expect(v.coincide).toBe(true)
    expect(v.hashRecomputado).toBe(v.hashRegistrado)
  })

  it('el manifiesto lleva el documento con su huella y la operación', async () => {
    const m = await generarManifiesto(db, { sesion, expedienteId })
    const c = m.contenido as Record<string, unknown>

    const docs = c['documentos'] as Array<Record<string, string>>
    expect(docs).toHaveLength(1)
    expect(docs[0]?.['campo']).toBe('identificacion_oficial')
    expect(docs[0]?.['hash_sha256']).toMatch(/^[0-9a-f]{64}$/)

    const ops = c['operaciones'] as Array<Record<string, string>>
    expect(ops).toHaveLength(1)
    expect(ops[0]?.['monto_base']).toBe('400000.00')
    // El monto va como TEXTO: si viajara como número, el hash dejaría de ser
    // reproducible.
    expect(typeof ops[0]?.['monto_base']).toBe('string')
  })

  it('ancla la cabeza de la bitácora del momento en que se generó', async () => {
    const m = await generarManifiesto(db, { sesion, expedienteId })
    const { rows } = await db.query(
      `select hash_bitacora_cabeza from manifiestos where id = $1`,
      [m.manifiestoId],
    )
    const anclado = (rows[0] as { hash_bitacora_cabeza: string }).hash_bitacora_cabeza
    expect(anclado).toMatch(/^[0-9a-f]{64}$/)
    expect((m.contenido as Record<string, unknown>)['bitacora_cabeza']).toBe(anclado)
  })

  it('si alguien altera el contenido guardado, la verificación lo dice', async () => {
    const m = await generarManifiesto(db, { sesion, expedienteId })
    expect((await verificarManifiesto(db, { sesion, manifiestoId: m.manifiestoId })).coincide).toBe(true)

    // Se desactiva el trigger a propósito para simular a alguien con acceso
    // directo a la base. Es la única forma de probar que la detección sirve.
    await db.query('alter table manifiestos disable trigger manifiestos_append_only')
    await db.query(
      `update manifiestos
          set contenido = jsonb_set(contenido, '{operaciones,0,monto_base}', '"1.00"')
        where id = $1`,
      [m.manifiestoId],
    )
    await db.query('alter table manifiestos enable trigger manifiestos_append_only')

    const v = await verificarManifiesto(db, { sesion, manifiestoId: m.manifiestoId })
    expect(v.coincide).toBe(false)
    expect(v.hashRecomputado).not.toBe(v.hashRegistrado)
  })

  it('regenerar es una VERSIÓN NUEVA, nunca un UPDATE', async () => {
    const primera = await generarManifiesto(db, { sesion, expedienteId })
    const segunda = await generarManifiesto(db, { sesion, expedienteId })

    expect(segunda.version).toBe(2)
    const { rows } = await db.query(
      `select count(*)::int as n from manifiestos where expediente_id = $1`,
      [expedienteId],
    )
    expect((rows[0] as { n: number }).n).toBe(2)
    // La primera sigue verificando: no dejó de ser verdad porque llegó otra.
    expect((await verificarManifiesto(db, { sesion, manifiestoId: primera.manifiestoId })).coincide).toBe(true)
  })

  it('un expediente SIN evaluar no puede tener manifiesto', async () => {
    const otro = await db.query(
      `insert into expedientes (tenant_id,cliente_id,actividad_id,version)
       select $1,$2,id,2 from actividades_vulnerables where fraccion='V_BIS' returning id`,
      [sesion.tenantId, clienteId],
    )
    await expect(
      generarManifiesto(db, {
        sesion,
        expedienteId: (otro.rows[0] as { id: string }).id,
      }),
    ).rejects.toThrow(/sin evaluar afirmaría un estado que nadie verificó/)
  })

  it('un documento reemplazado NO entra: el manifiesto retrata lo vigente', async () => {
    const almacen = almacenComo(sesion)
    const viejo = await registrarDocumento(db, almacen, {
      sesion,
      expedienteId,
      documento: {
        campo: 'comprobante_domicilio',
        nombreArchivo: 'cfe.pdf',
        mime: 'application/pdf',
        bytes: new Uint8Array(randomBytes(256)),
      },
    })
    await registrarDocumento(db, almacen, {
      sesion,
      expedienteId,
      documento: {
        campo: 'comprobante_domicilio',
        nombreArchivo: 'cfe2.pdf',
        mime: 'application/pdf',
        bytes: new Uint8Array(randomBytes(300)),
      },
      reemplazaA: viejo.documentoId,
    })

    const m = await generarManifiesto(db, { sesion, expedienteId })
    const docs = (m.contenido as Record<string, unknown>)['documentos'] as Array<
      Record<string, string>
    >
    const hashes = docs.map((d) => d['hash_sha256'])
    expect(hashes).not.toContain(viejo.hash)
    // Pero el viejo sigue en la tabla: append-only.
    const { rows } = await db.query(
      `select count(*)::int as n from documentos where expediente_id=$1 and campo='comprobante_domicilio'`,
      [expedienteId],
    )
    expect((rows[0] as { n: number }).n).toBe(2)
  })

  /**
   * AUDITORÍA DE LA SEMANA 8, defecto 1.
   *
   * La vigencia del catálogo se resolvía con
   * `new Date().toISOString().slice(0, 10)`: el reloj del HOST y en UTC. Es el
   * mismo defecto que la semana 6 corrigió en la pantalla del expediente, colado
   * de nuevo en el objeto que se sella.
   *
   * La consecuencia no es un crash. A partir de las 18:00 de Mérida el
   * manifiesto declaraba la `catalogo_version` de MAÑANA, y en la frontera del 1
   * de febrero eso es declarar una UMA que todavía no regía. Queda DENTRO del
   * hash: corregirlo después rompe la firma.
   *
   * El test adelanta el reloj del proceso a una fecha sin UMA cargada. Si el
   * código volviera a mirar ese reloj, el cargador reventaría con
   * `CatalogoIncompleto`. Como la fecha sale de la base, no lo mira.
   */
  it('la vigencia del catálogo la fija el reloj de la BASE, no el del proceso', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // Antes de que existiera UMA en el catálogo. El host cree estar en 2024.
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
      const m = await generarManifiesto(db, { sesion, expedienteId })
      expect(m.hash).toMatch(/^[0-9a-f]{64}$/)

      // Y `generado_en` tampoco salió del reloj mentido.
      const generadoEn = (m.contenido as Record<string, unknown>)['generado_en'] as string
      expect(generadoEn.startsWith('2024-')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * AUDITORÍA DE LA SEMANA 8, defecto 3.
   *
   * `verificarManifiesto` era la única función del módulo sin sesión y sin
   * cruce por `tenant_id`. Dos consecuencias, las dos malas: desde la
   * aplicación —que corre como `vizo_app`— moría con `permission denied`, y
   * desde un rol elevado verificaba el manifiesto de CUALQUIER obligado.
   *
   * Es justo la función que importa años después, cuando hay que demostrar que
   * un expediente no cambió.
   */
  it('no verifica el manifiesto de otro obligado', async () => {
    const m = await generarManifiesto(db, { sesion, expedienteId })
    const ajena = await crearTenantConUsuario(
      db,
      String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100),
    )

    await expect(
      verificarManifiesto(db, { sesion: ajena, manifiestoId: m.manifiestoId }),
    ).rejects.toThrow(ExpedienteSinManifiesto)
  })
})
