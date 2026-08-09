-- VIZO · Migración 018 — La aplicación deja de ser superusuario
--
-- ARREGLO DE RAÍZ DEL HALLAZGO DE LA AUDITORÍA DE LA SEMANA 5.
--
-- Lo que se corrigió entonces fue el síntoma: cada escritura pasa por
-- `enTransaccionDeSesion`, que baja el rol a `authenticated` y planta los
-- claims. Funciona, y hay tests que se ponen rojos si alguien lo quita.
--
-- Pero la causa seguía viva: la aplicación se conecta con `VIZO_DB_URL`, que
-- apunta al rol `postgres`, y `postgres` tiene `rolbypassrls = true`. O sea que
-- la protección dependía de ACORDARSE de usarla. El orden de preferencia de
-- CLAUDE.md dice que eso es el último recurso, no el primero:
--
--   1. Que no se pueda expresar   <- esto
--   2. Que lo impida la base
--   3. Que lo detecte una precondición  <- donde estábamos
--
-- `vizo_app` no tiene BYPASSRLS. Con él, olvidar el cambio de rol deja de ser
-- un agujero silencioso y se convierte en un `permission denied` inmediato.
--
-- NOINHERIT es deliberado. Sin él, `vizo_app` heredaría los permisos de
-- `authenticated` sin pedirlos, y una consulta que olvidara `set local role`
-- funcionaría igual —correctamente filtrada por RLS, pero por accidente—. Con
-- NOINHERIT, el rol de conexión no puede hacer NADA por sí mismo: tiene que
-- asumir `authenticated` explícitamente. El olvido falla ruidosamente, que es
-- lo que se quiere de una capa de seguridad.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vizo_app') then
    -- Sin contraseña: no se puede conectar hasta que alguien se la ponga.
    -- La de desarrollo la pone `supabase/seed.sql`, que solo corre en local;
    -- la de producción se carga a mano y nunca toca el repositorio.
    create role vizo_app with
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls
      noreplication;
  end if;
end;
$$;

-- Para poder hacer `set local role authenticated`. Ser MIEMBRO permite
-- asumirlo; con NOINHERIT, permite solo eso y nada más.
grant authenticated to vizo_app;

-- Lo mínimo para abrir la transacción y plantar los claims antes de asumir el
-- otro rol. Nada de datos: eso llega con `authenticated`.
grant usage on schema public, app to vizo_app;

comment on role vizo_app is
  'Rol de conexión de la aplicación. Sin BYPASSRLS y NOINHERIT: solo puede trabajar tras asumir authenticated. Ver ADR-18.';

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  select rolsuper, rolbypassrls, rolinherit, rolcanlogin
    into r from pg_catalog.pg_roles where rolname = 'vizo_app';

  if not found then
    raise exception 'No se creó el rol vizo_app';
  end if;
  if r.rolsuper or r.rolbypassrls then
    raise exception 'vizo_app NO puede ser superusuario ni saltarse RLS (super=%, bypassrls=%)',
      r.rolsuper, r.rolbypassrls;
  end if;
  if r.rolinherit then
    raise exception 'vizo_app debe ser NOINHERIT: si hereda, un olvido de set role pasa desapercibido';
  end if;
  if not r.rolcanlogin then
    raise exception 'vizo_app necesita LOGIN: es el rol con el que se conecta la aplicación';
  end if;

  if not pg_catalog.pg_has_role('vizo_app', 'authenticated', 'MEMBER') then
    raise exception 'vizo_app no puede asumir authenticated, así que no podría trabajar';
  end if;

  raise notice 'Rol de aplicación: OK. vizo_app existe, sin BYPASSRLS, NOINHERIT, miembro de authenticated.';
end;
$$;
