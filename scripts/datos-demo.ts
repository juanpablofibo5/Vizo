import { Client } from 'pg'
import { registrarOperacion } from '../src/persistencia/operaciones'
import { registrarDocumento } from '../src/persistencia/documentos'
import { pesos } from '../src/dominio/dinero'
import { abrirExpediente, recalcularCompletitud } from '../src/persistencia/expediente'
import { hoyEnMexico } from '../src/dominio/fechas'
import type { ContextoSesion } from '../src/persistencia/transaccion'
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

const URL = process.env['VIZO_DB_URL_ADMIN'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function main(): Promise<void> {
  const db = new Client({ connectionString: URL })
  await db.connect()

  try {
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
