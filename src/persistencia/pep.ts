import type { Client } from 'pg'
import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import { catalogacionPep, type CatalogacionPep } from '../dominio/pep'

/**
 * La declaración PEP del cliente (Art. 23 Quáter del Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ ES Y QUÉ NO ES
 * ────────────────────────────────────────────────────────────────────────────
 * Es el registro de QUÉ DECLARÓ el cliente: su propia función pública, o la de
 * alguien de su red (¶3 — cónyuge, concubinato, parentesco hasta 2º grado,
 * socios con vínculos patrimoniales). Con eso, la vigencia del carácter PEP se
 * DERIVA con los dos relojes del dominio — nunca se captura como casilla.
 *
 * NO es screening. La consulta oficial es «Consulta PEP 2.0» de la UIF, con la
 * e.firma del obligado (Art. 23 Quáter 1), disponible el 30-ago-2027. VIZO no
 * consulta listas, no resuelve si alguien es PEP y no descarta coincidencias:
 * registra declaraciones y decisiones humanas (`ALCANCE.md` §0).
 *
 * El ciclo del registro es el de la evidencia: la captura entra completa o no
 * entra (la coherencia resultado↔vínculos la valida la base al commit), la
 * revisión del admin la congela, y corregir es declarar de nuevo.
 */

export type ResultadoDeclaracion = 'niega' | 'pep_por_funcion' | 'pep_asimilada'
export type TipoVinculo =
  | 'titular'
  | 'conyuge'
  | 'concubinato'
  | 'consanguinidad'
  | 'afinidad'
  | 'socio_patrimonial'

export interface VinculoDeclarado {
  tipo: TipoVinculo
  /** Solo parentesco (consanguinidad/afinidad): «hasta el segundo grado». */
  grado?: 1 | 2
  /** La persona con la función pública. Para 'titular' es el propio cliente. */
  nombrePep?: string
  cargo: string
  ambito: 'nacional' | 'extranjero'
  pais?: string
  enFunciones: boolean
  fechaCese?: string
  /** Para 'socio_patrimonial': la persona moral por la que existe el vínculo. */
  detalle?: string
}

export interface VinculoRegistrado extends VinculoDeclarado {
  id: string
  catalogacion: CatalogacionPep
}

export interface EstadoPep {
  declaracion: {
    id: string
    resultado: ResultadoDeclaracion
    fechaDeclaracion: string
    capturadaPor: string
    revisadaPor: string | null
    revisadaEn: string | null
    vinculos: VinculoRegistrado[]
  } | null
  /** Derivado a `hoy` con los relojes del catálogo. */
  catalogado: boolean
  motivo: 'sin_declaracion' | 'declaro_que_no' | 'por_funcion' | 'asimilada' | 'relojes_vencidos'
  /** Desde cuándo es exigible la regla del catálogo (Transitorio Primero). */
  exigibleDesde: string
  /** `hoy` es anterior a `exigibleDesde`: vista anticipada, como la Constancia. */
  anticipada: boolean
}

export class DeclaracionPepInvalida extends Error {
  constructor(problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DeclaracionPepInvalida'
  }
}

export class CatalogoPepIncompleto extends Error {
  constructor(clave: string) {
    super(
      `El catálogo no tiene la regla "${clave}" y sin ella no se puede derivar la vigencia del ` +
        'carácter PEP. Se detiene en vez de suponer una ventana: la regla se siembra con su ' +
        'fuente del DOF, no se adivina (regla dura 1).',
    )
    this.name = 'CatalogoPepIncompleto'
  }
}

export class RevisionPepImposible extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'RevisionPepImposible'
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Los mismos requisitos que la base garantiza, dichos de forma que una persona
 * pueda atenderlos. Si alguna vez dejaran de coincidir, gana la base.
 */
