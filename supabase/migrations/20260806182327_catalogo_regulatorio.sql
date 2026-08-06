-- VIZO · Migración 001 (parte 2/8) — Catálogo regulatorio (Capa 0)
--
-- LA REGLA QUE MANDA SOBRE TODAS: aquí viven los umbrales, la UMA, los campos
-- del expediente, los formatos de aviso y los parámetros del motor. Ninguno de
-- esos valores se escribe jamás en código.
--
-- Un valor nunca se actualiza: se cierra su vigencia (vigente_hasta) y se
-- inserta la fila nueva. La historia completa queda consultable, que es lo que
-- permite reevaluar o defender una operación de hace tres años con los valores
-- que estaban vigentes ese día.
--
-- Cuando se publiquen las RCG (vencidas desde el 16/07/2026), la respuesta
-- correcta es INSERT aquí + subir el XSD nuevo. No abrir un editor de código.
--
-- Ver docs/ARQUITECTURA.md §3.1 y §4, docs/DECISIONES.md ADR-09.

-- ---------------------------------------------------------------------------
-- UMA por vigencia
-- ---------------------------------------------------------------------------
create table uma_vigencias (
  id            uuid primary key default gen_random_uuid(),
  valor_diario  numeric(8,2) not null check (valor_diario > 0),
  -- El INEGI publica la UMA en enero, pero los umbrales entran en vigor el
  -- 1 DE FEBRERO. Una operación del 15 de enero de 2026 se evalúa con la UMA
  -- de 2025. Confirmado en la tabla oficial del SPPLD (regulatorio/README.md).
  vigente_desde date not null,
  vigente_hasta date,
  fuente_dof    text not null,
  created_at    timestamptz not null default now(),
  constraint uma_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- Dos valores de UMA vigentes el mismo día haría el cálculo indeterminado.
  constraint uma_sin_traslape
    exclude using gist (daterange(vigente_desde, vigente_hasta, '[]') with &&)
);

comment on table uma_vigencias is
  'Valor de la UMA por rango de fechas. Los umbrales entran en vigor el 1 de febrero, no el 1 de enero.';

-- ---------------------------------------------------------------------------
-- Actividades vulnerables (fracciones del Art. 17)
-- ---------------------------------------------------------------------------
create table actividades_vulnerables (
  id          uuid primary key default gen_random_uuid(),
  fraccion    text not null unique,   -- 'V_BIS', 'XV', ...
  nombre      text not null,
  descripcion text,
  created_at  timestamptz not null default now()
);

comment on table actividades_vulnerables is
  'Fracciones del Art. 17 de la LFPIORPI. Dar de alta una fracción nueva es un INSERT aquí más sus umbrales: el motor no cambia.';

-- ---------------------------------------------------------------------------
-- Umbrales
-- ---------------------------------------------------------------------------
create table umbrales (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid not null references actividades_vulnerables(id),
  tipo          tipo_umbral not null,
  -- 'siempre' = la obligación existe sin importar el monto. Es el caso de la
  -- identificación en Fr. V Bis: se integra expediente de CADA comprador.
  siempre       boolean not null default false,
  valor_uma     numeric(10,2),
  -- La base del cálculo es esta columna, no un `if` en el motor.
  base          base_calculo not null,
  vigente_desde date not null,
  vigente_hasta date,
  fuente        text not null,
  created_at    timestamptz not null default now(),
  constraint umbral_valor_o_siempre
    check ((siempre and valor_uma is null) or (not siempre and valor_uma is not null)),
  constraint umbral_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint umbral_sin_traslape
    exclude using gist (
      actividad_id with =,
      tipo with =,
      daterange(vigente_desde, vigente_hasta, '[]') with &&
    )
);

comment on column umbrales.base is
  'sin_iva | con_iva. Cambiar la base es cerrar esta fila e insertar otra: nunca tocar código. Ver POR CONFIRMAR-4.';

-- ---------------------------------------------------------------------------
-- Campos del expediente
-- ---------------------------------------------------------------------------
-- Alimenta el cálculo de completitud. Quitar un campo de aquí cambia qué
-- expedientes están completos, sin desplegar código.
create table campos_expediente (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid not null references actividades_vulnerables(id),
  aplica_a      aplica_persona not null default 'ambas',
  campo         text not null,          -- clave técnica: 'identificacion_oficial'
  etiqueta      text not null,          -- texto para la UI
  tipo_dato     tipo_dato_campo not null,
  obligatorio   boolean not null default true,
  validacion    jsonb not null default '{}'::jsonb,
  orden         int not null default 0,
  vigente_desde date not null,
  vigente_hasta date,
  created_at    timestamptz not null default now(),
  constraint campo_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint campo_unico_por_vigencia
    unique (actividad_id, aplica_a, campo, vigente_desde)
);

-- ---------------------------------------------------------------------------
-- Formatos de aviso (qué XSD rige en qué periodo)
-- ---------------------------------------------------------------------------
create table formatos_aviso (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid not null references actividades_vulnerables(id),
  version       text not null,
  -- Ruta al XSD dentro del repo (regulatorio/xsd/). El archivo es de la
  -- autoridad: se versiona, no se edita.
  ruta_xsd      text not null,
  vigente_desde date not null,
  vigente_hasta date,
  notas         text,
  created_at    timestamptz not null default now(),
  constraint formato_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint formato_sin_traslape
    exclude using gist (
      actividad_id with =,
      daterange(vigente_desde, vigente_hasta, '[]') with &&
    )
);

