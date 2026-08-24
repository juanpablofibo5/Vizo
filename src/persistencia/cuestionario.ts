import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  coberturaDelCuestionario,
  exigenciaDeCuestionario,
  problemasDelCuestionario,
  type CoberturaDelCuestionario,
  type CuestionarioACapturar,
  type CuestionarioAsentado,
  type ExigenciaDeCuestionario,
  type ModalidadCuestionario,
  type SituacionDelGrado,
} from '../dominio/cuestionario'
import { exigibilidadDelTransitorioCuarto } from './perfil'
import { riesgoDelCliente } from './riesgo'

/**
 * Los cuestionarios del Art. 23 Ter 3 en la base.
 *
 * Este módulo no vuelve a leer el artículo: la exigencia la resuelve
 * `exigenciaDeCuestionario` y las reglas duras las impone la migración. Aquí
 * se traen los hechos, se traducen los errores de Postgres a algo atendible, y
 * se asienta lo capturado.
 */

/** Igual que en los módulos de al lado: la transacción la abre quien escribe. */
export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

export class DatoDeCuestionarioInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeCuestionarioInvalido'
  }
}

const COLUMNAS = `c.id::text, c.modalidad::text as modalidad,
       c.fecha_aplicacion::text as fecha_aplicacion,
       c.actividad_preponderante, c.origen_recursos, c.destino_recursos,
       c.actos_que_realiza, c.actos_que_pretende, c.respuestas_del_manual,
       c.suscrito_por, c.firma_hash_sha256, c.firma_archivo,
       c.firma_tamano_bytes::text as firma_tamano_bytes, c.firma_mime,
       c.evaluacion_riesgo_id::text as evaluacion_riesgo_id,
       u.nombre as aplicado_por, c.registrado_en::text as registrado_en`

interface FilaCuestionario {
  id: string
  modalidad: ModalidadCuestionario
  fecha_aplicacion: string
  actividad_preponderante: string
  origen_recursos: string
  destino_recursos: string
  actos_que_realiza: string
  actos_que_pretende: string
  respuestas_del_manual: Record<string, string>
  suscrito_por: string
  firma_hash_sha256: string | null
  firma_archivo: string | null
  firma_tamano_bytes: string | null
  firma_mime: string | null
  evaluacion_riesgo_id: string
  aplicado_por: string
  registrado_en: string
}

function aCuestionario(f: FilaCuestionario): CuestionarioAsentado {
  return {
    id: f.id,
    modalidad: f.modalidad,
    fechaAplicacion: f.fecha_aplicacion,
    actividadPreponderante: f.actividad_preponderante,
    origenRecursos: f.origen_recursos,
    destinoRecursos: f.destino_recursos,
    actosQueRealiza: f.actos_que_realiza,
    actosQuePretende: f.actos_que_pretende,
    respuestasDelManual: f.respuestas_del_manual,
    suscritoPor: f.suscrito_por,
    // Los cuatro campos van juntos o no va ninguno — lo garantiza un CHECK de
    // la migración—, así que basta preguntar por el hash.
    firma:
      f.firma_hash_sha256 === null
        ? null
        : {
            hashSha256: f.firma_hash_sha256,
            archivo: f.firma_archivo ?? '',
            tamanoBytes: Number(f.firma_tamano_bytes ?? '0'),
            mime: f.firma_mime ?? '',
          },
    evaluacionRiesgoId: f.evaluacion_riesgo_id,
    aplicadoPor: f.aplicado_por,
    registradoEn: f.registrado_en,
  }
}

export interface EstadoDelCuestionario {
  readonly exigencia: ExigenciaDeCuestionario
  readonly cobertura: CoberturaDelCuestionario
  /** Append-only: del más reciente al primero. */
  readonly historial: readonly CuestionarioAsentado[]
  /** La clasificación vigente, que es lo que un cuestionario nuevo citaría. */
  readonly evaluacionVigenteId: string | null
  readonly exigibleDesde: string
  readonly anticipado: boolean
}

