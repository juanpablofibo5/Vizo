-- ---------------------------------------------------------------------------
-- La estructura del obligado que actúa por fideicomiso u otra figura jurídica
-- ---------------------------------------------------------------------------
-- Issue #20. Exigible el 30 de noviembre de 2026 (Transitorio Primero).
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE EL TEXTO (✅ contrastado contra el DOF el 17-ago-2026)
-- ────────────────────────────────────────────────────────────────────────────
-- Acuerdo 115/2026, Art. 10 Sexies —`regulatorio/dof/acuerdo-115-2026.txt`,
-- líneas 117–120—, cuatro párrafos que son un CICLO DE VIDA:
--
--   ¶1 El alta: la herramienta del Portal genera un XML con la información de
--      los integrantes según los Anexos 2 Bis (fideicomiso) y 2 Ter (figura).
--   ¶2 La BAJA de un integrante: por el servicio de actualización (Art. 7).
--   ¶3 ADICIONAR integrantes: otra vez la herramienta.
--   ¶4 «En caso de que […] deban MODIFICAR O CORREGIR la información enviada
--      de alguno de sus integrantes o miembros, primero deberán realizar la
--      BAJA de ese integrante […] y posteriormente enviar NUEVAMENTE TODA su
--      información, incluyendo la que se hubiere corregido o modificado.»
--
-- Art. 10 Sexies 1: en Asociación en Participación el trámite lo hace EL
-- ASOCIANTE, con la e.firma del RFC de la AeP. Art. 4 ¶3: la e.firma es la
-- del RFC del propio fideicomiso o figura — expresamente NO la del
-- representante legal, fideicomitentes ni apoderados.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LAS TRES CONSECUENCIAS QUE DECIDEN EL MODELO
-- ────────────────────────────────────────────────────────────────────────────
-- 1. **El integrante no se edita: se da de baja y se reemplaza.** El ¶4 define
--    la corrección exactamente así. Un UPDATE sobre los datos habría borrado
--    la historia de qué se envió al SAT y cuándo — lo único que después se
--    puede defender. Por eso los datos son inmutables y lo único que avanza es
--    el ESTADO: capturado → enviado → baja.
--
-- 2. **La recursión se aplana.** El Anexo 2 Bis (III.III y IV.III) pide de un
--    fideicomitente o fideicomisario que es a su vez fideicomiso solo CUATRO
--    datos de identificación: referencia, fecha de constitución, RFC y
--    denominación de su fiduciario. No hay estructura anidada que modelar.
--
-- 3. **«¿Los fideicomisarios están determinados?» admite que NO.** La sección
--    IV del Anexo 2 Bis empieza con esa pregunta. Un modelo que exigiera al
--    menos un fideicomisario contradiría al formato oficial; uno que aceptara
--    fideicomisarios con la pregunta en «no» registraría una contradicción.
--
-- La frontera (`ALCANCE.md` §0): el trámite ocurre en el Portal del SAT con la
-- e.firma del obligado. VIZO registra qué se capturó, qué se envió y cuándo —
-- jamás genera el XML del Portal, no presenta nada y no custodia la e.firma.
-- Mismo patrón que la designación del REC.

-- ---------------------------------------------------------------------------
-- 1. Los tipos
-- ---------------------------------------------------------------------------
-- El obligado también puede ser una figura jurídica que no es fideicomiso
-- (Anexo 2 Ter: Asociación en Participación u otra). El valor nuevo NO se usa
-- dentro de esta migración (regla de Postgres para valores nuevos de enum en
-- la misma transacción); los triggers lo comparan como texto en tiempo de
-- ejecución.
alter type tipo_persona add value if not exists 'figura_juridica';

create type tipo_figura as enum (
  'fideicomiso',                 -- Anexo 2 Bis
  'asociacion_en_participacion', -- Anexo 2 Ter I.ii.a
  'otra'                         -- Anexo 2 Ter I.ii.b, con descripción
);

