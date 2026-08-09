import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { registrarDocumento } from '../../src/persistencia/documentos'
import { recalcularCompletitud, camposVigentes } from '../../src/persistencia/expediente'
import {
  CampoSinOrigen,
  CatalogoDeExpedienteVacio,
  calcularCompletitud,
} from '../../src/dominio/expediente'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2026-08-08'

describe('Completitud del expediente', () => {
  describe('lo que el catálogo decide (sin base)', () => {
    const campo = (over: Partial<Parameters<typeof calcularCompletitud>[0][number]> = {}) => ({
      campo: 'rfc',
      etiqueta: 'RFC',
      tipoDato: 'texto' as const,
      obligatorio: true,
      columna: 'rfc',
      orden: 10,
      ...over,
    })

    it('un catálogo VACÍO no significa expediente completo: revienta', () => {
      // El caso caro. Sin obligatorios no hay nada que incumplir, así que el
      // expediente saldría "completo", de ahí a aprobado y de ahí a un aviso
      // sobre un expediente que nunca se integró. Un catálogo que no cargó se
      // ve idéntico a un expediente genuinamente completo.
      expect(() => calcularCompletitud([], { rfc: 'X' }, new Set())).toThrow(
        CatalogoDeExpedienteVacio,
      )
    })

    it('un campo de dato sin columna de origen revienta en vez de adivinar', () => {
      expect(() =>
        calcularCompletitud([campo({ columna: undefined })], {}, new Set()),
      ).toThrow(CampoSinOrigen)
    })

    it('la cadena vacía no cuenta como capturado', () => {
      const r = calcularCompletitud([campo()], { rfc: '   ' }, new Set())
      expect(r.estatus).toBe('incompleto')
    })

    it('un jsonb vacío tampoco: {} es una fila con dato y un expediente sin domicilio', () => {
      const r = calcularCompletitud(
        [campo({ campo: 'domicilio', columna: 'domicilio' })],
        { domicilio: {} },
        new Set(),
      )
      expect(r.estatus).toBe('incompleto')
    })

    it('los campos opcionales no impiden completar', () => {
      const r = calcularCompletitud(
        [campo(), campo({ campo: 'curp', columna: 'curp', obligatorio: false })],
        { rfc: 'RANJ800101AB1', curp: null },
        new Set(),
      )
      expect(r.estatus).toBe('completo')
      expect(r.totalObligatorios).toBe(1)
    })
  })

  describe('contra la base', () => {
    let db: Client
    let sesion: ContextoSesion
    let expedienteId: string
    let actividadId: string
    let marca: string

    beforeAll(async () => {
      db = await conectar()
    })

    afterAll(async () => {
      await db.end()
    })

    beforeEach(async () => {
      marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
      sesion = await crearTenantConUsuario(db, marca)
      const r = await crearExpedienteMoral(db, sesion, marca)
      expedienteId = r.expedienteId
      actividadId = r.actividadId
    })

    it('un expediente recién abierto está incompleto y dice exactamente qué falta', async () => {
      const r = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })

      expect(r.estatus).toBe('incompleto')
      const claves = r.faltantes.map((f) => f.campo)
      // El cliente se creó solo con RFC y razón social.
      expect(claves).toContain('identificacion_oficial')
      expect(claves).toContain('acta_constitutiva')
      expect(claves).toContain('domicilio')
      // Y NO debe pedir lo de persona física.
      expect(claves).not.toContain('nombre_pila')
      expect(claves).not.toContain('actividad_economica')
    })

    it('subir el documento cubre su campo', async () => {
      const antes = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      expect(antes.faltantes.map((f) => f.campo)).toContain('identificacion_oficial')

      await registrarDocumento(db, almacenComo(sesion), {
        sesion,
        expedienteId,
        documento: {
          campo: 'identificacion_oficial',
          nombreArchivo: 'ine.pdf',
          mime: 'application/pdf',
          bytes: new Uint8Array(randomBytes(128)),
        },
      })

      const despues = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      expect(despues.faltantes.map((f) => f.campo)).not.toContain('identificacion_oficial')
      expect(despues.cubiertos).toBe(antes.cubiertos + 1)
    })

    it('un documento REEMPLAZADO deja de cubrir; el que lo reemplaza cubre', async () => {
      const almacen = almacenComo(sesion)
      const doc = (n: number) => ({
        campo: 'comprobante_domicilio',
        nombreArchivo: `cfe-${n}.pdf`,
        mime: 'application/pdf',
        bytes: new Uint8Array(randomBytes(64 + n)),
      })

      const viejo = await registrarDocumento(db, almacen, {
        sesion, expedienteId, documento: doc(1),
      })
      const cubiertoConViejo = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      expect(cubiertoConViejo.faltantes.map((f) => f.campo)).not.toContain('comprobante_domicilio')

      await registrarDocumento(db, almacen, {
        sesion, expedienteId, documento: doc(2), reemplazaA: viejo.documentoId,
      })

      // Sigue cubierto —por el nuevo— y el viejo permanece en la tabla:
      // es append-only, corregir nunca borra.
      const despues = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      expect(despues.faltantes.map((f) => f.campo)).not.toContain('comprobante_domicilio')

      const { rows } = await db.query(
        `select count(*)::int n from documentos where expediente_id=$1 and campo='comprobante_domicilio'`,
        [expedienteId],
      )
      expect((rows[0] as { n: number }).n).toBe(2)
    })

    /**
     * EL ENTREGABLE DE LA SEMANA 6.
     *
     * "Quitar un campo obligatorio del seed del catálogo → la completitud del
     * expediente cambia sin tocar código."
     */
    it('cerrar la vigencia de un campo lo saca de la completitud, sin tocar código', async () => {
      const antes = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      expect(antes.faltantes.map((f) => f.campo)).toContain('acta_constitutiva')

      // Un UPDATE al CATÁLOGO. Ni una línea de TypeScript cambia.
      await db.query(
        `update campos_expediente set vigente_hasta = $2::date - 1
          where actividad_id = $1 and campo = 'acta_constitutiva'`,
        [actividadId, HOY],
      )

      const despues = await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      expect(despues.faltantes.map((f) => f.campo)).not.toContain('acta_constitutiva')
      expect(despues.totalObligatorios).toBe(antes.totalObligatorios - 1)

      // Y la vigencia es por FECHA: un expediente juzgado con fecha anterior
      // sigue exigiéndolo. Igual que los umbrales.
      const camposAntiguos = await camposVigentes(db, actividadId, 'moral', '2026-01-15')
      expect(camposAntiguos.map((c) => c.campo)).toContain('acta_constitutiva')

      // Se restaura para no contaminar las demás corridas.
      await db.query(
        `update campos_expediente set vigente_hasta = null
          where actividad_id = $1 and campo = 'acta_constitutiva'`,
        [actividadId],
      )
    })

    it('persona física y persona moral no piden lo mismo', async () => {
      const fisica = await camposVigentes(db, actividadId, 'fisica', HOY)
      const moral = await camposVigentes(db, actividadId, 'moral', HOY)

      const cf = fisica.map((c) => c.campo)
      const cm = moral.map((c) => c.campo)

      expect(cf).toContain('nombre_pila')
      expect(cf).not.toContain('acta_constitutiva')
      expect(cm).toContain('acta_constitutiva')
      expect(cm).not.toContain('nombre_pila')
      // Y ambos comparten los de 'ambas'.
      expect(cf).toContain('rfc')
      expect(cm).toContain('rfc')
    })

    it('la bitácora registra qué faltó, nunca el valor de lo que faltó', async () => {
      await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })

      const { rows } = await db.query(
        `select datos::text as d from bitacora
          where tenant_id=$1 and evento='expediente.completitud_evaluada'`,
        [sesion.tenantId],
      )
      const datos = (rows[0] as { d: string }).d

      expect(datos).toContain('identificacion_oficial')  // la CLAVE del campo
      expect(datos).toContain('incompleto')
      expect(datos).not.toContain(`EXP${marca}`)         // el RFC del cliente, no
      expect(datos).not.toContain('Cliente del expediente')
    })

    it('el estatus queda guardado en la tabla, no solo devuelto', async () => {
      await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
      const { rows } = await db.query(
        `select estatus::text as e, completitud->>'estatus' as ce,
                (completitud->'faltantes') is not null as tiene_faltantes
           from expedientes where id=$1`,
        [expedienteId],
      )
      expect(rows[0]).toEqual({ e: 'incompleto', ce: 'incompleto', tiene_faltantes: true })
    })
  })
})

async function crearExpedienteMoral(
  db: Client,
  sesion: ContextoSesion,
  marca: string,
): Promise<{ expedienteId: string; actividadId: string }> {
  const a = await db.query(`select id from actividades_vulnerables where fraccion='V_BIS'`)
  const actividadId = (a.rows[0] as { id: string }).id

  const c = await db.query(
    `insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social)
     values ($1,'moral',$2,'Cliente del expediente') returning id`,
    [sesion.tenantId, `EXP${marca}`],
  )
  const e = await db.query(
    `insert into expedientes (tenant_id, cliente_id, actividad_id) values ($1,$2,$3) returning id`,
    [sesion.tenantId, (c.rows[0] as { id: string }).id, actividadId],
  )
  return { expedienteId: (e.rows[0] as { id: string }).id, actividadId }
}
