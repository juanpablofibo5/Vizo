import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import {
  OperacionInvalida,
  montoCapturado,
  registrarOperacion,
  type DatosOperacion,
} from '../../src/persistencia/operaciones'
import { pesos } from '../../src/dominio/dinero'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * El ciclo completo: capturar una operación y que el sistema diga, en el mismo
 * acto, si hay obligación.
 *
 * Hasta la semana 6 el motor existía y nadie lo llamaba. Esto es lo que
 * convierte al prototipo en algo que hace lo que promete.
 */
describe('Registro de operaciones con el motor en vivo', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let sucursalNorte: string
  let sucursalCentro: string

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca)

    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion = 'V_BIS'`,
      [sesion.tenantId],
    )

    const s1 = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Norte','NTE') returning id`,
      [sesion.tenantId],
    )
    sucursalNorte = (s1.rows[0] as { id: string }).id
    const s2 = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Centro','CTR') returning id`,
      [sesion.tenantId],
    )
    sucursalCentro = (s2.rows[0] as { id: string }).id

    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
       values ($1,'fisica',$2,'Aportante de preventa') returning id`,
      [sesion.tenantId, `APO${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
  })

  const pago = (fecha: string, base: number, sucursal?: string): DatosOperacion => ({
    sucursalId: sucursal ?? sucursalNorte,
    clienteId,
    fechaOperacion: fecha,
    montoBase: pesos(base),
    iva: pesos(0),
    isai: pesos(0),
    otrosAccesorios: pesos(0),
    formaPago: '03', // transferencia
  })

  /**
   * EL ENTREGABLE DE LA SEMANA 7.
   *
   * Tres pagos parciales de preventa que individualmente no llegan al umbral.
   * El tercero cruza los $941,412.75 sumados y dispara el aviso — y lo hace
   * cruzando sucursales, que es lo que un Excel por sucursal no puede ver.
   */
  it('tres pagos de preventa disparan el aviso en el que cruza el umbral', async () => {
    const primero = await registrarOperacion(db, { sesion, datos: pago('2026-03-15', 400_000) })
    expect(primero.evaluacion.resultadoAviso).toBe('no')
    expect(primero.evaluacion.requiereIdentificacion).toBe(true) // en V Bis, siempre

    const segundo = await registrarOperacion(db, {
      sesion,
      datos: pago('2026-04-15', 400_000, sucursalCentro), // OTRA sucursal
    })
    expect(segundo.evaluacion.resultadoAviso).toBe('no')

    const tercero = await registrarOperacion(db, { sesion, datos: pago('2026-05-15', 400_000) })

    // 400,000 × 3 = 1,200,000 ≥ 941,412.75
    expect(tercero.evaluacion.resultadoAviso).toBe('acumulacion')
    expect(tercero.evaluacion.sumaVentana).toBe(pesos(1_200_000))
    expect(tercero.evaluacion.operacionesAcumuladas).toHaveLength(2)
    expect(tercero.alertas).toHaveLength(1)

    const { rows } = await db.query(
      `select a.tipo::text, a.titulo, a.detalle, a.estado::text
         from alertas a where a.evaluacion_id = $1`,
      [tercero.evaluacionId],
    )
    const alerta = rows[0] as {
      tipo: string
      titulo: string
      estado: string
      detalle: Record<string, unknown>
    }
    expect(alerta.tipo).toBe('aviso_requerido')
    expect(alerta.titulo).toContain('acumulación')
    expect(alerta.estado).toBe('abierta')
    // `detalle` es jsonb: dato consultable, no una frase.
    expect(alerta.detalle['por']).toBe('acumulacion')
    expect(alerta.detalle['suma_ventana']).toBe('1200000.00')
    expect(alerta.detalle['operaciones_en_ventana']).toBe(3)
    // Y no dice quién es: a eso se llega por RLS desde la evaluación.
    expect(JSON.stringify(alerta.detalle)).not.toContain('Aportante')
  })

  it('la evaluación queda guardada con sus insumos, ligada a su operación', async () => {
    const r = await registrarOperacion(db, { sesion, datos: pago('2026-05-15', 950_000) })
    expect(r.evaluacion.resultadoAviso).toBe('individual')

    const { rows } = await db.query(
      `select e.operacion_id, e.uma_valor::text as uma, e.catalogo_version,
              e.monto_base_considerado::text as base
         from evaluaciones_umbral e where e.id = $1`,
      [r.evaluacionId],
    )
    const f = rows[0] as Record<string, string>
    expect(f['operacion_id']).toBe(r.operacionId)
    expect(f['uma']).toBe('117.31')
    expect(f['base']).toBe('950000.00')
  })

  it('la hora de captura la pone la BASE, no el cliente ni la aplicación', async () => {
    const r = await registrarOperacion(db, { sesion, datos: pago('2026-01-10', 100_000) })
    const { rows } = await db.query(
      `select registrado_en, now() - registrado_en < interval '1 minute' as reciente,
              fecha_operacion::text as fecha
         from operaciones where id = $1`,
      [r.operacionId],
    )
    const f = rows[0] as { reciente: boolean; fecha: string }
    // La fecha del ACTO es enero; la de captura, ahora. Son cosas distintas.
    expect(f.fecha).toBe('2026-01-10')
    expect(f.reciente).toBe(true)
  })

  it('una operación de enero se evalúa con la UMA de enero, no con la de hoy', async () => {
    // El gotcha del 1 de febrero: enero usa la UMA del año anterior.
    //
    // Cada monto va con un cliente DISTINTO a propósito. Con el mismo cliente,
    // la operación de enero cae dentro de la ventana de seis meses de la de
    // febrero y el resultado sería 'acumulacion' — cierto, pero por otra razón.
    // El test mediría entonces la acumulación y no el borde de la UMA, que es
    // lo que dice medir.
    const otroCliente = (
      (
        await db.query(
          `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social)
           values ($1,'fisica',$2,'Aportante de febrero') returning id`,
          [sesion.tenantId, `FEB${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900) + 100}`],
        )
      ).rows[0] as { id: string }
    ).id

    const enero = await registrarOperacion(db, { sesion, datos: pago('2026-01-20', 920_000) })
    const febrero = await registrarOperacion(db, {
      sesion,
      datos: { ...pago('2026-02-20', 920_000), clienteId: otroCliente },
    })

    // Umbral 2025: 8,025 × 113.14 = 907,948.50  -> 920,000 lo cruza
    expect(enero.evaluacion.resultadoAviso).toBe('individual')
    // Umbral 2026: 8,025 × 117.31 = 941,412.75  -> 920,000 no llega
    expect(febrero.evaluacion.resultadoAviso).toBe('no')
  })

  describe('corrección', () => {
    it('corregir es una fila NUEVA y la vieja deja de contar en la acumulación', async () => {
      const malo = await registrarOperacion(db, { sesion, datos: pago('2026-05-01', 900_000) })
      expect(malo.evaluacion.resultadoAviso).toBe('no')

      // El monto real era mucho menor: se corrige.
      const bueno = await registrarOperacion(db, {
        sesion,
        datos: { ...pago('2026-05-01', 90_000), corrigeA: malo.operacionId },
      })

      const { rows } = await db.query(
        `select (select count(*) from operaciones where tenant_id=$1)::int as todas,
                (select count(*) from operaciones_vigentes where tenant_id=$1)::int as vigentes`,
        [sesion.tenantId],
      )
      // Las dos filas existen; solo una está vigente.
      expect(rows[0]).toEqual({ todas: 2, vigentes: 1 })

      // Y la corregida ya no suma: un pago posterior solo ve los 90,000.
      const siguiente = await registrarOperacion(db, { sesion, datos: pago('2026-05-20', 500_000) })
      expect(siguiente.evaluacion.sumaVentana).toBe(pesos(590_000))
      expect(bueno.evaluacion.resultadoAviso).toBe('no')
    })
  })

  describe('lo que no debe entrar', () => {
    it('rechaza un monto en cero: no hay operación que evaluar', async () => {
      await expect(
        registrarOperacion(db, { sesion, datos: pago('2026-05-01', 0) }),
      ).rejects.toThrow(OperacionInvalida)
    })

    it('un obligado sin la actividad registrada no puede capturar', async () => {
      const otra = await crearTenantConUsuario(
        db,
        String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100),
      )
      await expect(
        registrarOperacion(db, { sesion: otra, datos: pago('2026-05-01', 100_000) }),
      ).rejects.toThrow(/no tiene registrada la Fracción V Bis/)
    })

    it('no deja operación sin evaluación si algo falla a la mitad', async () => {
      await expect(
        registrarOperacion(db, {
          sesion,
          datos: { ...pago('2026-05-01', 100_000), clienteId: sucursalNorte }, // id que no es cliente
        }),
      ).rejects.toThrow()

      const { rows } = await db.query(
        `select (select count(*) from operaciones where tenant_id=$1)::int as o,
                (select count(*) from evaluaciones_umbral where tenant_id=$1)::int as e`,
        [sesion.tenantId],
      )
      expect(rows[0]).toEqual({ o: 0, e: 0 })
    })
  })

  describe('montos capturados a mano', () => {
    it('acepta lo que la gente realmente teclea', () => {
      expect(montoCapturado('941,412.75', 'Monto')).toBe(pesos(941_412.75))
      expect(montoCapturado('$ 400000', 'Monto')).toBe(pesos(400_000))
      expect(montoCapturado('', 'Monto')).toBe(pesos(0))
    })

    it('rechaza lo ambiguo en vez de interpretarlo', () => {
      // "8.2" podrían ser 8 pesos 20 centavos; "8,2" en Europa son 8.2. No se
      // adivina: se rechaza con un ejemplo.
      expect(() => montoCapturado('8,2', 'Monto')).toThrow(/importe válido/)
      expect(() => montoCapturado('mil pesos', 'Monto')).toThrow(/importe válido/)
      expect(() => montoCapturado('100.999', 'Monto')).toThrow(/importe válido/)
    })
  })
})
