import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import { arranqueDelObligado } from '../../src/persistencia/arranque'
import {
  DatoDeEstructuraInvalido,
  NoAplicaEstructura,
  capturarIntegrante,
  darDeBajaIntegrante,
  estadoDeLaEstructura,
  registrarEnvio,
  registrarFigura,
  type DatosFigura,
} from '../../src/persistencia/estructura'

const FIGURA: DatosFigura = {
  tipoFigura: 'fideicomiso',
  numeroReferencia: 'F-2020/318',
  fechaConstitucion: '2020-01-15',
  rfc: 'FID200115AB1',
  cotizaEnBolsa: false,
  fideicomisariosDeterminados: true,
}

/**
 * El ciclo del Art. 10 Sexies de punta a punta: capturar → enviar → baja →
 * corregir. La base garantiza que solo avanza; esto prueba que la capa de
 * persistencia lo recorre con evidencia y sin datos personales en la bitácora.
 */
describe('La estructura del obligado (Cap. II Ter)', () => {
  let db: Client
  let admin: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
    await db.query(`update tenants set tipo_persona = 'fideicomiso' where id = $1`, [
      admin.tenantId,
    ])
  })

  const estado = (sesion: ContextoSesion) =>
    enTransaccionDeSesion(db, sesion, () => estadoDeLaEstructura(db, { sesion }))

  it('a una persona moral no le aplica, y el error dice cuál es su anexo', async () => {
    await db.query(`update tenants set tipo_persona = 'moral' where id = $1`, [admin.tenantId])
    await expect(registrarFigura(db, { sesion: admin, figura: FIGURA })).rejects.toThrow(
      NoAplicaEstructura,
    )
  })

  it('captura la estructura, registra el envío, y el arranque lo refleja', async () => {
    await registrarFigura(db, { sesion: admin, figura: FIGURA })

    await capturarIntegrante(db, {
      sesion: admin,
      integrante: {
        papel: 'fiduciario',
        naturaleza: 'moral',
        denominacion: 'Banco Fiduciario SA',
        fechaConstitucion: '1990-05-01',
        paisNacionalidad: 'MX',
        rfc: 'BFI900501AB1',
      },
    })
    await capturarIntegrante(db, {
      sesion: admin,
      integrante: {
        papel: 'delegado_fiduciario',
        naturaleza: 'fisica',
        primerApellido: 'Canul',
        nombres: 'Delegada',
        fechaNacimiento: '1985-03-10',
        paisNacionalidad: 'MX',
        paisNacimiento: 'MX',
        rfc: 'CAMD850310AB1',
      },
    })
    // La recursión aplanada: un fideicomitente que es a su vez fideicomiso
    // entra con sus 4 datos de identificación, no con su estructura.
    await capturarIntegrante(db, {
      sesion: admin,
      integrante: {
        papel: 'fideicomitente',
        naturaleza: 'fideicomiso',
        numeroReferencia: 'F-2015/044',
        fechaConstitucion: '2015-11-11',
        denominacionFiduciario: 'Otra Fiduciaria SA',
        rfc: 'FAN151111AB1',
      },
    })

    const antes = await estado(admin)
    expect(antes.figura?.tipoFigura).toBe('fideicomiso')
    expect(antes.integrantes).toHaveLength(3)
    // Capturar no es haber tramitado: el envío al SAT todavía no ocurre.
    expect(antes.enviadaCompleta).toBe(false)

    const arranqueAntes = await enTransaccionDeSesion(db, admin, () =>
      arranqueDelObligado(db, { sesion: admin }),
    )
    const pasoAntes = arranqueAntes.pasos.find((x) => x.clave === 'estructura')
    expect(pasoAntes?.hecho).toBe(false)

    const { enviados } = await registrarEnvio(db, { sesion: admin, fecha: '2026-08-17' })
    expect(enviados).toBe(3)

    const despues = await estado(admin)
    expect(despues.enviadaCompleta).toBe(true)
    expect(despues.integrantes.every((x) => x.estado === 'enviado')).toBe(true)

    const arranqueDespues = await enTransaccionDeSesion(db, admin, () =>
      arranqueDelObligado(db, { sesion: admin }),
    )
    expect(arranqueDespues.pasos.find((x) => x.clave === 'estructura')?.hecho).toBe(true)
    // Y el REC sigue aplicando: el fideicomiso también designa (Art. 20).
    expect(arranqueDespues.pasos.some((x) => x.clave === 'rec')).toBe(true)
  })

  it('corregir es baja + captura nueva, nunca al revés', async () => {
    await registrarFigura(db, { sesion: admin, figura: FIGURA })
    const { integranteId } = await capturarIntegrante(db, {
      sesion: admin,
      integrante: {
        papel: 'fideicomitente',
        naturaleza: 'moral',
        denominacion: 'Promotora Con Error SA',
        fechaConstitucion: '2010-02-02',
        paisNacionalidad: 'MX',
        rfc: 'PCE100202AB1',
      },
    })
    await registrarEnvio(db, { sesion: admin, fecha: '2026-08-17' })

    const corregido = {
      papel: 'fideicomitente' as const,
      naturaleza: 'moral' as const,
      denominacion: 'Promotora Corregida SA',
      fechaConstitucion: '2010-02-02',
      paisNacionalidad: 'MX',
      rfc: 'PCO100202AB1',
    }

    // Sin la baja previa, el ¶4 no se cumple y la captura no entra.
    await expect(
      capturarIntegrante(db, { sesion: admin, integrante: corregido, corrigeA: integranteId }),
    ).rejects.toThrow(/baja/)

    await darDeBajaIntegrante(db, { sesion: admin, integranteId, fecha: '2026-08-18' })
    await capturarIntegrante(db, {
      sesion: admin,
      integrante: corregido,
      corrigeA: integranteId,
    })

    const e = await estado(admin)
    // La historia queda entera: la fila con error sigue ahí, dada de baja.
    expect(e.integrantes).toHaveLength(2)
    expect(e.integrantes.find((x) => x.id === integranteId)?.estado).toBe('baja')
    const nueva = e.integrantes.find((x) => x.corrigeA === integranteId)
    expect(nueva?.denominacion).toBe('Promotora Corregida SA')
    // Y hay un capturado pendiente: el reenvío del ¶4 todavía no se registra.
    expect(e.enviadaCompleta).toBe(false)

    const { enviados } = await registrarEnvio(db, { sesion: admin, fecha: '2026-08-19' })
    expect(enviados).toBe(1)
    expect((await estado(admin)).enviadaCompleta).toBe(true)
  })

  it('REGLA DURA 3: la bitácora registra papeles y fechas, nunca a las personas', async () => {
    await registrarFigura(db, { sesion: admin, figura: FIGURA })
    await capturarIntegrante(db, {
      sesion: admin,
      integrante: {
        papel: 'delegado_fiduciario',
        naturaleza: 'fisica',
        primerApellido: 'Identificable',
        nombres: 'Persona',
        fechaNacimiento: '1985-03-10',
        paisNacionalidad: 'MX',
        paisNacimiento: 'MX',
        rfc: 'IDEN850310AB1',
      },
    })
    await registrarEnvio(db, { sesion: admin, fecha: '2026-08-17' })

    const ev = await db.query(
      `select evento, datos::text as datos from bitacora
        where tenant_id = $1 and evento like 'estructura.%' order by secuencia`,
      [admin.tenantId],
    )
    expect(ev.rows.map((r) => (r as { evento: string }).evento)).toEqual([
      'estructura.figura_registrada',
      'estructura.integrante_capturado',
      'estructura.envio_registrado',
    ])
    for (const fila of ev.rows as { datos: string }[]) {
      expect(fila.datos).not.toContain('Identificable')
      expect(fila.datos).not.toContain('IDEN850310')
      expect(fila.datos).not.toContain('F-2020/318')
    }
  })

  it('la pregunta IV.i manda: sin fideicomisarios determinados no entra ninguno', async () => {
    await registrarFigura(db, {
      sesion: admin,
      figura: { ...FIGURA, fideicomisariosDeterminados: false },
    })
    await expect(
      capturarIntegrante(db, {
        sesion: admin,
        integrante: {
          papel: 'fideicomisario',
          naturaleza: 'fisica',
          primerApellido: 'Ek',
          nombres: 'Beneficiaria',
          fechaNacimiento: '1970-07-07',
          paisNacionalidad: 'MX',
          paisNacimiento: 'MX',
          rfc: 'EKBE700707AB1',
        },
      }),
    ).rejects.toThrow(/determinados/)
  })

  it('una captura a medias no llega a la base, y el mensaje dice qué falta', async () => {
    await registrarFigura(db, { sesion: admin, figura: FIGURA })
    await expect(
      capturarIntegrante(db, {
        sesion: admin,
        integrante: { papel: 'fideicomitente', naturaleza: 'fisica', rfc: 'TRUN800101AB1' },
      }),
    ).rejects.toThrow(DatoDeEstructuraInvalido)
    await expect(
      registrarFigura(db, {
        sesion: admin,
        // Sin la respuesta de bolsa: el spread quita la propiedad de verdad,
        // que es lo que exactOptionalPropertyTypes exige.
        figura: (({ cotizaEnBolsa: _bolsa, ...resto }) => resto)(FIGURA),
      }),
    ).rejects.toThrow(/bolsa/)
  })

  it('la figura es una sola por obligado', async () => {
    await registrarFigura(db, { sesion: admin, figura: FIGURA })
    await expect(registrarFigura(db, { sesion: admin, figura: FIGURA })).rejects.toThrow()
  })
})
