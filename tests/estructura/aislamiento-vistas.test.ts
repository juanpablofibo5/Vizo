import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'

/**
 * Una vista no es una ventana: es una puerta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO
 * ────────────────────────────────────────────────────────────────────────────
 * `operaciones_vigentes` se creó sin `security_invoker`. Una vista así evalúa
 * permisos y políticas **como su dueño** — que es `postgres`, que tiene
 * `rolbypassrls`. Resultado: RLS no se aplicaba al consultarla.
 *
 *     como authenticated de un obligado con 1 operación
 *       select count(*) from operaciones            →   1
 *       select count(*) from operaciones_vigentes   → 298, de 246 obligados
 *
 * Se descubrió al desplegar a producción, porque el linter de Supabase lo marcó.
 * No lo encontró ninguna prueba nuestra: las de aislamiento miraban TABLAS, y
 * un `create view` se lee como algo inocente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE TEST, ADEMÁS DE LA ASERCIÓN
 * ────────────────────────────────────────────────────────────────────────────
 * La migración ya comprueba estructuralmente que ninguna vista de `public` se
 * quede sin la opción. Esto comprueba el COMPORTAMIENTO: dos obligados reales,
 * la sesión de uno, y las filas del otro que no aparecen. Si algún día la
 * opción existiera y aun así filtrara —otro dueño, otra ruta—, la aserción
 * seguiría contenta y este test no.
 */
describe('Las vistas no se saltan RLS', () => {
  let db: Client
  let a: ContextoSesion
  let b: ContextoSesion
  let actividadId: string

  beforeAll(async () => {
    db = await conectar()
    const { rows } = await db.query(
      `select id::text from actividades_vulnerables where fraccion = 'V_BIS'`,
    )
    actividadId = (rows[0] as { id: string }).id

    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    a = await crearTenantConUsuario(db, `VA${marca}`, 'admin')
    b = await crearTenantConUsuario(db, `VB${marca}`, 'admin')

    // Una operación que es de B y solo de B.
    for (const s of [a, b]) {
      await db.query(`insert into actividades_tenant (tenant_id, actividad_id) values ($1,$2)`, [
        s.tenantId,
        actividadId,
      ])
    }
    const suc = await db.query(
      `insert into sucursales (tenant_id,nombre,clave) values ($1,'Matriz','MTZ') returning id`,
      [b.tenantId],
    )
    const cli = await db.query(
      `insert into clientes_finales (tenant_id,tipo_persona,rfc,nombre_o_razon_social,nacionalidad)
       values ($1,'moral',$2,'Cliente de B','MX') returning id`,
      [b.tenantId, `VIS${marca}`],
    )
    // La Fr. V Bis exige desarrollo desde `operaciones_exigen_desarrollo`: una
    // operación sin él saldría del aviso en silencio.
    const des = await db.query(
      `insert into desarrollos_inmobiliarios
         (tenant_id,nombre,registro_licencia,entidad_federativa,codigo_postal,colonia,calle,
          tipo_desarrollo,monto_desarrollo,unidades_comercializadas,costo_unidad,
          otras_empresas,objeto_aviso_anterior)
       values ($1,'Torre B','LICVIS0001','31','97000','CENTRO','CALLE 60','5',
               50000000.00,120.00,941412.75,false,false) returning id`,
      [b.tenantId],
    )
    await db.query(
      `insert into operaciones (tenant_id,sucursal_id,cliente_id,actividad_id,fecha_operacion,
                                monto_base,iva,isai,otros_accesorios,monto_total,forma_pago,
                                desarrollo_id)
       values ($1,$2,$3,$4,current_date,1000.00,0,0,0,1000.00,'03',$5)`,
      [b.tenantId, (suc.rows[0] as { id: string }).id, (cli.rows[0] as { id: string }).id,
       actividadId, (des.rows[0] as { id: string }).id],
    )
  })

  afterAll(async () => {
    await db.end()
  })

  const contarComo = async (sesion: ContextoSesion, sql: string): Promise<number> =>
    enTransaccionDeSesion(db, sesion, async () => {
      const { rows } = await db.query(sql)
      return (rows[0] as { n: number }).n
    })

  it('B ve su operación por la vista', async () => {
    // El control positivo. Sin él, un test que solo comprueba que A no ve nada
    // pasaría igual si la vista estuviera rota y no devolviera NADA a nadie —
    // que es la forma más fácil de "arreglar" una fuga sin arreglarla.
    expect(await contarComo(b, 'select count(*)::int as n from operaciones_vigentes')).toBe(1)
  })

  it('A NO ve la operación de B por la vista', async () => {
    expect(await contarComo(a, 'select count(*)::int as n from operaciones_vigentes')).toBe(0)
  })

  it('la vista y la tabla cuentan lo mismo: no hay un camino más permisivo', async () => {
    // El corazón del defecto. La tabla siempre filtró bien; la vista sobre la
    // misma tabla, no. Dos respuestas distintas a la misma pregunta es la señal.
    const porLaTabla = await contarComo(a, 'select count(*)::int as n from operaciones')
    const porLaVista = await contarComo(a, 'select count(*)::int as n from operaciones_vigentes')
    expect(porLaVista).toBe(porLaTabla)
  })

  it('ninguna vista de public queda evaluando RLS como su dueño', async () => {
    // La misma aserción que corre en cada migración, ejercida también aquí:
    // una vista nueva nace SIN la opción, así que el agujero se reabre solo y
    // no aparece en la revisión del código.
    await expect(db.query('select app.verificar_vistas_invocador()')).resolves.toBeDefined()

    const { rows } = await db.query(
      `select count(*)::int as n
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v','m')
          and coalesce(
                (select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') <> 'true'`,
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })
})
