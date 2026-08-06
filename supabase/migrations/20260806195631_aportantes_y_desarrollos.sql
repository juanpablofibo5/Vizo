-- VIZO · Aportantes y desarrollos inmobiliarios
--
-- Cierra los huecos que reveló el desglose del XSD (docs/campos-aviso.md).
--
-- EL HALLAZGO QUE MOTIVA ESTA MIGRACIÓN: en Fracción V Bis el "cliente" no es
-- quien compra un inmueble, es quien APORTA recursos para desarrollarlo. El
-- instructivo oficial: "integrar los expedientes de identificación de clientes
-- o usuarios, es decir de las personas de quienes recibe las aportaciones".
-- Un comprador en preventa entra como TERCERO tipo 2 ("Cliente(s) en
-- Preventa"), con el campo valor_inmueble_preventa que solo existe en esa
-- rama del XSD.
--
-- ALCANCE: se modela la rama que el MVP ejercita (terceros/preventa). Las
-- otras cinco modalidades de aportación quedan como valores del enum con sus
-- tablas de detalle sin construir — mismo patrón de esqueleto del ADR-06.
-- Están anotadas como issues en GitHub.
--
-- Se hace ahora, con las tablas vacías, porque es el momento más barato: el
-- plan programaba este cruce para la semana 6.

-- ---------------------------------------------------------------------------
-- 1. Tipos nuevos
-- ---------------------------------------------------------------------------
-- El XSD admite fideicomiso como tercera forma de persona, además de física
-- y moral.
alter type tipo_persona add value if not exists 'fideicomiso';

-- Las seis modalidades del CHOICE `tipo_aportacion` del XSD. Solo 'tercero'
-- se construye en v1; las demás existen para no tocar un enum en uso después.
create type modalidad_aportacion as enum (
  'recursos_propios', 'socio', 'tercero',
  'prestamo_financiero', 'prestamo_no_financiero', 'financiamiento_bursatil'
);

create type forma_aportacion as enum ('numerario', 'especie');
create type ambito_domicilio as enum ('nacional', 'extranjero');

-- ---------------------------------------------------------------------------
-- 2. Datos que el XSD exige de la persona
-- ---------------------------------------------------------------------------
-- El XSD pide nombre y apellidos POR SEPARADO. Partir un nombre completo a
-- posteriori es adivinar dónde termina el apellido paterno, y en un aviso
-- regulatorio eso no se adivina.
alter table clientes_finales
  add column nombre_pila       text,
  add column apellido_paterno  text,
  add column apellido_materno  text,
  -- Códigos de 7 dígitos del catálogo del SAT (catalogos_sat).
  add column actividad_economica text,   -- persona física
  add column giro_mercantil       text,  -- persona moral
  add column telefono_pais        text,
  add column telefono_numero      text,
  add column correo_electronico   text,
  -- Domicilio: el XSD tiene estructuras distintas para nacional y extranjero.
  add column domicilio_ambito     ambito_domicilio,
  add column domicilio            jsonb not null default '{}'::jsonb,
  -- Solo para fideicomisos.
  add column identificador_fideicomiso text;

comment on column clientes_finales.nombre_o_razon_social is
  'Nombre completo o razón social como aparece en la identificación. Para persona física el XSD exige además nombre_pila y apellidos por separado.';
comment on column clientes_finales.domicilio is
  'nacional: {colonia, calle, numero_exterior, numero_interior, codigo_postal}. extranjero: agrega {pais, estado_provincia, ciudad_poblacion} y el CP es alfanumérico.';

-- Una persona física que va a ir a un aviso necesita sus apellidos separados.
-- No se fuerza con NOT NULL porque el expediente puede estar incompleto: la
-- completitud es lo que decide si el cliente está listo, contra el catálogo.

-- ---------------------------------------------------------------------------
-- 3. Representante o apoderado
-- ---------------------------------------------------------------------------
-- El XSD lo marca OBLIGATORIO dentro de persona_moral. Es una persona
-- distinta del beneficiario controlador: el representante firma, el
-- beneficiario controla.
create table representantes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  cliente_id       uuid not null references clientes_finales(id),
  nombre_pila      text not null,
  apellido_paterno text,
  apellido_materno text,
  fecha_nacimiento date,
  rfc              text,
  curp             text,
  created_at       timestamptz not null default now()
);

create index on representantes (tenant_id, cliente_id);

comment on table representantes is
  'Representante o apoderado de una persona moral. Obligatorio en el XSD; distinto del beneficiario controlador.';

