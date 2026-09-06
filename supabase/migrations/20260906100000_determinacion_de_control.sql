-- ---------------------------------------------------------------------------
-- Fase 2 · La determinación humana de control efectivo, con bloqueo
-- ---------------------------------------------------------------------------
-- Punto 4 del plano de arquitectura (ADR-40). El «cuello de botella» que el
-- diagrama ORVEX·Vizo pinta en naranja: decidir si un convenio parasocial o
-- un voto de calidad constituyen control efectivo NO es automatizable, y el
-- motor jamás debe resolverlo solo.
--
-- Hasta hoy, la captura y la determinación eran UN acto: quien tecleaba
-- «controla por veto estatutario» ya había determinado, sin fundamento
-- registrado y sin que nadie más lo mirara. Desde hoy son dos:
--
--   PROPUESTA ──confirmada──▶ entra a la fracción II del Art. 23 Quinquies
--        │
--        └────rechazada────▶ queda como evidencia de la diligencia
--
-- y mientras haya una propuesta sin resolver, EL EXPEDIENTE NO SE APRUEBA.
-- Es el caso 3 del plano: «marca el caso para determinación humana y bloquea
-- el cierre del expediente hasta que alguien resuelva».
--
-- QUIÉN CONFIRMA queda abierto a propósito: hoy es el admin del obligado; en
-- el modelo del plano es el despacho. El rol es la decisión de producto
-- pendiente — la máquina de estados es la misma con cualquiera de los dos.

create type estado_determinacion as enum ('propuesta', 'confirmada', 'rechazada');
create type conclusion_de_criterio as enum ('constituye_control', 'no_constituye_control');
create type area_de_control as enum ('estrategia', 'toma_de_decisiones', 'politicas_principales');

-- ---------------------------------------------------------------------------
-- El criterio como regla reutilizable (punto 5 del plano — solo el esqueleto)
-- ---------------------------------------------------------------------------
-- «Cuando alguien resuelve un caso de nivel 2 […] esa decisión no puede
-- quedarse en un campo de texto.» Se guarda como patrón + conclusión +
-- fundamento; los casos donde se aplicó son las determinaciones que la citan.
-- El motor que SUGIERE reglas es explícitamente «después»: primero
-- acumularlas a mano.
create table reglas_de_criterio (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  /** El patrón estructural, en palabras: «cláusula de voto de calidad en el consejo». */
  patron     text not null,
  conclusion conclusion_de_criterio not null,
  fundamento text not null,

  -- Versionada como todo lo demás: corregir es una regla nueva que sustituye.
  sustituye_a uuid,

  creada_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint reglas_tenant_uk unique (tenant_id, id),
  constraint regla_sustituye_del_mismo_obligado
    foreign key (tenant_id, sustituye_a) references reglas_de_criterio (tenant_id, id),
  constraint patron_no_vacio check (length(btrim(patron)) > 0),
  constraint fundamento_de_regla_no_vacio check (length(btrim(fundamento)) > 0),
  constraint regla_no_se_sustituye_sola check (sustituye_a is null or sustituye_a <> id)
);

create or replace function app.regla_de_criterio_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception using
    errcode = 'restrict_violation',
    message = 'Una regla de criterio no se edita ni se borra: se sustituye con una nueva',
    detail  = 'Las determinaciones que la citaron se fundaron en lo que decía entonces.';
end $$;

create trigger reglas_de_criterio_inmutables
  before update or delete on reglas_de_criterio
  for each row execute function app.regla_de_criterio_inmutable();

