-- ---------------------------------------------------------------------------
-- El carácter de PEP no es una casilla: es una red declarada con dos relojes
-- ---------------------------------------------------------------------------
-- Issue #19. Exigible el 30 de noviembre de 2026 (Transitorio Primero).
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE EL TEXTO (✅ contrastado contra el DOF el 17-ago-2026)
-- ────────────────────────────────────────────────────────────────────────────
-- Acuerdo 115/2026, Art. 23 Quáter —`regulatorio/dof/acuerdo-115-2026.txt`,
-- líneas 243–247—, cinco párrafos:
--
--   ¶1 Es PEP la persona física «que desempeña o HA DESEMPEÑADO funciones
--      públicas en territorio nacional o en un país extranjero». La lista de
--      cargos es ejemplificativa: «entre otras».
--
--   ¶3 «Se ASIMILAN a Personas Políticamente Expuestas, el cónyuge, la
--      concubina, el concubinario y las personas con quienes […] mantengan
--      parentesco por consanguinidad o afinidad HASTA EL SEGUNDO GRADO, así
--      como los asociados o socios de personas morales con las que mantengan
--      vínculos patrimoniales.»
--
--   ¶4 La PEP NACIONAL lo sigue siendo «durante el año siguiente A AQUEL en
--      que hubiesen dejado su cargo».
--
--   ¶5 El segundo reloj: si el cese ocurrió «dentro del año inmediato anterior
--      a la fecha» del acto u operación, el obligado «deberá catalogarla como
--      tal, durante el año siguiente A AQUEL en que se haya realizado el acto
--      u operación correspondiente».
--
-- ────────────────────────────────────────────────────────────────────────────
-- LAS TRES CONSECUENCIAS QUE DECIDEN EL MODELO
-- ────────────────────────────────────────────────────────────────────────────
-- 1. **La declaración es una red, no un booleano.** El cliente puede ser PEP
--    por su propia función o por su vínculo con quien la tiene. Cada camino se
--    captura como un VÍNCULO tipificado con el vocabulario del ¶3 — porque
--    ante una revisión lo defendible no es «marcó que sí», sino QUÉ declaró.
--
-- 2. **La vigencia se deriva de fechas; no se captura.** Los dos relojes del
--    ¶4 y el ¶5 son aritmética de calendario. Ojo con la letra: «el año
--    siguiente A AQUEL en que» es el AÑO CALENDARIO siguiente completo, no 12
--    meses — un cese en enero de 2026 cataloga hasta el 31-dic-2027. Es la
--    lectura literal y la conservadora (nunca acorta la ventana). Las reglas
--    viven en `parametros_motor` con su fuente; el código las lee, no las trae.
--
-- 3. **Una captura a medias no puede leerse como «niega».** Si el resultado se
--    derivara de la ausencia de vínculos, una transacción que escribió la
--    declaración y murió antes de los vínculos quedaría registrada como «el
--    cliente declaró que no» — el aviso omitido de siempre, sin excepción a la
--    vista. Por eso el resultado es EXPLÍCITO y su coherencia con los vínculos
--    se verifica AL COMMIT (constraint trigger diferido): la captura entra
--    completa o no entra.
--
-- La frontera (`ALCANCE.md` §0): VIZO registra lo que el cliente declaró y
-- quién lo revisó. JAMÁS resuelve si alguien es PEP ni consulta listas por su
-- cuenta — la consulta oficial es «Consulta PEP 2.0» de la UIF, con la e.firma
-- del obligado (Art. 23 Quáter 1), disponible el 30-ago-2027 (Trans. Décimo).

-- ---------------------------------------------------------------------------
-- 1. El vocabulario del ¶3, como tipos
-- ---------------------------------------------------------------------------
create type resultado_declaracion_pep as enum (
  'niega',            -- declaró que ni él ni su red: cero vínculos
  'pep_por_funcion',  -- ¶1: función pública propia — exige el vínculo 'titular'
  'pep_asimilada'     -- ¶3: la función la tiene alguien de su red
);

