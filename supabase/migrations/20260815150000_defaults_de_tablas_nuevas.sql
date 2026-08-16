-- ---------------------------------------------------------------------------
-- Que una tabla nueva nazca sin permisos que nadie pidió
-- ---------------------------------------------------------------------------
-- HALLAZGO AL DESPLEGAR LAS MIGRACIONES DEL 15 Y 16 DE AGOSTO.
--
-- `20260815160000_designacion_rec.sql` pasó en local y **su aserción reventó en
-- producción**, con este mensaje:
--
--     designaciones_rec: anon tiene INSERT sobre esta tabla y no está en
--     app.privilegios_declarados
--     designaciones_rec: anon tiene UPDATE …
--     designaciones_rec: anon tiene DELETE …
--     designaciones_rec: authenticated tiene UPDATE …
--     designaciones_rec: authenticated tiene DELETE …
--
-- Es la tercera vez que este proyecto se topa con los privilegios que Supabase
-- concede sin que nadie los pida —ADR-17 fue la primera, la migración 040 la
-- segunda— y esta vez con la variante más incómoda de todas.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ LOCAL NO PODÍA VERLO
-- ────────────────────────────────────────────────────────────────────────────
-- Los `default privileges` cuelgan del ROL QUE CREA el objeto, y los dos
-- entornos no tienen los mismos:
--
--   rol dueño del default   local   producción
--   ─────────────────────   ─────   ──────────
--   supabase_admin            sí        sí
--   postgres                  NO        SÍ      ← la diferencia
--
-- Las migraciones corren como `postgres`. En local ese rol no tiene defaults en
-- `public`, así que una tabla nueva nace limpia y la aserción pasa. En
-- producción sí los tiene —DELETE, INSERT, SELECT, UPDATE para `anon` y para
-- `authenticated`— y toda tabla nueva nace concedida.
--
-- Las migraciones 014 y 040 LIMPIARON las tablas que existían en ese momento.
-- Ninguna tocó los defaults, así que la fuente seguía abierta: la limpieza se
-- hizo una vez y el grifo quedó goteando. `designaciones_rec` es la primera
-- tabla creada en producción desde entonces, y salió con los cinco permisos.
--
-- ────────────────────────────────────────────────────────────────────────────
-- QUÉ SE REVOCA Y QUÉ NO
-- ────────────────────────────────────────────────────────────────────────────
-- Se revocan los siete que ninguna tabla debe conceder sola: los tres de
-- escritura (INSERT, UPDATE, DELETE), que la migración 040 declara uno por uno,
-- y los cuatro de ADR-17 (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN).
--
-- **SELECT se queda**, y es deliberado: el modelo del proyecto es que la
-- lectura la filtra RLS, y toda tabla concede SELECT explícitamente. Quitarlo
-- del default aquí cambiaría el comportamiento de lectura de la aplicación en
-- una migración que se llama «defaults», que es exactamente el tipo de efecto
-- lateral que este archivo existe para impedir.
--
-- No se tocan los defaults de `supabase_admin`: hacerlo exige ser miembro de ese
-- rol, y el intento abortaría la migración. Como las migraciones corren como
-- `postgres`, sus defaults son los que mandan sobre lo que este proyecto crea.

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger, maintain
  on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- El verificador, para que la próxima vez no haga falta un despliegue fallido
-- ---------------------------------------------------------------------------
-- `app.verificar_privilegios_por_omision()` revisa las tablas QUE YA EXISTEN.
-- Esta revisa lo que va a heredar la SIGUIENTE, que es lo que faltaba: entre
-- las dos, el grifo y el charco.
create or replace function app.verificar_defaults_de_tablas_nuevas()
returns table (rol text, problema text)
language sql
stable
set search_path = ''
as $$
  select g.grantee::regrole::text,
         format('las tablas nuevas de public nacerán con %s para %s, y nadie lo pidió',
                g.privilege_type, g.grantee::regrole::text)
    from pg_catalog.pg_default_acl d
    join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) g
   where n.nspname = 'public'
     and d.defaclobjtype = 'r'
     and d.defaclrole = 'postgres'::regrole
     and g.grantee::regrole::text in ('anon', 'authenticated')
     and g.privilege_type in
         ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
   order by 1, 2;
$$;

comment on function app.verificar_defaults_de_tablas_nuevas() is
  'Revisa lo que HEREDARÁ la próxima tabla de public, no lo que tienen las que ya existen. Nació porque una migración pasó en local y reventó en producción: los default privileges cuelgan del rol creador y los dos entornos no tenían los mismos.';

-- ---------------------------------------------------------------------------
-- Aserción: se comprueba con una tabla DE VERDAD
-- ---------------------------------------------------------------------------
-- Mirar `pg_default_acl` diría que el catálogo quedó como se pidió. Crear una
-- tabla dice lo que de hecho le pasa a una tabla, que es la afirmación que
-- importa y la única que se comporta igual en los dos entornos.
do $$
declare v_sobrantes text;
begin
  create table public.asercion_defaults_efimera (id int);

  select string_agg(format('%s: %s', g.grantee::regrole::text, g.privilege_type), ', ')
    into v_sobrantes
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) g
   where n.nspname = 'public' and c.relname = 'asercion_defaults_efimera'
     and g.grantee::regrole::text in ('anon', 'authenticated')
     and g.privilege_type in
         ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');

  drop table public.asercion_defaults_efimera;

  if v_sobrantes is not null then
    raise exception 'Una tabla recién creada sigue naciendo con permisos que nadie pidió: %', v_sobrantes;
  end if;

  select string_agg(rol || ': ' || problema, E'\n')
    into v_sobrantes from app.verificar_defaults_de_tablas_nuevas();
  if v_sobrantes is not null then
    raise exception 'Los defaults siguen abiertos:%s', E'\n' || v_sobrantes;
  end if;

  raise notice '✓ defaults: una tabla nueva de public nace sin escritura para anon ni authenticated';
end $$;
