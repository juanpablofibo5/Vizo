import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeCapacitacionInvalido,
  SinEvaluacionDeEntidad,
  agregarAPlantilla,
  darDeBajaDelArea,
  declararCoherencia,
  estadoDeCapacitacion,
  evaluarYAcreditar,
  registrarSesion,
} from '../../src/persistencia/capacitacion'
import { activarModelo, agregarFactor, crearModelo, definirGrado } from '../../src/persistencia/riesgo'
import { declararMetodoEntidad, evaluarEntidadYRegistrar } from '../../src/persistencia/entidad'

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
    dirigidaA: ['rec', 'atencion_publico'] as const,
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

  it('sin dirigidaA (vacío) la sesión no dice a qué papeles se dirigió, y se rechaza', async () => {
    await expect(
      registrarSesion(db, {
        sesion, anio: ANIO, hoy: HOY,
        datos: { ...sesionCompleta([]), dirigidaA: [] },
      }),
    ).rejects.toThrow(/a qué papeles se dirigió/)
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

/**
 * La coherencia temas↔metodología (Art. 39 Bis fr. I, párrafo final, línea 433).
 *
 * Lo que protege: que la declaración se ancle SOLA contra la evaluación de
 * entidad más reciente (nivel 1 de la regla dura 6), que llegar una evaluación
 * nueva envejezca la declaración en vez de invalidarla o borrarla, que
 * re-declarar sea una fila nueva y nunca una edición (ADR-34), y que el
 * aislamiento por tenant no se salte en silencio.
 */
describe('La coherencia temas↔metodología (Art. 39 Bis fr. I, párrafo final)', () => {
  let db: Client
  let admin: ContextoSesion

  const ANIO = 2027
  const HOY = '2027-06-15'
  const HASH = 'e'.repeat(64)

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
  })

  /** Deja un modelo vigente con método de entidad y pesos completos, sin mitigantes. */
  const metodologiaLista = async (sesion: ContextoSesion) => {
    await definirGrado(db, { sesion, clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion, clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion, clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70, vigenteDesde: '2027-03-01' })
    const { modeloId } = await crearModelo(db, { sesion, metodoMedicion: 'suma_ponderada' })
    await declararMetodoEntidad(db, { sesion, modeloId, metodo: 'residual_por_elemento' })

    const el = await db.query(`select id::text, clave from elementos_riesgo order by clave`)
    const elementos = el.rows as { id: string; clave: string }[]
    const tipoCliente = elementos.find((e) => e.clave === 'tipo_cliente')
    if (tipoCliente === undefined) throw new Error('falta el elemento tipo_cliente del catálogo')

    await agregarFactor(db, {
      sesion, modeloId, elementoId: tipoCliente.id, factor: 'Factor de prueba', peso: 10,
    })
    await enTransaccionDeSesion(db, sesion, async () => {
      for (const e of elementos) {
        await db.query(
          `insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso) values ($1,$2,$3,25)`,
          [sesion.tenantId, modeloId, e.id],
        )
      }
    })
    await activarModelo(db, { sesion, modeloId, vigenteDesde: '2027-03-01' })
  }

  const evaluar = (sesion: ContextoSesion) =>
    evaluarEntidadYRegistrar(db, {
      sesion, hoy: HOY, base: 'anio_completo',
      periodoInicio: '2026-01-01', periodoFin: '2026-12-31',
      totalClientes: 120, totalOperaciones: 350, montoOperadoCentavos: 5_000_000_00,
    })

  const registrarUnaSesion = async (sesion: ContextoSesion, asistentes: string[] = []) => {
    const { sesionId } = await registrarSesion(db, {
      sesion, anio: ANIO, hoy: HOY,
      datos: {
        titulo: 'Curso anual de cumplimiento',
        fecha: '2027-03-10',
        temas: ['marco_normativo', 'manual_politicas', 'actos_articulo_17',
                'riesgos_del_obligado', 'tecnicas_400_bis'],
        dirigidaA: ['rec', 'atencion_publico'],
        instructorNombre: 'Instructora Acreditada',
        instructorAniosExperiencia: 8,
        acreditacion: { hash: HASH, archivo: 'cv.pdf' },
        asistentes,
      },
    })
    return sesionId
  }

  const estado = (sesion: ContextoSesion) =>
    enTransaccionDeSesion(db, sesion, () => estadoDeCapacitacion(db, { sesion, anio: ANIO, hoy: HOY }))

  it('sin ninguna evaluación de entidad, declararCoherencia lanza SinEvaluacionDeEntidad', async () => {
    const sesionId = await registrarUnaSesion(admin)
    await expect(declararCoherencia(db, { sesion: admin, sesionId })).rejects.toBeInstanceOf(
      SinEvaluacionDeEntidad,
    )
  })

  it('el camino completo: evaluación → sesión → declarar → estadoDeCapacitacion la reporta declarada', async () => {
    await metodologiaLista(admin)
    const { evaluacionId } = await evaluar(admin)
    if (evaluacionId === null) throw new Error('la evaluación de prueba no se registró')

    const sesionId = await registrarUnaSesion(admin)
    const { declaracionId, evaluacionEntidadId } = await declararCoherencia(db, { sesion: admin, sesionId })
    expect(declaracionId).not.toBe('')
    expect(evaluacionEntidadId).toBe(evaluacionId)

    const e = await estado(admin)
    const s = e.sesiones.find((x) => x.id === sesionId)
    expect(s?.coherencia).toEqual({
      estado: 'declarada',
      evaluacionEntidadId: evaluacionId,
      declaradaEn: expect.any(String),
    })
    // dirigidaA intacto, no importa cuántas veces se declare coherencia.
    expect(s?.dirigidaA).toEqual(['rec', 'atencion_publico'])
    expect(e.evaluacionVigente?.id).toBe(evaluacionId)
  })

  it('llega una evaluación nueva: la sesión pasa a sobre_otra_evaluacion, y la declaración original sigue intacta', async () => {
    await metodologiaLista(admin)
    const { evaluacionId: primera } = await evaluar(admin)
    if (primera === null) throw new Error('la evaluación de prueba no se registró')
    const sesionId = await registrarUnaSesion(admin)
    await declararCoherencia(db, { sesion: admin, sesionId })

    // Evaluación de entidad nueva del mismo obligado.
    const { evaluacionId: segunda } = await evaluar(admin)
    if (segunda === null) throw new Error('la segunda evaluación de prueba no se registró')
    expect(segunda).not.toBe(primera)

    const e = await estado(admin)
    const s = e.sesiones.find((x) => x.id === sesionId)
    expect(s?.coherencia).toEqual({
      estado: 'sobre_otra_evaluacion',
      evaluacionEntidadId: primera,
      declaradaEn: expect.any(String),
    })

    // Append-only: la declaración original sigue exactamente como se firmó.
    const fila = await db.query(
      `select evaluacion_entidad_id::text as evaluacion_entidad_id
         from declaraciones_coherencia where sesion_id = $1`,
      [sesionId],
    )
    expect((fila.rows as { evaluacion_entidad_id: string }[]).map((r) => r.evaluacion_entidad_id)).toEqual([
      primera,
    ])
  })

  it('re-declarar contra la nueva vuelve a declarada, con las DOS filas conviviendo en la base', async () => {
    await metodologiaLista(admin)
    const { evaluacionId: primera } = await evaluar(admin)
    if (primera === null) throw new Error('la evaluación de prueba no se registró')
    const sesionId = await registrarUnaSesion(admin)
    await declararCoherencia(db, { sesion: admin, sesionId })

    const { evaluacionId: segunda } = await evaluar(admin)
    if (segunda === null) throw new Error('la segunda evaluación de prueba no se registró')

    const { evaluacionEntidadId } = await declararCoherencia(db, { sesion: admin, sesionId })
    expect(evaluacionEntidadId).toBe(segunda)

    const e = await estado(admin)
    const s = e.sesiones.find((x) => x.id === sesionId)
    expect(s?.coherencia.estado).toBe('declarada')
    if (s?.coherencia.estado === 'declarada') expect(s.coherencia.evaluacionEntidadId).toBe(segunda)

    const n = await db.query(
      `select count(*)::int as n from declaraciones_coherencia where sesion_id = $1`, [sesionId],
    )
    expect((n.rows[0] as { n: number }).n).toBe(2)
  })

  it('declarar dos veces contra la MISMA evaluación se rechaza, en español', async () => {
    await metodologiaLista(admin)
    const { evaluacionId } = await evaluar(admin)
    if (evaluacionId === null) throw new Error('la evaluación de prueba no se registró')
    const sesionId = await registrarUnaSesion(admin)
    await declararCoherencia(db, { sesion: admin, sesionId })

    await expect(declararCoherencia(db, { sesion: admin, sesionId })).rejects.toThrow(
      /ya tiene una declaración de coherencia/,
    )
  })

  it('la declaración no se puede editar ni borrar, con el rol de la app', async () => {
    await metodologiaLista(admin)
    await evaluar(admin)
    const sesionId = await registrarUnaSesion(admin)
    const { declaracionId } = await declararCoherencia(db, { sesion: admin, sesionId })

    await expect(
      enTransaccionDeSesion(db, admin, () =>
        db.query(`update declaraciones_coherencia set declarada_por = declarada_por where id = $1`, [
          declaracionId,
        ]),
      ),
    ).rejects.toThrow()

    await expect(
      enTransaccionDeSesion(db, admin, () =>
        db.query(`delete from declaraciones_coherencia where id = $1`, [declaracionId]),
      ),
    ).rejects.toThrow()

    // Y del otro lado sigue exactamente como se firmó.
    const fila = await db.query(`select id from declaraciones_coherencia where id = $1`, [declaracionId])
    expect(fila.rows).toHaveLength(1)
  })

  it('declarar sobre la sesión de OTRO obligado no pasa en silencio', async () => {
    await metodologiaLista(admin)
    await evaluar(admin)

    const marcaOtro = String(Date.now()).slice(-6) + 'b' + String(Math.floor(Math.random() * 90) + 10)
    const otro = await crearTenantConUsuario(db, marcaOtro, 'admin')
    const sesionAjena = await registrarUnaSesion(otro)

    await expect(declararCoherencia(db, { sesion: admin, sesionId: sesionAjena })).rejects.toThrow(
      /no existe en este obligado/,
    )

    const n = await db.query(
      `select count(*)::int as n from declaraciones_coherencia where sesion_id = $1`, [sesionAjena],
    )
    expect((n.rows[0] as { n: number }).n).toBe(0)
  })
})