-- ---------------------------------------------------------------------------
-- La determinación
-- ---------------------------------------------------------------------------
create table determinaciones_control (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  -- SIEMPRE una parte física de la estructura. La identidad vive en el nodo:
  -- una determinación sobre «alguien» tecleado aparte volvería a partir la
  -- verdad en dos. Sin estructura capturada, no hay a quién señalar — y ese
  -- es el orden correcto de las cosas.
  parte_id uuid not null,

  /** El medio: «voto de calidad estatutario», «convenio parasocial del 12-may». */
  medio text not null,
  areas area_de_control[] not null,

  estado estado_determinacion not null default 'propuesta',

  propuesta_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  -- La resolución. El fundamento es OBLIGATORIO en ambos sentidos: por qué sí
  -- constituye control, o por qué no — el rechazo también es evidencia de la
  -- diligencia, y un «no» sin razones no defiende nada.
  resuelta_por uuid,
  resuelta_en  timestamptz,
  fundamento   text,
  documento_soporte_id uuid,
  regla_id     uuid,

  constraint determinaciones_tenant_uk unique (tenant_id, id),
  constraint determinacion_del_mismo_cliente
    foreign key (tenant_id, cliente_id) references clientes_finales (tenant_id, id),
  constraint determinacion_sobre_parte_de_su_estructura
    foreign key (tenant_id, cliente_id, parte_id)
    references partes_societarias (tenant_id, cliente_id, id),
  constraint documento_del_mismo_obligado
    foreign key (tenant_id, documento_soporte_id) references documentos (tenant_id, id),
  constraint regla_del_mismo_obligado
    foreign key (tenant_id, regla_id) references reglas_de_criterio (tenant_id, id),
  constraint resuelta_por_del_mismo_obligado
    foreign key (tenant_id, resuelta_por) references usuarios (tenant_id, id),
  constraint medio_no_vacio check (length(btrim(medio)) > 0),
  constraint algun_area check (cardinality(areas) > 0),
  -- Resuelta ⇔ con quién, cuándo y por qué. Las tres o ninguna.
  constraint resolucion_completa check (
    (estado = 'propuesta' and resuelta_por is null and resuelta_en is null and fundamento is null)
    or (estado <> 'propuesta' and resuelta_por is not null and resuelta_en is not null
        and fundamento is not null and length(btrim(fundamento)) > 0))
);

-- Una sola propuesta ABIERTA por persona: dos propuestas sobre la misma parte
-- serían dos preguntas iguales esperando respuestas que pueden diferir.
create unique index una_propuesta_abierta_por_parte
  on determinaciones_control (tenant_id, cliente_id, parte_id)
  where estado = 'propuesta';

create index on determinaciones_control (tenant_id, cliente_id, estado);

comment on table determinaciones_control is
  'La determinación humana de control efectivo (fr. II del Art. 23 '
  'Quinquies). El motor nunca la resuelve: propone quien captura, resuelve '
  'un humano con fundamento, y la fracción II solo come confirmadas.';

-- La parte señalada tiene que ser física: el control efectivo del Art. 23
-- Quinquies identifica personas físicas.
create or replace function app.determinacion_sobre_fisica() returns trigger
language plpgsql as $$
declare v_tipo tipo_parte_societaria;
begin
  select tipo into v_tipo from partes_societarias where id = new.parte_id;
  if v_tipo is distinct from 'fisica' then
    raise exception using
      errcode = 'check_violation',
      message = 'La determinación de control señala a una persona física',
      detail  = 'La fracción II del Art. 23 Quinquies identifica personas físicas; una moral con control se modela como participación en la estructura.';
  end if;
  return new;
end $$;

create trigger determinacion_sobre_fisica
  before insert on determinaciones_control
  for each row execute function app.determinacion_sobre_fisica();

-- La única transición es propuesta → confirmada/rechazada, una vez.
create or replace function app.determinacion_solo_se_resuelve() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'restrict_violation',
      message = 'Una determinación no se borra',
      detail  = 'La propuesta rechazada también es evidencia de la diligencia.';
  end if;
  if old.estado <> 'propuesta' then
    raise exception 'Esta determinación ya se resolvió; una resolución no se edita ni se revierte';
  end if;
  if new.estado = 'propuesta' then
    raise exception 'Una propuesta no se edita: se resuelve, o se propone otra';
  end if;
  if (new.tenant_id, new.cliente_id, new.parte_id, new.medio, new.areas, new.propuesta_por)
     is distinct from
     (old.tenant_id, old.cliente_id, old.parte_id, old.medio, old.areas, old.propuesta_por) then
    raise exception 'Al resolver no se reescribe lo propuesto: el fundamento responde a lo que se preguntó';
  end if;
  return new;
