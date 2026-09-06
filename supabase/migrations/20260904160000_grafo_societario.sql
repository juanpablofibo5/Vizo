-- ---------------------------------------------------------------------------
-- El grafo societario · la cadena de titularidad como dato, no como cálculo
-- del capturista
-- ---------------------------------------------------------------------------
-- Fase 1 del plano de arquitectura del 4-sep-2026, contrastado en el ADR-39.
--
-- El Art. 23 Quinquies fr. I habla de quien «directa o INDIRECTAMENTE» posea
-- el 25% o más. Hasta hoy «indirectamente» lo resolvía el capturista con una
-- calculadora: la cadena PF → PM A (60%) → PM B (50%) → cliente había que
-- multiplicarla a mano y teclear «30%». Estas dos tablas guardan la
-- ESTRUCTURA —quién posee qué, con cuánto y desde cuándo— y el motor hace la
-- aritmética con su traza.
--
-- EL GRAFO NACE POR TENANT Y POR CLIENTE. El plano sugería compartir partes
-- entre obligados «a nivel de datos»; chocaría de frente con el aislamiento
-- por tenant que protege todo lo demás, y el propio plano admite que la
-- determinación nunca se comparte. Queda como decisión de producto explícita
-- (artifact «El plano y lo construido»), no como omisión.

create type tipo_parte_societaria as enum ('fisica', 'moral', 'fideicomiso', 'otra_figura');

create table partes_societarias (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  tipo   tipo_parte_societaria not null,
  nombre text not null,
  rfc    text,
  curp   text,

  -- Exactamente una raíz por estructura: el cliente evaluado. Las aristas que
  -- entran a la raíz son las participaciones directas en el cliente.
  es_la_raiz boolean not null default false,

  created_at timestamptz not null default now(),

  constraint partes_tenant_uk unique (tenant_id, id),
  constraint partes_de_su_estructura_uk unique (tenant_id, cliente_id, id),
  constraint parte_del_mismo_cliente
    foreign key (tenant_id, cliente_id) references clientes_finales (tenant_id, id),
  constraint nombre_de_parte_no_vacio check (length(btrim(nombre)) > 0)
);

create unique index una_raiz_por_estructura
  on partes_societarias (tenant_id, cliente_id) where es_la_raiz;

create index on partes_societarias (tenant_id, cliente_id);

comment on table partes_societarias is
  'Los nodos de la estructura societaria de un cliente: personas físicas, '
  'morales, fideicomisos u otras figuras. La raíz es el cliente evaluado.';

create table participaciones_societarias (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  -- `dueno` posee `porcentaje` de `poseida`.
  dueno_id   uuid not null,
  poseida_id uuid not null,
  porcentaje numeric(5,2) not null,

  -- BITEMPORALIDAD (punto 2 del plano): `vigente_*` es cuándo fue cierto en
  -- el mundo —la fecha de la asamblea, no la de captura— y `created_at` es
  -- cuándo lo supimos. Corregir es cerrar la vigencia e insertar la nueva.
  vigente_desde date not null,
  vigente_hasta date,

  -- El documento que la acredita, cuando ya se subió al expediente.
  documento_id uuid,

  registrado_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint participaciones_tenant_uk unique (tenant_id, id),
  -- Las dos puntas viven en LA MISMA estructura: FK de tres columnas, para
  -- que una arista entre estructuras de clientes distintos sea inexpresable.
  constraint dueno_de_la_misma_estructura
    foreign key (tenant_id, cliente_id, dueno_id)
    references partes_societarias (tenant_id, cliente_id, id),
  constraint poseida_de_la_misma_estructura
    foreign key (tenant_id, cliente_id, poseida_id)
    references partes_societarias (tenant_id, cliente_id, id),
  constraint documento_del_mismo_obligado
    foreign key (tenant_id, documento_id) references documentos (tenant_id, id),
  constraint nadie_se_posee_a_si_mismo check (dueno_id <> poseida_id),
  constraint porcentaje_en_rango check (porcentaje > 0 and porcentaje <= 100),
  constraint vigencia_coherente check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  -- Un par dueño→poseída no puede tener dos participaciones vigentes que se
  -- traslapen: el mismo patrón que `parametro_sin_traslape` del catálogo.
  constraint participacion_sin_traslape exclude using gist (
    tenant_id with =, dueno_id with =, poseida_id with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  )
);

create index on participaciones_societarias (tenant_id, cliente_id, vigente_desde);

