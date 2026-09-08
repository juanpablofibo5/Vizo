-- ===========================================================================
-- Art. 39 Bis fr. I, párrafo final — la coherencia temas↔metodología
-- ===========================================================================
-- Acuerdo 115/2026, DOF 7-ago-2026 (código 5795797, edición vespertina).
-- Texto oficial: regulatorio/dof/acuerdo-115-2026.txt, línea 433, literal:
--
--   «Los temas de la capacitación señalados en esta fracción deben ser
--    coherentes con los resultados de la implementación de la metodología a
--    que se refiere el Capítulo II Quáter de estas reglas y adecuarse a las
--    responsabilidades de los miembros de sus respectivos consejos de
--    administración, administrador único, directivos, funcionarios y, en
--    todo caso de sus empleados.»
--
-- Dos exigencias en una frase, y VIZO no juzga ninguna de las dos —registra
-- el hecho, nunca el contenido—:
--
--   1. «ADECUARSE A LAS RESPONSABILIDADES»: qué papeles cubrió cada sesión.
--      Los nueve papeles ya existen (`rol_capacitacion`, migración
--      20260831100000); lo que faltaba era decir A QUIÉN se dirigió el curso.
--
--   2. «COHERENTES CON LOS RESULTADOS DE LA METODOLOGÍA»: un humano declara
--      que los temas de una sesión son coherentes con lo que arrojó la
--      evaluación de entidad (Cap. II Quáter, `evaluaciones_entidad`,
--      migración 20260829150000) MÁS RECIENTE al momento de declarar. VIZO no
--      puede juzgar coherencia de contenido —es la misma frontera del ADR-21
--      con la metodología ajena—; lo que sí puede hacer es fijar CONTRA QUÉ
--      evaluación se hizo la declaración, con fecha y firma.
--
-- LA DECLARACIÓN ENVEJECE, NO SE INVALIDA. Si después llega una evaluación de
-- entidad nueva, la declaración anterior no se vuelve falsa: sigue siendo
-- cierto que, EN SU MOMENTO, alguien la declaró coherente con la evaluación
-- que existía entonces. Es el mismo criterio del ADR-25 con el cuestionario
-- del Art. 23 Ter 3 —«sobre otra evaluación» es un hecho, «vencida» sería una
-- regla que el artículo no promulga—. Corregirla tampoco es un UPDATE: es
-- volver a declarar (ADR-34, «corrección = nueva declaración»), y por eso la
-- tabla es append-only y la unicidad es por PAR (sesión, evaluación), no por
-- sesión sola.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Contra qué evaluación se ancla: hace falta poder referenciarla por FK
--    compuesta, y hasta hoy `evaluaciones_entidad` no tenía esa llave.
-- ---------------------------------------------------------------------------
alter table evaluaciones_entidad
  add constraint evaluaciones_entidad_tenant_uk unique (tenant_id, id);

-- ---------------------------------------------------------------------------
-- 1. Antes de tocar sesiones_capacitacion: tiene que estar vacía.
-- ---------------------------------------------------------------------------
-- El paso 2 agrega una columna NOT NULL sin default. Eso es seguro únicamente
-- porque hoy no puede haber ninguna fila real: el primer periodo anual es
-- 2027 (Transitorio Séptimo, línea 749 del DOF), `programas_capacitacion`
-- tiene el CHECK `anio_desde_el_primer_periodo (anio >= 2027)`, y
-- `registrarSesion` (src/persistencia/capacitacion.ts) rechaza toda fecha
-- posterior a hoy — nadie pudo haber registrado una sesión impartida antes
-- del 1-ene-2027. Una fila aquí sería un dato que no cuadra con el propio
-- calendario del capítulo, y la regla dura 6 manda morir, no inventarle un
-- `dirigida_a` de relleno. Si el residuo viene de pruebas locales, el remedio
-- es `npx supabase db reset`, no un default en esta migración.
do $$
begin
  assert (select count(*) from sesiones_capacitacion) = 0,
    'sesiones_capacitacion no está vacía: no se puede agregar dirigida_a NOT '
    'NULL sin decidir, fila por fila, a quién se dirigió cada sesión — y '
    'ninguna fila debería existir antes del primer periodo (2027, Transitorio '
    'Séptimo). Si es residuo de pruebas locales, corre `npx supabase db reset`.';
end $$;

