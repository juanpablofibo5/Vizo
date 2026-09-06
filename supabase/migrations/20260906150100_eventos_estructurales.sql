-- ---------------------------------------------------------------------------
-- Fase 3 · Los eventos estructurales: el alta pasa una vez, esto corre siempre
-- ---------------------------------------------------------------------------
-- Punto 7 del plano (ADR-41). Un cambio accionario, una fusión o un cambio de
-- administrador vuelven vieja la identificación del Beneficiario Controlador
-- — y hasta hoy nada lo decía. El evento registrado dispara las cuatro cosas
-- que el plano manda:
--
--   1. cierra las vigencias que el CAPTURISTA señale (nunca adivina cuáles),
--   2. deja la reevaluación encolada (el evento pendiente ES la cola),
--   3. arranca un plazo de actualización con fecha límite, y
--   4. levanta la alerta al obligado, nombrando el evento que la justifica.
--
-- EL PLAZO NO TIENE FUENTE NORMATIVA, Y SE DICE. El Art. 23 Quinquies (líneas
-- 259 y 262 del DOF) manda mantener la identificación actualizada «durante la
-- vigencia de la Relación de negocios» SIN fijar días. El plazo es parámetro
-- operativo declarado como tal — inventarle un artículo sería peor que no
-- tener plazo.

create type tipo_evento_estructural as enum (
  'cambio_accionario', 'fusion', 'cesion_derechos_fideicomisarios',
  'cambio_administrador', 'otro'
);

insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('evento_plazo_actualizacion_dias', '30'::jsonb,
   'Días desde el evento estructural para actualizar la identificación del Beneficiario Controlador',
   '2026-09-06',
   'Parámetro OPERATIVO: no proviene de ninguna norma. El Art. 23 Quinquies manda mantener la '
   'identificación actualizada «durante la vigencia de la Relación de negocios» (DOF, líneas 259 '
   'y 262) sin fijar días; treinta es decisión de producto para que la obligación continua tenga '
   'un reloj visible. Se relaciona con la pregunta 8 de docs/BENEFICIARIO-CONTROLADOR.md §6 '
   '(si la actualización corre con la revisión anual del Art. 21).');

create table eventos_estructurales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  tipo tipo_evento_estructural not null,
  /** Qué pasó, en palabras: «entró el fondo X con el 35%». Siempre obligatoria. */
  descripcion text not null,
  /** La fecha del acto — la asamblea, la fusión — no la de captura. */
  fecha_evento date not null,

  -- El plazo, CONGELADO al registrar: si el parámetro cambia mañana, el
  -- evento de hoy conserva el reloj con el que nació.
  fecha_limite date not null,

  -- El documento que lo evidencia, cuando ya está en el expediente.
  documento_id uuid,

  -- La reevaluación encolada: pendiente mientras esto sea NULL. La atiende la
  -- SIGUIENTE identificación del Beneficiario Controlador del cliente.
  atendido_con_identificacion_id uuid,
  atendido_en timestamptz,

  registrado_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint eventos_tenant_uk unique (tenant_id, id),
  constraint evento_del_mismo_cliente
    foreign key (tenant_id, cliente_id) references clientes_finales (tenant_id, id),
  constraint documento_del_mismo_obligado
    foreign key (tenant_id, documento_id) references documentos (tenant_id, id),
  constraint atendido_con_identificacion_del_obligado
    foreign key (tenant_id, atendido_con_identificacion_id)
    references identificaciones_bc (tenant_id, id),
  constraint descripcion_de_evento_no_vacia check (length(btrim(descripcion)) > 0),
  constraint limite_despues_del_evento check (fecha_limite >= fecha_evento),
  constraint atencion_completa check (
    (atendido_con_identificacion_id is null) = (atendido_en is null))
);

create index on eventos_estructurales (tenant_id, cliente_id)
  where atendido_con_identificacion_id is null;

comment on table eventos_estructurales is
  'Cambios en la estructura societaria del cliente que vuelven vieja la '
  'identificación del Beneficiario Controlador. Pendiente = sin identificación '
  'que lo atienda; el plazo nace congelado del parámetro operativo.';

-- Lo único que cambia de un evento es que se atiende, una vez.
create or replace function app.evento_solo_se_atiende() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'restrict_violation',
      message = 'Un evento estructural no se borra',
      detail  = 'Es la evidencia de que la obligación de actualizar arrancó, y de cuándo.';
  end if;
  if old.atendido_con_identificacion_id is not null then
    raise exception 'Este evento ya fue atendido; la atención no se edita ni se repite';
  end if;
  if (new.tenant_id, new.cliente_id, new.tipo, new.descripcion, new.fecha_evento,
      new.fecha_limite, new.documento_id, new.registrado_por)
     is distinct from
     (old.tenant_id, old.cliente_id, old.tipo, old.descripcion, old.fecha_evento,
      old.fecha_limite, old.documento_id, old.registrado_por) then
    raise exception 'De un evento solo cambia su atención: el hecho es el hecho';
  end if;
  if new.atendido_con_identificacion_id is null then
    raise exception 'Atender un evento es nombrar la identificación que lo atendió';
  end if;
  return new;
