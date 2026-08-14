import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { AvisoIncompleto, generarAviso } from '../../src/persistencia/aviso'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const PERIODO = '2026-05-01'

/**
 * La operación que el motor SÍ reporta y el aviso NO incluye.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE ESTA PRUEBA
 * ────────────────────────────────────────────────────────────────────────────
 * El formulario de captura del portal no pide el desarrollo inmobiliario —ni el
 * instrumento monetario, ni la moneda—, y `operaciones.desarrollo_id` es
 * nullable. `generarAviso` une contra `desarrollos_inmobiliarios` con un INNER
 * JOIN.
 *
 * Consecuencia: una operación capturada por la pantalla que el producto ofrece
 * queda fuera del aviso **sin que nada falle**. El motor la marcó reportable,
 * la alerta existe, la pantalla la muestra… y el aviso del periodo sale como si
 * no hubiera nada que reportar.
 *
 * Es el modo de falla de la regla dura 6 en su forma más cara: no revienta,
 * devuelve un número plausible, y lo que produce es un AVISO OMITIDO — que es
 * justamente la infracción que este sistema existe para evitar.
 */
describe('Una operación reportable sin desarrollo', () => {
  let db: Client
  let admin: ContextoSesion
  let almacen: AlmacenDocumentos
  let actividadId: string
  let clienteId: string
  let sucursalId: string
  let desarrolloId: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    almacen = almacenComo(admin, BUCKET_AVISOS)

    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      admin.tenantId,
      actividadId,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id::text`,
      [admin.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora SA','MX') returning id::text`,
      [admin.tenantId, `SND${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id

    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Prueba','LIC20260099','31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id::text`,
      [admin.tenantId],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  /** El monto cruza el umbral de la Fr. V Bis por sí solo ($941,412.75). */
  const DATOS = {
    fechaOperacion: '2026-05-15',
    montoBase: pesos(1_200_000),
    iva: pesos(0),
    isai: pesos(0),
    otrosAccesorios: pesos(0),
    formaPago: '03',
  }

  it('CAPA 2 · la base no deja guardarla sin desarrollo', async () => {
    // Exactamente lo que mandaba el formulario del portal: sin desarrollo.
    await expect(
      registrarOperacion(db, {
        sesion: admin,
        datos: { sucursalId, clienteId, ...DATOS },
      }),
    ).rejects.toThrow(/desarrollo inmobiliario/i)
  })

  it('CAPA 3 · el generador se detiene ante una que ya estaba guardada', async () => {
    // La red para lo que entró ANTES del trigger. Se inserta con el trigger
    // apagado a propósito: simula una fila histórica, que es justo el caso que
    // esta capa existe para cubrir. Si en su lugar se probara con el trigger
    // puesto, la prueba estaría comprobando el trigger otra vez y no la red.
    await db.query('alter table operaciones disable trigger operaciones_exigen_desarrollo')
    try {
      await registrarOperacion(db, {
        sesion: admin,
        datos: { sucursalId, clienteId, ...DATOS },
      })
    } finally {
      await db.query('alter table operaciones enable trigger operaciones_exigen_desarrollo')
    }

    // El motor SÍ la marcó: no hay duda de que genera obligación.
    const { rows } = await db.query(
      `select e.resultado_aviso::text
         from evaluaciones_umbral e join operaciones o on o.id = e.operacion_id
        where o.tenant_id = $1 order by e.evaluado_en desc limit 1`,
      [admin.tenantId],
    )
    expect((rows[0] as { resultado_aviso: string }).resultado_aviso).not.toBe('no')

    // Antes de este arreglo, aquí salía un informe EN CERO.
    await expect(
      generarAviso(
        db,
        { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_operacion' },
        almacen,
      ),
    ).rejects.toThrow(AvisoIncompleto)
  })

  it('con desarrollo, el aviso sale y la describe', async () => {
    // El control positivo. Sin él, las dos pruebas de arriba pasarían igual si
    // `generarAviso` estuviera roto y no generara nunca nada.
    await registrarOperacion(db, {
      sesion: admin,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        instrumentoMonetario: '1',
        monedaCodigo: '1',
        ...DATOS,
      },
    })

    const r = await generarAviso(
      db,
      { sesion: admin, actividadId, periodo: PERIODO, granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    expect(r.xml).toContain('<registro_licencia>LIC20260099</registro_licencia>')
    // `<informe>` es la envoltura y va siempre; lo que distingue a un informe
    // EN CERO es que no lleva ningún `<aviso>` dentro. Es esa ausencia la que
    // había que probar, no la de la envoltura.
    expect(r.xml).toContain('<aviso>')
  })
})