end $$;

create trigger determinacion_solo_se_resuelve
  before update or delete on determinaciones_control
  for each row execute function app.determinacion_solo_se_resuelve();

-- ---------------------------------------------------------------------------
-- EL BLOQUEO: un expediente con control sin resolver no se aprueba
-- ---------------------------------------------------------------------------
-- Trigger sobre `expedientes` y no dentro de `app.expediente_aprobar`, a
-- propósito: detiene a CUALQUIER camino que apruebe —la función, psql, un
-- backoffice futuro— y no depende de que alguien recuerde llamar la guarda.
create or replace function app.aprobar_exige_control_resuelto() returns trigger
language plpgsql as $$
declare v_pendientes int;
begin
  if new.estatus <> 'aprobado' or old.estatus = 'aprobado' then return new; end if;

  -- `public.` calificado A FUERZA: este trigger también corre dentro de
  -- app.expediente_aprobar, que es SECURITY DEFINER con search_path
  -- restringido — sin el esquema, la tabla «no existe» justo en el camino
  -- que más importa. Es la lección del search_path de la semana 5, otra vez.
  select count(*) into v_pendientes
    from public.determinaciones_control
   where tenant_id = new.tenant_id and cliente_id = new.cliente_id
     and estado = 'propuesta';

  if v_pendientes > 0 then
    raise exception using
      errcode = 'check_violation',
      message = format('Este cliente tiene %s determinación(es) de control efectivo sin resolver', v_pendientes),
      detail  = 'Aprobar el expediente afirma que el Beneficiario Controlador es quien dice ser, y hay una pregunta de control abierta que puede cambiarlo.',
      hint    = 'Confírmalas o recházalas —con fundamento— y vuelve a aprobar.';
  end if;
  return new;
end $$;

create trigger aprobar_exige_control_resuelto
  before update on expedientes
  for each row execute function app.aprobar_exige_control_resuelto();

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table reglas_de_criterio enable row level security;
alter table determinaciones_control enable row level security;

create policy "ver reglas" on reglas_de_criterio for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "crear reglas" on reglas_de_criterio for insert
  to authenticated with check (tenant_id = app.tenant_id());

create policy "ver determinaciones" on determinaciones_control for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "proponer determinaciones" on determinaciones_control for insert
  to authenticated with check (tenant_id = app.tenant_id());
create policy "resolver determinaciones" on determinaciones_control for update
  to authenticated using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

