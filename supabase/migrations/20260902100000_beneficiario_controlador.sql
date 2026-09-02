-- ---------------------------------------------------------------------------
-- Cap. III Quinquies · El procedimiento de identificación del Beneficiario
-- Controlador (Arts. 23 Quinquies, 23 Quinquies 1 y 23 Quinquies 2)
-- ---------------------------------------------------------------------------
-- Contrastado contra el DOF el 20-ago-2026 en `docs/BENEFICIARIO-CONTROLADOR.md`
-- (acuerdo-115-2026.txt, líneas 253–266). Esta migración implementa el diseño
-- de su §5, que hasta hoy era papel.
--
-- LO QUE DECIDE EL MODELO no es el 25%, es esta frase del párrafo de cierre,
-- que aparece dos veces —una por régimen— casi palabra por palabra:
--
--   «deberán documentar el PROCEDIMIENTO SEGUIDO para la identificación del
--    Beneficiario Controlador, conservar la información, documentación y
--    registros que la sustenten, mantenerlos actualizados durante la vigencia
--    de la Relación de negocios y resguardarlos en términos del artículo 18,
--    fracción IV de la Ley»
--
-- Guardar quién ganó no cumple ninguno de los cuatro verbos. Por eso lo que se
-- guarda es el camino: qué fracción se evaluó, en qué orden, con qué resultado,
-- y por qué se avanzó a la siguiente.
--
-- LA IDENTIDAD NO SE DUPLICA. El diseño en papel (§5.3) ponía los datos de la
-- persona en una tabla hija nueva. Aquí no: `beneficiarios_controladores` ya es
-- el sujeto al que apunta `consultas_screening.sujeto_tipo`, y mover la
-- identidad a otra tabla dejaría dos respuestas posibles a «quién es el
-- Beneficiario Controlador de este cliente» — que es el modo de falla que la
-- regla dura 6 persigue. El hallazgo APUNTA a esa fila y le agrega lo que le
-- faltaba: por qué fracción se llegó a ella.

-- ---------------------------------------------------------------------------
-- El umbral, al catálogo (regla dura 1)
-- ---------------------------------------------------------------------------
-- Dos parámetros y no uno: el número y el BORDE. Parametrizar solo el 25 y
-- dejar el `>=` escrito en el código sería la mitad de la regla en código
-- igual — el error que el issue #17 encontró en el motor de umbrales.
--
-- Vigencia 1-mar-2027: Transitorio Cuarto del Acuerdo. Antes de esa fecha no
-- hay fila vigente, y la persistencia lo trata como vista anticipada.
insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('beneficiario_umbral_control_pct', '25'::jsonb,
   'Porcentaje de la composición accionaria o parte social que hace Beneficiario Controlador por la fr. I',
   '2027-03-01',
   'Art. 23 Quinquies fr. I del Acuerdo 115/2026 (DOF 7-ago-2026): «el 25% o más de la '
   'composición accionaria o parte social del capital social del Cliente o Usuaria». Mide '
   'TENENCIA de capital. NO es el 25% del Art. 3 fr. IV inciso b) subinciso ii) de la Ley, que '
   'mide derechos de VOTO y dice «más del».'),
  ('beneficiario_umbral_inclusivo', 'true'::jsonb,
   'Si el umbral de la fr. I se alcanza con su propio valor («o más»)',
   '2027-03-01',
   'Art. 23 Quinquies fr. I del Acuerdo 115/2026: «el 25% o MÁS» — borde inclusivo. En 25.00% '
   'exacto esta lectura y la del Art. 3 fr. IV b) ii) de la Ley («más del 25%», sobre voto) dan '
   'respuestas opuestas, y por eso el borde es dato y no un operador escrito en el código.');

-- ---------------------------------------------------------------------------
-- Vocabularios
-- ---------------------------------------------------------------------------
-- Las cuatro vías. El fideicomiso NO usa el orden de prelación: el Art. 23
-- Quinquies 1 es una prueba única de control efectivo, más amplia. Meterlos en
-- el mismo camino sería inventar una fracción que el texto no tiene.
create type via_identificacion_bc as enum (
  'prelacion_persona_moral',      -- Art. 23 Quinquies
  'control_efectivo_fideicomiso', -- Art. 23 Quinquies 1
  'declaracion_persona_fisica',   -- Art. 18 fr. III ¶2 de la Ley
  'excepcion'                     -- Art. 23 Quinquies 2
);

