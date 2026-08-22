-- ---------------------------------------------------------------------------
-- La aprobación de directivo del Art. 23 Ter 5
-- ---------------------------------------------------------------------------
-- Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797),
-- exigible a partir de los actos u operaciones realizados el 1 de marzo de
-- 2027 (Transitorio Cuarto). Texto completo del artículo, dos párrafos:
--
--   «Para los casos en que, PREVIAMENTE O CON POSTERIORIDAD al acto u
--    operación, quienes realizan Actividades Vulnerables detecten que la
--    persona que pretenda ser Cliente o Usuaria o que ya lo sea […] reúne los
--    requisitos para ser considerada Persona Políticamente Expuesta Y, ADEMÁS,
--    con Grado de Riesgo alto deberá, de acuerdo con lo que al efecto se
--    establezca en su Manual de Políticas Internas, obtener la aprobación de un
--    directivo o su equivalente que consienta LOS ACTOS U OPERACIONES
--    RESPECTIVOS.»
--
--   «Cuando quien realice la Actividad Vulnerable sea una PERSONA FÍSICA, la
--    aprobación referida en el párrafo anterior SE SUBSANARÁ CON UNA CONSTANCIA
--    en la que señale los motivos que consideró para realizar el acto u
--    operación y documentarlo, si fuera el caso, en términos de lo que
--    establezca en su Manual de Políticas Internas.»
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE EL ARTÍCULO DECIDE, Y QUE ESTE ESQUEMA SOLO OBEDECE
-- ────────────────────────────────────────────────────────────────────────────
-- 1. **El disparador es conjuntivo.** «Persona Políticamente Expuesta y,
--    además, con Grado de Riesgo alto». No es cualquiera de las dos: son las
--    dos. Y las dos ya existen en el sistema como hechos con historia —
--    `declaraciones_pep` (Cap. III Quáter) y `evaluaciones_riesgo` (Cap. III
--    Bis)—, así que la aprobación puede CITARLAS en vez de repetir su
--    contenido. Es lo que hace reconstruible, dos años después, por qué esta
--    firma era exigible.
--
-- 2. **La detección puede ser posterior al acto.** «previamente o con
--    posterioridad». Por eso esto NO puede ser una compuerta que impida
--    registrar la operación: si lo fuera, el caso que el propio artículo
--    contempla —enterarse después— sería inexpresable, y la operación, que ya
--    ocurrió en el mundo, se quedaría fuera del sistema. VIZO registra la
--    realidad y señala el faltante; no la esconde.
--
-- 3. **El consentimiento es de actos concretos.** «los actos u operaciones
--    RESPECTIVOS», en plural y con determinante. Una aprobación en abstracto
--    del cliente no es lo que pide el texto, así que la posterior nombra las
--    operaciones que consiente y la previa lleva el alcance y el plazo que el
--    propio directivo fijó.
--
-- 4. **Las dos ramas son excluyentes, y las separa qué es el obligado.** Un
--    obligado persona física no tiene directivos; el ¶2 no le ofrece una
--    alternativa cómoda, le dice que la constancia SUBSANA la aprobación. Y a
--    la inversa: una persona moral que emitiera «constancia de motivos» estaría
--    saltándose la firma que el ¶1 le exige. Eso queda como trigger.
--
-- Lo que NO decide el esquema, porque es del Manual (Art. 23 Ter 5: «de acuerdo
-- con lo que al efecto se establezca en su Manual de Políticas Internas»):
-- **quién es «un directivo o su equivalente»**. VIZO asienta quién aprobó, con
-- qué cargo, cuándo y quién lo registró. No valida la facultad, porque la
-- facultad la define un documento que VIZO no redacta (ADR-20). El apartado IV
-- del Art. 37 Bis pregunta literalmente «¿quién autoriza operar con una PEP, y
-- dónde queda esa autorización?»: VIZO responde la segunda mitad.

-- ---------------------------------------------------------------------------
-- 1. Las claves que hacen imposible citar la evidencia de otro cliente
-- ---------------------------------------------------------------------------
-- Sin esto, la aprobación podría apuntar a la declaración PEP de una persona y
-- a la evaluación de riesgo de otra, y la fila se vería impecable. Es el modo
-- de falla de la regla dura 6 en su forma más cara: registro coherente por
-- fuera, indefendible por dentro. Con la clave compuesta no es una validación
-- que alguien pueda olvidar llamar — es una fila que no entra.
alter table operaciones
  add constraint operaciones_cliente_uk unique (tenant_id, cliente_id, id);