function problemasDeLaDeclaracion(
  resultado: ResultadoDeclaracion,
  vinculos: VinculoDeclarado[],
): string[] {
  const problemas: string[] = []
  const titulares = vinculos.filter((v) => v.tipo === 'titular').length

  if (resultado === 'niega' && vinculos.length > 0) {
    problemas.push('Si el cliente declaró que no, no debe capturarse ningún vínculo.')
  }
  if (resultado === 'pep_por_funcion' && titulares === 0) {
    problemas.push(
      'PEP por función exige capturar la función del propio cliente (el vínculo «titular»): ' +
        'cargo, ámbito y si sigue en funciones.',
    )
  }
  if (resultado === 'pep_asimilada' && (titulares > 0 || vinculos.length === 0)) {
    problemas.push(
      'Asimilada significa que la función pública la tiene alguien de la red del cliente: ' +
        'captura al menos un vínculo, y ninguno puede ser «titular».',
    )
  }
  if (titulares > 1) {
    problemas.push('Solo puede haber un vínculo «titular»: el propio cliente es una sola persona.')
  }

  vinculos.forEach((v, i) => {
    const donde = `Vínculo ${String(i + 1)}:`
    if (v.cargo.trim().length < 3) {
      problemas.push(`${donde} falta el cargo o función pública.`)
    }
    if (v.tipo === 'consanguinidad' || v.tipo === 'afinidad') {
      if (v.grado !== 1 && v.grado !== 2) {
        problemas.push(
          `${donde} el parentesco exige el grado (1 o 2) — el Art. 23 Quáter ¶3 llega «hasta el segundo grado».`,
        )
      }
    } else if (v.grado !== undefined) {
      problemas.push(`${donde} el grado solo aplica a consanguinidad o afinidad.`)
    }
    if (v.tipo === 'titular' && v.nombrePep !== undefined) {
      problemas.push(`${donde} el titular es el propio cliente; su nombre ya está en el expediente.`)
    }
    if (v.tipo !== 'titular' && (v.nombrePep === undefined || v.nombrePep.trim().length < 3)) {
      problemas.push(`${donde} falta el nombre de la persona con la función pública.`)
    }
    if (v.ambito === 'extranjero' && (v.pais === undefined || v.pais.trim() === '')) {
      problemas.push(`${donde} una función pública extranjera exige el país.`)
    }
    if (v.ambito === 'nacional' && v.pais !== undefined) {
      problemas.push(`${donde} el país solo aplica al ámbito extranjero.`)
    }
    if (v.enFunciones && v.fechaCese !== undefined) {
      problemas.push(`${donde} si sigue en funciones no puede tener fecha de cese.`)
    }
    if (!v.enFunciones && (v.fechaCese === undefined || !FECHA.test(v.fechaCese))) {
      problemas.push(
        `${donde} si dejó el cargo hace falta la fecha de cese (AAAA-MM-DD) — de ella cuelgan los dos relojes del Art. 23 Quáter.`,
      )
    }
    if (v.tipo === 'socio_patrimonial' && (v.detalle === undefined || v.detalle.trim() === '')) {
      problemas.push(`${donde} el vínculo de socio exige nombrar a la persona moral.`)
    }
  })

  return problemas
}

/** Registra lo que el cliente declaró. La red entra completa o no entra. */
export async function registrarDeclaracionPep(
  db: Client,
  p: {
    sesion: ContextoSesion
    clienteId: string
    resultado: ResultadoDeclaracion
    fechaDeclaracion: string
    vinculos: VinculoDeclarado[]
  },
): Promise<{ declaracionId: string }> {
  if (!FECHA.test(p.fechaDeclaracion)) {
    throw new DeclaracionPepInvalida(['La fecha de la declaración debe tener la forma AAAA-MM-DD.'])
  }
  const problemas = problemasDeLaDeclaracion(p.resultado, p.vinculos)
  if (problemas.length > 0) {
    throw new DeclaracionPepInvalida(problemas)
  }

  return enTransaccionDeSesion(db, p.sesion, async () => {
    const d = await db.query(
      `insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
       values ($1, $2, $3::resultado_declaracion_pep, $4::date, $5) returning id::text`,
      [p.sesion.tenantId, p.clienteId, p.resultado, p.fechaDeclaracion, p.sesion.usuarioId],
    )
    const declaracionId = (d.rows[0] as { id: string }).id

    for (const v of p.vinculos) {
      await db.query(
        `insert into vinculos_pep
           (tenant_id, declaracion_id, tipo, grado, nombre_pep, cargo, ambito, pais, en_funciones, fecha_cese, detalle)
         values ($1, $2, $3::vinculo_pep, $4, $5, $6, $7::ambito_funcion_publica, $8, $9, $10::date, $11)`,
        [
          p.sesion.tenantId,
          declaracionId,
          v.tipo,
          v.grado ?? null,
          v.nombrePep?.trim() ?? null,
          v.cargo.trim(),
          v.ambito,
          v.pais?.trim() ?? null,
          v.enFunciones,
          v.fechaCese ?? null,
          v.detalle?.trim() ?? null,
        ],
      )
    }

    // REGLA DURA 3: ni nombres ni cargos en la bitácora — identifican personas.
    // El hecho, su fecha y el tamaño de la red; el contenido vive bajo RLS.
    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'pep.declarada',
      'declaracion_pep',
      declaracionId,
      JSON.stringify({
        resultado: p.resultado,
        vinculos: p.vinculos.length,
        fecha_declaracion: p.fechaDeclaracion,
      }),
      p.sesion.usuarioId,
    ])

    return { declaracionId }
  })
}

