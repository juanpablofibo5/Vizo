import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  OperacionInvalida,
  registrarOperacion,
  type DeclaracionDelCliente,
} from '../../src/persistencia/operaciones'
import {
  DatoDePerfilInvalido,
  estadoDelPerfil,
  perfilVigenteDe,
  registrarPerfil,
} from '../../src/persistencia/perfil'
import { pesos } from '../../src/dominio/dinero'

/**
 * El Perfil transaccional de punta a punta: se asienta lo que el cliente
 * declaró, se registra una operación, y el sistema de alertas del Art. 23 Ter 2
 * dice si se apartó.
 *
 * Lo que estas pruebas protegen: que la desviación se detecte EN EL MISMO ACTO
 * en que se registra la operación —«detección oportuna», no un lote nocturno—
 * y que el reloj del ¶2 no se pueda correr desde la aplicación.
 */
describe('El Perfil transaccional', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let sucursalId: string
  let desarrolloId: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')

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
       values ($1,'fisica',$2,'Cliente de Perfil','MX') returning id::text`,
      [sesion.tenantId, `PTR${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad)
       values ($1,'Torre Perfil',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75) returning id::text`,
      [sesion.tenantId, `LIC${marca}`],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  const operar = (
    fecha: string,
    monto: number,
    perfilDeclarado?: DeclaracionDelCliente,
  ) =>
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
        perfilDeclarado,
      },
    })

  /** Lo típico: el cliente estima hasta medio millón al mes. */
  const DECLARA_500K: DeclaracionDelCliente = {
    origen: 'inicial',
    fuente: 'declarada_por_cliente',
    montoMaximoMensual: pesos(500_000),
  }

  const alertasDePerfil = async () => {
    const { rows } = await db.query(
      `select titulo, detalle, perfil_id::text, operacion_id::text, tipo::text as tipo
         from alertas where tenant_id = $1 and tipo in ('desviacion_perfil','perfil_ausente')
        order by created_at`,
      [sesion.tenantId],
    )
    return rows as {
      titulo: string
      detalle: Record<string, unknown>
      perfil_id: string | null
      operacion_id: string
      tipo: string
    }[]
  }

  it('el acto ancla el reloj, y el vencimiento sale del catálogo — no de quien captura', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)

    const p = await enTransaccionDeSesion(db, sesion, () =>
      perfilVigenteDe(db, { sesion, clienteId }),
    )
    expect(p?.fechaAncla).toBe('2027-03-05')
    expect(p?.vence).toBe('2027-09-05')
  })

  it('la desviación se levanta en el mismo acto de registrar la operación', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)

    const segunda = await operar('2027-03-20', 250_000)
    expect(segunda.perfil.estado).toBe('desviado')

    const alertas = await alertasDePerfil()
    expect(alertas).toHaveLength(1)
    expect(alertas[0]!.operacion_id).toBe(segunda.operacionId)
    expect(alertas[0]!.tipo).toBe('desviacion_perfil')
    expect(alertas[0]!.detalle['por']).toBe('monto_mensual')
    expect(String(alertas[0]!.detalle['motivo'])).toContain('$150,000.00 por encima')
    // Y la alerta viene en el mismo resultado que las de umbral: quien registra
    // la operación ve las dos cosas sin tener que ir a buscarlas.
    expect(segunda.alertas).toContain(
      (await db.query(`select id::text from alertas where operacion_id = $1`, [segunda.operacionId]))
        .rows.map((r) => (r as { id: string }).id)[0],
    )
  })

  it('el mes de calendario corta: lo de marzo no arrastra a abril', async () => {
    await operar('2027-03-05', 480_000, DECLARA_500K)

    const abril = await operar('2027-04-02', 480_000)
    expect(abril.perfil.estado).toBe('dentro_del_perfil')
    expect(await alertasDePerfil()).toHaveLength(0)
  })

  it('EL HUECO: un acto ya exigible sin perfil asentado levanta su alerta', async () => {
    const r = await operar('2027-03-10', 900_000)
    expect(r.perfil.estado).toBe('sin_perfil')

    const alertas = await alertasDePerfil()
    expect(alertas).toHaveLength(1)
    expect(alertas[0]!.perfil_id).toBeNull()
    // El hueco tiene su propio tipo: no es una desviación, es que falta la
    // declaración. Se atiende recabándola, no mirando la operación.
    expect(alertas[0]!.tipo).toBe('perfil_ausente')
    expect(alertas[0]!.detalle['por']).toBe('sin_perfil')
  })

  it('antes del 1 de marzo de 2027 no inventa alertas: el capítulo no ha entrado', async () => {
    // Transitorio Cuarto. Llenar el panel por una obligación que todavía no
    // rige enseña a la gente a ignorarlo.
    const r = await operar('2026-11-10', 900_000)
    expect(r.perfil.estado).toBe('sin_perfil')
    expect(await alertasDePerfil()).toHaveLength(0)
  })

  it('no se puede reevaluar antes de la maduración: ahí está el hueco del ¶2', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)

    // Subir el tope dos meses después para callar la alerta que viene.
    await expect(
      registrarPerfil(db, {
        sesion,
        clienteId,
        hoy: '2027-05-05',
        datos: {
          origen: 'reevaluacion',
          fuente: 'archivos_del_obligado',
          montoMaximoMensual: pesos(9_000_000),
          motivo: 'El cliente quiere comprar más',
        },
      }),
    ).rejects.toThrow()
  })

  it('pasada la maduración sí, y el histórico conserva las dos filas', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)
    await registrarPerfil(db, {
      sesion,
      clienteId,
      hoy: '2027-09-10',
      datos: {
        origen: 'reevaluacion',
        fuente: 'archivos_del_obligado',
        montoMaximoMensual: pesos(900_000),
        motivo: 'Repaso semestral: el cliente sostuvo el ritmo declarado',
      },
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelPerfil(db, { sesion, clienteId, hoy: '2027-09-10' }),
    )
    expect(e.historial).toHaveLength(2)
    expect(e.vigente?.montoMaximoMensual).toBe(pesos(900_000))
    // La cadencia cuenta desde el ejercicio, no desde el ancla.
    expect(e.vigente?.vence).toBe('2028-03-10')
    expect(e.reevaluacionDebida).toBe(false)
    expect(e.reevaluableDesde).toBe('2027-09-05')
  })

  it('un perfil inicial sin el acto que lo ancla no se guarda', async () => {
    await expect(
      registrarPerfil(db, {
        sesion,
        clienteId,
        hoy: '2027-03-05',
        datos: {
          origen: 'inicial',
          fuente: 'declarada_por_cliente',
          montoMaximoMensual: pesos(500_000),
        },
      }),
    ).rejects.toThrow(DatoDePerfilInvalido)
  })

  it('una reevaluación sin decir por qué no se guarda', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)
    await expect(
      registrarPerfil(db, {
        sesion,
        clienteId,
        hoy: '2027-09-10',
        datos: {
          origen: 'reevaluacion',
          fuente: 'archivos_del_obligado',
          montoMaximoMensual: pesos(900_000),
        },
      }),
    ).rejects.toThrow(DatoDePerfilInvalido)
  })

  it('la corrección hereda el vencimiento: compra exactitud, nunca tiempo', async () => {
    const primera = await operar('2027-03-05', 400_000, DECLARA_500K)
    await registrarPerfil(db, {
      sesion,
      clienteId,
      hoy: '2027-03-08',
      datos: {
        origen: 'correccion',
        fuente: 'declarada_por_cliente',
        montoMaximoMensual: pesos(550_000),
        operacionId: primera.operacionId,
        motivo: 'Se capturó 500 mil y el cliente declaró 550 mil',
      },
    })

    const p = await enTransaccionDeSesion(db, sesion, () =>
      perfilVigenteDe(db, { sesion, clienteId }),
    )
    expect(p?.montoMaximoMensual).toBe(pesos(550_000))
    expect(p?.vence).toBe('2027-09-05')
  })

  it('un cliente que ya declaró no vuelve a declarar con cada acto', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)
    await expect(operar('2027-03-20', 100_000, DECLARA_500K)).rejects.toThrow(OperacionInvalida)
  })

  it('cada fila del perfil deja su evento en la bitácora, sin datos personales', async () => {
    await operar('2027-03-05', 400_000, DECLARA_500K)

    const { rows } = await db.query(
      `select evento, datos from bitacora
        where tenant_id = $1 and evento like 'perfil.%'`,
      [sesion.tenantId],
    )
    expect(rows).toHaveLength(1)
    const fila = rows[0] as { evento: string; datos: Record<string, unknown> }
    expect(fila.evento).toBe('perfil.inicial')
    expect(fila.datos['monto_maximo_mensual']).toBe('500000.00')
    // REGLA DURA 3: id opaco, nunca el nombre ni el RFC.
    expect(JSON.stringify(fila.datos)).not.toContain('Cliente de Perfil')
  })
})