alter table evaluaciones_riesgo
  add constraint evaluaciones_riesgo_cliente_uk unique (tenant_id, cliente_id, id);
alter table declaraciones_pep
  add constraint declaraciones_pep_cliente_uk unique (tenant_id, cliente_id, id);

-- ---------------------------------------------------------------------------
-- 2. Los tipos
-- ---------------------------------------------------------------------------
create type via_aprobacion as enum (
  'directivo',                 -- ¶1: la firma de un directivo o su equivalente
  'constancia_persona_fisica'  -- ¶2: la constancia que la subsana
);

create type momento_aprobacion as enum (
  'previa',     -- ¶1: «previamente […] al acto u operación»
  'posterior'   -- ¶1: «o con posterioridad»
);

-- ---------------------------------------------------------------------------
-- 3. La aprobación
-- ---------------------------------------------------------------------------
create table aprobaciones_directivo (
  id            uuid primary key default gen_random_uuid(),
  -- La misma lección de `evaluaciones_riesgo` y `perfiles_transaccionales`:
  -- `now()` es de la transacción, no del statement.
  secuencia     bigserial not null,
  tenant_id     uuid not null references tenants(id),
  cliente_id    uuid not null,
  via           via_aprobacion not null,
  momento       momento_aprobacion not null,

  -- ¶1. Quién consintió. VIZO no valida la facultad —eso lo dice el Manual—,
  -- pero sí exige que conste con nombre y cargo: una aprobación anónima no es
  -- evidencia de nada.
  aprobador_nombre text,
  aprobador_cargo  text,

  -- ¶2: «una constancia en la que SEÑALE LOS MOTIVOS que consideró para
  -- realizar el acto u operación». En la rama del directivo el texto no pide
  -- motivos, así que aquí tampoco se exigen: pedir de más también es inventar.
  motivos       text,

  fecha_aprobacion date not null,

  -- Solo para la previa: qué actos consiente y hasta cuándo. Los pone el
  -- directivo, no VIZO — sin un límite que alguien haya decidido, una sola
  -- firma bendeciría todo lo que el cliente haga para siempre, que es
  -- justamente lo que el «respectivos» del ¶1 no admite.
  alcance_previo text,
  vigente_hasta  date,

  -- La evidencia congelada de por qué era exigible. No se copia el contenido:
  -- se apunta a los dos hechos, que son append-only, así que el porqué se puede
  -- reconstruir íntegro dentro de diez años (Art. 41 fr. IV).
  declaracion_pep_id   uuid not null,
  evaluacion_riesgo_id uuid not null,

  registrada_por uuid not null references usuarios(id),
  created_at     timestamptz not null default now(),

  unique (tenant_id, id),
  unique (tenant_id, cliente_id, id),
  foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id),
  constraint aprobacion_cita_declaracion_del_mismo_cliente
    foreign key (tenant_id, cliente_id, declaracion_pep_id)
    references declaraciones_pep(tenant_id, cliente_id, id),
  constraint aprobacion_cita_evaluacion_del_mismo_cliente
    foreign key (tenant_id, cliente_id, evaluacion_riesgo_id)
    references evaluaciones_riesgo(tenant_id, cliente_id, id),

  -- Cada CHECK nombra sus DOS ramas completas: la lección del Art. 21 es que
  -- una expresión que evalúa a NULL pasa sin quejarse.
  constraint directivo_consta_con_nombre_y_cargo check (
    (via = 'directivo'
     and aprobador_nombre is not null and length(btrim(aprobador_nombre)) > 0
     and aprobador_cargo  is not null and length(btrim(aprobador_cargo))  > 0)
    or (via = 'constancia_persona_fisica'
        and aprobador_nombre is null and aprobador_cargo is null)
  ),
  constraint constancia_señala_sus_motivos check (
    via <> 'constancia_persona_fisica'
    or (motivos is not null and length(btrim(motivos)) > 0)
  ),
  constraint previa_fija_alcance_y_plazo check (
    (momento = 'previa'
     and alcance_previo is not null and length(btrim(alcance_previo)) > 0
     and vigente_hasta is not null and vigente_hasta >= fecha_aprobacion)
    or (momento = 'posterior' and alcance_previo is null and vigente_hasta is null)
  )
);

