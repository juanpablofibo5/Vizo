-- VIZO · Migración 001 (parte 8/8) — Grants y verificaciones estructurales
--
-- Las reglas duras de CLAUDE.md son advisory mientras nadie las verifique.
-- Este archivo las vuelve ejecutables: si alguna se viola, la migración FALLA
-- y el CI se pone rojo. Nadie olvida una política RLS por accidente.
--
-- Las aserciones quedan como funciones para poder llamarlas desde los tests.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- RLS y GRANT son dos capas distintas y AMBAS hacen falta: el grant decide si
-- puedes tocar la tabla, la política decide qué filas ves. Una tabla con RLS
-- perfecta y sin grant es simplemente inaccesible — un modo de falla que se
-- ve idéntico a "la política está mal escrita". La aserción 4 lo detecta.
--
-- anon no recibe nada: en v1 no hay superficie pública. Cuando llegue el link
-- de captura al comprador, sus permisos se otorgan ahí y en ningún otro lado.

-- Catálogo regulatorio: la aplicación LEE, nunca escribe. La única vía de
-- escritura es migración o seed.
grant select on
  uma_vigencias, actividades_vulnerables, umbrales,
  campos_expediente, formatos_aviso, parametros_motor
  to authenticated;

-- Tenancy
grant select                         on tenants, actividades_tenant to authenticated;
grant select, insert, update, delete on sucursales, usuarios        to authenticated;

-- Núcleo: mutable
grant select, insert, update on
  clientes_finales, beneficiarios_controladores, expedientes, alertas
  to authenticated;

-- Núcleo: APPEND-ONLY. Se otorga insert pero jamás update ni delete.
grant select, insert on
  bitacora, operaciones, evaluaciones_umbral, documentos, manifiestos
  to authenticated;
grant select on operaciones_vigentes to authenticated;

-- Aviso
grant select, insert, update on avisos            to authenticated;
grant select, insert         on aviso_operaciones to authenticated;

-- Esqueleto post-MVP: solo lectura. Nadie escribe aquí en v1, y el grant lo
-- hace cierto además de documentarlo.
grant select on
  consultas_screening, factores_riesgo, casos, verificaciones_kyc,
  sellos_nom151, personas, consentimientos_comparticion
  to authenticated;

-- Cinturón además del tirante: los triggers ya detienen la mutación, pero
-- sin el permiso ni siquiera se intenta.
revoke update, delete on
  bitacora, operaciones, evaluaciones_umbral, documentos, manifiestos, sellos_nom151
  from authenticated, anon;

grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Aserción 1: ninguna tabla sin RLS
-- ---------------------------------------------------------------------------
create or replace function app.verificar_rls()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text, 'sin RLS habilitada'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
  union all
  -- Una tabla con RLS pero sin ninguna política es invisible para todos, lo
  -- que en la práctica es un bug silencioso.
  select c.relname::text, 'RLS habilitada pero sin políticas'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                     where p.schemaname = 'public' and p.tablename = c.relname);
$$;

-- ---------------------------------------------------------------------------
-- Aserción 2: las tablas append-only no tienen políticas de UPDATE/DELETE
-- ---------------------------------------------------------------------------
create or replace function app.verificar_append_only()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  with append_only(nombre) as (
    values ('bitacora'), ('operaciones'), ('evaluaciones_umbral'),
           ('documentos'), ('manifiestos'), ('sellos_nom151')
  )
  select a.nombre, format('tiene política %s de %s', p.policyname, p.cmd)
  from append_only a
  join pg_policies p on p.schemaname = 'public' and p.tablename = a.nombre
  where p.cmd in ('UPDATE', 'DELETE', 'ALL')
  union all
  -- ...y sí tienen el trigger que bloquea la mutación.
  select a.nombre, 'le falta el trigger que bloquea UPDATE/DELETE'
  from append_only a
  where not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc pr on pr.oid = t.tgfoid
    where c.relname = a.nombre
      and pr.proname = 'prohibir_mutacion'
      and not t.tgisinternal
  )
  union all
  -- ...y nadie tiene el permiso de mutarlas, ni siquiera para intentarlo.
  select a.nombre, format('%s conserva permiso de %s', g.grantee, g.privilege_type)
  from append_only a
  join information_schema.role_table_grants g
    on g.table_schema = 'public' and g.table_name = a.nombre
  where g.grantee in ('authenticated', 'anon')
    and g.privilege_type in ('UPDATE', 'DELETE');
$$;

-- ---------------------------------------------------------------------------
-- Aserción 3: toda tabla del tenant tiene tenant_id
-- ---------------------------------------------------------------------------
-- Excepciones documentadas: el catálogo regulatorio es global, y `personas`
-- es cross-tenant por diseño del flujo multi-parte (ADR-15).
create or replace function app.verificar_tenancy()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  with exentas(nombre) as (
    values ('uma_vigencias'), ('actividades_vulnerables'), ('umbrales'),
           ('campos_expediente'), ('formatos_aviso'), ('parametros_motor'),
           ('tenants'), ('usuarios'), ('personas')
  )
  select c.relname::text, 'no tiene columna tenant_id y no está en la lista de exentas'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in (select nombre from exentas)
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'tenant_id'
        and a.attnum > 0 and not a.attisdropped
    );
$$;

-- ---------------------------------------------------------------------------
-- Aserción 4: RLS sin GRANT es una tabla muerta
-- ---------------------------------------------------------------------------
-- Esta existe porque el modo de falla ya ocurrió durante el desarrollo de la
-- migración 001: políticas correctas, cero grants, y toda consulta devolvía
-- "permission denied" — que se lee como un error de política y no lo es.
create or replace function app.verificar_grants()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text, 'tiene RLS y políticas pero authenticated no tiene GRANT SELECT'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and exists (select 1 from pg_policies p
                 where p.schemaname = 'public' and p.tablename = c.relname)
    and not exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = c.relname
        and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
    );
$$;

-- ---------------------------------------------------------------------------
-- Correr las cuatro ahora. Si algo falla, la migración no pasa.
-- ---------------------------------------------------------------------------
do $$
declare
  v_problemas text;
begin
  select string_agg(format('  · %s: %s', tabla, problema), e'\n')
    into v_problemas
  from (
    select * from app.verificar_rls()
    union all
    select * from app.verificar_append_only()
    union all
    select * from app.verificar_tenancy()
    union all
    select * from app.verificar_grants()
  ) t;

  if v_problemas is not null then
    raise exception e'La migración viola reglas estructurales de VIZO:\n%', v_problemas;
  end if;

  raise notice 'Verificaciones estructurales: OK (RLS, append-only, tenancy, grants)';
end;
$$;