create type vinculo_pep as enum (
  'titular',            -- la propia persona cliente
  'conyuge',
  'concubinato',        -- «la concubina, el concubinario»
  'consanguinidad',     -- con grado 1 o 2
  'afinidad',           -- con grado 1 o 2
  'socio_patrimonial'   -- asociado o socio de una moral con vínculos patrimoniales
);

create type ambito_funcion_publica as enum ('nacional', 'extranjero');

-- ---------------------------------------------------------------------------
-- 2. La declaración: un hecho con fecha, capturista y revisión
-- ---------------------------------------------------------------------------
create table declaraciones_pep (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  cliente_id    uuid not null,
  resultado     resultado_declaracion_pep not null,
  -- La fecha en que el cliente declaró: es SU acto, no el del capturista.
  fecha_declaracion date not null,
  capturada_por uuid not null references usuarios(id),
  -- La revisión humana (regla dura 5 en espíritu: la decisión con peso legal
  -- es de una persona y queda registrada). Ambas o ninguna.
  revisada_por  uuid references usuarios(id),
  revisada_en   date,
  created_at    timestamptz not null default now(),

  unique (tenant_id, id),
  foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id),
  -- Dos declaraciones del mismo cliente el mismo día harían que «¿cuál es la
  -- vigente?» tuviera dos respuestas.
  unique (tenant_id, cliente_id, fecha_declaracion),

  constraint revision_completa_o_ausente check (
    (revisada_por is null and revisada_en is null)
    or (revisada_por is not null and revisada_en is not null
        and revisada_en >= fecha_declaracion)
  )
);

comment on table declaraciones_pep is
  'Declaraciones PEP del cliente (Art. 23 Quáter del Acuerdo 115/2026). Cada fila es un hecho: qué declaró el cliente en una fecha, quién lo capturó y quién lo revisó. No se corrige: se declara de nuevo. La vigencia del carácter PEP se DERIVA de las fechas de los vínculos con las reglas de parametros_motor; nunca se captura.';

create index on declaraciones_pep (tenant_id, cliente_id);

-- ---------------------------------------------------------------------------
-- 3. Los vínculos: quién tiene la función pública, y por qué alcanza al cliente
-- ---------------------------------------------------------------------------
create table vinculos_pep (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  declaracion_id uuid not null,
  tipo           vinculo_pep not null,
  -- Solo para consanguinidad y afinidad: «hasta el segundo grado» (¶3).
  grado          smallint,
  -- La persona con la función pública. Para 'titular' es el propio cliente y
  -- su nombre ya vive en clientes_finales: duplicarlo aquí es divergirlo.
  nombre_pep     text,
  cargo          text not null,
  ambito         ambito_funcion_publica not null,
  pais           text,
  en_funciones   boolean not null,
  fecha_cese     date,
  -- Para 'socio_patrimonial': la persona moral por la que existe el vínculo.
  detalle        text,
  created_at     timestamptz not null default now(),

  foreign key (tenant_id, declaracion_id) references declaraciones_pep(tenant_id, id),

  -- Cada CHECK nombra sus dos ramas completas: la lección del Art. 21 es que
  -- una expresión que evalúa a NULL pasa, y aquí un NULL sería un vínculo que
  -- no dice ni de quién ni hasta cuándo.
  constraint grado_solo_en_parentesco check (
    (tipo in ('consanguinidad', 'afinidad') and grado is not null and grado between 1 and 2)
    or (tipo not in ('consanguinidad', 'afinidad') and grado is null)
  ),
  constraint titular_sin_nombre_duplicado check (
    (tipo = 'titular' and nombre_pep is null)
    or (tipo <> 'titular' and nombre_pep is not null)
  ),
  constraint cese_coherente check (
    (en_funciones and fecha_cese is null)
    or (not en_funciones and fecha_cese is not null)
  ),
  -- ¶1: «en territorio nacional o en un país extranjero». Nacional no lleva
  -- país porque sería siempre México; extranjero sin país no dice nada.
  constraint extranjero_exige_pais check (
    (ambito = 'extranjero' and pais is not null)
    or (ambito = 'nacional' and pais is null)
  ),
  constraint socio_exige_la_moral check (
    tipo <> 'socio_patrimonial' or detalle is not null
  )
);

