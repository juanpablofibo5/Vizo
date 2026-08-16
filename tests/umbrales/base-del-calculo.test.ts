import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_AVISOS } from '../../src/supabase/almacen'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { generarAviso } from '../../src/persistencia/aviso'
import { cargarConfigActividad, umbralDe } from '../../src/catalogo/cargador'
import { pesos } from '../../src/dominio/dinero'
import type { AlmacenDocumentos } from '../../src/persistencia/documentos'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const PERIODO = '2026-05-01'
const FECHA = '2026-05-15'

/**
 * Las TRES reglas del Art. 6 del Reglamento, en un solo caso.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA FUENTE — `regulatorio/leyes/Reg_LFPIORPI.pdf`, SHA-256 8072a83e…
 * ────────────────────────────────────────────────────────────────────────────
 * Artículo 6, párrafo 1 (reformado DOF 27-03-2026):
 *
 *   «Para determinar el monto o valor de los actos u operaciones a que se
 *    refiere el ARTÍCULO 17 de la Ley […] NO DEBERÁN CONSIDERAR LAS
 *    CONTRIBUCIONES Y DEMÁS ACCESORIOS […]. Sin perjuicio de lo anterior, al
 *    momento de presentar el Aviso correspondiente, deberán REPORTAR LOS MONTOS
 *    TOTALES de los pagos recibidos, INCLUIDOS los relacionados con las
 *    contribuciones, SIN NECESIDAD DE DESGLOSARLOS.»
 *
 * Artículo 6, párrafo 3 (adicionado DOF 27-03-2026):
 *
 *   «Para determinar el monto de los actos u operaciones a que se refiere el
 *    ARTÍCULO 32 de la Ley, DEBERÁN CONSIDERARSE las contribuciones y demás
 *    accesorios…»
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE ARCHIVO
 * ────────────────────────────────────────────────────────────────────────────
 * Las tres reglas hablan del MISMO dinero y piden números distintos. Mezclar
 * dos de ellas no revienta: produce un aviso de más, uno de menos, o un XML con
 * la cifra equivocada — los tres plausibles.
 *
 * Y era la pregunta abierta más cara del proyecto: dos fuentes propias citaban
 * la misma reforma para conclusiones contrarias (`docs/DECISIONES.md`). El
 * texto la resolvió el 16 de agosto de 2026. Estos casos la fijan para que
 * nadie la reabra por descuido.
 *
 * El caso está construido a propósito para que las tres reglas den respuestas
 * DISTINTAS: una operación cuya base queda por debajo del umbral y cuyo total
 * lo rebasa. Si alguien mezclara las reglas, aquí se ve.
 */
