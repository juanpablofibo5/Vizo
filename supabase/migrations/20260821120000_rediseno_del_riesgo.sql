-- ---------------------------------------------------------------------------
-- El riesgo: el obligado pone el criterio, VIZO pone el motor y la evidencia
-- ---------------------------------------------------------------------------
-- ADR-21. Exigible el 1 de marzo de 2027 (Transitorio Cuarto del Acuerdo
-- 115/2026). Contraste completo en `docs/RIESGO-EBR.md`.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTO ES UN REDISEÑO Y NO UN «LLENAR EL ESQUELETO»
-- ────────────────────────────────────────────────────────────────────────────
-- Las tablas que este archivo reemplaza nacieron el 6 de agosto de 2026. El
-- Acuerdo 115/2026 se publicó el 7, en la edición vespertina. La puerta que el
-- ADR-06 dejó abierta se diseñó un día antes de que existiera el marco que
-- tenía que recibir, y no le queda:
--
--   · `nivel_riesgo` era `enum ('bajo','medio','alto')` — exactamente tres
--     valores. El Art. 23 Bis ¶2 exige «al menos» tres «pudiendo establecer
--     tantos intermedios como consideren necesario»: el enum puso techo donde
--     la norma puso piso, y un obligado que quisiera un «medio-alto» habría
--     necesitado una migración.
--
--   · `factores_riesgo` colgaba de `cliente_id`: guardaba el RESULTADO de
--     aplicar un factor a un cliente. Pero el Art. 23 Bis 2 exige el MODELO
--     del obligado —qué factores existen, con qué indicadores y qué peso—,
--     que se desarrolla una vez y se aplica igual a todos. No había dónde
--     guardarlo sin colgarlo de un cliente, y `peso` vivía junto a `valor`:
--     configuración y evaluación confundidas en la misma fila.
--
--   · `clientes_finales.nivel_riesgo` era una columna mutable. El Art. 41
--     fr. IV exige conservar el HISTÓRICO de modificaciones del grado, y una
--     columna que se sobrescribe no lo cumple.
--
-- Las tres estaban vacías, así que el rediseño no migra datos: los sustituye.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LA FRONTERA DEL ADR-21, EXPRESADA EN EL ESQUEMA
-- ────────────────────────────────────────────────────────────────────────────
-- «La estructura que fija la norma es producto. Los valores y las
--  ponderaciones son del obligado.»
--
-- Por eso `elementos_riesgo` se siembra —son los cuatro elementos mínimos que
-- el Art. 10 Septies 1 fr. I ya fija, con su fuente, como cualquier umbral— y
-- `factores_modelo` **nace vacía y VIZO nunca la prellena**. Un valor sugerido
-- que nadie cambia se vuelve, en los hechos, la metodología del obligado.
--
-- Y la regla que el ADR pide comprobable: **si la configuración está vacía, no
-- se calcula un grado**. Aquí no es una precondición de la aplicación, es que
-- la fila no se puede escribir: `evaluaciones_riesgo` exige un modelo vigente,
-- y un modelo no llega a vigente sin factores ni sin una escala válida.

-- ---------------------------------------------------------------------------
-- 1. Fuera lo que no le queda al marco
-- ---------------------------------------------------------------------------
drop table if exists factores_riesgo;
alter table clientes_finales drop column if exists nivel_riesgo;
drop type if exists nivel_riesgo;

delete from app.privilegios_declarados where tabla = 'factores_riesgo';
delete from app.tablas_globales where tabla = 'factores_riesgo';

-- ---------------------------------------------------------------------------
-- 2. Los cuatro elementos mínimos de exposición: catálogo, no propuesta
-- ---------------------------------------------------------------------------
create table elementos_riesgo (
  id            uuid primary key default gen_random_uuid(),
  clave         text not null unique,
  nombre        text not null,
  fuente        text not null,
  vigente_desde date not null,
  created_at    timestamptz not null default now()
);