create type estado_identificacion_bc as enum ('vigente', 'sustituida');

create type fraccion_prelacion_bc as enum ('I', 'II', 'III');

create type resultado_paso_bc as enum ('encontrado', 'no_encontrado');

-- Los cinco caracteres que el Art. 23 Quinquies 1 enumera, en su orden.
create type rol_fideicomiso_bc as enum (
  'fiduciario', 'fideicomitente', 'fideicomisario', 'protectora', 'comite_tecnico'
);

-- El Art. 23 Quinquies 2 nombra la bolsa (fr. I) y cuatro anexos (fr. II).
-- `anexo_7a` y `anexo_7bisa` EXISTEN aquí y no tienen ninguna lógica que los
-- llene: el texto de esos anexos no está en el archivo del DOF que tenemos, y
-- decidir por regla que un cliente cae en ellos sería sembrar una fuente que
-- nadie contrastó (§2 del documento).
create type tipo_excepcion_bc as enum (
  'bolsa_de_valores', 'anexo_4bis', 'anexo_6bis', 'anexo_7a', 'anexo_7bisa'
);

-- ---------------------------------------------------------------------------
-- Para poder apuntar a la identidad con FK compuesta
-- ---------------------------------------------------------------------------
alter table beneficiarios_controladores
  add constraint beneficiarios_tenant_uk unique (tenant_id, id);

-- ---------------------------------------------------------------------------
-- El intento de identificación
-- ---------------------------------------------------------------------------
create table identificaciones_bc (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  via via_identificacion_bc not null,

  -- «con carácter previo a la realización del acto u operación o, a más
  -- tardar, al momento del establecimiento de la Relación de negocios»: es la
  -- fecha del acto, no la de captura. `created_at` responde lo otro.
  fecha_identificacion date not null,

  -- Nunca se hace UPDATE sobre una determinación: reidentificar —la
  -- actualización que el artículo exige «durante la vigencia de la Relación de
  -- negocios»— es una fila nueva que sustituye a la anterior. La vieja se
  -- conserva íntegra: es lo único que la retención de diez años puede retener.
  estado      estado_identificacion_bc not null default 'vigente',
  sustituye_a uuid,

  -- El descenso del Art. 23 Quinquies 1 ¶2, aplanado en filas encadenadas:
  -- cuando quien ejerce control efectivo es persona moral, su identificación
  -- es OTRA fila que cuelga del hallazgo que la produjo.
  desciende_de_hallazgo_id uuid,

  -- El catálogo que se usó, congelado. Sin esto la determinación no se puede
  -- reconstruir: el umbral es dato versionado y dentro de dos años la fila
  -- vigente puede ser otra. Mismo principio que el snapshot de screening.
  umbral_pct       numeric(5,2) not null,
  umbral_inclusivo boolean      not null,

  determinada_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint identificaciones_bc_tenant_uk unique (tenant_id, id),
  constraint identificacion_del_mismo_cliente
    foreign key (tenant_id, cliente_id) references clientes_finales (tenant_id, id),
  constraint sustituye_del_mismo_obligado
    foreign key (tenant_id, sustituye_a) references identificaciones_bc (tenant_id, id),
  constraint umbral_congelado_plausible check (umbral_pct > 0 and umbral_pct <= 100),
  -- Una identificación no se sustituye a sí misma.
  constraint no_se_sustituye_a_si_misma check (sustituye_a is null or sustituye_a <> id)
);

-- Una sola identificación VIGENTE por cliente, y solo entre las raíces: las
-- del descenso son de otro sujeto (la persona moral de adentro), no del
-- cliente, y contarlas aquí impediría descender más de una vez.
create unique index una_identificacion_vigente_por_cliente
  on identificaciones_bc (tenant_id, cliente_id)
  where estado = 'vigente' and desciende_de_hallazgo_id is null;

create index on identificaciones_bc (tenant_id, cliente_id, created_at);

comment on table identificaciones_bc is
  'El procedimiento seguido para identificar al Beneficiario Controlador '
  '(Arts. 23 Quinquies y 23 Quinquies 1, párrafos de cierre). Append-only: '
  'reidentificar es una fila nueva que sustituye, nunca un UPDATE.';