describe('Las tres reglas del Art. 6 del Reglamento', () => {
  let db: Client
  let admin: ContextoSesion
  let almacen: AlmacenDocumentos
  let actividadId: string
  let sucursalId: string
  let clienteId: string
  let desarrolloId: string
  /** El umbral de aviso vigente, en pesos. Sale del catálogo, no de aquí. */
  let umbralPesos: number

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id

    const config = await cargarConfigActividad(db, 'V_BIS', FECHA)
    const u = umbralDe(config, 'aviso')
    if (u?.enCentavos === undefined || u.enCentavos === null) {
      throw new Error('El umbral de aviso de V Bis no tiene monto en el catálogo.')
    }
    umbralPesos = u.enCentavos / 100
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
      [admin.tenantId, `BAS${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    const d = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre Base',$2,'31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id::text`,
      [admin.tenantId, `LICB${marca}`],
    )
    desarrolloId = (d.rows[0] as { id: string }).id
  })

  /** Una aportación con base, IVA e ISAI separados, como los pide el modelo. */
  const aportar = async (p: {
    base: number
    iva: number
    isai: number
  }): Promise<{ resultadoAviso: string }> => {
    const r = await registrarOperacion(db, {
      sesion: admin,
      datos: {
        sucursalId,
        clienteId,
        desarrolloId,
        fechaOperacion: FECHA,
        montoBase: pesos(p.base),
        iva: pesos(p.iva),
        isai: pesos(p.isai),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        instrumentoMonetario: '1',
        monedaCodigo: '1',
      },
    })
    return { resultadoAviso: r.evaluacion.resultadoAviso }
  }

  it('REGLA 1 · el umbral del Art. 17 NO considera contribuciones ni accesorios', async () => {
    // Un centavo por debajo del umbral EN LA BASE, y muy por encima con IVA e
    // ISAI encima. Si el motor comparara el total, este caso pediría aviso — y
    // sería un aviso de más sobre una operación que la Ley no obliga a reportar.
    const r = await aportar({
      base: umbralPesos - 0.01,
      iva: umbralPesos * 0.16,
      isai: 50_000,
    })

    expect(r.resultadoAviso).toBe('no')
  })

  it('y en el valor exacto de la BASE sí, aunque el total ya lo rebasara antes', async () => {
    // El control: la frontera existe, y está en la base. Sin este caso, el
    // anterior pasaría también con un motor que nunca pide aviso.
    const r = await aportar({ base: umbralPesos, iva: umbralPesos * 0.16, isai: 50_000 })

    expect(r.resultadoAviso).toBe('individual')
  })

  it('REGLA 2 · el Aviso reporta el monto TOTAL, con contribuciones y sin desglosar', async () => {
    // La misma operación que acaba de cruzar el umbral por su base tiene que
    // viajar al XML por su TOTAL. Son dos números distintos del mismo pago, y
    // el Art. 6 pide uno para cada cosa.
    const base = umbralPesos
    const iva = 160_000
    const isai = 40_000
    const total = base + iva + isai

    await aportar({ base, iva, isai })

    const r = await generarAviso(
      db,
      {
        sesion: admin,
        actividadId,
        periodo: PERIODO,
        granularidad: 'un_aviso_por_periodo',
      },
      almacen,
    )

    // Contra el CAMPO, no contra el XML entero: una cifra suelta puede venir de
    // cualquier otro elemento —el costo por unidad del desarrollo, por ejemplo—
    // y entonces la aserción pasaría por la razón equivocada.
    expect(r.xml).toContain(`<monto_aportacion>${total.toFixed(2)}</monto_aportacion>`)
    // Y NO la base: reportar la base sería desglosar por omisión, que es justo
    // lo que el párrafo descarta con «sin necesidad de desglosarlos».
    expect(r.xml).not.toContain(`<monto_aportacion>${base.toFixed(2)}</monto_aportacion>`)
  })

  it('REGLA 3 · la restricción de efectivo del Art. 32 SÍ los considera', async () => {
    // Tercera regla, tercer número. Se comprueba sobre el catálogo porque el
    // umbral de efectivo de la Fr. V Bis no tiene monto sembrado todavía: lo
    // que aquí se fija es que su BASE es la contraria a la del Art. 17.
    const config = await cargarConfigActividad(db, 'V_BIS', FECHA)

    expect(umbralDe(config, 'aviso')?.base).toBe('sin_contribuciones')
    expect(umbralDe(config, 'identificacion')?.base).toBe('sin_contribuciones')
    expect(umbralDe(config, 'efectivo')?.base).toBe('con_contribuciones')
  })

  it('y las tres salen del catálogo con su fundamento, no del código', async () => {
    // Regla dura 1. Un umbral con la base correcta y sin fuente es exactamente
    // el caso que este proyecto persigue: calcula bien y no se puede defender.
    const { rows } = await db.query(
      `select u.tipo::text, u.base::text, u.fuente
         from umbrales u join actividades_vulnerables a on a.id = u.actividad_id
        where a.fraccion = 'V_BIS'`,
    )
    const filas = rows as Array<{ tipo: string; base: string; fuente: string }>

    expect(filas.length).toBeGreaterThan(0)
    for (const f of filas) {
      expect(f.fuente).toContain('Art. 6')
      expect(f.fuente).toContain('27-03-2026')
    }
  })
})
