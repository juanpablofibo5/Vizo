-- ===========================================================================
-- Cap. XII — Capacitación y selección de personal (Arts. 39 Bis y 39 Bis 1)
-- Acuerdo 115/2026, DOF 7-ago-2026 (código 5795797, edición vespertina).
-- Texto oficial: regulatorio/dof/acuerdo-115-2026.doc, SHA-256 19af24b3…
--
-- EXIGIBLE ANTES QUE TODO EL LOTE DE MARZO. Transitorio Séptimo, literal:
--   «El primer periodo anual de capacitación a que se refiere el artículo 39
--    Bis de estas reglas, comprenderá del primero de enero al treinta y uno de
--    diciembre de dos mil veintisiete.»
-- ===========================================================================
--
-- QUÉ PIDE EL CAPÍTULO
--
--   39 Bis ¶1  A QUIÉN: «los miembros de sus respectivos consejos de
--       administración, al administrador único o su equivalente, directivos,
--       funcionarios, a la persona Representante Encargada de Cumplimiento y,
--       EN TODO CASO, a sus empleados que laboren en áreas de atención al
--       público, participen en la identificación o conocimiento del Cliente o
--       Usuaria, en el envío de Avisos o realice actividades de auditoría.»
--
--   fr. I   Cursos «POR LO MENOS UNA VEZ AL AÑO», con contenido mínimo en
--       cuatro incisos: a) la Ley, su Reglamento, estas reglas y las
--       Resoluciones de formatos; b) su Manual de Políticas Internas; c) los
--       actos u operaciones del Art. 17; d) los Riesgos a que está expuesto.
--       Y los temas «deben ser COHERENTES CON LOS RESULTADOS de la
--       implementación de la metodología del Capítulo II Quáter».
--
--   fr. II  Técnicas, métodos y tendencias del Art. 400 Bis del CPF.
--
--   fr. III Quien imparta «deberá contar y ACREDITAR EXPERIENCIA de por lo
--       menos cinco años» en la materia.
--
--   39 Bis 1 ¶1  Conservar DIEZ AÑOS la evidencia: programas, talleres,
--       materiales, listas de asistencia, evaluaciones y constancias.
--   39 Bis 1 ¶2  Para expedir constancia hay que PRACTICAR EVALUACIONES, y el
--       Manual dice qué se hace con quien no obtenga resultado satisfactorio.
--   39 Bis 1 ¶3  Quien entre a atención al público o administración de
--       recursos se capacita PREVIA O SIMULTÁNEAMENTE a su ingreso.
--
-- ---------------------------------------------------------------------------
-- CUATRO DECISIONES
-- ---------------------------------------------------------------------------
--
-- 1. LA PLANTILLA OBLIGADA NO ES LA LISTA DE USUARIOS DEL PORTAL. `usuarios`
--    tiene dos roles —`admin` y `capturista`— que son de la APLICACIÓN. El
--    Art. 39 Bis nombra nueve papeles de la ORGANIZACIÓN, y varios no tocan
--    VIZO nunca: el consejo de administración no entra al portal, y un
--    empleado de atención al público puede no tener cuenta. Modelar la
--    capacitación sobre `usuarios` habría dejado fuera precisamente a quienes
--    el ¶1 nombra primero. Por eso `personas_capacitables` es su propia
--    plantilla, con un enlace OPCIONAL a `usuarios` para quien sí tenga cuenta.
--
-- 2. LOS DOS NÚMEROS DEL CAPÍTULO VAN AL CATÁLOGO, NO A UN CHECK. «Por lo
--    menos una vez al año» y «por lo menos cinco años» de experiencia son
--    umbrales regulatorios, y la regla dura 1 dice dónde viven esos: en
--    `parametros_motor`, versionados por vigencia y con su fuente. Escribir
--    `>= 5` en un CHECK habría sido cómodo hoy y una migración el día que la
--    autoridad lo mueva.
--
-- 3. VIZO NO IMPARTE LA CAPACITACIÓN NI ACREDITA AL CAPACITADOR. La fr. III
--    pide que quien imparta «cuente Y ACREDITE» cinco años. VIZO no puede
--    verificar una trayectoria: registra quién impartió, cuántos años declara
--    y la huella del documento que lo acredita. Es la misma frontera del acuse
--    del SPPLD y de la consulta a la Secretaría de Economía.
--
-- 4. LA CONSTANCIA SIN EVALUACIÓN ES INEXPRESABLE. El ¶2 del 39 Bis 1 ata una
--    a la otra sin margen: «PARA EXPEDIR las constancias […] deberán
--    practicarles […] evaluaciones». Una constancia sin evaluación registrada
--    sería evidencia de haber cumplido algo que el texto condiciona.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Los dos plazos, al catálogo (regla dura 1)
-- ---------------------------------------------------------------------------
insert into parametros_motor (clave, valor, actividad_id, vigente_desde, fuente)
values
  ('capacitacion_periodicidad_meses', to_jsonb(12), null, date '2027-01-01',
   'Art. 39 Bis fr. I del Acuerdo 115/2026: cursos «por lo menos una vez al año». '
   'El primer periodo va del 1-ene al 31-dic-2027 (Transitorio Séptimo).'),
  ('capacitacion_experiencia_minima_anios', to_jsonb(5), null, date '2027-01-01',
   'Art. 39 Bis fr. III del Acuerdo 115/2026: quien imparta «deberá contar y '
   'acreditar experiencia de por lo menos cinco años».'),
  ('capacitacion_retencion_anios', to_jsonb(10), null, date '2027-01-01',
   'Art. 39 Bis 1 ¶1 del Acuerdo 115/2026: conservar la evidencia «durante un '
   'plazo mínimo de diez años».');

