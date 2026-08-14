import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import {
  CampoNoDeclarado,
  camposCapturables,
  DomicilioIncompleto,
  guardarDatosDeCaptura,
} from '../../src/persistencia/datos-expediente'
import { recalcularCompletitud } from '../../src/persistencia/expediente'
import type { ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2026-08-14'

/** Un domicilio entero: la persistencia rechaza los parciales. */
const DOMICILIO: Record<string, string> = {
  'domicilio.calle': 'CALLE 60',
  'domicilio.numero': '100',
  'domicilio.colonia': 'CENTRO',
  'domicilio.cp': '97000',
  'domicilio.municipio': 'MERIDA',
  'domicilio.estado': 'YUCATAN',
}

/**
 * Los datos de captura del expediente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE ESTA PRUEBA
 * ────────────────────────────────────────────────────────────────────────────
 * Al ensayar la demo se vio en pantalla: «Faltan datos de captura: Fecha de
 * nacimiento o constitución, Domicilio, Giro mercantil». El domicilio y el giro
 * no se podían capturar en NINGUNA pantalla del portal — el alta de cliente no
 * los pide y no hay edición—, así que ningún expediente podía llegar a
 * «completo» y el botón «Aprobar expediente» era inalcanzable.
 *
 * El mismo patrón que el desarrollo faltante en el aviso: un flujo que el
 * producto ofrece y su interfaz no puede terminar.
 */
describe('Datos de captura del expediente', () => {
  let db: Client
  let sesion: ContextoSesion
  let actividadId: string
  let clienteId: string
  let expedienteId: string

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
    sesion = await crearTenantConUsuario(db, marca, 'admin')

    await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
      sesion.tenantId,
      actividadId,
    ])
    const c = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Compradora del Expediente SA','MX') returning id::text`,
      [sesion.tenantId, `DAT${marca}`],
    )
    clienteId = (c.rows[0] as { id: string }).id
    const e = await db.query(
      `insert into expedientes (tenant_id,cliente_id,actividad_id) values ($1,$2,$3) returning id::text`,
      [sesion.tenantId, clienteId, actividadId],
    )
    expedienteId = (e.rows[0] as { id: string }).id
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })
  })

  const faltantesDeDato = async (): Promise<string[]> => {
    const { rows } = await db.query(
      `select completitud from expedientes where id = $1`,
      [expedienteId],
    )
    const c = (rows[0] as { completitud: { faltantes: Array<{ campo: string; tipoDato: string }> } })
      .completitud
    return c.faltantes.filter((f) => f.tipoDato !== 'documento').map((f) => f.campo)
  }

  it('todo faltante de dato TIENE dónde capturarse', async () => {
    // La prueba que faltaba. Si el catálogo exige un dato que ninguna pantalla
    // sabe escribir, el expediente nunca se completa y nadie lo nota: la
    // pantalla solo dice «falta», no «falta y no hay dónde ponerlo».
    const pendientes = await faltantesDeDato()
    expect(pendientes.length).toBeGreaterThan(0)

    const capturables = await camposCapturables(db, {
      actividadId,
      tipoPersona: 'moral',
      fecha: HOY,
    })
    const nombres = capturables.map((c) => c.campo)
    for (const p of pendientes) expect(nombres).toContain(p)
  })

  it('capturarlos deja el expediente sin faltantes de dato', async () => {
    const pendientes = await faltantesDeDato()
    const capturables = await camposCapturables(db, {
      actividadId,
      tipoPersona: 'moral',
      fecha: HOY,
    })

    // Un valor plausible por tipo: lo que escribiría una persona.
    const valores: Record<string, string> = {}
    for (const campo of pendientes) {
      const c = capturables.find((x) => x.campo === campo)
      if (c === undefined) continue
      if (c.tipoDato === 'fecha') valores[campo] = '2018-03-12'
      else if (c.tipoDato === 'catalogo') {
        const { rows } = await db.query(
          `select codigo from catalogos_sat
            where actividad_id = $1 and catalogo = $2
              and daterange(vigente_desde, vigente_hasta, '[]') @> $3::date limit 1`,
          [actividadId, c.catalogo, HOY],
        )
        valores[campo] = (rows[0] as { codigo: string }).codigo
      } else if (c.compuesto) {
        // El domicilio se captura por partes: la columna es jsonb.
        valores[`${campo}.calle`] = 'CALLE 60'
        valores[`${campo}.numero`] = '100'
        valores[`${campo}.colonia`] = 'CENTRO'
        valores[`${campo}.cp`] = '97000'
        valores[`${campo}.municipio`] = 'MERIDA'
        valores[`${campo}.estado`] = 'YUCATAN'
      } else valores[campo] = 'DATO DE PRUEBA'
    }

    await guardarDatosDeCaptura(db, { sesion, expedienteId, valores, fecha: HOY })
    await recalcularCompletitud(db, { sesion, expedienteId, fecha: HOY })

    expect(await faltantesDeDato()).toEqual([])
  })

  it('un campo que el catálogo no declara NO se puede escribir', async () => {
    // Los nombres vienen de un formulario: son entrada del atacante. Sin esta
    // barrera, `nivel_riesgo` —o cualquier columna— sería escribible desde el
    // navegador.
    await expect(
      guardarDatosDeCaptura(db, {
        sesion,
        expedienteId,
        valores: { nivel_riesgo: 'bajo' },
        fecha: HOY,
      }),
    ).rejects.toThrow(CampoNoDeclarado)
  })

  it('un valor vacío no borra lo que ya estaba', async () => {
    await guardarDatosDeCaptura(db, {
      sesion,
      expedienteId,
      valores: DOMICILIO,
      fecha: HOY,
    })
    await guardarDatosDeCaptura(db, {
      sesion,
      expedienteId,
      valores: { 'domicilio.calle': '   ' },
      fecha: HOY,
    })

    const { rows } = await db.query(`select domicilio from clientes_finales where id = $1`, [
      clienteId,
    ])
    expect((rows[0] as { domicilio: Record<string, string> }).domicilio['calle']).toBe('CALLE 60')
  })

  it('media dirección NO se guarda', async () => {
    // Sin esto, `{calle: "X"}` es un objeto no vacío: `tieneValor` lo da por
    // cubierto, el expediente pasa a «completo» y queda archivada media
    // dirección como si estuviera integrada.
    await expect(
      guardarDatosDeCaptura(db, {
        sesion,
        expedienteId,
        valores: { 'domicilio.calle': 'CALLE 60' },
        fecha: HOY,
      }),
    ).rejects.toThrow(DomicilioIncompleto)

    const { rows } = await db.query(`select domicilio from clientes_finales where id = $1`, [
      clienteId,
    ])
    expect((rows[0] as { domicilio: Record<string, string> }).domicilio).toEqual({})
  })

  it('deja en la bitácora QUÉ campos se capturaron, nunca sus valores', async () => {
    // REGLA DURA 3: el domicilio de una persona es dato personal; que se haya
    // capturado el domicilio es metadato.
    await guardarDatosDeCaptura(db, {
      sesion,
      expedienteId,
      valores: DOMICILIO,
      fecha: HOY,
    })

    const { rows } = await db.query(
      `select datos::text as datos from bitacora
        where tenant_id = $1 and evento = 'expediente.datos_capturados'`,
      [sesion.tenantId],
    )
    const datos = (rows[0] as { datos: string }).datos
    expect(datos).toContain('domicilio')
    expect(datos).not.toContain('CALLE 60')
  })
})
