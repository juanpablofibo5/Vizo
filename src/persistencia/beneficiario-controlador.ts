import type { EjecutorSql } from '../catalogo/cargador'
import { enTransaccionDeSesion, exigirSesionActiva, type ContextoSesion } from './transaccion'
import {
  pisoDelBeneficiario,
  type PisoDelBeneficiario,
} from '../dominio/piso-beneficiario'
import {
  determinarBeneficiarioControlador,
  ExcepcionSinContrastar,
  InsumoIncoherente,
  type ConfiguracionBeneficiarioControlador,
  type DeterminacionPersonaMoral,
  type FraccionPrelacion,
  type InsumosBeneficiarioControlador,
  type PasoPrelacion,
  type RolFideicomiso,
} from '../dominio/beneficiario-controlador'

/**
 * El Cap. III Quinquies en la base (Arts. 23 Quinquies a 23 Quinquies 2).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE ESTE MÓDULO Y QUÉ NO
 * ────────────────────────────────────────────────────────────────────────────
 * El motor —`src/dominio/beneficiario-controlador.ts`— ya decidía quién es el
 * Beneficiario Controlador y por qué fracción se llegó a esa persona. Lo que
 * faltaba es lo que el párrafo de cierre del artículo exige de verdad:
 * **documentar el procedimiento seguido** y conservarlo diez años. Eso es lo
 * que hace este módulo — corre el motor y asienta su camino completo, no solo
 * su resultado.
 *
 * Tres cosas no las decide nunca:
 *
 * 1. **El umbral ni su borde**: los dos salen del catálogo y se congelan en la
 *    fila. Sin snapshot, una determinación de 2027 no se podría reconstruir en
 *    2029 si el número cambió — y reconstruirla es la mitad de la obligación.
 * 2. **La excepción del Art. 23 Quinquies 2**: se registra lo que el obligado
 *    declara y se exige la clave de pizarra que el texto pide; ninguna regla
 *    decide sola que un cliente cae en el Anexo 7-A o 7 Bis-A, porque el texto
 *    de esos anexos no está contrastado.
 * 3. **A quién se identifica**: la identidad vive en
 *    `beneficiarios_controladores`, que ya es el sujeto del screening. Aquí se
 *    guarda cómo se llegó a ella, no otra copia de quién es.
 */

export class DatoDeBeneficiarioInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(problemas.join(' '))
    this.name = 'DatoDeBeneficiarioInvalido'
  }
}

export class UmbralDeControlAusente extends Error {
  constructor(clave: string) {
    super(
      `El catálogo no tiene "${clave}" y sin él no se puede aplicar la fracción I del Art. 23 ` +
        'Quinquies. Se detiene en vez de suponer un 25%: el umbral se siembra con su fuente del ' +
        'DOF (regla dura 1), y su borde —«o más» -vs- «más del»— es parte del dato.',
    )
    this.name = 'UmbralDeControlAusente'
  }
}

export interface EjecutorTransaccional extends EjecutorSql {
  query: EjecutorSql['query']
}

// ─────────────────────────────────────────────────────────────────────────
// El umbral, del catálogo
// ─────────────────────────────────────────────────────────────────────────

export interface UmbralDeControl extends ConfiguracionBeneficiarioControlador {
  readonly exigibleDesde: string
  readonly anticipado: boolean
}

async function parametro(db: EjecutorSql, clave: string): Promise<{ valor: unknown; desde: string }> {
  const { rows } = await db.query(
    `select valor, vigente_desde::text as desde
       from parametros_motor
      where clave = $1 and actividad_id is null
      order by vigente_desde desc limit 1`,
    [clave],
  )
  const f = rows[0] as { valor: unknown; desde: string } | undefined
  if (f === undefined) throw new UmbralDeControlAusente(clave)
  return f
}

/**
 * El umbral de la fr. I y su borde.
 *
 * Antes del 1 de marzo de 2027 (Transitorio Cuarto) no hay fila vigente: se
 * toma la próxima y se marca `anticipado`, el mismo criterio del Cap. XII y
 * del Cap. III Quáter. Identificar al Beneficiario Controlador antes de que
 * sea exigible no es un error — el Art. 23 Quinquies 1 pide hacerlo antes del
 * acto, y los actos no esperan al calendario del regulador.
 */