/** La revisión del admin: congela la declaración y su red. Una sola vez. */
export async function revisarDeclaracionPep(
  db: Client,
  p: { sesion: ContextoSesion; declaracionId: string; hoy: string },
): Promise<void> {
  if (!FECHA.test(p.hoy)) {
    throw new RevisionPepImposible('La fecha de la revisión debe tener la forma AAAA-MM-DD.')
  }

  await enTransaccionDeSesion(db, p.sesion, async () => {
    const r = await db.query(
      `update declaraciones_pep
          set revisada_por = $2, revisada_en = $3::date
        where id = $1 and revisada_en is null`,
      [p.declaracionId, p.sesion.usuarioId, p.hoy],
    )

    if (r.rowCount === 0) {
      const existe = await db.query(
        `select revisada_en::text from declaraciones_pep where id = $1`,
        [p.declaracionId],
      )
      const fila = existe.rows[0] as { revisada_en: string | null } | undefined
      if (fila === undefined) {
        throw new RevisionPepImposible('Esa declaración no existe en tu obligado.')
      }
      if (fila.revisada_en === null) {
        // La fila existe y sigue sin revisión: el UPDATE no la alcanzó por la
        // política RLS, que solo deja revisar al admin.
        throw new RevisionPepImposible(
          'Solo un administrador registra la revisión de una declaración PEP: es la decisión que la congela como evidencia.',
        )
      }
      throw new RevisionPepImposible(
        `Esta declaración ya fue revisada el ${fila.revisada_en} y la revisión no se repite: si algo cambió, se captura una declaración nueva.`,
      )
    }

    await db.query('select app.bitacora_registrar($1,$2,$3,$4,$5::jsonb,$6)', [
      p.sesion.tenantId,
      'pep.revisada',
      'declaracion_pep',
      p.declaracionId,
      JSON.stringify({ fecha_revision: p.hoy }),
      p.sesion.usuarioId,
    ])
  })
}

interface FilaRegla {
  clave: string
  regla: string
  vigente: string
}

/**
 * Las reglas del catálogo, con su vigencia.
 *
 * Antes del 30-nov-2026 no hay fila vigente: se toma la PRÓXIMA y se marca
 * `anticipada` — el mismo criterio que la Constancia, que enseña el estado con
 * el aviso de que todavía no es exigible, en vez de esconderlo o suponerlo.
 */
async function reglasDeVigencia(
  db: EjecutorSql,
  hoy: string,
): Promise<{ trasCese: string; trasActo: string; exigibleDesde: string; anticipada: boolean }> {
  const { rows } = await db.query(
    `select clave, valor #>> '{}' as regla, vigente_desde::text as vigente
       from parametros_motor
      where actividad_id is null
        and clave in ('pep_vigencia_tras_cese', 'pep_vigencia_tras_acto')`,
  )

  const elegir = (clave: string): FilaRegla => {
    const filas = (rows as FilaRegla[]).filter((r) => r.clave === clave)
    if (filas.length === 0) throw new CatalogoPepIncompleto(clave)

    const vigentes = filas
      .filter((r) => r.vigente <= hoy)
      .sort((a, b) => b.vigente.localeCompare(a.vigente))
    if (vigentes.length > 0) return vigentes[0] as FilaRegla

    return filas.sort((a, b) => a.vigente.localeCompare(b.vigente))[0] as FilaRegla
  }

  const cese = elegir('pep_vigencia_tras_cese')
  const acto = elegir('pep_vigencia_tras_acto')
  const exigibleDesde = cese.vigente > acto.vigente ? cese.vigente : acto.vigente

  return {
    trasCese: cese.regla,
    trasActo: acto.regla,
    exigibleDesde,
    anticipada: hoy < exigibleDesde,
  }
}

