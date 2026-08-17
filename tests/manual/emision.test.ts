import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_EXPEDIENTES } from '../../src/supabase/almacen'
import { abrirExpediente } from '../../src/persistencia/expediente'
import { registrarDocumento } from '../../src/persistencia/documentos'
import { emitirConstancia } from '../../src/persistencia/constancia'
import { escribirIndiceDelManual } from '../../src/dominio/indice-manual'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2027-03-01'

/**
 * Emitir la Constancia, y el índice que la referencia.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EMITIR ES UN ACTO Y NO UNA DESCARGA
 * ────────────────────────────────────────────────────────────────────────────
 * El Manual va a decir «este apartado consta en la Constancia del 30 de
 * noviembre, huella abc…». Si esa constancia se regenerara distinta cada vez
 * —porque el obligado subió un documento o presentó un aviso— el Manual estaría
 * remitiendo a un blanco móvil, y ante una revisión nadie podría decir qué
 * decía el día que se citó.
 *
 * Por eso se congela con su huella y queda en la bitácora. Y por eso emitir dos
 * veces sin que nada haya cambiado NO produce dos evidencias: dos filas
 * idénticas no son dos hechos, son el mismo contado dos veces.
 */
describe('Emitir la Constancia', () => {
  let db: Client
  let admin: ContextoSesion
  let capturista: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    capturista = { ...admin, rol: 'capturista' }

    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion = 'V_BIS'`,
      [admin.tenantId],
    )

    // UN DOCUMENTO DE VERDAD, y no es decoración del escenario.
    //
    // Sin él, la fracción VII se degrada a hueco y su texto —que incluye el
    // conteo de eventos de bitácora— nunca se renderiza. La prueba de
    // reutilización pasaba así, por la razón equivocada, mientras en producción
    // salían tres constancias distintas: la constancia se contaba a sí misma y
    // el caso no podía verlo porque su obligado no tenía nada que conservar.
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora SA','MX') returning id::text`,
      [admin.tenantId, `EMS${marca}`],
    )
    const { expedienteId } = await abrirExpediente(db, {
      sesion: admin,
      clienteId: (c.rows[0] as { id: string }).id,
    })
    await registrarDocumento(db, almacenComo(admin, BUCKET_EXPEDIENTES), {
      sesion: admin,
      expedienteId,
      documento: {
        campo: 'identificacion_oficial',
        nombreArchivo: 'ine.pdf',
        mime: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
      },
    })
  })

  it('congela el texto con su huella y lo deja en la bitácora', async () => {
    const e = await emitirConstancia(db, { sesion: admin, hoy: HOY })

    expect(e.nueva).toBe(true)
    expect(e.hashSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(e.contenido).toContain('Constancia de mecanismos implementados')

    const { rows } = await db.query(
      `select contenido, hash_sha256, total, acreditados, parciales, huecos
         from constancias where id = $1`,
      [e.id],
    )
    const fila = rows[0] as {
      contenido: string
      hash_sha256: string
      total: number
      acreditados: number
      parciales: number
      huecos: number
    }

    // El texto guardado es EL MISMO que se entregó, no una reconstrucción: la
    // huella se calculó sobre él.
    expect(fila.contenido).toBe(e.contenido)
    expect(fila.hash_sha256).toBe(e.hashSha256)
    expect(fila.acreditados + fila.parciales + fila.huecos).toBe(fila.total)

    const ev = await db.query(
      `select datos::text from bitacora
        where tenant_id = $1 and evento = 'constancia.emitida'`,
      [admin.tenantId],
    )
    expect(ev.rows).toHaveLength(1)
    // REGLA DURA 3: el reparto y la huella, nunca el contenido.
    expect((ev.rows[0] as { datos: string }).datos).toContain(e.hashSha256)
    expect((ev.rows[0] as { datos: string }).datos).not.toContain('Constancia de mecanismos')
  })

  it('emitir dos veces sin que nada cambie REUSA la primera', async () => {
    // EL CASO QUE PROTEGE LA EVIDENCIA. Dos filas idénticas al listarlas
    // parecerían actividad que no ocurrió, y la bitácora contaría dos hechos
    // donde hubo uno.
    const primera = await emitirConstancia(db, { sesion: admin, hoy: HOY })
    const segunda = await emitirConstancia(db, { sesion: admin, hoy: HOY })

    expect(segunda.nueva).toBe(false)
    expect(segunda.id).toBe(primera.id)
    expect(segunda.hashSha256).toBe(primera.hashSha256)

    const n = await db.query(`select count(*)::int as n from constancias where tenant_id = $1`, [
      admin.tenantId,
    ])
    expect((n.rows[0] as { n: number }).n).toBe(1)

    const ev = await db.query(
      `select count(*)::int as n from bitacora
        where tenant_id = $1 and evento = 'constancia.emitida'`,
      [admin.tenantId],
    )
    expect((ev.rows[0] as { n: number }).n).toBe(1)
  })

  it('pero si la operación cambia, la huella cambia y se emite otra', async () => {
    // El control del caso anterior: sin esto, «reusar siempre» pasaría igual.
    const primera = await emitirConstancia(db, { sesion: admin, hoy: HOY })

    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Otra Compradora SA','MX') returning id::text`,
      [admin.tenantId, `EMI${String(Date.now()).slice(-9)}`],
    )
    expect(c.rows).toHaveLength(1)

    const segunda = await emitirConstancia(db, { sesion: admin, hoy: HOY })

    expect(segunda.nueva).toBe(true)
    expect(segunda.hashSha256).not.toBe(primera.hashSha256)
  })

  it('un capturista no emite: el documento lo adopta el obligado', async () => {
    await expect(emitirConstancia(db, { sesion: capturista, hoy: HOY })).rejects.toThrow()
  })

  it('una constancia emitida no se puede reescribir', async () => {
    const e = await emitirConstancia(db, { sesion: admin, hoy: HOY })

    await expect(
      db.query(`update constancias set contenido = 'otra cosa' where id = $1`, [e.id]),
    ).rejects.toThrow(/append-only/i)
  })

  it('el índice del Manual cita la huella de la constancia recién emitida', async () => {
    // El cierre del circuito: el documento que el obligado adopta remite a un
    // documento que existe, con una huella que se puede comprobar.
    const e = await emitirConstancia(db, { sesion: admin, hoy: HOY })

    const indice = escribirIndiceDelManual(
      e.constancia,
      { razonSocial: 'Obligado de prueba', rfc: 'PRU010101AAA', fecha: HOY },
      { fecha: e.fecha, hashSha256: e.hashSha256 },
    )

    expect(indice).toContain(e.hashSha256)
    expect(indice).toContain('Manual de Políticas Internas')
    // Y no arrastra el contenido de la constancia: la referencia sustituye.
    expect(indice).not.toContain('Verificable en:')
  })
})