create type papel_integrante as enum (
  -- Anexo 2 Bis
  'fiduciario',           -- sección II
  'delegado_fiduciario',  -- sección II.I: «persona física»
  'fideicomitente',       -- sección III
  'fideicomisario',       -- sección IV
  -- Anexo 2 Ter II: «Figura del integrante»
  'asociante',
  'asociado',
  'otro'                  -- con descripción
);

-- Naturaleza del integrante. Enum propio y no `tipo_persona`: una figura
-- jurídica no puede ser integrante según los Anexos, y compartir el enum lo
-- volvería expresable.
create type naturaleza_integrante as enum ('fisica', 'moral', 'fideicomiso');

create type estado_integrante as enum (
  'capturado', -- en VIZO, todavía no enviado al SAT
  'enviado',   -- el XML de la herramienta del Portal ya lo incluyó (¶1, ¶3)
  'baja'       -- dado de baja por el servicio de actualización (¶2, ¶4)
);

-- ---------------------------------------------------------------------------
-- 2. La figura: los datos de las secciones I y II de su Anexo
-- ---------------------------------------------------------------------------
create table estructura_del_obligado (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  tipo_figura       tipo_figura not null,
  -- Anexo 2 Ter I.iii: «Descripción cuando sea Otra».
  descripcion_otra  text,
  -- Anexo 2 Bis I.i / 2 Ter I.i.
  numero_referencia text not null,
  -- Anexo 2 Bis I.ii «fecha de constitución» / 2 Ter I.iv «fecha de creación».
  fecha_constitucion date not null,
  rfc               text not null,
  -- Anexo 2 Bis I.iv — solo pregunta del fideicomiso.
  cotiza_en_bolsa   boolean,
  -- Anexo 2 Ter I.vi — solo de la otra figura.
  pais_nacionalidad text,
  -- Anexo 2 Bis IV.i. Solo del fideicomiso, y el «no» es una respuesta.
  fideicomisarios_determinados boolean,
  created_at        timestamptz not null default now(),

  unique (tenant_id),
  unique (tenant_id, id),

  constraint rfc_con_forma check (rfc ~ '^[A-ZÑ&0-9]{12,13}$'),
  constraint otra_exige_descripcion check (
    (tipo_figura = 'otra' and descripcion_otra is not null)
    or (tipo_figura <> 'otra' and descripcion_otra is null)
  ),
  -- Cada pregunta pertenece a UN anexo. Las dos ramas completas, siempre: la
  -- lección del Art. 21 es que una expresión que evalúa a NULL pasa.
  constraint bolsa_solo_de_fideicomiso check (
    (tipo_figura = 'fideicomiso' and cotiza_en_bolsa is not null)
    or (tipo_figura <> 'fideicomiso' and cotiza_en_bolsa is null)
  ),
  constraint determinados_solo_de_fideicomiso check (
    (tipo_figura = 'fideicomiso' and fideicomisarios_determinados is not null)
    or (tipo_figura <> 'fideicomiso' and fideicomisarios_determinados is null)
  ),
  constraint nacionalidad_solo_de_figura check (
    (tipo_figura = 'fideicomiso' and pais_nacionalidad is null)
    or (tipo_figura <> 'fideicomiso' and pais_nacionalidad is not null)
  )
);

comment on table estructura_del_obligado is
  'La figura por la que actúa el obligado (Anexo 2 Bis sección I, o Anexo 2 Ter sección I del Acuerdo 115/2026). Una por tenant. Sus integrantes viven en integrantes_estructura con el ciclo del Art. 10 Sexies. El trámite ante el SAT es del obligado con su e.firma: aquí solo se registra qué y cuándo.';

