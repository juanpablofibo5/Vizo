-- ---------------------------------------------------------------------------
-- Las tablas sin tenant_id se declaran, no se listan en una función
-- ---------------------------------------------------------------------------
-- HALLAZGO AL CREAR `apartados_manual`. El smoke test falló con:
--
--     FALLA 1c: tabla sin tenant_id
--
-- Y hacía bien: `apartados_manual` es catálogo global —como `umbrales` o
-- `campos_expediente`— y no lleva `tenant_id` a propósito. La verificación no
-- estaba equivocada; le faltaba saberlo.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE ESTABA MAL NO ERA LA LISTA, ERA DÓNDE VIVÍA
-- ────────────────────────────────────────────────────────────────────────────
-- Las nueve exentas estaban escritas dentro de `app.verificar_tenancy()`. Eso
-- significa que **cada tabla de catálogo nueva obliga a editar la función que
-- vigila**, y una función de vigilancia que se edita cada vez que aparece algo
-- que vigilar se va relajando sola. Además el motivo de cada exención no
-- quedaba en ningún lado: seis meses después nadie sabe si `personas` está ahí
-- porque es global o porque alguien tenía prisa.
--
-- Es el mismo problema que resolvió ADR-17 con los privilegios, y se resuelve
-- igual: **se declara**. Una tabla global es una fila con su motivo, y la
-- función lee la tabla. Quien agregue un catálogo nuevo escribe por qué no
-- lleva `tenant_id`, y quien lea la lista sabe qué decidió cada quien.
--
-- La verificación no se debilita: sigue fallando ante cualquier tabla sin
-- `tenant_id` que nadie haya declarado. Lo que cambia es que la excepción deja
-- de ser un secreto en el cuerpo de una función.

create table app.tablas_globales (
  tabla  text primary key,
  motivo text not null
);

comment on table app.tablas_globales is
  'Tablas de public que NO llevan tenant_id, con el motivo de cada una. app.verificar_tenancy() lee de aquí. Agregar una fila es declarar una excepción a propósito; olvidarla hace fallar el smoke test, que es lo que se quiere.';

insert into app.tablas_globales (tabla, motivo) values
  -- Catálogo regulatorio: el mismo dato rige para todos los obligados, y
  -- versionarlo por vigencia es lo que hace que una reforma sea un INSERT.
  ('uma_vigencias',           'catálogo regulatorio global, versionado por vigencia'),
  ('actividades_vulnerables', 'catálogo regulatorio global: las fracciones del Art. 17'),
  ('umbrales',                'catálogo regulatorio global, versionado por vigencia'),
  ('campos_expediente',       'catálogo regulatorio global, versionado por vigencia'),
  ('formatos_aviso',          'catálogo regulatorio global: qué XSD rige en qué periodo'),
  ('parametros_motor',        'catálogo regulatorio global, versionado por vigencia'),
  ('apartados_manual',        'catálogo regulatorio global: los 14 apartados del Art. 37 Bis'),
  ('catalogos_sat',           'catálogo global del SAT: códigos de forma de pago, moneda, giro y demás'),
  -- Las dos que no son catálogo, cada una por su propia razón.
  ('tenants',   'ES el obligado: su llave primaria es lo que las demás tablas referencian'),
  ('personas',  'ESQUELETO multi-parte (ADR-15): una persona sirve a varios obligados, así que el aislamiento va en la tabla puente y no aquí');

-- ---------------------------------------------------------------------------
-- La verificación deja de traer la lista adentro
-- ---------------------------------------------------------------------------
create or replace function app.verificar_tenancy()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text,
         'no tiene columna tenant_id y no está declarada en app.tablas_globales'
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in (select g.tabla from app.tablas_globales g)
    and not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = c.oid and a.attname = 'tenant_id'
        and a.attnum > 0 and not a.attisdropped
    );
$$;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare v_problemas text; v_sobra text;
begin
  -- 1. Con la lista declarada, no queda ninguna tabla sin explicar.
  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_tenancy();
  if v_problemas is not null then
    raise exception 'Tablas sin tenant_id y sin declarar:%s', E'\n' || v_problemas;
  end if;

  -- 2. Y NO sobra ninguna declaración, en los DOS sentidos: una exención para
  --    una tabla que ya no existe, o para una que sí tiene tenant_id. Las dos
  --    son permiso guardado sin uso, que es como se pudren las listas de
  --    excepciones — y la segunda la cazó esta misma aserción al escribirla:
  --    `usuarios` venía heredada de la lista vieja y sí tiene tenant_id.
  select string_agg(g.tabla, ', ') into v_sobra
    from app.tablas_globales g
   where not exists (
     select 1 from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = g.tabla
   )
      or exists (
     select 1 from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = g.tabla
        and a.attname = 'tenant_id' and a.attnum > 0 and not a.attisdropped
   );
  if v_sobra is not null then
    raise exception 'Exenciones que sobran (la tabla no existe, o sí tiene tenant_id): %', v_sobra;
  end if;

  -- 3. La verificación sigue mordiendo: una tabla nueva sin tenant_id y sin
  --    declarar tiene que aparecer. Sin esto, la lista declarada podría haber
  --    silenciado la comprobación en vez de organizarla.
  create table public.asercion_sin_tenant (id int);

  if not exists (select 1 from app.verificar_tenancy() where tabla = 'asercion_sin_tenant') then
    drop table public.asercion_sin_tenant;
    raise exception 'La verificación dejó pasar una tabla sin tenant_id: ya no protege nada.';
  end if;

  drop table public.asercion_sin_tenant;

  raise notice '✓ tablas_globales: las % exentas están declaradas con su motivo, y la verificación sigue mordiendo',
    (select count(*) from app.tablas_globales);
end $$;
