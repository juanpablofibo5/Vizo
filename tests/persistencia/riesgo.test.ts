import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeRiesgoInvalido,
  ModeloNoActivable,
  activarModelo,
  agregarFactor,
  crearModelo,
  definirGrado,
  estadoDelRiesgo,
  evaluarClienteYRegistrar,
  quitarFactor,
} from '../../src/persistencia/riesgo'

const HOY = '2027-03-15'

/**
 * El modelo de riesgo de punta a punta: configurar → activar → evaluar.
 *
 * Lo que estas pruebas protegen es la frontera del ADR-21. La más importante es
 * la primera: con la configuración vacía el sistema NO clasifica y NO escribe.
 */
describe('El modelo de Riesgos del obligado', () => {
  let db: Client
  let admin: ContextoSesion
  let clienteId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Cliente de Riesgo SA','MX') returning id::text`,
      [admin.tenantId, `RSG${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  const estado = (sesion: ContextoSesion) =>
    enTransaccionDeSesion(db, sesion, () => estadoDelRiesgo(db, { sesion, hoy: HOY }))

  const escalaCompleta = async () => {
    await definirGrado(db, { sesion: admin, clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion: admin, clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion: admin, clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70, vigenteDesde: '2027-03-01' })
  }

  it('EL HUECO DEL ADR-21: sin modelo configurado no clasifica ni escribe', async () => {
    const r = await evaluarClienteYRegistrar(db, {
      sesion: admin,
      clienteId,
      factoresPresentes: [],
      hoy: HOY,
    })
    expect(r.resultado.estado).toBe('sin_configuracion')
    expect(r.evaluacionId).toBeNull()

    // Y no dejó rastro: registrar una evaluación sin metodología sería
    // inventar un grado que nadie decidió.
    const n = await db.query(
      `select count(*)::int as n from evaluaciones_riesgo where tenant_id = $1`,
      [admin.tenantId],
    )
    expect((n.rows[0] as { n: number }).n).toBe(0)
  })

  it('el estado dice QUÉ le falta al obligado, sin rellenarlo por él', async () => {
    const e = await estado(admin)
    expect(e.faltaParaClasificar.length).toBeGreaterThan(0)
    expect(e.faltaParaClasificar.join(' ')).toMatch(/clasificaciones mínimas/)
    // Los elementos del Art. 10 Septies 1 SÍ vienen: los pone la norma.
    expect(e.elementos).toHaveLength(4)
    // Los factores NO: los pone el obligado.
    expect(e.borrador).toBeNull()
    expect(e.vigente).toBeNull()
  })

  it('un modelo sin factores no se activa, y el mensaje dice por qué', async () => {
    await escalaCompleta()
    const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    await expect(
      activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2027-03-01' }),
    ).rejects.toThrow(ModeloNoActivable)
  })

  it('un método de medición que el motor no sabe ejecutar no se puede ni elegir', async () => {
    await expect(
      crearModelo(db, { sesion: admin, metodoMedicion: 'red_neuronal' }),
    ).rejects.toThrow(DatoDeRiesgoInvalido)
  })

  it('configurado y activo, clasifica y deja la evaluación con su desglose', async () => {
    await escalaCompleta()
    const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    const e0 = await estado(admin)
    const geografia = e0.elementos.find((x) => x.clave === 'geografia')
    const tipo = e0.elementos.find((x) => x.clave === 'tipo_cliente')

    const f1 = await agregarFactor(db, {
      sesion: admin, modeloId, elementoId: geografia!.id,
      factor: 'Domicilio en jurisdicción señalada', peso: 40,
    })
    await agregarFactor(db, {
      sesion: admin, modeloId, elementoId: tipo!.id,
      factor: 'Persona moral de reciente constitución', peso: 20,
    })

    await activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2027-03-01' })

    const r = await evaluarClienteYRegistrar(db, {
      sesion: admin, clienteId, factoresPresentes: [f1.factorId], hoy: HOY,
    })
    if (r.resultado.estado !== 'evaluado') throw new Error('inesperado')
    expect(r.resultado.puntaje).toBe(40)
    expect(r.resultado.gradoClave).toBe('medio')
    expect(r.evaluacionId).not.toBeNull()

    // El grado vigente se lee de la vista, no de una columna.
    const v = await enTransaccionDeSesion(db, admin, () =>
      db.query(`select grado, es_alto from clientes_riesgo_vigente where cliente_id = $1`, [clienteId]),
    )
    expect((v.rows[0] as { grado: string }).grado).toBe('medio')
  })

  it('REGLA DURA 3: la bitácora registra el grado, nunca quién es el cliente', async () => {
    await escalaCompleta()
    const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    const e0 = await estado(admin)
    const f = await agregarFactor(db, {
      sesion: admin, modeloId, elementoId: e0.elementos[0]!.id,
      factor: 'Factor de prueba', peso: 80,
    })
    await activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2027-03-01' })
    await evaluarClienteYRegistrar(db, {
      sesion: admin, clienteId, factoresPresentes: [f.factorId], hoy: HOY,
    })

    const ev = await db.query(
      `select datos::text as datos from bitacora
        where tenant_id = $1 and evento = 'riesgo.cliente_evaluado'`,
      [admin.tenantId],
    )
    const datos = (ev.rows[0] as { datos: string }).datos
    expect(datos).toContain('alto')
    expect(datos).not.toContain('Cliente de Riesgo SA')
    expect(datos).not.toContain(clienteId)
  })

  it('un factor de un modelo vigente ya no se quita: se versiona el modelo', async () => {
    await escalaCompleta()
    const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    const e0 = await estado(admin)
    const f = await agregarFactor(db, {
      sesion: admin, modeloId, elementoId: e0.elementos[0]!.id, factor: 'Congelado', peso: 10,
    })
    await activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2027-03-01' })
    await expect(quitarFactor(db, { sesion: admin, factorId: f.factorId })).rejects.toThrow()
  })

  it('activar una versión nueva sustituye a la anterior, y el histórico las conserva', async () => {
    await escalaCompleta()
    const e0 = await estado(admin)
    const elem = e0.elementos[0]!.id

    const m1 = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    await agregarFactor(db, { sesion: admin, modeloId: m1.modeloId, elementoId: elem, factor: 'Cliente sin domicilio comprobado', peso: 10 })
    await activarModelo(db, { sesion: admin, modeloId: m1.modeloId, vigenteDesde: '2027-03-01' })

    const m2 = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    await agregarFactor(db, { sesion: admin, modeloId: m2.modeloId, elementoId: elem, factor: 'Cliente sin domicilio comprobado (versión 2)', peso: 90 })
    await activarModelo(db, { sesion: admin, modeloId: m2.modeloId, vigenteDesde: '2027-06-01' })

    const e = await estado(admin)
    expect(e.vigente?.version).toBe(2)
    const n = await db.query(
      `select count(*)::int as n from modelos_riesgo where tenant_id = $1`,
      [admin.tenantId],
    )
    expect((n.rows[0] as { n: number }).n).toBe(2)
  })
})
