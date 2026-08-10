-- ---------------------------------------------------------------------------
-- Bucket de avisos: el XML que se presenta y el acuse que vuelve
-- ---------------------------------------------------------------------------
-- Bucket propio y no `expedientes`, por tres razones que no son de orden:
--
--   1. `expedientes` solo admite PDF e imágenes. El XML del aviso no cabe en
--      esa lista, y ensancharla abriría la puerta a subir XML donde va una
--      identificación.
--   2. El contenido es distinto: un expediente lleva datos personales; el XML
--      del aviso es lo que se le entrega a la autoridad, y el acuse es la
--      prueba de que se entregó.
--   3. Su conservación responde a otra obligación y a otro plazo.
--
-- La ruta empieza SIEMPRE con el tenant_id, porque la política lee
-- storage.foldername(name)[1]. No es convención de estilo: es la frontera.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avisos', 'avisos', false,
  -- 10 MiB: el SPPLD rechaza XML de más de 2 MB y por eso se fragmenta, así
  -- que ningún lote se acerca. El margen es para el acuse en PDF.
  10485760,
  array['application/xml', 'text/xml', 'application/pdf']
)
on conflict (id) do nothing;

create policy "avisos: leer solo lo del propio obligado"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avisos'
    and (storage.foldername(name))[1] = app.tenant_id()::text
  );

-- Escribir es de ADMIN, igual que generar y aprobar. Un capturista no deja
-- archivos en la carpeta de avisos.
create policy "avisos: solo admin escribe en la carpeta propia"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avisos'
    and (storage.foldername(name))[1] = app.tenant_id()::text
    and app.es_admin()
  );

-- Sin UPDATE ni DELETE, a propósito: el XML que se presentó y su acuse son
-- evidencia. Corregir un aviso es un modificatorio, que es un archivo nuevo.

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_politicas int;
begin
  if not exists (select 1 from storage.buckets where id = 'avisos' and not public) then
    raise exception 'El bucket avisos no existe o quedó público. Público significa que el XML que se le entrega a la autoridad se sirve por URL abierta.';
  end if;

  select count(*) into v_politicas
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects'
     and p.polname like 'avisos:%';

  if v_politicas <> 2 then
    raise exception 'El bucket avisos debe tener exactamente 2 políticas (leer y escribir) y tiene %. Sin políticas RLS niega todo; con la equivocada, un obligado lee los avisos de otro.', v_politicas;
  end if;

  raise notice '✓ bucket avisos: privado, lectura por obligado, escritura solo admin';
end $$;
