-- VIZO · Migración 001 (parte 7/8) — Esqueleto post-MVP
--
-- Tablas que NADIE ESCRIBE EN v1. Existen porque agregarlas después, con
-- expedientes y operaciones ya cargados, sería una migración de riesgo sobre
-- datos personales regulados. Crearlas vacías hoy cuesta minutos.
--
-- Regla acompañante (ADR-06): una tabla del esqueleto no genera UI ni código.
-- Solo existe. Ver docs/POST-MVP.md.

-- ---------------------------------------------------------------------------
-- Screening de listas
-- ---------------------------------------------------------------------------
-- REGLA DURA 5: el sistema nunca descarta una coincidencia por su cuenta. El
-- descarte es humano y queda registrado con quién, cuándo y por qué — esa
-- evidencia es lo que se presenta si la autoridad pregunta por qué se operó
-- con esa persona.
create table consultas_screening (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  sujeto_tipo   sujeto_screening not null,
  sujeto_id     uuid not null,
  -- Qué listas se consultaron y con qué versión de cada una: sin eso, una
  -- consulta vieja no es defendible.
  listas_consultadas jsonb not null default '{}'::jsonb,
  coincidencias jsonb not null default '[]'::jsonb,
  resultado     resultado_screening not null,
  resolucion    resolucion_screening not null default 'pendiente',
  razonamiento  text,
  resuelto_por  uuid references usuarios(id),
  resuelto_en   timestamptz,
  created_at    timestamptz not null default now(),
  constraint resolucion_humana_registrada
    check (resolucion = 'pendiente' or (resuelto_por is not null and resuelto_en is not null))
);

create index on consultas_screening (tenant_id, sujeto_tipo, sujeto_id);

-- ---------------------------------------------------------------------------
-- Factores de riesgo del cliente
-- ---------------------------------------------------------------------------
-- El modelo de la matriz (qué factores, qué pesos, qué evidencia) depende de
-- las RCG pendientes. La tabla espera vacía; la columna nivel_riesgo ya vive
-- en clientes_finales.
create table factores_riesgo (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  cliente_id  uuid not null references clientes_finales(id),
  factor      text not null,
  valor       jsonb not null default '{}'::jsonb,
  peso        numeric(6,3),
  evaluado_en timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index on factores_riesgo (tenant_id, cliente_id);

-- ---------------------------------------------------------------------------
-- Casos
-- ---------------------------------------------------------------------------
create table casos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  titulo      text not null,
  estado      estado_caso not null default 'abierto',
  resolucion  text,
  abierto_por uuid references usuarios(id),
  abierto_en  timestamptz not null default now(),
  cerrado_en  timestamptz,
  created_at  timestamptz not null default now(),
  constraint caso_cerrado_coherente
    check ((estado = 'cerrado') = (cerrado_en is not null))
);

create index on casos (tenant_id, estado);

-- Se cierran los ganchos que ya existían como columnas sueltas en alertas.
alter table alertas
  add constraint alertas_consulta_screening_fk
    foreign key (consulta_screening_id) references consultas_screening(id),
  add constraint alertas_caso_fk
    foreign key (caso_id) references casos(id);

