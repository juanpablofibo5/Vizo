-- ===========================================================================
-- Art. 23 Ter 4 — las medidas reforzadas para Grado de Riesgo alto
-- Acuerdo 115/2026, DOF 7-ago-2026 (código 5795797, edición vespertina).
-- Texto oficial: regulatorio/dof/acuerdo-115-2026.doc, SHA-256 19af24b3…
-- Exigible: 1 de marzo de 2027 (Transitorio Cuarto).
-- ===========================================================================
--
--   Encabezado  «En los actos u operaciones que lleven a cabo con Clientes o
--       Usuarias clasificados con GRADO DE RIESGO ALTO […] deberán:»
--
--   Fr. I   Para PERSONAS FÍSICAS:
--       a) «Adoptar MEDIDAS REFORZADAS para conocer el origen y destino de los
--          recursos utilizados en los actos u operaciones.»
--       b) «Obtener, EN SU CASO, los datos señalados en el Capítulo III […] EN
--          LOS TÉRMINOS QUE AL EFECTO PREVEAN EN SU MANUAL DE POLÍTICAS
--          INTERNAS, respecto del CÓNYUGE y DEPENDIENTES ECONÓMICOS […] así
--          como de las SOCIEDADES Y ASOCIACIONES con las que mantenga VÍNCULOS
--          PATRIMONIALES.»
--
--   Fr. II  Para PERSONAS MORALES: «obtener mayor información de sus
--       PRINCIPALES ACCIONISTAS O SOCIOS […] DEBIENDO CONSULTAR para confirmar
--       los datos, los REGISTROS ELECTRÓNICOS DE LA SECRETARÍA DE ECONOMÍA
--       para verificar la información proporcionada por el Cliente o Usuaria.»
--
--   Fr. III Tratándose de PEP EXTRANJERAS: «obtener, además de los datos a que
--       se refiere el presente artículo, la DOCUMENTACIÓN señalada en el
--       Capítulo III […] respecto de las personas físicas señaladas en la
--       fracción I, inciso b).»
--
-- ---------------------------------------------------------------------------
-- CUATRO LECTURAS QUE DECIDEN EL MODELO
-- ---------------------------------------------------------------------------
--
-- 1. LA FRACCIÓN NO SE ELIGE: LA DECIDE LA CLASE DE PERSONA DEL CLIENTE. La I
--    es de físicas y la II de morales, y son excluyentes. Igual que la `via`
--    del Art. 23 Ter 5, se deriva de `clientes_finales.tipo_persona` y no se
--    ofrece como campo: un capturista que pudiera elegir «fracción II» sobre
--    una persona física produciría una fila coherente por fuera e indefendible
--    por dentro.
--
-- 2. EL ARTÍCULO NOMBRA DOS CLASES DE PERSONA Y EL SISTEMA TIENE CUATRO.
--    `tipo_persona` admite además `fideicomiso` y `figura_juridica`, y el Art.
--    23 Ter 4 NO las nombra. No se les inventa una fracción: el enum tiene dos
--    valores y para esos clientes NO SE PUEDE ASENTAR NADA. La pantalla lo
--    dice como hueco y va a POR CONFIRMAR-11. Dejarles asentar «medidas de la
--    fracción II» fabricaría evidencia de cumplir una regla que quizá no
--    existe — que es peor que el hueco.
--
-- 3. LA CONSULTA A LA SECRETARÍA DE ECONOMÍA ES OBLIGATORIA, Y NO LA HACE
--    VIZO. El «debiendo consultar» de la fr. II no admite lectura opcional:
--    sin esa consulta la fracción no está cumplida, y por eso su fecha es
--    `not null` para toda fila de fracción II. Pero la consulta la hace el
--    obligado, no VIZO — automatizarla convertiría a VIZO en quien afirma que
--    los datos coinciden, que es la misma frontera que impide descartar una
--    coincidencia de screening (regla dura 5). VIZO registra que se hizo,
--    cuándo, qué arrojó, y la huella del acuse.
--
-- 4. LA FR. III SE APILA, NO SUSTITUYE: «obtener, ADEMÁS de los datos a que se
--    refiere el presente artículo». Y apunta a las MISMAS personas de la fr. I
--    inciso b), pero subiendo el listón de «los datos» a «la documentación».
--    Por eso las personas vinculadas son una tabla con DOS niveles —datos y
--    documentación— y no dos tablas: es el mismo conjunto de gente visto con
--    dos exigencias distintas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Los tipos
-- ---------------------------------------------------------------------------
create type fraccion_reforzada as enum (
  'fisica',  -- fr. I
  'moral'    -- fr. II
);