-- ---------------------------------------------------------------------------
-- 3. Los integrantes: los campos exactos del Anexo, por naturaleza
-- ---------------------------------------------------------------------------
create table integrantes_estructura (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  estructura_id  uuid not null,
  papel          papel_integrante not null,
  -- Anexo 2 Ter II vii/viii: «Otro» con descripción.
  descripcion_otro text,
  naturaleza     naturaleza_integrante not null,

  -- Persona física (2 Bis II.I / III.I / IV.I · 2 Ter II.I):
  primer_apellido  text,
  -- «Primer apellido, segundo apellido y nombre(s)» — hay personas sin
  -- segundo apellido; exigirlo haría incapturable a una persona real.
  segundo_apellido text,
  nombres          text,
  fecha_nacimiento date,
  -- La CURP está en el Anexo, pero un delegado o fideicomitente extranjero
  -- puede no tenerla; exigirla haría inexpresable un caso real del formato.
  curp             text,
  pais_nacimiento  text,

  -- Persona moral (2 Bis III.II / IV.II · 2 Ter II.II):
  denominacion       text,
  fecha_constitucion date,

  -- Compartidos entre naturalezas:
  rfc               text not null,
  pais_nacionalidad text,

  -- Fideicomiso anidado (2 Bis III.III / IV.III) — la recursión aplanada:
  numero_referencia      text,
  denominacion_fiduciario text,

  -- El ciclo del Art. 10 Sexies.
  estado       estado_integrante not null default 'capturado',
  fecha_envio  date,
  fecha_baja   date,
  -- ¶4: la fila que reemplaza a una dada de baja. La historia queda entera.
  corrige_a    uuid,

  created_at   timestamptz not null default now(),

  foreign key (tenant_id, estructura_id) references estructura_del_obligado(tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, corrige_a) references integrantes_estructura(tenant_id, id),

  -- ── Los campos de cada naturaleza, y solo esos ──
  constraint campos_de_fisica check (
    (naturaleza = 'fisica'
      and primer_apellido is not null and nombres is not null
      and fecha_nacimiento is not null and pais_nacionalidad is not null
      and pais_nacimiento is not null
      and denominacion is null and fecha_constitucion is null
      and numero_referencia is null and denominacion_fiduciario is null)
    or (naturaleza <> 'fisica'
      and primer_apellido is null and segundo_apellido is null
      and nombres is null and fecha_nacimiento is null and curp is null
      and pais_nacimiento is null)
  ),
  constraint campos_de_moral check (
    (naturaleza = 'moral'
      and denominacion is not null and fecha_constitucion is not null
      and pais_nacionalidad is not null
      and numero_referencia is null and denominacion_fiduciario is null)
    or (naturaleza <> 'moral')
  ),
  constraint campos_de_fideicomiso check (
    (naturaleza = 'fideicomiso'
      and numero_referencia is not null and fecha_constitucion is not null
      and denominacion_fiduciario is not null
      and denominacion is null and pais_nacionalidad is null)
    or (naturaleza <> 'fideicomiso')
  ),

  -- ── El papel restringe la naturaleza, como en el Anexo ──
  -- II.I: el delegado fiduciario es «persona física». II: el fiduciario se
  -- identifica por denominación o razón social — es una moral.
  constraint fiduciario_es_moral check (
    papel <> 'fiduciario' or naturaleza = 'moral'
  ),
  constraint delegado_es_fisica check (
    papel <> 'delegado_fiduciario' or naturaleza = 'fisica'
  ),
  -- El fideicomiso anidado solo existe en III.III y IV.III.
  constraint anidado_solo_donde_el_anexo check (
    naturaleza <> 'fideicomiso' or papel in ('fideicomitente', 'fideicomisario')
  ),
  -- 2 Ter II: los integrantes de otra figura son físicas o morales.
  constraint integrante_de_figura_no_es_fideicomiso check (
    papel not in ('asociante', 'asociado', 'otro') or naturaleza <> 'fideicomiso'
  ),
  constraint otro_exige_descripcion check (
    (papel = 'otro' and descripcion_otro is not null)
    or (papel <> 'otro' and descripcion_otro is null)
  ),

  -- ── El estado y sus fechas dicen lo mismo ──
  constraint estado_con_sus_fechas check (
    (estado = 'capturado' and fecha_envio is null and fecha_baja is null)
    or (estado = 'enviado' and fecha_envio is not null and fecha_baja is null)
    or (estado = 'baja' and fecha_baja is not null
        and (fecha_envio is null or fecha_baja >= fecha_envio))
  )
);

