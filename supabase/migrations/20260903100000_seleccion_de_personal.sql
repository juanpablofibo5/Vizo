-- ---------------------------------------------------------------------------
-- Art. 39 Bis 2 · La declaración firmada de selección de personal
-- ---------------------------------------------------------------------------
-- Contrastado contra el DOF el 3-sep-2026: `acuerdo-115-2026.txt`, líneas
-- 439–443, y el Transitorio Sexto en la línea 748.
--
-- ────────────────────────────────────────────────────────────────────────────
-- EL ARTÍCULO PIDE TRES COSAS Y SOLO UNA ES DE VIZO
-- ────────────────────────────────────────────────────────────────────────────
-- ¶1  «establecer PROCEDIMIENTOS de selección que garanticen que su personal
--      cuente con la calidad técnica, experiencia necesaria y honorabilidad»
--      → del obligado. VIZO no juzga honorabilidad ni calidad técnica.
--
-- ¶2  «obtener de cada uno de sus funcionarios o empleados una DECLARACIÓN
--      FIRMADA, en la que al menos conste: I. En su caso, la información de
--      cualquier otro sector en los que haya laborado previamente y que
--      estuviera sujeto al cumplimiento de las obligaciones establecidas en la
--      Ley; II. Que no ha sido sentenciado por delitos patrimoniales, o
--      inhabilitado para ejercer el comercio […] o para desempeñar un empleo,
--      cargo o comisión en el servicio público, o en el sistema financiero
--      mexicano.»
--      → ESTO es lo que VIZO registra, y es lo único que se puede acreditar
--        con un dato: existe la declaración, tiene fecha, dice lo que el
--        artículo pide que diga, y su firma tiene huella.
--
-- ¶3  «Los procedimientos […] así como las MEDIDAS que adoptará […] en caso de
--      que su personal deje de contar con calidad técnica u honorabilidad […]
--      deberán estar contenidos en el Manual de Políticas Internas»
--      → del obligado, y el Manual ya tiene su apartado.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LA FR. II NO SE VUELVE INEXPRESABLE, Y ES DELIBERADO
-- ────────────────────────────────────────────────────────────────────────────
-- El artículo pide que en la declaración CONSTE que la persona no fue
-- sentenciada ni inhabilitada. Sería fácil poner un CHECK que rechace la fila
-- cuando alguna manifestación viene en falso — y sería un error. Una persona
-- que declara con verdad que sí fue sentenciada produce un hecho REAL que el
-- obligado necesita tener registrado para decidir qué hace con ella (el ¶3 le
-- pide justamente tener medidas para eso). Rechazar esa fila empujaría a no
-- registrarla, o a mentir en el formulario.
--
-- Así que la base la acepta y la cobertura la reporta como declaración que NO
-- satisface la fr. II. Es la excepción razonada a «hacer el error imposible»:
-- aquí el dato incómodo no es un error, es evidencia.

-- ---------------------------------------------------------------------------
-- La fecha de contratación, que el Transitorio Sexto vuelve necesaria
-- ---------------------------------------------------------------------------
-- «deberán aplicarse a las NUEVAS CONTRATACIONES realizadas a partir del
-- primero de marzo de dos mil veintisiete» (Transitorio Sexto, línea 748).
--
-- No sirve `ingreso_al_area`: ésa es la fecha en que la persona entró al área
-- —la que el ¶3 del Art. 39 Bis 1 ata a la capacitación— y alguien contratado
-- en 2020 puede entrar a atención al público en 2027 sin ser una contratación
-- nueva. Son dos hechos distintos y hacían falta los dos.
--
-- Nulable a propósito: de la gente que ya trabaja ahí, el obligado puede no
-- tener la fecha a la mano. Sin ella no se puede saber si le aplica, y eso es
-- lo que la cobertura dirá — no «no aplica».
alter table personas_capacitables add column fecha_contratacion date;

comment on column personas_capacitables.fecha_contratacion is
  'Cuándo se contrató a la persona. Distinta de ingreso_al_area. El '
  'Transitorio Sexto acota el Art. 39 Bis 2 a las contrataciones desde el '
  '1-mar-2027, y sin esta fecha no se puede saber si le aplica.';