-- ---------------------------------------------------------------------------
-- Verificaciones KYC
-- ---------------------------------------------------------------------------
create table verificaciones_kyc (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  expediente_id uuid not null references expedientes(id),
  proveedor     text not null,
  resultado     text not null,
  -- Cuidado al llenar esto en el futuro: el payload del proveedor trae datos
  -- personales y biométricos, que son datos SENSIBLES bajo la LFPDPPP (la
  -- multa se duplica). Nunca debe acabar en logs ni en telemetría.
  payload       jsonb not null default '{}'::jsonb,
  verificado_en timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index on verificaciones_kyc (tenant_id, expediente_id);

-- ---------------------------------------------------------------------------
-- Sellos NOM-151
-- ---------------------------------------------------------------------------
-- Se llena cuando se contrate el PSC. El manifiesto ya se genera con su hash,
-- así que sellar será insertar aquí: cero rediseño (ADR-10).
create table sellos_nom151 (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  objeto_tipo   objeto_sellado not null,
  objeto_id     uuid not null,
  hash_sellado  char(64) not null,
  psc           text not null,
  constancia_storage_path text,
  fecha_cierta  timestamptz not null,
  created_at    timestamptz not null default now()
);

create index on sellos_nom151 (tenant_id, objeto_tipo, objeto_id);

create trigger sellos_append_only
  before update or delete on sellos_nom151
  for each row execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- Esqueleto multi-parte (ADR-15)
-- ---------------------------------------------------------------------------
-- La tesis del producto: una venta inmobiliaria genera obligaciones para
-- hasta tres sujetos obligados. Se captura una vez, cada uno presenta su
-- propio aviso, y la responsabilidad legal NUNCA se consolida.
--
-- El MVP no construye el flujo. Pero separar "persona" de "cliente-de-un-
-- tenant" después, con expedientes cargados, sí sería cirugía.

-- personas: identidad canónica, CROSS-TENANT (sin tenant_id, a propósito).
create table personas (
  id                   uuid primary key default gen_random_uuid(),
  rfc                  text,
  curp                 text,
  identidad_alterna    jsonb,
  nombre_o_razon_social text not null,
  nombre_normalizado   text generated always as (app.normalizar_nombre(nombre_o_razon_social)) stored,
  creada_por_tenant_id uuid not null references tenants(id),
  created_at           timestamptz not null default now()
);

create unique index personas_rfc_unico on personas (rfc) where rfc is not null;

comment on table personas is
  'ESQUELETO (v1 vacía). Identidad canónica del comprador para el flujo multi-parte. Única tabla sin tenant_id: su RLS depende del consentimiento, no del tenant.';

-- Compartir el expediente entre tres entidades exige CONSENTIMIENTO EXPRESO
-- bajo la LFPDPPP, y define quién es responsable del tratamiento. Sin esta
-- tabla, el flujo multi-parte nacería en incumplimiento.
create table consentimientos_comparticion (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references personas(id),
  tenant_id   uuid not null references tenants(id),
  alcance     jsonb not null default '{}'::jsonb,
  evidencia   jsonb not null default '{}'::jsonb,   -- cómo se recabó: texto aceptado, canal
  otorgado_en timestamptz not null default now(),
  revocado_en timestamptz,                          -- el consentimiento es revocable
  created_at  timestamptz not null default now()
);

create index on consentimientos_comparticion (persona_id, tenant_id);

-- Los ganchos en las tablas vivas. NULL en v1, siempre.
alter table clientes_finales add column persona_id uuid references personas(id);
alter table documentos       add constraint documentos_persona_fk
  foreign key (persona_id) references personas(id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Las tablas del esqueleto llevan RLS desde su nacimiento aunque estén
-- vacías: una tabla sin RLS es un incidente de seguridad, no un pendiente.
alter table consultas_screening          enable row level security;
alter table factores_riesgo              enable row level security;
alter table casos                        enable row level security;
alter table verificaciones_kyc           enable row level security;
alter table sellos_nom151                enable row level security;
alter table personas                     enable row level security;
alter table consentimientos_comparticion enable row level security;

create policy "ver screening de mi tenant" on consultas_screening
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "ver factores de mi tenant" on factores_riesgo
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "ver casos de mi tenant" on casos
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "ver kyc de mi tenant" on verificaciones_kyc
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "ver sellos de mi tenant" on sellos_nom151
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "ver consentimientos de mi tenant" on consentimientos_comparticion
  for select to authenticated using (tenant_id = app.tenant_id());

-- LA EXCEPCIÓN DEL MODELO, escrita explícitamente para que nadie la
-- implemente como "tabla global sin RLS": personas no tiene tenant_id, así
-- que se lee únicamente si existe un consentimiento vigente que nombre al
-- tenant de quien consulta.
create policy "ver personas con consentimiento vigente" on personas
  for select to authenticated
  using (
    exists (
      select 1
      from consentimientos_comparticion c
      where c.persona_id = personas.id
        and c.tenant_id = app.tenant_id()
        and c.revocado_en is null
    )
  );