export async function estadoDelCuestionario(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<EstadoDelCuestionario> {
  await exigirSesionActiva(db, p.sesion)

  const exigibleDesde = await exigibilidadDelTransitorioCuarto(db)
  const riesgo = await riesgoDelCliente(db, {
    sesion: p.sesion,
    clienteId: p.clienteId,
    hoy: p.hoy,
  })

  const situacion: SituacionDelGrado =
    riesgo.vigente === null
      ? { conocida: false }
      : { conocida: true, esAlto: riesgo.vigente.esAlto, vencida: riesgo.vigente.vencida }

  const { rows } = await db.query(
    `select ${COLUMNAS}
       from cuestionarios_riesgo_alto c
       join usuarios u on u.id = c.aplicado_por
      where c.tenant_id = $1 and c.cliente_id = $2
      order by c.secuencia desc`,
    [p.sesion.tenantId, p.clienteId],
  )
  const historial = (rows as FilaCuestionario[]).map(aCuestionario)

  return {
    exigencia: exigenciaDeCuestionario(situacion),
    cobertura: coberturaDelCuestionario({
      ultimo: historial[0] ?? null,
      evaluacionVigenteId: riesgo.vigente?.id ?? null,
    }),
    historial,
    evaluacionVigenteId: riesgo.vigente?.id ?? null,
    exigibleDesde,
    anticipado: p.hoy < exigibleDesde,
  }
}

/**
 * Asienta un cuestionario.
 *
 * `evaluacionRiesgoId` NO llega como parámetro: se toma de la clasificación
 * vigente del cliente. Es el mismo criterio que en la aprobación del Art. 23
 * Ter 5 — que no se pueda pasar es lo que impide asentar un cuestionario
 * citando la clasificación equivocada desde la aplicación. La base además lo
 * hace inexpresable con la FK compuesta, pero la primera línea es no ofrecer
 * el campo.
 */
export async function asentarCuestionario(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    datos: CuestionarioACapturar
    hoy: string
  },
): Promise<{ cuestionarioId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const estado = await estadoDelCuestionario(db, {
      sesion: p.sesion,
      clienteId: p.clienteId,
      hoy: p.hoy,
    })

    if (estado.exigencia.estado === 'no_exigible') {
      throw new DatoDeCuestionarioInvalido([
        'El Art. 23 Ter 3 solo exige cuestionario cuando el Grado de Riesgo del cliente es ' +
          'alto, y consta que no lo es. Asentar uno diría que sí era exigible.',
      ])
    }
    if (estado.exigencia.estado === 'indeterminable') {
      throw new DatoDeCuestionarioInvalido([
        'Todavía no se puede saber si el Art. 23 Ter 3 exige cuestionario para este cliente: ' +
          'falta clasificar su Grado de Riesgo. Sin clasificación no hay a qué evaluación ' +
          'atarlo, y un cuestionario suelto no acredita nada.',
      ])
    }

    const problemas = problemasDelCuestionario(p.datos)
    if (problemas.length > 0) throw new DatoDeCuestionarioInvalido(problemas)

    // No puede ser null: `exigible` implica que hay clasificación vigente.
    const evaluacionId = estado.evaluacionVigenteId
    if (evaluacionId === null) {
      throw new DatoDeCuestionarioInvalido([
        'No se encontró la clasificación vigente del cliente, aunque la exigencia dice que es ' +
          'de grado alto. Es un estado incoherente: no se asienta nada.',
      ])
    }

    const f = p.datos.firma
    const { rows } = await db.query(
      `insert into cuestionarios_riesgo_alto
         (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
          actividad_preponderante, origen_recursos, destino_recursos,
          actos_que_realiza, actos_que_pretende, respuestas_del_manual,
          suscrito_por, firma_hash_sha256, firma_archivo, firma_tamano_bytes,
          firma_mime, aplicado_por)
       values ($1,$2,$3,$4::modalidad_cuestionario,$5::date,$6,$7,$8,$9,$10,
               $11::jsonb,$12,$13,$14,$15,$16,$17)
       returning id::text`,
      [
        p.sesion.tenantId,
        p.clienteId,
        evaluacionId,
        p.datos.modalidad,
        p.datos.fechaAplicacion,
        p.datos.actividadPreponderante.trim(),
        p.datos.origenRecursos.trim(),
        p.datos.destinoRecursos.trim(),
        p.datos.actosQueRealiza.trim(),
        p.datos.actosQuePretende.trim(),
        JSON.stringify(p.datos.respuestasDelManual ?? {}),
        p.datos.suscritoPor.trim(),
        f?.hashSha256 ?? null,
        f?.archivo ?? null,
        f?.tamanoBytes ?? null,
        f?.mime ?? null,
        p.sesion.usuarioId,
      ],
    )

    return { cuestionarioId: (rows[0] as { id: string }).id }
  })
}
