-- VIZO · Migración 015 — El expediente documental vive en Storage
--
-- Semana 6. Crea el bucket privado, sus políticas por obligado, y cierra en el
-- esquema `storage` el mismo agujero que la migración 014 cerró en `public`.
--
-- CONVENCIÓN DE RUTA:  {tenant_id}/{expediente_id}/{documento_id}
--
-- El tenant va PRIMERO y sin excepción. Las políticas de abajo lo leen con
-- storage.foldername(name)[1], así que la ruta no es una convención de estilo:
-- es el mecanismo de aislamiento. Un archivo guardado con otra forma de ruta
-- queda inaccesible, que es el modo de falla correcto.

-- ---------------------------------------------------------------------------
-- 1. El bucket
-- ---------------------------------------------------------------------------
-- PRIVADO. Un expediente PLD trae identificaciones oficiales y comprobantes de
-- domicilio: datos personales, y los biométricos de una credencial son datos
-- sensibles (regla dura 3). Nada de esto se sirve por URL pública; se accede
-- con URL firmada y de vida corta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expedientes', 'expedientes', false,
  20971520,  -- 20 MiB: una identificación escaneada no pesa más
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Políticas: cada obligado ve su carpeta y nada más
-- ---------------------------------------------------------------------------
-- Sin políticas, RLS niega todo y Storage queda inservible; con la política
-- equivocada, un obligado lee los expedientes de otro. Es la misma frontera
-- que las tablas, en otro sistema.
create policy "expedientes: leer solo lo del propio obligado"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'expedientes'
    and (storage.foldername(name))[1] = app.tenant_id()::text
  );

create policy "expedientes: escribir solo en la carpeta propia"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'expedientes'
    and (storage.foldername(name))[1] = app.tenant_id()::text
  );

-- NO hay política de UPDATE ni de DELETE, a propósito.
--
-- Un documento de expediente es evidencia. La tabla `documentos` es
-- append-only y corregir es insertar una fila nueva con `reemplaza_a`; si el
-- archivo de Storage sí se pudiera borrar o sobrescribir, la fila nueva
-- apuntaría a un hash que ya no se puede verificar y el manifiesto de la
-- semana 8 dejaría de significar algo.
--
-- Consecuencia asumida: si la transacción falla DESPUÉS de subir, el archivo
-- queda huérfano y nadie puede borrarlo desde la aplicación. Un archivo sin
-- fila que lo referencie es basura inofensiva; un archivo de evidencia
-- borrable no lo es. Por eso `subirDocumento` inserta la fila ANTES de subir:
-- si la subida falla, la transacción revierte y no queda ni fila ni archivo.