comment on table participaciones_societarias is
  'Las aristas de la estructura: quién posee qué porcentaje de quién, con '
  'vigencia real. El producto de la cadena lo calcula el motor, nunca el '
  'capturista.';

-- Nadie es dueño de una persona física. Es trigger y no CHECK porque mira el
-- tipo de OTRA fila; la FK de tres columnas ya garantizó que es de la misma
-- estructura, así que la consulta es directa.
create or replace function app.nadie_posee_a_una_fisica() returns trigger
language plpgsql as $$
declare v_tipo tipo_parte_societaria;
begin
  select tipo into v_tipo from partes_societarias where id = new.poseida_id;
  if v_tipo = 'fisica' then
    raise exception using
      errcode = 'check_violation',
      message = 'Nadie puede ser dueño de una persona física',
      detail  = 'Las participaciones poseen personas morales, fideicomisos u otras figuras; la persona física es donde la cadena termina.';
  end if;
  return new;
end $$;

create trigger nadie_posee_a_una_fisica
  before insert on participaciones_societarias
  for each row execute function app.nadie_posee_a_una_fisica();

-- Lo único que cambia de una participación es que su vigencia se cierra.
-- Corregir el porcentaje es cerrar ésta e insertar la buena: así la pregunta
-- «¿qué estructura era cierta el 14 de marzo?» siempre tiene respuesta.
create or replace function app.participacion_solo_se_cierra() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'restrict_violation',
      message = 'Una participación no se borra: se le cierra la vigencia',
      hint    = 'Cerrarla conserva la respuesta a qué estructura era cierta en cada fecha.';
  end if;
  if old.vigente_hasta is not null then
    raise exception 'Esta participación ya tiene la vigencia cerrada; corrige insertando una nueva';
  end if;
  if (new.tenant_id, new.cliente_id, new.dueno_id, new.poseida_id, new.porcentaje,
      new.vigente_desde, new.documento_id, new.registrado_por)
     is distinct from
     (old.tenant_id, old.cliente_id, old.dueno_id, old.poseida_id, old.porcentaje,
      old.vigente_desde, old.documento_id, old.registrado_por) then
    raise exception 'Solo la vigencia se cierra: lo demás es el hecho tal como se capturó';
  end if;
  if new.vigente_hasta is null then
    raise exception 'Cerrar la vigencia es ponerle fecha, no dejarla abierta';
  end if;
  return new;
end $$;

create trigger participacion_solo_se_cierra
  before update or delete on participaciones_societarias
  for each row execute function app.participacion_solo_se_cierra();

-- Las partes: el nombre puede corregirse (un typo no es historia societaria),
-- pero el tipo y la raíz no — de ellos cuelga la aritmética ya corrida.
create or replace function app.parte_con_lo_esencial_congelado() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- Borrar una parte sin participaciones es corregir un alta equivocada;
    -- con participaciones, las FKs lo impiden solas.
    return old;
  end if;
  if (new.tipo, new.es_la_raiz, new.cliente_id)
     is distinct from (old.tipo, old.es_la_raiz, old.cliente_id) then
    raise exception 'El tipo y la raíz de una parte no se editan: de ellos cuelga la aritmética ya corrida. Da de alta la parte correcta.';
  end if;
  return new;
end $$;

create trigger parte_con_lo_esencial_congelado
  before update or delete on partes_societarias
  for each row execute function app.parte_con_lo_esencial_congelado();

-- ---------------------------------------------------------------------------
-- El catálogo: el tope y la regla, con su fuente honesta
-- ---------------------------------------------------------------------------
insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('grafo_profundidad_maxima', '10'::jsonb,
   'Tope duro de niveles del recorrido de la cadena de titularidad',
   '2026-09-04',
   'Parámetro OPERATIVO: no proviene de ninguna norma. El Art. 23 Quinquies 1 ¶2 manda ascender '
   '«hasta identificar a la persona física» sin fijar tope, y un recorrido sin tope es un '
   'recorrido que un dato malo vuelve infinito. Diez niveles cubre estructuras reales con '
   'holgura; una más honda se revisa a mano antes de subir el número. Coincide con la pregunta 3 '
   'de docs/BENEFICIARIO-CONTROLADOR.md §6 al especialista.'),
  ('grafo_regla_agregacion', '"producto_de_la_cadena"'::jsonb,
   'Cómo se computa la participación indirecta a través de una cadena',
   '2026-09-04',
   'POR CONFIRMAR-14. El Art. 23 Quinquies fr. I dice «directa o indirectamente» sin definir el '
   'método de cómputo. El producto de la cadena (60% de quien tiene 50% = 30%) es la práctica '
   'estándar internacional y la que asume el plano de arquitectura del 4-sep-2026, pero NO tiene '
   'artículo citable: por eso es dato y no código, y por eso la pregunta va al especialista. Si '
   'la respuesta fuera otra regla, cambiarla es un UPDATE aquí y una implementación probada en '
   'el motor — nunca una aproximación silenciosa.');