-- ---------------------------------------------------------------------------
-- 2. «Adecuarse a las responsabilidades»: a qué papeles se dirigió la sesión
-- ---------------------------------------------------------------------------
alter table sesiones_capacitacion
  add column dirigida_a rol_capacitacion[] not null;

alter table sesiones_capacitacion
  add constraint sesion_declara_a_quien_se_dirige check (cardinality(dirigida_a) > 0);

comment on column sesiones_capacitacion.dirigida_a is
  'A qué papeles del ¶1 se dirigió esta sesión (Art. 39 Bis fr. I párrafo '
  'final, línea 433: «…y adecuarse a las responsabilidades de los miembros '
  'de sus respectivos consejos de administración, administrador único, '
  'directivos, funcionarios y, en todo caso de sus empleados»). Es un HECHO '
  '—a quién se convocó—, nunca un juicio sobre si el contenido de veras '
  'encajó con cada responsabilidad: eso lo decide quien diseña el curso.';

-- ---------------------------------------------------------------------------
-- 3. «Coherentes con los resultados de la metodología»: la declaración
-- ---------------------------------------------------------------------------
create table declaraciones_coherencia (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id),
  sesion_id             uuid not null,
  evaluacion_entidad_id uuid not null,
  declarada_por         uuid not null references usuarios(id),
  created_at            timestamptz not null default now(),

  unique (tenant_id, id),
  foreign key (tenant_id, sesion_id) references sesiones_capacitacion (tenant_id, id),
  foreign key (tenant_id, evaluacion_entidad_id) references evaluaciones_entidad (tenant_id, id),
  -- Re-declarar es una fila nueva, nunca un UPDATE (ADR-34); esta unicidad es
  -- lo que hace que «declarar otra vez contra la MISMA evaluación» no sea
  -- indistinguible de un reintento accidental del formulario.
  constraint una_declaracion_por_sesion_y_evaluacion unique (sesion_id, evaluacion_entidad_id)
);

create index on declaraciones_coherencia (tenant_id, sesion_id, created_at desc);

comment on table declaraciones_coherencia is
  'Declaración humana de que los temas de una sesión (Art. 39 Bis fr. I) son '
  'coherentes con los resultados de la metodología del Cap. II Quáter — la '
  'exigencia del párrafo final de la fr. I, línea 433. VIZO no juzga esa '
  'coherencia: registra que alguien la declaró, y CONTRA CUÁL evaluación de '
  'entidad. Es un hecho firmado que ENVEJECE cuando llega una evaluación '
  'nueva —"sobre otra evaluación", nunca "inválida" (patrón ADR-25)— y que se '
  'SUSTITUYE con una declaración nueva, nunca se corrige en su lugar (ADR-34: '
  '"corrección = nueva declaración"). Por eso es append-only y la unicidad es '
  'por (sesión, evaluación), no por sesión sola.';

-- La declaración solo puede citar la evaluación de entidad MÁS RECIENTE del
-- obligado al momento de insertarse. Es el respaldo de nivel 2 (regla dura 6):
-- la persistencia (`declararCoherencia`) ya selecciona sola la vigente con
-- `order by secuencia desc limit 1`, así que en el camino normal esto nunca
-- dispara — pero un INSERT que se salte esa función, o un error futuro en
-- ella, no debe poder anclar una declaración contra una evaluación vieja.
create or replace function app.declaracion_contra_la_ultima_evaluacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vigente_id uuid;
begin
  -- `public.` calificado a propósito, aunque hoy `declararCoherencia` no
  -- corre dentro de ninguna otra función SECURITY DEFINER: es la lección del
  -- search_path de la semana 5 (ver el comentario en
  -- `app.aprobar_exige_control_resuelto`, migración 20260906100000) — más
  -- barato calificar siempre que confiar en que nadie mueva este trigger a un
  -- camino con search_path restringido.
  select id into v_vigente_id
    from public.evaluaciones_entidad
   where tenant_id = new.tenant_id
   order by secuencia desc
   limit 1;

  if v_vigente_id is null then
    raise exception using
      errcode = 'check_violation',
      message = 'Este obligado todavía no tiene ninguna evaluación de entidad.',
      detail  = 'La coherencia de la fr. I se declara CONTRA algo: sin una evaluación de entidad del Capítulo II Quáter no hay resultado que citar.',
      hint    = 'Corre primero la evaluación de la entidad y vuelve a declarar.';
  end if;

  if new.evaluacion_entidad_id <> v_vigente_id then
    raise exception using
      errcode = 'check_violation',
      message = 'La declaración no cita la evaluación de entidad más reciente de este obligado.',
      detail  = 'Cada declaración se ancla a la evaluación vigente al momento en que se firma (Art. 39 Bis fr. I, línea 433). Si llegó una evaluación nueva, la anterior no se corrige: se declara una nueva contra la vigente.',
      hint    = 'Usa la evaluación de entidad más reciente del obligado.';
  end if;

  return new;