-- El vocabulario del inciso b), literal. `concubina_concubinario` va aparte de
-- `conyuge` porque el Art. 23 Quáter ¶3 los distingue al asimilar a PEP, y
-- usar el mismo vocabulario en los dos lados evita traducciones silenciosas.
create type vinculo_reforzado as enum (
  'conyuge',
  'concubina_concubinario',
  'dependiente_economico',
  'sociedad_vinculada',
  'asociacion_vinculada'
);

-- ---------------------------------------------------------------------------
-- 2. Las medidas
-- ---------------------------------------------------------------------------
create table medidas_reforzadas (
  id         uuid primary key default gen_random_uuid(),
  secuencia  bigserial not null,
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  -- La clasificación que las exige, por clave compuesta: citar la evaluación
  -- de otra persona es inexpresable.
  evaluacion_riesgo_id uuid not null,

  fraccion       fraccion_reforzada not null,
  fecha_adopcion date not null,

  -- ── Fr. I a) — solo físicas ──────────────────────────────────────────
  -- El artículo NO define qué es «reforzada». VIZO no lo inventa: registra lo
  -- que el obligado adoptó, con sus palabras.
  medidas_origen_destino text,

  -- ── Fr. I b) — «EN SU CASO», «en los términos que prevean en su Manual» ─
  -- Doblemente condicional, así que no puede ser una exigencia dura. Lo que sí
  -- se exige es que alguien HAYA DECIDIDO: `true` = el Manual lo prevé para
  -- este caso y las personas van abajo; `false` = el Manual no lo prevé, y
  -- entonces la ausencia de personas es una decisión registrada y no un olvido.
  manual_preve_personas_vinculadas boolean,

  -- ── Fr. II — solo morales ────────────────────────────────────────────
  informacion_accionistas text,
  -- «DEBIENDO consultar […] los registros electrónicos de la Secretaría de
  -- Economía». Obligatorio: sin fecha no hay consulta, y sin consulta la
  -- fracción no está cumplida.
  consulta_se_fecha     date,
  consulta_se_resultado text,
  consulta_se_hash_sha256  text,
  consulta_se_archivo      text,
  consulta_se_tamano_bytes bigint,
  consulta_se_mime         text,

  -- ── Fr. III — PEP extranjera ─────────────────────────────────────────
  -- No lo teclea nadie: se deriva de que el cliente tenga un vínculo PEP
  -- catalogado con ámbito `extranjero`. Se guarda porque es un hecho del
  -- momento en que se adoptaron las medidas, y ese hecho puede cambiar.
  aplica_pep_extranjera        boolean not null,
  documentacion_pep_extranjera text,

  respuestas_del_manual jsonb not null default '{}'::jsonb,

  adoptadas_por uuid not null references usuarios(id),
  registrado_en timestamptz not null default now(),

  constraint medidas_citan_evaluacion_del_mismo_cliente
    foreign key (tenant_id, cliente_id, evaluacion_riesgo_id)
    references evaluaciones_riesgo (tenant_id, cliente_id, id),

  -- Cada fracción llena SUS campos y deja vacíos los de la otra. Sin esto, una
  -- fila podría afirmar a la vez medidas de física y consulta a la Secretaría
  -- de Economía, y ninguna de las dos fracciones estaría realmente acreditada.
  constraint fraccion_i_llena_lo_suyo check (
    fraccion <> 'fisica' or (
      medidas_origen_destino is not null
      and length(btrim(medidas_origen_destino)) > 0
      and manual_preve_personas_vinculadas is not null
      and informacion_accionistas is null
      and consulta_se_fecha is null
    )
  ),
  constraint fraccion_ii_llena_lo_suyo check (
    fraccion <> 'moral' or (
      informacion_accionistas is not null
      and length(btrim(informacion_accionistas)) > 0
      -- El «debiendo consultar» hecho inexpresable.
      and consulta_se_fecha is not null
      and consulta_se_resultado is not null
      and length(btrim(consulta_se_resultado)) > 0
      and medidas_origen_destino is null
      and manual_preve_personas_vinculadas is null
    )
  ),

  -- Fr. III: si aplica, la documentación adicional no puede faltar.
  constraint pep_extranjera_exige_documentacion check (
    not aplica_pep_extranjera
    or (documentacion_pep_extranjera is not null
        and length(btrim(documentacion_pep_extranjera)) > 0)
  ),

  constraint consulta_se_hash_es_sha256 check (
    consulta_se_hash_sha256 is null or consulta_se_hash_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint evidencia_de_consulta_completa check (
    (consulta_se_hash_sha256 is null and consulta_se_archivo is null
      and consulta_se_tamano_bytes is null and consulta_se_mime is null)
    or (consulta_se_hash_sha256 is not null and consulta_se_archivo is not null
      and consulta_se_tamano_bytes is not null and consulta_se_mime is not null)
  )
);

