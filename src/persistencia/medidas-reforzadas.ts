import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  coberturaDeMedidas,
  exigenciaDeMedidas,
  problemasDeLasMedidas,
  type CoberturaDeMedidas,
  type ExigenciaDeMedidas,
  type FraccionReforzada,
  type MedidasACapturar,
  type MedidasAsentadas,
  type PersonaVinculada,
  type SituacionDelGrado,
  type VinculoReforzado,
} from '../dominio/medidas-reforzadas'
import { exigibilidadDelTransitorioCuarto } from './perfil'
import { riesgoDelCliente } from './riesgo'
import { estadoPepDelCliente } from './pep'

/**
 * Las medidas reforzadas del Art. 23 Ter 4 en la base.
 *
 * Dos cosas NO se aceptan como parámetro y por eso no se pueden equivocar
 * desde la aplicación: la **fracción**, que se deriva de la clase de persona
 * del cliente, y **si aplica la fr. III**, que se deriva de si el cliente
 * tiene un vínculo PEP catalogado de ámbito extranjero. Las dos son hechos que
 * el sistema ya conoce; ofrecerlas como campo sería invitar a torcerlas.
 */

export class DatoDeMedidasInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeMedidasInvalido'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

export interface EstadoDeMedidas {
  readonly exigencia: ExigenciaDeMedidas
  readonly cobertura: CoberturaDeMedidas
  readonly historial: readonly MedidasAsentadas[]
  readonly evaluacionVigenteId: string | null
  /** Derivado del Cap. III Quáter: dispara la fr. III. */
  readonly aplicaPepExtranjera: boolean
  readonly exigibleDesde: string
  readonly anticipado: boolean
}

interface FilaMedidas {
  id: string
  fraccion: FraccionReforzada
  fecha_adopcion: string
  medidas_origen_destino: string | null
  manual_preve_personas_vinculadas: boolean | null
  informacion_accionistas: string | null
  consulta_se_fecha: string | null
  consulta_se_resultado: string | null
  consulta_se_hash_sha256: string | null
  consulta_se_archivo: string | null
  consulta_se_tamano_bytes: string | null
  consulta_se_mime: string | null
  aplica_pep_extranjera: boolean
  documentacion_pep_extranjera: string | null
  evaluacion_riesgo_id: string
  adoptadas_por: string
  registrado_en: string
}

interface FilaPersona {
  id: string
  medida_id: string
  vinculo: VinculoReforzado
  nombre: string
  datos_obtenidos: boolean
  documentacion_obtenida: boolean
  detalle: string | null
}

/**
 * ¿El cliente es Persona Políticamente Expuesta EXTRANJERA?
 *
 * Se deriva del Cap. III Quáter que ya existe: un vínculo declarado con ámbito
 * `extranjero` cuya catalogación sigue vigente. No se pregunta en el
 * formulario porque el sistema ya lo sabe, y porque la respuesta cambia sola
 * cuando corren los dos relojes del Art. 23 Quáter.
 */