comment on table vinculos_pep is
  'La red declarada de una declaración PEP, con el vocabulario del Art. 23 Quáter ¶3. Cada fila describe a UNA persona con función pública (cargo, ámbito, si sigue en funciones y desde cuándo no) y el vínculo por el que alcanza al cliente. titular = el propio cliente.';

-- Dos vínculos 'titular' serían dos versiones de la función del propio
-- cliente en la misma declaración.
create unique index vinculo_pep_un_titular
  on vinculos_pep (declaracion_id) where tipo = 'titular';

create index on vinculos_pep (tenant_id, declaracion_id);

-- ---------------------------------------------------------------------------
-- 4. La coherencia resultado ↔ vínculos, verificada al commit
-- ---------------------------------------------------------------------------
-- Un CHECK no ve otras filas y un trigger inmediato mataría la captura legítima
-- (la declaración se inserta antes que sus vínculos). El constraint trigger
-- diferido valida cuando la transacción ya dijo todo lo que iba a decir.
create or replace function app.declaracion_pep_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_resultado public.resultado_declaracion_pep;
  v_titulares int;
  v_total     int;
begin
  -- En un IF y no en un CASE: la expresión SQL de un CASE se planea completa,
  -- y `new.declaracion_id` no existe cuando el trigger corre sobre
  -- declaraciones_pep — reventaría aunque esa rama nunca se tome.
  if tg_table_name = 'declaraciones_pep' then
    v_id := new.id;
  else
    v_id := new.declaracion_id;
  end if;

  select resultado into v_resultado
    from public.declaraciones_pep where id = v_id;
  if not found then
    -- El evento quedó en cola y la declaración ya no existe al evaluarlo
    -- (limpieza dentro de la misma transacción). No hay nada que validar.
    return null;
  end if;

  select count(*) filter (where tipo = 'titular'), count(*)
    into v_titulares, v_total
    from public.vinculos_pep where declaracion_id = v_id;

  if v_resultado = 'niega' and v_total > 0 then
    raise exception
      'La declaración dice «niega» pero tiene % vínculo(s) declarado(s). O el cliente declaró una red o declaró que no: las dos cosas a la vez no son un hecho.', v_total
      using errcode = 'check_violation';
  elsif v_resultado = 'pep_por_funcion' and v_titulares = 0 then
    raise exception
      'La declaración dice «PEP por función» sin el vínculo titular que diga qué función. Sin cargo ni fechas no hay nada que defender ante una revisión.'
      using errcode = 'check_violation';
  elsif v_resultado = 'pep_asimilada' and (v_titulares > 0 or v_total = 0) then
    raise exception
      'La declaración dice «asimilada» pero % — asimilada es exactamente: la función la tiene alguien de la red, no el cliente.',
      case when v_titulares > 0 then 'incluye un vínculo titular' else 'no declara ningún vínculo' end
      using errcode = 'check_violation';
  end if;

  return null;
end $$;

create constraint trigger declaracion_pep_coherencia
  after insert or update on declaraciones_pep
  deferrable initially deferred
  for each row execute function app.declaracion_pep_coherente();

create constraint trigger vinculo_pep_coherencia
  after insert on vinculos_pep
  deferrable initially deferred
  for each row execute function app.declaracion_pep_coherente();

-- ---------------------------------------------------------------------------
-- 5. Lo que sí se rechaza en el acto
-- ---------------------------------------------------------------------------
-- PEP es una persona física (¶1). Una declaración sobre una moral o un
-- fideicomiso no es un caso raro: es la pregunta equivocada — lo suyo es el
-- Beneficiario Controlador (Cap. III Quinquies, 1-mar-2027).
create or replace function app.declaracion_pep_sobre_persona_fisica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.tipo_persona;
begin
  select tipo_persona into v_tipo
    from public.clientes_finales
   where tenant_id = new.tenant_id and id = new.cliente_id;

  if v_tipo is distinct from 'fisica' then
    raise exception
      'La declaración PEP es de personas físicas (Art. 23 Quáter ¶1) y este cliente es %. Para una persona moral la pregunta correcta es su Beneficiario Controlador.', v_tipo
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger declaracion_pep_persona_fisica
  before insert on declaraciones_pep
  for each row execute function app.declaracion_pep_sobre_persona_fisica();