comment on table medidas_reforzadas is
  'Art. 23 Ter 4 del Acuerdo 115/2026. Append-only. La fracción se DERIVA de '
  'la clase de persona del cliente y no se elige. El artículo nombra físicas '
  '(fr. I) y morales (fr. II); para fideicomiso y figura jurídica no hay '
  'fracción y no se asienta nada (POR CONFIRMAR-11). La consulta a la '
  'Secretaría de Economía es obligatoria para la fr. II y la hace el obligado: '
  'VIZO registra que se hizo, no la ejecuta.';

create index on medidas_reforzadas (tenant_id, cliente_id, secuencia desc);

-- ---------------------------------------------------------------------------
-- 3. Las personas del inciso b)
-- ---------------------------------------------------------------------------
alter table medidas_reforzadas
  add constraint medidas_reforzadas_tenant_uk unique (tenant_id, id);

create table personas_vinculadas_reforzadas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  medida_id  uuid not null,
  vinculo    vinculo_reforzado not null,
  nombre     text not null,
  -- Fr. I b): «los DATOS señalados en el Capítulo III».
  datos_obtenidos       boolean not null,
  -- Fr. III: «la DOCUMENTACIÓN señalada en el Capítulo III». Es un listón más
  -- alto sobre las mismas personas, no otro conjunto.
  documentacion_obtenida boolean not null default false,
  detalle    text,
  created_at timestamptz not null default now(),

  constraint persona_vinculada_de_la_misma_medida
    foreign key (tenant_id, medida_id) references medidas_reforzadas (tenant_id, id),

  constraint nombre_no_vacio check (length(btrim(nombre)) > 0)
);

comment on table personas_vinculadas_reforzadas is
  'Las personas del Art. 23 Ter 4 fr. I inciso b): cónyuge, concubinato, '
  'dependientes económicos y las sociedades o asociaciones con vínculo '
  'patrimonial. Dos niveles porque el artículo pide dos cosas distintas sobre '
  'la misma gente: los DATOS (fr. I b) y, si es PEP extranjera, la '
  'DOCUMENTACIÓN (fr. III).';

create index on personas_vinculadas_reforzadas (tenant_id, medida_id);

-- ---------------------------------------------------------------------------
-- 4. Append-only
-- ---------------------------------------------------------------------------
create or replace function app.medida_reforzada_append_only()
returns trigger language plpgsql as $$
begin
  raise exception using
    errcode = 'check_violation',
    message = 'Las medidas reforzadas del Art. 23 Ter 4 no se editan ni se borran.',
    hint    = 'Para corregir, adopta y registra medidas nuevas: el historial es la evidencia.';
end $$;

