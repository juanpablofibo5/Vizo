-- VIZO · Migración 001 (parte 3/8) — Tenancy y usuarios
--
-- El aislamiento por tenant nace aquí y es la base de todo lo demás. v1 corre
-- con un solo tenant demo, pero el modelo es multi-tenant desde el día uno:
-- agregar tenant_id + RLS después, con expedientes ya cargados, sería una
-- migración de riesgo sobre datos personales regulados.
--
-- Ver docs/ARQUITECTURA.md §3.2 y §9.

-- ---------------------------------------------------------------------------
-- Tenants: el sujeto obligado
-- ---------------------------------------------------------------------------
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  rfc           text not null unique,
  razon_social  text not null,
  domicilio     jsonb not null default '{}'::jsonb,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table tenants is
  'Cliente obligado. Las sucursales viven DENTRO del tenant: es lo que hace posible detectar acumulación cross-sucursal.';

-- ---------------------------------------------------------------------------
-- Sucursales
-- ---------------------------------------------------------------------------
create table sucursales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  nombre     text not null,
  clave      text not null,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, clave)
);

-- ---------------------------------------------------------------------------
-- Actividades del tenant
-- ---------------------------------------------------------------------------
-- Un obligado puede realizar más de una fracción. Umbrales, acumulados,
-- expedientes y avisos se calculan POR FRACCIÓN y nunca se suman entre
-- fracciones distintas: el caso A-04 de docs/PRUEBAS.md caza ese error.
create table actividades_tenant (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  actividad_id uuid not null references actividades_vulnerables(id),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, actividad_id)
);

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
-- Perfil de aplicación sobre auth.users. El tenant_id y el rol que RLS lee
-- vienen del JWT (app_metadata), no de esta tabla: esta tabla es el registro
-- legible, el JWT es la fuente de autoridad.
create table usuarios (
  id         uuid primary key references auth.users(id) on delete restrict,
  tenant_id  uuid not null references tenants(id),
  rol        rol_usuario not null default 'capturista',
  nombre     text not null,
  email      text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create index on usuarios (tenant_id);

comment on column usuarios.rol is
  'admin ejerce la aprobación de expedientes y avisos (rol tipo REC en v1). capturista captura y no puede aprobar.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table tenants            enable row level security;
alter table sucursales         enable row level security;
alter table actividades_tenant enable row level security;
alter table usuarios           enable row level security;

-- Un usuario solo ve su propio tenant. Nunca hay política que permita ver otro.
create policy "ver mi tenant" on tenants
  for select to authenticated
  using (id = app.tenant_id());

create policy "ver sucursales de mi tenant" on sucursales
  for select to authenticated
  using (tenant_id = app.tenant_id());

create policy "admin administra sucursales" on sucursales
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver actividades de mi tenant" on actividades_tenant
  for select to authenticated
  using (tenant_id = app.tenant_id());

create policy "ver usuarios de mi tenant" on usuarios
  for select to authenticated
  using (tenant_id = app.tenant_id());

-- Gestionar usuarios es exclusivo de admin. Nótese que esto NO permite
-- cambiar el rol efectivo: el rol que manda vive en app_metadata del JWT y
-- solo el servicio de Auth lo escribe.
create policy "admin administra usuarios" on usuarios
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());