comment on table formatos_aviso is
  'XSD vigente por actividad y periodo. Cuando las RCG traigan formatos nuevos: fila nueva con su vigencia, no edición.';

-- ---------------------------------------------------------------------------
-- Parámetros del motor
-- ---------------------------------------------------------------------------
-- Todo lo que el motor necesita y no es un umbral: la ventana de acumulación
-- (6 meses), el % de proximidad, el día límite de presentación (17), el día
-- de alerta (10). Son datos con vigencia por la misma razón que los umbrales:
-- las RCG pendientes pueden cambiarlos.
create table parametros_motor (
  id            uuid primary key default gen_random_uuid(),
  actividad_id  uuid references actividades_vulnerables(id),  -- NULL = global
  clave         text not null,
  valor         jsonb not null,
  descripcion   text,
  vigente_desde date not null,
  vigente_hasta date,
  fuente        text,
  created_at    timestamptz not null default now(),
  constraint parametro_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- coalesce a UUID cero porque en una exclusion constraint dos NULL no
  -- conflictúan, y dos parámetros globales con la misma clave y vigencias
  -- traslapadas sí deben conflictuar.
  constraint parametro_sin_traslape
    exclude using gist (
      (coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
      clave with =,
      daterange(vigente_desde, vigente_hasta, '[]') with &&
    )
);

-- ---------------------------------------------------------------------------
-- Consultas canónicas "as of"
-- ---------------------------------------------------------------------------
-- El motor NUNCA pregunta por "el valor actual". Siempre pregunta por el valor
-- vigente en la fecha de la operación que está evaluando.

create or replace function app.uma_vigente(p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select u.valor_diario
  from public.uma_vigencias u
  where daterange(u.vigente_desde, u.vigente_hasta, '[]') @> p_fecha
  limit 1;
$$;

comment on function app.uma_vigente(date) is
  'UMA aplicable a una fecha de operación. NULL si no hay vigencia cargada: el motor debe fallar ruidosamente, nunca asumir un valor.';

create or replace function app.umbrales_vigentes(p_actividad uuid, p_fecha date)
returns setof public.umbrales
language sql
stable
set search_path = ''
as $$
  select *
  from public.umbrales
  where actividad_id = p_actividad
    and daterange(vigente_desde, vigente_hasta, '[]') @> p_fecha;
$$;

create or replace function app.parametro_vigente(p_actividad uuid, p_clave text, p_fecha date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select valor
  from public.parametros_motor
  where clave = p_clave
    and (actividad_id = p_actividad or actividad_id is null)
    and daterange(vigente_desde, vigente_hasta, '[]') @> p_fecha
  -- el parámetro específico de la actividad gana sobre el global
  order by actividad_id nulls last
  limit 1;
$$;

create or replace function app.formato_vigente(p_actividad uuid, p_fecha date)
returns public.formatos_aviso
language sql
stable
set search_path = ''
as $$
  select *
  from public.formatos_aviso
  where actividad_id = p_actividad
    and daterange(vigente_desde, vigente_hasta, '[]') @> p_fecha
  limit 1;
$$;

-- Huella del estado del catálogo. Se guarda en cada evaluación y en cada
-- manifiesto: sin ella no hay forma de decir "esto se calculó con el catálogo
-- que estaba cargado ese día".
create or replace function app.catalogo_version()
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(string_agg(t.huella, '|' order by t.huella), ''), 'UTF8')), 'hex')
  from (
    select u.id::text || ':' || u.valor_diario::text || ':' || u.vigente_desde::text as huella
      from public.uma_vigencias u
    union all
    select m.id::text || ':' || coalesce(m.valor_uma::text, 'siempre') || ':' || m.base::text || ':' || m.vigente_desde::text
      from public.umbrales m
    union all
    select p.id::text || ':' || p.clave || ':' || p.valor::text || ':' || p.vigente_desde::text
      from public.parametros_motor p
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- RLS: el catálogo se lee, nunca se escribe desde la aplicación
-- ---------------------------------------------------------------------------
-- No hay política de INSERT/UPDATE/DELETE a propósito: la única vía de
-- escritura es migración o seed (service_role, que salta RLS). Ninguna ruta
-- de la app puede alterar un umbral.
alter table uma_vigencias           enable row level security;
alter table actividades_vulnerables enable row level security;
alter table umbrales                enable row level security;
alter table campos_expediente       enable row level security;
alter table formatos_aviso          enable row level security;
alter table parametros_motor        enable row level security;

create policy "catálogo legible" on uma_vigencias
  for select to authenticated using (true);
create policy "catálogo legible" on actividades_vulnerables
  for select to authenticated using (true);
create policy "catálogo legible" on umbrales
  for select to authenticated using (true);
create policy "catálogo legible" on campos_expediente
  for select to authenticated using (true);
create policy "catálogo legible" on formatos_aviso
  for select to authenticated using (true);
create policy "catálogo legible" on parametros_motor
  for select to authenticated using (true);

create index on umbrales (actividad_id, tipo, vigente_desde);
create index on campos_expediente (actividad_id, aplica_a, vigente_desde);
create index on parametros_motor (clave, vigente_desde);
