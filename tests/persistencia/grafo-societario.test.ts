import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDelGrafoInvalido,
  agregarParte,
  agregarParticipacion,
  cerrarParticipacion,
  identificarDesdeLaEstructura,
  resolverEstructura,
} from '../../src/persistencia/grafo-societario'
import { estadoDelBeneficiario } from '../../src/persistencia/beneficiario-controlador'

/**
 * El grafo societario sobre la base real, hasta la identificación.
 *
 * Lo que protegen: que la cadena la multiplique el MOTOR y no el capturista,
 * que la resolución se congele completa en la identificación, y que la
 * vigencia de las participaciones respete la fecha del acto — la estructura
 * que importa es la que era cierta ese día.
 */
describe('El grafo societario', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string

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
       values ($1,'moral','Cliente con estructura',$2,false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId, `GRA${marca.slice(0, 6)}X9`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  const parte = (
    tipo: 'fisica' | 'moral' | 'fideicomiso' | 'otra_figura',
    nombre: string,
    extra: { esLaRaiz?: boolean; rfc?: string } = {},
  ) => agregarParte(db, { sesion, clienteId, tipo, nombre, ...extra })

  const participa = (duenoId: string, poseidaId: string, porcentaje: number, desde = '2027-01-01') =>
    agregarParticipacion(db, { sesion, clienteId, duenoId, poseidaId, porcentaje, vigenteDesde: desde })

  it('LA CADENA DEL PLANO, de punta a punta: 60% × 50% = 30% y la fr. I resuelve', async () => {
    const raiz = await parte('moral', 'Cliente con estructura', { esLaRaiz: true })
    const pmB = await parte('moral', 'PM B Holding')
    const pf = await parte('fisica', 'Persona Final', { rfc: 'PEFI800101AB1' })
    await participa(pmB.parteId, raiz.parteId, 50)
    await participa(pf.parteId, pmB.parteId, 60)

    await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, { sesion, clienteId, hoy: HOY }),
    )
    expect(e.vigente?.hallazgos).toHaveLength(1)
    expect(e.vigente?.hallazgos[0]?.nombre).toBe('Persona Final')
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('I')
    // La base del hallazgo trae el 30% que multiplicó el motor, no el humano.
    expect(e.vigente?.hallazgos[0]?.base).toMatch(/30%/)
  })

  it('EL 24% NO ALCANZA — y el orden exige entonces llegar hasta la fracción III', async () => {
    const raiz = await parte('moral', 'Cliente', { esLaRaiz: true })
    const pm = await parte('moral', 'PM Intermedia')
    const pf = await parte('fisica', 'Persona al 24')
    const dg = await parte('fisica', 'Directora General')
    await participa(pm.parteId, raiz.parteId, 80)
    await participa(pf.parteId, pm.parteId, 30)

    // Sin candidato de la fr. III, el motor SE NIEGA a agotar el orden en
    // nadie: es la guarda del ADR-32 —la prelación siempre termina en alguien—
    // haciendo su trabajo también en el camino del grafo.
    await expect(
      identificarDesdeLaEstructura(db, {
        sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
      }),
    ).rejects.toThrow(/fracción III no trae ningún funcionario/)

    // Con la directora señalada —una parte física de la estructura, sin
    // teclear su identidad dos veces— el procedimiento completa: 24% no
    // alcanzó, nadie controla por otros medios, y la fr. III identificó.
    await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
      funcionarios: [{ parteId: dg.parteId, cargo: 'Directora General', rango: 1 }],
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, { sesion, clienteId, hoy: HOY }),
    )
    expect(e.vigente?.pasos.map((x) => `${x.fraccion}:${x.resultado}`)).toEqual([
      'I:no_encontrado', 'II:no_encontrado', 'III:encontrado',
    ])
    // Y el motivo de la fr. I trae el umbral que el 24% no alcanzó.
    expect(e.vigente?.pasos[0]?.motivo).toMatch(/25/)
    expect(e.vigente?.hallazgos[0]?.nombre).toBe('Directora General')
  })

  it('EL SNAPSHOT SE CONGELA: la identificación guarda el grafo que la alimentó', async () => {
    const raiz = await parte('moral', 'Cliente', { esLaRaiz: true })
    const pf = await parte('fisica', 'Dueña directa')
    await participa(pf.parteId, raiz.parteId, 40)

    const { identificacionId } = await identificarDesdeLaEstructura(db, {
      sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
    })

    const { rows } = await db.query(
      `select resolucion_grafo from identificaciones_bc where id = $1`,
      [identificacionId],
    )
    const snap = (rows[0] as { resolucion_grafo: Record<string, unknown> }).resolucion_grafo
    expect(snap['configuracion']).toMatchObject({ reglaAgregacion: 'producto_de_la_cadena' })
    expect(Array.isArray(snap['cadenas'])).toBe(true)
    expect(Array.isArray(snap['participaciones_vigentes'])).toBe(true)

    // Y es INMUTABLE: reescribirlo muere con el trigger de la identificación.
    await expect(
      db.query(`update identificaciones_bc set resolucion_grafo = '{}'::jsonb where id = $1`,
        [identificacionId]),
    ).rejects.toThrow(/inmutable/)
  })

  it('LA VIGENCIA MANDA: la estructura que se resuelve es la de la fecha del acto', async () => {
    const raiz = await parte('moral', 'Cliente', { esLaRaiz: true })
    const pf = await parte('fisica', 'La que vendió')
    const { participacionId } = await participa(pf.parteId, raiz.parteId, 60, '2026-01-01')
    // Vendió en marzo de 2027: la participación se cierra.
    await cerrarParticipacion(db, { sesion, participacionId, hasta: '2027-03-31' })

    // A una fecha ANTERIOR a la venta, era dueña del 60%.
    const antes = await enTransaccionDeSesion(db, sesion, () =>
      resolverEstructura(db, { sesion, clienteId, fecha: '2027-02-01' }),
    )
    expect(antes.resolucion.titulares[0]?.efectiva).toBe(60)

    // A una fecha posterior, ya no aparece.
    const despues = await enTransaccionDeSesion(db, sesion, () =>
      resolverEstructura(db, { sesion, clienteId, fecha: '2027-06-10' }),
    )
    expect(despues.resolucion.titulares).toEqual([])
  })

  it('las advertencias de suma incompleta viajan en el snapshot', async () => {
    const raiz = await parte('moral', 'Cliente', { esLaRaiz: true })
    const pf = await parte('fisica', 'Solo el 40')
    await participa(pf.parteId, raiz.parteId, 40)

    const r = await enTransaccionDeSesion(db, sesion, () =>
      resolverEstructura(db, { sesion, clienteId, fecha: FECHA }),
    )
    expect(r.resolucion.advertencias[0]?.tipo).toBe('suma_incompleta')
    expect(r.resolucion.advertencias[0]?.sumaCapturada).toBe(40)
  })

  it('sin estructura capturada, la identificación lo dice en vez de correr vacía', async () => {
    await expect(
      identificarDesdeLaEstructura(db, {
        sesion, clienteId, fechaIdentificacion: FECHA, hoy: HOY,
      }),
    ).rejects.toThrow(/no tiene estructura capturada/)
  })

  it('la corrección es cerrar e insertar: encimar una participación vigente no entra', async () => {
    const raiz = await parte('moral', 'Cliente', { esLaRaiz: true })
    const pf = await parte('fisica', 'Dueña')
    await participa(pf.parteId, raiz.parteId, 60)
    await expect(participa(pf.parteId, raiz.parteId, 70, '2027-04-01')).rejects.toThrow(
      /cerrar e insertar, nunca encimar/,
    )
  })

  it('una parte de la estructura de OTRO cliente no puede ser punta de una arista', async () => {
    const raiz = await parte('moral', 'Cliente', { esLaRaiz: true })
    const otro = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                     requiere_revision_identidad, domicilio)
       values ($1,'moral','Otro cliente','OTRO270301X9',false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId],
    )
    const parteAjena = await agregarParte(db, {
      sesion, clienteId: (otro.rows[0] as { id: string }).id, tipo: 'fisica', nombre: 'De otra estructura',
    })
    await expect(
      participa(parteAjena.parteId, raiz.parteId, 50),
    ).rejects.toThrow(/estructura de ESTE cliente/)
  })

  it('dos raíces no existen, y el error lo dice en español', async () => {
    await parte('moral', 'Cliente', { esLaRaiz: true })
    await expect(parte('moral', 'Segunda raíz', { esLaRaiz: true })).rejects.toBeInstanceOf(
      DatoDelGrafoInvalido,
    )
  })
})