-- ---------------------------------------------------------------------------
-- El snapshot de la resolución, congelado en la identificación
-- ---------------------------------------------------------------------------
-- Punto 9 del plano: guardar la ENTRADA, no solo la salida. Cuando la
-- identificación del Beneficiario Controlador se corre desde la estructura,
-- aquí queda el grafo exacto que la alimentó, las cadenas con sus productos y
-- las advertencias — para que la corrida se pueda repetir años después y dar
-- idéntico resultado.
alter table identificaciones_bc add column resolucion_grafo jsonb;

comment on column identificaciones_bc.resolucion_grafo is
  'El snapshot del grafo societario que alimentó esta identificación: partes, '
  'participaciones vigentes a la fecha, cadenas con su producto, advertencias '
  'y parámetros aplicados. NULL cuando la captura fue manual.';

-- La inmutabilidad de la identificación tiene que abarcar la columna nueva:
-- el trigger compara campo por campo, y uno que no esté en la lista se puede
-- reescribir en silencio.
create or replace function app.identificacion_bc_solo_se_sustituye() returns trigger
language plpgsql as $$
begin
  if new.estado = old.estado then
    raise exception 'La identificación del Beneficiario Controlador es inmutable: corrige con una nueva que sustituya a esta';
  end if;
  if not (old.estado = 'vigente' and new.estado = 'sustituida') then
    raise exception 'Una identificación sustituida no vuelve a estar vigente';
  end if;
  if (new.via, new.cliente_id, new.fecha_identificacion, new.umbral_pct, new.umbral_inclusivo,
      new.sustituye_a, new.desciende_de_hallazgo_id, new.determinada_por, new.resolucion_grafo)
     is distinct from
     (old.via, old.cliente_id, old.fecha_identificacion, old.umbral_pct, old.umbral_inclusivo,
      old.sustituye_a, old.desciende_de_hallazgo_id, old.determinada_por, old.resolucion_grafo) then
    raise exception 'Solo el estado cambia: lo demás es la evidencia de cómo se determinó';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table partes_societarias enable row level security;
alter table participaciones_societarias enable row level security;

create policy "ver partes" on partes_societarias for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "capturar partes" on partes_societarias for insert
  to authenticated with check (tenant_id = app.tenant_id());
create policy "corregir partes" on partes_societarias for update
  to authenticated using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());
create policy "quitar un alta equivocada" on partes_societarias for delete
  to authenticated using (tenant_id = app.tenant_id());

create policy "ver participaciones" on participaciones_societarias for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "capturar participaciones" on participaciones_societarias for insert
  to authenticated with check (tenant_id = app.tenant_id());
create policy "cerrar vigencia de participaciones" on participaciones_societarias for update
  to authenticated using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