-- ---------------------------------------------------------------------------
-- Los pasos del orden de prelación
-- ---------------------------------------------------------------------------
-- Una fila POR CADA FRACCIÓN EVALUADA, no solo por la que resolvió. El «por lo
-- menos el siguiente orden de prelación» del Art. 23 Quinquies obliga a un
-- procedimiento agotado: llegar a la fr. III sin haber buscado en la I y en la
-- II no es una determinación, es un atajo. Estas filas son lo que demuestra
-- que no se tomó.
create table pasos_prelacion_bc (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  identificacion_id uuid not null,

  fraccion  fraccion_prelacion_bc not null,
  resultado resultado_paso_bc     not null,

  -- Obligatorio cuando no se encontró: es lo que hace auditable el
  -- agotamiento. «No aplica» no es un motivo; qué se buscó y con qué, sí.
  motivo text,

  -- Lo que se evaluó, tal como entró al motor. El detalle en prosa ayuda a
  -- leer; el dato auditable es este.
  insumos_evaluados jsonb not null,

  created_at timestamptz not null default now(),

  constraint pasos_bc_tenant_uk unique (tenant_id, id),
  constraint paso_de_la_misma_identificacion
    foreign key (tenant_id, identificacion_id) references identificaciones_bc (tenant_id, id),
  constraint una_fraccion_por_identificacion unique (tenant_id, identificacion_id, fraccion),
  constraint no_encontrado_exige_motivo check (
    resultado = 'encontrado' or (motivo is not null and length(btrim(motivo)) > 0))
);

create index on pasos_prelacion_bc (tenant_id, identificacion_id);

comment on table pasos_prelacion_bc is
  'Una fila por fracción EVALUADA del Art. 23 Quinquies, no solo por la que '
  'resolvió: es la evidencia de que el orden se agotó.';

-- ---------------------------------------------------------------------------
-- Los hallazgos: quién resultó ser Beneficiario Controlador, y por qué vía
-- ---------------------------------------------------------------------------
create table hallazgos_bc (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  identificacion_id uuid not null,

  -- La identidad vive en `beneficiarios_controladores`, que es el sujeto que
  -- ya mira el screening. Aquí solo se dice cómo se llegó a ella.
  beneficiario_id uuid not null,

  -- Por prelación: el paso que lo produjo. Por fideicomiso: el carácter con el
  -- que ejerce control. Uno u otro, nunca los dos: son regímenes distintos.
  paso_id uuid,
  rol     rol_fideicomiso_bc,

  -- La justificación puntual: el desglose del porcentaje, el medio de control
  -- con sus áreas, o las facultades del Art. 23 Quinquies 1 que se ejercen.
  base text not null,

  -- Cuando el hallazgo es persona moral y hubo que descender (Art. 23
  -- Quinquies 1 ¶2), la identificación hija cuelga de esta fila.
  created_at timestamptz not null default now(),

  constraint hallazgos_bc_tenant_uk unique (tenant_id, id),
  constraint hallazgo_de_la_misma_identificacion
    foreign key (tenant_id, identificacion_id) references identificaciones_bc (tenant_id, id),
  constraint hallazgo_del_mismo_paso
    foreign key (tenant_id, paso_id) references pasos_prelacion_bc (tenant_id, id),
  constraint hallazgo_de_la_misma_persona
    foreign key (tenant_id, beneficiario_id) references beneficiarios_controladores (tenant_id, id),
  constraint base_no_vacia check (length(btrim(base)) > 0),
  -- Prelación o fideicomiso, no las dos ni ninguna.
  constraint paso_o_rol_pero_no_ambos check (
    (paso_id is not null and rol is null) or (paso_id is null and rol is not null))
);

create index on hallazgos_bc (tenant_id, identificacion_id);

alter table identificaciones_bc
  add constraint descenso_del_mismo_obligado
    foreign key (tenant_id, desciende_de_hallazgo_id) references hallazgos_bc (tenant_id, id);