end $$;

create trigger declaracion_contra_la_ultima_evaluacion
  before insert on declaraciones_coherencia
  for each row execute function app.declaracion_contra_la_ultima_evaluacion();

-- Un hecho firmado no se reescribe ni se borra: se sustituye con una fila
-- nueva (ADR-34). Mismo trigger que usa evaluaciones_entidad.
create trigger declaraciones_coherencia_append_only
  before update or delete on declaraciones_coherencia
  for each row execute function app.prohibir_mutacion();

create trigger declaraciones_coherencia_sin_truncate
  before truncate on declaraciones_coherencia
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 4. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table declaraciones_coherencia enable row level security;

create policy "ver las declaraciones de coherencia de mi obligado" on declaraciones_coherencia
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin declara la coherencia de una sesión" on declaraciones_coherencia
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on declaraciones_coherencia to authenticated;
revoke truncate, trigger, references, maintain on declaraciones_coherencia from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('declaraciones_coherencia','authenticated','INSERT',null,
   'Declarar que los temas de una sesión son coherentes con la evaluación de entidad vigente (Art. 39 Bis fr. I, línea 433). Append-only: nunca UPDATE ni DELETE — corregir es declarar de nuevo (ADR-34)')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_otro_tenant uuid; v_user uuid; v_otro_user uuid;
  v_bajo uuid; v_medio uuid; v_alto uuid; v_elem uuid;
  v_modelo uuid; v_prog uuid; v_sesion uuid; v_sesion_otro uuid;
  v_eval1 uuid; v_eval2 uuid; v_decl uuid;
  v_rechazo boolean; v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('COH270301AB1', 'Aserción coherencia', 'moral') returning id into v_tenant;
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('COH270301CD2', 'Otro obligado', 'moral') returning id into v_otro_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-coh@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Coherencia', 'asercion-coh@ejemplo.mx');

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-coh-otro@ejemplo.mx') returning id into v_otro_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_otro_user, v_otro_tenant, 'admin', 'Aserción Otro', 'asercion-coh-otro@ejemplo.mx');

  -- ── 1. Una sesión sin ningún papel destinatario ────────────────────────
  insert into programas_capacitacion (tenant_id, anio) values (v_tenant, 2027) returning id into v_prog;
  v_rechazo := false;
  begin
    insert into sesiones_capacitacion
      (tenant_id, programa_id, titulo, fecha, temas, dirigida_a, instructor_nombre,
       instructor_anios_experiencia, registrado_por)
    values (v_tenant, v_prog, 'Sin destinatarios', date '2027-03-01',
            '{marco_normativo}'::tema_capacitacion[], '{}'::rol_capacitacion[],
            'Instructora', 8, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: entró una sesión que no dice a quién se dirigió';

  insert into sesiones_capacitacion
    (tenant_id, programa_id, titulo, fecha, temas, dirigida_a, instructor_nombre,
     instructor_anios_experiencia, registrado_por)
  values (v_tenant, v_prog, 'Marco normativo', date '2027-03-01',
          '{marco_normativo}'::tema_capacitacion[],
          '{rec,atencion_publico}'::rol_capacitacion[],
          'Instructora Acreditada', 8, v_user)
  returning id into v_sesion;
  assert v_sesion is not null, 'ASERCIÓN 1b: la sesión con dirigida_a válida no entró';

  -- ── 2. Declarar sin ninguna evaluación de entidad ──────────────────────
  v_rechazo := false;
  begin
    insert into declaraciones_coherencia (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
    values (v_tenant, v_sesion, gen_random_uuid(), v_user);
  exception when check_violation or foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: se declaró coherencia sin ninguna evaluación de entidad';

  -- ── 3. El camino feliz: declarar contra la evaluación vigente ──────────
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo',  'Bajo',  1, false, 0,  date '2027-03-01') returning id into v_bajo;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, date '2027-03-01') returning id into v_medio;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto',  'Alto',  3, true,  70, date '2027-03-01') returning id into v_alto;
  insert into modelos_riesgo (tenant_id, version, metodo_medicion, metodo_entidad)
  values (v_tenant, 1, 'suma_ponderada', 'residual_por_elemento') returning id into v_modelo;

  -- Un modelo solo se vuelve vigente con al menos un factor configurado
  -- (`app.modelo_riesgo_activable`); sin eso la evaluación de entidad no
  -- tendría contra qué modelo anclarse.
  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Factor de aserción', 10);
  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  insert into evaluaciones_entidad
    (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
     total_clientes, total_operaciones, monto_operado_centavos,
     riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id,
     detalle, evaluado_por, vence)
  values
    (v_tenant, v_modelo, 'anio_completo', date '2026-01-01', date '2026-12-31',
     120, 350, 5000000000, 100, 20, 80, v_alto,
     '{"metodo":"residual_por_elemento"}'::jsonb, v_user,
     (current_date + interval '12 months')::date)
  returning id into v_eval1;

  insert into declaraciones_coherencia (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
  values (v_tenant, v_sesion, v_eval1, v_user)
  returning id into v_decl;
  assert v_decl is not null, 'ASERCIÓN 3: la declaración contra la evaluación vigente no entró';

  -- ── 4. Declarar contra una evaluación que YA NO es la más reciente ─────
  insert into evaluaciones_entidad
    (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
     total_clientes, total_operaciones, monto_operado_centavos,
     riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id,
     detalle, evaluado_por, vence)
  values
    (v_tenant, v_modelo, 'anio_completo', date '2027-01-01', date '2027-12-31',
     130, 400, 6000000000, 90, 30, 60, v_medio,
     '{"metodo":"residual_por_elemento"}'::jsonb, v_user,
     (current_date + interval '12 months')::date)
  returning id into v_eval2;

  v_rechazo := false;
  begin
    insert into declaraciones_coherencia (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
    values (v_tenant, v_sesion, v_eval1, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se declaró coherencia contra una evaluación que ya no es la vigente';

  -- Contra la NUEVA vigente sí entra: es la fila nueva del ADR-34, no una corrección de la anterior.
  insert into declaraciones_coherencia (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
  values (v_tenant, v_sesion, v_eval2, v_user);

  -- ── 5. Dos declaraciones contra la MISMA evaluación, de la misma sesión ─
  v_rechazo := false;
  begin
    insert into declaraciones_coherencia (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
    values (v_tenant, v_sesion, v_eval2, v_user);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se repitió una declaración contra la misma evaluación';

  -- ── 6. Una declaración no se edita ni se borra ──────────────────────────
  v_rechazo := false;
  begin
    update declaraciones_coherencia set evaluacion_entidad_id = v_eval2 where id = v_decl;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: se reescribió una declaración de coherencia';

  v_rechazo := false;
  begin
    delete from declaraciones_coherencia where id = v_decl;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se borró una declaración de coherencia';

  -- ── 8. Una declaración no cuelga de la sesión de OTRO obligado ─────────
  insert into programas_capacitacion (tenant_id, anio) values (v_otro_tenant, 2027) returning id into v_prog;
  insert into sesiones_capacitacion
    (tenant_id, programa_id, titulo, fecha, temas, dirigida_a, instructor_nombre,
     instructor_anios_experiencia, registrado_por)
  values (v_otro_tenant, v_prog, 'Ajena', date '2027-03-01',
          '{marco_normativo}'::tema_capacitacion[], '{rec}'::rol_capacitacion[],
          'X', 8, v_otro_user)
  returning id into v_sesion_otro;

  v_rechazo := false;
  begin
    insert into declaraciones_coherencia (tenant_id, sesion_id, evaluacion_entidad_id, declarada_por)
    values (v_tenant, v_sesion_otro, v_eval2, v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: una declaración citó la sesión de otro obligado';

  -- ── 9. La base sigue cuadrando con el inventario de privilegios ────────
  select string_agg(tabla || ': ' || problema, ' · ')
    into v_problemas from app.verificar_privilegios_declarados();
  assert v_problemas is null, 'ASERCIÓN 9: privilegios sin declarar: ' || coalesce(v_problemas, '');
  perform 1 from app.verificar_privilegios_por_omision() limit 1;
  assert not found, 'ASERCIÓN 9b: privilegios por omisión pendientes';

  raise notice 'Coherencia temas↔metodología (Art. 39 Bis fr. I, línea 433): 10 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
