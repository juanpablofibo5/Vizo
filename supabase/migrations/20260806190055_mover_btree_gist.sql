-- VIZO · Mover btree_gist fuera de public
--
-- El linter de seguridad de Supabase marca las extensiones instaladas en
-- `public`: es el esquema que PostgREST expone como API, así que los objetos
-- de la extensión quedan innecesariamente al alcance.
--
-- Los índices que ya usan sus operadores (las exclusion constraints de
-- vigencias del catálogo) referencian por OID, no por nombre, así que mover
-- la extensión no los rompe.

create schema if not exists extensions;
grant usage on schema extensions to authenticated, anon, service_role;

alter extension btree_gist set schema extensions;

-- Comprobación inmediata: las exclusion constraints siguen en pie. Si el
-- movimiento las hubiera roto, la migración falla aquí y no en producción.
do $$
declare v_n int;
begin
  select count(*) into v_n
  from pg_constraint
  where conname in ('uma_sin_traslape', 'umbral_sin_traslape',
                    'formato_sin_traslape', 'parametro_sin_traslape')
    and contype = 'x';

  if v_n <> 4 then
    raise exception 'Se esperaban 4 exclusion constraints intactas, hay %', v_n;
  end if;

  raise notice 'btree_gist movido a extensions; 4 exclusion constraints intactas';
end;
$$;