-- ---------------------------------------------------------------------------
-- La excepción del Art. 23 Quinquies 2
-- ---------------------------------------------------------------------------
create table excepciones_bc (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  identificacion_id uuid not null,

  tipo tipo_excepcion_bc not null,

  -- La fr. I la exige con todas sus letras: «siempre que proporcione la clave
  -- de pizarra, referencia o identificador con el que pueda localizarse».
  -- Sin ella la excepción no está acreditada, así que no se puede guardar.
  clave_pizarra text,

  detalle text,
  created_at timestamptz not null default now(),

  constraint excepciones_bc_tenant_uk unique (tenant_id, id),
  constraint excepcion_de_la_misma_identificacion
    foreign key (tenant_id, identificacion_id) references identificaciones_bc (tenant_id, id),
  constraint una_excepcion_por_identificacion unique (tenant_id, identificacion_id),
  constraint bolsa_exige_clave_de_pizarra check (
    (tipo = 'bolsa_de_valores' and clave_pizarra is not null and length(btrim(clave_pizarra)) > 0)
    or (tipo <> 'bolsa_de_valores' and clave_pizarra is null))
);

comment on table excepciones_bc is
  'Art. 23 Quinquies 2. Los tipos anexo_7a y anexo_7bisa existen en el enum y '
  'ninguna regla los llena: el texto de esos anexos no está contrastado.';

-- ---------------------------------------------------------------------------
-- Que la vía y sus hijos no se puedan contradecir
-- ---------------------------------------------------------------------------
-- DIFERIDO, y esta vez sí hace falta. La coherencia depende de filas que se
-- insertan DESPUÉS en la misma transacción: cuando nace la identificación, sus
-- pasos y sus hallazgos todavía no existen. Un trigger inmediato mataría toda
-- inserción legítima. (En el Cap. III Ter se copió `deferrable` sin esta razón
-- y una aserción pasó cuando debía morir: la diferencia es de dónde llega la
-- fila que hace verdadera la condición.)
create or replace function app.identificacion_bc_coherente() returns trigger
language plpgsql as $$
declare
  v_pasos int;
  v_hallazgos int;
  v_excepciones int;
  v_primera fraccion_prelacion_bc;
begin
  select count(*) into v_pasos      from pasos_prelacion_bc where identificacion_id = new.id;
  select count(*) into v_hallazgos  from hallazgos_bc       where identificacion_id = new.id;
  select count(*) into v_excepciones from excepciones_bc    where identificacion_id = new.id;

  if new.via = 'excepcion' then
    if v_excepciones <> 1 then
      raise exception 'Art. 23 Quinquies 2: una identificación por excepción necesita exactamente una excepción registrada, y tiene %', v_excepciones;
    end if;
    if v_pasos > 0 or v_hallazgos > 0 then
      raise exception 'Art. 23 Quinquies 2: la excepción libera de recabar los datos; no lleva pasos ni hallazgos';
    end if;
    return new;
  end if;

  if v_excepciones > 0 then
    raise exception 'Solo la vía «excepcion» lleva una excepción del Art. 23 Quinquies 2';
  end if;

  if new.via = 'prelacion_persona_moral' then
    if v_pasos = 0 then
      raise exception 'Art. 23 Quinquies: el orden de prelación exige documentar las fracciones evaluadas, y no hay ninguna';
    end if;
    -- El agotamiento empieza en la I. Sin ella no hay orden que demostrar.
    select fraccion into v_primera from pasos_prelacion_bc
      where identificacion_id = new.id order by fraccion limit 1;
    if v_primera <> 'I' then
      raise exception 'Art. 23 Quinquies: el orden de prelación empieza en la fracción I, y aquí empieza en la %', v_primera;
    end if;
  end if;

  if new.via = 'control_efectivo_fideicomiso' and v_pasos > 0 then
    raise exception 'Art. 23 Quinquies 1: el fideicomiso no usa el orden de prelación, es una prueba de control efectivo';
  end if;

  return new;
end $$;

create constraint trigger identificacion_bc_coherente
  after insert on identificaciones_bc
  deferrable initially deferred
  for each row execute function app.identificacion_bc_coherente();

