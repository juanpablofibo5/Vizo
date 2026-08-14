-- ---------------------------------------------------------------------------
-- Lo que no está declarado, no se puede escribir
-- ---------------------------------------------------------------------------
-- HALLAZGO AL DESPLEGAR EL PORTAL.
--
-- La migración anterior —dejar que un admin registre la fecha de alta de su
-- obligado— pasó en local y **su aserción reventó en producción**:
--
--     Un admin pudo cambiar el RFC de su obligado desde el portal.
--
-- La causa no estaba en esa migración. Producción tenía INSERT, UPDATE y DELETE
-- sobre CASI TODAS las tablas de `public`, concedidos a `anon` y a
-- `authenticated`, que ninguna migración pidió: ~170 privilegios de escritura
-- contra los 27 que el proyecto declara. Incluidas las tablas del catálogo
-- regulatorio —`umbrales`, `uma_vigencias`, `parametros_motor`— que son el
-- producto.
--
-- ¿ERA EXPLOTABLE? No, y por una sola razón: RLS. Se comprobó tabla por tabla —
-- todas las afectadas tienen RLS activa, y las del catálogo no tienen ninguna
-- política de escritura, así que el privilegio no alcanzaba a nada. `anon` no
-- aparece en ninguna política, así que tampoco.
--
-- Y AUN ASÍ IMPORTA, por lo que pasó en el intento anterior: el privilegio de
-- más estaba dormido esperando que alguien escribiera una política. En el
-- momento en que se añadió una —legítima, para la fecha de alta— el privilegio
-- se despertó y con él la posibilidad de reescribir el RFC, que es la unidad de
-- cobro y la llave del aislamiento. Una capa sostenía sola algo que se diseñó
-- con dos, y la segunda no estaba.
--
-- ADR-17 vigila TRUNCATE, REFERENCES, TRIGGER y MAINTAIN, que es lo que Supabase
-- concede por `default privileges`. Esto es la otra mitad: INSERT, UPDATE y
-- DELETE, que no se vigilaban porque ALGUNOS son legítimos. La forma de
-- vigilarlos sin prohibirlos es declararlos.

-- ---------------------------------------------------------------------------
-- 1. Los privilegios de escritura que el proyecto SÍ quiere
-- ---------------------------------------------------------------------------
create table app.privilegios_declarados (
  tabla      text not null,
  rol        text not null,
  privilegio text not null,
  -- NULL = la tabla entera. Va en un índice y no en la clave primaria porque
  -- una columna de PK es NOT NULL implícita, y aquí el NULL significa algo.
  columna    text,
  motivo     text not null,
  constraint privilegio_de_escritura check (privilegio in ('INSERT','UPDATE','DELETE')),
  -- `anon` es quien no ha iniciado sesión. No escribe NADA, nunca, y por eso ni
  -- siquiera se puede declarar: el CHECK lo vuelve inexpresable.
  constraint solo_authenticated check (rol = 'authenticated')
);

create unique index privilegios_declarados_unico
  on app.privilegios_declarados (tabla, rol, privilegio, coalesce(columna, ''));

comment on table app.privilegios_declarados is
  'El inventario de lo que puede escribirse y por qué. app.verificar_privilegios_declarados() falla si la base concede algo que no está aquí. Una migración que otorgue un privilegio nuevo agrega su fila; si no la agrega, la aserción la detiene.';

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('alertas','authenticated','INSERT',null,'el motor levanta alertas'),
  ('alertas','authenticated','UPDATE',null,'se cierran con una revisión humana'),
  ('aviso_lotes','authenticated','INSERT',null,'los fragmentos del aviso'),
  ('aviso_operaciones','authenticated','INSERT',null,'qué operaciones fueron en cada aviso'),
  ('avisos','authenticated','INSERT',null,'generar el aviso del periodo'),
  ('avisos','authenticated','UPDATE',null,'el pipeline de estados hasta presentado'),
  ('beneficiarios_controladores','authenticated','INSERT',null,'alta del expediente'),
  ('beneficiarios_controladores','authenticated','UPDATE',null,'corrección de datos del expediente'),
  ('bitacora','authenticated','INSERT',null,'append-only: solo se agrega, nunca se cambia'),
  ('clientes_finales','authenticated','INSERT',null,'alta de cliente'),
  ('clientes_finales','authenticated','UPDATE',null,'corrección de datos del cliente'),
  ('desarrollos_inmobiliarios','authenticated','INSERT',null,'alta de desarrollo'),
  ('desarrollos_inmobiliarios','authenticated','UPDATE',null,'corrección del desarrollo'),
  ('documentos','authenticated','INSERT',null,'append-only: reemplazar es una fila nueva'),
  ('evaluaciones_umbral','authenticated','INSERT',null,'append-only: el veredicto del motor no se reescribe'),
  ('expedientes','authenticated','INSERT',null,'abrir expediente'),
  ('expedientes','authenticated','UPDATE',null,'completitud y aprobación'),
  ('manifiestos','authenticated','INSERT',null,'append-only: la foto sellable no se toca'),
  ('operaciones','authenticated','INSERT',null,'append-only: corregir es una operación nueva'),
  ('representantes','authenticated','INSERT',null,'alta del expediente'),
  ('representantes','authenticated','UPDATE',null,'corrección de datos del expediente'),
  ('sucursales','authenticated','INSERT',null,'configuración del obligado'),
  ('sucursales','authenticated','UPDATE',null,'configuración del obligado'),
  ('sucursales','authenticated','DELETE',null,'una sucursal capturada por error, sin operaciones'),
  ('usuarios','authenticated','INSERT',null,'el admin da de alta usuarios de su obligado'),
  ('usuarios','authenticated','UPDATE',null,'el admin cambia rol y desactiva'),
  ('usuarios','authenticated','DELETE',null,'el admin retira un usuario'),
  ('tenants','authenticated','UPDATE','fecha_alta_autoridad',
   'POR COLUMNA: el admin registra desde cuándo debe informar. El RFC y la razón social quedan fuera a propósito');

