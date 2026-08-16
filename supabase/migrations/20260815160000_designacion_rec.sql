-- ---------------------------------------------------------------------------
-- La designación del REC es un acto de dos, y hasta que el segundo responde
-- las obligaciones son de otra persona
-- ---------------------------------------------------------------------------
-- Issue #12. Exigible el 30 de noviembre de 2026.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE EL TEXTO (✅ contrastado contra el DOF y contra la Ley)
-- ────────────────────────────────────────────────────────────────────────────
-- Acuerdo 115/2026, Art. 10 —`regulatorio/dof/acuerdo-115-2026.txt`, línea 93—:
--
--   «A fin de que se COMPLETE la designación de la persona Representante
--    Encargada de Cumplimiento […] la persona designada deberá ingresar al
--    Portal en Internet, utilizando su clave del Registro Federal de
--    Contribuyentes y su certificado vigente de la Firma Electrónica Avanzada,
--    a fin de ACEPTAR O RECHAZAR la designación de que se trate.»
--
--   «El RECHAZO de la referida designación NO LIBERA a quien la realizó del
--    cumplimiento de las obligaciones…»                            (párrafo 4)
--
--   «Las personas morales y quienes actúen a través de fideicomisos […]
--    únicamente deberán designar como Representante Encargada de Cumplimiento
--    a una PERSONA FÍSICA.»                                        (párrafo 5)
--
-- LFPIORPI Art. 20 —`regulatorio/leyes/LFPIORPI.pdf`, línea 1118 del texto
-- extraído, SHA-256 2e35228b…—, que es lo que convierte esto en producto:
--
--   «Las PERSONAS MORALES y quienes actúen a través de fideicomisos o cualquier
--    otra figura jurídica […] deberán designar…»                   (párrafo 1)
--
--   «EN TANTO NO HAYA una persona Representante Encargada del Cumplimiento O LA
--    DESIGNACIÓN NO SEA ACEPTADA, el cumplimiento de las obligaciones que esta
--    Ley señala CORRESPONDERÁ A LOS INTEGRANTES DEL ÓRGANO DE ADMINISTRACIÓN o a
--    quien funja como administrador único…»                        (párrafo 2)
--
-- ────────────────────────────────────────────────────────────────────────────
-- LAS DOS CONSECUENCIAS QUE DECIDEN EL MODELO
-- ────────────────────────────────────────────────────────────────────────────
-- 1. **Designar no es haber designado.** El párrafo 2 del Art. 20 hace que una
--    designación pendiente sea, para efectos de responsabilidad, IDÉNTICA a no
--    tener REC: en los dos casos la obligación recae personalmente sobre el
--    órgano de administración. Por eso `designado` no es «en progreso»: es un
--    paso NO cumplido, y el portal tiene que decirlo con esas palabras.
--
-- 2. **Solo las personas morales y las figuras jurídicas designan.** Una persona
--    física obligada no tiene a quién designar. Pedirle el paso sería dejarla
--    mirando una casilla imposible para siempre — el defecto que `arranque.ts`
--    documenta y evita. Por eso entra `tenants.tipo_persona`.
--
-- Lo que VIZO NO hace, y es frontera: el acto ocurre en el Portal del SAT con la
-- e.firma de la persona designada. VIZO registra el ESTADO y su fecha; jamás
-- custodia la e.firma ni acepta en nombre de nadie.

-- ---------------------------------------------------------------------------
-- 1. Qué clase de persona es el obligado
-- ---------------------------------------------------------------------------
-- Nullable a propósito, con el mismo criterio de `fecha_alta_autoridad`: NULL
-- es «no lo sabemos», nunca «no aplica». De este dato depende si el sistema le
-- reclama un REC, así que suponerlo sería decidir por el obligado si tiene o no
-- una obligación — exactamente la regla dura 6.
alter table tenants
  add column tipo_persona tipo_persona;

comment on column tenants.tipo_persona is
  'Persona física, moral o fideicomiso. Decide si aplica la designación de REC (Art. 20 LFPIORPI: solo morales y figuras jurídicas designan). NULL = no lo sabemos: mientras lo sea, el arranque pide el dato en vez de suponer una respuesta.';