-- ---------------------------------------------------------------------------
-- 2. Los papeles que el ¶1 nombra, literales
-- ---------------------------------------------------------------------------
-- El ¶1 tiene DOS grupos y el enum los conserva separados por su comentario:
-- el órgano de gobierno y la dirección, y después los empleados que el texto
-- alcanza «en todo caso» por la función que desempeñan.
create type rol_capacitacion as enum (
  -- Primer grupo: gobierno y dirección.
  'consejo_administracion',
  'administrador_unico',
  'directivo',
  'funcionario',
  'rec',
  -- Segundo grupo, «y, EN TODO CASO, a sus empleados que…»
  'atencion_publico',
  'identificacion_cliente',
  'envio_avisos',
  'auditoria'
);

-- Los temas mínimos. Los cuatro incisos de la fr. I más la fr. II: son del
-- artículo, no del obligado, y por eso son un enum y no una tabla configurable.
create type tema_capacitacion as enum (
  'marco_normativo',      -- fr. I a) Ley, Reglamento, reglas y Resoluciones
  'manual_politicas',     -- fr. I b) su Manual de Políticas Internas
  'actos_articulo_17',    -- fr. I c) los actos u operaciones del Art. 17
  'riesgos_del_obligado', -- fr. I d) los Riesgos a que está expuesto
  'tecnicas_400_bis'      -- fr. II  técnicas y tendencias del Art. 400 Bis CPF
);

-- ---------------------------------------------------------------------------
-- 3. La plantilla obligada a capacitarse
-- ---------------------------------------------------------------------------
create table personas_capacitables (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  nombre     text not null,
  rol        rol_capacitacion not null,

  -- Enlace OPCIONAL: el consejo de administración no entra al portal, y un
  -- empleado de atención al público puede no tener cuenta. Que sea opcional es
  -- justamente lo que permite que la plantilla sea la del artículo y no la de
  -- la aplicación.
  usuario_id uuid references usuarios(id),

  -- El ¶3 del 39 Bis 1 ata la capacitación al INGRESO al área, no al alta en
  -- el sistema: «de manera previa o simultánea a su ingreso o al inicio de sus
  -- actividades en dichas áreas».
  ingreso_al_area date not null,
  baja_del_area   date,

  created_at timestamptz not null default now(),

  constraint personas_tenant_uk unique (tenant_id, id),
  constraint nombre_de_persona_no_vacio check (length(btrim(nombre)) > 0),
  constraint baja_no_precede_al_ingreso check (baja_del_area is null or baja_del_area >= ingreso_al_area)
);

comment on table personas_capacitables is
  'La plantilla que el Art. 39 Bis ¶1 obliga a capacitar. NO es la lista de '
  'usuarios del portal: el consejo de administración no entra a VIZO y un '
  'empleado de atención al público puede no tener cuenta. El enlace a '
  'usuarios es opcional a propósito.';

create index on personas_capacitables (tenant_id, rol);