comment on table elementos_riesgo is
  'Los elementos mínimos de exposición al Riesgo que el Art. 10 Septies 1, fr. I del Acuerdo 115/2026 fija como piso. Es catálogo regulatorio global: la norma dice CUÁLES son, no cuánto pesan. Los factores concretos dentro de cada elemento, sus indicadores y sus ponderaciones son del obligado (ADR-21) y viven en factores_modelo.';

insert into app.tablas_globales (tabla, motivo) values
  ('elementos_riesgo', 'catálogo regulatorio global: los elementos mínimos del Art. 10 Septies 1 fr. I');

insert into elementos_riesgo (clave, nombre, fuente, vigente_desde) values
  ('actos_operaciones', 'Los actos u operaciones que se realizan',
   'Art. 10 Septies 1, fracción I, inciso a) del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797). Contrastado el 2026-08-20.', date '2027-03-01'),
  ('tipo_cliente', 'El tipo de personas Clientes o Usuarias',
   'Art. 10 Septies 1, fracción I, inciso b) del Acuerdo 115/2026. Contrastado el 2026-08-20.', date '2027-03-01'),
  ('geografia', 'Los países y áreas geográficas',
   'Art. 10 Septies 1, fracción I, inciso c) del Acuerdo 115/2026. Contrastado el 2026-08-20.', date '2027-03-01'),
  ('transacciones_canales', 'Las transacciones y los canales de envío o distribución',
   'Art. 10 Septies 1, fracción I, inciso d) del Acuerdo 115/2026. Contrastado el 2026-08-20.', date '2027-03-01');

-- ---------------------------------------------------------------------------
-- 3. La escala del obligado: al menos tres, y los intermedios que quiera
-- ---------------------------------------------------------------------------
create table grados_riesgo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  clave         text not null,
  nombre        text not null,
  -- 1 es el menor riesgo. Decide el orden de la escala sin depender del nombre.
  orden         smallint not null,
  -- Qué grado dispara las obligaciones reforzadas. No se deduce del orden:
  -- un obligado puede marcar como alto más de un grado de los de arriba.
  es_alto       boolean not null default false,
  vigente_desde date not null,
  created_at    timestamptz not null default now(),

  unique (tenant_id, id),
  unique (tenant_id, clave),
  unique (tenant_id, orden),
  constraint orden_positivo check (orden >= 1)
);

comment on table grados_riesgo is
  'La escala de Grado de Riesgo del obligado. Art. 23 Bis ¶2: al menos tres clasificaciones, «pudiendo establecer tantos intermedios como consideren necesario» — por eso es tabla y no enum. es_alto marca cuál dispara las medidas reforzadas de los Arts. 23 Ter 3, 23 Ter 4 y 23 Ter 5.';

-- ---------------------------------------------------------------------------
-- 4. La metodología, versionada y con estado
-- ---------------------------------------------------------------------------
create type estado_modelo_riesgo as enum ('borrador', 'vigente', 'sustituido');

create table modelos_riesgo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  version       integer not null,
  estado        estado_modelo_riesgo not null default 'borrador',
  -- Art. 10 Septies 1 fr. II: el método que asigna valores. Lo describe el
  -- obligado; VIZO no propone ninguno.
  metodo_medicion text,
  vigente_desde date,
  aprobado_por  uuid references usuarios(id),
  aprobado_en   timestamptz,
  created_at    timestamptz not null default now(),

  unique (tenant_id, id),
  unique (tenant_id, version),
  -- Un modelo vigente exige constar quién lo aprobó y desde cuándo: es la
  -- decisión del obligado sobre su propia metodología, y sin firma no se
  -- puede defender ante una revisión.
  constraint vigente_exige_su_aprobacion check (
    (estado = 'borrador' and aprobado_por is null and aprobado_en is null and vigente_desde is null)
    or (estado in ('vigente', 'sustituido')
        and aprobado_por is not null and aprobado_en is not null and vigente_desde is not null)
  )
);

