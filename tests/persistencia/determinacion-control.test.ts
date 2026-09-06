import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeDeterminacionInvalido,
  determinacionesDelCliente,
  proponerControl,
  reglasDelObligado,
  resolverControl,
} from '../../src/persistencia/determinacion-control'
import {
  agregarParte,
  agregarParticipacion,
  identificarDesdeLaEstructura,
} from '../../src/persistencia/grafo-societario'
import { estadoDelBeneficiario } from '../../src/persistencia/beneficiario-controlador'
import { aprobarExpediente } from '../../src/persistencia/expediente'

/**
 * La determinación humana de control efectivo, de punta a punta.
 *
 * Lo que protegen: que una propuesta abierta BLOQUEE la corrida y la
 * aprobación del expediente (caso 3 del plano), que la fr. II solo coma
 * confirmadas, que el fundamento sea obligatorio en ambos sentidos, y que el
 * criterio se pueda guardar como regla con sus casos.
 */
describe('La determinación de control efectivo', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let raizId: string
  let socioId: string

  const HOY = '2027-06-15'
  const FECHA = '2027-06-10'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    const c = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                     requiere_revision_identidad, domicilio)
       values ($1,'moral','Cliente con socio al 5',$2,false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId, `DET${marca.slice(0, 6)}X9`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    // El caso 3 del plano: socio con 5% y voto de calidad estatutario.
    const raiz = await agregarParte(db, {
      sesion, clienteId, tipo: 'moral', nombre: 'Cliente con socio al 5', esLaRaiz: true,
    })
    raizId = raiz.parteId
    const socio = await agregarParte(db, {
      sesion, clienteId, tipo: 'fisica', nombre: 'Socio con veto', rfc: 'SOVE800101AB1',
    })
    socioId = socio.parteId
    await agregarParticipacion(db, {
      sesion, clienteId, duenoId: socioId, poseidaId: raizId,
      porcentaje: 5, vigenteDesde: '2027-01-01',
    })
  })

  const proponer = () =>
    proponerControl(db, {
      sesion, clienteId, parteId: socioId,
      medio: 'Voto de calidad estatutario en el consejo',
      areas: ['toma_de_decisiones'],
    })

  it('CASO 3 DEL PLANO: la propuesta abierta bloquea la corrida del orden', async () => {
    await proponer()
    await expect(
      identificarDesdeLaEstructura(db, {
        sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
      }),
    ).rejects.toThrow(/control efectivo sin resolver.*Socio con veto/)
  })

  it('y bloquea también la APROBACIÓN del expediente — lo impone la base', async () => {
    await proponer()
    const act = await db.query(`select id from actividades_vulnerables where fraccion='V_BIS'`)
    const e = await db.query(
      `insert into expedientes (tenant_id, cliente_id, actividad_id, version, estatus)
       values ($1,$2,$3,1,'completo') returning id::text`,
      [sesion.tenantId, clienteId, (act.rows[0] as { id: string }).id],
    )
    const expedienteId = (e.rows[0] as { id: string }).id

    await expect(
      aprobarExpediente(db, { sesion, expedienteId }),
    ).rejects.toThrow(/control efectivo sin resolver/)

    // Resuelta la pregunta, la aprobación pasa.
    const dets = await enTransaccionDeSesion(db, sesion, () =>
      determinacionesDelCliente(db, { sesion, clienteId }),
    )
    await resolverControl(db, {
      sesion, determinacionId: dets[0]?.id ?? '', conclusion: 'rechazada',
      fundamento: 'El voto de calidad requiere empate previo y el consejo es de número impar',
    })
    await aprobarExpediente(db, { sesion, expedienteId })
  })

  it('CONFIRMADA, la fracción II la come — y el hallazgo cita el medio', async () => {
    const { determinacionId } = await proponer()
    await resolverControl(db, {
      sesion, determinacionId, conclusion: 'confirmada',
      fundamento: 'Los estatutos le dan voto de calidad: dirige la toma de decisiones en empate',
    })

    await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, { sesion, clienteId, hoy: HOY }),
    )
    // 5% no alcanza la fr. I; el control confirmado lo halla la fr. II.
    expect(e.vigente?.hallazgos[0]?.nombre).toBe('Socio con veto')
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('II')
    expect(e.vigente?.hallazgos[0]?.base).toMatch(/voto de calidad/i)
  })

  it('RECHAZADA no entra a la fracción II, pero queda como evidencia', async () => {
    const { determinacionId } = await proponer()
    await resolverControl(db, {
      sesion, determinacionId, conclusion: 'rechazada',
      fundamento: 'La cláusula exige mayoría calificada previa: no decide solo',
    })

    // Sin control y con 5%, el orden necesita la fr. III.
    const dg = await agregarParte(db, {
      sesion, clienteId, tipo: 'fisica', nombre: 'Director General',
    })
    await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
      funcionarios: [{ parteId: dg.parteId, cargo: 'Director General', rango: 1 }],
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, { sesion, clienteId, hoy: HOY }),
    )
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('III')

    const dets = await enTransaccionDeSesion(db, sesion, () =>
      determinacionesDelCliente(db, { sesion, clienteId }),
    )
    expect(dets[0]?.estado).toBe('rechazada')
    expect(dets[0]?.fundamento).toMatch(/mayoría calificada/)
  })

  it('EL FUNDAMENTO ES OBLIGATORIO en ambos sentidos', async () => {
    const { determinacionId } = await proponer()
    await expect(
      resolverControl(db, {
        sesion, determinacionId, conclusion: 'rechazada', fundamento: '   ',
      }),
    ).rejects.toThrow(/«no» sin razones no defiende nada/)
  })

  it('el criterio se guarda como regla, y la regla acumula sus casos', async () => {
    const { determinacionId } = await proponer()
    await resolverControl(db, {
      sesion, determinacionId, conclusion: 'confirmada',
      fundamento: 'El voto de calidad decide en empate: dirección efectiva',
      guardarComoRegla: { patron: 'Cláusula de voto de calidad en el consejo' },
    })

    let reglas = await enTransaccionDeSesion(db, sesion, () => reglasDelObligado(db, { sesion }))
    expect(reglas).toHaveLength(1)
    expect(reglas[0]?.conclusion).toBe('constituye_control')
    expect(reglas[0]?.vecesAplicada).toBe(1)

    // El siguiente caso equivalente CITA la regla en vez de reinventarla.
    const otra = await agregarParte(db, {
      sesion, clienteId, tipo: 'fisica', nombre: 'Otra socia con veto',
    })
    const { determinacionId: d2 } = await proponerControl(db, {
      sesion, clienteId, parteId: otra.parteId,
      medio: 'Voto de calidad en el comité directivo', areas: ['toma_de_decisiones'],
    })
    await resolverControl(db, {
      sesion, determinacionId: d2, conclusion: 'confirmada',
      fundamento: 'Mismo patrón: voto de calidad', reglaId: reglas[0]?.id ?? '',
    })
    reglas = await enTransaccionDeSesion(db, sesion, () => reglasDelObligado(db, { sesion }))
    expect(reglas[0]?.vecesAplicada).toBe(2)
  })

  it('dos propuestas abiertas sobre la misma persona no existen', async () => {
    await proponer()
    await expect(proponer()).rejects.toThrow(/ya tiene una propuesta de control abierta/)
  })

  it('una resolución no se repite', async () => {
    const { determinacionId } = await proponer()
    await resolverControl(db, {
      sesion, determinacionId, conclusion: 'confirmada', fundamento: 'Primera y única',
    })
    await expect(
      resolverControl(db, {
        sesion, determinacionId, conclusion: 'rechazada', fundamento: 'Cambio de opinión',
      }),
    ).rejects.toBeInstanceOf(DatoDeDeterminacionInvalido)
  })
})