-- ---------------------------------------------------------------------------
-- 2. La designación
-- ---------------------------------------------------------------------------
-- Los tres primeros estados salen del Art. 10. `sustituida` NO sale de ahí y se
-- dice explícitamente: es un estado del REGISTRO de VIZO, necesario porque el
-- Art. 20 obliga a «mantener vigente dicha designación» y un REC puede dejar el
-- cargo. Marcarlo como estado propio evita la alternativa mala, que sería
-- borrar la fila y perder el historial de quién respondía y cuándo.
create type estado_designacion_rec as enum (
  'designado',   -- enviada, sin respuesta. Art. 20 ¶2: responde el órgano de administración
  'aceptada',    -- completa. Art. 10 ¶1
  'rechazada',   -- terminal. Art. 10 ¶4: NO libera de las obligaciones
  'sustituida'   -- terminal. Del registro, no del Acuerdo
);

create table designaciones_rec (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  -- Datos personales de una persona física identificada: viven aquí, bajo RLS,
  -- y nunca en la bitácora (regla dura 3).
  rfc          text not null,
  nombre       text not null,
  estado       estado_designacion_rec not null default 'designado',
  fecha_designacion      date not null,
  fecha_respuesta        date,
  -- Art. 10 ¶3: el SAT notifica al designante dentro de los diez días hábiles
  -- siguientes a recibir la respuesta. Es la evidencia de que esto pasó.
  fecha_notificacion_sat date,
  created_at   timestamptz not null default now(),

  -- Art. 10 ¶5: el REC es siempre una persona física, y en México eso se ve en
  -- el RFC: 13 caracteres (4 letras + 6 dígitos + 3 de homoclave) contra los 12
  -- de una moral. La regla del texto queda expresada en la base, no en un `if`.
  constraint rec_es_persona_fisica
    check (rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$'),

  -- Un estado con respuesta exige la fecha, y uno sin respuesta la prohíbe. Una
  -- designación «aceptada» sin fecha no se puede defender ante nadie.
  constraint respuesta_coherente check (
    (estado = 'designado' and fecha_respuesta is null)
    or (estado in ('aceptada', 'rechazada') and fecha_respuesta is not null)
    or estado = 'sustituida'
  ),
  constraint respuesta_no_precede_designacion
    check (fecha_respuesta is null or fecha_respuesta >= fecha_designacion),
  -- La autoridad no puede notificar una respuesta que no ocurrió.
  constraint notificacion_exige_respuesta
    check (fecha_notificacion_sat is null or fecha_respuesta is not null),
  constraint notificacion_no_precede_respuesta
    check (fecha_notificacion_sat is null or fecha_notificacion_sat >= fecha_respuesta)
);

comment on table designaciones_rec is
  'Designaciones de Representante Encargado de Cumplimiento y su respuesta. El acto de aceptar o rechazar ocurre en el Portal del SAT con la e.firma de la persona designada (Art. 10 del Acuerdo 115/2026): aquí solo se registra qué pasó y cuándo.';

-- A lo mucho una designación esperando respuesta, y a lo mucho una vigente. Que
-- convivan es lo normal: se designa al relevo antes de que el actual se vaya.
-- Que haya dos pendientes, o dos vigentes, no es un caso de negocio: es un dato
-- corrupto que haría que «¿quién es mi REC?» tuviera dos respuestas.
create unique index designacion_rec_una_pendiente
  on designaciones_rec (tenant_id) where estado = 'designado';
create unique index designacion_rec_una_vigente
  on designaciones_rec (tenant_id) where estado = 'aceptada';

create index on designaciones_rec (tenant_id, estado);

-- ---------------------------------------------------------------------------
-- 3. Los estados avanzan; no retroceden
-- ---------------------------------------------------------------------------
-- Un CHECK no puede ver la fila anterior, así que la tabla de transiciones va
-- en un trigger. Sin esto, un UPDATE podría devolver una designación aceptada a
-- «designado» y con ella desaparecer la fecha de aceptación — el dato que
-- prueba que la obligación dejó de recaer en el órgano de administración.
create or replace function app.designacion_rec_transicion_valida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
       (old.estado = 'designado' and new.estado in ('aceptada', 'rechazada', 'sustituida'))
    or (old.estado = 'aceptada'  and new.estado = 'sustituida')
  ) then
    raise exception
      'Una designación no puede pasar de % a %. Aceptada y rechazada son respuestas de la persona designada ante el SAT, no estados que se corrijan aquí; para nombrar a alguien más se registra una designación nueva.',
      old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger designacion_rec_transicion
  before update on designaciones_rec
  for each row execute function app.designacion_rec_transicion_valida();

