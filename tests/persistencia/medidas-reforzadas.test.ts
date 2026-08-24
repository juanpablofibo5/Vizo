import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeMedidasInvalido,
  asentarMedidasReforzadas,
  estadoDeMedidasReforzadas,
} from '../../src/persistencia/medidas-reforzadas'

/**
 * El Art. 23 Ter 4 sobre la base real.
 *
 * Lo que protege: que la fracción se DERIVE y no se pueda torcer, que un
 * fideicomiso no acabe asentado bajo una fracción que no lo nombra, y que la
 * fr. III se apile sola cuando el cliente es PEP extranjera.
 */
describe('Las medidas reforzadas del Art. 23 Ter 4', () => {
  let db: Client
  let sesion: ContextoSesion
  let marca: string
  let modeloId: string
  let grados: Record<string, string>
  let n = 0

  const HOY = '2027-04-10'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  const crearCliente = async (tipo: 'fisica' | 'moral' | 'fideicomiso') => {
    n += 1
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,$2,$3,'Cliente Reforzadas','MX') returning id::text`,
      [sesion.tenantId, tipo, `R${String(n)}${marca}`],
    )
    return (c.rows[0] as { id: string }).id
  }

  const clasificar = (clienteId: string, clave: 'alto' | 'medio') =>
    db.query(
      `insert into evaluaciones_riesgo
         (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,evaluado_en,vence)
       values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,date '2027-04-01',date '2027-10-01')`,
      [sesion.tenantId, clienteId, modeloId, grados[clave], clave === 'alto' ? 80 : 40, sesion.usuarioId],
    )

  /** Una declaración PEP con vínculo EXTRANJERO vigente: dispara la fr. III. */
  const declararPepExtranjera = async (clienteId: string) => {
    await db.query('begin')
    const r = await db.query(
      `insert into declaraciones_pep (tenant_id,cliente_id,resultado,fecha_declaracion,capturada_por)
       values ($1,$2,'pep_por_funcion',date '2027-03-01',$3) returning id::text`,
      [sesion.tenantId, clienteId, sesion.usuarioId],
    )
    await db.query(
      `insert into vinculos_pep (tenant_id,declaracion_id,tipo,cargo,ambito,pais,en_funciones)
       values ($1,$2,'titular','Ministra','extranjero','ES',true)`,
      [sesion.tenantId, (r.rows[0] as { id: string }).id],
    )
    await db.query('commit')
  }

  const estado = (clienteId: string) =>
    enTransaccionDeSesion(db, sesion, () =>
      estadoDeMedidasReforzadas(db, { sesion, clienteId, hoy: HOY }),
    )

  beforeEach(async () => {
    n = 0
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')

    grados = {}
    for (const [k, nom, o, alto, min] of [
      ['bajo', 'Bajo', 1, false, 0],
      ['medio', 'Medio', 2, false, 35],
      ['alto', 'Alto', 3, true, 70],
    ] as const) {
      const r = await db.query(
        `insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
         values ($1,$2,$3,$4,$5,$6,date '2027-03-01') returning id::text`,
        [sesion.tenantId, k, nom, o, alto, min],
      )
      grados[k] = (r.rows[0] as { id: string }).id
    }
    const el = await db.query(`select id from elementos_riesgo where clave = 'tipo_cliente'`)
    const m = await db.query(
      `insert into modelos_riesgo (tenant_id,version) values ($1,1) returning id::text`,
      [sesion.tenantId],
    )
    modeloId = (m.rows[0] as { id: string }).id
    await db.query(
      `insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
       values ($1,$2,$3,'Prueba',80)`,
      [sesion.tenantId, modeloId, (el.rows[0] as { id: string }).id],
    )
    await db.query(
      `update modelos_riesgo set estado='vigente', vigente_desde=date '2027-03-01',
              aprobado_por=$2, aprobado_en=now() where id=$1`,
      [modeloId, sesion.usuarioId],
    )
  })

  it('la fracción se DERIVA de la clase de persona, no se elige', async () => {
    const fisica = await crearCliente('fisica')
    const moral = await crearCliente('moral')
    await clasificar(fisica, 'alto')
    await clasificar(moral, 'alto')

    expect((await estado(fisica)).exigencia).toMatchObject({ estado: 'exigible', fraccion: 'fisica' })
    expect((await estado(moral)).exigencia).toMatchObject({ estado: 'exigible', fraccion: 'moral' })
  })

  it('UN FIDEICOMISO DE GRADO ALTO SALE «SIN FRACCIÓN», y no se le puede asentar nada', async () => {
    const fid = await crearCliente('fideicomiso')
    await clasificar(fid, 'alto')

    const e = await estado(fid)
    expect(e.exigencia).toEqual({ estado: 'sin_fraccion', tipoPersona: 'fideicomiso' })

    const intento = asentarMedidasReforzadas(db, {
      sesion, clienteId: fid, hoy: HOY,
      datos: { fechaAdopcion: HOY, medidasOrigenDestino: 'x', manualPreveVinculadas: false },
    })
    await expect(intento).rejects.toBeInstanceOf(DatoDeMedidasInvalido)
    await expect(intento).rejects.toThrow(/no lo nombra/i)
  })

  it('sin clasificar no dice «no se requiere»', async () => {
    const c = await crearCliente('fisica')
    expect((await estado(c)).exigencia).toEqual({
      estado: 'indeterminable',
      falta: 'grado_de_riesgo',
    })
  })

  it('fr. I: se asienta con su decisión del inciso b) y queda atada a la clasificación', async () => {
    const c = await crearCliente('fisica')
    await clasificar(c, 'alto')
    await asentarMedidasReforzadas(db, {
      sesion, clienteId: c, hoy: HOY,
      datos: {
        fechaAdopcion: HOY,
        medidasOrigenDestino: 'Estados de cuenta de seis meses.',
        manualPreveVinculadas: true,
        personasVinculadas: [
          { vinculo: 'conyuge', nombre: 'Cónyuge', datosObtenidos: true, documentacionObtenida: false },
        ],
      },
    })
    const e = await estado(c)
    expect(e.cobertura.estado).toBe('cubierto')
    expect(e.historial[0]?.fraccion).toBe('fisica')
    expect(e.historial[0]?.personasVinculadas).toHaveLength(1)
    expect(e.historial[0]?.evaluacionRiesgoId).toBe(e.evaluacionVigenteId)
  })

  it('fr. II: SIN la consulta a la Secretaría de Economía no entra', async () => {
    const c = await crearCliente('moral')
    await clasificar(c, 'alto')
    await expect(
      asentarMedidasReforzadas(db, {
        sesion, clienteId: c, hoy: HOY,
        datos: { fechaAdopcion: HOY, informacionAccionistas: 'Libro de accionistas.' },
      }),
    ).rejects.toThrow(/Secretaría de Economía/)
  })

  it('fr. II: con la consulta entra, y queda registrada', async () => {
    const c = await crearCliente('moral')
    await clasificar(c, 'alto')
    await asentarMedidasReforzadas(db, {
      sesion, clienteId: c, hoy: HOY,
      datos: {
        fechaAdopcion: HOY,
        informacionAccionistas: 'Libro de accionistas.',
        consultaSeFecha: '2027-04-09',
        consultaSeResultado: 'Coinciden los tres socios.',
      },
    })
    const e = await estado(c)
    expect(e.historial[0]?.consultaSeFecha).toBe('2027-04-09')
  })

  it('fr. III: se apila SOLA cuando el cliente es PEP extranjera', async () => {
    const c = await crearCliente('fisica')
    await clasificar(c, 'alto')
    await declararPepExtranjera(c)

    // Nadie lo tecleó: sale del Cap. III Quáter.
    expect((await estado(c)).aplicaPepExtranjera).toBe(true)

    // Y sin la documentación adicional, no entra.
    await expect(
      asentarMedidasReforzadas(db, {
        sesion, clienteId: c, hoy: HOY,
        datos: { fechaAdopcion: HOY, medidasOrigenDestino: 'x', manualPreveVinculadas: false },
      }),
    ).rejects.toThrow(/fr\. III/)
  })

  it('fr. III: una persona vinculada sin DOCUMENTACIÓN bloquea, aunque tenga datos', async () => {
    const c = await crearCliente('fisica')
    await clasificar(c, 'alto')
    await declararPepExtranjera(c)
    await expect(
      asentarMedidasReforzadas(db, {
        sesion, clienteId: c, hoy: HOY,
        datos: {
          fechaAdopcion: HOY,
          medidasOrigenDestino: 'x',
          manualPreveVinculadas: true,
          documentacionPepExtranjera: 'Pasaporte',
          personasVinculadas: [
            { vinculo: 'conyuge', nombre: 'Ana', datosObtenidos: true, documentacionObtenida: false },
          ],
        },
      }),
    ).rejects.toThrow(/DOCUMENTACIÓN/)
  })

  it('con grado medio no es exigible', async () => {
    const c = await crearCliente('moral')
    await clasificar(c, 'medio')
    expect((await estado(c)).exigencia).toEqual({
      estado: 'no_exigible',
      porque: 'no_es_grado_alto',
    })
  })
})