-- ---------------------------------------------------------------------------
-- 4. El programa anual
-- ---------------------------------------------------------------------------
create table programas_capacitacion (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  -- El periodo del Transitorio Séptimo: año calendario completo.
  anio       int not null,
  descripcion text,
  created_at timestamptz not null default now(),

  constraint programas_tenant_uk unique (tenant_id, id),
  constraint un_programa_por_anio unique (tenant_id, anio),
  -- Antes de 2027 no hay periodo que cumplir: el Transitorio Séptimo fija el
  -- primero. Un programa de 2025 no acreditaría nada.
  constraint anio_desde_el_primer_periodo check (anio >= 2027)
);

comment on table programas_capacitacion is
  'El programa anual del Art. 39 Bis. Un año por obligado; el primer periodo '
  'es 2027 completo (Transitorio Séptimo).';

-- ---------------------------------------------------------------------------
-- 5. Las sesiones impartidas
-- ---------------------------------------------------------------------------
create table sesiones_capacitacion (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  programa_id uuid not null,
  titulo      text not null,
  fecha       date not null,

  -- fr. I y II: qué temas cubrió esta sesión. Un curso puede cubrir varios; lo
  -- que el programa del año tiene que cubrir son los cinco.
  temas       tema_capacitacion[] not null,

  -- fr. III. VIZO no verifica la trayectoria: registra lo declarado y la
  -- huella del documento que la acredita. Los años se contrastan contra el
  -- catálogo, no contra un número escrito aquí.
  instructor_nombre       text not null,
  instructor_anios_experiencia int not null,
  instructor_acredita_hash text,
  instructor_acredita_archivo text,

  -- 39 Bis 1 ¶1: los materiales son parte de la evidencia a conservar.
  material_hash    text,
  material_archivo text,

  registrado_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint sesion_del_mismo_obligado
    foreign key (tenant_id, programa_id) references programas_capacitacion (tenant_id, id),

  constraint sesiones_tenant_uk unique (tenant_id, id),
  constraint titulo_de_sesion_no_vacio check (length(btrim(titulo)) > 0),
  constraint instructor_con_nombre check (length(btrim(instructor_nombre)) > 0),
  constraint anios_de_experiencia_no_negativos check (instructor_anios_experiencia >= 0),
  -- Una sesión sin ningún tema no acredita ninguna fracción.
  constraint sesion_cubre_algun_tema check (cardinality(temas) > 0),
  constraint hash_de_acreditacion_es_sha256 check (
    instructor_acredita_hash is null or instructor_acredita_hash ~ '^[0-9a-f]{64}$'),
  constraint hash_de_material_es_sha256 check (
    material_hash is null or material_hash ~ '^[0-9a-f]{64}$')
);

comment on table sesiones_capacitacion is
  'Los cursos, talleres o programas impartidos (Art. 39 Bis fr. I). Los años '
  'de experiencia del instructor se contrastan contra el catálogo '
  '(capacitacion_experiencia_minima_anios), no contra un número escrito en la '
  'migración: la regla dura 1 vale también para el Cap. XII.';

create index on sesiones_capacitacion (tenant_id, programa_id, fecha);

-- ---------------------------------------------------------------------------
-- 6. Quién asistió, y su evaluación
-- ---------------------------------------------------------------------------
create table asistencias_capacitacion (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  sesion_id  uuid not null,
  persona_id uuid not null,

  -- 39 Bis 1 ¶2. `null` = todavía no se le evalúa; true/false = resultado.
  -- Que sea nullable distingue «no evaluado» de «reprobó», y esa distinción
  -- decide si se puede expedir constancia.
  evaluacion_satisfactoria boolean,
  evaluacion_fecha date,
  evaluacion_detalle text,

  -- La constancia solo existe si hubo evaluación satisfactoria: lo hace
  -- inexpresable el CHECK de abajo, no una validación que alguien pueda
  -- olvidar llamar.
  constancia_folio text,
  constancia_hash  text,

  created_at timestamptz not null default now(),

  constraint asistencia_de_la_misma_sesion
    foreign key (tenant_id, sesion_id) references sesiones_capacitacion (tenant_id, id),
  constraint asistencia_de_la_misma_persona
    foreign key (tenant_id, persona_id) references personas_capacitables (tenant_id, id),
  constraint una_asistencia_por_persona_y_sesion unique (sesion_id, persona_id),

  -- 39 Bis 1 ¶2, hecho inexpresable.
  constraint constancia_exige_evaluacion_satisfactoria check (
    constancia_folio is null
    or (evaluacion_satisfactoria is true and evaluacion_fecha is not null)
  ),
  constraint evaluacion_completa check (
    (evaluacion_satisfactoria is null and evaluacion_fecha is null)
    or (evaluacion_satisfactoria is not null and evaluacion_fecha is not null)
  ),
  constraint hash_de_constancia_es_sha256 check (
    constancia_hash is null or constancia_hash ~ '^[0-9a-f]{64}$')
);