alter table personas_capacitables
  add constraint contratacion_no_posterior_al_ingreso check (
    fecha_contratacion is null or fecha_contratacion <= ingreso_al_area);

-- ---------------------------------------------------------------------------
-- El catálogo: desde cuándo y a quiénes
-- ---------------------------------------------------------------------------
insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('seleccion_personal_alcance', '"nuevas_contrataciones"'::jsonb,
   'A quiénes alcanza el Art. 39 Bis 2 y desde cuándo (la fecha vive en vigente_desde)',
   '2027-03-01',
   'Transitorio Sexto del Acuerdo 115/2026 (DOF 7-ago-2026): «Los procedimientos de selección '
   'de personal a que se refiere el artículo 39 Bis 2 de estas reglas, deberán aplicarse a las '
   'nuevas contrataciones realizadas a partir del primero de marzo de dos mil veintisiete.»');

-- ---------------------------------------------------------------------------
-- La declaración
-- ---------------------------------------------------------------------------
create table declaraciones_personal (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  persona_id uuid not null,

  fecha_declaracion date not null,

  -- fr. I. El «en su caso» del texto: puede no haber otro sector, y eso no es
  -- un dato faltante. Por eso son dos columnas y no un texto nulable —
  -- «no laboró en otro sector obligado» y «nadie preguntó» son distintos.
  laboro_en_sector_obligado boolean not null,
  sectores_previos text,

  -- fr. II, sus tres negativas por separado. Juntarlas en un solo booleano
  -- perdería cuál falló, y el ¶3 pide al obligado tener medidas según el caso.
  sin_sentencia_patrimonial          boolean not null,
  sin_inhabilitacion_comercio        boolean not null,
  sin_inhabilitacion_servicio_o_financiero boolean not null,

  -- «una declaración FIRMADA». VIZO no produce ni valida firmas: guarda la
  -- huella del documento que el obligado recabó, como en el Cap. XII con el
  -- documento que acredita la experiencia del instructor.
  firma_hash    text,
  firma_archivo text,

  registrada_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint declaraciones_personal_tenant_uk unique (tenant_id, id),
  constraint declaracion_de_la_misma_persona
    foreign key (tenant_id, persona_id) references personas_capacitables (tenant_id, id),
  constraint sector_previo_exige_decir_cual check (
    laboro_en_sector_obligado = false or (sectores_previos is not null
      and length(btrim(sectores_previos)) > 0)),
  constraint sin_sector_previo_no_lleva_detalle check (
    laboro_en_sector_obligado = true or sectores_previos is null),
  constraint firma_es_sha256 check (firma_hash is null or firma_hash ~ '^[0-9a-f]{64}$'),
  constraint firma_con_hash_lleva_archivo check (
    (firma_hash is null) = (firma_archivo is null))
);

create index on declaraciones_personal (tenant_id, persona_id, fecha_declaracion);

comment on table declaraciones_personal is
  'La declaración firmada del Art. 39 Bis 2 ¶2. Append-only: corregirla es '
  'una declaración nueva, porque lo que se guarda es lo que la persona firmó.';

-- ---------------------------------------------------------------------------
-- Append-only
-- ---------------------------------------------------------------------------
create or replace function app.declaracion_personal_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception using
    errcode = 'restrict_violation',
    message = 'Una declaración firmada no se edita ni se borra',
    detail  = 'Art. 39 Bis 2 ¶2: lo que se conserva es lo que la persona firmó, con su fecha.',
    hint    = 'Si cambió, recábale una declaración nueva.';
end $$;

create trigger declaraciones_personal_inmutables
  before update or delete on declaraciones_personal
  for each row execute function app.declaracion_personal_inmutable();

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table declaraciones_personal enable row level security;

create policy "ver declaraciones de personal" on declaraciones_personal for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "recabar declaraciones de personal" on declaraciones_personal for insert
  to authenticated with check (tenant_id = app.tenant_id());

grant select, insert on declaraciones_personal to authenticated;
revoke truncate, trigger, references, maintain on declaraciones_personal from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('declaraciones_personal','authenticated','INSERT',null,
   'El obligado recaba la declaración firmada del Art. 39 Bis 2 ¶2')
on conflict do nothing;