export async function umbralDeControl(db: EjecutorSql, hoy: string): Promise<UmbralDeControl> {
  const pct = await parametro(db, 'beneficiario_umbral_control_pct')
  const inclusivo = await parametro(db, 'beneficiario_umbral_inclusivo')
  return {
    umbralControlPct: Number(pct.valor),
    umbralControlInclusivo: inclusivo.valor === true,
    exigibleDesde: pct.desde,
    anticipado: hoy < pct.desde,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Lectura: el procedimiento asentado
// ─────────────────────────────────────────────────────────────────────────

export interface PasoAsentado {
  readonly id: string
  readonly fraccion: FraccionPrelacion
  readonly resultado: 'encontrado' | 'no_encontrado'
  readonly motivo: string | null
}

export interface HallazgoAsentado {
  readonly id: string
  readonly beneficiarioId: string
  readonly nombre: string
  readonly fraccion: FraccionPrelacion | null
  readonly rol: RolFideicomiso | null
  readonly base: string
  /** Cuando el hallazgo era persona moral y hubo que descender (23 Quinquies 1 ¶2). */
  readonly descensoId: string | null
}

export interface ExcepcionAsentada {
  readonly tipo: string
  readonly clavePizarra: string | null
  readonly detalle: string | null
}

export interface IdentificacionAsentada {
  readonly id: string
  readonly via: 'prelacion_persona_moral' | 'control_efectivo_fideicomiso'
    | 'declaracion_persona_fisica' | 'excepcion'
  readonly fechaIdentificacion: string
  readonly estado: 'vigente' | 'sustituida'
  readonly umbralPct: number
  readonly umbralInclusivo: boolean
  readonly pasos: readonly PasoAsentado[]
  readonly hallazgos: readonly HallazgoAsentado[]
  readonly excepcion: ExcepcionAsentada | null
  readonly desciendeDeHallazgoId: string | null
  readonly createdAt: string
}

export interface EstadoBeneficiarioControlador {
  readonly clienteId: string
  readonly requiere: boolean
  readonly vigente: IdentificacionAsentada | null
  /** Las del descenso, colgando de un hallazgo de la vigente. */
  readonly descensos: readonly IdentificacionAsentada[]
  readonly historial: readonly IdentificacionAsentada[]
  readonly umbral: UmbralDeControl
  /**
   * La documentación que sustenta la identificación VIGENTE.
   *
   * Solo la vigente: el historial se puede abrir y leer, pero lo que hay que
   * completar es lo de ahora.
   */
  readonly sustentos: readonly SustentoAsentado[]
  /** Art. 12 fr. VII ¶2: identificar no basta, hay que recabar sus datos. */
  readonly piso: {
    readonly exigido: PisoExigido
    readonly porBeneficiario: readonly PisoDelBeneficiario[]
  }
}

interface FilaIdent {
  id: string
  via: IdentificacionAsentada['via']
  fecha_identificacion: string
  estado: 'vigente' | 'sustituida'
  umbral_pct: string
  umbral_inclusivo: boolean
  desciende_de_hallazgo_id: string | null
  created_at: string
}

/**
 * Todo el procedimiento de un cliente: la vigente, sus descensos y el
 * historial de las sustituidas.
 *
 * Las sustituidas se leen y se enseñan a propósito. «Mantenerlos actualizados
 * durante la vigencia de la Relación de negocios» solo se puede demostrar
 * si se ve que hubo una anterior y cuándo dejó de serlo.
 */
export async function estadoDelBeneficiario(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<EstadoBeneficiarioControlador> {
  await exigirSesionActiva(db, p.sesion)
  const umbral = await umbralDeControl(db, p.hoy)

  const cli = await db.query(
    `select tipo_persona::text as tipo from clientes_finales where tenant_id = $1 and id = $2`,
    [p.sesion.tenantId, p.clienteId],
  )
  const tipo = (cli.rows[0] as { tipo: string } | undefined)?.tipo
  if (tipo === undefined) {
    throw new DatoDeBeneficiarioInvalido(['Ese cliente no existe en este obligado.'])
  }

  const ids = await db.query(
    `select id::text, via::text, fecha_identificacion::text, estado::text,
            umbral_pct::text, umbral_inclusivo, desciende_de_hallazgo_id::text,
            created_at::text
       from identificaciones_bc
      where tenant_id = $1 and cliente_id = $2
      order by created_at`,
    [p.sesion.tenantId, p.clienteId],
  )
  const filas = ids.rows as FilaIdent[]
  const armadas = await Promise.all(filas.map((f) => armar(db, p.sesion, f)))

  const raices = armadas.filter((i) => i.desciendeDeHallazgoId === null)
  const vigenteRaiz = raices.find((i) => i.estado === 'vigente')

  return {
    clienteId: p.clienteId,
    // El Art. 18 fr. III de la Ley lo pide de personas morales y fideicomisos.
    // A una persona física se le pregunta otra cosa (si actúa por cuenta de
    // otro), y eso no es este procedimiento.
    requiere: tipo === 'moral' || tipo === 'fideicomiso',
    vigente: vigenteRaiz ?? null,
    descensos: armadas.filter((i) => i.desciendeDeHallazgoId !== null),
    historial: raices.filter((i) => i.estado === 'sustituida'),
    umbral,
    sustentos:
      vigenteRaiz === undefined
        ? []
        : await sustentosDeLaIdentificacion(db, {
            sesion: p.sesion,
            identificacionId: vigenteRaiz.id,
          }),
    piso: await pisoDeLosBeneficiarios(db, {
      sesion: p.sesion,
      clienteId: p.clienteId,
      hoy: p.hoy,
    }),
  }
}

async function armar(
  db: EjecutorSql,
  sesion: ContextoSesion,
  f: FilaIdent,
): Promise<IdentificacionAsentada> {
  const pas = await db.query(
    `select id::text, fraccion::text, resultado::text, motivo
       from pasos_prelacion_bc where tenant_id = $1 and identificacion_id = $2
      order by fraccion`,
    [sesion.tenantId, f.id],
  )
  const hal = await db.query(
    `select h.id::text, h.beneficiario_id::text, b.nombre, h.rol::text,
            h.base, pp.fraccion::text as fraccion,
            (select i2.id::text from identificaciones_bc i2
              where i2.desciende_de_hallazgo_id = h.id) as descenso_id
       from hallazgos_bc h
       join beneficiarios_controladores b on b.id = h.beneficiario_id
       left join pasos_prelacion_bc pp on pp.id = h.paso_id
      where h.tenant_id = $1 and h.identificacion_id = $2
      order by h.created_at`,
    [sesion.tenantId, f.id],
  )
  const exc = await db.query(
    `select tipo::text, clave_pizarra, detalle from excepciones_bc
      where tenant_id = $1 and identificacion_id = $2`,
    [sesion.tenantId, f.id],
  )
  const e = exc.rows[0] as
    | { tipo: string; clave_pizarra: string | null; detalle: string | null }
    | undefined

  return {
    id: f.id,
    via: f.via,
    fechaIdentificacion: f.fecha_identificacion,
    estado: f.estado,
    // `numeric` llega como texto desde Postgres: convertirlo con `Number` en
    // el borde y no dejar pasar la cadena, que compararía como texto.
    umbralPct: Number(f.umbral_pct),
    umbralInclusivo: f.umbral_inclusivo,
    pasos: (pas.rows as Array<{ id: string; fraccion: FraccionPrelacion;
      resultado: 'encontrado' | 'no_encontrado'; motivo: string | null }>).map((r) => ({
      id: r.id, fraccion: r.fraccion, resultado: r.resultado, motivo: r.motivo,
    })),
    hallazgos: (hal.rows as Array<{ id: string; beneficiario_id: string; nombre: string;
      rol: RolFideicomiso | null; base: string; fraccion: FraccionPrelacion | null;
      descenso_id: string | null }>).map((r) => ({
      id: r.id,
      beneficiarioId: r.beneficiario_id,
      nombre: r.nombre,
      fraccion: r.fraccion,
      rol: r.rol,
      base: r.base,
      descensoId: r.descenso_id,
    })),
    excepcion: e === undefined
      ? null
      : { tipo: e.tipo, clavePizarra: e.clave_pizarra, detalle: e.detalle },
    desciendeDeHallazgoId: f.desciende_de_hallazgo_id,
    createdAt: f.created_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Escritura: correr el motor y asentar su camino
// ─────────────────────────────────────────────────────────────────────────

/**
 * Quién es cada `titularId` que el motor devuelve.
 *
 * El dominio trabaja con identificadores opacos —regla dura 3, también dentro
 * del dominio— así que quien llama es el único que sabe a qué persona
 * corresponde cada uno. Si el motor determina un titular que no viene aquí, la
 * escritura se detiene: inventar un nombre para la persona que se va a
 * reportar como Beneficiario Controlador sería el peor lugar posible para un
 * valor por omisión.
 */
export interface IdentidadDelTitular {
  readonly nombre: string
  readonly rfc?: string | undefined
  readonly curp?: string | undefined
}

export interface DatosIdentificacion {
  readonly clienteId: string
  /** «previo al acto u operación o, a más tardar, al establecer la Relación de negocios». */
  readonly fechaIdentificacion: string
  readonly insumos: InsumosBeneficiarioControlador
  readonly identidades: Readonly<Record<string, IdentidadDelTitular>>
}

export async function identificarBeneficiarioControlador(
  db: EjecutorTransaccional,
  p: { sesion: ContextoSesion; datos: DatosIdentificacion; hoy: string },
): Promise<{ identificacionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const { datos } = p
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaIdentificacion)) {
      throw new DatoDeBeneficiarioInvalido([
        'Falta la fecha de identificación. El Art. 23 Quinquies 1 la ata al acto u operación o al ' +
          'establecimiento de la Relación de negocios, no al día en que se teclea.',
      ])
    }

    const umbral = await umbralDeControl(db, p.hoy)

    let determinacion
    try {
      determinacion = determinarBeneficiarioControlador(datos.insumos, umbral)
    } catch (e) {
      // Los dos errores del motor son mensajes para el usuario, no fallas: uno
      // dice que la excepción del Art. 23 Quinquies 2 se resuelve por otra vía,
      // el otro qué insumo falta. Cualquier otra cosa sí es una falla.
      if (e instanceof ExcepcionSinContrastar || e instanceof InsumoIncoherente) {
        throw new DatoDeBeneficiarioInvalido([e.message])
      }
      throw e
    }

    const sustituyeA = await sustituirVigente(db, p.sesion, datos.clienteId)

    const via = determinacion.tipo === 'persona_moral'
      ? 'prelacion_persona_moral'
      : 'control_efectivo_fideicomiso'

    const identificacionId = await insertarIdentificacion(db, p.sesion, {
      clienteId: datos.clienteId,
      via,
      fecha: datos.fechaIdentificacion,
      umbral,
      sustituyeA,
      desciendeDeHallazgoId: null,
    })

    if (determinacion.tipo === 'persona_moral') {
      await asentarPrelacion(db, p.sesion, identificacionId, determinacion, datos)
    } else {
      for (const b of determinacion.beneficiarios) {
        const beneficiarioId = await identidadDe(db, p.sesion, datos, b.titularId, 'control_efectivo')
        const hallazgoId = await insertarHallazgo(db, p.sesion, {
          identificacionId,
          beneficiarioId,
          pasoId: null,
          rol: b.rolOriginal,
          base: b.base,
        })

        // El descenso del Art. 23 Quinquies 1 ¶2: la parte que controla era
        // persona moral, así que su identificación es OTRA fila que cuelga de
        // este hallazgo, con el orden de prelación completo aplicado sobre ella.
        if (b.caminoDescenso !== undefined) {
          const hijaId = await insertarIdentificacion(db, p.sesion, {
            clienteId: datos.clienteId,
            via: 'prelacion_persona_moral',
            fecha: datos.fechaIdentificacion,
            umbral,
            sustituyeA: null,
            desciendeDeHallazgoId: hallazgoId,
          })
          await asentarPrelacion(db, p.sesion, hijaId, b.caminoDescenso, datos)
        }
      }
    }

    return { identificacionId }
  })
}

/** Registra la excepción del Art. 23 Quinquies 2 — la vía que el motor no evalúa. */
export async function registrarExcepcion(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    clienteId: string
    fechaIdentificacion: string
    tipo: 'bolsa_de_valores' | 'anexo_4bis' | 'anexo_6bis' | 'anexo_7a' | 'anexo_7bisa'
    clavePizarra?: string | undefined
    detalle?: string | undefined
    hoy: string
  },
): Promise<{ identificacionId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const clave = (p.clavePizarra ?? '').trim()
    if (p.tipo === 'bolsa_de_valores' && clave === '') {
      throw new DatoDeBeneficiarioInvalido([
        'La excepción de bolsa exige la clave de pizarra: el Art. 23 Quinquies 2 fr. I la concede ' +
          '«siempre que proporcione la clave de pizarra, referencia o identificador con el que ' +
          'pueda localizarse». Sin ella la excepción no está acreditada.',
      ])
    }
    if (p.tipo !== 'bolsa_de_valores' && clave !== '') {
      throw new DatoDeBeneficiarioInvalido([
        'La clave de pizarra solo acredita la excepción de bolsa (fr. I). Para los anexos de la ' +
          'fr. II el sustento es otro.',
      ])
    }

    const umbral = await umbralDeControl(db, p.hoy)
    const sustituyeA = await sustituirVigente(db, p.sesion, p.clienteId)
    const identificacionId = await insertarIdentificacion(db, p.sesion, {
      clienteId: p.clienteId,
      via: 'excepcion',
      fecha: p.fechaIdentificacion,
      umbral,
      sustituyeA,
      desciendeDeHallazgoId: null,
    })

    await db.query(
      `insert into excepciones_bc (tenant_id, identificacion_id, tipo, clave_pizarra, detalle)
       values ($1,$2,$3::tipo_excepcion_bc,$4,$5)`,
      [p.sesion.tenantId, identificacionId, p.tipo, clave === '' ? null : clave, p.detalle ?? null],
    )

    return { identificacionId }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Piezas
// ─────────────────────────────────────────────────────────────────────────

async function sustituirVigente(
  db: EjecutorSql,
  sesion: ContextoSesion,
  clienteId: string,
): Promise<string | null> {
  const { rows } = await db.query(
    `update identificaciones_bc set estado = 'sustituida'
      where tenant_id = $1 and cliente_id = $2 and estado = 'vigente'
        and desciende_de_hallazgo_id is null
    returning id::text`,
    [sesion.tenantId, clienteId],
  )
  return (rows[0] as { id: string } | undefined)?.id ?? null
}

async function insertarIdentificacion(
  db: EjecutorSql,
  sesion: ContextoSesion,
  d: {
    clienteId: string
    via: string
    fecha: string
    umbral: UmbralDeControl
    sustituyeA: string | null
    desciendeDeHallazgoId: string | null
  },
): Promise<string> {
  const { rows } = await db.query(
    `insert into identificaciones_bc
       (tenant_id, cliente_id, via, fecha_identificacion, sustituye_a,
        desciende_de_hallazgo_id, umbral_pct, umbral_inclusivo, determinada_por)
     values ($1,$2,$3::via_identificacion_bc,$4::date,$5,$6,$7,$8,$9)
     returning id::text`,
    [
      sesion.tenantId,
      d.clienteId,
      d.via,
      d.fecha,
      d.sustituyeA,
      d.desciendeDeHallazgoId,
      d.umbral.umbralControlPct,
      d.umbral.umbralControlInclusivo,
      sesion.usuarioId,
    ],
  )
  return (rows[0] as { id: string }).id
}

/** Asienta las fracciones evaluadas y los hallazgos que produjeron. */
async function asentarPrelacion(
  db: EjecutorSql,
  sesion: ContextoSesion,
  identificacionId: string,
  determinacion: DeterminacionPersonaMoral,
  datos: DatosIdentificacion,
): Promise<void> {
  const pasoPorFraccion = new Map<FraccionPrelacion, string>()

  // En el orden del camino, que es el del artículo: el trigger de la base
  // rechaza una fracción cuya anterior no quedó sin resultado.
  for (const paso of determinacion.camino) {
    const { rows } = await db.query(
      `insert into pasos_prelacion_bc
         (tenant_id, identificacion_id, fraccion, resultado, motivo, insumos_evaluados)
       values ($1,$2,$3::fraccion_prelacion_bc,$4::resultado_paso_bc,$5,$6::jsonb)
       returning id::text`,
      [
        sesion.tenantId,
        identificacionId,
        paso.fraccion,
        paso.resultado === 'determinado' ? 'encontrado' : 'no_encontrado',
        paso.resultado === 'determinado' ? null : paso.detalle,
        JSON.stringify(insumosDelPaso(paso)),
      ],
    )
    pasoPorFraccion.set(paso.fraccion, (rows[0] as { id: string }).id)
  }

  for (const b of determinacion.beneficiarios) {
    const pasoId = pasoPorFraccion.get(b.fraccion)
    if (pasoId === undefined) {
      throw new DatoDeBeneficiarioInvalido([
        `El motor determinó un beneficiario por la fracción ${b.fraccion} sin haber registrado ` +
          'ese paso. Es incoherencia del propio camino, no del capturista.',
      ])
    }
    const beneficiarioId = await identidadDe(
      db, sesion, datos, b.titularId,
      b.fraccion === 'I' ? 'participacion' : 'control_efectivo',
    )
    await insertarHallazgo(db, sesion, {
      identificacionId,
      beneficiarioId,
      pasoId,
      rol: null,
      base: b.base,
    })
  }
}

function insumosDelPaso(paso: PasoPrelacion): unknown {
  switch (paso.fraccion) {
    case 'I':
      return paso.tenenciasEvaluadas
    case 'II':
      return paso.controlEvaluado
    case 'III':
      return paso.funcionariosEvaluados
  }
}

async function insertarHallazgo(
  db: EjecutorSql,
  sesion: ContextoSesion,
  h: {
    identificacionId: string
    beneficiarioId: string
    pasoId: string | null
    rol: RolFideicomiso | null
    base: string
  },
): Promise<string> {
  const { rows } = await db.query(
    `insert into hallazgos_bc (tenant_id, identificacion_id, beneficiario_id, paso_id, rol, base)
     values ($1,$2,$3,$4,$5::rol_fideicomiso_bc,$6) returning id::text`,
    [sesion.tenantId, h.identificacionId, h.beneficiarioId, h.pasoId, h.rol, h.base],
  )
  return (rows[0] as { id: string }).id
}

/**
 * De `titularId` opaco a la fila de identidad, creándola si hace falta.
 *
 * `control_por` se deriva de la fracción y no se pregunta: la columna existía
 * desde el núcleo con dos valores para un capítulo de cuatro caminos, y ahora
 * el camino real vive en `hallazgos_bc`. Dejarla al criterio del capturista
 * abriría la puerta a que diga «participación» sobre un hallazgo de la fr. III.
 */
async function identidadDe(
  db: EjecutorSql,
  sesion: ContextoSesion,
  datos: DatosIdentificacion,
  titularId: string,
  controlPor: 'participacion' | 'control_efectivo',
): Promise<string> {
  const identidad = datos.identidades[titularId]
  if (identidad === undefined || identidad.nombre.trim() === '') {
    throw new DatoDeBeneficiarioInvalido([
      `El motor determinó como Beneficiario Controlador al titular "${titularId}" y no se dijo ` +
        'quién es. No se guarda un Beneficiario Controlador sin identidad.',
    ])
  }

  const { rows } = await db.query(
    `insert into beneficiarios_controladores
       (tenant_id, cliente_id, nombre, rfc, curp, control_por, es_declaracion)
     values ($1,$2,$3,$4,$5,$6::control_beneficiario,false)
     returning id::text`,
    [
      sesion.tenantId,
      datos.clienteId,
      identidad.nombre.trim(),
      identidad.rfc ?? null,
      identidad.curp ?? null,
      controlPor,
    ],
  )
  return (rows[0] as { id: string }).id
}

// ─────────────────────────────────────────────────────────────────────────
// Art. 12 fr. VII ¶2 · El piso de datos
// ─────────────────────────────────────────────────────────────────────────

export class PisoDelBeneficiarioAusente extends Error {
  constructor(detalle: string) {
    super(
      `No se puede decir qué datos exige el Art. 12 fr. VII del Beneficiario Controlador: ` +
        `${detalle}. Se detiene en vez de suponer un piso — dar por cumplido lo que no se sabe ` +
        'evaluar es peor que no evaluarlo.',
    )
    this.name = 'PisoDelBeneficiarioAusente'
  }
}

export interface PisoExigido {
  readonly numerales: readonly string[]
  /** Qué dice cada numeral, según `campos_expediente`, no según este módulo. */
  readonly etiquetas: Readonly<Record<string, string>>
  readonly exigibleDesde: string
  readonly anticipado: boolean
}

/**
 * Cuáles numerales del Anexo 3 exige el artículo, y qué dice cada uno.
 *
 * Los numerales salen de `parametros_motor` —el párrafo que los enumera está
 * verbatim en el DOF— y lo que dicen sale de `campos_expediente`, que los
 * transcribió del RCG histórico con su propio pendiente de contraste. Dos
 * catálogos y no uno, a propósito: repetir aquí el texto de los numerales
 * crearía una segunda verdad sobre el mismo Anexo.
 */
export async function pisoExigido(db: EjecutorSql, hoy: string): Promise<PisoExigido> {
  const { rows } = await db.query(
    `select valor, vigente_desde::text as desde
       from parametros_motor
      where clave = 'beneficiario_piso_anexo3' and actividad_id is null
      order by vigente_desde desc limit 1`,
  )
  const f = rows[0] as { valor: unknown; desde: string } | undefined
  if (f === undefined) throw new PisoDelBeneficiarioAusente('el catálogo no lo tiene sembrado')

  const numerales = f.valor as string[]
  const etiquetas: Record<string, string> = {}
  for (const n of numerales) {
    const e = await db.query(
      `select string_agg(distinct etiqueta, ' · ') as etiqueta
         from campos_expediente
        where vigente_hasta is null and fuente like $1`,
      [`Anexo 3 a) ${n})%`],
    )
    const etiqueta = (e.rows[0] as { etiqueta: string | null } | undefined)?.etiqueta
    if (etiqueta === null || etiqueta === undefined) {
      throw new PisoDelBeneficiarioAusente(
        `ningún campo del expediente dice qué es el numeral ${n}) del inciso a) del Anexo 3`,
      )
    }
    etiquetas[n] = etiqueta
  }

  return { numerales, etiquetas, exigibleDesde: f.desde, anticipado: hoy < f.desde }
}

interface FilaIdentidadBc {
  id: string
  nombre: string
  rfc: string | null
  curp: string | null
  fecha_nacimiento: string | null
  nacionalidad: string | null
}

/**
 * El piso, beneficiario por beneficiario, del cliente dado.
 *
 * Solo aplica a clientes persona moral y fideicomiso: el ¶2 dice «en todos los
 * casos» de ellos, mientras que el ¶1 —para clientes persona física— condiciona
 * a que el cliente «cuente con dicha información», y eso no se puede exigir sin
 * preguntarle. Los del Cap. III Quinquies son morales y fideicomisos, así que
 * es el régimen que toca.
 */
export async function pisoDeLosBeneficiarios(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; clienteId: string; hoy: string },
): Promise<{ exigido: PisoExigido; porBeneficiario: readonly PisoDelBeneficiario[] }> {
  const exigido = await pisoExigido(db, p.hoy)

  const { rows } = await db.query(
    `select b.id::text, b.nombre, b.rfc, b.curp,
            b.fecha_nacimiento::text, b.nacionalidad
       from beneficiarios_controladores b
      where b.tenant_id = $1 and b.cliente_id = $2 and b.es_declaracion = false
      order by b.created_at`,
    [p.sesion.tenantId, p.clienteId],
  )

  return {
    exigido,
    porBeneficiario: (rows as FilaIdentidadBc[]).map((f) =>
      pisoDelBeneficiario({
        identidad: {
          id: f.id,
          nombre: f.nombre,
          rfc: f.rfc,
          curp: f.curp,
          fechaNacimiento: f.fecha_nacimiento,
          nacionalidad: f.nacionalidad,
        },
        numerales: exigido.numerales,
        etiquetas: exigido.etiquetas,
      }),
    ),
  }
}