comment on table aprobaciones_directivo is
  'La aprobación del Art. 23 Ter 5 del Acuerdo 115/2026: el consentimiento de un directivo —o la constancia que lo subsana cuando el obligado es persona física— para operar con quien es Persona Políticamente Expuesta Y de Grado de Riesgo alto. Append-only. Cita la declaración PEP y la evaluación de riesgo que la hicieron exigible, por clave compuesta con el cliente: apuntar a la evidencia de otra persona es inexpresable.';

create index on aprobaciones_directivo (tenant_id, cliente_id, secuencia desc);

-- ---------------------------------------------------------------------------
-- 4. Los actos que consiente
-- ---------------------------------------------------------------------------
create table operaciones_consentidas (
  tenant_id     uuid not null references tenants(id),
  cliente_id    uuid not null,
  aprobacion_id uuid not null,
  operacion_id  uuid not null,
  created_at    timestamptz not null default now(),

  primary key (aprobacion_id, operacion_id),
  -- Las tres claves llevan cliente_id: una aprobación no puede consentir la
  -- operación de otra persona, y no porque alguien lo revise.
  constraint acto_consentido_por_aprobacion_del_mismo_cliente
    foreign key (tenant_id, cliente_id, aprobacion_id)
    references aprobaciones_directivo(tenant_id, cliente_id, id),
  constraint acto_consentido_es_del_mismo_cliente
    foreign key (tenant_id, cliente_id, operacion_id)
    references operaciones(tenant_id, cliente_id, id)
);

comment on table operaciones_consentidas is
  'Qué actos concretos consiente cada aprobación. El Art. 23 Ter 5 dice «los actos u operaciones respectivos», en plural y con determinante: una aprobación en abstracto del cliente no es lo que pide el texto.';

create index on operaciones_consentidas (tenant_id, operacion_id);

-- ---------------------------------------------------------------------------
-- 5. Lo que la base no deja escribir
-- ---------------------------------------------------------------------------
create or replace function app.aprobacion_directivo_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_persona text;
  v_resultado    text;
  v_fecha_decl   date;
  v_es_alto      boolean;
  v_fecha_eval   date;
begin
  select tipo_persona::text into v_tipo_persona
    from public.tenants where id = new.tenant_id;

  -- ¶2. Las dos ramas no son un menú: las separa qué es el obligado.
  if v_tipo_persona = 'fisica' and new.via <> 'constancia_persona_fisica' then
    raise exception
      'Este obligado es persona física y no tiene directivos que firmen. El Art. 23 Ter 5 ¶2 dice que en ese caso la aprobación «se subsanará con una constancia en la que señale los motivos».'
      using errcode = 'check_violation';
  end if;
  if v_tipo_persona <> 'fisica' and new.via = 'constancia_persona_fisica' then
    raise exception
      'La constancia de motivos del Art. 23 Ter 5 ¶2 es solo para el obligado persona física, y este es %. Aquí el ¶1 exige la aprobación de un directivo o su equivalente.',
      v_tipo_persona
      using errcode = 'check_violation';
  end if;

  -- El disparador es conjuntivo, y la fila tiene que citar sus dos mitades.
  select resultado::text, fecha_declaracion into v_resultado, v_fecha_decl
    from public.declaraciones_pep where id = new.declaracion_pep_id;

  if v_resultado = 'niega' then
    raise exception
      'La declaración PEP citada dice que el cliente NO lo es. El Art. 23 Ter 5 exige la aprobación cuando la persona reúne los requisitos para ser considerada Persona Políticamente Expuesta; citar una negativa como su fundamento haría el registro indefendible.'
      using errcode = 'check_violation';
  end if;

  select g.es_alto, (e.evaluado_en at time zone 'America/Mexico_City')::date
    into v_es_alto, v_fecha_eval
    from public.evaluaciones_riesgo e
    join public.grados_riesgo g on g.id = e.grado_id
   where e.id = new.evaluacion_riesgo_id;

  if not coalesce(v_es_alto, false) then
    raise exception
      'La evaluación de riesgo citada no clasificó al cliente en un grado alto, y el Art. 23 Ter 5 pide «Persona Políticamente Expuesta y, ADEMÁS, con Grado de Riesgo alto». Con una sola de las dos mitades la aprobación no era exigible, y asentarla diría que sí lo era.'
      using errcode = 'check_violation';
  end if;

  -- No se puede consentir apoyándose en evidencia que todavía no existía.
  if new.fecha_aprobacion < v_fecha_decl or new.fecha_aprobacion < v_fecha_eval then
    raise exception
      'La aprobación es del % y la evidencia que cita es del % (declaración) y del % (evaluación). El ¶1 describe una detección que PRECEDE a la aprobación; firmar antes de saber no es lo que el artículo relata.',
      new.fecha_aprobacion, v_fecha_decl, v_fecha_eval
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger aprobacion_directivo_coherencia
  before insert on aprobaciones_directivo
  for each row execute function app.aprobacion_directivo_coherente();

