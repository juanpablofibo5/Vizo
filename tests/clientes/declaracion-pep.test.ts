import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DeclaracionPepInvalida,
  RevisionPepImposible,
  estadoPepDelCliente,
  registrarDeclaracionPep,
  revisarDeclaracionPep,
  type EstadoPep,
} from '../../src/persistencia/pep'

/**
 * La declaración PEP de punta a punta: captura → derivación → revisión.
 *
 * Las fechas pisan las fronteras donde la lectura de «año calendario» y la de
 * «12 meses» divergen — si alguien cambia el reloj del dominio, esto muere.
 */
describe('La declaración PEP del cliente', () => {
  let db: Client
  let admin: ContextoSesion
  let capturista: ContextoSesion
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
    capturista = { ...admin, rol: 'capturista' }

    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Aportante Persona Física','MX') returning id::text`,
      [admin.tenantId, `PEP${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  const estado = (sesion: ContextoSesion, hoy: string): Promise<EstadoPep> =>
    enTransaccionDeSesion(db, sesion, () => estadoPepDelCliente(db, { sesion, clienteId, hoy }))

  it('sin declaración lo dice, y antes del 30-nov lo marca como vista anticipada', async () => {
    const e = await estado(admin, '2026-08-17')
    expect(e.declaracion).toBeNull()
    expect(e.motivo).toBe('sin_declaracion')
    expect(e.anticipada).toBe(true)
    expect(e.exigibleDesde).toBe('2026-11-30')
  })

  it('captura una red asimilada y deriva el reloj de año calendario, no el de 12 meses', async () => {
    // Cónyuge nacional cesada el 15-ene-2026. En junio de 2027 la lectura de
    // 12 meses ya la habría soltado; la de año calendario la mantiene hasta el
    // 31-dic-2027.
    await registrarDeclaracionPep(db, {
      sesion: capturista,
      clienteId,
      resultado: 'pep_asimilada',
      fechaDeclaracion: '2027-05-30',
      vinculos: [
        {
          tipo: 'conyuge',
          nombrePep: 'Cónyuge Funcionaria',
          cargo: 'Magistrada',
          ambito: 'nacional',
          enFunciones: false,
          fechaCese: '2026-01-15',
        },
      ],
    })

    const e = await estado(capturista, '2027-06-01')
    expect(e.catalogado).toBe(true)
    expect(e.motivo).toBe('asimilada')
    expect(e.declaracion?.vinculos[0]?.catalogacion).toEqual({
      catalogada: true,
      motivo: 'ano_siguiente_al_cese',
      hasta: '2027-12-31',
    })

    // …y al año siguiente el reloj ya venció, con la MISMA declaración.
    const despues = await estado(capturista, '2028-01-02')
    expect(despues.catalogado).toBe(false)
    expect(despues.motivo).toBe('relojes_vencidos')
  })

  it('REGLA DURA 3: la bitácora registra el hecho, nunca a la persona', async () => {
    await registrarDeclaracionPep(db, {
      sesion: capturista,
      clienteId,
      resultado: 'pep_asimilada',
      fechaDeclaracion: '2027-05-30',
      vinculos: [
        {
          tipo: 'socio_patrimonial',
          nombrePep: 'Socio Identificable',
          cargo: 'Alto ejecutivo de empresa estatal',
          ambito: 'nacional',
          enFunciones: true,
          detalle: 'Inmobiliaria Vinculada SA',
        },
      ],
    })

    const ev = await db.query(
      `select datos::text as datos from bitacora
        where tenant_id = $1 and evento = 'pep.declarada'`,
      [admin.tenantId],
    )
    expect(ev.rows).toHaveLength(1)
    const datos = (ev.rows[0] as { datos: string }).datos
    expect(datos).toContain('pep_asimilada')
    expect(datos).not.toContain('Socio Identificable')
    expect(datos).not.toContain('ejecutivo')
    expect(datos).not.toContain('Inmobiliaria')
  })

  it('el que niega queda registrado como hecho, no como ausencia', async () => {
    await registrarDeclaracionPep(db, {
      sesion: capturista,
      clienteId,
      resultado: 'niega',
      fechaDeclaracion: '2027-05-30',
      vinculos: [],
    })
    const e = await estado(capturista, '2027-06-01')
    expect(e.declaracion).not.toBeNull()
    expect(e.catalogado).toBe(false)
    expect(e.motivo).toBe('declaro_que_no')
  })

  it('una captura incoherente no llega a la base, y el mensaje dice qué falta', async () => {
    await expect(
      registrarDeclaracionPep(db, {
        sesion: capturista,
        clienteId,
        resultado: 'pep_por_funcion',
        fechaDeclaracion: '2027-05-30',
        vinculos: [],
      }),
    ).rejects.toThrow(DeclaracionPepInvalida)

    await expect(
      registrarDeclaracionPep(db, {
        sesion: capturista,
        clienteId,
        resultado: 'pep_asimilada',
        fechaDeclaracion: '2027-05-30',
        vinculos: [
          {
            tipo: 'consanguinidad',
            nombrePep: 'Pariente Sin Grado',
            cargo: 'Senador',
            ambito: 'nacional',
            enFunciones: true,
          },
        ],
      }),
    ).rejects.toThrow(/grado/)
  })

  it('sobre una persona moral la base se niega: la pregunta correcta es el Beneficiario Controlador', async () => {
    const m = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora Moral SA','MX') returning id::text`,
      [admin.tenantId, `PEM${String(Date.now()).slice(-9)}`],
    )
    await expect(
      registrarDeclaracionPep(db, {
        sesion: capturista,
        clienteId: (m.rows[0] as { id: string }).id,
        resultado: 'niega',
        fechaDeclaracion: '2027-05-30',
        vinculos: [],
      }),
    ).rejects.toThrow(/personas físicas/)
  })

  it('la revisión es del admin, congela, y no se repite', async () => {
    const { declaracionId } = await registrarDeclaracionPep(db, {
      sesion: capturista,
      clienteId,
      resultado: 'niega',
      fechaDeclaracion: '2027-05-30',
      vinculos: [],
    })

    // El capturista no revisa: la política RLS deja la fila fuera de su UPDATE.
    await expect(
      revisarDeclaracionPep(db, { sesion: capturista, declaracionId, hoy: '2027-06-01' }),
    ).rejects.toThrow(/administrador/)

    await revisarDeclaracionPep(db, { sesion: admin, declaracionId, hoy: '2027-06-01' })
    const e = await estado(admin, '2027-06-02')
    expect(e.declaracion?.revisadaEn).toBe('2027-06-01')

    // Una segunda revisión no corrige la primera.
    await expect(
      revisarDeclaracionPep(db, { sesion: admin, declaracionId, hoy: '2027-06-03' }),
    ).rejects.toThrow(RevisionPepImposible)
  })

  it('¶5 de punta a punta: un acto con la PEP recién cesada reinicia el reloj desde el acto', async () => {
    // Titular cesada el 15-ene-2026: su reloj del cese muere el 31-dic-2027.
    // Pero hubo una aportación el 10-ene-2027 —dentro del año inmediato
    // anterior al cese… del cese al acto— y eso la cataloga hasta el
    // 31-dic-2028.
    await registrarDeclaracionPep(db, {
      sesion: capturista,
      clienteId,
      resultado: 'pep_por_funcion',
      fechaDeclaracion: '2027-01-05',
      vinculos: [
        {
          tipo: 'titular',
          cargo: 'Presidenta municipal',
          ambito: 'nacional',
          enFunciones: false,
          fechaCese: '2026-01-15',
        },
      ],
    })

    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [admin.tenantId],
    )
    const des = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal,
          colonia, calle, tipo_desarrollo, monto_desarrollo, unidades_comercializadas, costo_unidad)
       values ($1, 'Torre de Prueba', $2, '31', '97000', 'Centro', 'Calle 60', '1', 1000000, 10, 100000)
       returning id`,
      [admin.tenantId, `LIC-${String(Date.now()).slice(-8)}`],
    )
    await db.query(
      `insert into operaciones
         (tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
          monto_base, monto_total, forma_pago, registrado_por, desarrollo_id)
       select $1, $2, $3, id, '2027-01-10', 100000, 100000, '03', $4, $5
         from actividades_vulnerables where fraccion = 'V_BIS'`,
      [admin.tenantId, (s.rows[0] as { id: string }).id, clienteId, admin.usuarioId,
       (des.rows[0] as { id: string }).id],
    )

    const e = await estado(admin, '2028-06-01')
    expect(e.catalogado).toBe(true)
    expect(e.motivo).toBe('por_funcion')
    expect(e.declaracion?.vinculos[0]?.catalogacion).toMatchObject({
      motivo: 'ano_siguiente_al_acto',
      hasta: '2028-12-31',
      fechaActo: '2027-01-10',
    })
  })
})