comment on table modelos_riesgo is
  'La metodología de Riesgos del obligado (Cap. II Quáter), versionada. VIZO no propone factores ni pesos (ADR-21): guarda la que el obligado configuró, quién la aprobó y desde cuándo, y conserva las versiones anteriores para poder reconstruir con qué modelo se evaluó a un cliente en una fecha.';

-- A lo mucho un modelo vigente por obligado. Que convivan un vigente y un
-- borrador es lo normal: se prepara la versión nueva antes de activarla.
create unique index modelo_riesgo_uno_vigente
  on modelos_riesgo (tenant_id) where estado = 'vigente';

-- ---------------------------------------------------------------------------
-- 5. La configuración del obligado. NACE VACÍA, y así se queda hasta que él
--    la llene (ADR-21)
-- ---------------------------------------------------------------------------
create table factores_modelo (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  modelo_id    uuid not null,
  elemento_id  uuid not null references elementos_riesgo(id),
  factor       text not null,
  -- Los indicadores y sus valores, como el obligado los describa. jsonb y no
  -- columnas porque la forma la decide él: la norma no la fija.
  indicadores  jsonb not null default '{}'::jsonb,
  peso         numeric(6,3) not null,
  created_at   timestamptz not null default now(),

  foreign key (tenant_id, modelo_id) references modelos_riesgo(tenant_id, id),
  unique (tenant_id, modelo_id, elemento_id, factor),
  constraint peso_en_rango check (peso > 0 and peso <= 100)
);

comment on table factores_modelo is
  'Los factores de riesgo del obligado, con sus indicadores y ponderaciones, dentro de los elementos mínimos del Art. 10 Septies 1. VIZO NUNCA siembra filas aquí ni sugiere valores por omisión: un peso sugerido que nadie cambia se vuelve, en los hechos, la metodología del obligado (ADR-21, la trampa nombrada).';

-- ---------------------------------------------------------------------------
-- 6. La evaluación: append-only, con el modelo que la produjo
-- ---------------------------------------------------------------------------
create table evaluaciones_riesgo (
  id            uuid primary key default gen_random_uuid(),
  -- POR QUÉ HAY UNA SECUENCIA Y NO BASTA `evaluado_en`.
  --
  -- `now()` devuelve el instante de la TRANSACCIÓN, no del statement: dos
  -- evaluaciones del mismo cliente en la misma transacción quedan con idéntico
  -- `evaluado_en`, y «la más reciente» deja de tener respuesta. Lo encontró la
  -- aserción de abajo, no una revisión: la vista devolvía cualquiera de las dos.
  -- Mismo recurso que `bitacora.secuencia`.
  secuencia     bigserial not null,
  tenant_id     uuid not null references tenants(id),
  cliente_id    uuid not null,
  modelo_id     uuid not null,
  grado_id      uuid not null,
  puntaje       numeric(10,3),
  -- El mismo criterio que `evaluaciones_umbral.umbrales_aplicados`: la
  -- evaluación guarda la configuración que la produjo, no solo su resultado.
  -- Sin eso, cambiar el modelo volvería irreconstruible el pasado.
  factores_aplicados jsonb not null,
  motivo        text,
  evaluado_en   timestamptz not null default now(),
  evaluado_por  uuid references usuarios(id),
  -- Art. 23 Bis 1: al menos cada seis meses, más seguido cuanto mayor el
  -- riesgo. La fecha se deriva del catálogo, no se escribe a mano.
  vence         date not null,

  foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id),
  foreign key (tenant_id, modelo_id) references modelos_riesgo(tenant_id, id),
  foreign key (tenant_id, grado_id) references grados_riesgo(tenant_id, id)
);

comment on table evaluaciones_riesgo is
  'Histórico append-only de Grado de Riesgo por cliente. Reemplaza la columna mutable clientes_finales.nivel_riesgo, que no podía cumplir el Art. 41 fr. IV: conservar el histórico de modificaciones del grado. El grado vigente se lee de la vista clientes_riesgo_vigente.';

create index on evaluaciones_riesgo (tenant_id, cliente_id, secuencia desc);

