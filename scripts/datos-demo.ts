import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { registrarOperacion } from '../src/persistencia/operaciones'
import { registrarDocumento } from '../src/persistencia/documentos'
import { pesos } from '../src/dominio/dinero'
import { abrirExpediente, recalcularCompletitud } from '../src/persistencia/expediente'
import { hoyEnMexico } from '../src/dominio/fechas'
import { enTransaccionDeSesion, type ContextoSesion } from '../src/persistencia/transaccion'
import {
  activarModelo,
  agregarFactor,
  crearModelo,
  definirGrado,
} from '../src/persistencia/riesgo'
import {
  agregarMitigante,
  declararMetodoEntidad,
  definirNivelEfectividad,
  evaluarEntidadYRegistrar,
} from '../src/persistencia/entidad'
import { emitirMer } from '../src/persistencia/mer'
import { consultarScreening } from '../src/persistencia/screening'
import { LISTAS_EXIGIDAS } from '../src/dominio/screening'
import {
  capturarIntegrante,
  estadoDeLaEstructura,
  registrarEnvio,
  registrarFigura,
} from '../src/persistencia/estructura'
// Storage hablado como el usuario, firmando un JWT con el secreto por omisión
// del stack local. Vive en `tests/soporte` porque nació ahí; se reusa aquí
// porque este script también es de desarrollo y nunca se empaqueta. Usar la
// llave de servicio saltaría las políticas del bucket, que es justo lo que no
// conviene que un dato demo se salte.
import { almacenComo } from '../tests/soporte/almacen'

/**
 * Un PDF mínimo pero VÁLIDO, con su tabla de referencias cruzadas calculada.
 *
 * Podría sembrarse un archivo de texto y nadie lo notaría hasta que alguien lo
 * descargue en una demo y su lector diga que está dañado. Los offsets se
 * calculan sobre los bytes reales, así que el archivo abre.
 */
