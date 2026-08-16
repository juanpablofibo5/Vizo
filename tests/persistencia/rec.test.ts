import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { arranqueDelObligado } from '../../src/persistencia/arranque'
import { registrarTipoPersona } from '../../src/persistencia/obligado'
import {
  DatoDelRecInvalido,
  NoAplicaDesignacion,
  RelevoExigeSustituir,
  designarRec,
  estadoDelRec,
  registrarRespuestaRec,
  sustituirRec,
} from '../../src/persistencia/rec'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

const RFC_A = 'PEGJ800101AB1'
const RFC_B = 'LOMA900202CD2'

/**
 * La designación del REC.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA AFIRMACIÓN QUE ESTOS CASOS PROTEGEN
 * ────────────────────────────────────────────────────────────────────────────
 * Art. 20 LFPIORPI, párrafo 2: «En tanto no haya una persona Representante
 * Encargada del Cumplimiento **o la designación no sea aceptada**, el
 * cumplimiento de las obligaciones […] corresponderá a los integrantes del
 * órgano de administración o a quien funja como administrador único».
 *
 * O sea: designar sin aceptación es, para efectos de responsabilidad, lo mismo
 * que no haber designado. El defecto que estos casos impiden es el más barato
 * de cometer y el más caro de descubrir — un checklist que se marca al capturar
 * el nombre, y un administrador que cree estar cubierto y no lo está.
 */
