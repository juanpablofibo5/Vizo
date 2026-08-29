import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  consultarScreening,
  listasVigentes,
  resolverScreening,
  screeningDelSujeto,
} from '../../src/persistencia/screening'
import { ListasIncompletas, normalizarNombre } from '../../src/dominio/screening'

const CLAVES = ['ofac_sdn', 'onu', 'sat_69b', 'lpb'] as const

/**
 * El conector de screening (issue #34, ADR-30): sin las cuatro listas se
 * detiene, toda consulta escribe su evidencia, detecta de más, y la
 * resolución es humana, única y con razonamiento — la regla dura 5 en tipos,
 * triggers y pruebas.
 */
describe('El screening contra listas de control', () => {
  let db: Client
  let admin: ContextoSesion
  let clienteId: string

  beforeAll(async () => {
    db = await conectar()
    // Las listas son catálogo GLOBAL: cada corrida carga una versión nueva de
    // las cuatro (la vigente es la más reciente), como haría el runbook 06.
    for (const clave of CLAVES) {
      const l = await db.query(
        `insert into listas_screening (clave, nombre, fuente_url, descargada_en, hash_sha256, registros)
         values ($1,$1,'https://prueba.local/lista',now(),$2,2) returning id`,
        [clave, 'f'.repeat(64)],
      )
      const listaId = (l.rows[0] as { id: string }).id
      await db.query(
        `insert into entradas_lista (lista_id, tipo, nombre, rfc, datos) values
           ($1,'individual','José Ángel López Gómez de la Prueba ' || $2, null, '{}'::jsonb),
           ($1,'entity','Empresa Fachada Global ' || $2, case when $2 = 'sat_69b' then 'EFA010101AAA' end,
            case when $2 = 'sat_69b' then '{"situacion":"Definitivo"}' else '{}' end::jsonb)`,
        [listaId, clave],
      )
    }
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Cliente de Screening','MX') returning id::text`,
      [admin.tenantId, `SCR${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  it('la normalización de la base y la de TypeScript son LA MISMA', async () => {
    // Si divergen, el matching miente: el nombre consultado se normaliza en
    // TS y las entradas en SQL. Los casos cubren acentos, puntuación y ruido.
    for (const caso of [
      '  José   Ángel López-Gómez, S.A. de C.V. ',
      'MUÑOZ Ñañez #3 (alias "El Güero")',
      'ácido über—çedilla',
    ]) {
      const { rows } = await db.query(`select app.normalizar_para_screening($1) as n`, [caso])
      expect((rows[0] as { n: string }).n).toBe(normalizarNombre(caso))
    }
  })

  it('sin las cuatro listas vigentes, se detiene nombrando las que faltan', async () => {
    // Dentro de una transacción que se revierte, para no tocar el catálogo
    // global que las demás pruebas usan.
    await db.query('begin')
    try {
      await db.query(`delete from entradas_lista`)
      await db.query(`delete from listas_screening where clave in ('onu','lpb')`)
      await expect(listasVigentes(db)).rejects.toThrow(ListasIncompletas)
      await expect(listasVigentes(db)).rejects.toThrow(/onu, lpb/)
    } finally {
      await db.query('rollback')
    }
  })

  it('detecta la variante sin acentos por trigramas, escribe el snapshot y levanta la alerta', async () => {
    const r = await consultarScreening(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
      nombre: 'Jose Angel Lopez Gomez de la Prueba ofac_sdn',
    })
    expect(r.resultado).toBe('coincidencia')
    expect(r.coincidencias.length).toBeGreaterThanOrEqual(1)
    expect(r.coincidencias[0]?.criterio).toBe('nombre')
    expect(r.alertaId).not.toBeNull()

    // El snapshot nombra las CUATRO listas con su huella: eso es lo que hace
    // defendible la consulta dentro de dos años.
    const fila = await db.query(
      `select listas_consultadas, resolucion::text as resolucion from consultas_screening where id = $1`,
      [r.consultaId],
    )
    const f = fila.rows[0] as { listas_consultadas: Record<string, { hash: string }>; resolucion: string }
    expect(Object.keys(f.listas_consultadas).sort()).toEqual([...CLAVES].sort())
    expect(f.resolucion).toBe('pendiente')

    const alerta = await db.query(
      `select estado::text as estado from alertas where consulta_screening_id = $1`,
      [r.consultaId],
    )
    expect((alerta.rows[0] as { estado: string }).estado).toBe('abierta')
  })

  it('el RFC del 69-B coincide exacto aunque el nombre no se parezca', async () => {
    const r = await consultarScreening(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
      nombre: 'Un Nombre Completamente Distinto Sin Parecido',
      rfc: 'efa010101aaa',
    })
    expect(r.resultado).toBe('coincidencia')
    const porRfc = r.coincidencias.find((c) => c.criterio === 'rfc')
    expect(porRfc?.lista).toBe('sat_69b')
    expect(porRfc?.datos['situacion']).toBe('Definitivo')
  })

  it('sin coincidencias TAMBIÉN escribe: el folio limpio es evidencia, no ausencia', async () => {
    const r = await consultarScreening(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
      nombre: 'Zxqwerty Vbnmklj Hgfdsa',
    })
    expect(r.resultado).toBe('sin_coincidencia')
    expect(r.alertaId).toBeNull()
    const historial = await screeningDelSujeto(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
    })
    expect(historial).toHaveLength(1)
    expect(historial[0]?.resultado).toBe('sin_coincidencia')
  })

  it('resolver exige razonamiento, atiende la alerta, y no se repite jamás', async () => {
    const r = await consultarScreening(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
      nombre: 'Jose Angel Lopez Gomez de la Prueba onu',
    })
    expect(r.resultado).toBe('coincidencia')

    await expect(
      resolverScreening(db, {
        sesion: admin,
        consultaId: r.consultaId,
        resolucion: 'descartada',
        razonamiento: 'no es',
      }),
    ).rejects.toThrow(/razonamiento/)

    await resolverScreening(db, {
      sesion: admin,
      consultaId: r.consultaId,
      resolucion: 'descartada',
      razonamiento:
        'Homónimo: la fecha de nacimiento y la nacionalidad del cliente no corresponden con la entrada de la lista.',
    })

    const alerta = await db.query(
      `select estado::text as estado, atendida_por from alertas where consulta_screening_id = $1`,
      [r.consultaId],
    )
    expect((alerta.rows[0] as { estado: string }).estado).toBe('atendida')

    // Una resolución asentada no se revierte ni se corrige (regla dura 5).
    await expect(
      resolverScreening(db, {
        sesion: admin,
        consultaId: r.consultaId,
        resolucion: 'confirmada',
        razonamiento: 'Pensándolo mejor, sí parece ser la persona listada.',
      }),
    ).rejects.toThrow(/ya fue resuelta/)
  })
})