-- La operación consentida por una aprobación POSTERIOR tiene que haber
-- ocurrido antes de ella: eso es lo que «con posterioridad al acto» significa.
create or replace function app.operacion_consentida_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_momento text;
  v_fecha_ap date;
  v_fecha_op date;
begin
  select momento::text, fecha_aprobacion into v_momento, v_fecha_ap
    from public.aprobaciones_directivo where id = new.aprobacion_id;

  if v_momento = 'previa' then
    raise exception
      'Una aprobación previa no nombra operaciones: consiente actos que todavía no ocurren, y por eso lleva alcance y plazo. Nombrar una operación ya registrada la convierte en posterior.'
      using errcode = 'check_violation';
  end if;

  select fecha_operacion into v_fecha_op
    from public.operaciones where id = new.operacion_id;

  if v_fecha_op > v_fecha_ap then
    raise exception
      'La operación es del % y la aprobación posterior es del %: no puede ser posterior a un acto que aún no ocurría. Si se consienten actos futuros, es una aprobación previa con su alcance.',
      v_fecha_op, v_fecha_ap
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger operacion_consentida_coherencia
  before insert on operaciones_consentidas
  for each row execute function app.operacion_consentida_coherente();

-- Y una aprobación posterior que no nombre ninguna operación no consiente
-- nada. Se valida al COMMIT porque la fila y sus operaciones se escriben en la
-- misma transacción — mismo recurso que la coherencia de declaraciones_pep.
create or replace function app.aprobacion_posterior_nombra_actos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if not exists (select 1 from public.aprobaciones_directivo where id = new.id) then
    -- Se borró dentro de la misma transacción (limpieza de aserción).
    return null;
  end if;
  if new.momento <> 'posterior' then
    return null;
  end if;

  select count(*) into v_n
    from public.operaciones_consentidas where aprobacion_id = new.id;

  if v_n = 0 then
    raise exception
      'Esta aprobación posterior no nombra ninguna operación. El Art. 23 Ter 5 pide consentir «los actos u operaciones respectivos»: sin decir cuáles, no consiente nada y no se puede oponer a una revisión.'
      using errcode = 'check_violation';
  end if;

  return null;
end $$;

create constraint trigger aprobacion_posterior_con_actos
  after insert on aprobaciones_directivo
  deferrable initially deferred
  for each row execute function app.aprobacion_posterior_nombra_actos();

create trigger aprobaciones_append_only
  before update or delete on aprobaciones_directivo
  for each row execute function app.prohibir_mutacion();

create trigger aprobaciones_sin_truncate
  before truncate on aprobaciones_directivo
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 6. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table aprobaciones_directivo  enable row level security;
alter table operaciones_consentidas enable row level security;

create policy "ver las aprobaciones de mi obligado" on aprobaciones_directivo
  for select to authenticated using (tenant_id = app.tenant_id());
-- Asentar el consentimiento de un directivo es un acto de consecuencia: no lo
-- captura cualquiera, igual que aprobar un expediente o un aviso.
create policy "admin asienta la aprobación" on aprobaciones_directivo
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver los actos consentidos" on operaciones_consentidas
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin nombra los actos consentidos" on operaciones_consentidas
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on aprobaciones_directivo  to authenticated;
grant select, insert on operaciones_consentidas to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('aprobaciones_directivo','authenticated','INSERT',null,
   'el admin asienta la aprobación del Art. 23 Ter 5; nunca se edita ni se borra'),
  ('operaciones_consentidas','authenticated','INSERT',null,
   'nombrar qué actos consiente una aprobación posterior');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_fisico uuid; v_user uuid; v_userf uuid;
  v_cliente uuid; v_otro uuid;
  v_sucursal uuid; v_actividad uuid; v_desarrollo uuid;
  v_op uuid; v_op_futura uuid;
  v_decl uuid; v_decl_niega uuid; v_decl_otro uuid;
  v_modelo uuid; v_bajo uuid; v_medio uuid; v_alto uuid; v_elem uuid;
  v_eval_alta uuid; v_eval_media uuid; v_eval_otro uuid;
  v_ap uuid; v_rechazo boolean; v_problemas text;
  v_hoy date := date '2027-04-10';
