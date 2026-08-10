import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { registrarDocumento } from '../../src/persistencia/documentos'
import { abrirExpediente, recalcularCompletitud } from '../../src/persistencia/expediente'
import { generarManifiesto } from '../../src/persistencia/manifiesto'
import {
  SinRastroEnBitacora,
  reconstruirExpediente,
} from '../../src/persistencia/reconstruccion'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * El corte lo pone la BASE, no el reloj de JavaScript.
 *
 * Con `new Date()` este test era intermitente: los eventos llevan la hora de
 * Postgres y el corte llevaba la del host, y los dos relojes derivan —basta
 * que la máquina se suspenda un rato—. Comparar dos relojes distintos y
 * esperar un orden es la clase de error que aparece una vez de cada veinte y
 * se culpa al azar.
 *
 * Es el mismo principio que `registrado_en`: la hora que decide algo sale del
 * servidor.
 */
const ahoraEnLaBase = async (db: Client): Promise<string> =>
  ((await db.query('select now()::text as t')).rows[0] as { t: string }).t

/**
 * Reconstrucción histórica: "¿cómo estaba el expediente el día Y?"
 *
 * Estos tests importan por una razón concreta: la respuesta se arma SOLO con la
 * bitácora. Si hiciera falta consultar `documentos` o `expedientes`, la
 * bitácora no serviría para lo que existe — las tablas dicen cómo están las
 * cosas hoy, no cómo estaban entonces.
 */
describe('Reconstrucción histórica del expediente', () => {
  let db: Client
  let sesion: ContextoSesion
  let expedienteId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  const enSesion = <T,>(cuerpo: () => Promise<T>): Promise<T> =>
    enTransaccionDeSesion(db, sesion, cuerpo)

  const reconstruirHasta = (hasta: string) =>
    enSesion(() => reconstruirExpediente(db, { sesion, expedienteId, hasta }))

  const reconstruirAhora = async () => reconstruirHasta(await ahoraEnLaBase(db))

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca)
    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion='V_BIS'`,
      [sesion.tenantId],
    )
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Reconstruible SA','MX') returning id`,
      [sesion.tenantId, `REC${marca}`],
    )
    const r = await abrirExpediente(db, {
      sesion,
      clienteId: (c.rows[0] as { id: string }).id,
    })
    expedienteId = r.expedienteId
  })

  const subir = (campo: string, reemplazaA?: string) =>
    registrarDocumento(db, almacenComo(sesion), {
      sesion,
      expedienteId,
      documento: {
        campo,
        nombreArchivo: `${campo}.pdf`,
        mime: 'application/pdf',
        bytes: new Uint8Array(randomBytes(128 + campo.length)),
      },
      ...(reemplazaA === undefined ? {} : { reemplazaA }),
    })

  it('reconstruye lo que había en un corte, no lo que hay hoy', async () => {
    const ine = await subir('identificacion_oficial')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })

    const corte = await ahoraEnLaBase(db)

    // DESPUÉS del corte pasan más cosas.
    await subir('acta_constitutiva')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })

    const antes = await reconstruirHasta(corte)
    const hoy = await reconstruirAhora()

    expect(antes.documentos.map((d) => d.campo)).toEqual(['identificacion_oficial'])
    expect(antes.documentos[0]?.hashSha256).toBe(ine.hash)
    // Hoy hay dos: el corte no ve el futuro.
    expect(hoy.documentos.map((d) => d.campo).sort()).toEqual([
      'acta_constitutiva',
      'identificacion_oficial',
    ])
  })

  it('un documento reemplazado DESPUÉS del corte seguía vigente entonces', async () => {
    // Es el caso que distingue reconstruir de mirar el estado actual.
    const viejo = await subir('comprobante_domicilio')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })
    const corte = await ahoraEnLaBase(db)

    const nuevo = await subir('comprobante_domicilio', viejo.documentoId)

    const antes = await reconstruirHasta(corte)
    const hoy = await reconstruirAhora()

    expect(antes.documentos.map((d) => d.hashSha256)).toContain(viejo.hash)
    expect(hoy.documentos.map((d) => d.hashSha256)).toContain(nuevo.hash)
    expect(hoy.documentos.map((d) => d.hashSha256)).not.toContain(viejo.hash)
  })

  it('devuelve la completitud vigente al corte, no la última', async () => {
    await subir('identificacion_oficial')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })
    const primera = await reconstruirAhora()
    const cubiertosAntes = primera.completitud?.cubiertos

    const corte = await ahoraEnLaBase(db)
    await subir('acta_constitutiva')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })

    const alCorte = await reconstruirHasta(corte)
    expect(alCorte.completitud?.cubiertos).toBe(cubiertosAntes)
    expect(alCorte.completitud?.faltantes).toContain('acta_constitutiva')
  })

  it('incluye los manifiestos generados hasta el corte', async () => {
    await subir('identificacion_oficial')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })
    const m = await generarManifiesto(db, { sesion, expedienteId })

    const r = await reconstruirAhora()
    expect(r.manifiestos).toHaveLength(1)
    expect(r.manifiestos[0]?.hashSha256).toBe(m.hash)
    expect(r.manifiestos[0]?.version).toBe('1')
  })

  it('registra el momento en que se abrió', async () => {
    const r = await reconstruirAhora()
    expect(r.abiertoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(r.eventosConsiderados).toBeGreaterThan(0)
  })

  it('sin rastro NO devuelve un expediente vacío: revienta', async () => {
    // La distinción cara: "no existía" y "sus eventos no se registraron" se
    // ven igual desde aquí, y la segunda es un problema. Devolver un estado
    // vacío las confundiría en silencio.
    await expect(
      enSesion(() =>
        reconstruirExpediente(db, {
          sesion,
          expedienteId,
          hasta: '2020-01-01T00:00:00Z',
        }),
      ),
    ).rejects.toThrow(SinRastroEnBitacora)
  })

  it('no lee las tablas de estado: reconstruye aunque el expediente ya no exista', async () => {
    // LA PRUEBA DE FONDO. Se borra el expediente y sus documentos de las tablas
    // de estado; la bitácora es append-only y sigue ahí. Si la reconstrucción
    // dependiera de las tablas, aquí devolvería vacío o reventaría.
    const ine = await subir('identificacion_oficial')
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: '2026-08-09' })

    await db.query('alter table documentos disable trigger documentos_append_only')
    await db.query('delete from documentos where expediente_id = $1', [expedienteId])
    await db.query('alter table documentos enable trigger documentos_append_only')
    await db.query('delete from expedientes where id = $1', [expedienteId])

    const r = await reconstruirAhora()
    expect(r.documentos).toHaveLength(1)
    expect(r.documentos[0]?.hashSha256).toBe(ine.hash)
    expect(r.completitud?.estatus).toBe('incompleto')
  })
})