-- La declaración es un hecho: lo único que se le registra después es la
-- revisión, una sola vez. Corregir es declarar de nuevo.
create or replace function app.declaracion_pep_solo_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id  is distinct from old.tenant_id
     or new.cliente_id is distinct from old.cliente_id
     or new.resultado  is distinct from old.resultado
     or new.fecha_declaracion is distinct from old.fecha_declaracion
     or new.capturada_por     is distinct from old.capturada_por then
    raise exception
      'Una declaración no se reescribe: es lo que el cliente dijo en una fecha. Si algo cambió, se captura una declaración nueva.'
      using errcode = 'check_violation';
  end if;

  if old.revisada_en is not null
     and (new.revisada_en is distinct from old.revisada_en
          or new.revisada_por is distinct from old.revisada_por) then
    raise exception
      'La revisión ya quedó registrada y no se corrige ni se borra: es la evidencia de quién respondió por esta declaración y cuándo.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger declaracion_pep_revision
  before update on declaraciones_pep
  for each row execute function app.declaracion_pep_solo_revision();

-- Y una vez revisada, la red queda congelada: un vínculo agregado después
-- cambiaría lo que el revisor aprobó sin que su firma se entere.
create or replace function app.vinculo_pep_admisible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revisada date;
begin
  select revisada_en into v_revisada
    from public.declaraciones_pep where id = new.declaracion_id;

  if v_revisada is not null then
    raise exception
      'La declaración ya fue revisada el % y su red quedó congelada. Un vínculo nuevo es una declaración nueva.', v_revisada
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger vinculo_pep_congelado
  before insert on vinculos_pep
  for each row execute function app.vinculo_pep_admisible();

create trigger declaraciones_pep_sin_truncate
  before truncate on declaraciones_pep
  execute function app.prohibir_mutacion();

create trigger vinculos_pep_sin_truncate
  before truncate on vinculos_pep
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 6. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table declaraciones_pep enable row level security;
alter table vinculos_pep      enable row level security;

create policy "ver las declaraciones de mi obligado" on declaraciones_pep
  for select to authenticated using (tenant_id = app.tenant_id());

-- Capturar es de cualquier usuario del obligado, pero a nombre propio: una
-- captura firmada por otra persona no es evidencia de nada.
create policy "capturar la declaración del cliente" on declaraciones_pep
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and capturada_por = auth.uid());

create policy "admin registra la revisión" on declaraciones_pep
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin()
              and revisada_por = auth.uid());

create policy "ver los vínculos de mi obligado" on vinculos_pep
  for select to authenticated using (tenant_id = app.tenant_id());

create policy "capturar los vínculos declarados" on vinculos_pep
  for insert to authenticated with check (tenant_id = app.tenant_id());

grant select, insert on declaraciones_pep to authenticated;
grant update (revisada_por, revisada_en) on declaraciones_pep to authenticated;
grant select, insert on vinculos_pep to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('declaraciones_pep','authenticated','INSERT',null,
   'capturar lo que el cliente declaró, a nombre del capturista'),
  ('declaraciones_pep','authenticated','UPDATE','revisada_por',
   'POR COLUMNA: la revisión humana, una sola vez, a nombre del admin'),
  ('declaraciones_pep','authenticated','UPDATE','revisada_en',
   'POR COLUMNA: cuándo se revisó'),
  ('vinculos_pep','authenticated','INSERT',null,
   'la red declarada entra junto con su declaración; congelada tras la revisión');

