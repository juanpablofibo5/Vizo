import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeCuestionarioInvalido,
  asentarCuestionario,
  estadoDelCuestionario,
} from '../../src/persistencia/cuestionario'

/**
 * El cuestionario del Art. 23 Ter 3, sobre la base real.
 *
 * Lo que protege: que el cuestionario NO se pueda asentar sin la clasificación
 * que lo exige, que quede atado a ella, y que la vía remota no entre sin
 * Firma Electrónica.
 */
describe('El cuestionario del Art. 23 Ter 3', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let marca: string
  let modeloId: string
  let grados: Record<string, string>

  const HOY = '2027-04-10'
  const HASH = 'b'.repeat(64)

  const datos = () => ({
    modalidad: 'presencial' as const,
    fechaAplicacion: HOY,
    suscritoPor: 'Cliente de Prueba',
    actividadPreponderante: 'Comercio al por mayor',
    origenRecursos: 'Venta de un inmueble previo',
    destinoRecursos: 'Adquisición de vivienda',
    actosQueRealiza: 'Una compraventa',
    actosQuePretende: 'Dos más en el año',
  })

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  const clasificar = (clave: 'alto' | 'medio') =>
    db.query(
      `insert into evaluaciones_riesgo
         (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,evaluado_en,vence)
       values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,date '2027-04-01',date '2027-10-01')`,
      [sesion.tenantId, clienteId, modeloId, grados[clave], clave === 'alto' ? 80 : 40, sesion.usuarioId],
    )

  const estado = () =>
    enTransaccionDeSesion(db, sesion, () =>
      estadoDelCuestionario(db, { sesion, clienteId, hoy: HOY }),
    )

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')

    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Cliente Cuestionario','MX') returning id::text`,
      [sesion.tenantId, `CUE${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    grados = {}
    for (const [k, n, o, alto, min] of [
      ['bajo', 'Bajo', 1, false, 0],
      ['medio', 'Medio', 2, false, 35],
      ['alto', 'Alto', 3, true, 70],
    ] as const) {
      const r = await db.query(
        `insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
         values ($1,$2,$3,$4,$5,$6,date '2027-03-01') returning id::text`,
        [sesion.tenantId, k, n, o, alto, min],
      )
      grados[k] = (r.rows[0] as { id: string }).id
    }
    const el = await db.query(`select id from elementos_riesgo where clave = 'tipo_cliente'`)
    const m = await db.query(
      `insert into modelos_riesgo (tenant_id,version) values ($1,1) returning id::text`,
      [sesion.tenantId],
    )
    modeloId = (m.rows[0] as { id: string }).id
    await db.query(
      `insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
       values ($1,$2,$3,'Prueba',80)`,
      [sesion.tenantId, modeloId, (el.rows[0] as { id: string }).id],
    )
    await db.query(
      `update modelos_riesgo set estado='vigente', vigente_desde=date '2027-03-01',
              aprobado_por=$2, aprobado_en=now() where id=$1`,
      [modeloId, sesion.usuarioId],
    )
  })

  it('EL HUECO: sin clasificar, no dice «no se requiere»', async () => {
    const e = await estado()
    expect(e.exigencia).toEqual({ estado: 'indeterminable', falta: 'grado_de_riesgo' })
  })

  it('y el hueco NO se cierra asentando un cuestionario', async () => {
    await expect(
      asentarCuestionario(db, { sesion, clienteId, hoy: HOY, datos: datos() }),
    ).rejects.toBeInstanceOf(DatoDeCuestionarioInvalido)
  })

  it('con grado medio no es exigible, y tampoco se puede asentar', async () => {
    await clasificar('medio')
    expect((await estado()).exigencia).toEqual({
      estado: 'no_exigible',
      porque: 'no_es_grado_alto',
    })
    await expect(
      asentarCuestionario(db, { sesion, clienteId, hoy: HOY, datos: datos() }),
    ).rejects.toThrow(/solo exige cuestionario cuando el Grado de Riesgo.*alto/i)
  })

  it('con grado alto se asienta, y queda atado a la clasificación que lo exigió', async () => {
    await clasificar('alto')
    const { cuestionarioId } = await asentarCuestionario(db, {
      sesion, clienteId, hoy: HOY, datos: datos(),
    })
    expect(cuestionarioId).toBeTruthy()

    const e = await estado()
    expect(e.cobertura.estado).toBe('cubierto')
    expect(e.historial).toHaveLength(1)
    // El id de la evaluación NO se pasó como parámetro: lo tomó del cliente.
    expect(e.historial[0]?.evaluacionRiesgoId).toBe(e.evaluacionVigenteId)
  })

  it('¶3: el remoto SIN Firma Electrónica no entra', async () => {
    await clasificar('alto')
    await expect(
      asentarCuestionario(db, {
        sesion, clienteId, hoy: HOY,
        datos: { ...datos(), modalidad: 'remoto_digital' },
      }),
    ).rejects.toThrow(/Firma Electrónica/)
  })

  it('el remoto CON su huella entra, y la huella se guarda', async () => {
    await clasificar('alto')
    await asentarCuestionario(db, {
      sesion, clienteId, hoy: HOY,
      datos: {
        ...datos(),
        modalidad: 'remoto_digital',
        firma: { hashSha256: HASH, archivo: 'c.pdf', tamanoBytes: 2048, mime: 'application/pdf' },
      },
    })
    const e = await estado()
    expect(e.historial[0]?.firma?.hashSha256).toBe(HASH)
    expect(e.historial[0]?.firma?.tamanoBytes).toBe(2048)
  })

  it('al reclasificar, el cuestionario anterior queda «sobre otra clasificación» — no «vencido»', async () => {
    await clasificar('alto')
    await asentarCuestionario(db, { sesion, clienteId, hoy: HOY, datos: datos() })
    await clasificar('alto')

    const e = await estado()
    expect(e.cobertura.estado).toBe('sobre_otra_clasificacion')
    // El artículo no da plazo de vigencia: el sistema enseña el hecho.
    expect(JSON.stringify(e.cobertura)).not.toContain('vencid')
  })

  it('es append-only: el historial conserva los dos', async () => {
    await clasificar('alto')
    await asentarCuestionario(db, { sesion, clienteId, hoy: HOY, datos: datos() })
    await asentarCuestionario(db, {
      sesion, clienteId, hoy: HOY,
      datos: { ...datos(), origenRecursos: 'Corregido: herencia' },
    })
    const e = await estado()
    expect(e.historial).toHaveLength(2)
    expect(e.historial[0]?.origenRecursos).toBe('Corregido: herencia')
  })
})
