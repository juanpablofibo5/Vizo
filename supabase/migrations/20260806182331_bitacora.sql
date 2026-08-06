-- VIZO · Migración 001 (parte 4/8) — Bitácora inmutable
--
-- No es una tabla de auditoría cualquiera: es el objeto que se defiende en una
-- visita de verificación. Nace en la primera migración porque una bitácora
-- añadida después no puede probar el pasado (docs/DECISIONES.md ADR-05).
--
-- Tres garantías, ninguna por convención:
--   1. Solo INSERT. UPDATE y DELETE los detiene un trigger, no un comentario.
--   2. Encadenada: cada fila lleva el hash de la anterior del mismo tenant.
--      Alterar un evento intermedio rompe la cadena de forma detectable.
--   3. El reloj es del servidor. El cliente no puede escribir ocurrido_en,
--      ni la secuencia, ni el hash: el trigger los sobreescribe siempre.
--
-- Ver docs/ARQUITECTURA.md §7.

create table bitacora (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references tenants(id),
  -- Consecutivo por tenant, sin huecos. Un salto es señal de manipulación.
  secuencia    bigint not null,
  evento       text not null,             -- 'expediente.aprobado', 'aviso.presentado', ...
  objeto_tipo  text not null,
  objeto_id    uuid,
  -- REGLA DURA 3: solo IDs opacos y valores no personales. Nombres, RFC, CURP
  -- y direcciones viven en sus tablas con RLS, nunca aquí.
  datos        jsonb not null default '{}'::jsonb,
  actor_id     uuid references usuarios(id),   -- NULL = sistema
  ocurrido_en  timestamptz not null default now(),
  hash_previo  char(64) not null,
  hash         char(64) not null,
  unique (tenant_id, secuencia),
  unique (tenant_id, hash)
);

create index on bitacora (tenant_id, objeto_tipo, objeto_id);
create index on bitacora (tenant_id, ocurrido_en);

comment on table bitacora is
  'Append-only y encadenada por hash. Una corrección es un evento nuevo, jamás un UPDATE.';

-- ---------------------------------------------------------------------------
-- Génesis y llave de bloqueo
-- ---------------------------------------------------------------------------
-- El primer eslabón de cada tenant apunta a una constante conocida y
-- documentada, para que "no tiene predecesor" sea verificable y no un NULL.
create or replace function app.bitacora_genesis()
returns char(64)
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to('VIZO.bitacora.genesis.v1', 'UTF8')), 'hex')::char(64);
$$;