-- ---------------------------------------------------------------------------
-- 7. Los dos relojes, como dato con fuente
-- ---------------------------------------------------------------------------
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'pep_vigencia_tras_cese', '"ano_calendario_siguiente"'::jsonb,
   'Cuánto tiempo sigue catalogada como PEP la persona nacional que dejó el cargo: hasta el 31 de diciembre del año siguiente a aquel en que cesó. No son 12 meses.',
   date '2026-11-30',
   'Art. 23 Quáter ¶4 del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): «durante el año siguiente a aquel en que hubiesen dejado su cargo». Lectura de año calendario —«el año siguiente A AQUEL en que»—, que además es la conservadora: nunca acorta la ventana frente a la lectura de 12 meses. Contrastado el 2026-08-17. La lectura queda POR CONFIRMAR con el especialista PLD (issue #3).'),
  (null, 'pep_vigencia_tras_acto', '"ano_calendario_siguiente"'::jsonb,
   'El segundo reloj: si el cese ocurrió dentro del año inmediato anterior a la fecha del acto u operación, la persona queda catalogada como PEP hasta el 31 de diciembre del año siguiente a aquel en que se realizó el acto.',
   date '2026-11-30',
   'Art. 23 Quáter ¶5 del Acuerdo 115/2026: «dentro del año inmediato anterior a la fecha en que pretenda llevar a cabo un acto u operación» (la condición SÍ es de 12 meses: está anclada a una fecha) … «deberá catalogarla como tal, durante el año siguiente a aquel en que se haya realizado el acto u operación correspondiente» (la duración es de año calendario). Contrastado el 2026-08-17. POR CONFIRMAR con el especialista PLD (issue #3).');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
