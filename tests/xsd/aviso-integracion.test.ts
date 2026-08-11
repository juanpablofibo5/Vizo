import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import {
  AvisoNoValida,
  CatalogoDelAvisoIncompleto,
  generarAviso,
} from '../../src/persistencia/aviso'
import { validarContraXsd } from '../../src/aviso/validacion'
import { pesos } from '../../src/dominio/dinero'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const PERIODO = '2026-05-01'
/** Cruza el umbral de 8,025 UMA ($941,412.75) por sí sola. */
const SOBRE_UMBRAL = 1_200_000
const BAJO_UMBRAL = 50_000

/**
 * De operaciones capturadas a un XML validado, contra la base real.
 *
 * La prueba que importa: lo que sale de aquí es lo que se le entrega a la
 * autoridad. Si no valida, el portal lo rechaza y la obligación queda
 * incumplida con su plazo corriendo.
 */
describe('Generación del aviso contra la base', () => {
  let db: Client
  let sesion: ContextoSesion
  let actividadId: string
  let sucursalId: string
  let clienteId: string
  let rutaXsd: string
  let almacen: AlmacenDocumentos

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id
    rutaXsd = 'regulatorio/xsd/din.xsd'
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    // ADMIN: generar el aviso es acto de administrador. Que un capturista no
    // pueda está probado abajo, y lo impide RLS — no un `if` de la aplicación.
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`,
      [sesion.tenantId, actividadId],
    )
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora del Aviso SA','MX') returning id`,
      [sesion.tenantId, `AVI${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    almacen = almacenComo(sesion, BUCKET_AVISOS)
  })

  const crearDesarrollo = async (): Promise<string> => {
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Vizo','LIC20260001','31','97000','CENTRO','CALLE 60 NUM 123',
               '5',50000000.00,120.00,941412.75,false,false)
       returning id`,
      [sesion.tenantId],
    )
    return (d.rows[0] as { id: string }).id
  }

  const capturar = async (monto: number, desarrolloId: string, completa = true) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        fechaOperacion: '2026-05-15',
        montoBase: pesos(monto),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        ...(completa
          ? {
              instrumentoMonetario: '1',
              monedaCodigo: '1',
              aportacionFideicomiso: false,
              nombreInstitucion: 'BANCO EJEMPLO',
            }
          : {}),
      },
    })

  it('una operación reportable produce un XML que VALIDA', async () => {
    const desarrolloId = await crearDesarrollo()
    await capturar(SOBRE_UMBRAL, desarrolloId)

    const r = await generarAviso(db, {
      sesion,
      actividadId,
      periodo: PERIODO,
      granularidad: 'un_aviso_por_operacion',
    }, almacen)

    expect(r.tipo).toBe('normal')
    expect(r.operacionesIncluidas).toBe(1)
    expect(validarContraXsd(r.xml, rutaXsd).errores).toEqual([])
    expect(r.xml).toContain('<mes_reportado>202605</mes_reportado>')
    expect(r.hashXml).toMatch(/^[0-9a-f]{64}$/)
  })

  it('quién decide qué se reporta es el MOTOR, no esta consulta', async () => {
    // Una operación bajo umbral no entra. El umbral ya se calculó y quedó en
    // evaluaciones_umbral; volver a decidirlo aquí abriría la puerta a que las
    // dos respuestas difieran, y el aviso se defiende con la evaluación.
    const desarrolloId = await crearDesarrollo()
    await capturar(BAJO_UMBRAL, desarrolloId)

    const r = await generarAviso(db, {
      sesion,
      actividadId,
      periodo: PERIODO,
      granularidad: 'un_aviso_por_operacion',
    }, almacen)
    expect(r.operacionesIncluidas).toBe(0)
    expect(r.tipo).toBe('cero')
  })

  it('un periodo sin operaciones reportables es un INFORME EN CERO válido', async () => {
    const r = await generarAviso(db, {
      sesion,
      actividadId,
      periodo: PERIODO,
      granularidad: 'un_aviso_por_operacion',
    }, almacen)

    expect(r.tipo).toBe('cero')
    expect(r.avisosEnElInforme).toBe(0)
    expect(validarContraXsd(r.xml, rutaXsd).valida).toBe(true)
    // Es una obligación por sí misma, no la ausencia de una: se registra.
    const { rows } = await db.query(`select tipo::text from avisos where id = $1`, [r.avisoId])
    expect((rows[0] as { tipo: string }).tipo).toBe('cero')
  })

  it('la granularidad cambia la forma del informe, no su validez', async () => {
    // Las dos lecturas del Art. 24 Bis 1 validan: el XSD no desempata. Ver #10.
    const desarrolloId = await crearDesarrollo()
    await capturar(SOBRE_UMBRAL, desarrolloId)
    await capturar(SOBRE_UMBRAL, desarrolloId)

    const separados = await generarAviso(db, {
      sesion,
      actividadId,
      periodo: PERIODO,
      granularidad: 'un_aviso_por_operacion',
    }, almacen)
    expect(separados.operacionesIncluidas).toBe(2)
    expect(separados.avisosEnElInforme).toBe(2)
    expect(validarContraXsd(separados.xml, rutaXsd).valida).toBe(true)

    // El periodo ya tiene su aviso normal: regenerar choca con la unicidad de
    // la base, que es justo lo que debe pasar. Corregir un aviso presentado es
    // un modificatorio, y llega en la semana 10.
    await expect(
      generarAviso(db, {
        sesion,
        actividadId,
        periodo: PERIODO,
        granularidad: 'un_aviso_por_periodo',
      }, almacen),
    ).rejects.toThrow(/avisos_unico_por_periodo/)
  })

  it('deja rastro de con QUÉ evaluación entró cada operación', async () => {
    const desarrolloId = await crearDesarrollo()
    const op = await capturar(SOBRE_UMBRAL, desarrolloId)
    const r = await generarAviso(db, {
      sesion,
      actividadId,
      periodo: PERIODO,
      granularidad: 'un_aviso_por_operacion',
    }, almacen)

    const { rows } = await db.query(
      `select operacion_id::text, evaluacion_id::text from aviso_operaciones where aviso_id = $1`,
      [r.avisoId],
    )
    expect(rows).toHaveLength(1)
    // Sin la evaluación, el aviso afirma un resultado sin dejar ver de qué
    // cálculo salió.
    expect(rows[0]).toEqual({
      operacion_id: op.operacionId,
      evaluacion_id: op.evaluacionId,
    })
  })

  it('NO genera un aviso de una actividad que el obligado no tiene contratada', async () => {
    // AUDITORÍA DE F1. `actividadId` llega desde un campo OCULTO del formulario,
    // así que es entrada del atacante: basta abrir las herramientas del
    // navegador y cambiarlo.
    //
    // Un aviso bajo una fracción que el obligado no ejerce le declara a la
    // autoridad una actividad que no realiza. `registrarOperacion` sí lo
    // comprobaba —cruza actividades_tenant— y el generador del aviso no: el
    // mismo obligado quedaba protegido por un camino y expuesto por el otro.
    // El obligado de este caso NO contrata nada: si se usara la Fr. XV el
    // fallo vendría de que no tiene formato cargado, y el hueco quedaría
    // tapado por accidente. Con V Bis —que sí tiene formato— el generador
    // llega hasta el final.
    const sinActividades = await crearTenantConUsuario(
      db,
      String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100),
      'admin',
    )

    await expect(
      generarAviso(
        db,
        {
          sesion: sinActividades,
          actividadId,
          periodo: PERIODO,
          granularidad: 'un_aviso_por_operacion',
        },
        almacenComo(sinActividades, BUCKET_AVISOS),
      ),
    ).rejects.toThrow(/no tiene contratada|no está contratada/)
  })

  it('un capturista NO puede generar el aviso: lo impide RLS', async () => {
    // La separación de roles no vive en un `if` de la aplicación. Aunque
    // alguien llame a la función directamente, la política de la base rechaza
    // la escritura.
    const desarrolloId = await crearDesarrollo()
    await capturar(SOBRE_UMBRAL, desarrolloId)

    const capturista: ContextoSesion = { ...sesion, rol: 'capturista' }
    await expect(
      generarAviso(db, {
        sesion: capturista,
        actividadId,
        periodo: PERIODO,
        granularidad: 'un_aviso_por_operacion',
      }, almacen),
    ).rejects.toThrow(/row-level security/)
  })

  it('un dato que el XSD exige y la captura no trae DETIENE el aviso', async () => {
    // No se rellena con un valor razonable: el hueco se ve al generar y no
    // cuando la autoridad lo encuentra.
    const desarrolloId = await crearDesarrollo()
    await capturar(SOBRE_UMBRAL, desarrolloId, false)

    await expect(
      generarAviso(db, {
        sesion,
        actividadId,
        periodo: PERIODO,
        granularidad: 'un_aviso_por_operacion',
      }, almacen),
    ).rejects.toThrow(CatalogoDelAvisoIncompleto)
  })

  it('si el XML no validara, NO se guardaría el aviso', async () => {
    // La validación es bloqueante y va dentro de la transacción. Se fuerza el
    // fallo ensuciando el desarrollo con una entidad federativa fuera del
    // patrón del XSD.
    const desarrolloId = await crearDesarrollo()
    await capturar(SOBRE_UMBRAL, desarrolloId)
    await db.query(
      `update desarrollos_inmobiliarios set entidad_federativa = 'XXXX' where id = $1`,
      [desarrolloId],
    )

    await expect(
      generarAviso(db, {
        sesion,
        actividadId,
        periodo: PERIODO,
        granularidad: 'un_aviso_por_operacion',
      }, almacen),
    ).rejects.toThrow(AvisoNoValida)

    // Un aviso en estado `validado` que en realidad no valida es peor que no
    // tenerlo: alguien lo daría por hecho hasta el día de presentarlo.
    const { rows } = await db.query(
      `select count(*)::int as n from avisos where tenant_id = $1`,
      [sesion.tenantId],
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })
})