comment on table integrantes_estructura is
  'Integrantes o miembros de la figura (Anexos 2 Bis y 2 Ter). Los DATOS son inmutables: el Art. 10 Sexies ¶4 define la corrección como baja + reenvío, así que corregir es dar de baja esta fila y capturar otra con corrige_a apuntando aquí. Solo el estado avanza: capturado → enviado → baja.';

create index on integrantes_estructura (tenant_id, estructura_id, estado);

-- ---------------------------------------------------------------------------
-- 4. Lo que un CHECK no puede ver
-- ---------------------------------------------------------------------------
-- La estructura es de obligados fideicomiso o figura jurídica, y el tipo de
-- figura tiene que corresponder con el tipo de persona del tenant.
create or replace function app.estructura_del_obligado_admisible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  select tipo_persona::text into v_tipo
    from public.tenants where id = new.tenant_id;

  if v_tipo is null or v_tipo not in ('fideicomiso', 'figura_juridica') then
    raise exception
      'La estructura del Cap. II Ter es de obligados que actúan por fideicomiso u otra figura jurídica, y este obligado es %. Una persona moral se identifica con el Anexo 2, no con el 2 Bis.',
      coalesce(v_tipo, 'de tipo desconocido')
      using errcode = 'check_violation';
  end if;

  if v_tipo = 'fideicomiso' and new.tipo_figura <> 'fideicomiso' then
    raise exception
      'El obligado es un fideicomiso: su estructura se describe con el Anexo 2 Bis (tipo_figura = fideicomiso), no con el 2 Ter.'
      using errcode = 'check_violation';
  end if;
  if v_tipo = 'figura_juridica' and new.tipo_figura = 'fideicomiso' then
    raise exception
      'El obligado es una figura jurídica distinta del fideicomiso: su estructura se describe con el Anexo 2 Ter.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger estructura_admisible
  before insert on estructura_del_obligado
  for each row execute function app.estructura_del_obligado_admisible();

-- La figura decide qué papeles existen, y la pregunta IV.i decide si puede
-- haber fideicomisarios.
create or replace function app.integrante_admisible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_figura public.estructura_del_obligado%rowtype;
  v_previo public.integrantes_estructura%rowtype;
begin
  select * into v_figura
    from public.estructura_del_obligado where id = new.estructura_id;

  if v_figura.tipo_figura = 'fideicomiso'
     and new.papel in ('asociante', 'asociado', 'otro') then
    raise exception
      'Un fideicomiso no tiene %s: sus papeles son fiduciario, delegado fiduciario, fideicomitente y fideicomisario (Anexo 2 Bis).', new.papel
      using errcode = 'check_violation';
  end if;
  if v_figura.tipo_figura <> 'fideicomiso'
     and new.papel not in ('asociante', 'asociado', 'otro') then
    raise exception
      'Una figura del Anexo 2 Ter no tiene %s: sus integrantes son asociante, asociado u otro.', new.papel
      using errcode = 'check_violation';
  end if;

  if new.papel = 'fideicomisario' and v_figura.fideicomisarios_determinados is not true then
    raise exception
      'La estructura declara que los fideicomisarios NO están determinados (Anexo 2 Bis, IV.i). Registrar uno contradiría esa respuesta: primero se corrige la declaración de la figura.'
      using errcode = 'check_violation';
  end if;

  -- ¶4: la corrección llega DESPUÉS de la baja, no antes.
  if new.corrige_a is not null then
    select * into v_previo
      from public.integrantes_estructura where id = new.corrige_a;
    if v_previo.estado is distinct from 'baja' then
      raise exception
        'El integrante que se corrige sigue en estado %. El Art. 10 Sexies ¶4 exige primero su baja y después el reenvío con la información corregida.',
        v_previo.estado
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger integrante_admisible
  before insert on integrantes_estructura
  for each row execute function app.integrante_admisible();