-- Cada una comprueba que la base MUERDE, no que la restricción esté escrita.
do $$
declare
  v_tenant   uuid;
  v_user     uuid;
  v_fisica   uuid;
  v_moral    uuid;
  v_decl     uuid;
  v_rechazo  boolean;
  v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('PEP010101AAA', 'Aserción declaraciones PEP', 'moral')
  returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-pep@ejemplo.mx')
  returning id into v_user;

  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción PEP', 'asercion-pep@ejemplo.mx');

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'PECJ800101AB1', 'Persona Física de Aserción', 'MX')
  returning id into v_fisica;

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'moral', 'PEM010101AAA', 'Moral de Aserción SA', 'MX')
  returning id into v_moral;

  -- 1. «Niega» con un vínculo: la contradicción muere al validar.
  v_rechazo := false;
  begin
    set constraints all deferred;
    insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
    values (v_tenant, v_fisica, 'niega', current_date, v_user)
    returning id into v_decl;
    insert into vinculos_pep (tenant_id, declaracion_id, tipo, cargo, ambito, en_funciones)
    values (v_tenant, v_decl, 'titular', 'Regidor', 'nacional', true);
    set constraints all immediate;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una declaración «niega» convivió con un vínculo declarado: dos hechos contradictorios en el mismo registro.';
  end if;

  -- 2. «PEP por función» sin el vínculo titular.
  v_rechazo := false;
  begin
    set constraints all deferred;
    insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
    values (v_tenant, v_fisica, 'pep_por_funcion', current_date, v_user);
    set constraints all immediate;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se registró «PEP por función» sin cargo ni fechas: no hay nada que defender ante una revisión.';
  end if;

  -- 3. «Asimilada» sin ningún vínculo.
  v_rechazo := false;
  begin
    set constraints all deferred;
    insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
    values (v_tenant, v_fisica, 'pep_asimilada', current_date, v_user);
    set constraints all immediate;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se registró «asimilada» sin declarar de quién viene la función pública.';
  end if;

  -- 4. Declaración PEP sobre una persona moral: pregunta equivocada.
  v_rechazo := false;
  begin
    insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
    values (v_tenant, v_moral, 'niega', current_date, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se aceptó una declaración PEP sobre una persona moral, y el Art. 23 Quáter ¶1 habla de personas físicas.';
  end if;

  -- 5. El camino bueno pasa: asimilada por cónyuge extranjero en funciones.
  set constraints all deferred;
  insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
  values (v_tenant, v_fisica, 'pep_asimilada', current_date - 1, v_user)
  returning id into v_decl;
  insert into vinculos_pep (tenant_id, declaracion_id, tipo, nombre_pep, cargo, ambito, pais, en_funciones)
  values (v_tenant, v_decl, 'conyuge', 'Persona Cónyuge', 'Ministra de Energía', 'extranjero', 'ES', true);
  set constraints all immediate;

  -- 6. Parentesco sin grado: la trampa del NULL que pasa un CHECK mal escrito.
  v_rechazo := false;
  begin
    insert into vinculos_pep (tenant_id, declaracion_id, tipo, nombre_pep, cargo, ambito, en_funciones)
    values (v_tenant, v_decl, 'consanguinidad', 'Pariente Sin Grado', 'Senador', 'nacional', true);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un parentesco entró sin grado: «hasta el segundo grado» dejó de poder comprobarse.';
  end if;

  -- 7. Extranjero sin país.
  v_rechazo := false;
  begin
    insert into vinculos_pep (tenant_id, declaracion_id, tipo, nombre_pep, cargo, ambito, en_funciones)
    values (v_tenant, v_decl, 'afinidad', 'Pariente Político', 'Cónsul', 'extranjero', true);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un vínculo extranjero entró sin país.';
  end if;

  -- 8. Cese incoherente: sigue en funciones y a la vez tiene fecha de cese.
  v_rechazo := false;
  begin
    insert into vinculos_pep (tenant_id, declaracion_id, tipo, nombre_pep, cargo, ambito, en_funciones, fecha_cese, grado)
    values (v_tenant, v_decl, 'consanguinidad', 'Pariente Incoherente', 'Diputado', 'nacional', true, current_date, 1);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un vínculo quedó «en funciones» y con fecha de cese a la vez: los dos relojes no sabrían cuál corre.';
  end if;

  -- 9. La revisión entra una vez…
  update declaraciones_pep
     set revisada_por = v_user, revisada_en = current_date where id = v_decl;

  -- …no se corrige…
  v_rechazo := false;
  begin
    update declaraciones_pep
       set revisada_en = current_date - 1 where id = v_decl;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una revisión registrada se pudo reescribir: dejó de ser evidencia.';
  end if;

  -- …y congela la red.
  v_rechazo := false;
  begin
    insert into vinculos_pep (tenant_id, declaracion_id, tipo, nombre_pep, cargo, ambito, en_funciones)
    values (v_tenant, v_decl, 'concubinato', 'Vínculo Tardío', 'Alcalde', 'nacional', true);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un vínculo entró después de la revisión: lo aprobado cambió sin que la firma se enterara.';
  end if;

  -- 10. El hecho no se reescribe.
  v_rechazo := false;
  begin
    update declaraciones_pep set resultado = 'niega' where id = v_decl;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'El resultado de una declaración se pudo cambiar después de registrado.';
  end if;

  -- 11. Dos declaraciones del mismo cliente el mismo día.
  v_rechazo := false;
  begin
    set constraints all deferred;
    insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
    values (v_tenant, v_fisica, 'niega', current_date - 1, v_user);
    set constraints all immediate;
  exception when unique_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'El cliente quedó con dos declaraciones en la misma fecha y «¿cuál es la vigente?» tiene dos respuestas.';
  end if;

  -- 12. Los dos relojes están sembrados con su fuente.
  if (select count(*) from parametros_motor
       where clave in ('pep_vigencia_tras_cese', 'pep_vigencia_tras_acto')
         and valor = '"ano_calendario_siguiente"'::jsonb
         and fuente like '%23 Quáter%') <> 2 then
    raise exception 'Los relojes del Art. 23 Quáter no quedaron en el catálogo con su fuente.';
  end if;

  -- Limpieza. La aserción no deja rastro.
  delete from vinculos_pep       where tenant_id = v_tenant;
  delete from declaraciones_pep  where tenant_id = v_tenant;
  delete from clientes_finales   where tenant_id = v_tenant;
  delete from usuarios           where tenant_id = v_tenant;
  delete from auth.users         where id = v_user;
  delete from tenants            where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado tras crear declaraciones_pep:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_por_omision();
  if v_problemas is not null then
    raise exception 'Privilegios por omisión sobre las tablas nuevas:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_tenancy();
  if v_problemas is not null then
    raise exception 'Tenancy incompleta en las tablas nuevas:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ declaraciones_pep: la red entra completa o no entra, la revisión congela, y los relojes viven en el catálogo';
end $$;
