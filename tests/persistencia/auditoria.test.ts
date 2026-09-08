import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  SinEvaluacionDeEntidad,
  abrirPeriodo,
  designarAuditorExterno,
  designarAuditorInterno,
  estadoDeAuditoria,
  plazosDeAuditoria,
  sustituirAuditor,
  type DatosAuditorExterno,
} from '../../src/persistencia/auditoria'
import { fechaLimiteDeEntrega } from '../../src/dominio/auditoria'
import { activarModelo, agregarFactor, crearModelo, definirGrado } from '../../src/persistencia/riesgo'
import {
  agregarMitigante,
  declararMetodoEntidad,
  definirNivelEfectividad,
  evaluarEntidadYRegistrar,
} from '../../src/persistencia/entidad'
import { agregarAPlantilla, evaluarYAcreditar, registrarSesion } from '../../src/persistencia/capacitacion'

/**
 * El Cap. XIV — DE LA AUDITORÍA (Arts. 42-45, 50 ¶1) sobre la base real.
 *
 * `tests/clientes/auditoria.test.ts` ya cubre el dominio puro (el periodo, la
 * fecha límite, el envejecimiento de la ruta). Esto prueba lo que solo existe
 * contra la base: que sin evaluación de entidad no se abra ningún periodo, que
 * la ruta se congele contra la evaluación EXACTA que estaba vigente al abrir
 * —nunca una que alguien pase suelta—, que los cuatro triggers del Art. 44/45
 * sobre `auditores_designados` sí muerdan cuando se les pone a prueba, que el
 * periodo y el auditor sean append-only con el ROL REAL de la app (no el
 * admin de los fixtures), y que el aislamiento por tenant no se salte en
 * silencio.
 */

const HOY_AUDITORIA = '2029-06-15'
// Posterior a auditoria_primer_periodo_anio (2028): periodo ORDINARIO del
// Art. 42, sin la advertencia del Art. 43 — así los casos de ruta y de
// designación no dependen de esa rama aparte, que se prueba por su cuenta.
const ANIO = 2029
const HOY_ENTIDAD = '2027-03-15'
const HASH_ACREDITACION = 'f'.repeat(64)

