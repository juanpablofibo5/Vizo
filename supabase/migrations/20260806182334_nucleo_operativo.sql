-- VIZO · Migración 001 (parte 5/8) — Núcleo operativo
--
-- Clientes, beneficiarios controladores, expedientes, documentos, operaciones,
-- evaluaciones y alertas. Cuatro de estas tablas son append-only.
--
-- Ver docs/ARQUITECTURA.md §3.3.

-- ---------------------------------------------------------------------------
-- Clientes finales
-- ---------------------------------------------------------------------------
create table clientes_finales (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants(id),
  tipo_persona                tipo_persona not null,
  rfc                         text,
  curp                        text,
  nombre_o_razon_social       text not null,
  nombre_normalizado          text generated always as (app.normalizar_nombre(nombre_o_razon_social)) stored,
  fecha_nacimiento_o_constitucion date,
  nacionalidad                text,
  -- Extranjero sin RFC: {tipo_doc, numero, pais}. Es la clave de acumulación
  -- conservadora del caso A-05 de docs/PRUEBAS.md. El criterio definitivo
  -- está POR CONFIRMAR con el especialista PLD.
  identidad_alterna           jsonb,
  -- Se enciende cuando la identidad NO se resolvió por RFC ni CURP. El motor
  -- acumula igual y escala a revisión humana: un falso positivo cuesta
  -- minutos, un falso negativo es un aviso omitido.
  requiere_revision_identidad boolean not null default false,
  -- ESQUELETO post-MVP: nadie escribe esta columna en v1 (ADR-06).
  nivel_riesgo                nivel_riesgo,
  created_by                  uuid references usuarios(id),
  created_at                  timestamptz not null default now(),
  constraint cliente_identificable
    check (rfc is not null or curp is not null or identidad_alterna is not null)
);

-- Un RFC no puede repetirse dentro del mismo tenant: es la primera línea de
-- la resolución de identidad de la que depende toda la acumulación.
create unique index clientes_rfc_unico_por_tenant
  on clientes_finales (tenant_id, rfc) where rfc is not null;
create unique index clientes_curp_unico_por_tenant
  on clientes_finales (tenant_id, curp) where curp is not null;
create index on clientes_finales (tenant_id, nombre_normalizado);

comment on column clientes_finales.nombre_normalizado is
  'Apoyo de búsqueda y cotejo humano. NUNCA resuelve identidad por sí solo.';

-- ---------------------------------------------------------------------------
-- Beneficiarios controladores
-- ---------------------------------------------------------------------------
-- Umbral de participación: 25% (bajó de 50% con la reforma de 2025). El
-- porcentaje no lo impone el esquema: es dato del catálogo y de la UI.
create table beneficiarios_controladores (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  cliente_id       uuid not null references clientes_finales(id),
  nombre           text not null,
  rfc              text,
  curp             text,
  participacion_pct numeric(5,2) check (participacion_pct >= 0 and participacion_pct <= 100),
  control_por      control_beneficiario not null default 'participacion',
  -- true cuando es la declaración recabada (una persona física declara si
  -- existe o no beneficiario controlador).
  es_declaracion   boolean not null default false,
  created_at       timestamptz not null default now()
);

create index on beneficiarios_controladores (tenant_id, cliente_id);

-- ---------------------------------------------------------------------------
-- Expedientes
-- ---------------------------------------------------------------------------
create table expedientes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  cliente_id    uuid not null references clientes_finales(id),
  actividad_id  uuid not null references actividades_vulnerables(id),
  version       int not null default 1,
  estatus       estatus_expediente not null default 'incompleto',
  -- Caché del último cálculo de completitud contra campos_expediente vigentes.
  -- La verdad es el catálogo: quitar un campo de ahí cambia la completitud
  -- sin desplegar código.
  completitud   jsonb not null default '{}'::jsonb,
  aprobado_por  uuid references usuarios(id),
  aprobado_en   timestamptz,
  created_at    timestamptz not null default now(),
  unique (tenant_id, cliente_id, actividad_id, version),
  constraint expediente_aprobado_coherente
    check ((estatus = 'aprobado') = (aprobado_en is not null))
);

create index on expedientes (tenant_id, estatus);