create trigger designaciones_rec_sin_truncate
  before truncate on designaciones_rec
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 4. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table designaciones_rec enable row level security;

create policy "ver la designación de mi obligado" on designaciones_rec
  for select to authenticated using (tenant_id = app.tenant_id());

create policy "admin designa" on designaciones_rec
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "admin registra la respuesta" on designaciones_rec
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on designaciones_rec to authenticated;

-- UPDATE POR COLUMNA, con el mismo criterio que `tenants.fecha_alta_autoridad`:
-- lo que se registra después es la RESPUESTA. Quién fue designado y cuándo son
-- el hecho, y reescribir el hecho no es corregir: es cambiar la historia.
grant update (estado, fecha_respuesta, fecha_notificacion_sat)
  on designaciones_rec to authenticated;

-- Y el tipo de persona del obligado, que el admin captura en Configuración
-- junto a la fecha de alta.
grant update (tipo_persona) on tenants to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('designaciones_rec','authenticated','INSERT',null,
   'el admin registra a quién designó como REC'),
  ('designaciones_rec','authenticated','UPDATE','estado',
   'POR COLUMNA: la respuesta de la persona designada ante el SAT'),
  ('designaciones_rec','authenticated','UPDATE','fecha_respuesta',
   'POR COLUMNA: cuándo respondió'),
  ('designaciones_rec','authenticated','UPDATE','fecha_notificacion_sat',
   'POR COLUMNA: cuándo notificó el SAT (Art. 10 ¶3)'),
  ('tenants','authenticated','UPDATE','tipo_persona',
   'POR COLUMNA: de esto depende si aplica la designación de REC. El RFC y la razón social siguen fuera');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
-- Cada una comprueba que la base MUERDE, no que la restricción esté escrita.
do $$
declare
  v_tenant uuid;
  v_uno    uuid;
  v_rechazo boolean;
  v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('REC010101AAA', 'Aserción designación REC', 'moral')
  returning id into v_tenant;

  -- 1. Un REC que no es persona física (RFC de 12) no se puede escribir.
  v_rechazo := false;
  begin
    insert into designaciones_rec (tenant_id, rfc, nombre, fecha_designacion)
    values (v_tenant, 'MOR010101AAA', 'Moral SA', current_date);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se aceptó como REC un RFC de persona moral, y el Art. 10 ¶5 exige persona física.';
  end if;

  insert into designaciones_rec (tenant_id, rfc, nombre, fecha_designacion)
  values (v_tenant, 'PEGJ800101AB1', 'Persona Designada', current_date - 5)
  returning id into v_uno;

  -- 2. Dos designaciones pendientes a la vez.
  v_rechazo := false;
  begin
    insert into designaciones_rec (tenant_id, rfc, nombre, fecha_designacion)
    values (v_tenant, 'LOMA900202CD2', 'Otra Persona', current_date);
  exception when unique_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'El obligado quedó con dos designaciones pendientes y «¿quién es mi REC?» dejó de tener una sola respuesta.';
  end if;

  -- 3. Aceptar sin fecha de respuesta.
  v_rechazo := false;
  begin
    update designaciones_rec set estado = 'aceptada' where id = v_uno;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se aceptó una designación sin fecha de respuesta: no hay cómo probar desde cuándo el órgano de administración dejó de responder.';
  end if;

  -- 4. Responder antes de ser designado.
  v_rechazo := false;
  begin
    update designaciones_rec
       set estado = 'aceptada', fecha_respuesta = current_date - 10 where id = v_uno;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se aceptó una designación antes de la fecha en que fue hecha.';
  end if;

  -- El camino bueno sí pasa: una restricción que rechaza todo no protege nada.
  update designaciones_rec
     set estado = 'aceptada', fecha_respuesta = current_date - 3 where id = v_uno;

  -- 5. Y una vez aceptada, no vuelve atrás.
  v_rechazo := false;
  begin
    update designaciones_rec
       set estado = 'designado', fecha_respuesta = null where id = v_uno;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una designación aceptada volvió a «designado» y se llevó consigo la fecha de aceptación.';
  end if;

  -- Limpieza. La aserción no deja rastro.
  delete from designaciones_rec where tenant_id = v_tenant;
  delete from tenants where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado tras crear designaciones_rec:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_por_omision();
  if v_problemas is not null then
    raise exception 'Privilegios por omisión sobre la tabla nueva:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ designaciones_rec: solo persona física, una pendiente y una vigente, y los estados no retroceden';
end $$;