-- ---------------------------------------------------------------------------
-- 7. Lo que hace inexpresable la Respuesta A del ADR-21
-- ---------------------------------------------------------------------------
-- Un modelo no llega a vigente sin escala válida y sin factores. Es la regla
-- del ADR escrita donde no se puede rodear: la aplicación podría olvidarse de
-- comprobarlo; la base no.
create or replace function app.modelo_riesgo_activable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grados int;
  v_altos  int;
  v_factores int;
  v_minimo int;
begin
  if new.estado <> 'vigente' or old.estado = 'vigente' then
    return new;
  end if;

  select (valor #>> '{}')::int into v_minimo
    from public.parametros_motor
   where clave = 'minimo_clasificaciones_riesgo' and actividad_id is null
   order by vigente_desde desc limit 1;

  select count(*), count(*) filter (where es_alto)
    into v_grados, v_altos
    from public.grados_riesgo where tenant_id = new.tenant_id;

  if v_grados < coalesce(v_minimo, 3) then
    raise exception
      'La escala de Grado de Riesgo tiene % clasificación(es) y el Art. 23 Bis exige al menos %. Los intermedios son libres; el piso no.',
      v_grados, coalesce(v_minimo, 3)
      using errcode = 'check_violation';
  end if;

  if v_altos = 0 then
    raise exception
      'Ningún grado está marcado como alto. De ese valor cuelgan las medidas reforzadas de los Arts. 23 Ter 3, 23 Ter 4 y la aprobación de directivo del 23 Ter 5: sin él, esas obligaciones no se dispararían nunca.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_factores
    from public.factores_modelo where modelo_id = new.id;

  if v_factores = 0 then
    raise exception
      'Este modelo no tiene ningún factor configurado. VIZO no propone factores ni ponderaciones (ADR-21): los captura el obligado. Un modelo vacío no puede clasificar a nadie, y activarlo produciría grados que nadie decidió.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger modelo_riesgo_activacion
  before update on modelos_riesgo
  for each row execute function app.modelo_riesgo_activable();

-- Solo se evalúa contra un modelo VIGENTE. Evaluar contra un borrador
-- produciría un grado que el obligado todavía no aprobó.
create or replace function app.evaluacion_riesgo_admisible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  select estado::text into v_estado
    from public.modelos_riesgo where id = new.modelo_id;

  if v_estado is distinct from 'vigente' then
    raise exception
      'No se puede evaluar el riesgo contra un modelo en estado %. Solo un modelo vigente —aprobado por el obligado— clasifica clientes.',
      coalesce(v_estado, 'inexistente')
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger evaluacion_riesgo_contra_modelo_vigente
  before insert on evaluaciones_riesgo
  for each row execute function app.evaluacion_riesgo_admisible();

create trigger evaluaciones_riesgo_append_only
  before update or delete on evaluaciones_riesgo
  for each row execute function app.prohibir_mutacion();

create trigger evaluaciones_riesgo_sin_truncate
  before truncate on evaluaciones_riesgo
  execute function app.prohibir_mutacion();

-- Un factor no se edita después de que su modelo entró en vigor: cambiaría
-- retroactivamente el criterio con el que ya se clasificó a alguien. Se
-- versiona el modelo.
create or replace function app.factor_modelo_solo_en_borrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_modelo uuid;
begin
  v_modelo := case when tg_op = 'DELETE' then old.modelo_id else new.modelo_id end;
  select estado::text into v_estado from public.modelos_riesgo where id = v_modelo;

  if v_estado is distinct from 'borrador' then
    raise exception
      'Los factores de un modelo % no se tocan: cambiarlos movería el criterio con el que ya se clasificó a clientes. Se crea una versión nueva del modelo.',
      coalesce(v_estado, 'inexistente')
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger factor_modelo_congelado
  before insert or update or delete on factores_modelo
  for each row execute function app.factor_modelo_solo_en_borrador();

-- ---------------------------------------------------------------------------
-- 8. El grado vigente se LEE, no se guarda
-- ---------------------------------------------------------------------------
create view clientes_riesgo_vigente
with (security_invoker = true) as
select distinct on (e.cliente_id)
       e.tenant_id,
       e.cliente_id,
       e.id            as evaluacion_id,
       g.clave         as grado,
       g.nombre        as grado_nombre,
       g.es_alto,
       e.puntaje,
       e.evaluado_en,
       e.vence,
       (e.vence < (now() at time zone 'America/Mexico_City')::date) as vencida
  from evaluaciones_riesgo e
  join grados_riesgo g on g.id = e.grado_id
 order by e.cliente_id, e.secuencia desc;

comment on view clientes_riesgo_vigente is
  'El Grado de Riesgo vigente de cada cliente: la evaluación más reciente. Es vista y no columna porque el Art. 41 fr. IV exige el histórico, y una columna que se sobrescribe lo pierde. security_invoker: RLS de evaluaciones_riesgo decide qué ve cada obligado.';

-- ---------------------------------------------------------------------------
-- 9. Los plazos, como dato con fuente
-- ---------------------------------------------------------------------------
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'minimo_clasificaciones_riesgo', '3'::jsonb,
   'Cuántas clasificaciones de Grado de Riesgo debe tener como mínimo la escala del obligado. Es un piso: los intermedios son libres.',
   date '2027-03-01',
   'Art. 23 Bis, párrafo 2, del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): «al menos tres clasificaciones […] pudiendo establecer tantos grados intermedios como consideren necesario». Contrastado el 2026-08-20.'),
  (null, 'reevaluacion_grado_meses', '6'::jsonb,
   'Cada cuánto se reevalúa el Grado de Riesgo de un cliente. Es un máximo: cuanto mayor el riesgo, más seguido.',
   date '2027-03-01',
   'Art. 23 Bis 1 del Acuerdo 115/2026: «al menos cada seis meses». NO comparte fila con la reevaluación del Perfil transaccional (Art. 23 Ter 1 ¶3), que tiene el mismo número y distinto fundamento: si una reforma mueve uno, el otro no debe moverse solo. Contrastado el 2026-08-20.'),
  (null, 'periodo_minimo_datos_meses', '12'::jsonb,
   'Periodo mínimo de datos de la operación con el que se implementa la metodología de Riesgos.',
   date '2027-03-01',
   'Art. 10 Septies 2, fracción II, del Acuerdo 115/2026: «no menor a doce meses». Contrastado el 2026-08-20.');