async function esPepExtranjera(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<boolean> {
  const pep = await estadoPepDelCliente(db, p)
  if (pep.declaracion === null) return false
  return pep.declaracion.vinculos.some(
    (v) => v.ambito === 'extranjero' && v.catalogacion.catalogada,
  )
}

export async function estadoDeMedidasReforzadas(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<EstadoDeMedidas> {
  await exigirSesionActiva(db, p.sesion)

  const exigibleDesde = await exigibilidadDelTransitorioCuarto(db)
  const riesgo = await riesgoDelCliente(db, p)

  const cli = await db.query(
    `select tipo_persona::text as tipo_persona from clientes_finales where id = $1`,
    [p.clienteId],
  )
  const tipoPersona = (cli.rows[0] as { tipo_persona: string } | undefined)?.tipo_persona ?? ''

  const situacion: SituacionDelGrado =
    riesgo.vigente === null
      ? { conocida: false }
      : { conocida: true, esAlto: riesgo.vigente.esAlto, vencida: riesgo.vigente.vencida }

  // La declaración PEP solo existe para físicas: preguntarla de una moral es
  // pedirle a la base algo que no puede existir.
  const aplicaPepExtranjera =
    tipoPersona === 'fisica' ? await esPepExtranjera(db, p) : false

  const m = await db.query(
    `select m.id::text, m.fraccion::text as fraccion, m.fecha_adopcion::text as fecha_adopcion,
            m.medidas_origen_destino, m.manual_preve_personas_vinculadas,
            m.informacion_accionistas, m.consulta_se_fecha::text as consulta_se_fecha,
            m.consulta_se_resultado, m.consulta_se_hash_sha256, m.consulta_se_archivo,
            m.consulta_se_tamano_bytes::text as consulta_se_tamano_bytes, m.consulta_se_mime,
            m.aplica_pep_extranjera, m.documentacion_pep_extranjera,
            m.evaluacion_riesgo_id::text as evaluacion_riesgo_id,
            u.nombre as adoptadas_por, m.registrado_en::text as registrado_en
       from medidas_reforzadas m
       join usuarios u on u.id = m.adoptadas_por
      where m.tenant_id = $1 and m.cliente_id = $2
      order by m.secuencia desc`,
    [p.sesion.tenantId, p.clienteId],
  )
  const filas = m.rows as FilaMedidas[]

  const personasPorMedida = new Map<string, (PersonaVinculada & { id: string })[]>()
  if (filas.length > 0) {
    const ps = await db.query(
      `select id::text, medida_id::text as medida_id, vinculo::text as vinculo, nombre,
              datos_obtenidos, documentacion_obtenida, detalle
         from personas_vinculadas_reforzadas
        where tenant_id = $1 and medida_id = any($2::uuid[])
        order by created_at`,
      [p.sesion.tenantId, filas.map((f) => f.id)],
    )
    for (const f of ps.rows as FilaPersona[]) {
      const lista = personasPorMedida.get(f.medida_id) ?? []
      lista.push({
        id: f.id,
        vinculo: f.vinculo,
        nombre: f.nombre,
        datosObtenidos: f.datos_obtenidos,
        documentacionObtenida: f.documentacion_obtenida,
        ...(f.detalle === null ? {} : { detalle: f.detalle }),
      })
      personasPorMedida.set(f.medida_id, lista)
    }
  }

  const historial: MedidasAsentadas[] = filas.map((f) => ({
    id: f.id,
    fraccion: f.fraccion,
    fechaAdopcion: f.fecha_adopcion,
    medidasOrigenDestino: f.medidas_origen_destino,
    manualPreveVinculadas: f.manual_preve_personas_vinculadas,
    informacionAccionistas: f.informacion_accionistas,
    consultaSeFecha: f.consulta_se_fecha,
    consultaSeResultado: f.consulta_se_resultado,
    consultaSeEvidencia:
      f.consulta_se_hash_sha256 === null
        ? null
        : {
            hashSha256: f.consulta_se_hash_sha256,
            archivo: f.consulta_se_archivo ?? '',
            tamanoBytes: Number(f.consulta_se_tamano_bytes ?? '0'),
            mime: f.consulta_se_mime ?? '',
          },
    aplicaPepExtranjera: f.aplica_pep_extranjera,
    documentacionPepExtranjera: f.documentacion_pep_extranjera,
    personasVinculadas: personasPorMedida.get(f.id) ?? [],
    evaluacionRiesgoId: f.evaluacion_riesgo_id,
    adoptadasPor: f.adoptadas_por,
    registradoEn: f.registrado_en,
  }))

  return {
    exigencia: exigenciaDeMedidas({ grado: situacion, tipoPersona }),
    cobertura: coberturaDeMedidas({
      ultimas: historial[0] ?? null,
      evaluacionVigenteId: riesgo.vigente?.id ?? null,
    }),
    historial,
    evaluacionVigenteId: riesgo.vigente?.id ?? null,
    aplicaPepExtranjera,
    exigibleDesde,
    anticipado: p.hoy < exigibleDesde,
  }
}

export async function asentarMedidasReforzadas(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    datos: MedidasACapturar
    hoy: string
  },
): Promise<{ medidaId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDeMedidasReforzadas(db, {
      sesion: p.sesion,
      clienteId: p.clienteId,
      hoy: p.hoy,
    })

    switch (estado.exigencia.estado) {
      case 'no_exigible':
        throw new DatoDeMedidasInvalido([
          'El Art. 23 Ter 4 solo pide medidas reforzadas cuando el Grado de Riesgo del cliente ' +
            'es alto, y consta que no lo es.',
        ])
      case 'indeterminable':
        throw new DatoDeMedidasInvalido([
          'Todavía no se puede saber si el Art. 23 Ter 4 exige medidas para este cliente: ' +
            'falta clasificar su Grado de Riesgo.',
        ])
      case 'sin_fraccion':
        throw new DatoDeMedidasInvalido([
          `El Art. 23 Ter 4 nombra personas físicas (fr. I) y morales (fr. II). Este cliente es ` +
            `«${estado.exigencia.tipoPersona}», y el artículo no lo nombra. Asentar medidas bajo ` +
            'una fracción que no le corresponde fabricaría evidencia de cumplir una regla que ' +
            'quizá no existe.',
        ])
      case 'exigible':
        break
    }

    const fraccion = estado.exigencia.fraccion
    const problemas = problemasDeLasMedidas({
      fraccion,
      aplicaPepExtranjera: estado.aplicaPepExtranjera,
      datos: p.datos,
    })
    if (problemas.length > 0) throw new DatoDeMedidasInvalido(problemas)

    const evaluacionId = estado.evaluacionVigenteId
    if (evaluacionId === null) {
      throw new DatoDeMedidasInvalido([
        'No se encontró la clasificación vigente, aunque la exigencia dice que el grado es alto.',
      ])
    }

    const ev = p.datos.consultaSeEvidencia
    const esFisica = fraccion === 'fisica'
    const { rows } = await db.query(
      `insert into medidas_reforzadas
         (tenant_id, cliente_id, evaluacion_riesgo_id, fraccion, fecha_adopcion,
          medidas_origen_destino, manual_preve_personas_vinculadas,
          informacion_accionistas, consulta_se_fecha, consulta_se_resultado,
          consulta_se_hash_sha256, consulta_se_archivo, consulta_se_tamano_bytes,
          consulta_se_mime, aplica_pep_extranjera, documentacion_pep_extranjera,
          adoptadas_por)
       values ($1,$2,$3,$4::fraccion_reforzada,$5::date,$6,$7,$8,$9::date,$10,
               $11,$12,$13,$14,$15,$16,$17)
       returning id::text`,
      [
        p.sesion.tenantId,
        p.clienteId,
        evaluacionId,
        fraccion,
        p.datos.fechaAdopcion,
        esFisica ? (p.datos.medidasOrigenDestino ?? '').trim() : null,
        esFisica ? (p.datos.manualPreveVinculadas ?? false) : null,
        esFisica ? null : (p.datos.informacionAccionistas ?? '').trim(),
        esFisica ? null : (p.datos.consultaSeFecha ?? null),
        esFisica ? null : (p.datos.consultaSeResultado ?? '').trim(),
        ev?.hashSha256 ?? null,
        ev?.archivo ?? null,
        ev?.tamanoBytes ?? null,
        ev?.mime ?? null,
        estado.aplicaPepExtranjera,
        p.datos.documentacionPepExtranjera?.trim() ?? null,
        p.sesion.usuarioId,
      ],
    )
    const medidaId = (rows[0] as { id: string }).id

    // Las personas van DESPUÉS, y por eso el trigger de la fr. III es
    // diferido: comprobarlas en el INSERT de arriba diría siempre que faltan.
    for (const persona of p.datos.personasVinculadas ?? []) {
      await db.query(
        `insert into personas_vinculadas_reforzadas
           (tenant_id, medida_id, vinculo, nombre, datos_obtenidos, documentacion_obtenida, detalle)
         values ($1,$2,$3::vinculo_reforzado,$4,$5,$6,$7)`,
        [
          p.sesion.tenantId,
          medidaId,
          persona.vinculo,
          persona.nombre.trim(),
          persona.datosObtenidos,
          persona.documentacionObtenida,
          persona.detalle ?? null,
        ],
      )
    }

    return { medidaId }
  })
}