describe('Designación del REC', () => {
  let db: Client
  let sesion: ContextoSesion
  let capturista: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    capturista = { ...sesion, rol: 'capturista' }
  })

  const leer = () => enTransaccionDeSesion(db, sesion, () => estadoDelRec(db, { sesion }))

  const pasos = () =>
    enTransaccionDeSesion(db, sesion, () => arranqueDelObligado(db, { sesion }))

  const ayer = (dias: number): string => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - dias)
    return d.toISOString().slice(0, 10)
  }

  describe('a quién se le pide', () => {
    it('mientras no se sepa qué clase de persona es, el paso NO se muestra', async () => {
      // Ni se reclama la obligación ni se da por cumplida. Enseñar el paso a
      // quien quizá no lo debe es inventar una obligación; ocultarlo dando por
      // hecho que no aplica es esconder una. La salida honesta es pedir el dato
      // que falta, y ese es el paso que sí se ve.
      const a = await pasos()
      const claves = a.pasos.map((p) => p.clave)

      expect(claves).toContain('tipo_persona')
      expect(claves).not.toContain('rec')
    })

    it('a una persona física no se le pide REC: responde ella misma', async () => {
      await registrarTipoPersona(db, { sesion, tipo: 'fisica' })

      const a = await pasos()
      expect(a.pasos.map((p) => p.clave)).not.toContain('rec')

      await expect(
        designarRec(db, { sesion, rfc: RFC_A, nombre: 'Juan Pérez', fecha: ayer(3) }),
      ).rejects.toThrow(NoAplicaDesignacion)
    })

    it('a una persona moral sí, y a un fideicomiso también', async () => {
      await registrarTipoPersona(db, { sesion, tipo: 'moral' })
      expect((await pasos()).pasos.map((p) => p.clave)).toContain('rec')

      await registrarTipoPersona(db, { sesion, tipo: 'fideicomiso' })
      expect((await pasos()).pasos.map((p) => p.clave)).toContain('rec')
    })
  })

  describe('designar no es tener REC', () => {
    beforeEach(async () => {
      await registrarTipoPersona(db, { sesion, tipo: 'moral' })
    })

    it('con la designación PENDIENTE, el paso del arranque sigue sin cumplirse', async () => {
      // EL CASO CENTRAL. Si este se pusiera verde, el portal le estaría diciendo
      // a un administrador que ya no responde personalmente — y el Art. 20 ¶2
      // dice que sí.
      await designarRec(db, { sesion, rfc: RFC_A, nombre: 'Juan Pérez', fecha: ayer(5) })

      const a = await pasos()
      const rec = a.pasos.find((p) => p.clave === 'rec')

      expect(rec?.hecho).toBe(false)
      expect((await leer()).pendiente?.rfc).toBe(RFC_A)
      expect((await leer()).vigente).toBeNull()
    })

    it('y con la aceptación registrada, entonces sí', async () => {
      const id = await designarRec(db, {
        sesion,
        rfc: RFC_A,
        nombre: 'Juan Pérez',
        fecha: ayer(5),
      })
      await registrarRespuestaRec(db, {
        sesion,
        designacionId: id,
        respuesta: 'aceptada',
        fecha: ayer(2),
      })

      const a = await pasos()
      expect(a.pasos.find((p) => p.clave === 'rec')?.hecho).toBe(true)

      const estado = await leer()
      expect(estado.vigente?.rfc).toBe(RFC_A)
      expect(estado.vigente?.fechaRespuesta).toBe(ayer(2))
      expect(estado.pendiente).toBeNull()
    })

    it('el RECHAZO tampoco cumple el paso, y se distingue de no haber designado', async () => {
      // Art. 10 ¶4: «El rechazo de la referida designación no libera a quien la
      // realizó del cumplimiento de las obligaciones». Un rechazo que se
      // pareciera a «sin designar» borraría el hecho de que alguien ya dijo que
      // no — que es justo lo que el obligado tiene que resolver.
      const id = await designarRec(db, {
        sesion,
        rfc: RFC_A,
        nombre: 'Juan Pérez',
        fecha: ayer(5),
      })
      await registrarRespuestaRec(db, {
        sesion,
        designacionId: id,
        respuesta: 'rechazada',
        fecha: ayer(1),
      })

      const a = await pasos()
      expect(a.pasos.find((p) => p.clave === 'rec')?.hecho).toBe(false)

      const estado = await leer()
      expect(estado.rechazada?.rfc).toBe(RFC_A)
      expect(estado.vigente).toBeNull()
      expect(estado.pendiente).toBeNull()
    })
  })

  describe('lo que no se puede escribir', () => {
    beforeEach(async () => {
      await registrarTipoPersona(db, { sesion, tipo: 'moral' })
    })

    it('un REC que no es persona física', async () => {
      // Art. 10 ¶5. El RFC de 12 caracteres es de persona moral.
      await expect(
        designarRec(db, { sesion, rfc: 'MOR010101AAA', nombre: 'Otra SA', fecha: ayer(1) }),
      ).rejects.toThrow(DatoDelRecInvalido)
    })

    it('dos designaciones esperando respuesta a la vez', async () => {
      await designarRec(db, { sesion, rfc: RFC_A, nombre: 'Juan Pérez', fecha: ayer(5) })

      await expect(
        designarRec(db, { sesion, rfc: RFC_B, nombre: 'Ana López', fecha: ayer(1) }),
      ).rejects.toThrow(RelevoExigeSustituir)
    })

    it('un segundo REC aceptado sin sustituir al primero', async () => {
      // Sin esto, el índice único de la base lo detendría igual —y con un error
      // que no dice qué hacer—. Detenerlo antes es lo que convierte una falla en
      // una instrucción.
      const primero = await designarRec(db, {
        sesion,
        rfc: RFC_A,
        nombre: 'Juan Pérez',
        fecha: ayer(9),
      })
      await registrarRespuestaRec(db, {
        sesion,
        designacionId: primero,
        respuesta: 'aceptada',
        fecha: ayer(8),
      })

      const segundo = await designarRec(db, {
        sesion,
        rfc: RFC_B,
        nombre: 'Ana López',
        fecha: ayer(3),
      })

      await expect(
        registrarRespuestaRec(db, {
          sesion,
          designacionId: segundo,
          respuesta: 'aceptada',
          fecha: ayer(1),
        }),
      ).rejects.toThrow(RelevoExigeSustituir)

      // Y con la sustitución registrada, el relevo sí entra.
      await sustituirRec(db, { sesion, designacionId: primero })
      await registrarRespuestaRec(db, {
        sesion,
        designacionId: segundo,
        respuesta: 'aceptada',
        fecha: ayer(1),
      })

      expect((await leer()).vigente?.rfc).toBe(RFC_B)
    })

    it('un capturista no designa ni responde', async () => {
      // El REC no es un rol de la aplicación, pero registrarlo es configuración
      // del obligado, y eso lo firma un administrador.
      await expect(
        designarRec(db, {
          sesion: capturista,
          rfc: RFC_A,
          nombre: 'Juan Pérez',
          fecha: ayer(1),
        }),
      ).rejects.toThrow()
    })
  })

  it('el RFC y el nombre NUNCA entran a la bitácora', async () => {
    // REGLA DURA 3. La bitácora se exporta, se reconstruye y se enseña a la
    // autoridad; los datos personales viven en su tabla, con RLS. Este caso
    // existe porque la tentación de guardar «quién» en el evento es enorme.
    await registrarTipoPersona(db, { sesion, tipo: 'moral' })
    const id = await designarRec(db, {
      sesion,
      rfc: RFC_A,
      nombre: 'Juan Pérez Gómez',
      fecha: ayer(4),
    })
    await registrarRespuestaRec(db, {
      sesion,
      designacionId: id,
      respuesta: 'aceptada',
      fecha: ayer(2),
    })

    const { rows } = await db.query(
      `select evento, datos::text from bitacora
        where tenant_id = $1 and evento like 'rec.%'`,
      [sesion.tenantId],
    )
    const eventos = rows as Array<{ evento: string; datos: string }>

    expect(eventos.map((e) => e.evento).sort()).toEqual(['rec.aceptada', 'rec.designado'])
    for (const e of eventos) {
      expect(e.datos).not.toContain(RFC_A)
      expect(e.datos).not.toContain('Juan')
      expect(e.datos).not.toContain('Pérez')
    }
  })
})