-- ---------------------------------------------------------------------------
-- El orden de prelación, irrompible desde el esquema
-- ---------------------------------------------------------------------------
-- No se puede llegar a la fracción II sin que la I haya quedado sin resultado,
-- ni a la III sin que la II también. INMEDIATO a propósito: la fila que hace
-- verdadera la condición se insertó ANTES en la misma transacción, así que
-- diferirlo solo retrasaría el error sin ganar nada.
create or replace function app.prelacion_bc_en_orden() returns trigger
language plpgsql as $$
declare v_previa fraccion_prelacion_bc; v_resultado resultado_paso_bc;
begin
  if new.fraccion = 'I' then return new; end if;
  v_previa := case new.fraccion when 'II' then 'I' else 'II' end;

  select resultado into v_resultado from pasos_prelacion_bc
   where identificacion_id = new.identificacion_id and fraccion = v_previa;

  if v_resultado is null then
    raise exception 'Art. 23 Quinquies: no se puede evaluar la fracción % sin haber evaluado antes la %', new.fraccion, v_previa;
  end if;
  if v_resultado = 'encontrado' then
    raise exception 'Art. 23 Quinquies: la fracción % ya identificó al Beneficiario Controlador; el orden se detiene ahí', v_previa;
  end if;
  return new;
end $$;

create trigger prelacion_bc_en_orden before insert on pasos_prelacion_bc
  for each row execute function app.prelacion_bc_en_orden();

-- ---------------------------------------------------------------------------
-- Append-only: diez años (Art. 18 fr. IV de la Ley, al que el capítulo remite)
-- ---------------------------------------------------------------------------
create or replace function app.bc_no_se_borra() returns trigger
language plpgsql as $$
begin
  raise exception using
    errcode = 'restrict_violation',
    message = 'El procedimiento de identificación del Beneficiario Controlador no se borra',
    detail  = 'Art. 23 Quinquies, párrafo de cierre: resguardar en términos del Art. 18 fr. IV de la Ley (diez años).',
    hint    = 'Una reidentificación es una fila nueva que sustituye a la anterior.';
end $$;

create trigger identificaciones_bc_no_se_borran before delete on identificaciones_bc
  for each row execute function app.bc_no_se_borra();
create trigger pasos_bc_no_se_borran before delete on pasos_prelacion_bc
  for each row execute function app.bc_no_se_borra();
create trigger hallazgos_bc_no_se_borran before delete on hallazgos_bc
  for each row execute function app.bc_no_se_borra();
create trigger excepciones_bc_no_se_borran before delete on excepciones_bc
  for each row execute function app.bc_no_se_borra();

-- Lo único que cambia de una identificación es que deja de ser la vigente.
create or replace function app.identificacion_bc_solo_se_sustituye() returns trigger
language plpgsql as $$
begin
  if new.estado = old.estado then
    raise exception 'La identificación del Beneficiario Controlador es inmutable: corrige con una nueva que sustituya a esta';
  end if;
  if not (old.estado = 'vigente' and new.estado = 'sustituida') then
    raise exception 'Una identificación sustituida no vuelve a estar vigente';
  end if;
  if (new.via, new.cliente_id, new.fecha_identificacion, new.umbral_pct, new.umbral_inclusivo,
      new.sustituye_a, new.desciende_de_hallazgo_id, new.determinada_por)
     is distinct from
     (old.via, old.cliente_id, old.fecha_identificacion, old.umbral_pct, old.umbral_inclusivo,
      old.sustituye_a, old.desciende_de_hallazgo_id, old.determinada_por) then
    raise exception 'Solo el estado cambia: lo demás es la evidencia de cómo se determinó';
  end if;
  return new;
end $$;

create trigger identificacion_bc_solo_se_sustituye before update on identificaciones_bc
  for each row execute function app.identificacion_bc_solo_se_sustituye();

-- Los hijos no se tocan nunca.
create or replace function app.bc_hijo_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'La evidencia del procedimiento es inmutable (Art. 23 Quinquies, párrafo de cierre)';
end $$;

create trigger pasos_bc_inmutables before update on pasos_prelacion_bc
  for each row execute function app.bc_hijo_inmutable();
create trigger hallazgos_bc_inmutables before update on hallazgos_bc
  for each row execute function app.bc_hijo_inmutable();
create trigger excepciones_bc_inmutables before update on excepciones_bc
  for each row execute function app.bc_hijo_inmutable();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table identificaciones_bc  enable row level security;