-- ---------------------------------------------------------------------------
-- 2. La base se alinea con lo declarado
-- ---------------------------------------------------------------------------
do $$
declare v_tabla text;
begin
  -- Se quita TODO lo de escritura y se vuelve a conceder solo lo declarado. Es
  -- más simple y más seguro que ir restando diferencias: el estado final no
  -- depende de cuál era el estado inicial, que es justo lo que aquí falló.
  for v_tabla in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','v')
  loop
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_tabla);
  end loop;
end $$;

do $$
declare d record;
begin
  for d in select * from app.privilegios_declarados loop
    if d.columna is null then
      execute format('grant %s on public.%I to %I', d.privilegio, d.tabla, d.rol);
    else
      execute format('grant %s (%I) on public.%I to %I', d.privilegio, d.columna, d.tabla, d.rol);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. La verificación, que entra al smoke test
-- ---------------------------------------------------------------------------
create or replace function app.verificar_privilegios_declarados()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  -- Lo que la base concede y nadie declaró.
  select p.table_name::text,
         format('%s tiene %s sobre esta tabla y no está en app.privilegios_declarados',
                p.grantee, p.privilege_type)
    from information_schema.table_privileges p
   where p.table_schema = 'public'
     and p.grantee in ('anon', 'authenticated')
     and p.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     and not exists (
       select 1 from app.privilegios_declarados d
        where d.tabla = p.table_name and d.rol = p.grantee
          and d.privilegio = p.privilege_type and d.columna is null
     )
  union all
  -- Y lo declarado que la base dejó de conceder: una migración que revoque de
  -- más rompe la aplicación en silencio, y eso también hay que verlo.
  --
  -- Los dos catálogos, no uno: DELETE es un privilegio de TABLA y no aparece en
  -- `column_privileges` —ahí solo viven SELECT, INSERT, UPDATE y REFERENCES—.
  -- Buscar un DELETE declarado en el catálogo de columnas lo daba siempre por
  -- ausente, que fue lo primero que reportó esta misma aserción.
  select d.tabla,
         format('%s debería tener %s sobre %s y no lo tiene',
                d.rol, d.privilegio,
                coalesce('la columna ' || d.columna, 'esta tabla'))
    from app.privilegios_declarados d
   where (d.columna is null
          and not exists (
            select 1 from information_schema.table_privileges t
             where t.table_schema = 'public' and t.table_name = d.tabla
               and t.grantee = d.rol and t.privilege_type = d.privilegio))
      or (d.columna is not null
          and not exists (
            select 1 from information_schema.column_privileges c
             where c.table_schema = 'public' and c.table_name = d.tabla
               and c.grantee = d.rol and c.privilege_type = d.privilegio
               and c.column_name = d.columna));
$$;

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare
  v_problemas text;
  v_anon int;
begin
  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();

  if v_problemas is not null then
    raise exception 'Los privilegios de escritura no coinciden con lo declarado:%s', E'\n' || v_problemas;
  end if;

  -- `anon` no escribe nada. Ni tablas ni columnas.
  select count(*) into v_anon
    from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT','UPDATE','DELETE');

  if v_anon > 0 then
    raise exception 'anon —quien no ha iniciado sesión— conserva % privilegios de escritura en public.', v_anon;
  end if;

  raise notice '✓ privilegios de escritura: solo los declarados, solo authenticated';
end $$;