describe('El Cap. XIV — periodo, ruta y auditor', () => {
  let db: Client
  let admin: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
  })

  // ─────────────────────────────────────────────────────────────────────
  // Fixtures compartidas
  // ─────────────────────────────────────────────────────────────────────

  const escalaCompleta = async (sesion: ContextoSesion) => {
    await definirGrado(db, {
      sesion, clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0,
      vigenteDesde: '2027-03-01',
    })
    await definirGrado(db, {
      sesion, clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35,
      vigenteDesde: '2027-03-01',
    })
    await definirGrado(db, {
      sesion, clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70,
      vigenteDesde: '2027-03-01',
    })
  }

  /**
   * Deja una evaluación de entidad VIGENTE. `todosMitigados` decide el grado:
   * un solo mitigante que cubre los 4 elementos con nivel 20 dale un residual
   * de 20 (bajo, interna_permitida); cubriendo solo `tipo_cliente` deja el
   * residual en 80 (alto, externa_obligatoria). Mismos números que
   * tests/persistencia/entidad.test.ts, para no inventar otro escenario.
   */
  const evaluacion = async (sesion: ContextoSesion, p: { todosMitigados: boolean }) => {
    await escalaCompleta(sesion)
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

    const { nivelId: auditado } = await definirNivelEfectividad(db, {
      sesion, modeloId, orden: 1, clave: 'auditado', nombre: 'Auditado',
      evidenciaExigible: 'Política aplicada y verificada, con constancia.', valor: 20,
    })

    await agregarMitigante(db, {
      sesion, modeloId,
      descripcion: 'Mitigante de prueba',
      efecto: 'Reduce la exposición de los elementos cubiertos.',
      elementoIds: p.todosMitigados ? elementos.map((e) => e.id) : [tipoCliente.id],
      nivelId: auditado,
      evidenciaRef: 'Manual §1',
    })

    await activarModelo(db, { sesion, modeloId, vigenteDesde: '2027-03-01' })

    const { evaluacionId } = await evaluarEntidadYRegistrar(db, {
      sesion, hoy: HOY_ENTIDAD, base: 'anio_completo',
      periodoInicio: '2026-01-01', periodoFin: '2026-12-31',
      totalClientes: 120, totalOperaciones: 350, montoOperadoCentavos: 5_000_000_00,
    })
    if (evaluacionId === null) throw new Error('la evaluación de prueba no se registró')
    return { evaluacionId }
  }

  /**
   * Una persona de la plantilla del Cap. XII, CON una constancia de
   * capacitación acreditada — lo que el Art. 44 in fine exige del auditor
   * interno. Se usa también para el candidato REC: el trigger de capacitación
   * corre ANTES que el de la REC (orden alfabético de triggers BEFORE INSERT
   * sobre la misma tabla), así que sin constancia el insert moriría por
   * "sin acreditación" y nunca llegaría a probar la guarda de la REC.
   */
  const personaConConstancia = async (
    sesion: ContextoSesion,
    nombre: string,
    rol: 'auditoria' | 'directivo' | 'rec',
  ) => {
    const { personaId } = await agregarAPlantilla(db, {
      sesion, nombre, rol, ingresoAlArea: '2027-01-02',
    })
    await registrarSesion(db, {
      sesion, anio: 2027, hoy: '2027-06-15',
      datos: {
        titulo: 'Curso anual de cumplimiento',
        fecha: '2027-03-10',
        temas: ['marco_normativo', 'manual_politicas', 'actos_articulo_17', 'riesgos_del_obligado', 'tecnicas_400_bis'],
        dirigidaA: ['auditoria', 'directivo', 'rec'],
        instructorNombre: 'Instructora Acreditada',
        instructorAniosExperiencia: 8,
        acreditacion: { hash: HASH_ACREDITACION, archivo: 'cv.pdf' },
        asistentes: [personaId],
      },
    })
    const a = await db.query(
      `select id::text from asistencias_capacitacion where tenant_id=$1 and persona_id=$2`,
      [sesion.tenantId, personaId],
    )
    const asistenciaId = (a.rows[0] as { id: string }).id
    await evaluarYAcreditar(db, {
      sesion, asistenciaId, satisfactoria: true, fecha: '2027-03-11', folio: `C-${nombre}`,
    })
    return { personaId }
  }

  const externoCompleto = (overrides?: Partial<DatosAuditorExterno>): DatosAuditorExterno => ({
    nombre: 'Auditora Externa',
    profesion: 'Contaduría',
    cedulaProfesional: 'CED-001',
    aniosExperiencia: 5,
    certificacionUifFolio: 'UIF-001',
    certificacionUifVence: '2031-01-01',
    sinSentenciaPatrimonial: true,
    sinServiciosPreviosEnConflicto: true,
    sinCargoRecEnVeda: true,
    ...overrides,
  })

  /**
   * Captura el error de una promesa que debe rechazar, con `message` Y
   * `detail`: los triggers del Art. 44/45 citan el artículo en `detail`, no
   * en `message` (Postgres separa los dos, y node-postgres no los concatena).
   */
  const fallaCon = async (promesa: Promise<unknown>): Promise<Error & { detail?: string }> => {
    try {
      await promesa
    } catch (e) {
      return e as Error & { detail?: string }
    }
    throw new Error('se esperaba que la operación fallara y no falló')
  }

  // ─────────────────────────────────────────────────────────────────────
  // Los plazos del catálogo
  // ─────────────────────────────────────────────────────────────────────

  it('los cuatro plazos del capítulo salen del catálogo, con su vigencia', async () => {
    const p = await plazosDeAuditoria(db, HOY_AUDITORIA)
    expect(p.primerPeriodoAnio).toBe(2028)
    expect(p.entregaMes).toBe(3)
    expect(p.experienciaMinimaAnios).toBe(3)
    expect(p.vedaRecAnios).toBe(2)
    expect(p.exigibleDesde).toBe('2028-01-01')
  })

  // ─────────────────────────────────────────────────────────────────────
  // Abrir el periodo — Arts. 42/43
  // ─────────────────────────────────────────────────────────────────────

  describe('Abrir el periodo', () => {
    it('sin ninguna evaluación de entidad, se detiene: no hay ruta que decidir', async () => {
      await expect(
        abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA }),
      ).rejects.toBeInstanceOf(SinEvaluacionDeEntidad)
    })

    it('con evaluación de grado ALTO, el periodo congela la ruta externa obligatoria y la evaluación exacta', async () => {
      const { evaluacionId } = await evaluacion(admin, { todosMitigados: false })
      const p = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
      expect(p.ruta).toBe('externa_obligatoria')

      const fila = await db.query(
        `select evaluacion_entidad_id::text as id, ruta::text as ruta from periodos_auditoria where id = $1`,
        [p.periodoId],
      )
      const f = fila.rows[0] as { id: string; ruta: string }
      expect(f.id).toBe(evaluacionId)
      expect(f.ruta).toBe('externa_obligatoria')
    })

    it('con evaluación de grado BAJO, el periodo congela la ruta interna permitida', async () => {
      const { evaluacionId } = await evaluacion(admin, { todosMitigados: true })
      const p = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
      expect(p.ruta).toBe('interna_permitida')

      const fila = await db.query(
        `select evaluacion_entidad_id::text as id from periodos_auditoria where id = $1`,
        [p.periodoId],
      )
      expect((fila.rows[0] as { id: string }).id).toBe(evaluacionId)
    })

    it('dos periodos del mismo año en el mismo obligado no coexisten', async () => {
      await evaluacion(admin, { todosMitigados: true })
      await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
      await expect(
        abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA }),
      ).rejects.toThrow(new RegExp(`Ya existe un periodo de auditoría abierto para el año ${String(ANIO)}`))
    })

    // El periodo LARGO del Art. 43 (es_primer_periodo_de_operaciones = true)
    // solo se dispara cuando el año de `inicio_de_operaciones` es >=
    // `primerPeriodoAnio` (2028, del catálogo). Pero
    // `tenants.inicio_de_operaciones` trae el CHECK
    // `inicio_de_operaciones_plausible` (esta migración, líneas 106-110):
    // `<= current_date`, y un CHECK no lo salta ningún rol —a diferencia de
    // RLS, no hay BYPASSRLS que valga—. Hoy, contra la base real
    // (`current_date` = 2026-09-08), NINGÚN valor de `inicio_de_operaciones`
    // puede ser a la vez "plausible" (no futuro) y "elegible para el Art. 43"
    // (año >= 2028): sembrar el escenario de punta a punta es sembrar una
    // mentira ("este obligado inició operaciones en el futuro"), y eso es
    // justo lo que la regla dura 6 pide no hacer, ni siquiera en una prueba.
    // No es un hueco de cobertura: el caso todavía no puede existir en la
    // base real. Vive probado a nivel de dominio (función pura, sin CHECK de
    // por medio) en tests/clientes/auditoria.test.ts:
    // "Art. 43, periodo largo: inicio 15-may-2029 → 15-may-2029 a 31-dic-2030".
    it.todo(
      'Art. 43 · el año de cierre abre el periodo largo (inalcanzable en persistencia hasta 2028 — ver comentario arriba, y tests/clientes/auditoria.test.ts)',
    )

    it('sin inicio de operaciones, el año del primer periodo abre el ordinario CON advertencia — nunca adivina (ADR-34)', async () => {
      await evaluacion(admin, { todosMitigados: true })
      const p = await abrirPeriodo(db, { sesion: admin, anio: 2028, hoy: HOY_AUDITORIA })
      expect(p.esPrimerPeriodoDeOperaciones).toBe(false)
      expect(p.inicio).toBe('2028-01-01')
      expect(p.fin).toBe('2028-12-31')
      expect(p.advertencia).not.toBeNull()
      expect(p.advertencia).toMatch(/no se sabe/)
    })

    it('la advertencia sobrevive a la lectura: la pantalla de mañana no afirma una certeza que nunca hubo', async () => {
      // El hueco que esta prueba cierra era del lado de la LECTURA: la
      // advertencia se devolvía al abrir y ahí moría, así que quien cargara
      // la pantalla después veía un periodo del Art. 42 sin rastro de que
      // VIZO nunca pudo confirmar que no tocaba el largo del Art. 43. Se
      // guarda congelada —describe cómo se calculó ESTE periodo, no cómo se
      // calcularía hoy— igual que la ruta.
      await evaluacion(admin, { todosMitigados: true })
      await abrirPeriodo(db, { sesion: admin, anio: 2028, hoy: HOY_AUDITORIA })

      const estado = await enTransaccionDeSesion(db, admin, () =>
        estadoDeAuditoria(db, { sesion: admin, anio: 2028, hoy: HOY_AUDITORIA }),
      )
      expect(estado.periodo).not.toBeNull()
      expect(estado.periodo?.advertencia).toMatch(/no se sabe/)
    })

    /**
     * El caso exacto del enunciado ("el año que el periodo largo ya cubre")
     * tiene el mismo bloqueo que el test anterior: necesita un
     * `inicio_de_operaciones` >= 2028, y eso no es sembrable hoy contra el
     * CHECK `inicio_de_operaciones_plausible`. Ya está probado a nivel de
     * dominio puro en tests/clientes/auditoria.test.ts ("el año que el
     * periodo largo ya cubre no es un periodo propio: lanza nombrando el de
     * cierre"). Lo que SÍ es responsabilidad de la PERSISTENCIA —y sí se
     * puede probar hoy— es que envuelve tal cual lo que el dominio lanza:
     * usa la otra rama de error de `periodoDeAuditoria` (año anterior al
     * primer periodo, Transitorio Octavo), que no depende de ninguna fecha
     * de inicio de operaciones.
     */
    it('un año anterior al primer periodo (Transitorio Octavo) también se detiene, y la persistencia envuelve el error del dominio tal cual', async () => {
      await evaluacion(admin, { todosMitigados: true })
      await expect(
        abrirPeriodo(db, { sesion: admin, anio: 2027, hoy: HOY_AUDITORIA }),
      ).rejects.toThrow(/2028/)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Designar al auditor — Arts. 44/45
  // ─────────────────────────────────────────────────────────────────────

  describe('Designar al auditor', () => {
    const periodoInterno = async () => {
      await evaluacion(admin, { todosMitigados: true }) // bajo → interna_permitida
      return abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
    }
    const periodoExterno = async () => {
      await evaluacion(admin, { todosMitigados: false }) // alto → externa_obligatoria
      return abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
    }

    it('el auditor interno no puede ser la propia REC, y el error cita el Art. 44', async () => {
      const periodo = await periodoInterno()
      const { personaId } = await personaConConstancia(admin, 'La REC', 'rec')

      const err = await fallaCon(
        designarAuditorInterno(db, { sesion: admin, periodoId: periodo.periodoId, personaId }),
      )
      expect(err.message).toMatch(/Representante Encargada de Cumplimiento/)
      expect(err.detail).toMatch(/Art\. 44/)
    })

    it('el auditor interno sin ninguna constancia acreditada no entra, y el error cita el Art. 44 in fine', async () => {
      const periodo = await periodoInterno()
      const { personaId } = await agregarAPlantilla(db, {
        sesion: admin, nombre: 'Sin constancia todavía', rol: 'directivo', ingresoAlArea: '2027-01-02',
      })

      const err = await fallaCon(
        designarAuditorInterno(db, { sesion: admin, periodoId: periodo.periodoId, personaId }),
      )
      expect(err.message).toMatch(/no tiene ninguna acreditación de capacitación/)
      expect(err.detail).toMatch(/Art\. 44 in fine/)
    })

    it('un auditor interno que no es la REC y sí tiene constancia entra, y estadoDeAuditoria reporta los dos hechos verificados', async () => {
      const periodo = await periodoInterno()
      const { personaId } = await personaConConstancia(admin, 'Auditor apto', 'auditoria')

      const { auditorId } = await designarAuditorInterno(db, {
        sesion: admin, periodoId: periodo.periodoId, personaId,
      })
      expect(auditorId).not.toBe('')

      const estado = await enTransaccionDeSesion(db, admin, () =>
        estadoDeAuditoria(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA }),
      )
      expect(estado.auditorVigente?.id).toBe(auditorId)
      expect(estado.auditorVigente?.esElRec).toBe(false)
      expect(estado.auditorVigente?.tieneConstanciaAcreditada).toBe(true)
    })

    it('un periodo no puede tener dos auditores vigentes a la vez', async () => {
      const periodo = await periodoInterno()
      const { personaId: p1 } = await personaConConstancia(admin, 'Primero', 'auditoria')
      const { personaId: p2 } = await personaConConstancia(admin, 'Segundo', 'directivo')

      await designarAuditorInterno(db, { sesion: admin, periodoId: periodo.periodoId, personaId: p1 })
      await expect(
        designarAuditorInterno(db, { sesion: admin, periodoId: periodo.periodoId, personaId: p2 }),
      ).rejects.toThrow(/ya tiene un auditor vigente/)
    })

    /**
     * `designarAuditorInterno` valida la ruta EN TYPESCRIPT antes de tocar la
     * base (persistencia/auditoria.ts, "LA RUTA SE VALIDA AQUÍ, NO EN LA
     * BASE"): llamando por esa función, la precondición de TS SIEMPRE gana,
     * porque corre primero. Por eso el mensaje que se prueba aquí es el de la
     * precondición, no el del trigger.
     */
    it('en un periodo de ruta externa obligatoria, el interno no entra: la precondición de TS cita el Art. 45', async () => {
      const periodo = await periodoExterno()
      const { personaId } = await personaConConstancia(admin, 'Apto pero ruta cerrada', 'auditoria')

      await expect(
        designarAuditorInterno(db, { sesion: admin, periodoId: periodo.periodoId, personaId }),
      ).rejects.toThrow(/ruta de auditoría externa obligatoria \(Art\. 45/)
    })

    /**
     * El trigger `auditor_interno_solo_si_la_ruta_lo_permite` es el respaldo
     * de nivel 2 de la misma regla: un INSERT que no pase por
     * `designarAuditorInterno` (código futuro, un script, un error de quien
     * programe) tampoco puede saltársela. Se prueba yendo DIRECTO a la tabla,
     * con el rol real de la app.
     */
    it('la base también impide (nivel 2) el interno en ruta externa, sin pasar por designarAuditorInterno', async () => {
      const periodo = await periodoExterno()
      const { personaId } = await personaConConstancia(admin, 'Directo a la base', 'auditoria')

      await expect(
        enTransaccionDeSesion(db, admin, () =>
          db.query(
            `insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
             values ($1,$2,'interna',$3,$4)`,
            [admin.tenantId, periodo.periodoId, personaId, admin.usuarioId],
          ),
        ),
      ).rejects.toThrow(/exige auditor externo/)
    })

    it('EL MÍNIMO DE AÑOS SALE DEL CATÁLOGO: el auditor externo por debajo del mínimo no entra', async () => {
      const periodo = await periodoExterno()
      await expect(
        designarAuditorExterno(db, {
          sesion: admin, periodoId: periodo.periodoId,
          datos: externoCompleto({ aniosExperiencia: 1 }),
        }),
      ).rejects.toThrow(/al menos 3 años de experiencia en PLD \(Art\. 45 inciso a\)/)
    })

    it('el auditor externo completo y correcto entra, con cualquier ruta del periodo', async () => {
      const periodo = await periodoExterno()
      const { auditorId } = await designarAuditorExterno(db, {
        sesion: admin, periodoId: periodo.periodoId, datos: externoCompleto(),
      })
      expect(auditorId).not.toBe('')
    })

    /**
     * El CHECK `auditor_externo_con_sus_requisitos` es el respaldo de nivel 2
     * de TODA la validación que `designarAuditorExterno` ya hace en
     * TypeScript (nombre, profesión, cédula, certificación UIF, los tres
     * incisos c)/d)/e)). La función nunca deja pasar un externo incompleto,
     * así que para probar que la base TAMBIÉN lo impide hay que ir directo a
     * la tabla.
     */
    it('la base también impide (nivel 2) un externo incompleto, sin pasar por designarAuditorExterno', async () => {
      const periodo = await periodoExterno()
      await expect(
        enTransaccionDeSesion(db, admin, () =>
          db.query(
            `insert into auditores_designados
               (tenant_id, periodo_id, tipo, nombre, profesion, cedula_profesional, anios_experiencia,
                certificacion_uif_folio, certificacion_uif_vence,
                sin_sentencia_patrimonial, sin_servicios_previos_en_conflicto, sin_cargo_rec_en_veda,
                designado_por)
             values ($1,$2,'externa','Sin folio UIF','Contaduría','CED-999',5,
                     null, null, true, true, true, $3)`,
            [admin.tenantId, periodo.periodoId, admin.usuarioId],
          ),
        ),
      ).rejects.toThrow(/auditor_externo_con_sus_requisitos/)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Sustituir al auditor
  // ─────────────────────────────────────────────────────────────────────

  describe('Sustituir al auditor', () => {
    it('sustituir y designar otro entra: estadoDeAuditoria trae uno vigente y la historia con el sustituido', async () => {
      await evaluacion(admin, { todosMitigados: true })
      const periodo = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
      const { personaId: p1 } = await personaConConstancia(admin, 'Primer auditor', 'auditoria')
      const { personaId: p2 } = await personaConConstancia(admin, 'Auditor sustituto', 'directivo')

      const { auditorId: primero } = await designarAuditorInterno(db, {
        sesion: admin, periodoId: periodo.periodoId, personaId: p1,
      })
      await sustituirAuditor(db, {
        sesion: admin, auditorId: primero, motivo: 'Renuncia de la persona auditora', hoy: HOY_AUDITORIA,
      })
      const { auditorId: sustituto } = await designarAuditorInterno(db, {
        sesion: admin, periodoId: periodo.periodoId, personaId: p2,
      })

      const estado = await enTransaccionDeSesion(db, admin, () =>
        estadoDeAuditoria(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA }),
      )
      expect(estado.auditorVigente?.id).toBe(sustituto)
      expect(estado.historiaDeAuditores.map((a) => a.id)).toEqual([primero])
      expect(estado.historiaDeAuditores[0]?.motivoSustitucion).toBe('Renuncia de la persona auditora')
    })

    it('un auditor que no existe en este obligado, o que ya fue sustituido, no se sustituye otra vez', async () => {
      await evaluacion(admin, { todosMitigados: true })
      const periodo = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
      const { personaId } = await personaConConstancia(admin, 'Auditor único', 'auditoria')
      const { auditorId } = await designarAuditorInterno(db, {
        sesion: admin, periodoId: periodo.periodoId, personaId,
      })
      await sustituirAuditor(db, { sesion: admin, auditorId, motivo: 'Renuncia', hoy: HOY_AUDITORIA })

      await expect(
        sustituirAuditor(db, { sesion: admin, auditorId, motivo: 'Otra vez', hoy: HOY_AUDITORIA }),
      ).rejects.toThrow(/no existe en este obligado, o ya fue sustituido antes/)
    })

    it('la base impide editar un auditor designado más allá de su sustitución (nivel 2, no solo la precondición de TS)', async () => {
      await evaluacion(admin, { todosMitigados: true })
      const periodo = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })
      const { personaId } = await personaConConstancia(admin, 'Auditor a prueba', 'auditoria')
      const { auditorId } = await designarAuditorInterno(db, {
        sesion: admin, periodoId: periodo.periodoId, personaId,
      })

      // Un UPDATE crudo (no vía sustituirAuditor) que SÍ pone fecha a la
      // sustitución pero de paso intenta cambiar algo más. Si solo tocara
      // `tipo` sin `sustituido_en`, moriría antes por "no dejarla en null" —
      // el trigger revisa esa condición primero — y nunca probaría esta.
      await expect(
        enTransaccionDeSesion(db, admin, () =>
          db.query(
            `update auditores_designados
                set sustituido_en = now(), motivo_sustitucion = 'Intento de editar lo designado', tipo = 'externa'
              where id = $1`,
            [auditorId],
          ),
        ),
      ).rejects.toThrow(/lo designado es lo designado/)

      // Sustituido de verdad, un segundo UPDATE crudo sobre la sustitución ya
      // asentada también muere — sustituirAuditor() nunca llega a probarlo
      // porque su propio WHERE (sustituido_en is null) no toca la fila.
      await sustituirAuditor(db, { sesion: admin, auditorId, motivo: 'Renuncia', hoy: HOY_AUDITORIA })
      await expect(
        enTransaccionDeSesion(db, admin, () =>
          db.query(`update auditores_designados set motivo_sustitucion = 'cambiado' where id = $1`, [auditorId]),
        ),
      ).rejects.toThrow(/ya fue sustituido/)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // Append-only y aislamiento por tenant
  // ─────────────────────────────────────────────────────────────────────

  describe('El periodo es append-only, y el aislamiento por tenant no se salta', () => {
    it('el periodo no se puede editar ni borrar, con el rol de la app', async () => {
      await evaluacion(admin, { todosMitigados: true })
      const periodo = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })

      await expect(
        enTransaccionDeSesion(db, admin, () =>
          db.query(`update periodos_auditoria set ruta = 'externa_obligatoria' where id = $1`, [periodo.periodoId]),
        ),
      ).rejects.toThrow()

      await expect(
        enTransaccionDeSesion(db, admin, () =>
          db.query(`delete from periodos_auditoria where id = $1`, [periodo.periodoId]),
        ),
      ).rejects.toThrow()

      // Y del otro lado sigue exactamente como se abrió.
      const fila = await db.query(`select ruta::text as ruta from periodos_auditoria where id = $1`, [
        periodo.periodoId,
      ])
      expect(fila.rows).toHaveLength(1)
      expect((fila.rows[0] as { ruta: string }).ruta).toBe('interna_permitida')
    })

    it('designar un auditor citando el periodo de OTRO obligado no pasa en silencio', async () => {
      await evaluacion(admin, { todosMitigados: true })
      const periodoAjeno = await abrirPeriodo(db, { sesion: admin, anio: ANIO, hoy: HOY_AUDITORIA })

      const marcaOtro = String(Date.now()).slice(-6) + 'b' + String(Math.floor(Math.random() * 90) + 10)
      const otro = await crearTenantConUsuario(db, marcaOtro, 'admin')

      // Tipo 'externa' a propósito: así lo único que puede rechazar es el
      // aislamiento del periodo, no los triggers de interna (que consultarían
      // personas_capacitables bajo un tenant donde esa persona no existe, por
      // una razón distinta a la que aquí se prueba).
      await expect(
        designarAuditorExterno(db, {
          sesion: otro, periodoId: periodoAjeno.periodoId, datos: externoCompleto(),
        }),
      ).rejects.toThrow(/no existe en este obligado/)

      const n = await db.query(
        `select count(*)::int as n from auditores_designados where periodo_id = $1`,
        [periodoAjeno.periodoId],
      )
      expect((n.rows[0] as { n: number }).n).toBe(0)
    })
  })

  // ─────────────────────────────────────────────────────────────────────
  // La fecha límite de entrega y el calendario de días inhábiles
  // ─────────────────────────────────────────────────────────────────────

  describe('La fecha límite de entrega y el calendario de días inhábiles', () => {
    it('sin días inhábiles cargados para el año de entrega, la fecha límite no confía en un calendario que no tiene; cargados, un periodo de otro año los respeta', async () => {
      await evaluacion(admin, { todosMitigados: true })

      // Sub-caso A: año de entrega (2091) SIN calendario cargado.
      const sinCalendario = await abrirPeriodo(db, { sesion: admin, anio: 2090, hoy: HOY_AUDITORIA })
      expect(sinCalendario.limiteConCalendario).toBe(false)
      const dow1 = new Date(`${sinCalendario.fechaLimiteEntrega}T00:00:00Z`).getUTCDay()
      expect(dow1).not.toBe(0)
      expect(dow1).not.toBe(6)

      // Sub-caso B: se carga el calendario del año de entrega de OTRO periodo
      // (2092, el de un periodo del año 2091) con el mismo día que, sin
      // calendario, habría quedado como fecha límite — para que la carga
      // fuerce un retroceso verificable, no solo un flag distinto.
      const sinCargar = fechaLimiteDeEntrega({
        periodoFin: '2091-12-31', mesEntrega: 3, diasInhabiles: [], calendarioCargado: false,
      })
      await db.query(
        `insert into dias_inhabiles (anio, fecha, motivo, fuente)
         values (2092, $1, 'Día de prueba de auditoría', 'tests/persistencia/auditoria.test.ts')`,
        [sinCargar.fecha],
      )
      try {
        const conCalendario = await abrirPeriodo(db, { sesion: admin, anio: 2091, hoy: HOY_AUDITORIA })
        expect(conCalendario.limiteConCalendario).toBe(true)
        expect(conCalendario.fechaLimiteEntrega).not.toBe(sinCargar.fecha)
        const dow2 = new Date(`${conCalendario.fechaLimiteEntrega}T00:00:00Z`).getUTCDay()
        expect(dow2).not.toBe(0)
        expect(dow2).not.toBe(6)
      } finally {
        // dias_inhabiles es GLOBAL (no por tenant): lo que se carga aquí se
        // limpia aquí, para no dejarle a la siguiente corrida de la suite un
        // año que ya no está "vacío a propósito".
        await db.query(`delete from dias_inhabiles where fecha = $1`, [sinCargar.fecha])
      }
    })
  })
})