alter table pasos_prelacion_bc   enable row level security;
alter table hallazgos_bc         enable row level security;
alter table excepciones_bc       enable row level security;

create policy "ver identificaciones bc" on identificaciones_bc for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "crear identificaciones bc" on identificaciones_bc for insert
  to authenticated with check (tenant_id = app.tenant_id());
create policy "sustituir identificaciones bc" on identificaciones_bc for update
  to authenticated using (tenant_id = app.tenant_id()) with check (tenant_id = app.tenant_id());

create policy "ver pasos bc" on pasos_prelacion_bc for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "crear pasos bc" on pasos_prelacion_bc for insert
  to authenticated with check (tenant_id = app.tenant_id());

create policy "ver hallazgos bc" on hallazgos_bc for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "crear hallazgos bc" on hallazgos_bc for insert
  to authenticated with check (tenant_id = app.tenant_id());

create policy "ver excepciones bc" on excepciones_bc for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "crear excepciones bc" on excepciones_bc for insert
  to authenticated with check (tenant_id = app.tenant_id());

grant select, insert, update on identificaciones_bc to authenticated;
grant select, insert on pasos_prelacion_bc to authenticated;
grant select, insert on hallazgos_bc       to authenticated;
grant select, insert on excepciones_bc     to authenticated;

-- Lo que Supabase concede sin que nadie lo pida.
revoke truncate, trigger, references, maintain on identificaciones_bc from authenticated, anon;
revoke truncate, trigger, references, maintain on pasos_prelacion_bc   from authenticated, anon;
revoke truncate, trigger, references, maintain on hallazgos_bc         from authenticated, anon;
revoke truncate, trigger, references, maintain on excepciones_bc       from authenticated, anon;

