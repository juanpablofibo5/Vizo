/**
 * Carga UNA lista de control como versión nueva del catálogo global.
 *
 *   pnpm tsx scripts/cargar-lista-screening.ts \
 *     --clave ofac_sdn --archivo ./sdn.csv --fuente https://www.treasury.gov/ofac/downloads/sdn.csv
 *
 * Corre con VIZO_DB_URL_ADMIN (como el seed y las migraciones): las listas son
 * catálogo GLOBAL y la aplicación no tiene escritura sobre ellas. El runbook
 * 06 documenta de dónde se descarga cada una y con qué cadencia.
 *
 * El hash que se registra es el del ARCHIVO CRUDO, antes de decodificar: es la
 * huella de lo que se descargó, verificable contra una nueva descarga.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { PARSERS } from '../src/catalogo/listas-screening'

const NOMBRES: Record<string, string> = {
  ofac_sdn: 'OFAC — Specially Designated Nationals',
  onu: 'Consejo de Seguridad de la ONU — lista consolidada',
  sat_69b: 'SAT — Art. 69-B del CFF (listado completo)',
  lpb: 'UIF — Lista de Personas Bloqueadas',
  generico: 'Carga genérica',
}
/** El 69-B del SAT llega en latin1; el resto en UTF-8. */
const LATIN1 = new Set(['sat_69b'])

function arg(nombre: string): string {
  const i = process.argv.indexOf(`--${nombre}`)
  const v = i === -1 ? undefined : process.argv[i + 1]
  if (v === undefined) {
    console.error(`Falta --${nombre}. Uso: --clave <ofac_sdn|sat_69b|generico> --archivo <ruta> --fuente <url>`)
    process.exit(1)
  }
  return v
}

async function main(): Promise<void> {
  const clave = arg('clave')
  const archivo = arg('archivo')
  const fuente = arg('fuente')
  // --parser permite cargar una clave real desde un CSV genérico convertido a
  // mano (la vía provisional del runbook 06 para ONU/LPB). El hash registrado
  // es el del archivo que se cargó — el convertido — y así debe decirse.
  const i = process.argv.indexOf('--parser')
  const claveParser = i === -1 ? clave : (process.argv[i + 1] ?? clave)

  const parser = PARSERS[claveParser]
  if (parser === undefined) {
    console.error(
      `«${claveParser}» no tiene parser (ONU y LPB están pendientes — runbook 06). Para la vía ` +
        'provisional: convierte a CSV genérico (encabezado nombre,rfc) y usa --parser generico.',
    )
    process.exit(1)
  }

  const crudo = readFileSync(archivo)
  const hash = createHash('sha256').update(crudo).digest('hex')
  const texto = crudo.toString(LATIN1.has(clave) ? 'latin1' : 'utf8')
  const entradas = parser(texto)

  const url = process.env['VIZO_DB_URL_ADMIN']
  if (url === undefined) {
    console.error('Falta VIZO_DB_URL_ADMIN (el rol de catálogo, como el seed).')
    process.exit(1)
  }
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    await db.query('begin')
    const l = await db.query(
      `insert into listas_screening (clave, nombre, fuente_url, descargada_en, hash_sha256, registros)
       values ($1,$2,$3,now(),$4,$5) returning id::text`,
      [clave, NOMBRES[clave] ?? clave, fuente, hash, entradas.length],
    )
    const listaId = (l.rows[0] as { id: string }).id

    const LOTE = 1000
    for (let i = 0; i < entradas.length; i += LOTE) {
      const lote = entradas.slice(i, i + LOTE)
      await db.query(
        `insert into entradas_lista (lista_id, tipo, nombre, rfc, datos)
         select $1, t.tipo, t.nombre, t.rfc, t.datos
           from jsonb_to_recordset($2::jsonb) as t(tipo text, nombre text, rfc text, datos jsonb)`,
        [listaId, JSON.stringify(lote)],
      )
    }
    await db.query('commit')
    console.log(
      `✓ ${clave}: ${String(entradas.length)} entradas · versión ${listaId}\n` +
        `  hash del archivo: ${hash}\n  fuente: ${fuente}`,
    )
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    await db.end()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