comment on table asistencias_capacitacion is
  'Lista de asistencia con su evaluación y constancia (Art. 39 Bis 1). La '
  'constancia sin evaluación satisfactoria es inexpresable: el ¶2 ata una a la '
  'otra sin margen.';

create index on asistencias_capacitacion (tenant_id, persona_id);
create index on asistencias_capacitacion (tenant_id, sesion_id);

-- ---------------------------------------------------------------------------
-- 7. Diez años de evidencia: nada se borra
-- ---------------------------------------------------------------------------
-- El 39 Bis 1 ¶1 obliga a conservar la evidencia diez años. Un DELETE no es un
-- descuido corregible: es la evidencia que ya no existe. Se permite el UPDATE
-- de la asistencia —la evaluación y la constancia llegan después de la sesión—
-- pero nunca el borrado.
create or replace function app.capacitacion_no_se_borra()
returns trigger language plpgsql as $$
begin
  raise exception using
    errcode = 'check_violation',
    message = 'La evidencia de capacitación se conserva diez años (Art. 39 Bis 1 ¶1): no se borra.',
    hint    = 'Si el registro está mal, corrige sus datos; el historial es la prueba ante la autoridad.';
end $$;

create trigger programas_no_se_borran before delete on programas_capacitacion
  for each row execute function app.capacitacion_no_se_borra();
create trigger sesiones_no_se_borran before delete on sesiones_capacitacion
  for each row execute function app.capacitacion_no_se_borra();
create trigger asistencias_no_se_borran before delete on asistencias_capacitacion
  for each row execute function app.capacitacion_no_se_borra();

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
alter table personas_capacitables    enable row level security;
alter table programas_capacitacion   enable row level security;
alter table sesiones_capacitacion    enable row level security;
alter table asistencias_capacitacion enable row level security;

create policy "ver la plantilla de mi obligado" on personas_capacitables
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin gestiona la plantilla" on personas_capacitables
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver los programas de mi obligado" on programas_capacitacion
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin gestiona los programas" on programas_capacitacion
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver las sesiones de mi obligado" on sesiones_capacitacion
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin registra las sesiones" on sesiones_capacitacion
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver las asistencias de mi obligado" on asistencias_capacitacion
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin registra las asistencias" on asistencias_capacitacion
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert, update on personas_capacitables    to authenticated;
grant select, insert, update on programas_capacitacion   to authenticated;
grant select, insert, update on sesiones_capacitacion    to authenticated;
grant select, insert, update on asistencias_capacitacion to authenticated;