create trigger medidas_append_only
  before update or delete on medidas_reforzadas
  for each row execute function app.medida_reforzada_append_only();

create trigger personas_vinculadas_append_only
  before update or delete on personas_vinculadas_reforzadas
  for each row execute function app.medida_reforzada_append_only();

-- ---------------------------------------------------------------------------
-- 5. La coherencia que la FK no alcanza
-- ---------------------------------------------------------------------------
create or replace function app.medida_reforzada_coherente()
returns trigger language plpgsql as $$
declare
  v_es_alto boolean;
  v_evaluado date;
  v_tipo text;
begin
  select g.es_alto, e.evaluado_en::date into v_es_alto, v_evaluado
    from evaluaciones_riesgo e
    join grados_riesgo g on g.id = e.grado_id
   where e.id = new.evaluacion_riesgo_id;

  if not coalesce(v_es_alto, false) then
    raise exception using
      errcode = 'check_violation',
      message = 'La evaluación citada no clasificó al cliente con Grado de Riesgo alto.',
      hint    = 'El Art. 23 Ter 4 se dispara con el grado alto. Cita la evaluación que lo determinó.';
  end if;

  if new.fecha_adopcion < v_evaluado then
    raise exception using
      errcode = 'check_violation',
      message = 'Las medidas no pueden adoptarse antes de la clasificación que las exige.',
      hint    = format('La evaluación citada es del %s.', v_evaluado);
  end if;

  -- La fracción se deriva de la clase de persona, y aquí se comprueba que
  -- quien la insertó no la haya torcido. La aplicación ya no la ofrece como
  -- campo; esto es la segunda línea, la que no depende de llamar bien.
  select tipo_persona::text into v_tipo from clientes_finales where id = new.cliente_id;
  if v_tipo is distinct from new.fraccion::text then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'La fracción del Art. 23 Ter 4 no corresponde a la clase de persona del cliente (%s).',
        coalesce(v_tipo, 'desconocida')),
      hint = 'La fr. I es de personas físicas y la fr. II de morales. No se elige: se deriva.';
  end if;

  return new;
end $$;

create trigger medida_reforzada_coherente
  after insert on medidas_reforzadas
  for each row execute function app.medida_reforzada_coherente();

-- La fr. III sobre las personas: DIFERIDO, y esta vez sí hace falta.
--
-- Merece la nota porque el cuestionario del Art. 23 Ter 3 lleva el comentario
-- opuesto: allá el diferimiento se copió sin motivo y hubo que quitarlo. Aquí
-- la coherencia depende de filas que se insertan DESPUÉS —las personas
-- vinculadas van tras la medida, en la misma transacción—, así que comprobar
-- en el INSERT diría siempre que faltan.
create or replace function app.fraccion_iii_exige_documentacion()
returns trigger language plpgsql as $$
declare
  v_faltan int;
begin
  if not new.aplica_pep_extranjera then return new; end if;

  select count(*) into v_faltan
    from personas_vinculadas_reforzadas p
   where p.medida_id = new.id and not p.documentacion_obtenida;

  if v_faltan > 0 then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Faltan %s persona(s) vinculada(s) sin la documentación del Capítulo III.', v_faltan),
      hint = 'La fr. III pide, para PEP extranjeras, la DOCUMENTACIÓN de las personas del inciso b), no solo sus datos.';
  end if;
  return new;
end $$;

create constraint trigger fraccion_iii_documentacion
  after insert on medidas_reforzadas
  deferrable initially deferred
  for each row execute function app.fraccion_iii_exige_documentacion();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table medidas_reforzadas              enable row level security;
alter table personas_vinculadas_reforzadas  enable row level security;

create policy "ver las medidas de mi obligado" on medidas_reforzadas
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin adopta las medidas" on medidas_reforzadas
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver las personas vinculadas de mi obligado" on personas_vinculadas_reforzadas
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin registra las personas vinculadas" on personas_vinculadas_reforzadas
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on medidas_reforzadas             to authenticated;
grant select, insert on personas_vinculadas_reforzadas to authenticated;
grant usage, select on sequence medidas_reforzadas_secuencia_seq to authenticated;