-- ---------------------------------------------------------------------------
-- Documentos (APPEND-ONLY)
-- ---------------------------------------------------------------------------
create table documentos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  expediente_id uuid not null references expedientes(id),
  -- ESQUELETO multi-parte (ADR-15): NULL en v1. Cuando exista la captura
  -- única, un documento pertenece a la persona y sirve a los tres obligados.
  persona_id    uuid,
  campo         text not null,        -- clave de campos_expediente que satisface
  storage_path  text not null,
  -- Se calcula sobre el byte stream TAL COMO SE GUARDA. Hashear un archivo
  -- que después se recomprime deja un manifiesto indefendible.
  hash_sha256   char(64) not null,
  tamano_bytes  bigint not null check (tamano_bytes >= 0),
  mime          text not null,
  -- Reemplazo = fila nueva. La vieja no se borra nunca.
  reemplaza_a   uuid references documentos(id),
  subido_por    uuid references usuarios(id),
  created_at    timestamptz not null default now()
);

create index on documentos (tenant_id, expediente_id);
create index on documentos (hash_sha256);

create trigger documentos_append_only
  before update or delete on documentos
  for each row execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- Operaciones (APPEND-ONLY)
-- ---------------------------------------------------------------------------
create table operaciones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  sucursal_id      uuid not null references sucursales(id),
  cliente_id       uuid not null references clientes_finales(id),
  actividad_id     uuid not null references actividades_vulnerables(id),
  -- Fecha del acto: la aporta el capturista y determina qué UMA y qué
  -- umbrales aplican. Distinta de registrado_en, que es cuándo se capturó.
  fecha_operacion  date not null,
  monto_base       numeric(14,2) not null check (monto_base >= 0),
  iva              numeric(14,2) not null default 0 check (iva >= 0),
  -- ISAI y accesorios se capturan desde el día 1 aunque la postura provisional
  -- no los use: si la confirmación de POR CONFIRMAR-4 dice que cuentan y el
  -- dato nunca se capturó, las operaciones viejas son irreevaluables.
  isai             numeric(14,2) not null default 0 check (isai >= 0),
  otros_accesorios numeric(14,2) not null default 0 check (otros_accesorios >= 0),
  monto_total      numeric(14,2) not null,
  forma_pago       text not null,       -- catálogo c_FormaPago del SAT
  moneda           char(3) not null default 'MXN',
  cfdi_uuid        uuid,                -- listo para el parser CFDI; NULL en captura manual
  descripcion_bien text,
  -- Corrección = fila nueva que apunta a la corregida.
  corrige_a        uuid references operaciones(id),
  registrado_por   uuid references usuarios(id),
  -- RELOJ DEL SERVIDOR. El cliente no puede escribirlo: lo impone el trigger.
  registrado_en    timestamptz not null default now(),
  constraint monto_total_cuadra
    check (monto_total = monto_base + iva + isai + otros_accesorios)
);

create index on operaciones (tenant_id, cliente_id, actividad_id, fecha_operacion);
create index on operaciones (tenant_id, fecha_operacion);
create unique index operaciones_una_correccion on operaciones (corrige_a) where corrige_a is not null;

create trigger operaciones_append_only
  before update or delete on operaciones
  for each row execute function app.prohibir_mutacion();

-- El timestamp del servidor no es negociable: si el cliente pudiera fijarlo,
-- la bitácora y el orden de las operaciones serían impugnables.
create or replace function app.forzar_reloj_servidor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.registrado_en := now();
  return new;
end;
$$;

create trigger operaciones_reloj_servidor
  before insert on operaciones
  for each row execute function app.forzar_reloj_servidor();

-- Operaciones vigentes: excluye las que fueron corregidas por una posterior.
-- Es la vista que el motor y los avisos deben usar; la tabla cruda conserva
-- todo, incluido lo corregido.
create view operaciones_vigentes
with (security_invoker = true)
as
  select o.*
  from operaciones o
  where not exists (
    select 1 from operaciones c where c.corrige_a = o.id
  );

comment on view operaciones_vigentes is
  'Operaciones no corregidas. security_invoker: respeta la RLS del usuario que consulta.';