-- Los datos no se editan; el estado no retrocede.
create or replace function app.integrante_solo_avanza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.papel is distinct from old.papel
     or new.naturaleza is distinct from old.naturaleza
     or new.estructura_id is distinct from old.estructura_id
     or new.tenant_id is distinct from old.tenant_id
     or new.rfc is distinct from old.rfc
     or new.primer_apellido is distinct from old.primer_apellido
     or new.segundo_apellido is distinct from old.segundo_apellido
     or new.nombres is distinct from old.nombres
     or new.fecha_nacimiento is distinct from old.fecha_nacimiento
     or new.curp is distinct from old.curp
     or new.pais_nacimiento is distinct from old.pais_nacimiento
     or new.denominacion is distinct from old.denominacion
     or new.fecha_constitucion is distinct from old.fecha_constitucion
     or new.pais_nacionalidad is distinct from old.pais_nacionalidad
     or new.numero_referencia is distinct from old.numero_referencia
     or new.denominacion_fiduciario is distinct from old.denominacion_fiduciario
     or new.descripcion_otro is distinct from old.descripcion_otro
     or new.corrige_a is distinct from old.corrige_a then
    raise exception
      'Los datos de un integrante no se editan: el Art. 10 Sexies ¶4 define la corrección como su baja y una captura nueva. Así la historia de lo enviado al SAT queda entera.'
      using errcode = 'check_violation';
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if not (
       (old.estado = 'capturado' and new.estado in ('enviado', 'baja'))
    or (old.estado = 'enviado'   and new.estado = 'baja')
  ) then
    raise exception
      'Un integrante no pasa de % a %. El ciclo del Art. 10 Sexies solo avanza: capturado → enviado → baja.',
      old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger integrante_avanza
  before update on integrantes_estructura
  for each row execute function app.integrante_solo_avanza();

-- La identidad de la figura tampoco se reescribe; lo único que puede cambiar
-- son las dos respuestas booleanas del Anexo.
create or replace function app.estructura_solo_respuestas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activos int;
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.tipo_figura is distinct from old.tipo_figura
     or new.descripcion_otra is distinct from old.descripcion_otra
     or new.numero_referencia is distinct from old.numero_referencia
     or new.fecha_constitucion is distinct from old.fecha_constitucion
     or new.rfc is distinct from old.rfc
     or new.pais_nacionalidad is distinct from old.pais_nacionalidad then
    raise exception
      'La identidad de la figura no se reescribe. Si el dato enviado al SAT estaba mal, el camino es el del Art. 10 Sexies ¶4, no un UPDATE.'
      using errcode = 'check_violation';
  end if;

  -- Pasar la pregunta IV.i a «no» con fideicomisarios registrados y sin baja
  -- dejaría a la estructura contradiciéndose.
  if old.fideicomisarios_determinados is true
     and new.fideicomisarios_determinados is false then
    select count(*) into v_activos
      from public.integrantes_estructura
     where estructura_id = new.id
       and papel = 'fideicomisario' and estado <> 'baja';
    if v_activos > 0 then
      raise exception
        'Hay % fideicomisario(s) sin baja. Antes de declarar que no están determinados hay que darlos de baja (Art. 10 Sexies ¶2).', v_activos
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger estructura_respuestas
  before update on estructura_del_obligado
  for each row execute function app.estructura_solo_respuestas();

create trigger estructura_sin_truncate
  before truncate on estructura_del_obligado
  execute function app.prohibir_mutacion();