-- Y los de escritura, declarados uno por uno: la lección del Cap. XII.
insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('identificaciones_bc','authenticated','INSERT',null,
   'El obligado asienta el procedimiento seguido (Art. 23 Quinquies, párrafo de cierre)'),
  ('identificaciones_bc','authenticated','UPDATE',null,
   'La sustitución al reidentificar; el trigger acota el UPDATE a vigente→sustituida'),
  ('pasos_prelacion_bc','authenticated','INSERT',null,
   'Las fracciones evaluadas del orden de prelación'),
  ('hallazgos_bc','authenticated','INSERT',null,
   'Quién resultó Beneficiario Controlador y por qué vía se llegó a esa persona'),
  ('excepciones_bc','authenticated','INSERT',null,
   'La excepción del Art. 23 Quinquies 2 con su clave de pizarra cuando aplica')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_cliente_b uuid; v_persona uuid; v_persona2 uuid;
  v_ident uuid; v_paso1 uuid; v_paso2 uuid; v_hallazgo uuid; v_ident2 uuid;
  v_rechazo boolean;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('BCT270101AB1', 'Aserción BC', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-bc@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Quien determina', 'asercion-bc@ejemplo.mx');
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente moral de prueba', 'CMP270101XY9', false, v_dom)
  returning id into v_cliente;
  -- Un segundo cliente: las aserciones que necesitan una identificación
  -- incompleta no pueden montarla sobre el primero, porque solo puede haber
  -- una vigente por cliente — que es justamente la aserción 5.
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Otro cliente moral', 'OCM270101XY9', false, v_dom)
  returning id into v_cliente_b;
  insert into beneficiarios_controladores (tenant_id, cliente_id, nombre, control_por, es_declaracion)
  values (v_tenant, v_cliente, 'Persona física A', 'participacion', false) returning id into v_persona;
  insert into beneficiarios_controladores (tenant_id, cliente_id, nombre, control_por, es_declaracion)
  values (v_tenant, v_cliente, 'Persona física B', 'control_efectivo', false) returning id into v_persona2;

  -- ── 1. Una identificación por prelación con su camino completo ────────
  insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                   umbral_pct, umbral_inclusivo, determinada_por)
  values (v_tenant, v_cliente, 'prelacion_persona_moral', '2027-03-15', 25, true, v_user)
  returning id into v_ident;
  insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado, motivo, insumos_evaluados)
  values (v_tenant, v_ident, 'I', 'no_encontrado',
          'Libro de accionistas revisado: la mayor tenencia es 12%', '[]'::jsonb)
  returning id into v_paso1;
  insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado, insumos_evaluados)
  values (v_tenant, v_ident, 'II', 'encontrado', '[]'::jsonb)
  returning id into v_paso2;
  insert into hallazgos_bc (tenant_id, identificacion_id, beneficiario_id, paso_id, base)
  values (v_tenant, v_ident, v_persona, v_paso2, 'Veto estatutario sobre el presupuesto anual');
  assert (select count(*) from pasos_prelacion_bc where identificacion_id = v_ident) = 2,
    'ASERCIÓN 1: el camino no quedó registrado';

  -- ── 2. NO se puede saltar la fracción I ───────────────────────────────
  insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                   umbral_pct, umbral_inclusivo, determinada_por)
  values (v_tenant, v_cliente_b, 'prelacion_persona_moral', '2027-03-16', 25, true, v_user)
  returning id into v_ident2;
  v_rechazo := false;
  begin
    insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado, insumos_evaluados)
    values (v_tenant, v_ident2, 'III', 'encontrado', '[]'::jsonb);
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: se llegó a la fracción III sin agotar la I y la II';

  -- ── 3. Ni continuar después de haber encontrado ───────────────────────
  v_rechazo := false;
  begin
    insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado, insumos_evaluados)
    values (v_tenant, v_ident, 'III', 'encontrado', '[]'::jsonb);
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: el orden siguió después de que la fracción II resolvió';

  -- ── 4. Un paso sin resultado exige motivo ─────────────────────────────
  v_rechazo := false;
  begin
    insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado, insumos_evaluados)
    values (v_tenant, v_ident2, 'I', 'no_encontrado', '[]'::jsonb);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se registró un «no encontrado» sin decir qué se buscó';

  -- ── 5. Una sola identificación vigente por cliente ────────────────────
  v_rechazo := false;
  begin
    insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                     umbral_pct, umbral_inclusivo, determinada_por)
    values (v_tenant, v_cliente, 'declaracion_persona_fisica', '2027-03-17', 25, true, v_user);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: quedaron dos identificaciones vigentes del mismo cliente';

  -- ── 6. La determinación es inmutable salvo la sustitución ─────────────
  v_rechazo := false;
  begin
    update identificaciones_bc set fecha_identificacion = '2027-04-01' where id = v_ident;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: se editó la evidencia de cómo se determinó';

  update identificaciones_bc set estado = 'sustituida' where id = v_ident2;
  v_rechazo := false;
  begin
    update identificaciones_bc set estado = 'vigente' where id = v_ident2;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: una identificación sustituida volvió a estar vigente';

  -- ── 8. Los pasos y los hallazgos no se editan ni se borran ────────────
  v_rechazo := false;
  begin
    update pasos_prelacion_bc set resultado = 'encontrado' where id = v_paso1;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se reescribió un paso del orden de prelación';

  v_rechazo := false;
  begin
    delete from hallazgos_bc where identificacion_id = v_ident;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 9: se borró evidencia que hay que conservar diez años';

  -- ── 10. Un hallazgo es por paso O por rol de fideicomiso, no por ambos ─
  v_rechazo := false;
  begin
    insert into hallazgos_bc (tenant_id, identificacion_id, beneficiario_id, paso_id, rol, base)
    values (v_tenant, v_ident, v_persona2, v_paso2, 'fiduciario', 'Las dos vías a la vez');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 10: un hallazgo llegó por prelación y por fideicomiso a la vez';

  -- ── 11. La excepción de bolsa exige la clave de pizarra ───────────────
  v_rechazo := false;
  begin
    insert into excepciones_bc (tenant_id, identificacion_id, tipo)
    values (v_tenant, v_ident2, 'bolsa_de_valores');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 11: se acreditó la excepción de bolsa sin clave de pizarra';

  -- ── 12. El umbral y su borde viven en el catálogo, con su fuente ──────
  assert (select count(*) from parametros_motor
           where clave in ('beneficiario_umbral_control_pct','beneficiario_umbral_inclusivo')
             and fuente is not null) = 2,
    'ASERCIÓN 12: el umbral del Art. 23 Quinquies no está en el catálogo con su fuente';

  raise notice 'Cap. III Quinquies (Arts. 23 Quinquies a 23 Quinquies 2): 12 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