end $$;

create trigger evento_solo_se_atiende
  before update or delete on eventos_estructurales
  for each row execute function app.evento_solo_se_atiende();

-- ---------------------------------------------------------------------------
-- La alerta nombra su evento — el patrón del ADR-33
-- ---------------------------------------------------------------------------
alter table alertas add column evento_estructural_id uuid;

alter table alertas
  add constraint alertas_evento_estructural_fk
    foreign key (tenant_id, evento_estructural_id)
    references eventos_estructurales (tenant_id, id),
  add constraint cambio_estructural_nombra_su_evento check (
    tipo <> 'cambio_estructural' or evento_estructural_id is not null);

comment on column alertas.evento_estructural_id is
  'El evento estructural que justifica la alerta de cambio_estructural. '
  'Obligatorio en ese tipo: una alerta que no señala su hecho no se defiende.';

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table eventos_estructurales enable row level security;

create policy "ver eventos" on eventos_estructurales for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "registrar eventos" on eventos_estructurales for insert
  to authenticated with check (tenant_id = app.tenant_id());
create policy "atender eventos" on eventos_estructurales for update
  to authenticated using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

grant select, insert, update on eventos_estructurales to authenticated;
revoke truncate, trigger, references, maintain on eventos_estructurales from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('eventos_estructurales','authenticated','INSERT',null,
   'Registrar el cambio estructural que vuelve vieja la identificación del Beneficiario Controlador'),
  ('eventos_estructurales','authenticated','UPDATE',null,
   'Atenderlo con la identificación nueva; el trigger acota a eso, una vez')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_evento uuid; v_ident uuid;
  v_rechazo boolean;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('EVE270301AB1', 'Aserción eventos', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-eve@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción EVE', 'asercion-eve@ejemplo.mx');
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente que cambió', 'CQC270301XY9', false, v_dom)
  returning id into v_cliente;

  -- ── 1. El evento entra, con su plazo congelado ────────────────────────
  insert into eventos_estructurales
    (tenant_id, cliente_id, tipo, descripcion, fecha_evento, fecha_limite, registrado_por)
  values (v_tenant, v_cliente, 'cambio_accionario', 'Entró un fondo con el 35%',
          '2027-04-01', '2027-05-01', v_user)
  returning id into v_evento;

  -- ── 2. La alerta de cambio estructural EXIGE nombrar su evento ────────
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, titulo)
    values (v_tenant, 'cambio_estructural', 'Sin decir qué evento');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: una alerta de cambio estructural no nombró su evento';

  insert into alertas (tenant_id, tipo, evento_estructural_id, titulo)
  values (v_tenant, 'cambio_estructural', v_evento, 'La estructura del cliente cambió');

  -- ── 3. El hecho no se edita ni se borra ───────────────────────────────
  v_rechazo := false;
  begin
    update eventos_estructurales set descripcion = 'otra cosa' where id = v_evento;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: se reescribió un evento estructural';

  v_rechazo := false;
  begin
    delete from eventos_estructurales where id = v_evento;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se borró un evento estructural';

  -- ── 5. Atenderlo exige nombrar la identificación, y pasa una sola vez ─
  insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                   umbral_pct, umbral_inclusivo, determinada_por)
  values (v_tenant, v_cliente, 'declaracion_persona_fisica', '2027-04-10', 25, true, v_user)
  returning id into v_ident;

  v_rechazo := false;
  begin
    update eventos_estructurales set atendido_en = now() where id = v_evento;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: un evento se marcó atendido sin decir con qué identificación';

  update eventos_estructurales
     set atendido_con_identificacion_id = v_ident, atendido_en = now()
   where id = v_evento;

  v_rechazo := false;
  begin
    update eventos_estructurales set atendido_con_identificacion_id = null, atendido_en = null
     where id = v_evento;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: la atención de un evento se revirtió';

  -- ── 7. El plazo operativo está en el catálogo, declarado como tal ─────
  assert (select count(*) from parametros_motor
           where clave = 'evento_plazo_actualizacion_dias' and fuente like '%OPERATIVO%') = 1,
    'ASERCIÓN 7: el plazo del evento no está declarado como parámetro operativo';

  raise notice 'Eventos estructurales (Fase 3): 7 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
