import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeEventoInvalido,
  eventosDelCliente,
  registrarEvento,
} from '../../src/persistencia/eventos-estructurales'
import {
  agregarParte,
  agregarParticipacion,
  estructuraDelCliente,
  identificarDesdeLaEstructura,
} from '../../src/persistencia/grafo-societario'

/**
 * Los eventos estructurales, de punta a punta.
 *
 * Lo que protegen: que registrar el evento dispare sus cuatro efectos en UNA
 * transacción, que el plazo salga del catálogo y quede congelado, y que la
 * siguiente identificación atienda lo pendiente — pero solo lo que ya ocurrió.
 */
describe('Los eventos estructurales', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let raizId: string
  let sofiaId: string
  let participacionId: string

  const HOY = '2027-06-15'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    const c = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                     requiere_revision_identidad, domicilio)
       values ($1,'moral','Cliente que cambia',$2,false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId, `EVE${marca.slice(0, 6)}X9`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const raiz = await agregarParte(db, {
      sesion, clienteId, tipo: 'moral', nombre: 'Cliente que cambia', esLaRaiz: true,
    })
    raizId = raiz.parteId
    const sofia = await agregarParte(db, {
      sesion, clienteId, tipo: 'fisica', nombre: 'Sofía Saliente',
    })
    sofiaId = sofia.parteId
    const a = await agregarParticipacion(db, {
      sesion, clienteId, duenoId: sofiaId, poseidaId: raizId,
      porcentaje: 60, vigenteDesde: '2026-01-01',
    })
    participacionId = a.participacionId
  })

  const registrar = (extra: Record<string, unknown> = {}) =>
    registrarEvento(db, {
      sesion, clienteId,
      tipo: 'cambio_accionario',
      descripcion: 'Sofía vendió su 60% a un fondo',
      fechaEvento: '2027-05-01',
      ...extra,
    })

  it('LOS CUATRO EFECTOS EN UNA TRANSACCIÓN: cierre, cola, plazo y alerta', async () => {
    const { eventoId, alertaId, fechaLimite } = await registrar({
      cierraParticipaciones: [participacionId],
    })

    // El plazo salió del catálogo (30 días) y quedó congelado.
    expect(fechaLimite).toBe('2027-05-31')

    // La participación señalada quedó cerrada a la fecha del evento.
    const e = await enTransaccionDeSesion(db, sesion, () =>
      estructuraDelCliente(db, { sesion, clienteId }),
    )
    expect(e.participaciones[0]?.vigenteHasta).toBe('2027-05-01')

    // La alerta existe y NOMBRA su evento.
    const { rows } = await db.query(
      `select evento_estructural_id::text, titulo, detalle from alertas where id = $1`,
      [alertaId],
    )
    expect((rows[0] as { evento_estructural_id: string }).evento_estructural_id).toBe(eventoId)
    expect((rows[0] as { titulo: string }).titulo).toMatch(/cambio accionario/)

    // Y la cola: el evento está pendiente.
    const evs = await enTransaccionDeSesion(db, sesion, () =>
      eventosDelCliente(db, { sesion, clienteId }),
    )
    expect(evs[0]?.atendido).toBe(false)
  })

  it('LA SIGUIENTE IDENTIFICACIÓN ATIENDE lo pendiente — en su misma transacción', async () => {
    await registrar()
    // La estructura nueva: entró el fondo… como persona física dueña del 60%.
    const fondo = await agregarParte(db, {
      sesion, clienteId, tipo: 'fisica', nombre: 'Nuevo Dueño',
    })
    await agregarParticipacion(db, {
      sesion, clienteId, duenoId: fondo.parteId, poseidaId: raizId,
      porcentaje: 35, vigenteDesde: '2027-05-01',
    })

    await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: '2027-06-01', hoy: HOY,
    })

    const evs = await enTransaccionDeSesion(db, sesion, () =>
      eventosDelCliente(db, { sesion, clienteId }),
    )
    expect(evs[0]?.atendido).toBe(true)
  })

  it('PERO NO ATIENDE EL FUTURO: un evento posterior a la identificación queda pendiente', async () => {
    // El evento ocurre el 1-jul; la identificación se corre con fecha 1-jun.
    // Reevaluar ayer no atiende el cambio de mañana.
    await registrar({ fechaEvento: '2027-07-01' })
    await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: '2027-06-01', hoy: HOY,
    })
    const evs = await enTransaccionDeSesion(db, sesion, () =>
      eventosDelCliente(db, { sesion, clienteId }),
    )
    expect(evs[0]?.atendido).toBe(false)
  })

  it('sin descripción no hay evento: el tipo solo no dice qué pasó', async () => {
    await expect(registrar({ descripcion: '   ' })).rejects.toBeInstanceOf(DatoDeEventoInvalido)
  })

  it('la alerta de cambio estructural aparece en la bandeja con su plazo', async () => {
    await registrar()
    const { rows } = await db.query(
      `select detalle from alertas
        where tenant_id = $1 and tipo = 'cambio_estructural'`,
      [sesion.tenantId],
    )
    const detalle = (rows[0] as { detalle: Record<string, unknown> }).detalle
    expect(detalle['fecha_limite']).toBe('2027-05-31')
    expect(String(detalle['motivo'])).toMatch(/durante la vigencia de la Relación de negocios/)
  })

  it('cerrar una participación de otro obligado en el evento no pasa', async () => {
    const otro = await crearTenantConUsuario(db, String(Date.now()).slice(-6) + '77', 'admin')
    const c2 = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                     requiere_revision_identidad, domicilio)
       values ($1,'moral','De otro','DEO270301X9',false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [otro.tenantId],
    )
    const r2 = await agregarParte(db, {
      sesion: otro, clienteId: (c2.rows[0] as { id: string }).id,
      tipo: 'moral', nombre: 'De otro', esLaRaiz: true,
    })
    const pf2 = await agregarParte(db, {
      sesion: otro, clienteId: (c2.rows[0] as { id: string }).id, tipo: 'fisica', nombre: 'Ajena',
    })
    const a2 = await agregarParticipacion(db, {
      sesion: otro, clienteId: (c2.rows[0] as { id: string }).id,
      duenoId: pf2.parteId, poseidaId: r2.parteId, porcentaje: 50, vigenteDesde: '2026-01-01',
    })

    await expect(
      registrar({ cierraParticipaciones: [a2.participacionId] }),
    ).rejects.toThrow(/no existe en este obligado/)
  })
})
