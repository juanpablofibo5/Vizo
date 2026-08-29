import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { registrarOperacion } from '../../src/persistencia/operaciones'
import { cargarConfigActividad } from '../../src/catalogo/cargador'
import { pesos } from '../../src/dominio/dinero'
import { type ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * Fracción VIII — la fracción del PILOTO (PIL-01, agencias automotrices).
 *
 * Dada de alta ÚNICAMENTE con INSERTs (`20260830100000`), como la XV — pero
 * con una diferencia que importa: sus tres umbrales citan el texto de la Ley
 * del repo, porque esta fracción no es prueba de arquitectura: es la que va a
 * operar. Este archivo usa EXACTAMENTE las mismas funciones que V Bis y XV —
 * ni un import propio, ni una rama por fracción.
 *
 * El último caso es el de la sesión de NEXUM (26-ago-2026): la acumulación de
 * pagos que la agencia hacía «de forma artesanal en Excel» — el dolor exacto
 * que la demo del piloto tiene que resolver en pantalla.
 *
 * Umbrales con la UMA de 2026 ($117.31):
 *   identificación  3,210 UMA = $376,565.10
 *   aviso           6,420 UMA = $753,130.20
 */
describe('Fracción VIII — la fracción del piloto, solo con configuración', () => {
  let db: Client
  let sesion: ContextoSesion
  let actividadViii: string
  let sucursalId: string
  let clienteId: string

  beforeAll(async () => {
    db = await conectar()
    const r = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'VIII'`,
    )
    const id = (r.rows[0] as { id: string } | undefined)?.id
    if (id === undefined) {
      throw new Error(
        'La Fracción VIII no está en el catálogo. Se da de alta con la migración ' +
          '20260830100000, no con código.',
      )
    }
    actividadViii = id
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      actividadViii,
    ])
    const s = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Agencia Norte','AGN') returning id`,
      [sesion.tenantId],
    )
    sucursalId = (s.rows[0] as { id: string }).id
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'fisica',$2,'Comprador de Flotilla','MX') returning id`,
      [sesion.tenantId, `VEH${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  const vender = (fecha: string, monto: number) =>
    registrarOperacion(db, {
      sesion,
      datos: {
        sucursalId,
        clienteId,
        fechaOperacion: fecha,
        montoBase: pesos(monto),
        iva: pesos(0),
        isai: pesos(0),
        otrosAccesorios: pesos(0),
        formaPago: '03',
        actividadId: actividadViii,
        descripcionBien: 'Camioneta pickup nueva',
      },
    })

  it('el catálogo resuelve los umbrales de la Ley con la UMA vigente', async () => {
    // 3,210 × 117.31 = $376,565.10 · 6,420 × 117.31 = $753,130.20 — los
    // números del Art. 17 fr. VIII, no de una tabla de tercero.
    const config = await cargarConfigActividad(db, 'VIII', '2026-02-15')

    const identificacion = config.umbrales.find((u) => u.tipo === 'identificacion')
    const aviso = config.umbrales.find((u) => u.tipo === 'aviso')

    expect(identificacion?.siempre).toBe(false)
    expect(identificacion?.enCentavos).toBe(37_656_510)
    expect(aviso?.enCentavos).toBe(75_313_020)
  })

  it('una venta de $800,000 dispara identificación y aviso individual', async () => {
    const r = await vender('2026-02-15', 800_000)

    expect(r.evaluacion.requiereIdentificacion).toBe(true)
    expect(r.evaluacion.resultadoAviso).toBe('individual')
  })

  it('un auto de $200,000 no exige identificación: la Fr. VIII tiene umbral, no «siempre»', async () => {
    // La mayor parte del piso de venta de una agencia vive aquí abajo. El
    // motor no sabe que esto es una agencia: lee el catálogo.
    const r = await vender('2026-02-15', 200_000)

    expect(r.evaluacion.requiereIdentificacion).toBe(false)
    expect(r.evaluacion.resultadoAviso).toBe('no')
  })

  it('el caso de la sesión NEXUM: los pagos acumulan y el que cruza dispara el aviso', async () => {
    // Una camioneta de $1.1M pagada en dos complementos de $550,000. Cada pago
    // pasa identificación ($550,000 ≥ $376,565.10) y ninguno llega al aviso
    // individual ($753,130.20) — pero el segundo deja la ventana en $1.1M y el
    // motor lo detecta en el momento, no en el corte de fin de mes en Excel.
    await vender('2026-04-05', 550_000)
    const segundo = await vender('2026-05-05', 550_000)

    expect(segundo.evaluacion.resultadoAviso).toBe('acumulacion')
  })
})
