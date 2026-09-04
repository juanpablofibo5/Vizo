import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  DatoDeBeneficiarioInvalido,
  estadoDelBeneficiario,
  identificarBeneficiarioControlador,
  registrarExcepcion,
  umbralDeControl,
  completarPisoDelBeneficiario,
  pisoDeLosBeneficiarios,
  pisoExigido,
  sustentosDeLaIdentificacion,
  vincularSustento,
} from '../../src/persistencia/beneficiario-controlador'
import type { InsumosBeneficiarioControlador } from '../../src/dominio/beneficiario-controlador'

/**
 * El Cap. III Quinquies sobre la base real.
 *
 * Lo que protege: que el camino quede asentado completo —no solo quién ganó—,
 * que el umbral y su borde salgan del catálogo y se congelen en la fila, que
 * reidentificar sustituya sin borrar, y que la vía y sus hijos no se puedan
 * contradecir. Esto último solo se puede probar aquí: el disparador es
 * DIFERIDO y las aserciones de la migración revierten antes del COMMIT.
 */
describe('El procedimiento del Art. 23 Quinquies', () => {
  let db: Client
  let sesion: ContextoSesion
  let clienteId: string
  let marca: string

  const HOY = '2027-06-15'
  const FECHA = '2027-06-10'

  beforeAll(async () => { db = await conectar() })
  afterAll(async () => { await db.end() })

  beforeEach(async () => {
    marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    sesion = await crearTenantConUsuario(db, marca, 'admin')
    const { rows } = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                     requiere_revision_identidad, domicilio)
       values ($1,'moral','Cliente Moral SA de CV',$2,false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId, `CMS${marca.slice(0, 6)}XY9`],
    )
    clienteId = (rows[0] as { id: string }).id
  })

  const estado = () =>
    enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, { sesion, clienteId, hoy: HOY }),
    )

  const moral = (insumos: {
    tenencias?: Array<{ titularId: string; porcentaje: number }>
    control?: Array<{ titularId: string; medio: string }>
    funcionarios?: Array<{ titularId: string; cargo: string; rango: number }>
  }): InsumosBeneficiarioControlador => ({
    sujeto: {
      tipo: 'persona_moral',
      insumos: {
        tenenciasCapital: (insumos.tenencias ?? []).map((t) => ({
          titularId: t.titularId, esGrupo: false, porcentaje: t.porcentaje, via: 'directa' as const,
        })),
        controlPorOtrosMedios: (insumos.control ?? []).map((c) => ({
          titularId: c.titularId, esGrupo: false, medio: c.medio,
          areasControladas: ['toma_de_decisiones' as const],
        })),
        funcionariosAltaDireccion: (insumos.funcionarios ?? []).map((f) => ({
          titularId: f.titularId, esGrupo: false, cargo: f.cargo, rango: f.rango,
        })),
      },
    },
  })

  it('EL UMBRAL Y SU BORDE SALEN DEL CATÁLOGO, no del código', async () => {
    const u = await enTransaccionDeSesion(db, sesion, () => umbralDeControl(db, HOY))
    expect(u.umbralControlPct).toBe(25)
    expect(u.umbralControlInclusivo).toBe(true)
    expect(u.exigibleDesde).toBe('2027-03-01')
    expect(u.anticipado).toBe(false)
  })

  it('antes del 1 de marzo de 2027 es VISTA ANTICIPADA, no ausencia', async () => {
    const u = await enTransaccionDeSesion(db, sesion, () => umbralDeControl(db, '2026-09-02'))
    expect(u.anticipado).toBe(true)
    expect(u.umbralControlPct).toBe(25)
  })

  it('la fracción I resuelve, y el camino guarda que ahí se detuvo', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: moral({ tenencias: [{ titularId: 't1', porcentaje: 40 }] }),
        identidades: { t1: { nombre: 'Ana Socia Mayoritaria', rfc: 'SOMA800101AB1' } },
      },
    })

    const e = await estado()
    expect(e.vigente?.via).toBe('prelacion_persona_moral')
    expect(e.vigente?.pasos.map((p) => [p.fraccion, p.resultado])).toEqual([['I', 'encontrado']])
    expect(e.vigente?.hallazgos).toHaveLength(1)
    expect(e.vigente?.hallazgos[0]?.nombre).toBe('Ana Socia Mayoritaria')
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('I')
  })

  it('EL AGOTAMIENTO QUEDA ESCRITO: llegar a la III deja rastro de la I y la II', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        // Nadie llega al 25% y nadie controla por otros medios.
        insumos: moral({
          tenencias: [{ titularId: 't1', porcentaje: 12 }, { titularId: 't2', porcentaje: 11 }],
          funcionarios: [{ titularId: 't9', cargo: 'Director General', rango: 1 }],
        }),
        identidades: { t9: { nombre: 'Director General' } },
      },
    })

    const e = await estado()
    expect(e.vigente?.pasos.map((p) => `${p.fraccion}:${p.resultado}`)).toEqual([
      'I:no_encontrado', 'II:no_encontrado', 'III:encontrado',
    ])
    // Y el motivo de cada «no encontrado» está, que es lo que lo hace auditable.
    expect(e.vigente?.pasos[0]?.motivo).toMatch(/25/)
    expect(e.vigente?.pasos[1]?.motivo).toMatch(/otros medios/)
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('III')
  })

  it('el borde del umbral es DATO: en 25.00% exacto entra por la fr. I', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: moral({ tenencias: [{ titularId: 't1', porcentaje: 25 }] }),
        identidades: { t1: { nombre: 'Justo en el borde' } },
      },
    })
    const e = await estado()
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('I')
    // Y quedó congelado con qué borde se decidió.
    expect(e.vigente?.umbralPct).toBe(25)
    expect(e.vigente?.umbralInclusivo).toBe(true)
  })

  it('la tenencia directa y la indirecta del mismo titular SE SUMAN', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: {
          sujeto: {
            tipo: 'persona_moral',
            insumos: {
              tenenciasCapital: [
                { titularId: 't1', esGrupo: false, porcentaje: 18, via: 'directa' },
                { titularId: 't1', esGrupo: false, porcentaje: 13, via: 'indirecta',
                  intermediarioId: 'interpuesta' },
              ],
              controlPorOtrosMedios: [],
              funcionariosAltaDireccion: [],
            },
          },
        },
        identidades: { t1: { nombre: 'Suma 31 por dos vías' } },
      },
    })
    const e = await estado()
    expect(e.vigente?.hallazgos[0]?.fraccion).toBe('I')
  })

  it('REIDENTIFICAR SUSTITUYE, NO BORRA: la anterior queda entera en el historial', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: moral({ tenencias: [{ titularId: 't1', porcentaje: 40 }] }),
        identidades: { t1: { nombre: 'El de antes' } },
      },
    })
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: '2027-09-01',
        insumos: moral({ tenencias: [{ titularId: 't2', porcentaje: 60 }] }),
        identidades: { t2: { nombre: 'El de ahora' } },
      },
    })

    const e = await estado()
    expect(e.vigente?.hallazgos[0]?.nombre).toBe('El de ahora')
    expect(e.historial).toHaveLength(1)
    expect(e.historial[0]?.hallazgos[0]?.nombre).toBe('El de antes')
    expect(e.historial[0]?.estado).toBe('sustituida')
  })

  it('un titular determinado SIN IDENTIDAD no se guarda con un nombre inventado', async () => {
    await expect(
      identificarBeneficiarioControlador(db, {
        sesion, hoy: HOY,
        datos: {
          clienteId, fechaIdentificacion: FECHA,
          insumos: moral({ tenencias: [{ titularId: 'sin-nombre', porcentaje: 40 }] }),
          identidades: {},
        },
      }),
    ).rejects.toThrow(/no se dijo quién es/)
  })

  it('la excepción del Art. 23 Quinquies 2 la registra el obligado, el motor NO la evalúa', async () => {
    await expect(
      identificarBeneficiarioControlador(db, {
        sesion, hoy: HOY,
        datos: {
          clienteId, fechaIdentificacion: FECHA,
          insumos: {
            excepcion: { tipo: 'bolsa_reconocida', detalle: 'Cotiza en la BMV' },
            ...moral({ tenencias: [{ titularId: 't1', porcentaje: 40 }] }),
          },
          identidades: { t1: { nombre: 'No debería llegar aquí' } },
        },
      }),
    ).rejects.toThrow(/no está contrastado/)
  })

  it('LA BOLSA EXIGE LA CLAVE DE PIZARRA: el texto la condiciona con «siempre que»', async () => {
    await expect(
      registrarExcepcion(db, {
        sesion, clienteId, fechaIdentificacion: FECHA, tipo: 'bolsa_de_valores', hoy: HOY,
      }),
    ).rejects.toBeInstanceOf(DatoDeBeneficiarioInvalido)

    await registrarExcepcion(db, {
      sesion, clienteId, fechaIdentificacion: FECHA, tipo: 'bolsa_de_valores',
      clavePizarra: 'GMEXICOB', hoy: HOY,
    })
    const e = await estado()
    expect(e.vigente?.via).toBe('excepcion')
    expect(e.vigente?.excepcion?.clavePizarra).toBe('GMEXICOB')
    expect(e.vigente?.pasos).toEqual([])
  })

  it('EL DISPARADOR DIFERIDO: una identificación por excepción sin excepción muere al COMMIT', async () => {
    // Esto no lo puede probar la migración: sus aserciones revierten antes del
    // COMMIT y un trigger diferido nunca llega a dispararse ahí.
    await expect(
      enTransaccionDeSesion(db, sesion, async () => {
        await db.query(
          `insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                            umbral_pct, umbral_inclusivo, determinada_por)
           values ($1,$2,'excepcion',$3::date,25,true,$4)`,
          [sesion.tenantId, clienteId, FECHA, sesion.usuarioId],
        )
      }),
    ).rejects.toThrow(/exactamente una excepción/)
  })

  it('y una por prelación sin ningún paso, también', async () => {
    await expect(
      enTransaccionDeSesion(db, sesion, async () => {
        await db.query(
          `insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                            umbral_pct, umbral_inclusivo, determinada_por)
           values ($1,$2,'prelacion_persona_moral',$3::date,25,true,$4)`,
          [sesion.tenantId, clienteId, FECHA, sesion.usuarioId],
        )
      }),
    ).rejects.toThrow(/fracciones evaluadas/)
  })

  it('el fideicomiso NO usa el orden de prelación: es control efectivo, con su rol', async () => {
    const { rows } = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                     requiere_revision_identidad, domicilio)
       values ($1,'fideicomiso','Fideicomiso F/1234','FID270101AB1',false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId],
    )
    const fideicomisoId = (rows[0] as { id: string }).id

    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId: fideicomisoId, fechaIdentificacion: FECHA,
        insumos: {
          sujeto: {
            tipo: 'fideicomiso',
            insumos: {
              partes: [
                {
                  titularId: 'f1', rol: 'fideicomitente', tipoPersona: 'fisica',
                  facultades: {
                    disponerAdministrarDirigirBienes: false,
                    instruirAutorizarDistribuciones: true,
                    modificarOExtinguirFideicomiso: false,
                    nombrarORemoverAdministracion: false,
                    imponerDecisionesDeOperacionOAdministracion: false,
                  },
                },
              ],
            },
          },
        },
        identidades: { f1: { nombre: 'Quien instruye las distribuciones' } },
      },
    })

    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, { sesion, clienteId: fideicomisoId, hoy: HOY }),
    )
    expect(e.vigente?.via).toBe('control_efectivo_fideicomiso')
    expect(e.vigente?.pasos).toEqual([])
    expect(e.vigente?.hallazgos[0]?.rol).toBe('fideicomitente')
    expect(e.vigente?.hallazgos[0]?.fraccion).toBeNull()
  })

  it('EL PISO SALE DE DOS CATÁLOGOS: los numerales del Acuerdo, su texto del otro', async () => {
    const e = await enTransaccionDeSesion(db, sesion, () => pisoExigido(db, HOY))
    expect(e.numerales).toEqual(['i', 'ii', 'iv', 'ix'])
    // Las etiquetas no las escribe el módulo del piso: vienen de
    // `campos_expediente`, con su propia fuente y su propio pendiente.
    expect(e.etiquetas['ii']).toMatch(/[Ff]echa/)
    expect(e.etiquetas['iv']).toMatch(/[Nn]acionalidad|[Pp]aís/)
  })

  it('el Art. 12 fr. VII: identificar no basta, hay que recabar sus datos', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: moral({ tenencias: [{ titularId: 't1', porcentaje: 40 }] }),
        identidades: { t1: { nombre: 'Sin piso todavía' } },
      },
    })

    let p = await enTransaccionDeSesion(db, sesion, () =>
      pisoDeLosBeneficiarios(db, { sesion, clienteId, hoy: HOY }),
    )
    expect(p.porBeneficiario).toHaveLength(1)
    expect(p.porBeneficiario[0]?.completo).toBe(false)
    // Falta la fecha de nacimiento, la nacionalidad y el ix): tres de cuatro.
    expect(p.porBeneficiario[0]?.datos.filter((d) => !d.presente)).toHaveLength(3)

    const beneficiarioId = p.porBeneficiario[0]?.beneficiarioId ?? ''
    await completarPisoDelBeneficiario(db, {
      sesion, beneficiarioId,
      fechaNacimiento: '1980-01-15', nacionalidad: 'mx', curp: 'PEFI800115HYNRSN01',
    })

    p = await enTransaccionDeSesion(db, sesion, () =>
      pisoDeLosBeneficiarios(db, { sesion, clienteId, hoy: HOY }),
    )
    expect(p.porBeneficiario[0]?.completo).toBe(true)
  })

  it('completar el piso NO BORRA lo que ya estaba', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: moral({ tenencias: [{ titularId: 't1', porcentaje: 40 }] }),
        identidades: { t1: { nombre: 'Con RFC de origen', rfc: 'PEFI800115AB1' } },
      },
    })
    const p0 = await enTransaccionDeSesion(db, sesion, () =>
      pisoDeLosBeneficiarios(db, { sesion, clienteId, hoy: HOY }),
    )
    const beneficiarioId = p0.porBeneficiario[0]?.beneficiarioId ?? ''

    // Se manda solo la nacionalidad: el RFC no puede perderse en el camino.
    await completarPisoDelBeneficiario(db, { sesion, beneficiarioId, nacionalidad: 'MX' })

    const { rows } = await db.query(
      `select rfc, nacionalidad from beneficiarios_controladores where id = $1`,
      [beneficiarioId],
    )
    expect((rows[0] as { rfc: string | null }).rfc).toBe('PEFI800115AB1')
    expect((rows[0] as { nacionalidad: string | null }).nacionalidad).toBe('MX')
  })

  it('la nacionalidad en prosa se rechaza con un mensaje, no con un check_violation', async () => {
    await identificarBeneficiarioControlador(db, {
      sesion, hoy: HOY,
      datos: {
        clienteId, fechaIdentificacion: FECHA,
        insumos: moral({ tenencias: [{ titularId: 't1', porcentaje: 40 }] }),
        identidades: { t1: { nombre: 'Alguien' } },
      },
    })
    const p = await enTransaccionDeSesion(db, sesion, () =>
      pisoDeLosBeneficiarios(db, { sesion, clienteId, hoy: HOY }),
    )
    await expect(
      completarPisoDelBeneficiario(db, {
        sesion,
        beneficiarioId: p.porBeneficiario[0]?.beneficiarioId ?? '',
        nacionalidad: 'Mexicana',
      }),
    ).rejects.toThrow(/código de país/)
  })

  describe('La documentación que sustenta el procedimiento (Art. 23 Quinquies)', () => {
    /** Sube un documento al expediente del cliente, como lo haría el portal. */
    const documentoDe = async (cliente: string, ruta: string, hash: string) => {
      const act = await db.query(`select id from actividades_vulnerables where fraccion='V_BIS'`)
      const e = await db.query(
        `insert into expedientes (tenant_id, cliente_id, actividad_id, version)
         values ($1,$2,$3,1)
         on conflict (tenant_id, cliente_id, actividad_id, version) do update set version = 1
         returning id::text`,
        [sesion.tenantId, cliente, (act.rows[0] as { id: string }).id],
      )
      const d = await db.query(
        `insert into documentos (tenant_id, expediente_id, campo, storage_path, hash_sha256,
                                 tamano_bytes, mime, subido_por)
         values ($1,$2,'acta_constitutiva',$3,$4,1024,'application/pdf',$5)
         returning id::text`,
        [sesion.tenantId, (e.rows[0] as { id: string }).id, ruta, hash, sesion.usuarioId],
      )
      return (d.rows[0] as { id: string }).id
    }

    const identificar = async () => {
      await identificarBeneficiarioControlador(db, {
        sesion, hoy: HOY,
        datos: {
          clienteId, fechaIdentificacion: FECHA,
          insumos: moral({
            tenencias: [{ titularId: 't1', porcentaje: 12 }],
            funcionarios: [{ titularId: 't9', cargo: 'Director General', rango: 1 }],
          }),
          identidades: { t9: { nombre: 'Director General' } },
        },
      })
      const e = await estado()
      return e.vigente
    }

    it('un documento del cliente se cuelga del paso que respalda', async () => {
      const ident = await identificar()
      const documentoId = await documentoDe(clienteId, `bc/${marca}/libro.pdf`, 'a'.repeat(64))
      const pasoI = ident?.pasos.find((x) => x.fraccion === 'I')

      await vincularSustento(db, {
        sesion,
        identificacionId: ident?.id ?? '',
        documentoId,
        pasoId: pasoI?.id,
        nota: 'Libro de accionistas: la mayor tenencia es 12%',
      })

      const s = await enTransaccionDeSesion(db, sesion, () =>
        sustentosDeLaIdentificacion(db, { sesion, identificacionId: ident?.id ?? '' }),
      )
      expect(s).toHaveLength(1)
      expect(s[0]?.pasoId).toBe(pasoI?.id)
      expect(s[0]?.nombreArchivo).toBe('libro.pdf')
      expect(s[0]?.nota).toMatch(/12%/)
    })

    it('EL DOCUMENTO DE OTRO CLIENTE NO SE PUEDE COLGAR, y lo dice en español', async () => {
      const ident = await identificar()
      const otro = await db.query(
        `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                       requiere_revision_identidad, domicilio)
         values ($1,'moral','Otro cliente',$2,false,
                 '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                   "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
         returning id::text`,
        [sesion.tenantId, `OTR${marca.slice(0, 6)}XY9`],
      )
      const ajeno = await documentoDe(
        (otro.rows[0] as { id: string }).id, `bc/${marca}/ajeno.pdf`, 'b'.repeat(64),
      )

      await expect(
        vincularSustento(db, {
          sesion, identificacionId: ident?.id ?? '', documentoId: ajeno,
          nota: 'Del expediente equivocado',
        }),
      ).rejects.toThrow(/expediente de otro cliente/)
    })

    it('sin decir qué prueba, no se vincula', async () => {
      const ident = await identificar()
      const documentoId = await documentoDe(clienteId, `bc/${marca}/sinnota.pdf`, 'c'.repeat(64))
      await expect(
        vincularSustento(db, {
          sesion, identificacionId: ident?.id ?? '', documentoId, nota: '   ',
        }),
      ).rejects.toThrow(/qué prueba este documento/)
    })

    it('el mismo documento SÍ puede sustentar dos partes distintas del camino', async () => {
      // Un acta puede probar la tenencia y nombrar al funcionario a la vez.
      const ident = await identificar()
      const documentoId = await documentoDe(clienteId, `bc/${marca}/acta.pdf`, 'd'.repeat(64))
      const pasoI = ident?.pasos.find((x) => x.fraccion === 'I')
      const hallazgo = ident?.hallazgos[0]

      await vincularSustento(db, {
        sesion, identificacionId: ident?.id ?? '', documentoId, pasoId: pasoI?.id,
        nota: 'Prueba la tenencia',
      })
      await vincularSustento(db, {
        sesion, identificacionId: ident?.id ?? '', documentoId, hallazgoId: hallazgo?.id,
        nota: 'Y nombra al funcionario',
      })

      const s = await enTransaccionDeSesion(db, sesion, () =>
        sustentosDeLaIdentificacion(db, { sesion, identificacionId: ident?.id ?? '' }),
      )
      expect(s).toHaveLength(2)
    })

    it('PERO NO DOS VECES DEL MISMO LUGAR — y ahí los NULL engañan', async () => {
      // Sin `nulls not distinct`, dos vínculos al procedimiento entero —ambos
      // con paso y hallazgo nulos— pasarían como filas distintas.
      const ident = await identificar()
      const documentoId = await documentoDe(clienteId, `bc/${marca}/dup.pdf`, 'e'.repeat(64))

      await vincularSustento(db, {
        sesion, identificacionId: ident?.id ?? '', documentoId, nota: 'Sustenta el procedimiento',
      })
      await expect(
        vincularSustento(db, {
          sesion, identificacionId: ident?.id ?? '', documentoId, nota: 'Otra vez',
        }),
      ).rejects.toThrow(/ya está vinculado/)
    })
  })

  it('a una persona física no se le pide este procedimiento', async () => {
    const { rows } = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, curp,
                                     requiere_revision_identidad, domicilio)
       values ($1,'fisica','Persona Física','PEFI800101HYNRSN01',false,
               '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro",
                 "municipio":"31","entidad":"31","pais":"MX"}'::jsonb)
       returning id::text`,
      [sesion.tenantId],
    )
    const e = await enTransaccionDeSesion(db, sesion, () =>
      estadoDelBeneficiario(db, {
        sesion, clienteId: (rows[0] as { id: string }).id, hoy: HOY,
      }),
    )
    expect(e.requiere).toBe(false)
  })
})
