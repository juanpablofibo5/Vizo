-- VIZO · Migración 001 (parte 6/8) — Aviso y manifiesto
--
-- El aviso y el objeto que prueba la integridad del expediente. Incluye las
-- transiciones de estado sensibles, que son funciones SECURITY DEFINER porque
-- tienen que hacer tres cosas en una sola transacción: validar el rol, aplicar
-- el cambio y escribir el evento en la bitácora. Si se pudieran hacer con un
-- UPDATE suelto, la aprobación humana sería decorativa.
--
-- REGLA DURA 5: VIZO nunca presenta el aviso al SPPLD. Lo genera, lo valida y
-- lo deja listo; el REC lo sube con su e.firma.
--
-- Ver docs/ARQUITECTURA.md §6 y §8.

-- ---------------------------------------------------------------------------
-- Avisos
-- ---------------------------------------------------------------------------
create table avisos (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  actividad_id         uuid not null references actividades_vulnerables(id),
  periodo              date not null,          -- primer día del mes reportado
  tipo                 tipo_aviso not null,
  estatus              estatus_aviso not null default 'borrador',
  formato_aviso_id     uuid not null references formatos_aviso(id),
  xml_storage_path     text,
  hash_xml             char(64),
  -- El SPPLD rechaza XML de más de 2 MB: se fragmenta en lotes numerados.
  fragmentos           int not null default 1 check (fragmentos >= 1),
  aprobado_por         uuid references usuarios(id),
  aprobado_en          timestamptz,
  acuse_storage_path   text,
  acuse_registrado_en  timestamptz,
  created_at           timestamptz not null default now(),
  constraint periodo_es_primer_dia check (extract(day from periodo) = 1),
  constraint aviso_aprobado_coherente
    check ((aprobado_en is null) = (aprobado_por is null))
);

create index on avisos (tenant_id, periodo, estatus);
-- Un solo aviso por tenant, actividad, periodo y tipo: evita el duplicado que
-- en el portal sería una presentación doble.
create unique index avisos_unico_por_periodo
  on avisos (tenant_id, actividad_id, periodo, tipo);

comment on table avisos is
  'VIZO genera y valida; el REC presenta con su e.firma. Los tipos modificatorio y 24h existen en el enum pero no se generan en v1.';

-- Qué operaciones ampara cada aviso y con qué evaluación se decidió incluirlas.
create table aviso_operaciones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  aviso_id      uuid not null references avisos(id),
  operacion_id  uuid not null references operaciones(id),
  evaluacion_id uuid not null references evaluaciones_umbral(id),
  created_at    timestamptz not null default now(),
  unique (aviso_id, operacion_id)
);

create index on aviso_operaciones (tenant_id, aviso_id);

-- ---------------------------------------------------------------------------
-- Manifiestos
-- ---------------------------------------------------------------------------
-- JSON canónico por versión de expediente: hashes de los documentos, datos de
-- las operaciones, la cabeza de la bitácora y la versión del catálogo. Se
-- diseña hoy para que el sellado NOM-151 del futuro sea llenar sellos_nom151,
-- no un rediseño (ADR-10).
create table manifiestos (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  expediente_id        uuid not null references expedientes(id),
  version              int not null,
  contenido            jsonb not null,
  hash_sha256          char(64) not null,
  -- Ata la integridad documental a la cadena de custodia de las acciones.
  hash_bitacora_cabeza char(64) not null,
  catalogo_version     text not null,
  generado_en          timestamptz not null default now(),
  unique (expediente_id, version)
);

create index on manifiestos (tenant_id, expediente_id);

create trigger manifiestos_append_only
  before update or delete on manifiestos
  for each row execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- Transiciones sensibles: rol + cambio + bitácora, en una transacción
-- ---------------------------------------------------------------------------

