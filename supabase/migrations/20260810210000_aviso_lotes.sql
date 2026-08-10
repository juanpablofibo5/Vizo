-- ---------------------------------------------------------------------------
-- Los lotes del aviso
-- ---------------------------------------------------------------------------
-- `avisos.xml_storage_path` es UNA ruta, y el SPPLD obliga a fragmentar por
-- encima de 2 MB. Un periodo puede terminar en varios archivos, cada uno
-- presentable por sí mismo y cada uno con su propio acuse.
--
-- Guardar solo la primera ruta y confiar en `fragmentos` para saber que hay más
-- sería el tipo de dato que parece completo y no lo está: quien lea la fila
-- creería tener el aviso entero.

create table aviso_lotes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  aviso_id      uuid not null,
  lote          int  not null,
  total_lotes   int  not null,
  storage_path  text not null,
  hash_sha256   char(64) not null,
  bytes         int  not null,
  avisos_en_lote int not null,
  created_at    timestamptz not null default now(),

  -- FK COMPUESTA: un lote no puede colgar del aviso de otro obligado.
  constraint aviso_lotes_aviso_fk
    foreign key (tenant_id, aviso_id) references avisos(tenant_id, id),

  constraint aviso_lotes_numeracion unique (tenant_id, aviso_id, lote),
  constraint aviso_lotes_ruta_unica unique (storage_path),

  -- La numeración es 1..total y el archivo pesa algo. Un lote 0, un lote 5 de
  -- 3, o un archivo vacío son estados que no deberían poder escribirse.
  constraint aviso_lotes_lote_en_rango check (lote >= 1 and lote <= total_lotes),
  constraint aviso_lotes_bytes_positivo check (bytes > 0),
  -- El límite del portal, en la base. Aquí no se puede "casi" cumplir.
  constraint aviso_lotes_cabe_en_el_portal check (bytes <= 2000000),
  constraint aviso_lotes_hash_es_sha256_hex check (hash_sha256 ~ '^[0-9a-f]{64}$')
);

create index on aviso_lotes (tenant_id, aviso_id);

-- Append-only: el archivo que se presentó es evidencia. Corregirlo es un
-- aviso modificatorio, que es una fila nueva.
create trigger aviso_lotes_append_only
  before update or delete on aviso_lotes
  for each row execute function app.prohibir_mutacion();

create trigger aviso_lotes_sin_truncate
  before truncate on aviso_lotes
  execute function app.prohibir_mutacion();

alter table aviso_lotes enable row level security;

create policy "ver lotes de mi tenant" on aviso_lotes
  for select to authenticated using (tenant_id = app.tenant_id());

-- SELECT e INSERT y nada más. Sin UPDATE ni DELETE: el archivo que se
-- presentó es evidencia, y los triggers de arriba lo respaldan. Los privilegios
-- van EXPLÍCITOS porque la migración 014 quitó los que Supabase concedía solos
-- (ADR-17) — una tabla nueva no hereda permisos, que es justo lo que se quería.
grant select, insert on aviso_lotes to authenticated;

create policy "admin escribe lotes" on aviso_lotes
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

do $$
begin
  perform app.verificar_privilegios_por_omision();
  raise notice '✓ aviso_lotes: append-only, RLS por obligado, límite de 2 MB en la base';
end $$;