-- ---------------------------------------------------------------------------
-- Evaluaciones del motor (APPEND-ONLY)
-- ---------------------------------------------------------------------------
-- El registro defendible de cada corrida. Una evaluación que no guarda sus
-- insumos no existe: sin la UMA, los umbrales y los parámetros que se usaron,
-- no hay forma de explicar el cálculo tres años después.
create table evaluaciones_umbral (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants(id),
  operacion_id                uuid not null references operaciones(id),
  actividad_id                uuid not null references actividades_vulnerables(id),
  uma_valor                   numeric(8,2) not null,
  uma_vigencia                daterange not null,
  umbrales_aplicados          jsonb not null,
  parametros_aplicados        jsonb not null,
  catalogo_version            text not null,
  monto_base_considerado      numeric(14,2) not null,
  monto_total_considerado     numeric(14,2) not null,
  requiere_identificacion     boolean not null,
  resultado_aviso             resultado_aviso not null,
  efectivo_restringido        boolean not null,
  alerta_proximidad           boolean not null,
  suma_ventana                numeric(14,2),
  operaciones_acumuladas      uuid[] not null default '{}',
  requiere_revision_identidad boolean not null default false,
  motivo                      text,
  evaluado_en                 timestamptz not null default now()
);

create index on evaluaciones_umbral (tenant_id, operacion_id);
create index on evaluaciones_umbral (tenant_id, resultado_aviso, evaluado_en);

create trigger evaluaciones_append_only
  before update or delete on evaluaciones_umbral
  for each row execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------------------
create table alertas (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id),
  tipo                   tipo_alerta not null,
  evaluacion_id          uuid references evaluaciones_umbral(id),
  -- ESQUELETO: se llenan cuando existan screening y casos (ADR-06).
  consulta_screening_id  uuid,
  caso_id                uuid,
  titulo                 text not null,
  detalle                jsonb not null default '{}'::jsonb,
  estado                 estado_alerta not null default 'abierta',
  atendida_por           uuid references usuarios(id),
  atendida_en            timestamptz,
  created_at             timestamptz not null default now(),
  constraint alerta_atendida_coherente
    check ((estado = 'atendida') = (atendida_en is not null))
);

create index on alertas (tenant_id, estado, tipo);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table clientes_finales            enable row level security;
alter table beneficiarios_controladores enable row level security;
alter table expedientes                 enable row level security;
alter table documentos                  enable row level security;
alter table operaciones                 enable row level security;
alter table evaluaciones_umbral         enable row level security;
alter table alertas                     enable row level security;

-- Captura: cualquier usuario del tenant. Es el trabajo diario.
create policy "ver clientes de mi tenant" on clientes_finales
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "capturar clientes" on clientes_finales
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy "editar clientes de mi tenant" on clientes_finales
  for update to authenticated
  using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

create policy "ver beneficiarios de mi tenant" on beneficiarios_controladores
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "capturar beneficiarios" on beneficiarios_controladores
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy "editar beneficiarios de mi tenant" on beneficiarios_controladores
  for update to authenticated
  using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

create policy "ver expedientes de mi tenant" on expedientes
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "crear expedientes" on expedientes
  for insert to authenticated with check (tenant_id = app.tenant_id());
-- Cualquiera del tenant mueve el expediente entre incompleto y completo;
-- APROBAR es exclusivo de admin y pasa por app.expediente_aprobar().
create policy "actualizar expedientes no aprobados" on expedientes
  for update to authenticated
  using (tenant_id = app.tenant_id() and estatus <> 'aprobado')
  with check (tenant_id = app.tenant_id() and estatus <> 'aprobado');

create policy "ver documentos de mi tenant" on documentos
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "subir documentos" on documentos
  for insert to authenticated with check (tenant_id = app.tenant_id());

create policy "ver operaciones de mi tenant" on operaciones
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "registrar operaciones" on operaciones
  for insert to authenticated with check (tenant_id = app.tenant_id());

create policy "ver evaluaciones de mi tenant" on evaluaciones_umbral
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "registrar evaluaciones" on evaluaciones_umbral
  for insert to authenticated with check (tenant_id = app.tenant_id());

create policy "ver alertas de mi tenant" on alertas
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "crear alertas" on alertas
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy "atender alertas de mi tenant" on alertas
  for update to authenticated
  using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

-- Sin políticas de UPDATE/DELETE en documentos, operaciones y evaluaciones:
-- son append-only por diseño y además lo impone un trigger.