create trigger integrantes_sin_truncate
  before truncate on integrantes_estructura
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 5. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table estructura_del_obligado enable row level security;
alter table integrantes_estructura  enable row level security;

create policy "ver la estructura de mi obligado" on estructura_del_obligado
  for select to authenticated using (tenant_id = app.tenant_id());

create policy "admin registra la figura" on estructura_del_obligado
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "admin actualiza las respuestas" on estructura_del_obligado
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver los integrantes de mi obligado" on integrantes_estructura
  for select to authenticated using (tenant_id = app.tenant_id());

create policy "admin captura integrantes" on integrantes_estructura
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "admin avanza el estado" on integrantes_estructura
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on estructura_del_obligado to authenticated;
grant update (cotiza_en_bolsa, fideicomisarios_determinados)
  on estructura_del_obligado to authenticated;
grant select, insert on integrantes_estructura to authenticated;
grant update (estado, fecha_envio, fecha_baja) on integrantes_estructura to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('estructura_del_obligado','authenticated','INSERT',null,
   'el admin registra la figura por la que actúa el obligado (Cap. II Ter)'),
  ('estructura_del_obligado','authenticated','UPDATE','cotiza_en_bolsa',
   'POR COLUMNA: respuesta del Anexo 2 Bis I.iv; la identidad de la figura es inmutable'),
  ('estructura_del_obligado','authenticated','UPDATE','fideicomisarios_determinados',
   'POR COLUMNA: la pregunta IV.i del Anexo 2 Bis; su trigger impide contradecir a los registrados'),
  ('integrantes_estructura','authenticated','INSERT',null,
   'capturar integrantes; corregir es baja + fila nueva (Art. 10 Sexies ¶4)'),
  ('integrantes_estructura','authenticated','UPDATE','estado',
   'POR COLUMNA: el ciclo capturado → enviado → baja, solo hacia adelante'),
  ('integrantes_estructura','authenticated','UPDATE','fecha_envio',
   'POR COLUMNA: cuándo lo incluyó el XML de la herramienta del Portal'),
  ('integrantes_estructura','authenticated','UPDATE','fecha_baja',
   'POR COLUMNA: cuándo se dio de baja por el servicio de actualización');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_fide    uuid;
  v_moral   uuid;
  v_est     uuid;
  v_fdt     uuid;
  v_rechazo boolean;
  v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('EST260101AB1', 'Aserción estructura fideicomiso', 'fideicomiso')
  returning id into v_fide;

  insert into tenants (rfc, razon_social, tipo_persona)
  values ('ESM260101AB1', 'Aserción estructura moral', 'moral')
  returning id into v_moral;

  -- 1. Una moral no tiene estructura del Cap. II Ter.
  v_rechazo := false;
  begin
    insert into estructura_del_obligado
      (tenant_id, tipo_figura, numero_referencia, fecha_constitucion, rfc, cotiza_en_bolsa, fideicomisarios_determinados)
    values (v_moral, 'fideicomiso', 'F-100', '2020-01-01', 'EST200101AB1', false, true);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una persona moral registró estructura del Anexo 2 Bis, y su anexo es el 2.';
  end if;

  -- 2. Un tenant fideicomiso no se describe con el Anexo 2 Ter.
  v_rechazo := false;
  begin
    insert into estructura_del_obligado
      (tenant_id, tipo_figura, numero_referencia, fecha_constitucion, rfc, pais_nacionalidad)
    values (v_fide, 'asociacion_en_participacion', 'AEP-1', '2020-01-01', 'EST200101AB1', 'MX');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un fideicomiso quedó descrito con el Anexo 2 Ter.';
  end if;

  -- 3. Fideicomiso sin la pregunta de bolsa, o con nacionalidad que no es suya.
  v_rechazo := false;
  begin
    insert into estructura_del_obligado
      (tenant_id, tipo_figura, numero_referencia, fecha_constitucion, rfc, fideicomisarios_determinados)
    values (v_fide, 'fideicomiso', 'F-100', '2020-01-01', 'EST200101AB1', true);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un fideicomiso entró sin responder si cotiza en bolsa (Anexo 2 Bis I.iv).';
  end if;

  -- El camino bueno: fideicomiso completo, fideicomisarios determinados.
  insert into estructura_del_obligado
    (tenant_id, tipo_figura, numero_referencia, fecha_constitucion, rfc, cotiza_en_bolsa, fideicomisarios_determinados)
  values (v_fide, 'fideicomiso', 'F-2020/318', '2020-01-01', 'EST200101AB1', false, true)
  returning id into v_est;

  -- 4. Un físico a medias no entra (la trampa del NULL).
  v_rechazo := false;
  begin
    insert into integrantes_estructura
      (tenant_id, estructura_id, papel, naturaleza, nombres, rfc)
    values (v_fide, v_est, 'delegado_fiduciario', 'fisica', 'Persona Trunca', 'TRUN800101AB1');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un integrante físico entró sin apellidos, fechas ni países: el Anexo 2 Bis II.I pide todo eso.';
  end if;

  -- 5. El fiduciario es una moral; un fiduciario físico no existe en el Anexo.
  v_rechazo := false;
  begin
    insert into integrantes_estructura
      (tenant_id, estructura_id, papel, naturaleza, primer_apellido, nombres,
       fecha_nacimiento, pais_nacionalidad, pais_nacimiento, rfc)
    values (v_fide, v_est, 'fiduciario', 'fisica', 'Pérez', 'Fiduciario Físico',
            '1980-01-01', 'MX', 'MX', 'PEFF800101AB1');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un fiduciario persona física entró, y el Anexo 2 Bis II lo identifica por denominación o razón social.';
  end if;

  -- 6. El fideicomiso anidado solo puede ser fideicomitente o fideicomisario.
  v_rechazo := false;
  begin
    insert into integrantes_estructura
      (tenant_id, estructura_id, papel, naturaleza, numero_referencia,
       fecha_constitucion, denominacion_fiduciario, rfc)
    values (v_fide, v_est, 'fiduciario', 'fideicomiso', 'F-999', '2019-01-01',
            'Banco Fiduciario SA', 'FID190101AB1');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un fideicomiso anidado entró como fiduciario: el Anexo solo lo admite en III.III y IV.III.';
  end if;

  -- 7. Un asociante dentro de un fideicomiso: papeles de otro anexo.
  v_rechazo := false;
  begin
    insert into integrantes_estructura
      (tenant_id, estructura_id, papel, naturaleza, denominacion,
       fecha_constitucion, pais_nacionalidad, rfc)
    values (v_fide, v_est, 'asociante', 'moral', 'Asociante SA', '2015-01-01', 'MX', 'ASO150101AB1');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un asociante entró en un fideicomiso: ese papel es del Anexo 2 Ter.';
  end if;

  -- El camino bueno completo: fiduciario, delegado, fideicomitente moral,
  -- fideicomisario físico y un fideicomitente que es fideicomiso anidado.
  insert into integrantes_estructura
    (tenant_id, estructura_id, papel, naturaleza, denominacion, fecha_constitucion, pais_nacionalidad, rfc)
  values (v_fide, v_est, 'fiduciario', 'moral', 'Banco Fiduciario SA', '1990-05-01', 'MX', 'BFI900501AB1');

  insert into integrantes_estructura
    (tenant_id, estructura_id, papel, naturaleza, primer_apellido, segundo_apellido, nombres,
     fecha_nacimiento, curp, pais_nacionalidad, pais_nacimiento, rfc)
  values (v_fide, v_est, 'delegado_fiduciario', 'fisica', 'Canul', 'May', 'Delegada',
          '1985-03-10', 'CAMD850310MYNNYL01', 'MX', 'MX', 'CAMD850310AB1');

  insert into integrantes_estructura
    (tenant_id, estructura_id, papel, naturaleza, denominacion, fecha_constitucion, pais_nacionalidad, rfc)
  values (v_fide, v_est, 'fideicomitente', 'moral', 'Promotora Caribe SA', '2010-02-02', 'MX', 'PCA100202AB1');

  insert into integrantes_estructura
    (tenant_id, estructura_id, papel, naturaleza, primer_apellido, nombres,
     fecha_nacimiento, pais_nacionalidad, pais_nacimiento, rfc)
  values (v_fide, v_est, 'fideicomisario', 'fisica', 'Ek', 'Beneficiaria',
          '1970-07-07', 'MX', 'MX', 'EKBE700707AB1')
  returning id into v_fdt;

  insert into integrantes_estructura
    (tenant_id, estructura_id, papel, naturaleza, numero_referencia,
     fecha_constitucion, denominacion_fiduciario, rfc)
  values (v_fide, v_est, 'fideicomitente', 'fideicomiso', 'F-2015/044', '2015-11-11',
          'Otra Fiduciaria SA', 'FAN151111AB1');

  -- 8. El estado avanza y no retrocede; los datos no se editan.
  update integrantes_estructura
     set estado = 'enviado', fecha_envio = current_date where id = v_fdt;

  v_rechazo := false;
  begin
    update integrantes_estructura
       set estado = 'capturado', fecha_envio = null where id = v_fdt;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un integrante enviado volvió a capturado: la historia del trámite se pudo reescribir.';
  end if;

  v_rechazo := false;
  begin
    update integrantes_estructura set rfc = 'OTRO800101AB1' where id = v_fdt;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Los datos de un integrante se pudieron editar, y el ¶4 exige baja + reenvío.';
  end if;

  -- 9. La corrección exige la baja previa.
  v_rechazo := false;
  begin
    insert into integrantes_estructura
      (tenant_id, estructura_id, papel, naturaleza, primer_apellido, nombres,
       fecha_nacimiento, pais_nacionalidad, pais_nacimiento, rfc, corrige_a)
    values (v_fide, v_est, 'fideicomisario', 'fisica', 'Ek', 'Beneficiaria Corregida',
            '1970-07-07', 'MX', 'MX', 'EKBE700707AB2', v_fdt);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una corrección entró sin la baja previa del integrante corregido (¶4).';
  end if;

  -- …y con la baja hecha, pasa.
  update integrantes_estructura
     set estado = 'baja', fecha_baja = current_date where id = v_fdt;
  insert into integrantes_estructura
    (tenant_id, estructura_id, papel, naturaleza, primer_apellido, nombres,
     fecha_nacimiento, pais_nacionalidad, pais_nacimiento, rfc, corrige_a)
  values (v_fide, v_est, 'fideicomisario', 'fisica', 'Ek', 'Beneficiaria Corregida',
          '1970-07-07', 'MX', 'MX', 'EKBE700707AB2', v_fdt);

  -- 10. Declarar «no determinados» con fideicomisarios activos se rechaza…
  v_rechazo := false;
  begin
    update estructura_del_obligado
       set fideicomisarios_determinados = false where id = v_est;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'La pregunta IV.i pasó a «no» con fideicomisarios registrados sin baja: la estructura quedó contradiciéndose.';
  end if;

  -- 11. …y la identidad de la figura no se reescribe.
  v_rechazo := false;
  begin
    update estructura_del_obligado set numero_referencia = 'F-OTRO' where id = v_est;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'La identidad de la figura se pudo reescribir.';
  end if;

  -- Limpieza. La aserción no deja rastro.
  delete from integrantes_estructura   where tenant_id = v_fide;
  delete from estructura_del_obligado  where tenant_id = v_fide;
  delete from tenants where id in (v_fide, v_moral);

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado tras crear la estructura:%s', E'\n' || v_problemas;
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

  raise notice '✓ estructura_del_obligado: cada anexo con sus campos, el ciclo solo avanza, y corregir es baja + fila nueva';
end $$;