grant select, insert on reglas_de_criterio to authenticated;
grant select, insert, update on determinaciones_control to authenticated;
revoke truncate, trigger, references, maintain on reglas_de_criterio from authenticated, anon;
revoke truncate, trigger, references, maintain on determinaciones_control from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('reglas_de_criterio','authenticated','INSERT',null,
   'El criterio de una resolución de control, guardado como regla reutilizable (punto 5 del plano)'),
  ('determinaciones_control','authenticated','INSERT',null,
   'Proponer que alguien ejerce control efectivo (fr. II del Art. 23 Quinquies)'),
  ('determinaciones_control','authenticated','UPDATE',null,
   'Resolver la propuesta; el trigger acota a propuesta→confirmada/rechazada con fundamento')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_raiz uuid; v_pf uuid; v_pm uuid;
  v_det uuid; v_regla uuid; v_exp uuid; v_act uuid; v_rechazo boolean;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('DET270301AB1', 'Aserción determinación', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-det@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción DET', 'asercion-det@ejemplo.mx');
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente con control', 'CCC270301XY9', false, v_dom)
  returning id into v_cliente;
  select id into v_act from actividades_vulnerables where fraccion = 'V_BIS';

  insert into partes_societarias (tenant_id, cliente_id, tipo, nombre, es_la_raiz)
  values (v_tenant, v_cliente, 'moral', 'Cliente con control', true) returning id into v_raiz;
  insert into partes_societarias (tenant_id, cliente_id, tipo, nombre)
  values (v_tenant, v_cliente, 'fisica', 'Socio al 5 con veto') returning id into v_pf;
  insert into partes_societarias (tenant_id, cliente_id, tipo, nombre)
  values (v_tenant, v_cliente, 'moral', 'PM cualquiera') returning id into v_pm;

  -- ── 1. La propuesta entra, sin fundamento todavía ─────────────────────
  insert into determinaciones_control (tenant_id, cliente_id, parte_id, medio, areas, propuesta_por)
  values (v_tenant, v_cliente, v_pf, 'Voto de calidad estatutario',
          array['toma_de_decisiones']::area_de_control[], v_user)
  returning id into v_det;

  -- ── 2. Y una SEGUNDA propuesta abierta sobre la misma parte, no ───────
  v_rechazo := false;
  begin
    insert into determinaciones_control (tenant_id, cliente_id, parte_id, medio, areas, propuesta_por)
    values (v_tenant, v_cliente, v_pf, 'Otra pregunta igual',
            array['estrategia']::area_de_control[], v_user);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: dos propuestas abiertas sobre la misma persona';

  -- ── 3. Sobre una parte MORAL, no: la fr. II identifica físicas ────────
  v_rechazo := false;
  begin
    insert into determinaciones_control (tenant_id, cliente_id, parte_id, medio, areas, propuesta_por)
    values (v_tenant, v_cliente, v_pm, 'Control de moral',
            array['estrategia']::area_de_control[], v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: una determinación señaló a una persona moral';

  -- ── 4. EL BLOQUEO: el expediente no se aprueba con la propuesta abierta ─
  insert into expedientes (tenant_id, cliente_id, actividad_id, version, estatus)
  values (v_tenant, v_cliente, v_act, 1, 'completo') returning id into v_exp;
  v_rechazo := false;
  begin
    update expedientes set estatus = 'aprobado', aprobado_por = v_user, aprobado_en = now()
     where id = v_exp;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se aprobó un expediente con control efectivo sin resolver';

  -- ── 5. Resolver SIN fundamento no existe ──────────────────────────────
  v_rechazo := false;
  begin
    update determinaciones_control
       set estado = 'confirmada', resuelta_por = v_user, resuelta_en = now()
     where id = v_det;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se resolvió una determinación sin decir por qué';

  -- ── 6. Con fundamento y regla citada, sí — y el bloqueo se levanta ────
  insert into reglas_de_criterio (tenant_id, patron, conclusion, fundamento, creada_por)
  values (v_tenant, 'Cláusula de voto de calidad en el consejo', 'constituye_control',
          'El voto de calidad decide en empate: es dirección efectiva de las políticas', v_user)
  returning id into v_regla;

  update determinaciones_control
     set estado = 'confirmada', resuelta_por = v_user, resuelta_en = now(),
         fundamento = 'Los estatutos le dan voto de calidad; aplica la regla del patrón',
         regla_id = v_regla
   where id = v_det;

  update expedientes set estatus = 'aprobado', aprobado_por = v_user, aprobado_en = now()
   where id = v_exp;

  -- ── 7. Una resolución no se edita ni se revierte ──────────────────────
  v_rechazo := false;
  begin
    update determinaciones_control set fundamento = 'otro' where id = v_det;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se reescribió una resolución';

  v_rechazo := false;
  begin
    delete from determinaciones_control where id = v_det;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se borró la evidencia de la diligencia';

  -- ── 9. La regla es inmutable: se sustituye, no se edita ───────────────
  v_rechazo := false;
  begin
    update reglas_de_criterio set conclusion = 'no_constituye_control' where id = v_regla;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 9: se cambió la conclusión de una regla ya citada';

  raise notice 'Determinación de control (Fase 2): 9 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