select app.verificar_privilegios_por_omision();

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_fisica uuid; v_moral uuid; v_fideicomiso uuid;
  v_modelo uuid; v_alto uuid; v_medio uuid; v_elem uuid;
  v_ev_f uuid; v_ev_m uuid; v_ev_fid uuid; v_ev_media uuid;
  v_med uuid; v_rechazo boolean;
  v_hoy date := date '2027-04-10';
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('MRF270401AB1', 'Aserción medidas reforzadas', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-medidas@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Medidas', 'asercion-medidas@ejemplo.mx');

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant,'fisica','MRAA800101AA1','Física de Aserción','MX') returning id into v_fisica;
  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant,'moral','MRB800101BB2','Moral de Aserción','MX') returning id into v_moral;
  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant,'fideicomiso','MRC800101CC3','Fideicomiso de Aserción','MX') returning id into v_fideicomiso;

  insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
  values (v_tenant,'bajo','Bajo',1,false,0,v_hoy-60);
  insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
  values (v_tenant,'medio','Medio',2,false,35,v_hoy-60) returning id into v_medio;
  insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
  values (v_tenant,'alto','Alto',3,true,70,v_hoy-60) returning id into v_alto;
  insert into modelos_riesgo (tenant_id,version) values (v_tenant,1) returning id into v_modelo;
  select id into v_elem from elementos_riesgo where clave='tipo_cliente';
  insert into factores_modelo (tenant_id,modelo_id,elemento_id,factor,peso)
  values (v_tenant,v_modelo,v_elem,'Aserción',80);
  update modelos_riesgo set estado='vigente', vigente_desde=v_hoy-60,
         aprobado_por=v_user, aprobado_en=now() where id=v_modelo;

  insert into evaluaciones_riesgo (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,evaluado_en,vence)
  values (v_tenant,v_fisica,v_modelo,v_alto,80,'[]'::jsonb,v_user,v_hoy-10,v_hoy+170) returning id into v_ev_f;
  insert into evaluaciones_riesgo (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,evaluado_en,vence)
  values (v_tenant,v_moral,v_modelo,v_alto,80,'[]'::jsonb,v_user,v_hoy-10,v_hoy+170) returning id into v_ev_m;
  insert into evaluaciones_riesgo (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,evaluado_en,vence)
  values (v_tenant,v_fideicomiso,v_modelo,v_alto,80,'[]'::jsonb,v_user,v_hoy-10,v_hoy+170) returning id into v_ev_fid;
  insert into evaluaciones_riesgo (tenant_id,cliente_id,modelo_id,grado_id,puntaje,factores_aplicados,evaluado_por,evaluado_en,vence)
  values (v_tenant,v_fisica,v_modelo,v_medio,40,'[]'::jsonb,v_user,v_hoy-9,v_hoy+171) returning id into v_ev_media;

  -- ── 1. Fr. I completa entra ───────────────────────────────────────────
  insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
    medidas_origen_destino, manual_preve_personas_vinculadas, aplica_pep_extranjera, adoptadas_por)
  values (v_tenant,v_fisica,v_ev_f,'fisica',v_hoy,
    'Se solicitó estado de cuenta de los últimos seis meses y carta del notario.',
    true,false,v_user) returning id into v_med;
  assert v_med is not null, 'ASERCIÓN 1: la fracción I completa no entró';

  insert into personas_vinculadas_reforzadas (tenant_id,medida_id,vinculo,nombre,datos_obtenidos)
  values (v_tenant,v_med,'conyuge','Cónyuge de Aserción',true);

  -- ── 2. Fr. II SIN la consulta a la Secretaría de Economía ─────────────
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      informacion_accionistas, aplica_pep_extranjera, adoptadas_por)
    values (v_tenant,v_moral,v_ev_m,'moral',v_hoy,'Se pidió el libro de accionistas.',false,v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: entró una fracción II sin consultar la Secretaría de Economía';

  -- ── 3. Fr. II completa entra ──────────────────────────────────────────
  insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
    informacion_accionistas, consulta_se_fecha, consulta_se_resultado,
    aplica_pep_extranjera, adoptadas_por)
  values (v_tenant,v_moral,v_ev_m,'moral',v_hoy,'Se pidió el libro de accionistas.',
    v_hoy,'Coinciden los tres socios declarados.',false,v_user);

  -- ── 4. La fracción no corresponde a la clase de persona ───────────────
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      informacion_accionistas, consulta_se_fecha, consulta_se_resultado,
      aplica_pep_extranjera, adoptadas_por)
    values (v_tenant,v_fisica,v_ev_f,'moral',v_hoy,'x',v_hoy,'y',false,v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se asentó la fracción II sobre una persona física';

  -- ── 5. Un fideicomiso no tiene fracción: no hay valor que ponerle ─────
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      medidas_origen_destino, manual_preve_personas_vinculadas, aplica_pep_extranjera, adoptadas_por)
    values (v_tenant,v_fideicomiso,v_ev_fid,'fisica',v_hoy,'x',false,false,v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: un fideicomiso quedó asentado bajo una fracción que no lo nombra';

  -- ── 6. Mezclar campos de las dos fracciones ───────────────────────────
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      medidas_origen_destino, manual_preve_personas_vinculadas,
      informacion_accionistas, aplica_pep_extranjera, adoptadas_por)
    values (v_tenant,v_fisica,v_ev_f,'fisica',v_hoy,'x',true,'accionistas de una física',false,v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: una fila afirmó medidas de las dos fracciones a la vez';

  -- ── 7. Fr. III: PEP extranjera sin la documentación adicional ─────────
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      medidas_origen_destino, manual_preve_personas_vinculadas, aplica_pep_extranjera, adoptadas_por)
    values (v_tenant,v_fisica,v_ev_f,'fisica',v_hoy,'x',true,true,v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: una PEP extranjera quedó sin la documentación del Cap. III';

  -- ── 8. Fr. III: con documentación pero con una persona sin la suya ────
  -- Es la que necesita el trigger DIFERIDO: la persona se inserta después.
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      medidas_origen_destino, manual_preve_personas_vinculadas, aplica_pep_extranjera,
      documentacion_pep_extranjera, adoptadas_por)
    values (v_tenant,v_fisica,v_ev_f,'fisica',v_hoy,'x',true,true,'Pasaporte y comprobante',v_user)
    returning id into v_med;
    insert into personas_vinculadas_reforzadas (tenant_id,medida_id,vinculo,nombre,datos_obtenidos,documentacion_obtenida)
    values (v_tenant,v_med,'dependiente_economico','Hija de Aserción',true,false);
    -- El diferido dispara aquí, no en el INSERT de arriba.
    set constraints fraccion_iii_documentacion immediate;
  exception when check_violation then v_rechazo := true;
  end;
  set constraints all deferred;
  assert v_rechazo, 'ASERCIÓN 8: la fr. III pasó con una persona vinculada sin documentación';

  -- ── 9. Citando una evaluación que no fue alta ─────────────────────────
  v_rechazo := false;
  begin
    insert into medidas_reforzadas (tenant_id,cliente_id,evaluacion_riesgo_id,fraccion,fecha_adopcion,
      medidas_origen_destino, manual_preve_personas_vinculadas, aplica_pep_extranjera, adoptadas_por)
    values (v_tenant,v_fisica,v_ev_media,'fisica',v_hoy,'x',true,false,v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 9: se asentaron medidas sobre una clasificación que no era alta';

  -- ── 10 y 11. Append-only ──────────────────────────────────────────────
  select id into v_med from medidas_reforzadas where cliente_id = v_moral limit 1;
  v_rechazo := false;
  begin
    update medidas_reforzadas set informacion_accionistas = 'otra' where id = v_med;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 10: se editaron medidas ya asentadas';

  v_rechazo := false;
  begin
    delete from medidas_reforzadas where id = v_med;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 11: se borraron medidas ya asentadas';

  raise notice 'Medidas reforzadas del Art. 23 Ter 4: 11 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
