import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { cargarConfigActividad } from '../../src/catalogo/cargador'
import { pesos } from '../../src/dominio/dinero'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * X-01 · LA PRUEBA DE DISEÑO DEL PROYECTO.
 *
 * La Fracción XV —arrendamiento de inmuebles— se dio de alta ÚNICAMENTE con
 * INSERTs al catálogo, en `20260811110000_fraccion_xv_arrendamiento.sql`. Esa
 * migración no vino acompañada de un solo cambio en `src/`.
 *
 * Este archivo lo demuestra usando EXACTAMENTE las mismas funciones que la
 * Fr. V Bis: `cargarConfigActividad` y `registrarOperacion`. No importa nada
 * específico de XV, no hay una rama por fracción, no hay un `if`.
 *
 * Si algún día este archivo necesitara importar algo propio de la Fr. XV, la
 * restricción no negociable #7 estaría rota y sería un defecto de arquitectura
 * — no de la prueba.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Umbrales de la Fr. XV, con la UMA de 2026 ($117.31):
 *   identificación  1,605 UMA = $188,282.55
 *   aviso           3,210 UMA = $376,565.10
 *
 * Y una diferencia de comportamiento que importa: en V Bis la identificación es
 * `siempre` sin importar el monto; en XV tiene umbral. Las dos fracciones se
 * comportan distinto sin que el motor sepa cuál está evaluando.
 */
describe('Fracción XV — alta solo con configuración', () => {
  let db: Client
  let sesion: ContextoSesion
  let actividadXv: string
  let sucursalId: string
  let clienteId: string

  beforeAll(async () => {
    db = await conectar()
    const r = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'XV'`,
    )
    const id = (r.rows[0] as { id: string } | undefined)?.id
    if (id === undefined) {
      throw new Error(
        'La Fracción XV no está en el catálogo. Se da de alta con la migración ' +
          '20260811110000, no con código.',
      )
    }
    actividadXv = id
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      actividadXv,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Arrendataria del Sureste SA','MX') returning id`,
      [sesion.tenantId, `ARR${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  const rentar = (fecha: string, monto: number) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId,
        clienteId,
        fechaOperacion: fecha,
        montoBase: pesos(monto),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        actividadId: actividadXv,
        descripcionBien: 'Renta mensual de oficina',
      },
    })

  it('el catálogo resuelve los umbrales de XV con la UMA vigente', async () => {
    // 1,605 × 117.31 = 188,282.55 · 3,210 × 117.31 = 376,565.10
    const config = await cargarConfigActividad(db, 'XV', '2026-02-15')

    const identificacion = config.umbrales.find((u) => u.tipo === 'identificacion')
    const aviso = config.umbrales.find((u) => u.tipo === 'aviso')

    expect(identificacion?.siempre).toBe(false)
    expect(identificacion?.enCentavos).toBe(18_828_255)
    expect(aviso?.enCentavos).toBe(37_656_510)
  })

  it('X-01: una renta de $400,000 dispara identificación y aviso individual', async () => {
    // El caso escrito en docs/PRUEBAS.md desde la planeación.
    const r = await rentar('2026-02-15', 400_000)

    expect(r.evaluacion.requiereIdentificacion).toBe(true)
    expect(r.evaluacion.resultadoAviso).toBe('individual')
  })

  it('la identificación de XV NO es "siempre": bajo su umbral no se exige', async () => {
    // La diferencia de comportamiento con V Bis, donde la identificación es
    // obligatoria sin importar el monto. El motor no sabe cuál está evaluando:
    // lee el catálogo.
    const r = await rentar('2026-02-15', 100_000)

    expect(r.evaluacion.requiereIdentificacion).toBe(false)
    expect(r.evaluacion.resultadoAviso).toBe('no')
  })

  it('acumula entre rentas como cualquier otra fracción', async () => {
    // Dos rentas de $200,000: cada una pasa identificación (≥ $188,282.55) y
    // ninguna llega al aviso, pero juntas suman $400,000 ≥ $376,565.10.
    await rentar('2026-04-01', 200_000)
    const segunda = await rentar('2026-05-01', 200_000)

    expect(segunda.evaluacion.resultadoAviso).toBe('acumulacion')
  })

  it('las fracciones NO se suman entre sí', async () => {
    // A-04. Un obligado con las dos actividades acumula por separado: sumar
    // entre fracciones produciría avisos que no corresponden a ninguna.
    const vbis = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      (vbis.rows[0] as { id: string }).id,
    ])

    // $700,000 en V Bis: por debajo de su umbral de $941,412.75.
    const enVbis = await db.query(
      `select count(*)::int as n from actividades_tenant where tenant_id = $1`,
      [sesion.tenantId],
    )
    expect((enVbis.rows[0] as { n: number }).n).toBe(2)

    // Una renta de $300,000: por debajo del umbral de aviso de XV.
    const renta = await rentar('2026-04-10', 300_000)
    expect(renta.evaluacion.resultadoAviso).toBe('no')

    // La ventana de XV solo mira operaciones de XV: la suma no arrastra nada
    // de la otra fracción.
    await enTransaccionDeSesion(db, sesion, async () => {
      const r = await db.query(
        `select suma_ventana::text from evaluaciones_umbral
          where operacion_id = $1 order by evaluado_en desc limit 1`,
        [renta.operacionId],
      )
      expect((r.rows[0] as { suma_ventana: string }).suma_ventana).toBe('300000.00')
    })
  })
})
