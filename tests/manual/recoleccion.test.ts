import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { almacenComo } from '../soporte/almacen'
import { BUCKET_EXPEDIENTES } from '../../src/supabase/almacen'
import { abrirExpediente } from '../../src/persistencia/expediente'
import { registrarDocumento } from '../../src/persistencia/documentos'
import { armarConstancia, apartadosVigentes } from '../../src/persistencia/constancia'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

const HOY = '2027-03-01'

/**
 * Los recolectores, contra la base.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PROPIEDAD QUE SE PRUEBA
 * ────────────────────────────────────────────────────────────────────────────
 * **Un recolector devuelve hechos del OBLIGADO, no capacidades del producto.**
 *
 * «VIZO guarda cada documento con su huella SHA-256» es cierto siempre —
 * incluso en una cuenta donde nunca se subió un archivo. Escribirlo ahí sería
 * la frase plausible y falsa de siempre, ahora en un documento que se entrega a
 * la autoridad.
 *
 * El caso que lo fija es el primero: un obligado recién creado tiene que salir
 * con los CATORCE apartados en hueco. Si alguno saliera acreditado, el
 * recolector estaría describiendo el producto en vez de al cliente.
 */
describe('La evidencia sale del obligado, no del producto', () => {
  let db: Client
  let sesion: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
  })

  /** Desenvuelve la unión: a esta fecha el Art. 37 Bis ya rige. */
  const constancia = async () => {
    const r = await enTransaccionDeSesion(db, sesion, () =>
      armarConstancia(db, { sesion, hoy: HOY }),
    )
    if (r.estado !== 'vigente') {
      throw new Error(`Se esperaba el Manual vigente en ${HOY} y salió ${r.estado}.`)
    }
    return r.constancia
  }

  it('el catálogo trae los catorce apartados del Art. 37 Bis', async () => {
    const a = await apartadosVigentes(db, HOY)

    expect(a).toHaveLength(14)
    expect(a[0]?.fraccion).toBe('I')
    expect(a[13]?.fraccion).toBe('XIV')
  })

  it('un obligado RECIÉN CREADO sale con los catorce en hueco', async () => {
    // EL CASO QUE DEFINE TODO. Sin actividad, sin clientes, sin documentos y
    // sin operaciones, no hay un solo mecanismo que acreditar. Un documento
    // que aquí dijera «el obligado conserva información con huellas SHA-256»
    // estaría describiendo a VIZO, no al cliente que lo va a entregar.
    const c = await constancia()

    expect(c.secciones).toHaveLength(14)
    expect(c.huecos).toBe(14)
    expect(c.acreditados).toBe(0)
    expect(c.parciales).toBe(0)
    for (const s of c.secciones) {
      expect(s.hechos).toEqual([])
    }
  })

  it('y los siete que VIZO debería acreditar salen marcados como DEGRADADOS', async () => {
    // No es lo mismo «este apartado le toca al obligado» que «este lo debería
    // poder demostrar y no encontré nada». Lo segundo es una cuenta a medio
    // configurar, y tiene que verse.
    const c = await constancia()

    expect([...c.degradados].sort()).toEqual(['I', 'VI', 'VII', 'VIII', 'X', 'XII', 'XIII'].sort())
  })

  it('los siete huecos de catálogo NO se marcan degradados', async () => {
    const c = await constancia()
    const deCatalogo = ['II', 'III', 'IV', 'V', 'IX', 'XI', 'XIV']

    for (const f of deCatalogo) {
      expect(c.secciones.find((s) => s.fraccion === f)?.degradado).toBe(false)
    }
  })

  describe('conforme el obligado opera, los apartados se acreditan', () => {
    beforeEach(async () => {
      await db.query(
        `insert into actividades_tenant (tenant_id, actividad_id)
         select $1, id from actividades_vulnerables where fraccion = 'V_BIS'`,
        [sesion.tenantId],
      )
    })

    it('la fracción I se acredita en cuanto hay actividad contratada', async () => {
      // El catálogo de expediente cuelga de la actividad: sin actividad no hay
      // criterios de identificación que describir, y con ella sí.
      const c = await constancia()
      const i = c.secciones.find((s) => s.fraccion === 'I')

      expect(i?.resolucion).toBe('acreditado')
      expect(i?.hechos.length).toBeGreaterThan(0)
      // Y cada hecho trae de dónde sale.
      for (const h of i?.hechos ?? []) {
        expect(h.respaldo.length).toBeGreaterThan(0)
      }
    })

    it('la VII sigue en hueco hasta que existe un documento de verdad', async () => {
      expect((await constancia()).secciones.find((s) => s.fraccion === 'VII')?.resolucion).toBe(
        'hueco',
      )

      const c = await db.query(
        `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
         values ($1,'moral',$2,'Compradora SA','MX') returning id::text`,
        [sesion.tenantId, `CST${String(Date.now()).slice(-9)}`],
      )
      const { expedienteId } = await abrirExpediente(db, {
        sesion,
        clienteId: (c.rows[0] as { id: string }).id,
      })
      await registrarDocumento(db, almacenComo(sesion, BUCKET_EXPEDIENTES), {
        sesion,
        expedienteId,
        documento: {
          campo: 'identificacion_oficial',
          nombreArchivo: 'ine.pdf',
          mime: 'application/pdf',
          bytes: new Uint8Array([1, 2, 3]),
        },
      })

      const despues = await constancia()
      const vii = despues.secciones.find((s) => s.fraccion === 'VII')

      expect(vii?.resolucion).toBe('acreditado')
      expect(vii?.hechos[0]?.afirmacion).toContain('1 documentos')
      expect(vii?.degradado).toBe(false)
    })

    it('la X se acredita con la designación ACEPTADA, no con la pendiente', async () => {
      // Es la misma regla del Art. 20 ¶2, ahora en el documento: una
      // designación pendiente no acredita nada.
      await db.query(
        `insert into designaciones_rec (tenant_id, rfc, nombre, fecha_designacion)
         values ($1,'PEGJ800101AB1','Persona Designada', current_date - 10)`,
        [sesion.tenantId],
      )
      expect((await constancia()).secciones.find((s) => s.fraccion === 'X')?.resolucion).toBe(
        'hueco',
      )

      await db.query(
        `update designaciones_rec set estado = 'aceptada', fecha_respuesta = current_date - 5
          where tenant_id = $1`,
        [sesion.tenantId],
      )

      const x = (await constancia()).secciones.find((s) => s.fraccion === 'X')
      // PARCIAL, no acreditado: las funciones del REC las define el obligado.
      expect(x?.resolucion).toBe('parcial')
      expect(x?.preguntas.length).toBeGreaterThan(0)
    })
  })

  describe('antes de que el artículo entre en vigor', () => {
    // EL DEFECTO QUE LLEGÓ AL NAVEGADOR. La pantalla pedía la constancia con la
    // fecha de HOY —agosto de 2026—, no había apartados vigentes porque el
    // Art. 37 Bis entra el 30 de noviembre, y el sistema lo trató como «el
    // catálogo no cargó». Son cosas distintas: «todavía no» no es «no hay».
    it('no revienta: responde que aún no es exigible, y desde cuándo lo será', async () => {
      const r = await enTransaccionDeSesion(db, sesion, () =>
        armarConstancia(db, { sesion, hoy: '2026-08-16' }),
      )

      expect(r.estado).toBe('aun_no_exigible')
      if (r.estado !== 'aun_no_exigible') return
      expect(r.desde).toBe('2026-11-30')
    })

    it('y trae la vista previa armada con las reglas que entrarán ese día', async () => {
      // Se arma con la fecha de ENTRADA EN VIGOR, no con hoy: un documento no
      // se juzga a caballo entre dos vigencias.
      const r = await enTransaccionDeSesion(db, sesion, () =>
        armarConstancia(db, { sesion, hoy: '2026-08-16' }),
      )

      if (r.estado !== 'aun_no_exigible') throw new Error('debía ser anticipada')
      expect(r.vistaPrevia.secciones).toHaveLength(14)
    })
  })

  it('ningún hueco trae hechos, y ningún acreditado se queda sin respaldo', async () => {
    // Invariante del documento entero. Si se rompiera, habría una sección
    // afirmando algo sin decir de dónde sale — que es la frase que el ADR-20
    // existe para impedir.
    await db.query(
      `insert into actividades_tenant (tenant_id, actividad_id)
       select $1, id from actividades_vulnerables where fraccion = 'V_BIS'`,
      [sesion.tenantId],
    )
    const c = await constancia()

    for (const s of c.secciones) {
      if (s.resolucion === 'hueco') {
        expect(s.hechos).toEqual([])
        // Y un hueco siempre dice por qué, para que no quede mudo.
        expect(s.porQueNo).toBeDefined()
      } else {
        expect(s.hechos.length).toBeGreaterThan(0)
        for (const h of s.hechos) expect(h.respaldo).not.toBe('')
      }
    }
  })
})
