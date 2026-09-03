import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { agregarAPlantilla } from '../../src/persistencia/capacitacion'
import {
  DatoDeSeleccionInvalido,
  alcanceDeSeleccion,
  estadoDeSeleccionPersonal,
  recabarDeclaracion,
  registrarFechaDeContratacion,
} from '../../src/persistencia/seleccion-personal'

/**
 * El Art. 39 Bis 2 sobre la base real.
 *
 * Lo que protegen: que la fecha del Transitorio Sexto salga del catálogo, que
 * la declaración firmada sea inmutable, y que una manifestación en falso se
 * pueda guardar — porque es evidencia, no un error de captura.
 */
describe('La selección de personal del Art. 39 Bis 2', () => {
  let db: Client
  let sesion: ContextoSesion

  const HOY = '2027-06-15'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
  })

  const estado = () =>
    enTransaccionDeSesion(db, sesion, () => estadoDeSeleccionPersonal(db, { sesion, hoy: HOY }))

  const alta = async (nombre: string, ingreso: string) => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre, rol: 'atencion_publico', ingresoAlArea: ingreso,
    })
    return personaId
  }

  const declarar = (personaId: string, extra: Record<string, unknown> = {}) =>
    recabarDeclaracion(db, {
      sesion,
      datos: {
        personaId,
        fechaDeclaracion: '2027-04-02',
        laboroEnSectorObligado: false,
        sinSentenciaPatrimonial: true,
        sinInhabilitacionComercio: true,
        sinInhabilitacionServicioOFinanciero: true,
        ...extra,
      },
    })

  it('LA FECHA DEL TRANSITORIO SEXTO SALE DEL CATÁLOGO, con su fuente', async () => {
    const a = await enTransaccionDeSesion(db, sesion, () => alcanceDeSeleccion(db, HOY))
    expect(a.exigibleDesde).toBe('2027-03-01')
    expect(a.alcance).toBe('nuevas_contrataciones')
    expect(a.anticipado).toBe(false)
  })

  it('antes del 1 de marzo de 2027 es vista anticipada', async () => {
    const a = await enTransaccionDeSesion(db, sesion, () => alcanceDeSeleccion(db, '2026-09-03'))
    expect(a.anticipado).toBe(true)
  })

  it('quien no tiene fecha de contratación queda INDETERMINADA, no fuera', async () => {
    await alta('Sin fecha conocida', '2027-04-01')
    const e = await estado()
    expect(e.cobertura.indeterminadas).toHaveLength(1)
    expect(e.cobertura.alcanzadas).toBe(0)
    expect(e.cobertura.acreditado).toBe(false)
  })

  it('el camino completo: fecha de contratación → declaración → cubierta', async () => {
    const personaId = await alta('Contratada en abril', '2027-04-05')
    await registrarFechaDeContratacion(db, { sesion, personaId, fecha: '2027-04-01' })

    let e = await estado()
    expect(e.cobertura.faltantes.map((f) => f.personaId)).toEqual([personaId])

    await declarar(personaId)
    e = await estado()
    expect(e.cobertura.cubiertas).toBe(1)
    expect(e.cobertura.acreditado).toBe(true)
  })

  it('quien se contrató ANTES no entra al conteo', async () => {
    const personaId = await alta('De toda la vida', '2027-04-05')
    await registrarFechaDeContratacion(db, { sesion, personaId, fecha: '2020-01-15' })
    const e = await estado()
    expect(e.cobertura.alcanzadas).toBe(0)
    expect(e.cobertura.acreditado).toBe(true)
  })

  it('UNA MANIFESTACIÓN EN FALSO SE GUARDA: es evidencia, no un error de captura', async () => {
    const personaId = await alta('Con antecedente', '2027-04-05')
    await registrarFechaDeContratacion(db, { sesion, personaId, fecha: '2027-04-01' })
    await declarar(personaId, { sinSentenciaPatrimonial: false })

    const e = await estado()
    expect(e.cobertura.conImpedimento).toHaveLength(1)
    expect(e.cobertura.conImpedimento[0]?.impedimentos[0]).toMatch(/sentenciada/)
    expect(e.cobertura.faltantes).toEqual([])
  })

  it('la fr. I: decir que sí laboró en otro sector obligado exige decir en cuál', async () => {
    const personaId = await alta('Viene de otro sector', '2027-04-05')
    await expect(
      declarar(personaId, { laboroEnSectorObligado: true }),
    ).rejects.toThrow(/decir cuál no cumple la fracción/)
  })

  it('LO FIRMADO NO SE EDITA NI SE BORRA', async () => {
    const personaId = await alta('Firmó', '2027-04-05')
    const { declaracionId } = await declarar(personaId)

    await expect(
      db.query(`update declaraciones_personal set sin_sentencia_patrimonial = false where id = $1`,
        [declaracionId]),
    ).rejects.toThrow(/no se edita ni se borra/)
    await expect(
      db.query(`delete from declaraciones_personal where id = $1`, [declaracionId]),
    ).rejects.toThrow(/no se edita ni se borra/)
  })

  it('corregir es declarar de nuevo, y manda la última', async () => {
    const personaId = await alta('Se corrigió', '2027-04-05')
    await registrarFechaDeContratacion(db, { sesion, personaId, fecha: '2027-04-01' })
    await declarar(personaId, { sinInhabilitacionComercio: false, fechaDeclaracion: '2027-04-02' })
    await declarar(personaId, { fechaDeclaracion: '2027-05-02' })

    const e = await estado()
    expect(e.cobertura.cubiertas).toBe(1)
    expect(e.cobertura.conImpedimento).toEqual([])
    // Y la primera sigue ahí: lo firmado se conserva.
    expect(e.declaraciones).toHaveLength(2)
  })

  it('la fecha de contratación de otro obligado no se puede tocar', async () => {
    const otro = await crearTenantConUsuario(db, String(Date.now()).slice(-6) + '99', 'admin')
    const { personaId } = await agregarAPlantilla(db, {
      sesion: otro, nombre: 'De otro', rol: 'rec', ingresoAlArea: '2027-04-01',
    })
    await expect(
      registrarFechaDeContratacion(db, { sesion, personaId, fecha: '2027-04-01' }),
    ).rejects.toBeInstanceOf(DatoDeSeleccionInvalido)
  })

  it('una firma con huella exige decir de qué archivo, y la base lo impide', async () => {
    const personaId = await alta('Firma suelta', '2027-04-05')
    await expect(
      db.query(
        `insert into declaraciones_personal
           (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado,
            sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
            sin_inhabilitacion_servicio_o_financiero, firma_hash, registrada_por)
         values ($1,$2,'2027-04-02',false,true,true,true,$3,$4)`,
        [sesion.tenantId, personaId, 'a'.repeat(64), sesion.usuarioId],
      ),
    ).rejects.toThrow(/firma_con_hash_lleva_archivo/)
  })
})