-- `personas_capacitables` ya tenía UPDATE declarado para la baja del área; la
-- fecha de contratación entra por ahí y no necesita privilegio nuevo.

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_persona uuid; v_decl uuid; v_rechazo boolean;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('SEL270301AB1', 'Aserción selección', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-sel@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Sel', 'asercion-sel@ejemplo.mx');

  insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area, fecha_contratacion)
  values (v_tenant, 'Contratada en marzo', 'atencion_publico', '2027-03-15', '2027-03-10')
  returning id into v_persona;

  -- ── 1. La contratación no puede ser POSTERIOR al ingreso al área ──────
  v_rechazo := false;
  begin
    insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area, fecha_contratacion)
    values (v_tenant, 'Imposible', 'directivo', '2027-03-01', '2027-06-01');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: se contrató a alguien después de que entrara al área';

  -- ── 2. Decir que laboró en otro sector obligado exige decir cuál ──────
  v_rechazo := false;
  begin
    insert into declaraciones_personal
      (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado,
       sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
       sin_inhabilitacion_servicio_o_financiero, registrada_por)
    values (v_tenant, v_persona, '2027-03-10', true, true, true, true, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: la fr. I se cumplió con un «sí» sin decir en qué sector';

  -- ── 3. Y no decirlo exige no traer detalle: son estados distintos ─────
  v_rechazo := false;
  begin
    insert into declaraciones_personal
      (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado, sectores_previos,
       sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
       sin_inhabilitacion_servicio_o_financiero, registrada_por)
    values (v_tenant, v_persona, '2027-03-10', false, 'Casas de bolsa',
            true, true, true, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: se guardó un sector previo en una declaración que dice que no hubo';

  -- ── 4. Una declaración completa entra ─────────────────────────────────
  insert into declaraciones_personal
    (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado, sectores_previos,
     sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
     sin_inhabilitacion_servicio_o_financiero, firma_hash, firma_archivo, registrada_por)
  values (v_tenant, v_persona, '2027-03-10', true, 'Casa de cambio, 2019-2023',
          true, true, true, repeat('a', 64), 'declaracion.pdf', v_user)
  returning id into v_decl;
  assert v_decl is not null, 'ASERCIÓN 4: no se pudo registrar una declaración bien formada';

  -- ── 5. UNA MANIFESTACIÓN EN FALSO SE PUEDE GUARDAR, y es a propósito ──
  -- Quien declara con verdad que sí fue sentenciado produce un hecho real que
  -- el obligado necesita para decidir qué hace (el ¶3 le pide tener medidas).
  -- Rechazarlo empujaría a no registrarlo, o a mentir en el formulario.
  insert into declaraciones_personal
    (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado,
     sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
     sin_inhabilitacion_servicio_o_financiero, registrada_por)
  values (v_tenant, v_persona, '2027-03-11', false, false, true, true, v_user);

  -- ── 6. La firma es SHA-256, y su archivo va con ella ──────────────────
  v_rechazo := false;
  begin
    insert into declaraciones_personal
      (tenant_id, persona_id, fecha_declaracion, laboro_en_sector_obligado,
       sin_sentencia_patrimonial, sin_inhabilitacion_comercio,
       sin_inhabilitacion_servicio_o_financiero, firma_hash, registrada_por)
    values (v_tenant, v_persona, '2027-03-12', false, true, true, true, repeat('a', 64), v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: se guardó una huella de firma sin decir de qué archivo';

  -- ── 7. Lo firmado no se edita ni se borra ─────────────────────────────
  v_rechazo := false;
  begin
    update declaraciones_personal set sin_sentencia_patrimonial = true where id = v_decl;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se editó una declaración firmada';

  v_rechazo := false;
  begin
    delete from declaraciones_personal where id = v_decl;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se borró una declaración firmada';

  -- ── 9. El alcance y su fecha viven en el catálogo, con su fuente ──────
  assert (select count(*) from parametros_motor
           where clave = 'seleccion_personal_alcance'
             and vigente_desde = date '2027-03-01' and fuente like '%Transitorio Sexto%') = 1,
    'ASERCIÓN 9: el alcance del Art. 39 Bis 2 no está en el catálogo con su fuente';

  raise notice 'Art. 39 Bis 2 (selección de personal): 9 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