grant select, insert, update, delete on partes_societarias to authenticated;
grant select, insert, update on participaciones_societarias to authenticated;
revoke truncate, trigger, references, maintain on partes_societarias from authenticated, anon;
revoke truncate, trigger, references, maintain on participaciones_societarias from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('partes_societarias','authenticated','INSERT',null,
   'El obligado captura los nodos de la estructura societaria del cliente'),
  ('partes_societarias','authenticated','UPDATE',null,
   'Corregir nombre/RFC/CURP de una parte; el tipo y la raíz los congela un trigger'),
  ('partes_societarias','authenticated','DELETE',null,
   'Quitar un alta equivocada SIN participaciones; con ellas, las FKs lo impiden'),
  ('participaciones_societarias','authenticated','INSERT',null,
   'Las participaciones de la estructura, con su vigencia real'),
  ('participaciones_societarias','authenticated','UPDATE',null,
   'Cerrar la vigencia; el trigger impide tocar cualquier otra cosa')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid;
  v_raiz uuid; v_pm uuid; v_pf uuid; v_arista uuid; v_rechazo boolean;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('GRF270301AB1', 'Aserción grafo', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-grf@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción GRF', 'asercion-grf@ejemplo.mx');
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente del grafo', 'CGR270301XY9', false, v_dom)
  returning id into v_cliente;

  insert into partes_societarias (tenant_id, cliente_id, tipo, nombre, es_la_raiz)
  values (v_tenant, v_cliente, 'moral', 'Cliente del grafo', true) returning id into v_raiz;
  insert into partes_societarias (tenant_id, cliente_id, tipo, nombre)
  values (v_tenant, v_cliente, 'moral', 'PM intermedia') returning id into v_pm;
  insert into partes_societarias (tenant_id, cliente_id, tipo, nombre)
  values (v_tenant, v_cliente, 'fisica', 'Persona física') returning id into v_pf;

  -- ── 1. Una sola raíz por estructura ───────────────────────────────────
  v_rechazo := false;
  begin
    insert into partes_societarias (tenant_id, cliente_id, tipo, nombre, es_la_raiz)
    values (v_tenant, v_cliente, 'moral', 'Segunda raíz', true);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: una estructura aceptó dos raíces';

  -- ── 2. Nadie es dueño de una persona física ───────────────────────────
  v_rechazo := false;
  begin
    insert into participaciones_societarias
      (tenant_id, cliente_id, dueno_id, poseida_id, porcentaje, vigente_desde, registrado_por)
    values (v_tenant, v_cliente, v_pm, v_pf, 50, '2027-01-01', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: alguien quedó como dueño de una persona física';

  -- ── 3. Dos participaciones vigentes del mismo par no se traslapan ─────
  insert into participaciones_societarias
    (tenant_id, cliente_id, dueno_id, poseida_id, porcentaje, vigente_desde, registrado_por)
  values (v_tenant, v_cliente, v_pf, v_pm, 60, '2027-01-01', v_user) returning id into v_arista;

  v_rechazo := false;
  begin
    insert into participaciones_societarias
      (tenant_id, cliente_id, dueno_id, poseida_id, porcentaje, vigente_desde, registrado_por)
    values (v_tenant, v_cliente, v_pf, v_pm, 70, '2027-03-01', v_user);
  exception when exclusion_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: el mismo par quedó con dos participaciones vigentes traslapadas';

  -- ── 4. La corrección es cerrar la vigencia; tocar el porcentaje no ────
  v_rechazo := false;
  begin
    update participaciones_societarias set porcentaje = 65 where id = v_arista;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se reescribió el porcentaje de una participación';

  update participaciones_societarias set vigente_hasta = '2027-02-28' where id = v_arista;

  -- Y cerrada la vieja, la nueva del mismo par SÍ entra.
  insert into participaciones_societarias
    (tenant_id, cliente_id, dueno_id, poseida_id, porcentaje, vigente_desde, registrado_por)
  values (v_tenant, v_cliente, v_pf, v_pm, 70, '2027-03-01', v_user);

  -- ── 5. Borrar una participación no existe ─────────────────────────────
  v_rechazo := false;
  begin
    delete from participaciones_societarias where id = v_arista;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se borró historia societaria';

  -- ── 6. El tipo de una parte no se edita ───────────────────────────────
  v_rechazo := false;
  begin
    update partes_societarias set tipo = 'moral' where id = v_pf;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: una persona física se convirtió en moral por UPDATE';

  -- ── 7. El catálogo tiene el tope y la regla, con su fuente honesta ────
  assert (select count(*) from parametros_motor
           where clave = 'grafo_profundidad_maxima' and fuente like '%OPERATIVO%') = 1,
    'ASERCIÓN 7: el tope de profundidad no está en el catálogo declarado como operativo';
  assert (select count(*) from parametros_motor
           where clave = 'grafo_regla_agregacion' and fuente like '%POR CONFIRMAR-14%') = 1,
    'ASERCIÓN 8: la regla de agregación no está sembrada con su pregunta al especialista';

  -- ── 9. La columna de snapshot quedó dentro de la inmutabilidad ────────
  -- Se prueba de verdad en tests de persistencia (el trigger corre ahí); aquí
  -- al menos que exista y que el trigger recreado la mencione.
  assert (select count(*) from information_schema.columns
           where table_name = 'identificaciones_bc' and column_name = 'resolucion_grafo') = 1,
    'ASERCIÓN 9: falta la columna del snapshot de la resolución';
  assert (select prosrc from pg_proc where proname = 'identificacion_bc_solo_se_sustituye')
         like '%resolucion_grafo%',
    'ASERCIÓN 10: el trigger de inmutabilidad no abarca la columna nueva — se podría reescribir en silencio';

  raise notice 'Grafo societario (Fase 1): 10 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
