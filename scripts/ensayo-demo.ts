import { Client } from 'pg'
import { BUCKET_AVISOS } from '../src/supabase/almacen'
import { almacenComo } from '../tests/soporte/almacen'
import {
  aprobarAviso,
  generarAviso,
  marcarListoParaRevision,
} from '../src/persistencia/aviso'
import { camposCapturables, guardarDatosDeCaptura } from '../src/persistencia/datos-expediente'
import { recalcularCompletitud } from '../src/persistencia/expediente'
import { hoyEnMexico } from '../src/dominio/fechas'
import { preparacionDelCatalogo } from '../src/persistencia/preparacion'
import { enTransaccionDeSesion } from '../src/persistencia/transaccion'
import type { ContextoSesion } from '../src/persistencia/transaccion'

/**
 * El guion de demo, ejercido por el mismo código que usa la pantalla.
 *
 * No sustituye a hacer clic —no prueba que un botón esté donde debe— pero sí
 * comprueba lo que un clic no alcanza a ver: que cada afirmación del guion
 * coincida con lo que la base responde, y que el pipeline del aviso corra
 * completo sin tocar la interfaz.
 *
 * Y desde el 30-ago-2026 comprueba algo más, porque levantar la demo a mano
 * encontró cuatro defectos que este script no veía: LA PREPARACIÓN DEL
 * CATÁLOGO de cada obligado de la demo. Los cuatro eran pantallas ofreciendo
 * acciones que su catálogo no podía sostener, y todos se leen aquí antes de
 * que alguien los descubra enseñándolos.
 *
 * Se corre contra LOCAL, después de `pnpm db:reset && pnpm demo:datos`:
 *
 *     pnpm exec tsx scripts/ensayo-demo.ts
 *
 * Deja el aviso de junio APROBADO, así que después hay que resetear para dejar
 * el escenario como lo espera el guion.
 */

const TENANT = '00000000-0000-4000-8000-000000000001'
const ADMIN = '00000000-0000-4000-8000-00000000000a'
const URL = process.env['VIZO_DB_URL_ADMIN'] ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

