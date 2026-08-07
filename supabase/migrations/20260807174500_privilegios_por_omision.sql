-- VIZO · Migración 014 — Los privilegios que Supabase concede por omisión
--
-- HALLAZGO DE LA AUDITORÍA DE LA SEMANA 5.
--
-- La migración 008 concede permisos con cuidado quirúrgico y remata con un
-- "cinturón además del tirante":
--
--     revoke update, delete on bitacora, operaciones, ... from authenticated, anon;
--
-- El cinturón no servía. Supabase instala privilegios POR OMISIÓN en el
-- esquema public:
--
--     alter default privileges ... grant D,x,t,m on tables to anon, authenticated, service_role
--
-- donde D = TRUNCATE, x = REFERENCES, t = TRIGGER, m = MAINTAIN. Se aplican a
-- toda tabla nueva ANTES de que esta migración conceda nada, y ningún `grant`
-- del proyecto los menciona, así que nadie los ve al leer el código. Eran 248
-- concesiones vivas sobre 31 tablas.
--
-- Lo que eso rompía, comprobado contra la base local:
--
--   * `delete from bitacora`   -> permission denied      (el cinturón sí sirve)
--   * `update bitacora set ...`-> permission denied      (el cinturón sí sirve)
--   * `truncate bitacora`      -> BORRÓ la bitácora de TODOS los obligados
--
-- El comentario de la migración 004 sobre el trigger append-only dice: "Aplica
-- incluso a service_role y al owner: no existe ruta administrativa que
-- reescriba el historial 'solo esta vez'". Era falso. Los triggers `for each
-- row` no se disparan con TRUNCATE, y TRUNCATE no consulta RLS.
--
-- ALCANCE REAL: PostgREST no expone TRUNCATE, así que esto no se alcanzaba
-- desde la API pública con la llave publicable. Se alcanzaba desde cualquier
-- ruta que ejecute SQL bajo esos roles. No era una puerta abierta a la calle;
-- era una puerta sin cerradura dentro de la casa, en el cuarto donde se guarda
-- lo único que se defiende ante la autoridad.
--
-- Se corrige en tres capas, en el orden de preferencia de CLAUDE.md:
--   1. Quitar el privilegio de las tablas que ya existen.
--   2. Quitarlo de los privilegios por omisión, para las tablas que no existen.
--   3. Un trigger de TRUNCATE en las append-only, que aguanta aunque un día
--      alguien vuelva a conceder el permiso.
-- Más una aserción que revienta la migración si algo de esto se desanda.

-- ---------------------------------------------------------------------------
-- 1. Las tablas que ya existen
-- ---------------------------------------------------------------------------
-- Un rol de aplicación no necesita ninguno de los cuatro: no crea triggers, no
-- declara llaves foráneas, no hace mantenimiento y jamás vacía una tabla.
revoke truncate, references, trigger, maintain
  on all tables in schema public
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Las tablas que todavía no existen
-- ---------------------------------------------------------------------------
-- Sin esto, la tabla `documentos_expediente` de la semana 6 nacería otra vez
-- con TRUNCATE para cualquiera con sesión. La corrección tiene que valer para
-- el futuro, no solo para lo que hoy está en el esquema.
alter default privileges in schema public
  revoke truncate, references, trigger, maintain on tables
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. El trigger que hace cierto el comentario de la migración 004
-- ---------------------------------------------------------------------------
-- `app.prohibir_mutacion()` ya sirve tal cual: es incondicional y arma el
-- mensaje con tg_op, así que dice "TRUNCATE no está permitido" sin tocarla.
--
-- A diferencia de un grant, esto aplica también a postgres y a service_role.
-- Es la única capa que sobrevive a que alguien, con toda la buena intención,
-- vuelva a conceder permisos amplios en un `psql` un martes por la tarde.
create trigger bitacora_no_truncate
  before truncate on bitacora
  for each statement execute function app.prohibir_mutacion();

create trigger operaciones_no_truncate
  before truncate on operaciones
  for each statement execute function app.prohibir_mutacion();

create trigger evaluaciones_umbral_no_truncate
  before truncate on evaluaciones_umbral
  for each statement execute function app.prohibir_mutacion();

create trigger documentos_no_truncate
  before truncate on documentos
  for each statement execute function app.prohibir_mutacion();

create trigger manifiestos_no_truncate
  before truncate on manifiestos
  for each statement execute function app.prohibir_mutacion();

create trigger sellos_nom151_no_truncate
  before truncate on sellos_nom151
  for each statement execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 4. La aserción
-- ---------------------------------------------------------------------------
-- Las otras cuatro aserciones (`app.verificar_*`) revisan lo que el proyecto
-- ESCRIBE. Esta revisa lo que el proyecto RECIBE sin pedirlo, que es
-- justamente lo que nadie encuentra leyendo las migraciones.
--
-- Se consulta pg_class.relacl y no information_schema: MAINTAIN es una
-- extensión de PostgreSQL y no aparece en las vistas del estándar.
create or replace function app.verificar_privilegios_por_omision()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text,
         format('%s tiene %s sobre esta tabla y ningún grant del proyecto se lo dio',
                g.grantee::regrole::text, g.privilege_type)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) g
   where n.nspname = 'public'
     and c.relkind = 'r'
     and g.grantee::regrole::text in ('anon', 'authenticated')
     and g.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
   order by 1, 2;
$$;

do $$
declare
  v_problemas text;
  v_triggers  int;
begin
  select string_agg(format('  - %s: %s', tabla, problema), e'\n')
    into v_problemas
    from app.verificar_privilegios_por_omision();

  if v_problemas is not null then
    raise exception e'Privilegios concedidos por omisión que nadie pidió:\n%', v_problemas;
  end if;

  -- Que los seis triggers existan de verdad, no que se hayan escrito.
  select count(*) into v_triggers
    from pg_catalog.pg_trigger
   where tgname like '%\_no\_truncate' and not tgisinternal;

  if v_triggers <> 6 then
    raise exception 'Se esperaban 6 guardias de TRUNCATE en las tablas append-only, hay %', v_triggers;
  end if;

  raise notice 'Privilegios por omisión: OK. 4 privilegios revocados de anon y authenticated, 6 guardias de TRUNCATE.';
end;
$$;
