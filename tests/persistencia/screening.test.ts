import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  coincidenciasPendientes,
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

  it('las pendientes traen su detalle, y resolver las vacía — es lo que la pantalla abre', async () => {
    const r = await consultarScreening(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
      nombre: 'Jose Angel Lopez Gomez de la Prueba lpb',
    })
    expect(r.resultado).toBe('coincidencia')

    const pendientes = await coincidenciasPendientes(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
    })
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]?.consultaId).toBe(r.consultaId)
    // El detalle completo: es lo que la resolución humana necesita mirar.
    const c = pendientes[0]?.coincidencias[0]
    expect(c?.nombreEnLista).toContain('José Ángel López Gómez de la Prueba')
    expect(c?.similitud).toBeGreaterThan(0)

    await resolverScreening(db, {
      sesion: admin,
      consultaId: r.consultaId,
      resolucion: 'descartada',
      razonamiento:
        'Homónimo: el segundo apellido y la fecha de nacimiento del cliente no corresponden.',
    })
    const despues = await coincidenciasPendientes(db, {
      sesion: admin,
      sujetoTipo: 'cliente',
      sujetoId: clienteId,
    })
    expect(despues).toHaveLength(0)
  })

  /**
   * Quién consulta y quién resuelve NO es lo mismo.
   *
   * La pantalla del expediente le ofrece «Consultar listas» a cualquiera con
   * sesión y esconde el formulario de resolución a quien no es admin. La regla
   * del proyecto es que un control escondido significa que la base lo
   * rechazaría — si no fuera cierto, la pantalla estaría inventando un permiso
   * que nadie aplica.
   */
  it('un capturista consulta, pero NO puede resolver la coincidencia', async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    const capturista = await crearTenantConUsuario(db, marca, 'capturista')
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Cliente del Capturista','MX') returning id::text`,
      [capturista.tenantId, `CAP${marca}`],
    )
    const suCliente = (c.rows[0] as { id: string }).id

    // Consultar sí: es parte de capturar, y toda consulta es evidencia.
    const r = await consultarScreening(db, {
      sesion: capturista,
      sujetoTipo: 'cliente',
      sujetoId: suCliente,
      nombre: 'Jose Angel Lopez Gomez de la Prueba onu',
    })
    expect(r.resultado).toBe('coincidencia')

    // Resolver no: descartar una coincidencia es la decisión que la regla
    // dura 5 reserva a una persona con firma, no a quien teclea la venta.
    await expect(
      resolverScreening(db, {
        sesion: capturista,
        consultaId: r.consultaId,
        resolucion: 'descartada',
        razonamiento: 'Me parece que no es la misma persona, así que sigo con la venta.',
      }),
    ).rejects.toThrow()

    const sigue = await coincidenciasPendientes(db, {
      sesion: capturista,
      sujetoTipo: 'cliente',
      sujetoId: suCliente,
    })
    expect(sigue).toHaveLength(1)
  })

  /**
   * El matching corre con el rol de la APLICACIÓN, no con el administrativo.
   *
   * Este caso existe porque el resto del archivo no lo cubría y el defecto
   * llegó hasta la pantalla. `conectar()` abre como `postgres`, cuyo
   * search_path incluye `extensions` — donde vive pg_trgm—, así que el
   * operador `%` resolvía en toda la suite. `vizo_app`, que es como se conecta
   * el portal, NO lo tiene: la primera consulta real murió con «operator does
   * not exist: text % text» con la suite entera en verde.
   *
   * La lección no es sobre pg_trgm: es que un test que corre con más
   * privilegios —o con más search_path— que la aplicación puede pasar sobre
   * código que la aplicación no puede ejecutar.
   */
  it('corre con el rol de la aplicación, cuyo search_path no incluye extensions', async () => {
    const app = new Client({
      connectionString:
        process.env['VIZO_DB_URL'] ??
        'postgresql://vizo_app:vizo-local-dev@127.0.0.1:54322/postgres',
    })
    await app.connect()
    try {
      const sp = await app.query('show search_path')
      expect((sp.rows[0] as { search_path: string }).search_path).not.toContain('extensions')

      const r = await consultarScreening(app, {
        sesion: admin,
        sujetoTipo: 'cliente',
        sujetoId: clienteId,
        nombre: 'Jose Angel Lopez Gomez de la Prueba ofac_sdn',
      })
      expect(r.resultado).toBe('coincidencia')
      expect(r.coincidencias.some((c) => c.criterio === 'nombre')).toBe(true)
    } finally {
      await app.end()
    }
  })
})