begin
  -- ── El obligado persona moral y su cadena completa ────────────────────
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('ADM270401AB1', 'Aserción aprobación directivo', 'moral') returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-aprobacion@ejemplo.mx')
  returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Aprobación', 'asercion-aprobacion@ejemplo.mx');

  insert into sucursales (tenant_id, nombre, clave)
  values (v_tenant, 'Matriz de aserción', 'ASA') returning id into v_sucursal;
  select id into v_actividad from actividades_vulnerables where fraccion = 'V_BIS';
  insert into desarrollos_inmobiliarios
    (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal,
     colonia, calle, tipo_desarrollo, monto_desarrollo, unidades_comercializadas, costo_unidad)
  values (v_tenant, 'Desarrollo de aserción', 'ASA-001', '31', '97100',
          'Itzimná', 'Calle 21', '1', 40000000, 20, 2000000)
  returning id into v_desarrollo;

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'APAA800101AA1', 'Cliente PEP de Aserción', 'MX')
  returning id into v_cliente;
  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'APBB800101BB2', 'Cliente Ajeno de Aserción', 'MX')
  returning id into v_otro;

  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_sucursal, v_cliente, v_actividad, v_hoy - 20, 900000, 900000, '03', v_desarrollo)
  returning id into v_op;
  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_sucursal, v_cliente, v_actividad, v_hoy + 30, 500000, 500000, '03', v_desarrollo)
  returning id into v_op_futura;

  -- La declaración PEP, con su vínculo titular (Cap. III Quáter).
  insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
  values (v_tenant, v_cliente, 'pep_por_funcion', v_hoy - 30, v_user) returning id into v_decl;
  insert into vinculos_pep (tenant_id, declaracion_id, tipo, cargo, ambito, en_funciones)
  values (v_tenant, v_decl, 'titular', 'Directora de área', 'nacional', true);

  insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
  values (v_tenant, v_cliente, 'niega', v_hoy - 29, v_user) returning id into v_decl_niega;

  -- La del cliente ajeno es una declaración PEP DE VERDAD, a propósito: si
  -- dijera «niega», la rechazaría el trigger de coherencia y la aserción 4
  -- probaría otra cosa. Así lo único que puede detenerla es la clave compuesta.
  insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
  values (v_tenant, v_otro, 'pep_por_funcion', v_hoy - 30, v_user) returning id into v_decl_otro;
  insert into vinculos_pep (tenant_id, declaracion_id, tipo, cargo, ambito, en_funciones)
  values (v_tenant, v_decl_otro, 'titular', 'Regidor', 'nacional', true);

  -- El modelo de riesgo vigente (Cap. III Bis), con su escala y un factor.
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo', 'Bajo', 1, false, 0, date '2027-03-01') returning id into v_bajo;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, date '2027-03-01') returning id into v_medio;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto', 'Alto', 3, true, 70, date '2027-03-01') returning id into v_alto;

  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Persona Políticamente Expuesta', 80);
  update modelos_riesgo set estado = 'vigente', vigente_desde = date '2027-03-01',
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  insert into evaluaciones_riesgo
    (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados, evaluado_por, vence)
  values (v_tenant, v_cliente, v_modelo, v_alto, 80, '[]'::jsonb, v_user, v_hoy + 180)
  returning id into v_eval_alta;
  insert into evaluaciones_riesgo
    (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados, evaluado_por, vence)
  values (v_tenant, v_cliente, v_modelo, v_medio, 40, '[]'::jsonb, v_user, v_hoy + 180)
  returning id into v_eval_media;

  -- La del cliente ajeno también es ALTA, por el mismo motivo que su
  -- declaración es una PEP de verdad: si no lo fuera, la rechazaría el trigger
  -- de coherencia y la aserción 4b probaría otra cosa.
  insert into evaluaciones_riesgo
    (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados, evaluado_por, vence)
  values (v_tenant, v_otro, v_modelo, v_alto, 80, '[]'::jsonb, v_user, v_hoy + 180)
  returning id into v_eval_otro;

  -- 1. Una persona moral no emite la constancia del ¶2.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, motivos, fecha_aprobacion,
       declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'constancia_persona_fisica', 'posterior',
            'Lo consideré razonable', v_hoy, v_decl, v_eval_alta, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una persona moral se subsanó con la constancia del ¶2, que es solo para el obligado persona física: se saltó la firma que el ¶1 le exige.';
  end if;

  -- 2. Citar una declaración que NIEGA el carácter PEP.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
            v_hoy, v_decl_niega, v_eval_alta, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación citó como fundamento una declaración que dice que el cliente NO es PEP.';
  end if;

  -- 3. Citar una evaluación que no es de grado alto: falta media conjunción.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
            v_hoy, v_decl, v_eval_media, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se asentó una aprobación citando un grado que no es alto: el Art. 23 Ter 5 exige PEP «y, además, con Grado de Riesgo alto».';
  end if;

  -- 4. Citar la evidencia de OTRO cliente. Lo impide la clave compuesta.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
            v_hoy, v_decl_otro, v_eval_alta, v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación citó la declaración PEP de otra persona. La fila se vería impecable y sería indefendible.';
  end if;

  -- 4b. Y la simétrica: citar la evaluación de riesgo de otra persona. Sin
  --     esta, la mitad de la clave compuesta quedaba sin vigilar — lo encontró
  --     el sabotaje, no una relectura.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
            v_hoy, v_decl, v_eval_otro, v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación citó el Grado de Riesgo de otra persona como la mitad de su fundamento.';
  end if;

  -- 5. Firmar antes de que existiera la evidencia.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
            v_hoy - 60, v_decl, v_eval_alta, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se asentó una aprobación anterior a la declaración y a la evaluación que cita: se consintió con evidencia que aún no existía.';
  end if;

  -- 6. Un directivo sin nombre ni cargo no es evidencia de nada.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, fecha_aprobacion,
       declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', v_hoy, v_decl, v_eval_alta, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se asentó una aprobación de directivo anónima.';
  end if;

  -- 7. Una aprobación previa sin alcance ni plazo bendice todo para siempre.
  v_rechazo := false;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'previa', 'Ana Directora', 'Directora General',
            v_hoy, v_decl, v_eval_alta, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación previa quedó sin alcance ni plazo: una sola firma consentiría todo lo que el cliente haga para siempre, y el ¶1 dice «los actos u operaciones RESPECTIVOS».';
  end if;

  -- 8. Una aprobación POSTERIOR que no nombra ningún acto (se valida al commit).
  v_rechazo := false;
  begin
    set constraints all deferred;
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
            v_hoy, v_decl, v_eval_alta, v_user);
    set constraints all immediate;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación posterior no nombró ninguna operación: no consiente nada y no se puede oponer a una revisión.';
  end if;

  -- ── El camino bueno: la aprobación posterior con su acto ──────────────
  set constraints all deferred;
  insert into aprobaciones_directivo
    (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
     motivos, fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
  values (v_tenant, v_cliente, 'directivo', 'posterior', 'Ana Directora', 'Directora General',
          'Se comprobó el origen de los recursos con estados de cuenta.',
          v_hoy, v_decl, v_eval_alta, v_user)
  returning id into v_ap;
  insert into operaciones_consentidas (tenant_id, cliente_id, aprobacion_id, operacion_id)
  values (v_tenant, v_cliente, v_ap, v_op);
  set constraints all immediate;

  -- 9. Y esa aprobación no puede consentir un acto que todavía no ocurría.
  v_rechazo := false;
  begin
    insert into operaciones_consentidas (tenant_id, cliente_id, aprobacion_id, operacion_id)
    values (v_tenant, v_cliente, v_ap, v_op_futura);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación posterior consintió una operación futura: eso no es «con posterioridad al acto», es un cheque en blanco.';
  end if;

  -- 10. Una aprobación PREVIA no nombra operaciones: consiente lo que aún no
  --     ocurre, y por eso lleva alcance y plazo en vez de una lista.
  declare v_previa uuid;
  begin
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
       alcance_previo, vigente_hasta, fecha_aprobacion,
       declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_tenant, v_cliente, 'directivo', 'previa', 'Ana Directora', 'Directora General',
            'Las aportaciones a la unidad 3-A durante este año', v_hoy + 200, v_hoy,
            v_decl, v_eval_alta, v_user)
    returning id into v_previa;

    v_rechazo := false;
    begin
      insert into operaciones_consentidas (tenant_id, cliente_id, aprobacion_id, operacion_id)
      values (v_tenant, v_cliente, v_previa, v_op);
    exception when check_violation then v_rechazo := true;
    end;
    if not v_rechazo then
      raise exception 'Una aprobación previa nombró una operación ya registrada. Si consiente un acto que ya ocurrió es posterior, y entonces la clasificación previa/posterior deja de decir cuál de los dos casos del ¶1 pasó.';
    end if;
  end;

  -- 11. La aprobación es append-only.
  v_rechazo := false;
  begin
    update aprobaciones_directivo set aprobador_nombre = 'Otro' where id = v_ap;
  exception when others then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una aprobación se pudo reescribir: se cambiaría hacia atrás quién consintió una operación ya realizada.';
  end if;

  -- ── El obligado persona física: la rama del ¶2 ────────────────────────
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('APF800101AB1', 'Aserción obligado persona física', 'fisica') returning id into v_fisico;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-fisica@ejemplo.mx')
  returning id into v_userf;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_userf, v_fisico, 'admin', 'Aserción Física', 'asercion-fisica@ejemplo.mx');

  -- 12. Un obligado persona física no tiene directivos que firmen.
  declare
    v_cf uuid; v_df uuid; v_mf uuid; v_af uuid; v_ef uuid; v_elf uuid;
  begin
    insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
    values (v_fisico, 'fisica', 'APCC800101CC3', 'Cliente de Física', 'MX') returning id into v_cf;
    -- Vuelve a diferir: la aserción 8 dejó las restricciones en modo inmediato
    -- para lo que resta de la transacción, y la coherencia de la declaración PEP
    -- es `deferrable initially deferred` justamente porque la declaración y su
    -- vínculo se escriben en dos statements.
    set constraints all deferred;
    insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
    values (v_fisico, v_cf, 'pep_por_funcion', v_hoy - 30, v_userf) returning id into v_df;
    insert into vinculos_pep (tenant_id, declaracion_id, tipo, cargo, ambito, en_funciones)
    values (v_fisico, v_df, 'titular', 'Alcalde', 'nacional', true);
    set constraints all immediate;

    insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
    values (v_fisico, 'bajo', 'Bajo', 1, false, 0, date '2027-03-01');
    insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
    values (v_fisico, 'medio', 'Medio', 2, false, 35, date '2027-03-01');
    insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
    values (v_fisico, 'alto', 'Alto', 3, true, 70, date '2027-03-01') returning id into v_af;
    select id into v_elf from elementos_riesgo where clave = 'tipo_cliente';
    insert into modelos_riesgo (tenant_id, version) values (v_fisico, 1) returning id into v_mf;
    insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
    values (v_fisico, v_mf, v_elf, 'Persona Políticamente Expuesta', 80);
    update modelos_riesgo set estado = 'vigente', vigente_desde = date '2027-03-01',
           aprobado_por = v_userf, aprobado_en = now() where id = v_mf;
    insert into evaluaciones_riesgo
      (tenant_id, cliente_id, modelo_id, grado_id, puntaje, factores_aplicados, evaluado_por, vence)
    values (v_fisico, v_cf, v_mf, v_af, 80, '[]'::jsonb, v_userf, v_hoy + 180)
    returning id into v_ef;

    v_rechazo := false;
    begin
      insert into aprobaciones_directivo
        (tenant_id, cliente_id, via, momento, aprobador_nombre, aprobador_cargo,
         alcance_previo, vigente_hasta, fecha_aprobacion,
         declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
      values (v_fisico, v_cf, 'directivo', 'previa', 'Yo Mismo', 'Titular',
              'Las aportaciones del año', v_hoy + 200, v_hoy, v_df, v_ef, v_userf);
    exception when check_violation then v_rechazo := true;
    end;
    if not v_rechazo then
      raise exception 'Un obligado persona física asentó la aprobación de «un directivo» que no existe, en vez de la constancia que el ¶2 le señala.';
    end if;

    -- 13. Y su constancia tiene que señalar los motivos: es lo único que el
    --     ¶2 le pide, y sin ellos la constancia está vacía.
    v_rechazo := false;
    begin
      insert into aprobaciones_directivo
        (tenant_id, cliente_id, via, momento, alcance_previo, vigente_hasta,
         fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
      values (v_fisico, v_cf, 'constancia_persona_fisica', 'previa',
              'Las aportaciones del año', v_hoy + 200, v_hoy, v_df, v_ef, v_userf);
    exception when check_violation then v_rechazo := true;
    end;
    if not v_rechazo then
      raise exception 'Se emitió la constancia del ¶2 sin señalar los motivos, que es exactamente lo que el párrafo pide que señale.';
    end if;

    -- El camino bueno de la persona física: previa, con motivos y plazo.
    insert into aprobaciones_directivo
      (tenant_id, cliente_id, via, momento, motivos, alcance_previo, vigente_hasta,
       fecha_aprobacion, declaracion_pep_id, evaluacion_riesgo_id, registrada_por)
    values (v_fisico, v_cf, 'constancia_persona_fisica', 'previa',
            'Conozco al cliente desde hace ocho años y verifiqué el origen de los recursos.',
            'Las aportaciones a la unidad 4-B', v_hoy + 200, v_hoy, v_df, v_ef, v_userf);

    -- Limpieza del obligado persona física.
    alter table aprobaciones_directivo disable trigger aprobaciones_append_only;
    delete from aprobaciones_directivo where tenant_id = v_fisico;
    alter table aprobaciones_directivo enable trigger aprobaciones_append_only;
    alter table evaluaciones_riesgo disable trigger evaluaciones_riesgo_append_only;
    delete from evaluaciones_riesgo where tenant_id = v_fisico;
    alter table evaluaciones_riesgo enable trigger evaluaciones_riesgo_append_only;
    update modelos_riesgo set estado = 'sustituido' where tenant_id = v_fisico;
    alter table factores_modelo disable trigger factor_modelo_congelado;
    delete from factores_modelo where tenant_id = v_fisico;
    alter table factores_modelo enable trigger factor_modelo_congelado;
    delete from modelos_riesgo   where tenant_id = v_fisico;
    delete from grados_riesgo    where tenant_id = v_fisico;
    delete from vinculos_pep     where tenant_id = v_fisico;
    delete from declaraciones_pep where tenant_id = v_fisico;
    delete from clientes_finales where tenant_id = v_fisico;
  end;

  -- Limpieza del obligado persona moral.
  delete from operaciones_consentidas where tenant_id = v_tenant;
  alter table aprobaciones_directivo disable trigger aprobaciones_append_only;
  delete from aprobaciones_directivo where tenant_id = v_tenant;
  alter table aprobaciones_directivo enable trigger aprobaciones_append_only;
  alter table evaluaciones_riesgo disable trigger evaluaciones_riesgo_append_only;
  delete from evaluaciones_riesgo where tenant_id = v_tenant;
  alter table evaluaciones_riesgo enable trigger evaluaciones_riesgo_append_only;
  update modelos_riesgo set estado = 'sustituido' where tenant_id = v_tenant;
  alter table factores_modelo disable trigger factor_modelo_congelado;
  delete from factores_modelo where tenant_id = v_tenant;
  alter table factores_modelo enable trigger factor_modelo_congelado;
  delete from modelos_riesgo   where tenant_id = v_tenant;
  delete from grados_riesgo    where tenant_id = v_tenant;
  delete from vinculos_pep     where tenant_id = v_tenant;
  delete from declaraciones_pep where tenant_id = v_tenant;
  alter table operaciones disable trigger operaciones_append_only;
  delete from operaciones      where tenant_id = v_tenant;
  alter table operaciones enable trigger operaciones_append_only;
  delete from desarrollos_inmobiliarios where tenant_id = v_tenant;
  delete from clientes_finales where tenant_id = v_tenant;
  delete from sucursales       where tenant_id = v_tenant;
  delete from usuarios         where tenant_id in (v_tenant, v_fisico);
  delete from auth.users       where id in (v_user, v_userf);
  delete from tenants          where id in (v_tenant, v_fisico);

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

  raise notice '✓ aprobación de directivo: las dos ramas son excluyentes, la conjunción se cita entera, y no se consiente en abstracto';
end $$;