-- ---------------------------------------------------------------------------
-- 4. Desarrollos inmobiliarios
-- ---------------------------------------------------------------------------
-- La entidad que faltaba por completo. Es sobre la que se agrupan las
-- aportaciones y de la que el aviso reporta ubicación, monto, unidades y
-- costo por unidad.
create table desarrollos_inmobiliarios (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id),
  nombre                 text not null,          -- interno, no va al XML
  -- Identificador único de autorización, registro o licencia de obra.
  registro_licencia      text not null,
  entidad_federativa     text not null,          -- catálogo, 1-2 dígitos
  codigo_postal          text not null,
  colonia                text not null,
  calle                  text not null,
  tipo_desarrollo        text not null,          -- catálogo: 1 habitacional … 99 otro
  descripcion_desarrollo text,                   -- obligatorio si tipo = 99
  monto_desarrollo       numeric(14,2) not null check (monto_desarrollo >= 0),
  unidades_comercializadas numeric(14,2) not null check (unidades_comercializadas >= 0),
  costo_unidad           numeric(14,2) not null check (costo_unidad >= 0),
  otras_empresas         boolean not null default false,
  objeto_aviso_anterior  boolean not null default false,
  activo                 boolean not null default true,
  created_at             timestamptz not null default now(),
  unique (tenant_id, registro_licencia)
);

create index on desarrollos_inmobiliarios (tenant_id, activo);

comment on table desarrollos_inmobiliarios is
  'El proyecto sobre el que se reciben aportaciones. Cada aviso de Fr. V Bis reporta el desarrollo y las aportaciones recibidas.';

-- ---------------------------------------------------------------------------
-- 5. La operación es una aportación a un desarrollo
-- ---------------------------------------------------------------------------
alter table operaciones
  add column desarrollo_id     uuid references desarrollos_inmobiliarios(id),
  add column modalidad         modalidad_aportacion,
  add column forma             forma_aportacion not null default 'numerario',
  -- Códigos del catálogo del SAT.
  add column tipo_tercero      text,   -- 1 proveedor · 2 cliente en preventa · 99 otro
  add column instrumento_monetario text,
  add column moneda_codigo     text,
  -- Solo existe en la rama de terceros del XSD. Es el caso de la preventa.
  add column valor_inmueble_preventa numeric(14,2),
  -- Aportación en especie.
  add column monto_estimado_especie numeric(14,2),
  add column aportacion_fideicomiso boolean not null default false,
  add column nombre_institucion text;

comment on column operaciones.modalidad is
  'Rama del CHOICE tipo_aportacion del XSD. v1 construye solo "tercero"; las demás quedan declaradas para no alterar el enum después.';
comment on column operaciones.valor_inmueble_preventa is
  'Valor del inmueble en preventa. El XSD lo admite únicamente en aportaciones de terceros.';

-- Una aportación en especie no lleva instrumento monetario ni moneda; una en
-- numerario no lleva monto estimado. El XSD lo separa en dos ramas, aquí es
-- un CHECK.
alter table operaciones
  add constraint aportacion_coherente check (
    (forma = 'numerario' and monto_estimado_especie is null)
    or
    (forma = 'especie' and instrumento_monetario is null and moneda_codigo is null)
  );

-- ---------------------------------------------------------------------------
-- 6. RLS de las tablas nuevas
-- ---------------------------------------------------------------------------
alter table representantes             enable row level security;
alter table desarrollos_inmobiliarios  enable row level security;

create policy "ver representantes de mi tenant" on representantes
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "capturar representantes" on representantes
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy "editar representantes de mi tenant" on representantes
  for update to authenticated
  using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

create policy "ver desarrollos de mi tenant" on desarrollos_inmobiliarios
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "capturar desarrollos" on desarrollos_inmobiliarios
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy "editar desarrollos de mi tenant" on desarrollos_inmobiliarios
  for update to authenticated
  using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

grant select, insert, update on representantes, desarrollos_inmobiliarios to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Las aserciones estructurales siguen pasando
-- ---------------------------------------------------------------------------
do $$
declare v_problemas text;
begin
  select string_agg(format('  · %s: %s', tabla, problema), e'\n') into v_problemas
  from (
    select * from app.verificar_rls()
    union all select * from app.verificar_append_only()
    union all select * from app.verificar_tenancy()
    union all select * from app.verificar_grants()
  ) t;

  if v_problemas is not null then
    raise exception e'Las tablas nuevas violan reglas estructurales:\n%', v_problemas;
  end if;

  raise notice 'Aportantes y desarrollos: OK. Sigue cumpliendo RLS, append-only, tenancy y grants.';
end;
$$;
