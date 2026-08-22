import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import {
  DatoDeAprobacionInvalido,
  asentarAprobacion,
  estadoDeAprobacion,
} from '../../src/persistencia/aprobacion'
import { pesos } from '../../src/dominio/dinero'

/**
 * La aprobación del Art. 23 Ter 5, de punta a punta y sobre la base real.
 *
 * Lo que estas pruebas protegen es que la conjunción se resuelva con los HECHOS
 * que ya existen —la declaración PEP y la evaluación de riesgo— y que el hueco
 * no se pueda cerrar asentando una firma: si no se sabe si era exigible, no hay
 * nada que aprobar todavía.
 */
describe('La aprobación de directivo', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let sucursalId: string
  let desarrolloId: string
  let marca: string

  const HOY = '2027-04-10'
  const FECHA_ACTO = '2027-03-20'

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(`update tenants set tipo_persona = 'moral' where id = $1`, [sesion.tenantId])

    const vBis = await db.query(`select id from actividades_vulnerables where fraccion = 'V_BIS'`)
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      (vBis.rows[0] as { id: string }).id,
    ])

    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id::text`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id

    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Cliente de Aprobación','MX') returning id::text`,
      [sesion.tenantId, `APR${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad)
       values ($1,'Torre Aprobación',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75) returning id::text`,
      [sesion.tenantId, `LICA${marca}`],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  const operar = (fecha = FECHA_ACTO, monto = 400_000) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        fechaOperacion: fecha,
        montoBase: pesos(monto),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
      },
    })

  /**
   * La declaración y su vínculo van en UNA transacción a propósito: la
   * coherencia del Cap. III Quáter es `deferrable initially deferred` porque se
   * escriben en dos statements, y en autocommit la declaración se confirmaría
   * sola —sin vínculo— y el trigger la rechazaría con razón.
   */
  const declararPep = async () => {
    await db.query('begin')
    const r = await db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,'pep_por_funcion',date '2027-03-01',$3) returning id::text`,
      [sesion.tenantId, clienteId, sesion.usuarioId],
    )
    const id = (r.rows[0] as { id: string }).id
    await db.query(
      `insert into vinculos_pep (tenant_id,declaracion_id,tipo,cargo,ambito,en_funciones)
       values ($1,$2,'titular','Directora de área','nacional',true)`,
      [sesion.tenantId, id],
    )
    await db.query('commit')
    return id
  }

  const declararQueNoEsPep = () =>
    db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,'niega',date '2027-03-01',$3)`,
      [sesion.tenantId, clienteId, sesion.usuarioId],
    )

  /** El modelo de riesgo del obligado, y una evaluación del cliente. */
  const clasificar = async (clave: 'alto' | 'medio') => {
    const grados: Record<string, string> = {}
    for (const [c, n, o, alto, min] of [
      ['bajo', 'Bajo', 1, false, 0],
      ['medio', 'Medio', 2, false, 35],
      ['alto', 'Alto', 3, true, 70],
    ] as const) {
      const r = await db.query(
        `insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
         values ($1,$2,$3,$4,$5,$6,date '2027-03-01') returning id::text`,
        [sesion.tenantId, c, n, o, alto, min],
      )
      grados[c] = (r.rows[0] as { id: string }).id
    }
    const el = await db.query(`select id from elementos_riesgo where clave = 'tipo_cliente'`)
    const m = await db.query(
      `insert into modelos_riesgo (tenant_id,version) values ($1,1) returning id::text`,
      [sesion.tenantId],
    )
    const modeloId = (m.rows[0] as { id: string }).id
    await db.query(
      `insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
       values ($1,$2,$3,'Persona Políticamente Expuesta',80)`,
      [sesion.tenantId, modeloId, (el.rows[0] as { id: string }).id],
    )
    await db.query(
      `update modelos_riesgo set estado='vigente', vigente_desde=date '2027-03-01',
              aprobado_por=$2, aprobado_en=now() where id=$1`,
      [modeloId, sesion.usuarioId],
    )
    await db.query(
      `insert into evaluaciones_riesgo
         (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,vence)
       values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,date '2027-10-01')`,
      [sesion.tenantId, clienteId, modeloId, grados[clave], clave === 'alto' ? 80 : 40, sesion.usuarioId],
    )
  }

  const estado = () =>
    enTransaccionDeSesion(db, sesion, () =>
      estadoDeAprobacion(db, {
        sesion,
        clienteId,
        hoy: HOY,
      }),
    )

  const alertasDeAprobacion = async () => {
    const { rows } = await db.query(
      `select titulo, detalle, operacion_id::text from alertas
        where tenant_id = $1 and tipo = 'aprobacion_directivo_pendiente'`,
      [sesion.tenantId],
    )
    return rows as { titulo: string; detalle: Record<string, unknown>; operacion_id: string }[]
  }

  it('EL HUECO: es PEP y nadie lo ha clasificado — no dice «no se requiere»', async () => {
    await declararPep()
    const e = await estado()
    expect(e.exigencia).toEqual({ estado: 'indeterminable', falta: ['grado_de_riesgo'] })
  })

  it('y el hueco NO se cierra asentando una firma', async () => {
    await declararPep()
    await expect(
      asentarAprobacion(db, {
        sesion,
        clienteId,
        hoy: HOY,
        datos: {
          momento: 'previa',
          aprobadorNombre: 'Ana Directora',
          aprobadorCargo: 'Directora General',
          alcancePrevio: 'Todo',
          vigenteHasta: '2027-12-31',
        },
      }),
    ).rejects.toThrow(DatoDeAprobacionInvalido)
  })

  it('un falso definitivo cierra la conjunción: consta que no es de grado alto', async () => {
    await declararPep()
    await clasificar('medio')
    const e = await estado()
    expect(e.exigencia).toEqual({ estado: 'no_exigible', porque: 'no_es_grado_alto' })
  })

  it('declaró que no es PEP: no exigible aunque sea de grado alto', async () => {
    await declararQueNoEsPep()
    await clasificar('alto')
    const e = await estado()
    expect(e.exigencia).toEqual({ estado: 'no_exigible', porque: 'no_es_pep' })
  })

  it('PEP y grado alto: la operación se registra Y levanta su alerta', async () => {
    await declararPep()
    await clasificar('alto')

    const r = await operar()
    // No es una compuerta: el ¶1 contempla detectarlo con posterioridad, y una
    // operación que ya ocurrió no se puede esconder.
    expect(r.operacionId).toBeTruthy()
    expect(r.aprobacion.estado).toBe('exigible')

    const alertas = await alertasDeAprobacion()
    expect(alertas).toHaveLength(1)
    expect(alertas[0]!.operacion_id).toBe(r.operacionId)
    expect(alertas[0]!.detalle['via']).toBe('directivo')
  })

  it('antes del 1 de marzo de 2027 no alerta: el Transitorio Cuarto no alcanza ese acto', async () => {
    await declararPep()
    await clasificar('alto')
    await operar('2027-02-28')
    expect(await alertasDeAprobacion()).toHaveLength(0)
  })

  it('la aprobación posterior nombra su acto, y el faltante se cierra', async () => {
    await declararPep()
    await clasificar('alto')
    const r = await operar()

    let e = await estado()
    expect(e.actosSinConsentir.map((a) => a.id)).toEqual([r.operacionId])

    await asentarAprobacion(db, {
      sesion,
      clienteId,
      hoy: HOY,
      datos: {
        momento: 'posterior',
        aprobadorNombre: 'Ana Directora',
        aprobadorCargo: 'Directora General',
        motivos: 'Se comprobó el origen de los recursos.',
        operaciones: [r.operacionId],
      },
    })

    e = await estado()
    expect(e.actosSinConsentir).toEqual([])
    expect(e.aprobaciones).toHaveLength(1)
    expect(e.aprobaciones[0]!.operacionesConsentidas).toEqual([r.operacionId])
  })

  it('una aprobación posterior sin nombrar actos no consiente nada', async () => {
    await declararPep()
    await clasificar('alto')
    await operar()
    await expect(
      asentarAprobacion(db, {
        sesion,
        clienteId,
        hoy: HOY,
        datos: {
          momento: 'posterior',
          aprobadorNombre: 'Ana Directora',
          aprobadorCargo: 'Directora General',
          operaciones: [],
        },
      }),
    ).rejects.toThrow(DatoDeAprobacionInvalido)
  })

  it('la previa cubre los actos de su ventana, y la operación siguiente ya no alerta', async () => {
    await declararPep()
    await clasificar('alto')

    await asentarAprobacion(db, {
      sesion,
      clienteId,
      hoy: '2027-03-15',
      datos: {
        momento: 'previa',
        aprobadorNombre: 'Ana Directora',
        aprobadorCargo: 'Directora General',
        alcancePrevio: 'Las aportaciones a la unidad 3-A',
        vigenteHasta: '2027-12-31',
      },
    })

    await operar('2027-03-20')
    expect(await alertasDeAprobacion()).toHaveLength(0)

    // Y no cubre hacia atrás: un acto anterior a la firma no fue consentido
    // «previamente» por ella.
    const vieja = await operar('2027-03-02')
    const alertas = await alertasDeAprobacion()
    expect(alertas).toHaveLength(1)
    expect(alertas[0]!.operacion_id).toBe(vieja.operacionId)
  })

  it('el obligado persona física no firma: emite la constancia con sus motivos', async () => {
    await db.query(`update tenants set tipo_persona = 'fisica' where id = $1`, [sesion.tenantId])
    await declararPep()
    await clasificar('alto')
    const r = await operar()

    // Sin motivos, la constancia del ¶2 está vacía.
    await expect(
      asentarAprobacion(db, {
        sesion,
        clienteId,
        hoy: HOY,
        datos: { momento: 'posterior', operaciones: [r.operacionId] },
      }),
    ).rejects.toThrow(DatoDeAprobacionInvalido)

    await asentarAprobacion(db, {
      sesion,
      clienteId,
      hoy: HOY,
      datos: {
        momento: 'posterior',
        motivos: 'Conozco al cliente desde hace ocho años y verifiqué el origen de los recursos.',
        operaciones: [r.operacionId],
      },
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDeAprobacion(db, { sesion, clienteId, hoy: HOY }),
    )
    expect(e.via).toBe('constancia_persona_fisica')
    expect(e.aprobaciones[0]!.aprobadorNombre).toBeNull()
    expect(e.actosSinConsentir).toEqual([])
  })

  it('deja su evento en la bitácora, sin datos personales del directivo', async () => {
    await declararPep()
    await clasificar('alto')
    const r = await operar()
    await asentarAprobacion(db, {
      sesion,
      clienteId,
      hoy: HOY,
      datos: {
        momento: 'posterior',
        aprobadorNombre: 'Ana Directora Pérez',
        aprobadorCargo: 'Directora General',
        operaciones: [r.operacionId],
      },
    })

    const { rows } = await db.query(
      `select evento, datos from bitacora where tenant_id = $1 and evento = 'aprobacion.asentada'`,
      [sesion.tenantId],
    )
    expect(rows).toHaveLength(1)
    const datos = (rows[0] as { datos: Record<string, unknown> }).datos
    expect(datos['via']).toBe('directivo')
    expect(datos['operaciones_consentidas']).toBe(1)
    // REGLA DURA 3: el nombre del directivo vive en la tabla, bajo RLS.
    expect(JSON.stringify(datos)).not.toContain('Ana Directora')
  })
})