-- ---------------------------------------------------------------------------
-- 10. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table elementos_riesgo    enable row level security;
alter table grados_riesgo       enable row level security;
alter table modelos_riesgo      enable row level security;
alter table factores_modelo     enable row level security;
alter table evaluaciones_riesgo enable row level security;

create policy "el catálogo de elementos lo lee cualquiera con sesión" on elementos_riesgo
  for select to authenticated using (true);

create policy "ver mi escala" on grados_riesgo
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin define la escala" on grados_riesgo
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver mis modelos" on modelos_riesgo
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin crea modelos" on modelos_riesgo
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());
create policy "admin activa su modelo" on modelos_riesgo
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver mis factores" on factores_modelo
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin configura factores" on factores_modelo
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());
create policy "admin corrige el borrador" on factores_modelo
  for delete to authenticated using (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver las evaluaciones de mi obligado" on evaluaciones_riesgo
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "registrar la evaluación" on evaluaciones_riesgo
  for insert to authenticated with check (tenant_id = app.tenant_id());

grant select on elementos_riesgo to authenticated;
grant select, insert on grados_riesgo to authenticated;
grant select, insert on modelos_riesgo to authenticated;
grant update (estado, metodo_medicion, vigente_desde, aprobado_por, aprobado_en)
  on modelos_riesgo to authenticated;
grant select, insert, delete on factores_modelo to authenticated;
grant select, insert on evaluaciones_riesgo to authenticated;
grant select on clientes_riesgo_vigente to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('grados_riesgo','authenticated','INSERT',null,
   'el admin define su escala de grados (Art. 23 Bis: al menos tres)'),
  ('modelos_riesgo','authenticated','INSERT',null,
   'el admin crea la versión de su metodología'),
  ('modelos_riesgo','authenticated','UPDATE','estado',
   'POR COLUMNA: activar o sustituir el modelo; el trigger exige escala y factores'),
  ('modelos_riesgo','authenticated','UPDATE','metodo_medicion',
   'POR COLUMNA: el método de medición del Art. 10 Septies 1 fr. II, mientras es borrador'),
  ('modelos_riesgo','authenticated','UPDATE','vigente_desde',
   'POR COLUMNA: desde cuándo rige'),
  ('modelos_riesgo','authenticated','UPDATE','aprobado_por',
   'POR COLUMNA: quién aprobó la metodología'),
  ('modelos_riesgo','authenticated','UPDATE','aprobado_en',
   'POR COLUMNA: cuándo la aprobó'),
  ('factores_modelo','authenticated','INSERT',null,
   'el obligado captura SUS factores; VIZO nunca siembra aquí (ADR-21)'),
  ('factores_modelo','authenticated','DELETE',null,
   'corregir el borrador antes de activarlo; el trigger lo impide una vez vigente'),
  ('evaluaciones_riesgo','authenticated','INSERT',null,
   'registrar la evaluación de un cliente contra el modelo vigente');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid;
  v_modelo uuid; v_bajo uuid; v_medio uuid; v_alto uuid; v_elem uuid;
  v_eval uuid; v_rechazo boolean; v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('RSG270301AB1', 'Aserción rediseño de riesgo', 'moral') returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-riesgo@ejemplo.mx')
  returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Riesgo', 'asercion-riesgo@ejemplo.mx');

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'moral', 'CRG010101AAA', 'Cliente de Aserción SA', 'MX')
  returning id into v_cliente;

  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';

  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;

  -- 1. Un modelo sin escala no se activa.
  v_rechazo := false;
  begin
    update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
           aprobado_por = v_user, aprobado_en = now() where id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un modelo se activó sin escala de grados, y el Art. 23 Bis exige al menos tres.';
  end if;

  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde)
  values (v_tenant, 'bajo', 'Bajo', 1, false, date '2027-03-01') returning id into v_bajo;

  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, date '2027-03-01') returning id into v_medio;

  -- 2. Con dos grados tampoco: el piso son tres.
  v_rechazo := false;
  begin
    update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
           aprobado_por = v_user, aprobado_en = now() where id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un modelo se activó con dos clasificaciones: el Art. 23 Bis pone el piso en tres.';
  end if;

  -- Tres grados, pero ninguno marcado como alto.
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde)
  values (v_tenant, 'alto', 'Alto', 3, false, date '2027-03-01') returning id into v_alto;

  -- 3. Sin grado alto, las obligaciones reforzadas no se dispararían nunca.
  v_rechazo := false;
  begin
    update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
           aprobado_por = v_user, aprobado_en = now() where id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un modelo se activó sin ningún grado marcado como alto: los Arts. 23 Ter 3 a 5 quedarían muertos.';
  end if;

  update grados_riesgo set es_alto = true where id = v_alto;

  -- 4. LA REGLA DEL ADR-21: con la configuración vacía, no hay activación.
  v_rechazo := false;
  begin
    update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
           aprobado_por = v_user, aprobado_en = now() where id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un modelo SIN FACTORES se activó. Habría clasificado clientes con un criterio que nadie configuró — exactamente lo que el ADR-21 prohíbe.';
  end if;

  -- 5. Evaluar contra un borrador tampoco.
  v_rechazo := false;
  begin
    insert into evaluaciones_riesgo
      (tenant_id, cliente_id, modelo_id, grado_id, factores_aplicados, vence)
    values (v_tenant, v_cliente, v_modelo, v_alto, '{}'::jsonb, current_date + 180);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se evaluó a un cliente contra un modelo en borrador, que el obligado todavía no aprueba.';
  end if;

  -- El camino bueno: se configura un factor y ahora sí se activa.
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Persona moral de reciente constitución', 15.5);

  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  -- 6. Ya vigente, los factores no se tocan.
  v_rechazo := false;
  begin
    update factores_modelo set peso = 90 where modelo_id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se editó un factor de un modelo vigente: el criterio de clasificación cambió retroactivamente.';
  end if;

  insert into evaluaciones_riesgo
    (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados, evaluado_por, vence)
  values (v_tenant, v_cliente, v_modelo, v_medio, 42.5,
          '[{"factor":"Persona moral de reciente constitución","peso":15.5}]'::jsonb,
          v_user, current_date + 180)
  returning id into v_eval;

  -- 7. La evaluación es append-only.
  v_rechazo := false;
  begin
    update evaluaciones_riesgo set grado_id = v_alto where id = v_eval;
  exception when others then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una evaluación de riesgo se pudo reescribir: el Art. 41 fr. IV exige conservar el histórico.';
  end if;

  -- 8. La vista devuelve la MÁS RECIENTE, no la primera.
  insert into evaluaciones_riesgo
    (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados, evaluado_por, vence)
  values (v_tenant, v_cliente, v_modelo, v_alto, 81.0,
          '[{"factor":"Persona moral de reciente constitución","peso":15.5}]'::jsonb,
          v_user, current_date + 90);

  -- Las dos evaluaciones se escribieron en ESTA transacción, así que comparten
  -- `evaluado_en` al milisegundo. Si la vista ordenara por esa columna, aquí
  -- devolvería cualquiera de las dos — y este caso fue el que lo descubrió.
  if (select grado from clientes_riesgo_vigente where cliente_id = v_cliente) <> 'alto' then
    raise exception 'La vista del grado vigente no devolvió la evaluación más reciente. Con dos evaluaciones en la misma transacción, ordenar por evaluado_en es indeterminado.';
  end if;
  if (select count(*) from evaluaciones_riesgo where cliente_id = v_cliente) <> 2 then
    raise exception 'El histórico perdió una evaluación: deben conservarse las dos.';
  end if;

  -- 9. Y el catálogo de elementos quedó sembrado con su fuente.
  if (select count(*) from elementos_riesgo where fuente like '%10 Septies 1%') <> 4 then
    raise exception 'Los cuatro elementos mínimos del Art. 10 Septies 1 fr. I no quedaron en el catálogo con su fuente.';
  end if;

  -- Limpieza. El trigger append-only bloquea el DELETE —que es justo lo que
  -- debe hacer—, así que se desactiva solo para la aserción, mismo recurso que
  -- usó la migración de constancias.
  alter table evaluaciones_riesgo disable trigger evaluaciones_riesgo_append_only;
  delete from evaluaciones_riesgo where tenant_id = v_tenant;
  alter table evaluaciones_riesgo enable trigger evaluaciones_riesgo_append_only;

  -- Y los factores, que el trigger congela una vez vigente el modelo.
  update modelos_riesgo set estado = 'sustituido' where id = v_modelo;
  alter table factores_modelo disable trigger factor_modelo_congelado;
  delete from factores_modelo      where tenant_id = v_tenant;
  alter table factores_modelo enable trigger factor_modelo_congelado;
  delete from modelos_riesgo       where tenant_id = v_tenant;
  delete from grados_riesgo        where tenant_id = v_tenant;
  delete from clientes_finales     where tenant_id = v_tenant;
  delete from usuarios             where tenant_id = v_tenant;
  delete from auth.users           where id = v_user;
  delete from tenants              where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_por_omision();
  if v_problemas is not null then
    raise exception 'Privilegios por omisión sobre las tablas nuevas:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_tenancy();
  if v_problemas is not null then
    raise exception 'Tenancy incompleta:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ riesgo: la escala es configurable, el modelo vacío no se activa, y el grado tiene histórico';
end $$;