function pdfDemo(titulo: string): Uint8Array {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    (() => {
      const flujo = `BT /F1 14 Tf 72 720 Td (${titulo.replace(/[()\\]/g, '')}) Tj ET`
      return `<< /Length ${String(flujo.length)} >>\nstream\n${flujo}\nendstream`
    })(),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objetos.forEach((cuerpo, i) => {
    offsets.push(pdf.length)
    pdf += `${String(i + 1)} 0 obj\n${cuerpo}\nendobj\n`
  })

  const inicioXref = pdf.length
  pdf += `xref\n0 ${String(objetos.length + 1)}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf +=
    `trailer\n<< /Size ${String(objetos.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(inicioXref)}\n%%EOF\n`

  return new TextEncoder().encode(pdf)
}

/**
 * Datos de demostración para el obligado del seed.
 *
 * Las operaciones se registran por el CAMINO REAL —`registrarOperacion`, que
 * dispara el motor— y no con INSERTs. La diferencia no es de estilo: si el
 * seed insertara operaciones y sus evaluaciones a mano, estaría escribiendo a
 * mano el veredicto del motor, y la demo enseñaría números que el sistema no
 * calculó. Un dato demo que miente es peor que no tener demo.
 *
 * Se ejecuta contra la base LOCAL, después de `pnpm db:reset`:
 *
 *     pnpm exec tsx scripts/datos-demo.ts
 *
 * Es idempotente: si ya hay operaciones del obligado demo, no hace nada.
 */

const TENANT = '00000000-0000-4000-8000-000000000001'
const ADMIN = '00000000-0000-4000-8000-00000000000a'
const CAPTURISTA = '00000000-0000-4000-8000-00000000000b'

/** El obligado que actúa por fideicomiso (ver `supabase/seed.sql`). */
const TENANT_FIDEICOMISO = '00000000-0000-4000-8000-000000000003'
const CORREO_FIDEICOMISO = 'fideicomiso@vizo.mx'

/**
 * La estructura del Cap. II Ter del obligado fideicomiso.
 *
 * Se siembra por el camino REAL —`registrarFigura`, `capturarIntegrante`,
 * `registrarEnvio`— y no con INSERTs, por lo mismo que las operaciones: así la
 * bitácora tiene los eventos que tendría en la vida real, y la demo no enseña
 * un estado que el sistema nunca produjo.
 *
 * Los cinco integrantes cubren las tres naturalezas del Anexo 2 Bis y sus
 * cuatro papeles, incluido el caso que decide el modelo: un fideicomitente que
 * es a su vez un fideicomiso (sección III.III), identificado con cuatro datos
 * y no con su estructura completa.
 */
async function estructuraDelFideicomiso(db: Client): Promise<void> {
  // El admin se busca POR CORREO y no por un UUID fijo.
  //
  // En local lo siembra `seed.sql` con un id conocido, pero en producción el
  // acceso lo crea una persona desde el panel de Supabase —donde la contraseña
  // se escribe en su lugar y no en un archivo del repositorio— y ahí el UUID es
  // aleatorio. Buscar por correo hace que los dos caminos funcionen.
  const u = await db.query(
    `select id::text from usuarios where tenant_id = $1 and email = $2 and rol = 'admin'`,
    [TENANT_FIDEICOMISO, CORREO_FIDEICOMISO],
  )
  const fila = u.rows[0] as { id: string } | undefined
  if (fila === undefined) {
    console.log(
      `El obligado de fideicomiso todavía no tiene admin (${CORREO_FIDEICOMISO}). ` +
        'Créalo con scripts/produccion-obligado-fideicomiso.sql y vuelve a correr esto.',
    )
    return
  }

  const sesion: ContextoSesion = {
    usuarioId: fila.id,
    tenantId: TENANT_FIDEICOMISO,
    rol: 'admin',
  }

  // La lectura va DENTRO de una sesión, como cualquier otra: `estadoDeLaEstructura`
  // exige correr como `authenticated` y fuera de la transacción muere. El primer
  // intento la envolvió en un `.catch(() => null)`, y ese atajo convirtió «no
  // pude leer» en «no hay estructura» — la regla dura 6 en miniatura: el fallo
  // no revienta, siembra dos veces.
  const ya = await enTransaccionDeSesion(db, sesion, () =>
    estadoDeLaEstructura(db, { sesion }),
  )
  if (ya.figura !== null) {
    console.log('El fideicomiso ya tiene estructura; no se toca.')
    return
  }

  await registrarFigura(db, {
    sesion,
    figura: {
      tipoFigura: 'fideicomiso',
      numeroReferencia: 'F/1847-2020',
      fechaConstitucion: '2020-03-15',
      rfc: 'FPE200315J47',
      cotizaEnBolsa: false,
      fideicomisariosDeterminados: true,
    },
  })

  const integrantes = [
    {
      papel: 'fiduciario' as const,
      naturaleza: 'moral' as const,
      denominacion: 'Banco Fiduciario del Sureste SA, IBM',
      fechaConstitucion: '1995-06-01',
      paisNacionalidad: 'MX',
      rfc: 'BFS950601H23',
    },
    {
      papel: 'delegado_fiduciario' as const,
      naturaleza: 'fisica' as const,
      primerApellido: 'Herrera',
      segundoApellido: 'Pat',
      nombres: 'Rodrigo',
      fechaNacimiento: '1978-09-22',
      curp: 'HEPR780922HYNRTD05',
      paisNacionalidad: 'MX',
      paisNacimiento: 'MX',
      rfc: 'HEPR780922K18',
    },
    {
      papel: 'fideicomitente' as const,
      naturaleza: 'moral' as const,
      denominacion: 'Inmobiliaria Península del Mayab SA de CV',
      fechaConstitucion: '2005-08-10',
      paisNacionalidad: 'MX',
      rfc: 'IPM050810QK4',
    },
    // La recursión aplanada del Anexo 2 Bis III.III: cuatro datos, no una
    // estructura anidada.
    {
      papel: 'fideicomitente' as const,
      naturaleza: 'fideicomiso' as const,
      numeroReferencia: 'F/0932-2016',
      fechaConstitucion: '2016-11-08',
      denominacionFiduciario: 'Banco del Caribe SA, IBM',
      rfc: 'FCA161108T55',
    },
    {
      papel: 'fideicomisario' as const,
      naturaleza: 'fisica' as const,
      primerApellido: 'Sansores',
      segundoApellido: 'Cámara',
      nombres: 'Lucía Fernanda',
      fechaNacimiento: '1982-04-30',
      curp: 'SACL820430MYNNMC09',
      paisNacionalidad: 'MX',
      paisNacimiento: 'MX',
      rfc: 'SACL820430D12',
    },
  ]

  for (const integrante of integrantes) {
    await capturarIntegrante(db, { sesion, integrante })
  }

  const { enviados } = await registrarEnvio(db, { sesion, fecha: '2026-03-10' })
  console.log(
    `Fideicomiso demo: estructura del Anexo 2 Bis con ${String(enviados)} integrantes enviados al SAT.`,
  )
}

/** El obligado del escenario AUTOMOTRIZ (PIL-01: dos sucursales, Fr. VIII). */
const TENANT_AGENCIA = '00000000-0000-4000-8000-000000000005'
const ADMIN_AGENCIA = '00000000-0000-4000-8000-0000000000a5'
const CAPTURISTA_AGENCIA = '00000000-0000-4000-8000-0000000000b5'

/**
 * El escenario del PILOTO: la agencia automotriz, de punta a punta.
 *
 * Es el guion de la demo para Dicas, sembrado por el camino REAL —las mismas
 * funciones que usará la semana 0— para que la bitácora tenga los eventos que
 * tendría en la vida real:
 *
 *   1. La Fr. VIII con dos sucursales (la forma exacta del piloto).
 *   2. La metodología COMPLETA del obligado: escala, factores con indicadores
 *      de los dos delitos, valores por elemento, mitigantes con su nivel de
 *      efectividad — todo declarado por el obligado demo, nada por VIZO.
 *   3. La evaluación de ENTIDAD → grado medio → «tu área interna basta para el
 *      dictamen» (Arts. 44/45) — el argumento con pesos.
 *   4. El MER emitido, congelado con su huella.
 *   5. Las ventas: la de piso que no exige nada, la individual que avisa, y la
 *      camioneta pagada en complementos donde el SEGUNDO pago cruza la ventana
 *      — «el cálculo que hacían de forma artesanal en Excel», en vivo.
 *   6. El screening: un folio limpio y una coincidencia que queda PENDIENTE
 *      con su alerta abierta, para resolverla EN VIVO en la demo.
 */
async function agenciaAutomotriz(db: Client): Promise<void> {
  const ya = await db.query(`select count(*)::int as n from operaciones where tenant_id = $1`, [
    TENANT_AGENCIA,
  ])
  if ((ya.rows[0] as { n: number }).n > 0) {
    console.log('La agencia demo ya tiene operaciones. No se toca nada.')
    return
  }

  // ── El obligado, sus usuarios y sus dos sucursales ─────────────────────
  // Sin contraseña a propósito: para entrar al portal se le asigna una desde
  // el panel de Supabase (mismo criterio que el obligado fideicomiso — una
  // contraseña en el repositorio sería peor que este paso manual).
  await db.query(
    `insert into tenants (id, rfc, razon_social, tipo_persona)
     values ($1, 'GAS150610KL8', 'Grupo Automotriz del Sureste SA de CV', 'moral')
     on conflict (id) do nothing`,
    [TENANT_AGENCIA],
  )
  for (const [id, rol, nombre, correo] of [
    [ADMIN_AGENCIA, 'admin', 'Alma Cetina', 'agencia-admin@vizo.mx'],
    [CAPTURISTA_AGENCIA, 'capturista', 'Rodrigo Uc', 'agencia-ventas@vizo.mx'],
  ] as const) {
    await db.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)
       on conflict (id) do nothing`,
      [id, correo],
    )
    await db.query(
      `insert into usuarios (id, tenant_id, rol, nombre, email)
       values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
      [id, TENANT_AGENCIA, rol, nombre, correo],
    )
  }

  const act = await db.query(`select id::text from actividades_vulnerables where fraccion = 'VIII'`)
  const actividadViii = (act.rows[0] as { id: string } | undefined)?.id
  if (actividadViii === undefined) {
    throw new Error('La Fr. VIII no está en el catálogo (migración 20260830100000).')
  }
  await db.query(
    `insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2) on conflict do nothing`,
    [TENANT_AGENCIA, actividadViii],
  )
  const sucursales: string[] = []
  for (const [nombre, clave] of [
    ['Agencia Norte', 'AGN'],
    ['Agencia Sur', 'AGS'],
  ] as const) {
    const s = await db.query(
      `insert into sucursales (tenant_id, nombre, clave) values ($1,$2,$3) returning id::text`,
      [TENANT_AGENCIA, nombre, clave],
    )
    sucursales.push((s.rows[0] as { id: string }).id)
  }
  const norte = sucursales[0]
  const sur = sucursales[1]
  if (norte === undefined || sur === undefined) throw new Error('Faltaron las sucursales.')

  const admin: ContextoSesion = { usuarioId: ADMIN_AGENCIA, tenantId: TENANT_AGENCIA, rol: 'admin' }
  const ventas: ContextoSesion = {
    usuarioId: CAPTURISTA_AGENCIA,
    tenantId: TENANT_AGENCIA,
    rol: 'capturista',
  }

  // ── La metodología del obligado demo, completa ─────────────────────────
  // Todos los valores los «declara» el obligado demo: son datos de escena,
  // no defaults de VIZO — la configuración real de Dicas la declarará Dicas.
  await definirGrado(db, { sesion: admin, clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0, vigenteDesde: '2026-08-01' })
  await definirGrado(db, { sesion: admin, clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35, vigenteDesde: '2026-08-01' })
  await definirGrado(db, { sesion: admin, clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70, vigenteDesde: '2026-08-01' })

  const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
  await declararMetodoEntidad(db, { sesion: admin, modeloId, metodo: 'residual_por_elemento' })

  const el = await db.query(`select id::text, clave from elementos_riesgo order by clave`)
  const elementos = new Map((el.rows as { id: string; clave: string }[]).map((e) => [e.clave, e.id]))
  const elemento = (clave: string): string => {
    const id = elementos.get(clave)
    if (id === undefined) throw new Error(`Falta el elemento ${clave} del catálogo.`)
    return id
  }

  // Un factor por elemento, con los indicadores de los dos delitos declarados
  // donde el obligado demo los ve — las señales automotrices de ARQ-01 §05.
  for (const [clave, factor, peso, delitos] of [
    ['actos_operaciones', 'Estructuración: pagos fraccionados por debajo del umbral', 30, ['art_139_quater', 'art_400_bis']],
    ['tipo_cliente', 'Comprador que no será el usuario del vehículo', 25, ['art_400_bis']],
    ['geografia', 'Comprador de plaza distinta a la de la agencia', 20, ['art_139_quater', 'art_400_bis']],
    ['transacciones_canales', 'Pago por múltiples terceros o efectivo insistente', 25, ['art_139_quater', 'art_400_bis']],
  ] as const) {
    await agregarFactor(db, {
      sesion: admin,
      modeloId,
      elementoId: elemento(clave),
      factor,
      peso,
      delitos: [...delitos],
    })
  }
  await enTransaccionDeSesion(db, admin, async () => {
    for (const clave of ['actos_operaciones', 'tipo_cliente', 'geografia', 'transacciones_canales']) {
      await db.query(
        `insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso) values ($1,$2,$3,25)`,
        [TENANT_AGENCIA, modeloId, elemento(clave)],
      )
    }
  })

  const niveles: Record<string, string> = {}
  for (const [orden, clave, nombre, evidencia, valor] of [
    [1, 'documentado', 'Documentado', 'Política escrita en el Manual, con apartado citado.', 5],
    [2, 'aplicado', 'Aplicado', 'Bitácora de aplicación del control en las dos sucursales.', 12],
    [3, 'verificado', 'Verificado', 'Revisión interna con constancia, del último semestre.', 20],
  ] as const) {
    const { nivelId } = await definirNivelEfectividad(db, {
      sesion: admin, modeloId, orden, clave, nombre, evidenciaExigible: evidencia, valor,
    })
    niveles[clave] = nivelId
  }
  await agregarMitigante(db, {
    sesion: admin, modeloId,
    descripcion: 'Verificación del expediente por gerencia antes de facturar.',
    efecto: 'Reduce la exposición por identidad y por comprador interpuesto.',
    elementoIds: [elemento('tipo_cliente')],
    nivelId: niveles['verificado'] ?? '', evidenciaRef: 'Manual §7.2',
  })
  await agregarMitigante(db, {
    sesion: admin, modeloId,
    descripcion: 'Regla comercial: sin constancia de situación fiscal no se factura.',
    efecto: 'Reduce la exposición de canales y formas de pago irregulares.',
    elementoIds: [elemento('transacciones_canales')],
    nivelId: niveles['verificado'] ?? '', evidenciaRef: 'Manual §4.1',
  })
  await activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2026-08-01' })

  // ── La evaluación de ENTIDAD y el MER ──────────────────────────────────
  // Inherente 100 (4×25) − mitigación 40 (2 mitigantes «verificado») = 60 →
  // grado MEDIO → «el dictamen puede emitirlo tu área interna» (Art. 44). El
  // argumento con pesos, en una línea de pantalla.
  const entidad = await evaluarEntidadYRegistrar(db, {
    sesion: admin, hoy: hoyEnMexico(), base: 'anio_completo',
    periodoInicio: '2025-07-01', periodoFin: '2026-06-30',
    totalClientes: 1240, totalOperaciones: 3480, montoOperadoCentavos: 84_200_000_000,
  })
  const mer = await emitirMer(db, { sesion: admin, hoy: hoyEnMexico() })

  // ── Las ventas del guion ───────────────────────────────────────────────
  const vender = (sucursalId: string, clienteId: string, fecha: string, monto: number, formaPago: string) =>
    registrarOperacion(db, {
      sesion: ventas,
      datos: {
        sucursalId, clienteId, fechaOperacion: fecha,
        montoBase: pesos(monto), iva: pesos(0), isai: pesos(0), otrosAccesorios: pesos(0),
        formaPago, instrumentoMonetario: '1', monedaCodigo: '1',
        nombreInstitucion: 'BANCO NACIONAL DE MEXICO',
        descripcionBien: 'Vehículo nuevo, venta de piso',
      },
    })
  const cliente = async (nombre: string, rfc: string, fisica = true): Promise<string> => {
    const c = await db.query(
      `insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
       values ($1,$2,$3,$4,'MX') returning id::text`,
      [TENANT_AGENCIA, fisica ? 'fisica' : 'moral', rfc, nombre],
    )
    return (c.rows[0] as { id: string }).id
  }

  const piso = await cliente('Marisol Chan Ek', 'CAEM840512QW1')
  const contado = await cliente('Constructora Itzam SA de CV', 'CIT120820HH7', false)
  const flotilla = await cliente('Roberto Canul Pech', 'CAPR760214JJ3')

  const v1 = await vender(norte, piso, '2026-06-10', 260_000, '03')
  const v2 = await vender(norte, contado, '2026-06-18', 820_000, '03')
  const v3a = await vender(sur, flotilla, '2026-05-08', 550_000, '03')
  const v3b = await vender(sur, flotilla, '2026-06-08', 550_000, '03')

  // ── El screening del guion ─────────────────────────────────────────────
  // Si el catálogo global no tiene listas (base recién reseteada), se cargan
  // versiones DE MUESTRA claramente marcadas. En cuanto el runbook 06 cargue
  // las reales, la vigente será la real y estas quedan como historia.
  for (const clave of LISTAS_EXIGIDAS) {
    const hay = await db.query(`select 1 from listas_screening where clave = $1 limit 1`, [clave])
    if (hay.rows.length > 0) continue
    const contenido = `lista de muestra ${clave} — demo`
    const l = await db.query(
      `insert into listas_screening (clave, nombre, fuente_url, descargada_en, hash_sha256, registros)
       values ($1, $2, 'demo://cargar-la-real-con-el-runbook-06', now(), $3, 2) returning id::text`,
      [clave, `${clave.toUpperCase()} (MUESTRA DEMO)`, createHash('sha256').update(contenido).digest('hex')],
    )
    const listaId = (l.rows[0] as { id: string }).id
    await db.query(
      `insert into entradas_lista (lista_id, tipo, nombre, rfc, datos) values
         ($1,'individual','Jose Angel Lopez Gomez', null, '{"nota":"entrada de muestra"}'::jsonb),
         ($1,'entity','Comercializadora Fachada del Golfo SA',
          case when $2 = 'sat_69b' then 'CFG050505GG5' end,
          case when $2 = 'sat_69b' then '{"situacion":"Definitivo"}' else '{}' end::jsonb)`,
      [listaId, clave],
    )
  }

  const limpio = await consultarScreening(db, {
    sesion: ventas, sujetoTipo: 'cliente', sujetoId: flotilla,
    nombre: 'Roberto Canul Pech', rfc: 'CAPR760214JJ3',
  })

  // El homónimo toma su nombre DE LA LISTA VIGENTE — sea la de muestra, una de
  // prueba o la real cargada por el runbook 06. Así la coincidencia dispara en
  // cualquier entorno, que es el punto de esta parte del guion.
  const enLista = await db.query(
    `select e.nombre from entradas_lista e
       join (select distinct on (clave) id from listas_screening
              order by clave, descargada_en desc) l on l.id = e.lista_id
      where e.tipo = 'individual' order by e.created_at limit 1`,
  )
  const nombreListado =
    (enLista.rows[0] as { nombre: string } | undefined)?.nombre ?? 'Jose Angel Lopez Gomez'
  const homonimo = await cliente(nombreListado, 'LOGJ800101TT9')
  const coincide = await consultarScreening(db, {
    sesion: ventas, sujetoTipo: 'cliente', sujetoId: homonimo,
    nombre: nombreListado,
  })
  // La coincidencia queda PENDIENTE a propósito: resolverla —con su
  // razonamiento escrito— es la mejor parte de la demo de screening.

  console.log('Agencia demo lista para', TENANT_AGENCIA)
  if (entidad.resultado.estado === 'evaluado') {
    console.log(
      `  entidad: inherente ${String(entidad.resultado.inherente)} − mitigación ` +
        `${String(entidad.resultado.mitigacion)} = residual ${String(entidad.resultado.residual)} ` +
        `→ ${entidad.resultado.gradoClave} → ${entidad.resultado.auditoria}`,
    )
  }
  console.log(`  MER v${String(mer.version)} emitido · SHA-256 ${mer.hash.slice(0, 16)}…`)
  for (const [etiqueta, r] of [
    ['piso     $260,000', v1],
    ['contado  $820,000', v2],
    ['flotilla $550,000 (mayo)', v3a],
    ['flotilla $550,000 (junio)', v3b],
  ] as const) {
    console.log(`  ${etiqueta} → ${r.evaluacion.resultadoAviso}`)
  }
  console.log(`  screening limpio: ${limpio.resultado} · coincidencia pendiente: ${coincide.resultado}`)
  console.log('  La coincidencia queda SIN resolver: se resuelve en vivo, con razonamiento.')
}

const URL = process.env['VIZO_DB_URL_ADMIN'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function main(): Promise<void> {
  const db = new Client({ connectionString: URL })
  await db.connect()

  try {
    // Cada pieza de la demo comprueba SU propia idempotencia. Si esta llamada
    // fuera después del guardia de abajo, que mira las operaciones del
    // obligado moral, el fideicomiso nunca se sembraría en una base que ya
    // tuviera operaciones — dos obligados distintos atados por un `if` ajeno.
    await estructuraDelFideicomiso(db)
    await agenciaAutomotriz(db)

    const ya = await db.query(`select count(*)::int as n from operaciones where tenant_id = $1`, [
      TENANT,
    ])
    if ((ya.rows[0] as { n: number }).n > 0) {
      console.log('El obligado demo ya tiene operaciones. No se toca nada.')
      return
    }

    const suc = await db.query(
      `select id::text from sucursales where tenant_id = $1 order by clave limit 1`,
      [TENANT],
    )
    const sucursalId = (suc.rows[0] as { id: string } | undefined)?.id
    if (sucursalId === undefined) throw new Error('El obligado demo no tiene sucursales.')

    // Un desarrollo real, con los datos que el XSD del aviso exige. Yucatán (31)
    // porque el obligado demo es de Mérida.
    const des = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal,
          colonia, calle, tipo_desarrollo, descripcion_desarrollo,
          monto_desarrollo, unidades_comercializadas, costo_unidad,
          otras_empresas, objeto_aviso_anterior)
       values ($1, 'Residencial Kaan', 'LICMER20260114', '31', '97127',
               'MONTES DE AME', 'CALLE 33 DIAGONAL 240', '5',
               'Condominio vertical de 48 unidades, preventa',
               186000000.00, 48.00, 3875000.00, false, false)
       returning id::text`,
      [TENANT],
    )
    const desarrolloId = (des.rows[0] as { id: string }).id

    // Un comprador persona moral, además del que ya trae el seed.
    const cli = await db.query(
      // `relacion_negocios`: una compradora que aporta mes a mes en preventa es
      // el caso típico de relación formal y habitual (Art. 3 fr. XIV), así que
      // entra al ciclo de revisión anual del Art. 21 y la pantalla lo enseña.
      `insert into clientes_finales
         (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad, relacion_negocios)
       values ($1, 'moral', 'IPM180312QK4', 'Inversiones Palma Maya SA de CV', 'MX', true)
       returning id::text`,
      [TENANT],
    )
    const clienteMoral = (cli.rows[0] as { id: string }).id

    // El cliente persona física del seed queda como está, a propósito: no
    // tiene RFC ni CURP, así que el motor lo marca para revisión de identidad
    // y se niega a acumular sobre él. Es un caso real de la Fr. V Bis —el
    // comprador extranjero sin RFC— y la demo gana enseñándolo.

    // El capturista captura: es su trabajo, y así la bitácora lo refleja.
    const sesion: ContextoSesion = {
      usuarioId: CAPTURISTA,
      tenantId: TENANT,
      rol: 'capturista',
    }

    const capturar = async (
      clienteId: string,
      fecha: string,
      monto: number,
      formaPago: string,
      instrumento: string,
    ) =>
      registrarOperacion(db, {
        sesion,
        datos: {
          sucursalId,
          clienteId,
          desarrolloId,
          fechaOperacion: fecha,
          montoBase: pesos(monto),
          iva: pesos(0),
          isai: pesos(0),
          otrosAccesorios: pesos(0),
          formaPago,
          instrumentoMonetario: instrumento,
          monedaCodigo: '1',
          aportacionFideicomiso: false,
          nombreInstitucion: 'BANCO NACIONAL DE MEXICO',
          descripcionBien: 'Aportación a preventa, unidad del desarrollo',
        },
      })

    // El umbral de aviso de la Fr. V Bis es 8,025 UMA. Con la UMA de 2026
    // ($117.31) son $941,412.75.
    //
    // El escenario está armado para que la demo enseñe LO QUE UNA HOJA DE
    // CÁLCULO NO HACE: ningún pago cruza el umbral por sí solo, y la ventana
    // deslizante de seis meses sí. Un obligado que evalúa pago por pago no
    // avisaría, y estaría incumpliendo sin enterarse.

    // ── Mayo 2026: primer parcial de preventa. Muy por debajo. ────────────
    const mayo = await capturar(clienteMoral, '2026-05-14', 400_000, '03', '1')

    // ── Junio 2026: segundo parcial. Tampoco cruza solo… ──────────────────
    const junio1 = await capturar(clienteMoral, '2026-06-03', 350_000, '03', '1')

    // ── …y el tercero es el que hace cruzar la SUMA: 400 + 350 + 250 =
    //    $1,000,000 > $941,412.75. Aviso por acumulación.
    const junio2 = await capturar(clienteMoral, '2026-06-22', 250_000, '01', '2')

    // ── El expediente, abierto y con UN documento ────────────────────────
    // Los documentos casi no se siembran, y sigue siendo a propósito: subirlos
    // en vivo es la mejor parte de la demo — quien la ve mira aparecer la
    // huella SHA-256 del archivo que acaba de arrastrar. Sembrarlos todos
    // regalaría ese momento.
    //
    // PERO SE SIEMBRA UNO, y la razón apareció al construir la Constancia de
    // mecanismos: su fracción VII —conservación de información— solo se
    // acredita si el obligado tiene documentos DE VERDAD. Con cero archivos, la
    // constancia decía «no encontré evidencia», que era correcto y dejaba la
    // demo enseñando un hueco donde el sistema sí tiene algo que mostrar.
    //
    // Uno basta para acreditar, y quedan seis para arrastrar en vivo.
    const admin: ContextoSesion = { usuarioId: ADMIN, tenantId: TENANT, rol: 'admin' }
    const exp = await abrirExpediente(db, { sesion: admin, clienteId: clienteMoral })

    const doc = await registrarDocumento(db, almacenComo(admin), {
      sesion: admin,
      expedienteId: exp.expedienteId,
      documento: {
        campo: 'acta_constitutiva',
        nombreArchivo: 'acta-constitutiva-inversiones-palma-maya.pdf',
        mime: 'application/pdf',
        bytes: pdfDemo('Acta constitutiva · Inversiones Palma Maya SA de CV'),
      },
    })

    const comp = await recalcularCompletitud(db, {
      sesion: admin,
      expedienteId: exp.expedienteId,
      fecha: hoyEnMexico(),
    })

    console.log('Datos demo listos para', TENANT)
    console.log(
      `  expediente: ${comp.estatus} · ${String(comp.cubiertos)}/${String(comp.totalObligatorios)} requisitos`,
    )
    console.log(`  documento sembrado: acta constitutiva · SHA-256 ${doc.hash.slice(0, 16)}…`)
    console.log('  desarrollo:', desarrolloId)
    for (const [etiqueta, r] of [
      ['mayo    $400,000', mayo],
      ['junio   $350,000', junio1],
      ['junio   $250,000', junio2],
    ] as const) {
      console.log(
        `  ${etiqueta} → ${r.evaluacion.resultadoAviso}` +
          (r.alertas.length > 0 ? ` · alertas: ${r.alertas.join(', ')}` : ''),
      )
    }
    console.log('\nJulio 2026 queda sin operaciones a propósito: es el informe en cero.')
    console.log(`Admin de la demo: ${ADMIN}`)
  } finally {
    await db.end()
  }
}

await main()
