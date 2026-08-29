-- ===========================================================================
-- El conector de screening: las listas como catálogo, la consulta como acto
-- ===========================================================================
--
-- Decisión de JP (Q3 del cuestionario de cierre, issue #34): las CUATRO listas
-- públicas al sprint — OFAC SDN, la consolidada del Consejo de Seguridad de la
-- ONU, el Art. 69-B del CFF y la Lista de Personas Bloqueadas — y PEP como
-- dependencia comercial aparte que no se vende hasta existir. «Es table
-- stakes, no diferenciador: un piloto sin screening no es comparable contra el
-- incumbente.»
--
-- El esqueleto esperaba desde la migración 001: consultas_screening con la
-- resolución humana garantizada por CHECK, el enum de alertas con 'screening'
-- y alertas.consulta_screening_id. Activarlo es esto: las listas versionadas
-- como catálogo GLOBAL, el matching, y los guardias que vuelven inexpresable
-- lo que la regla dura 5 prohíbe.
--
-- CUATRO DECISIONES DE FORMA (ADR-30):
--
-- 1. LAS LISTAS SON CATÁLOGO GLOBAL Y VERSIONADO. Cada descarga es una fila
--    nueva con fecha, hash del archivo fuente y conteo; la vigente es la más
--    reciente por clave. La consulta SNAPSHOTEA qué versión de cada lista usó
--    — sin eso, una consulta vieja no es defendible (el comentario original
--    del esqueleto).
--
-- 2. EL MATCHING DETECTA DE MÁS Y RESUELVE EL HUMANO. Nombre normalizado
--    (mayúsculas, sin acentos, sin puntuación) con similitud de trigramas
--    sobre un umbral del catálogo, más RFC exacto donde la lista lo trae
--    (69-B). El umbral es un parámetro OPERATIVO, no normativo, y su fuente
--    lo dice con todas sus letras.
--
-- 3. LA RESOLUCIÓN ES UN ACTO IRREVERSIBLE CON RAZONAMIENTO. Nace pendiente
--    por trigger; pasa a confirmada o descartada UNA vez, con quién, cuándo y
--    por qué; nunca regresa. Descartar sin razonamiento es inexpresable — esa
--    evidencia es lo que se presenta si la autoridad pregunta por qué se operó
--    con esa persona.
--
-- 4. SIN LAS CUATRO LISTAS VIGENTES, LA CONSULTA SE DETIENE (regla dura 6, en
--    la persistencia): consultar contra dos listas y decir «sin coincidencias»
--    produciría el silencio más caro del producto.

-- ---------------------------------------------------------------------------
-- 0. Extensiones: trigramas y acentos
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() es STABLE y una columna generada exige IMMUTABLE. El envoltorio
-- fija el diccionario y con él la inmutabilidad práctica — el truco estándar.
create or replace function app.sin_acentos(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, t) $$;

comment on function app.sin_acentos(text) is
  'unaccent con diccionario fijo, marcada immutable para poder vivir en una columna generada e índices.';

-- La normalización ÚNICA de nombres para SCREENING (distinta de
-- app.normalizar_nombre, que es de la resolución de identidad de la semana 4
-- y tiene sus propios dependientes): mayúsculas, sin acentos,
-- todo lo que no sea letra o dígito se vuelve espacio, espacios colapsados.
-- Vive en la base y el TypeScript la refleja — si divergen, el matching miente.
create or replace function app.normalizar_para_screening(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(upper(app.sin_acentos(coalesce(t, ''))), '[^A-Z0-9 ]', ' ', 'g'),
           ' +', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- 1. Las listas, versionadas
-- ---------------------------------------------------------------------------
create table listas_screening (
  id            uuid primary key default gen_random_uuid(),
  -- ofac_sdn · onu · sat_69b · lpb — y las que vengan. Sin CHECK: qué listas
  -- se EXIGEN vigentes lo decide el catálogo de la persistencia, no el DDL.
  clave         text not null,
  nombre        text not null,
  -- De dónde se descargó el archivo, para poder volver a la fuente.
  fuente_url    text not null,
  descargada_en timestamptz not null,
  hash_sha256   char(64) not null,
  registros     int not null,
  created_at    timestamptz not null default now(),

  constraint lista_hash_es_sha256_hex check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  constraint lista_con_registros check (registros > 0),
  constraint lista_clave_no_vacia check (length(btrim(clave)) > 0)
);

comment on table listas_screening is
  'Cada fila es UNA DESCARGA de una lista de control, con fecha, hash del '
  'archivo fuente y conteo. La vigente es la más reciente por clave. Catálogo '
  'global: las listas son públicas y las carga el backoffice (runbook 06) con '
  'el rol administrativo — la aplicación solo las lee.';

create index on listas_screening (clave, descargada_en desc);

create table entradas_lista (
  id        uuid primary key default gen_random_uuid(),
  lista_id  uuid not null references listas_screening(id),
  -- individual | entity | vessel | aircraft… tal como la fuente lo diga.
  tipo      text,
  nombre    text not null,
  nombre_normalizado text generated always as (app.normalizar_para_screening(nombre)) stored,
  -- Donde la fuente lo trae (69-B), para el match exacto. Ya en mayúsculas.
  rfc       text,
  datos     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint entrada_nombre_no_vacio check (length(btrim(nombre)) > 0)
);

comment on table entradas_lista is
  'Los registros de cada versión de lista. nombre_normalizado sale de '
  'app.normalizar_para_screening — la MISMA función que normaliza el nombre '
  'consultado, porque dos normalizaciones distintas hacen mentir al matching.';

create index on entradas_lista (lista_id);
create index entradas_lista_nombre_trgm
  on entradas_lista using gin (nombre_normalizado extensions.gin_trgm_ops);
create index on entradas_lista (rfc) where rfc is not null;

insert into app.tablas_globales (tabla, motivo) values
  ('listas_screening', 'catálogo global: las listas de control son públicas y compartidas por todos los obligados'),
  ('entradas_lista',   'catálogo global: los registros de cada versión de lista');

-- ---------------------------------------------------------------------------
-- 2. El umbral, como parámetro OPERATIVO que dice lo que es
-- ---------------------------------------------------------------------------
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'umbral_similitud_screening', '0.6'::jsonb,
   'Similitud de trigramas mínima para reportar una coincidencia de nombre en screening. Bajarlo detecta más y carga al humano; subirlo omite.',
   date '2026-08-29',
   'Parámetro OPERATIVO de VIZO (ADR-30) — no proviene de ninguna norma. El criterio de diseño es detectar de más y que la resolución humana decida (regla dura 5): el costo de una coincidencia de más es una revisión; el de una de menos, operar con una persona listada. Cambiarlo es una decisión que queda versionada aquí.');

-- ---------------------------------------------------------------------------
-- 3. La consulta nace pendiente y se resuelve UNA vez, con razonamiento
-- ---------------------------------------------------------------------------
alter table consultas_screening add constraint consultas_screening_tenant_id_unica unique (tenant_id, id);

create or replace function app.consulta_screening_nace_pendiente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.resolucion <> 'pendiente' or new.resuelto_por is not null or new.resuelto_en is not null then
    raise exception
      'Una consulta de screening nace pendiente. Registrarla ya resuelta sería decidir sin que nadie haya mirado — exactamente lo que la regla dura 5 prohíbe.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger consulta_screening_nace_pendiente
  before insert on consultas_screening
  for each row execute function app.consulta_screening_nace_pendiente();

create or replace function app.resolucion_screening_valida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lo único que puede cambiar en una consulta asentada es su resolución.
  if new.tenant_id is distinct from old.tenant_id
     or new.sujeto_tipo is distinct from old.sujeto_tipo
     or new.sujeto_id is distinct from old.sujeto_id
     or new.listas_consultadas is distinct from old.listas_consultadas
     or new.coincidencias is distinct from old.coincidencias
     or new.resultado is distinct from old.resultado
     or new.created_at is distinct from old.created_at then
    raise exception
      'La evidencia de una consulta de screening no se toca: qué se consultó, contra qué versiones y qué se encontró quedó asentado. Solo la resolución cambia, una vez.'
      using errcode = 'check_violation';
  end if;

  if old.resolucion <> 'pendiente' then
    raise exception
      'Esta consulta ya fue resuelta (%). Una resolución no se revierte ni se corrige: si el criterio cambió, se consulta de nuevo y se resuelve la nueva.',
      old.resolucion
      using errcode = 'check_violation';
  end if;

  if new.resolucion = 'pendiente' then
    return new; -- sin cambio real
  end if;

  if old.resultado <> 'coincidencia' then
    raise exception
      'Una consulta sin coincidencias no se «resuelve»: no hay nada que confirmar ni descartar. Su evidencia ya está completa.'
      using errcode = 'check_violation';
  end if;

  if new.razonamiento is null or length(btrim(new.razonamiento)) < 15 then
    raise exception
      'Resolver una coincidencia exige el razonamiento escrito (¿por qué es —o no es— la persona listada?). Es la evidencia que se presenta si la autoridad pregunta por qué se operó.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger resolucion_screening_valida
  before update on consultas_screening
  for each row execute function app.resolucion_screening_valida();

-- ---------------------------------------------------------------------------
-- 4. La alerta de screening nombra su consulta
-- ---------------------------------------------------------------------------
alter table alertas
  add constraint alertas_consulta_screening_fk
  foreign key (tenant_id, consulta_screening_id)
  references consultas_screening (tenant_id, id);

alter table alertas
  add constraint screening_nombra_su_consulta
  check (tipo <> 'screening' or consulta_screening_id is not null);

-- ---------------------------------------------------------------------------
-- 5. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table listas_screening enable row level security;
alter table entradas_lista   enable row level security;

create policy "las listas de control las lee cualquiera con sesión" on listas_screening
  for select to authenticated using (true);
create policy "las entradas de lista las lee cualquiera con sesión" on entradas_lista
  for select to authenticated using (true);

grant select on listas_screening to authenticated;
grant select on entradas_lista   to authenticated;

-- La consulta la registra quien captura; la resolución la firma un admin.
create policy "registrar la consulta de screening" on consultas_screening
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy "admin resuelve la coincidencia" on consultas_screening
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant insert on consultas_screening to authenticated;
grant update (resolucion, razonamiento, resuelto_por, resuelto_en)
  on consultas_screening to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('consultas_screening','authenticated','INSERT',null,
   'registrar cada consulta con su snapshot de listas — sin coincidencia también es evidencia'),
  ('consultas_screening','authenticated','UPDATE','resolucion',
   'POR COLUMNA: la resolución humana, una sola vez (regla dura 5)'),
  ('consultas_screening','authenticated','UPDATE','razonamiento',
   'POR COLUMNA: el porqué escrito de la resolución'),
  ('consultas_screening','authenticated','UPDATE','resuelto_por',
   'POR COLUMNA: quién resolvió'),
  ('consultas_screening','authenticated','UPDATE','resuelto_en',
   'POR COLUMNA: cuándo se resolvió');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_lista uuid; v_consulta uuid;
  v_rechazo boolean; v_problemas text; v_score real; v_norm text;
begin
  -- 0. La normalización hace lo que promete.
  v_norm := app.normalizar_para_screening('  José   Ángel López-Gómez, S.A. de C.V. ');
  assert v_norm = 'JOSE ANGEL LOPEZ GOMEZ S A DE C V',
    'ASERCIÓN 0: la normalización devolvió «' || v_norm || '»';

  insert into tenants (rfc, razon_social, tipo_persona)
  values ('SCR270301AB1', 'Aserción screening', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-screening@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Screening', 'asercion-screening@ejemplo.mx');
  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'SCRC010101AAA', 'Cliente Screening', 'MX') returning id into v_cliente;

  insert into listas_screening (clave, nombre, fuente_url, descargada_en, hash_sha256, registros)
  values ('ofac_sdn', 'OFAC SDN', 'https://ejemplo/sdn.csv', now(), repeat('a', 64), 2)
  returning id into v_lista;
  insert into entradas_lista (lista_id, tipo, nombre, rfc)
  values (v_lista, 'individual', 'José Ángel López Gómez', null),
         (v_lista, 'entity', 'Empresa Fachada SA', 'EFA010101AAA');

  -- 1. El match por similitud encuentra la variante sin acentos e incompleta.
  select extensions.similarity(nombre_normalizado, app.normalizar_para_screening('Jose Lopez Gomez'))
    into v_score from entradas_lista
   where lista_id = v_lista and tipo = 'individual';
  assert v_score >= 0.6, 'ASERCIÓN 1: la similitud fue ' || v_score::text || ' y el umbral operativo es 0.6';

  -- 2. Una consulta no nace resuelta.
  v_rechazo := false;
  begin
    insert into consultas_screening
      (tenant_id, sujeto_tipo, sujeto_id, listas_consultadas, coincidencias, resultado,
       resolucion, resuelto_por, resuelto_en, razonamiento)
    values (v_tenant, 'cliente', v_cliente, '{}'::jsonb, '[]'::jsonb, 'coincidencia',
            'descartada', v_user, now(), 'Porque sí.');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: una consulta nació ya descartada, sin que nadie mirara';

  insert into consultas_screening
    (tenant_id, sujeto_tipo, sujeto_id, listas_consultadas, coincidencias, resultado)
  values (v_tenant, 'cliente', v_cliente,
          jsonb_build_object('ofac_sdn', jsonb_build_object('lista_id', v_lista)),
          '[{"lista":"ofac_sdn","criterio":"nombre"}]'::jsonb, 'coincidencia')
  returning id into v_consulta;

  -- 3. La alerta de screening exige nombrar su consulta.
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, titulo) values (v_tenant, 'screening', 'Sin consulta');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: entró una alerta de screening sin consulta que la respalde';

  insert into alertas (tenant_id, tipo, titulo, consulta_screening_id)
  values (v_tenant, 'screening', 'Coincidencia en listas de control', v_consulta);

  -- 4. Descartar sin razonamiento es inexpresable.
  v_rechazo := false;
  begin
    update consultas_screening
       set resolucion = 'descartada', resuelto_por = v_user, resuelto_en = now()
     where id = v_consulta;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se descartó una coincidencia sin razonamiento (regla dura 5)';

  -- 5. La evidencia de la consulta no se toca.
  v_rechazo := false;
  begin
    update consultas_screening set coincidencias = '[]'::jsonb where id = v_consulta;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se editaron las coincidencias de una consulta asentada';

  -- El camino bueno: descartada con razonamiento, una vez.
  update consultas_screening
     set resolucion = 'descartada', resuelto_por = v_user, resuelto_en = now(),
         razonamiento = 'Homónimo: la fecha de nacimiento y la nacionalidad no corresponden con la entrada de la lista.'
   where id = v_consulta;

  -- 6. Y no se revierte ni se re-resuelve.
  v_rechazo := false;
  begin
    update consultas_screening set resolucion = 'confirmada',
           razonamiento = 'Cambio de opinión.', resuelto_por = v_user, resuelto_en = now()
     where id = v_consulta;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: una resolución asentada se cambió después';

  -- 7. La base sigue cuadrando con el inventario.
  select string_agg(tabla || ': ' || problema, ' · ')
    into v_problemas from app.verificar_privilegios_declarados();
  assert v_problemas is null, 'ASERCIÓN 7: privilegios sin declarar: ' || coalesce(v_problemas, '');
  perform 1 from app.verificar_privilegios_por_omision() limit 1;
  assert not found, 'ASERCIÓN 7b: privilegios por omisión pendientes';

  raise notice '✓ Screening: normalización única, match por trigramas, consulta que nace pendiente, resolución humana única con razonamiento, alerta que nombra su consulta';
end $$;
