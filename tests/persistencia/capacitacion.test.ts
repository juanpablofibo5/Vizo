import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeCapacitacionInvalido,
  agregarAPlantilla,
  darDeBajaDelArea,
  estadoDeCapacitacion,
  evaluarYAcreditar,
  registrarSesion,
} from '../../src/persistencia/capacitacion'

/**
 * El Cap. XII sobre la base real.
 *
 * Lo que protege: que el mínimo de años salga del CATÁLOGO y no de un número
 * escrito en el código, que no se pueda expedir constancia a quien no aprobó,
 * y que la cobertura del periodo diga quién falta con el motivo correcto.
 */
describe('La capacitación del Art. 39 Bis', () => {
  let db: Client
  let sesion: ContextoSesion
  let marca: string

  const ANIO = 2027
  const HOY = '2027-06-15'
  const HASH = 'd'.repeat(64)

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
  })

  const estado = () =>
    enTransaccionDeSesion(db, sesion, () =>
      estadoDeCapacitacion(db, { sesion, anio: ANIO, hoy: HOY }),
    )

  const sesionCompleta = (asistentes: string[]) => ({
    titulo: 'Curso anual de cumplimiento',
    fecha: '2027-03-10',
    temas: ['marco_normativo', 'manual_politicas', 'actos_articulo_17',
            'riesgos_del_obligado', 'tecnicas_400_bis'] as const,
    instructorNombre: 'Instructora Acreditada',
    instructorAniosExperiencia: 8,
    acreditacion: { hash: HASH, archivo: 'cv.pdf' },
    asistentes,
  })

  it('los plazos salen del catálogo, con su vigencia', async () => {
    const e = await estado()
    expect(e.plazos.experienciaMinimaAnios).toBe(5)
    expect(e.plazos.retencionAnios).toBe(10)
    expect(e.plazos.exigibleDesde).toBe('2027-01-01')
  })

  it('en 2026 el capítulo sale como VISTA ANTICIPADA, no como ausente', async () => {
    // La fila del catálogo tiene vigencia 2027: antes de esa fecha no hay fila
    // vigente y aun así hay que poder configurar.
    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDeCapacitacion(db, { sesion, anio: ANIO, hoy: '2026-08-31' }),
    )
    expect(e.plazos.anticipado).toBe(true)
    expect(e.plazos.experienciaMinimaAnios).toBe(5)
  })

  it('sin nada configurado, faltan los cinco temas y no acredita', async () => {
    const e = await estado()
    expect(e.cobertura.acreditado).toBe(false)
    expect(e.cobertura.temasFaltantes).toHaveLength(5)
    expect(e.programaId).toBeNull()
  })

  it('EL MÍNIMO DE AÑOS SALE DEL CATÁLOGO: con menos, la sesión no entra', async () => {
    await expect(
      registrarSesion(db, {
        sesion, anio: ANIO, hoy: HOY,
        datos: { ...sesionCompleta([]), instructorAniosExperiencia: 3 },
      }),
    ).rejects.toThrow(/al menos 5 años/)
  })

  it('una sesión de otro año no cubre el periodo', async () => {
    await expect(
      registrarSesion(db, {
        sesion, anio: ANIO, hoy: HOY,
        // Pasada, para que muera por el PERIODO y no por la guarda de futuro.
        datos: { ...sesionCompleta([]), fecha: '2026-03-10' },
      }),
    ).rejects.toThrow(/periodo es el año calendario/)
  })

  it('una sesión que todavía no se ha impartido no se registra', async () => {
    await expect(
      registrarSesion(db, {
        sesion, anio: ANIO, hoy: HOY,
        datos: { ...sesionCompleta([]), fecha: '2027-11-30' },
      }),
    ).rejects.toThrow(/Se registra lo impartido, no lo programado/)
  })

  it('el camino completo: plantilla → sesión → evaluación → constancia', async () => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre: 'Rec del obligado', rol: 'rec', ingresoAlArea: '2027-01-02',
    })

    await registrarSesion(db, { sesion, anio: ANIO, hoy: HOY, datos: sesionCompleta([personaId]) })

    // Asistió pero no acredita: el ¶2 exige evaluación.
    let e = await estado()
    expect(e.cobertura.temasFaltantes).toEqual([])
    expect(e.cobertura.personasFaltantes).toEqual([
      { personaId, nombre: 'Rec del obligado', rol: 'rec', motivo: 'sin_constancia' },
    ])
    expect(e.cobertura.acreditado).toBe(false)

    const a = await db.query(
      `select id::text from asistencias_capacitacion where tenant_id=$1 and persona_id=$2`,
      [sesion.tenantId, personaId],
    )
    const asistenciaId = (a.rows[0] as { id: string }).id

    expect(e.pendientesDeEvaluar).toEqual([
      { asistenciaId, personaNombre: 'Rec del obligado',
        sesionTitulo: 'Curso anual de cumplimiento', sesionFecha: '2027-03-10' },
    ])

    await evaluarYAcreditar(db, {
      sesion, asistenciaId, satisfactoria: true, fecha: '2027-03-11', folio: 'C-2027-001',
    })

    e = await estado()
    expect(e.pendientesDeEvaluar).toEqual([])
    expect(e.cobertura.personasFaltantes).toEqual([])
    expect(e.cobertura.acreditado).toBe(true)
  })

  it('NO SE EXPIDE CONSTANCIA A QUIEN NO APROBÓ, y el error cita el artículo', async () => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre: 'Quien reprobó', rol: 'atencion_publico', ingresoAlArea: '2027-01-02',
    })
    await registrarSesion(db, { sesion, anio: ANIO, hoy: HOY, datos: sesionCompleta([personaId]) })
    const a = await db.query(
      `select id::text from asistencias_capacitacion where tenant_id=$1 and persona_id=$2`,
      [sesion.tenantId, personaId],
    )
    await expect(
      evaluarYAcreditar(db, {
        sesion, asistenciaId: (a.rows[0] as { id: string }).id,
        satisfactoria: false, fecha: '2027-03-11', folio: 'C-2027-002',
      }),
    ).rejects.toThrow(/39 Bis 1 ¶2/)
  })

  it('la fr. III: declarar los años sin documento deja la sesión sin acreditar', async () => {
    await registrarSesion(db, {
      sesion, anio: ANIO, hoy: HOY,
      datos: { ...sesionCompleta([]), acreditacion: undefined },
    })
    const e = await estado()
    expect(e.cobertura.instructoresSinAcreditar[0]?.motivo).toBe('sin_documento')
    expect(e.cobertura.acreditado).toBe(false)
  })

  it('el ¶3: quien entró a atención al público y no acredita sale como pendiente', async () => {
    await agregarAPlantilla(db, {
      sesion, nombre: 'Nuevo en ventanilla', rol: 'atencion_publico', ingresoAlArea: '2027-05-01',
    })
    const e = await estado()
    expect(e.ingresosPendientes).toHaveLength(1)
    expect(e.ingresosPendientes[0]?.diasDesdeElIngreso).toBe(45)
  })

  it('evaluar una asistencia que no es de este obligado no pasa en silencio', async () => {
    // RLS no lanza: FILTRA. Un `update` contra un id ajeno reporta éxito
    // habiendo tocado cero filas, y la pantalla diría «constancia registrada».
    const otro = await crearTenantConUsuario(db, marca + 'b', 'admin')
    const { personaId } = await agregarAPlantilla(db, {
      sesion: otro, nombre: 'De otro obligado', rol: 'rec', ingresoAlArea: '2027-01-02',
    })
    await registrarSesion(db, { sesion: otro, anio: ANIO, hoy: HOY, datos: sesionCompleta([personaId]) })
    const a = await db.query(
      `select id::text from asistencias_capacitacion where tenant_id=$1 and persona_id=$2`,
      [otro.tenantId, personaId],
    )
    const ajena = (a.rows[0] as { id: string }).id

    await expect(
      evaluarYAcreditar(db, {
        sesion, asistenciaId: ajena, satisfactoria: true, fecha: '2027-03-11', folio: 'C-X',
      }),
    ).rejects.toThrow(/no existe en este obligado/)

    // Y del otro lado no se movió nada.
    const q = await db.query(
      `select constancia_folio from asistencias_capacitacion where id = $1`, [ajena],
    )
    expect((q.rows[0] as { constancia_folio: string | null }).constancia_folio).toBeNull()
  })

  it('la plantilla admite a quien no tiene cuenta en el portal', async () => {
    await agregarAPlantilla(db, {
      sesion, nombre: 'Consejero externo', rol: 'consejo_administracion', ingresoAlArea: '2027-01-01',
    })
    const e = await estado()
    expect(e.plantilla).toHaveLength(1)
    expect(e.plantilla[0]?.rol).toBe('consejo_administracion')
  })

  it('la baja no borra el pasado: quien estuvo parte del año sigue contando en ese periodo', async () => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre: 'Se fue en marzo', rol: 'atencion_publico', ingresoAlArea: '2027-01-10',
    })
    await darDeBajaDelArea(db, { sesion, personaId, fecha: '2027-03-31' })

    const e = await estado()
    // Sigue en la cobertura del periodo…
    expect(e.cobertura.personasFaltantes.map((f) => f.personaId)).toContain(personaId)
    // …pero ya no en la lista del ¶3, que habla de quien ESTÁ en el área.
    expect(e.ingresosPendientes).toEqual([])
  })

  it('no se registran dos bajas sobre la misma persona', async () => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre: 'Ya dado de baja', rol: 'directivo', ingresoAlArea: '2027-01-10',
    })
    await darDeBajaDelArea(db, { sesion, personaId, fecha: '2027-03-31' })
    await expect(
      darDeBajaDelArea(db, { sesion, personaId, fecha: '2027-05-31' }),
    ).rejects.toThrow(/ya tiene una baja registrada/)
  })

  it('una baja anterior al ingreso la rechaza la base', async () => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre: 'Imposible', rol: 'directivo', ingresoAlArea: '2027-06-01',
    })
    await expect(
      darDeBajaDelArea(db, { sesion, personaId, fecha: '2027-01-01' }),
    ).rejects.toThrow(/baja_no_precede_al_ingreso/)
  })

  it('sin fecha de ingreso no entra: el ¶3 la necesita', async () => {
    await expect(
      agregarAPlantilla(db, { sesion, nombre: 'X', rol: 'directivo', ingresoAlArea: '' }),
    ).rejects.toBeInstanceOf(DatoDeCapacitacionInvalido)
  })
})