let fallos = 0
function comprobar(paso: string, afirmacion: string, ok: boolean, visto: string): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${paso} · ${afirmacion}${ok ? '' : ` → ${visto}`}`)
  if (!ok) fallos += 1
}

async function main(): Promise<void> {
  const db = new Client({ connectionString: URL })
  await db.connect()
  const sesion: ContextoSesion = { usuarioId: ADMIN, tenantId: TENANT, rol: 'admin' }

  try {
    const uno = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
      (await db.query(sql, params)).rows[0] as T

    console.log('\nPASO 1 · Inicio — el semáforo')
    const p1 = await uno<{ alta: string; marzo: number; dias: number }>(
      `select (select fecha_alta_autoridad::text from tenants where id = $1) as alta,
              (select count(*)::int from operaciones
                where fecha_operacion >= '2026-03-01' and fecha_operacion < '2026-04-01') as marzo,
              ((now() at time zone 'America/Merida')::date - date '2026-04-17') as dias`,
      [TENANT],
    )
    comprobar('1', 'el obligado tiene fecha de alta', p1.alta !== null, String(p1.alta))
    comprobar('1', 'marzo no tiene operaciones', p1.marzo === 0, String(p1.marzo))
    comprobar('1', 'marzo está vencido', p1.dias > 0, `${String(p1.dias)} días`)
    console.log(`     (hoy: ${String(p1.dias)} días vencido — el guion dice leerlo de la pantalla)`)

    console.log('\nPASO 2 · El veredicto explicable — el corazón')
    // EL FILTRO POR OBLIGADO VA EXPLÍCITO, y cuesta explicarlo porque el
    // defecto estuvo aquí meses sin verse. Este script corre con el rol
    // administrativo —lo necesita para preparar y para verificar la bitácora—
    // y ese rol SE SALTA RLS. Sin `tenant_id` en el where, esta consulta veía
    // las operaciones de TODOS los obligados de la demo.
    //
    // Mientras hubo un solo obligado con operaciones, la respuesta salía bien
    // por casualidad. Al entrar la agencia automotriz (29-ago) el ensayo
    // empezó a contar 7 pagos donde el guion promete 3 — y lo que estaba mal
    // no era el guion.
    //
    // Es la misma lección que el operador de pg_trgm: una herramienta que
    // corre con más privilegio que la aplicación puede afirmar cosas que la
    // aplicación nunca vería.
    const ops = (
      await db.query(
        `select o.fecha_operacion::text as fecha, o.monto_base::text as monto,
                e.resultado_aviso::text as veredicto, e.motivo
           from operaciones o
           join lateral (select * from evaluaciones_umbral x where x.operacion_id = o.id
                          order by x.evaluado_en desc limit 1) e on true
          where o.tenant_id = $1
          order by o.fecha_operacion`,
        [TENANT],
      )
    ).rows as Array<{ fecha: string; monto: string; veredicto: string; motivo: string }>
    comprobar('2', 'hay tres pagos', ops.length === 3, String(ops.length))
    comprobar('2', 'los dos primeros NO requieren aviso',
      ops[0]?.veredicto === 'no' && ops[1]?.veredicto === 'no',
      `${String(ops[0]?.veredicto)}, ${String(ops[1]?.veredicto)}`)
    comprobar('2', 'el tercero dispara ACUMULACIÓN',
      ops[2]?.veredicto === 'acumulacion', String(ops[2]?.veredicto))
    comprobar('2', 'el motivo trae la suma y el umbral',
      (ops[2]?.motivo ?? '').includes('$1,000,000.00') &&
        (ops[2]?.motivo ?? '').includes('$941,412.75'),
      ops[2]?.motivo ?? '')

    console.log('\nPASO 3 · El expediente — captura y huella')
    const exp = await uno<{ id: string; cubiertos: number; total: number }>(
      `select id::text, (completitud->>'cubiertos')::int as cubiertos,
              (completitud->>'totalObligatorios')::int as total from expedientes limit 1`,
    )
    comprobar('3', 'el expediente existe y está evaluado', exp.total > 0, String(exp.total))
    console.log(`     ${String(exp.cubiertos)} de ${String(exp.total)} requisitos`)

    // Lo que hasta hoy era imposible: capturar los datos que no son documento.
    const capturables = await camposCapturables(db, {
      actividadId: (await uno<{ id: string }>(
        `select actividad_id::text as id from expedientes limit 1`)).id,
      tipoPersona: 'moral',
      fecha: hoyEnMexico(),
    })
    const valores: Record<string, string> = {
      'domicilio.calle': 'CALLE 21', 'domicilio.numero': '285',
      'domicilio.colonia': 'ITZIMNA', 'domicilio.cp': '97100',
      'domicilio.municipio': 'MERIDA', 'domicilio.estado': 'YUCATAN',
      fecha_nacimiento_o_constitucion: '2018-03-12',
    }
    const giro = capturables.find((c) => c.campo === 'giro_mercantil')
    if (giro !== undefined) {
      valores['giro_mercantil'] = (await uno<{ codigo: string }>(
        `select codigo from catalogos_sat where catalogo = 'giro_mercantil' limit 1`)).codigo
    }
    await guardarDatosDeCaptura(db, { sesion, expedienteId: exp.id, valores, fecha: hoyEnMexico() })
    const tras = await recalcularCompletitud(db, {
      sesion, expedienteId: exp.id, fecha: hoyEnMexico(),
    })
    comprobar('3', 'capturar los datos sube la completitud',
      tras.cubiertos > exp.cubiertos, `${String(exp.cubiertos)} → ${String(tras.cubiertos)}`)
    comprobar('3', 'ya no faltan datos de captura',
      tras.faltantes.filter((f) => f.tipoDato !== 'documento').length === 0,
      String(tras.faltantes.filter((f) => f.tipoDato !== 'documento').length))

    console.log('\nPASO 4 · El aviso, de punta a punta')
    const actividadId = (await uno<{ id: string }>(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`)).id
    // Se habla con Storage COMO EL USUARIO, no con la llave de servicio: así
    // las políticas del bucket se evalúan igual que en el navegador. Es el
    // mismo ayudante que usan las pruebas.
    const almacen = almacenComo(sesion, BUCKET_AVISOS)
    const aviso = await generarAviso(
      db, { sesion, actividadId, periodo: '2026-06-01', granularidad: 'un_aviso_por_operacion' },
      almacen,
    )
    comprobar('4', 'el aviso de junio se genera', aviso.avisoId !== '', aviso.avisoId)
    comprobar('4', 'trae la operación reportable, no un informe en cero',
      aviso.xml.includes('<aviso>'), 'sin <aviso>')
    comprobar('4', 'describe el desarrollo', aviso.xml.includes('LICMER20260114'), 'sin licencia')

    await marcarListoParaRevision(db, { sesion, avisoId: aviso.avisoId })
    await aprobarAviso(db, { sesion, avisoId: aviso.avisoId })
    const estado = await uno<{ estatus: string; quien: string | null }>(
      `select a.estatus::text, u.nombre as quien from avisos a
         left join usuarios u on u.id = a.aprobado_por where a.id = $1`,
      [aviso.avisoId],
    )
    comprobar('4', 'aprobar deja el aviso en «aprobado»', estado.estatus === 'aprobado', estado.estatus)
    comprobar('4', 'y deja NOMBRE de quien aprobó', estado.quien !== null, 'sin nombre')

    console.log('\nPASO 5 · La evidencia')
    const cadena = (await db.query(`select * from app.bitacora_verificar($1)`, [TENANT])).rows as
      Array<{ intacta: boolean }>
    comprobar('5', 'la cadena de bitácora está íntegra',
      cadena.every((r) => r.intacta !== false), 'rota')
    const n = await uno<{ n: number }>(
      `select count(*)::int as n from bitacora where tenant_id = $1`, [TENANT])
    console.log(`     ${String(n.n)} eventos encadenados`)

    console.log('\nPASO 6 · La preparación del catálogo de cada obligado de la demo')
    for (const [nombre, tenantId, usuarioId] of [
      ['V Bis · Inversiones Palma Maya', TENANT, ADMIN],
      [
        'VIII · Grupo Automotriz del Sureste',
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-0000000000a5',
      ],
    ] as const) {
      const s: ContextoSesion = { usuarioId, tenantId, rol: 'admin' }
      const prep = await enTransaccionDeSesion(db, s, () =>
        preparacionDelCatalogo(db, { sesion: s, hoy: hoyEnMexico() }),
      )
      if (prep.length === 0) {
        comprobar('6', `${nombre} tiene actividad contratada`, false, 'ninguna')
        continue
      }
      for (const a of prep) {
        const puede = [
          a.puedeCapturarOperacion ? 'capturar' : null,
          a.puedeAbrirExpediente ? 'expediente' : null,
          a.puedeGenerarAviso ? 'aviso' : null,
        ].filter((x) => x !== null)
        console.log(`     ${nombre} → ${puede.join(' · ') || 'nada'}`)
        // Capturar es la acción mínima: sin ella el obligado no puede ni
        // empezar, y eso NO puede pasar desapercibido en un ensayo.
        comprobar('6', `${nombre} puede capturar una operación`, a.puedeCapturarOperacion, 'no')
        for (const f of a.faltantes) {
          console.log(`       ⬚ falta ${f.nombre.toLowerCase()} — ${f.bloquea.slice(0, 90)}…`)
        }
      }
    }

    console.log(
      fallos === 0
        ? '\n✓ El guion completo se sostiene contra la base.\n'
        : `\n✗ ${String(fallos)} afirmación(es) del guion NO se sostienen.\n`,
    )
  } finally {
    await db.end()
  }
  if (fallos > 0) process.exit(1)
}

await main()