/** Completa los datos del piso de una persona ya identificada. */
export async function completarPisoDelBeneficiario(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    beneficiarioId: string
    fechaNacimiento?: string | undefined
    nacionalidad?: string | undefined
    rfc?: string | undefined
    curp?: string | undefined
  },
): Promise<void> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    const nacionalidad = (p.nacionalidad ?? '').trim().toUpperCase()
    if (nacionalidad !== '' && !/^[A-Z]{2}$/.test(nacionalidad)) {
      throw new DatoDeBeneficiarioInvalido([
        'La nacionalidad va como código de país de dos letras (MX, US, ES), que es como la pide ' +
          'el formato del aviso.',
      ])
    }
    // `coalesce` y no asignación directa: completar el piso no puede borrar lo
    // que ya estaba por venir un campo vacío en el formulario.
    const { rows } = await db.query(
      `update beneficiarios_controladores
          set fecha_nacimiento = coalesce($3::date, fecha_nacimiento),
              nacionalidad     = coalesce($4, nacionalidad),
              rfc              = coalesce($5, rfc),
              curp             = coalesce($6, curp)
        where tenant_id = $1 and id = $2
      returning id::text`,
      [
        p.sesion.tenantId,
        p.beneficiarioId,
        p.fechaNacimiento === undefined || p.fechaNacimiento === '' ? null : p.fechaNacimiento,
        nacionalidad === '' ? null : nacionalidad,
        (p.rfc ?? '').trim() === '' ? null : (p.rfc ?? '').trim(),
        (p.curp ?? '').trim() === '' ? null : (p.curp ?? '').trim(),
      ],
    )
    if (rows.length === 0) {
      throw new DatoDeBeneficiarioInvalido([
        'Ese Beneficiario Controlador no existe en este obligado.',
      ])
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Art. 23 Quinquies · La documentación que sustenta el procedimiento
// ─────────────────────────────────────────────────────────────────────────

export interface SustentoAsentado {
  readonly id: string
  readonly documentoId: string
  readonly campo: string
  readonly nombreArchivo: string
  readonly hash: string
  readonly nota: string
  /** A qué parte del camino respalda. Los dos nulos: al procedimiento entero. */
  readonly pasoId: string | null
  readonly hallazgoId: string | null
  readonly registradoEn: string
}

/**
 * Los documentos que sustentan un procedimiento.
 *
 * No traen el archivo: traen su huella y dónde vive. El documento sigue siendo
 * del expediente —una sola copia, con su SHA-256— y esto es solo el vínculo
 * que dice qué parte del camino respalda.
 */
export async function sustentosDeLaIdentificacion(
  db: EjecutorSql,
  p: { sesion: ContextoSesion; identificacionId: string },
): Promise<readonly SustentoAsentado[]> {
  const { rows } = await db.query(
    `select s.id::text, s.documento_id::text, d.campo, d.storage_path, d.hash_sha256,
            s.nota, s.paso_id::text, s.hallazgo_id::text, s.created_at::text
       from sustentos_bc s
       join documentos d on d.id = s.documento_id
      where s.tenant_id = $1 and s.identificacion_id = $2
      order by s.created_at`,
    [p.sesion.tenantId, p.identificacionId],
  )
  return (
    rows as Array<{
      id: string
      documento_id: string
      campo: string
      storage_path: string
      hash_sha256: string
      nota: string
      paso_id: string | null
      hallazgo_id: string | null
      created_at: string
    }>
  ).map((f) => ({
    id: f.id,
    documentoId: f.documento_id,
    campo: f.campo,
    // El nombre que se enseña sale de la ruta, no se guarda aparte: dos
    // lugares para el mismo nombre es un lugar donde pueden discrepar.
    nombreArchivo: f.storage_path.split('/').at(-1) ?? f.storage_path,
    hash: f.hash_sha256,
    nota: f.nota,
    pasoId: f.paso_id,
    hallazgoId: f.hallazgo_id,
    registradoEn: f.created_at,
  }))
}

/**
 * Vincula un documento ya subido al paso o al hallazgo que respalda.
 *
 * No sube nada: el documento entra por el expediente, como todos. Esto ata lo
 * que ya existe al lugar del camino que sustenta — y la base impide atar un
 * documento de otro cliente, o un paso de otra identificación.
 */
export async function vincularSustento(
  db: EjecutorTransaccional,
  p: {
    sesion: ContextoSesion
    identificacionId: string
    documentoId: string
    nota: string
    pasoId?: string | undefined
    hallazgoId?: string | undefined
  },
): Promise<{ sustentoId: string }> {
  return enTransaccionDeSesion(db, p.sesion, async () => {
    if (p.nota.trim() === '') {
      throw new DatoDeBeneficiarioInvalido([
        'Falta decir qué prueba este documento. Un archivo colgado sin eso obliga a abrirlo para ' +
          'saber por qué está ahí, y el procedimiento se conserva diez años.',
      ])
    }
    if (p.pasoId !== undefined && p.hallazgoId !== undefined) {
      throw new DatoDeBeneficiarioInvalido([
        'Un documento sustenta una fracción evaluada o a una persona hallada, no las dos: son ' +
          'cosas distintas del camino.',
      ])
    }

    try {
      const { rows } = await db.query(
        `insert into sustentos_bc
           (tenant_id, documento_id, identificacion_id, paso_id, hallazgo_id, nota, registrado_por)
         values ($1,$2,$3,$4,$5,$6,$7) returning id::text`,
        [
          p.sesion.tenantId,
          p.documentoId,
          p.identificacionId,
          p.pasoId ?? null,
          p.hallazgoId ?? null,
          p.nota.trim(),
          p.sesion.usuarioId,
        ],
      )
      return { sustentoId: (rows[0] as { id: string }).id }
    } catch (e) {
      // Las tres guardas de la base, dichas en palabras del artículo. Dejarlas
      // subir como `foreign_key_violation` obligaría al usuario a adivinar.
      const bruto = e instanceof Error ? e.message : String(e)
      if (/expediente de otro cliente/.test(bruto)) {
        throw new DatoDeBeneficiarioInvalido([
          'Ese documento es del expediente de otro cliente. La documentación que sustenta el ' +
            'procedimiento tiene que ser del mismo Cliente o Usuaria.',
        ])
      }
      if (/sustento_del_(paso|hallazgo)_de_esa_identificacion/.test(bruto)) {
        throw new DatoDeBeneficiarioInvalido([
          'Ese paso o ese hallazgo son de otra identificación, no de ésta.',
        ])
      }
      if (/un_sustento_por_lugar/.test(bruto)) {
        throw new DatoDeBeneficiarioInvalido([
          'Ese documento ya está vinculado a esa parte del procedimiento.',
        ])
      }
      throw e
    }
  })
}