-- ---------------------------------------------------------------------------
-- 3. El mismo agujero de la migración 014, ahora en `storage`
-- ---------------------------------------------------------------------------
-- Comprobado contra la base local con el JWT de un capturista:
--
--   delete from storage.objects  -> bloqueado por un trigger de Supabase
--                                   ("Direct deletion from storage tables is
--                                    not allowed. Use the Storage API")
--   truncate storage.objects     -> FUNCIONÓ
--
-- Supabase se tomó la molestia de proteger el DELETE y TRUNCATE lo rodea:
-- los triggers `for each row` no se disparan con TRUNCATE y RLS no lo filtra.
-- Es exactamente lo que pasaba con nuestra bitácora.
--
-- Aquí importa más que en una tabla cualquiera: `storage.objects` es lo que
-- liga cada archivo con su ruta. Vaciarla no borra los archivos, pero deja
-- todos los expedientes sin forma de encontrar su evidencia.
--
-- NO SE PUEDE ARREGLAR CON UN REVOKE. `storage.objects` y `storage.buckets`
-- son de `supabase_storage_admin`, y el rol `postgres` con el que corren las
-- migraciones no es miembro suyo ni puede asumirlo. Un `revoke` desde aquí no
-- falla: simplemente no hace nada. (Se intentó primero; la aserción de abajo
-- lo detectó, que es exactamente para lo que existe.)
--
-- Sí se puede poner un trigger: CREATE TRIGGER pide el privilegio TRIGGER
-- sobre la tabla, no ser su dueño, y `postgres` lo tiene. Además es la capa
-- más fuerte de las tres de la migración 014 — no depende de ningún grant.
create or replace function app.prohibir_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'TRUNCATE no está permitido sobre %.%: vaciaría los datos de todos los obligados de una sola vez.',
    tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

comment on function app.prohibir_truncate() is
  'Guardia de TRUNCATE para tablas que NO son append-only pero tampoco deben vaciarse (storage.objects). Para las append-only, app.prohibir_mutacion() da un mensaje más preciso.';

create trigger vizo_objects_no_truncate
  before truncate on storage.objects
  for each statement execute function app.prohibir_truncate();

create trigger vizo_buckets_no_truncate
  before truncate on storage.buckets
  for each statement execute function app.prohibir_truncate();

-- ---------------------------------------------------------------------------
-- 3-bis. Lo que la tabla `documentos` debe impedir por sí sola
-- ---------------------------------------------------------------------------
-- Nivel 2 del orden de preferencia de CLAUDE.md. `prepararDocumento` ya valida
-- esto en TypeScript, pero un INSERT que no pase por ahí —un seed, un script,
-- una función futura— no debería poder dejar un expediente indefendible.
-- La tabla está vacía, así que es el momento más barato para exigirlo.

-- Un archivo de cero bytes sube sin error, cuenta como documento presente y
-- deja el expediente "completo" sin evidencia adentro. Es el modo de falla
-- silencioso de la regla dura 6, aplicado a archivos.
alter table documentos drop constraint if exists documentos_tamano_bytes_check;
alter table documentos add constraint documentos_tamano_positivo
  check (tamano_bytes > 0);

-- 64 hexadecimales en MINÚSCULA. `char(64)` acepta 64 espacios en blanco y
-- cualquier basura del mismo largo; y un hash en mayúsculas compara distinto
-- al de `encode(digest(...),'hex')`, así que el manifiesto de la semana 8
-- fallaría por una diferencia de mayúsculas que nadie relacionaría con esto.
alter table documentos add constraint documentos_hash_es_sha256_hex
  check (hash_sha256 ~ '^[0-9a-f]{64}$');

-- Dos filas no pueden apuntar al mismo objeto: la ruta lleva el id del propio
-- documento, así que si esto se viola es que la ruta se armó a mano.
alter table documentos add constraint documentos_storage_path_unico
  unique (storage_path);

-- ---------------------------------------------------------------------------
-- 4. Aserción
-- ---------------------------------------------------------------------------
-- Comprueba la PROTECCIÓN, no el permiso: el permiso sigue concedido y no está
-- en nuestras manos quitarlo. Lo que tiene que ser cierto es que TRUNCATE no
-- pase, y eso lo sostiene el trigger.
--
-- Acotada a estas dos tablas y no a todo el esquema: Supabase crea tablas en
-- `storage` al actualizar la plataforma, y una aserción sobre el esquema
-- completo se pondría roja por algo que no controlamos.
create or replace function app.verificar_privilegios_storage()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  select t.tabla,
         format('storage.%s no tiene guardia de TRUNCATE, y anon/authenticated '
                'conservan el privilegio porque la tabla es de supabase_storage_admin',
                t.tabla)
    from (values ('objects'), ('buckets')) as t(tabla)
   where not exists (
     select 1 from pg_catalog.pg_trigger g
      where g.tgrelid = ('storage.' || t.tabla)::regclass
        and not g.tgisinternal
        and g.tgname = 'vizo_' || t.tabla || '_no_truncate'
   );
$$;

do $$
declare
  v_problemas text;
  v_politicas int;
begin
  select string_agg(format('  - %s', problema), e'\n')
    into v_problemas from app.verificar_privilegios_storage();
  if v_problemas is not null then
    raise exception e'Storage sin protección contra TRUNCATE:\n%', v_problemas;
  end if;

  select count(*) into v_politicas
    from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects';
  if v_politicas <> 2 then
    raise exception 'Se esperaban 2 políticas en storage.objects (select e insert), hay %', v_politicas;
  end if;

  if not exists (select 1 from storage.buckets where id = 'expedientes' and not public) then
    raise exception 'El bucket expedientes no existe o quedó público';
  end if;

  raise notice 'Expediente en Storage: OK. Bucket privado, 2 políticas por tenant, TRUNCATE bloqueado por trigger.';
end;
$$;