create or replace function app.lock_key(p_uuid uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select ('x' || substr(md5(p_uuid::text), 1, 16))::bit(64)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- Serialización canónica
-- ---------------------------------------------------------------------------
-- El hash solo sirve si la misma fila produce siempre exactamente la misma
-- cadena. Por eso: separador de unidad (U+001F) que no aparece en texto
-- normal, timestamp en UTC con precisión fija, y jsonb (que ya normaliza
-- orden de claves y espacios).
create or replace function app.bitacora_payload(
  p_tenant uuid, p_secuencia bigint, p_evento text, p_objeto_tipo text,
  p_objeto_id uuid, p_datos jsonb, p_actor uuid, p_ocurrido timestamptz,
  p_hash_previo char(64)
)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(
    chr(31),
    p_tenant::text,
    p_secuencia::text,
    p_evento,
    p_objeto_tipo,
    coalesce(p_objeto_id::text, ''),
    p_datos::text,
    coalesce(p_actor::text, ''),
    to_char(p_ocurrido at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_hash_previo
  );
$$;

-- ---------------------------------------------------------------------------
-- El trigger que encadena
-- ---------------------------------------------------------------------------
create or replace function app.bitacora_encadenar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_secuencia bigint;
  v_prev_hash      char(64);
begin
  -- Serializa las inserciones del mismo tenant durante la transacción. Sin
  -- esto, dos inserciones concurrentes leerían la misma cabeza y producirían
  -- una secuencia duplicada o una cadena bifurcada.
  perform pg_advisory_xact_lock(app.lock_key(new.tenant_id));

  select b.secuencia, b.hash into v_prev_secuencia, v_prev_hash
  from public.bitacora b
  where b.tenant_id = new.tenant_id
  order by b.secuencia desc
  limit 1;

  -- Estos cuatro campos los impone el servidor SIEMPRE, venga lo que venga
  -- del cliente.
  new.secuencia   := coalesce(v_prev_secuencia, 0) + 1;
  new.hash_previo := coalesce(v_prev_hash, app.bitacora_genesis());
  new.ocurrido_en := now();
  new.hash := encode(
    sha256(convert_to(
      app.bitacora_payload(
        new.tenant_id, new.secuencia, new.evento, new.objeto_tipo,
        new.objeto_id, new.datos, new.actor_id, new.ocurrido_en, new.hash_previo
      ), 'UTF8')),
    'hex'
  )::char(64);

  return new;
end;
$$;

create trigger bitacora_encadenar
  before insert on bitacora
  for each row execute function app.bitacora_encadenar();

-- Append-only, forzado. Aplica incluso a service_role y al owner: no existe
-- ruta administrativa que reescriba el historial "solo esta vez".
create trigger bitacora_append_only
  before update or delete on bitacora
  for each row execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- Escribir en la bitácora
-- ---------------------------------------------------------------------------
-- Punto de entrada único desde la aplicación. Existe para que registrar un
-- evento sea una línea y para que nadie tenga que saber cómo se calcula el
-- hash.
create or replace function app.bitacora_registrar(
  p_tenant      uuid,
  p_evento      text,
  p_objeto_tipo text,
  p_objeto_id   uuid default null,
  p_datos       jsonb default '{}'::jsonb,
  p_actor       uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  insert into public.bitacora (tenant_id, evento, objeto_tipo, objeto_id, datos, actor_id, hash_previo, hash)
  values (p_tenant, p_evento, p_objeto_tipo, p_objeto_id, p_datos,
          coalesce(p_actor, auth.uid()),
          '', '')   -- el trigger los reemplaza; nunca se confía en lo que llegue
  returning id into v_id;
  return v_id;
end;
$$;

-- Cabeza de la cadena: entra en el manifiesto del expediente y es lo que ata
-- la integridad documental al historial de acciones.
create or replace function app.bitacora_cabeza(p_tenant uuid)
returns char(64)
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select b.hash from public.bitacora b
      where b.tenant_id = p_tenant order by b.secuencia desc limit 1),
    app.bitacora_genesis()
  );
$$;

-- ---------------------------------------------------------------------------
-- Verificador de integridad
-- ---------------------------------------------------------------------------
-- Recalcula la cadena completa y devuelve el primer eslabón roto. Es el
-- entregable verificable de la semana 8: alterar un evento en una COPIA de la
-- base y ver que el verificador señala exactamente dónde.
create or replace function app.bitacora_verificar(p_tenant uuid)
returns table (
  secuencia_rota bigint,
  motivo         text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  r             record;
  v_esperado    char(64) := app.bitacora_genesis();
  v_secuencia   bigint := 0;
  v_recalculado char(64);
begin
  for r in
    select * from public.bitacora
    where tenant_id = p_tenant
    order by secuencia
  loop
    v_secuencia := v_secuencia + 1;

    if r.secuencia <> v_secuencia then
      secuencia_rota := r.secuencia;
      motivo := format('hueco en la secuencia: se esperaba %s', v_secuencia);
      return next;
      return;
    end if;

    if r.hash_previo <> v_esperado then
      secuencia_rota := r.secuencia;
      motivo := 'hash_previo no corresponde al eslabón anterior';
      return next;
      return;
    end if;

    v_recalculado := encode(
      sha256(convert_to(
        app.bitacora_payload(
          r.tenant_id, r.secuencia, r.evento, r.objeto_tipo,
          r.objeto_id, r.datos, r.actor_id, r.ocurrido_en, r.hash_previo
        ), 'UTF8')),
      'hex'
    )::char(64);

    if v_recalculado <> r.hash then
      secuencia_rota := r.secuencia;
      motivo := 'el contenido del evento fue alterado: el hash no cuadra';
      return next;
      return;
    end if;

    v_esperado := r.hash;
  end loop;
end;
$$;

comment on function app.bitacora_verificar(uuid) is
  'Devuelve 0 filas si la cadena está íntegra. Cualquier fila indica dónde y cómo se rompió.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table bitacora enable row level security;

create policy "ver bitácora de mi tenant" on bitacora
  for select to authenticated
  using (tenant_id = app.tenant_id());

create policy "registrar en mi tenant" on bitacora
  for insert to authenticated
  with check (tenant_id = app.tenant_id());

-- Sin políticas de UPDATE ni DELETE: no es un olvido, es el diseño.