create or replace function app.expediente_aprobar(p_expediente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_exp record;
begin
  if not app.es_admin() then
    raise exception 'Solo un usuario con rol admin puede aprobar un expediente'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_exp from public.expedientes
   where id = p_expediente and tenant_id = app.tenant_id();

  if not found then
    raise exception 'Expediente no encontrado en este tenant'
      using errcode = 'no_data_found';
  end if;

  if v_exp.estatus <> 'completo' then
    raise exception 'Solo se aprueba un expediente completo (estatus actual: %)', v_exp.estatus
      using errcode = 'check_violation';
  end if;

  update public.expedientes
     set estatus = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now()
   where id = p_expediente;

  perform app.bitacora_registrar(
    v_exp.tenant_id, 'expediente.aprobado', 'expediente', p_expediente,
    jsonb_build_object('version', v_exp.version)
  );
end;
$$;

-- La aprobación humana del aviso: el paso bloqueante que ningún flujo salta.
create or replace function app.aviso_aprobar(p_aviso uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_aviso record;
begin
  if not app.es_admin() then
    raise exception 'Solo un usuario con rol admin puede aprobar un aviso'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_aviso from public.avisos
   where id = p_aviso and tenant_id = app.tenant_id();

  if not found then
    raise exception 'Aviso no encontrado en este tenant'
      using errcode = 'no_data_found';
  end if;

  -- Un aviso que no pasó la validación contra el XSD no se aprueba. La
  -- validación es bloqueante, no una recomendación.
  if v_aviso.estatus <> 'listo_revision' then
    raise exception 'El aviso debe estar validado y listo para revisión (estatus actual: %)', v_aviso.estatus
      using errcode = 'check_violation';
  end if;

  update public.avisos
     set estatus = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now()
   where id = p_aviso;

  perform app.bitacora_registrar(
    v_aviso.tenant_id, 'aviso.aprobado', 'aviso', p_aviso,
    jsonb_build_object('periodo', v_aviso.periodo, 'tipo', v_aviso.tipo, 'hash_xml', v_aviso.hash_xml)
  );
end;
$$;

create or replace function app.aviso_registrar_acuse(p_aviso uuid, p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_aviso record;
begin
  if not app.es_admin() then
    raise exception 'Solo un usuario con rol admin puede registrar el acuse'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_aviso from public.avisos
   where id = p_aviso and tenant_id = app.tenant_id();

  if not found then
    raise exception 'Aviso no encontrado en este tenant'
      using errcode = 'no_data_found';
  end if;

  if v_aviso.estatus <> 'aprobado' then
    raise exception 'El acuse solo se registra sobre un aviso aprobado y presentado (estatus actual: %)', v_aviso.estatus
      using errcode = 'check_violation';
  end if;

  update public.avisos
     set estatus = 'presentado',
         acuse_storage_path = p_storage_path,
         acuse_registrado_en = now()
   where id = p_aviso;

  perform app.bitacora_registrar(
    v_aviso.tenant_id, 'aviso.acuse_registrado', 'aviso', p_aviso,
    jsonb_build_object('periodo', v_aviso.periodo)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table avisos            enable row level security;
alter table aviso_operaciones enable row level security;
alter table manifiestos       enable row level security;

create policy "ver avisos de mi tenant" on avisos
  for select to authenticated using (tenant_id = app.tenant_id());
-- Generar el aviso es de admin; el capturista no lo genera ni lo aprueba.
create policy "admin genera avisos" on avisos
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());
-- El UPDATE directo solo mueve el aviso por los estados previos a la
-- aprobación. Aprobar y registrar acuse van por sus funciones.
create policy "admin trabaja avisos no aprobados" on avisos
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin()
         and estatus in ('borrador', 'generado', 'validado', 'listo_revision'))
  with check (tenant_id = app.tenant_id() and app.es_admin()
              and estatus in ('borrador', 'generado', 'validado', 'listo_revision'));

create policy "ver detalle de avisos de mi tenant" on aviso_operaciones
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin arma el detalle del aviso" on aviso_operaciones
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver manifiestos de mi tenant" on manifiestos
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "generar manifiestos" on manifiestos
  for insert to authenticated with check (tenant_id = app.tenant_id());
