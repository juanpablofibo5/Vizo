import { Client } from 'pg'
import { URL_DB_LOCAL } from './db'

/**
 * Lo que la suite deja atrás.
 *
 * AUDITORÍA DE LA SEMANA 8, defecto 4. Un test creaba una copia de la bitácora
 * en `public` para poder alterarla sin tocar la real —bien— y la dejaba ahí al
 * terminar: una tabla con eventos reales, sin RLS y sin políticas. Cualquiera
 * con sesión la leía completa, de todos los obligados.
 *
 * Lo revelador es que la aserción estructural del proyecto SÍ detecta tablas
 * sin RLS. Nunca se enteró porque `test:estructura` corre `supabase db reset`
 * antes del smoke: el reset borraba la evidencia antes de mirarla. La guarda
 * era correcta y el orden en que se corría la dejaba ciega.
 *
 * Esto la mira donde importa: DESPUÉS de la suite, sobre lo que la suite dejó.
 * El defecto concreto ya no se puede repetir —la copia vive en `pg_temp`—, pero
 * esto cubre al que venga después y no lo sepa.
 *
 * Solo mira; no limpia. Borrar en silencio dejaría pasar el siguiente.
 */
export async function teardown(): Promise<void> {
  const db = new Client({ connectionString: URL_DB_LOCAL })
  await db.connect()
  try {
    const { rows } = await db.query(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and (not c.relrowsecurity
               or not exists (select 1 from pg_policy p where p.polrelid = c.oid))
        order by c.relname`,
    )
    if (rows.length > 0) {
      const tablas = (rows as Array<{ relname: string }>).map((r) => r.relname).join(', ')
      throw new Error(
        `La suite dejó tablas en 'public' sin RLS o sin políticas: ${tablas}. ` +
          'Una tabla sin RLS es un incidente de seguridad, no un pendiente ' +
          '(CLAUDE.md). Si es una tabla auxiliar de un test, créala como ' +
          '`create temp table`: vive en la sesión y muere con ella.',
      )
    }
  } finally {
    await db.end()
  }
}