select app.verificar_privilegios_por_omision();

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_persona uuid; v_otro_tenant uuid; v_otra_persona uuid;
  v_prog uuid; v_sesion uuid; v_asis uuid; v_rechazo boolean;
  v_hash text := repeat('c', 64);
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('CAP270101AB1', 'Aserción capacitación', 'moral') returning id into v_tenant;
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('CAP270101CD2', 'Otro obligado', 'moral') returning id into v_otro_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-cap@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Cap', 'asercion-cap@ejemplo.mx');

  -- ── 1. La plantilla admite a quien NO tiene cuenta en el portal ───────
  insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area)
  values (v_tenant, 'Consejera sin cuenta', 'consejo_administracion', date '2027-01-05')
  returning id into v_persona;
  assert v_persona is not null, 'ASERCIÓN 1: no se pudo capacitar a alguien sin usuario del portal';

  insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area)
  values (v_otro_tenant, 'Ajena', 'directivo', date '2027-01-05') returning id into v_otra_persona;

  -- ── 2. Un programa anterior al primer periodo no acredita nada ────────
  v_rechazo := false;
  begin
    insert into programas_capacitacion (tenant_id, anio) values (v_tenant, 2025);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: entró un programa anterior al Transitorio Séptimo';

  insert into programas_capacitacion (tenant_id, anio, descripcion)
  values (v_tenant, 2027, 'Primer periodo') returning id into v_prog;

  -- ── 3. Dos programas para el mismo año del mismo obligado ─────────────
  v_rechazo := false;
  begin
    insert into programas_capacitacion (tenant_id, anio) values (v_tenant, 2027);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: un obligado quedó con dos programas del mismo año';

  -- ── 4. Una sesión sin ningún tema ─────────────────────────────────────
  v_rechazo := false;
  begin
    insert into sesiones_capacitacion
      (tenant_id, programa_id, titulo, fecha, temas, instructor_nombre,
       instructor_anios_experiencia, registrado_por)
    values (v_tenant, v_prog, 'Sesión vacía', date '2027-03-01',
            '{}'::tema_capacitacion[], 'Instructora', 8, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: entró una sesión que no cubre ningún tema';

  -- ── 5. El camino feliz ────────────────────────────────────────────────
  insert into sesiones_capacitacion
    (tenant_id, programa_id, titulo, fecha, temas, instructor_nombre,
     instructor_anios_experiencia, instructor_acredita_hash, instructor_acredita_archivo,
     registrado_por)
  values (v_tenant, v_prog, 'Marco normativo y riesgos', date '2027-03-01',
          '{marco_normativo,riesgos_del_obligado}'::tema_capacitacion[],
          'Instructora Acreditada', 8, v_hash, 'cv.pdf', v_user)
  returning id into v_sesion;
  assert v_sesion is not null, 'ASERCIÓN 5: la sesión válida no entró';

  -- ── 6. Una sesión colgada del programa de OTRO obligado ───────────────
  v_rechazo := false;
  begin
    insert into sesiones_capacitacion
      (tenant_id, programa_id, titulo, fecha, temas, instructor_nombre,
       instructor_anios_experiencia, registrado_por)
    values (v_otro_tenant, v_prog, 'Ajena', date '2027-03-01',
            '{marco_normativo}'::tema_capacitacion[], 'X', 8, v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: una sesión colgó del programa de otro obligado';

  -- ── 7. Asistencia sin evaluar: válida, y sin constancia ───────────────
  insert into asistencias_capacitacion (tenant_id, sesion_id, persona_id)
  values (v_tenant, v_sesion, v_persona) returning id into v_asis;
  assert v_asis is not null, 'ASERCIÓN 7: no se pudo registrar una asistencia sin evaluar';

  -- ── 8. CONSTANCIA SIN EVALUACIÓN: el ¶2 del 39 Bis 1 lo prohíbe ───────
  v_rechazo := false;
  begin
    update asistencias_capacitacion set constancia_folio = 'C-001' where id = v_asis;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se expidió constancia sin evaluación (39 Bis 1 ¶2)';

  -- ── 9. Constancia con evaluación REPROBADA ────────────────────────────
  update asistencias_capacitacion
     set evaluacion_satisfactoria = false, evaluacion_fecha = date '2027-03-02'
   where id = v_asis;
  v_rechazo := false;
  begin
    update asistencias_capacitacion set constancia_folio = 'C-001' where id = v_asis;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 9: se expidió constancia a quien no aprobó';

  -- ── 10. Con evaluación satisfactoria, sí ──────────────────────────────
  update asistencias_capacitacion
     set evaluacion_satisfactoria = true, evaluacion_fecha = date '2027-03-02',
         constancia_folio = 'C-001'
   where id = v_asis;
  assert (select constancia_folio from asistencias_capacitacion where id = v_asis) = 'C-001',
    'ASERCIÓN 10: no se pudo expedir constancia con evaluación satisfactoria';

  -- ── 11. Media evaluación: resultado sin fecha ─────────────────────────
  v_rechazo := false;
  begin
    insert into asistencias_capacitacion
      (tenant_id, sesion_id, persona_id, evaluacion_satisfactoria)
    values (v_tenant, v_sesion, v_otra_persona, true);
  exception when check_violation or foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 11: entró media evaluación, o una persona de otro obligado';

  -- ── 12. La evidencia no se borra (39 Bis 1 ¶1) ────────────────────────
  v_rechazo := false;
  begin
    delete from asistencias_capacitacion where id = v_asis;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 12: se borró evidencia que hay que conservar diez años';

  -- ── 13. Los tres plazos quedaron en el catálogo, no en un CHECK ───────
  assert (select count(*) from parametros_motor
           where clave in ('capacitacion_periodicidad_meses',
                           'capacitacion_experiencia_minima_anios',
                           'capacitacion_retencion_anios')) = 3,
    'ASERCIÓN 13: los plazos del Cap. XII no están en el catálogo';

  raise notice 'Cap. XII (Arts. 39 Bis y 39 Bis 1): 13 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