interface FilaDeclaracion {
  id: string
  resultado: ResultadoDeclaracion
  fecha_declaracion: string
  capturada_por: string
  revisada_por: string | null
  revisada_en: string | null
}

interface FilaVinculo {
  id: string
  tipo: TipoVinculo
  grado: number | null
  nombre_pep: string | null
  cargo: string
  ambito: 'nacional' | 'extranjero'
  pais: string | null
  en_funciones: boolean
  fecha_cese: string | null
  detalle: string | null
}

/** La última declaración del cliente y la catalogación derivada a `hoy`. */
export async function estadoPepDelCliente(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<EstadoPep> {
  await exigirSesionActiva(db, p.sesion)
  const reglas = await reglasDeVigencia(db, p.hoy)
  const base = { exigibleDesde: reglas.exigibleDesde, anticipada: reglas.anticipada }

  const d = await db.query(
    `select id::text, resultado::text as resultado, fecha_declaracion::text as fecha_declaracion,
            capturada_por::text as capturada_por,
            revisada_por::text as revisada_por, revisada_en::text as revisada_en
       from declaraciones_pep
      where cliente_id = $1
      order by fecha_declaracion desc, created_at desc
      limit 1`,
    [p.clienteId],
  )
  const decl = d.rows[0] as FilaDeclaracion | undefined
  if (decl === undefined) {
    return { declaracion: null, catalogado: false, motivo: 'sin_declaracion', ...base }
  }

  const v = await db.query(
    `select id::text, tipo::text as tipo, grado, nombre_pep, cargo,
            ambito::text as ambito, pais, en_funciones, fecha_cese::text as fecha_cese, detalle
       from vinculos_pep
      where declaracion_id = $1
      order by created_at`,
    [decl.id],
  )

  // Los actos con el cliente son el ancla del ¶5: operar con una PEP recién
  // cesada reinicia el reloj desde el acto.
  const a = await db.query(
    `select fecha_operacion::text as fecha from operaciones where cliente_id = $1`,
    [p.clienteId],
  )
  const fechasDeActos = (a.rows as { fecha: string }[]).map((f) => f.fecha)

  const vinculos: VinculoRegistrado[] = (v.rows as FilaVinculo[]).map((f) => ({
    id: f.id,
    tipo: f.tipo,
    ...(f.grado === null ? {} : { grado: f.grado as 1 | 2 }),
    ...(f.nombre_pep === null ? {} : { nombrePep: f.nombre_pep }),
    cargo: f.cargo,
    ambito: f.ambito,
    ...(f.pais === null ? {} : { pais: f.pais }),
    enFunciones: f.en_funciones,
    ...(f.fecha_cese === null ? {} : { fechaCese: f.fecha_cese }),
    ...(f.detalle === null ? {} : { detalle: f.detalle }),
    catalogacion: catalogacionPep({
      funcion: { ambito: f.ambito, enFunciones: f.en_funciones, fechaCese: f.fecha_cese },
      fecha: p.hoy,
      fechasDeActos,
      reglas: { trasCese: reglas.trasCese, trasActo: reglas.trasActo },
    }),
  }))

  const titularVigente = vinculos.some((x) => x.tipo === 'titular' && x.catalogacion.catalogada)
  const algunoVigente = vinculos.some((x) => x.catalogacion.catalogada)

  return {
    declaracion: {
      id: decl.id,
      resultado: decl.resultado,
      fechaDeclaracion: decl.fecha_declaracion,
      capturadaPor: decl.capturada_por,
      revisadaPor: decl.revisada_por,
      revisadaEn: decl.revisada_en,
      vinculos,
    },
    catalogado: algunoVigente,
    motivo:
      decl.resultado === 'niega'
        ? 'declaro_que_no'
        : titularVigente
          ? 'por_funcion'
          : algunoVigente
            ? 'asimilada'
            : 'relojes_vencidos',
    ...base,
  }
}
