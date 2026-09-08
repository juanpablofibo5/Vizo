-- ===========================================================================
-- Cap. XIV — DE LA AUDITORÍA (Arts. 42–45 y 50 ¶1) — Fase 1: periodo y auditor
-- ===========================================================================
-- Acuerdo 115/2026, DOF 7-ago-2026 (código 5795797, edición vespertina).
-- Texto oficial: regulatorio/dof/acuerdo-115-2026.txt.
--
--   Art. 42 (línea 456): «Quienes realicen Actividades Vulnerables deberán
--     mantener medidas de control que incluya la revisión de un auditor ya sea
--     de su área de auditoría interna, o bien, de una persona auditora externa
--     independiente, que evalúe y dictamine del primero de enero al treinta y
--     uno de diciembre de cada año, la efectividad del cumplimiento de la Ley,
--     su Reglamento y de las presentes reglas.»
--
--   Art. 43 (línea 458): «Tratándose del primer año de operaciones de quienes
--     realicen Actividades Vulnerables, el periodo previsto en el artículo
--     anterior, comprenderá desde la fecha en que inicien operaciones como
--     Actividad Vulnerable y hasta el treinta y uno de diciembre del siguiente
--     año.»
--
--   Art. 44 (línea 459): dictamen interno permitido si el Riesgo del obligado
--     es bajo o medio, con área «integrada por personal independiente a la
--     persona Representante Encargada de Cumplimiento», con conocimiento de
--     los procesos, «así como contar con al menos una acreditación de un
--     programa de capacitación anual a que se refiere el Capítulo XII».
--
--   Art. 45 (líneas 460–466): externa obligatoria si el Riesgo es alto, o si
--     el obligado LO ELIGE. Cinco requisitos en incisos a)-e), transcritos
--     literal en `REQUISITOS_DEL_AUDITOR_EXTERNO` (src/dominio/auditoria.ts).
--
--   Art. 50 ¶1 (línea 485): «La revisión y emisión del dictamen deberá
--     realizarse dentro de los primeros tres meses siguientes al cierre del
--     año auditado, y el auditor deberá entregar el dictamen al auditado a más
--     tardar el último día hábil del mes de marzo.»
--
--   Transitorio Octavo (línea 750 — NO 749: esa línea es el Transitorio
--     Séptimo, de capacitación; se verificó línea por línea el 8-sep-2026 y se
--     deja anotado porque un artículo mal citado es exactamente el tipo de
--     error que la regla dura 1 existe para atrapar): «Para efectos del
--     artículo 42 de estas reglas, el primer periodo de revisión de auditoría
--     iniciará el primero de enero de dos mil veintiocho y concluirá el
--     treinta y uno de diciembre del mismo año.»
--
-- ---------------------------------------------------------------------------
-- LO QUE YA ESTÁ RESUELTO Y NO SE RECONSTRUYE (ADR-28)
-- ---------------------------------------------------------------------------
-- La ruta del Art. 44/45 —interna permitida o externa obligatoria— la decide
-- el grado de RIESGO DE LA ENTIDAD, y eso ya vive en `evaluaciones_entidad`
-- (migración 20260829150000): cada fila trae su `grado_id`, del que
-- `estadoDeLaEntidad` (src/persistencia/entidad.ts:382) ya deriva
-- `auditoria: 'externa_obligatoria' | 'interna_permitida'`. Esta migración NO
-- vuelve a calcular esa ruta desde `grados_riesgo.es_alto`: la CONSUME, vía la
-- evaluación de entidad vigente al momento de abrir el periodo.
--
-- ---------------------------------------------------------------------------
-- LA RUTA SE CONGELA CON SU EVALUACIÓN — el mismo patrón del ADR-42
-- ---------------------------------------------------------------------------
-- `declaraciones_coherencia` ancla una declaración a la evaluación de entidad
-- vigente EN ESE MOMENTO, y si llega una evaluación nueva la declaración no se
-- invalida: envejece, y se dice «sobre otra evaluación» (ADR-25, ADR-42). Un
-- periodo de auditoría hace exactamente lo mismo con la ruta de los Arts.
-- 44/45: se decidió contra una evaluación concreta, en un momento concreto, y
-- si después cambia el grado de riesgo del obligado, el periodo YA ABIERTO no
-- se reescribe — el dominio (src/dominio/auditoria.ts, `coherenciaDeLaRuta`)
-- dice sobre qué evaluación se fijó y si HOY la ruta sería otra, nunca
-- «inválida»: ni el Art. 44 ni el 45 dan ese verbo.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA FASE CONSTRUYE, Y LO QUE DEJA PARA DESPUÉS
-- ---------------------------------------------------------------------------
-- Fase 1 (esta migración): CUÁNDO abre el periodo (Arts. 42/43), QUIÉN puede
-- dictaminar (Arts. 44/45) y CUÁNDO vence la entrega (Art. 50 ¶1). El propio
-- dictamen —Arts. 46-49, los cinco resultados de cumplimiento del Art. 48, el
-- seguimiento de hallazgos del Art. 49— es explícitamente OTRA fase: no hay
-- nada aquí que module contenido de auditoría, solo el periodo y quién la
-- firma.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. El hecho que el Art. 43 necesita: cuándo empezó a operar el obligado
-- ---------------------------------------------------------------------------
-- NO es `tenants.fecha_alta_autoridad` (migración 20260811100000): esa
-- columna es «la fecha del alta y registro del sujeto obligado ANTE EL SAT», y
-- el alta ante la autoridad y el inicio de operaciones como Actividad
-- Vulnerable son dos hechos distintos —se puede operar antes de darse de
-- alta, o darse de alta antes de operar—. Confundirlos habría producido un
-- periodo auditado equivocado. Es la misma lección del ADR-34, donde hizo
-- falta `fecha_contratacion` porque no servía `ingreso_al_area`: dos hechos
-- que se PARECEN no son el mismo hecho.
alter table tenants add column inicio_de_operaciones date;

comment on column tenants.inicio_de_operaciones is
  'Fecha en que el obligado inició operaciones como Actividad Vulnerable. Es '
  'el hecho que el Art. 43 (línea 458) usa para el periodo largo del primer '
  'año, y NO es fecha_alta_autoridad —el alta ante el SAT—: se puede iniciar '
  'la actividad y darse de alta después, o al revés. NULL significa «no se '
  'sabe», nunca «no aplica» (ADR-34): sin esta fecha, periodoDeAuditoria() '
  'calcula el periodo ordinario del Art. 42 pero devuelve una advertencia '
  'explícita de que no se sabe si en realidad tocaba el periodo largo.';

-- Misma plausibilidad que `fecha_alta_autoridad`: no antes de que la Ley
-- exista, no en el futuro. Deliberadamente SIN relación con
-- `fecha_alta_autoridad` en ningún CHECK — un obligado puede operar antes de
-- darse de alta o darse de alta antes de operar, y `inicio_de_operaciones <=
-- fecha_alta_autoridad` no es cierto en ninguna de las dos direcciones. Si
-- algún día aparece un fundamento que ate las dos fechas, se agrega entonces.
alter table tenants add constraint inicio_de_operaciones_plausible
  check (
    inicio_de_operaciones is null
    or (inicio_de_operaciones >= date '2013-07-17' and inicio_de_operaciones <= current_date)
  );

-- Aserción aislada, con el mismo patrón que `20260811100000_fecha_alta_autoridad.sql`:
-- comprueba que el CHECK muerde y que la columna nace nullable, sin necesitar
-- todo el aparataje de tenant+usuario+evaluación de la sección de aserciones
-- de más abajo.
do $$
declare v_rechazo boolean := false; v_nullable text;
begin
  begin
    insert into tenants (rfc, razon_social, domicilio, inicio_de_operaciones)
    values ('IDO010101AA1', 'Aserción inicio de operaciones', '{}'::jsonb, current_date + 1);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'El CHECK aceptó un inicio de operaciones en el futuro.';
  end if;
  if exists (select 1 from tenants where rfc = 'IDO010101AA1') then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  select is_nullable into v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tenants'
     and column_name = 'inicio_de_operaciones';
  if v_nullable <> 'YES' then
    raise exception 'tenants.inicio_de_operaciones debe nacer nullable: sin esa fecha la respuesta es «no se sabe», nunca «no aplica» (ADR-34).';
  end if;

  raise notice '✓ tenants.inicio_de_operaciones — nace nullable, y el CHECK de plausibilidad muerde';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Catálogo — cuatro parámetros del capítulo (regla dura 1)
-- ---------------------------------------------------------------------------
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'auditoria_primer_periodo_anio', to_jsonb(2028),
   'El año en que cierra el PRIMER periodo de auditoría, para quienes ya '
   'operaban cuando el Acuerdo entró en vigor. Vigente desde la entrada en '
   'vigor general del Acuerdo (30-nov-2026) y no desde 2028: hay que poder '
   'ver este dato —y con él, planear el periodo largo del Art. 43 para las '
   'altas nuevas— antes de que el primer periodo arranque.',
   date '2026-11-30',
   'Transitorio Octavo, línea 750 del .txt del repo — Acuerdo 115/2026, DOF '
   '7-ago-2026, edición vespertina, código 5795797: «el primer periodo de '
   'revisión de auditoría iniciará el primero de enero de dos mil veintiocho '
   'y concluirá el treinta y uno de diciembre del mismo año». Contrastado el '
   '8-sep-2026.'),
  (null, 'auditoria_entrega_mes', to_jsonb(3),
   'Mes calendario en que vence la entrega del dictamen: el auditor entrega '
   'a más tardar el último día HÁBIL de ese mes, del año siguiente al cierre '
   'del periodo auditado.',
   date '2028-01-01',
   'Art. 50 ¶1, línea 485, Acuerdo 115/2026 (DOF 7-ago-2026, edición '
   'vespertina, código 5795797): «...el auditor deberá entregar el dictamen '
   'al auditado a más tardar el último día hábil del mes de marzo». '
   'Contrastado el 8-sep-2026.'),
  (null, 'auditoria_experiencia_minima_anios', to_jsonb(3),
   'Años mínimos de experiencia en materia de prevención y detección de '
   'operaciones con recursos de procedencia ilícita que debe acreditar la '
   'persona auditora externa.',
   date '2028-01-01',
   'Art. 45 inciso a), línea 461, Acuerdo 115/2026 (DOF 7-ago-2026, edición '
   'vespertina, código 5795797): «...tener experiencia de al menos tres años '
   'en materia de prevención y detección de actos u operaciones que pudieran '
   'involucrar recursos de procedencia ilícita». Contrastado el 8-sep-2026.'),
  (null, 'auditoria_veda_rec_anios', to_jsonb(2),
   'Años posteriores al periodo auditado durante los cuales quien fungió '
   'como auditor externo de un obligado no puede aceptar el cargo de '
   'Representante Encargada de Cumplimiento de ese mismo obligado.',
   date '2028-01-01',
   'Art. 45 inciso e), línea 465, Acuerdo 115/2026 (DOF 7-ago-2026, edición '
   'vespertina, código 5795797): «No haber aceptado […] el cargo como '
   'Representante Encargada de Cumplimiento del auditado, durante el periodo '
   'auditado y dos años posteriores a dicho periodo». Contrastado el '
   '8-sep-2026.');

-- ---------------------------------------------------------------------------
-- 2. El calendario de días inhábiles — GLOBAL, y nace vacío a propósito
-- ---------------------------------------------------------------------------
-- El Acuerdo 115/2026 fija el MES de entrega (marzo) pero no publica un
-- calendario de días inhábiles: eso lo emite cada año la autoridad por otro
-- medio, y el de 2029 en adelante todavía no existe. Sembrar un calendario
-- inventado sería la misma trampa que la regla dura 1 prohíbe para umbrales y
-- campos de expediente. La apuesta es la MISMA que el proyecto ya ganó con el
-- Acuerdo 115/2026 (ver el gotcha «Las Reglas de Carácter General ya
-- salieron» en CLAUDE.md): modelar el calendario como dato versionado, aunque
-- hoy esté vacío, vuelve el día que la autoridad publique 2029 un INSERT y no
-- un rediseño de `fechaLimiteDeEntrega`.
create table dias_inhabiles (
  anio   int  not null,
  fecha  date primary key,
  motivo text not null,
  fuente text not null,

  constraint dia_inhabil_anio_coincide_con_la_fecha
    check (anio = extract(year from fecha)::int),
  constraint dia_inhabil_motivo_no_vacio check (length(btrim(motivo)) > 0),
  constraint dia_inhabil_fuente_no_vacia check (length(btrim(fuente)) > 0)
);

comment on table dias_inhabiles is
  'Calendario GLOBAL de días inhábiles (el mismo rige para todos los '
  'obligados, como elementos_riesgo o los catálogos SAT), usado únicamente '
  'para retroceder la fecha límite de entrega del dictamen fuera de fin de '
  'semana o feriado (Art. 50 ¶1). NACE VACÍA A PROPÓSITO: el Acuerdo 115/2026 '
  'no publica este calendario y el de un año futuro no existe todavía. '
  'Cargar un año es un INSERT por fila, con su fuente — nunca un rediseño '
  '(regla dura 1, la misma apuesta que ya se cobró con el propio Acuerdo). '
  'Con la tabla vacía, fechaLimiteDeEntrega() sigue funcionando: retrocede '
  'sólo fines de semana, ciertos sin calendario alguno, y lo dice con '
  '`conCalendario: false` — nunca calcula en silencio como si el calendario '
  'sí estuviera cargado (regla dura 6). '
  'CONTRATO DE CARGA, que la lectura da por cierto: un año se carga COMPLETO '
  'o no se carga. Quien pregunta por un año deduce «está cargado» de que '
  'exista al menos una fila suya, así que cargar medio año haría que VIZO '
  'afirmara una precisión que no tiene. Si algún día hiciera falta registrar '
  'un año sin ningún día inhábil, eso pide una marca de año cargado, no una '
  'fila falsa.';

create index on dias_inhabiles (anio);

insert into app.tablas_globales (tabla, motivo) values
  ('dias_inhabiles', 'calendario GLOBAL de días inhábiles para la entrega del dictamen (Art. 50 ¶1): el mismo calendario rige para todos los obligados, como elementos_riesgo o los catálogos SAT')
on conflict do nothing;

alter table dias_inhabiles enable row level security;
create policy "calendario de días inhábiles legible" on dias_inhabiles
  for select to authenticated using (true);
grant select on dias_inhabiles to authenticated;
revoke truncate, trigger, references, maintain on dias_inhabiles from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Los dos tipos nuevos
-- ---------------------------------------------------------------------------
create type ruta_auditoria as enum ('interna_permitida', 'externa_obligatoria');
create type tipo_auditor   as enum ('interna', 'externa');

-- ---------------------------------------------------------------------------
-- 4. El periodo de auditoría — Arts. 42/43, congelado contra su evaluación
-- ---------------------------------------------------------------------------
create table periodos_auditoria (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),

  -- El año de CIERRE del periodo (siempre 31-dic de este año, el CHECK de
  -- abajo lo hace cierto): tanto el ordinario del Art. 42 como el largo del
  -- Art. 43 cierran el 31 de diciembre, solo que el largo puede abrir en
  -- cualquier fecha del año anterior.
  anio                              int  not null,
  periodo_inicio                    date not null,
  periodo_fin                       date not null,
  es_primer_periodo_de_operaciones  boolean not null default false,

  -- La ruta se decide CONTRA esta evaluación, en este momento. No se vuelve a
  -- calcular después: ver el bloque de cabecera sobre el ADR-42.
  evaluacion_entidad_id uuid not null,
  ruta                  ruta_auditoria not null,

  fecha_limite_entrega   date    not null,
  -- Si la fecha límite se calculó con `dias_inhabiles` cargado para el año
  -- que tocaba, o solo evitando fin de semana. Ver el comentario de
  -- `fechaLimiteDeEntrega` en src/dominio/auditoria.ts: sin calendario, la
  -- fecha puede caer DESPUÉS de la real (la dirección arriesgada), y esta
  -- columna es lo que permite que la pantalla lo diga.
  limite_con_calendario  boolean not null,

  -- Qué NO se sabía cuando se calcularon estas fechas. Hoy el único caso es
  -- el obligado sin `inicio_de_operaciones` registrado: el periodo se calcula
  -- ordinario (Art. 42) pero nadie puede afirmar que no le tocaba el largo
  -- del Art. 43. Se guarda en vez de solo devolverse al abrir, porque si la
  -- duda solo se ve una vez, la pantalla de mañana afirma en silencio una
  -- certeza que nunca hubo — la regla dura 6 del lado de la LECTURA. Y se
  -- CONGELA, como la ruta: describe cómo se calculó este periodo, no cómo se
  -- calcularía hoy; registrar después la fecha no cambia que este periodo se
  -- abrió sin ella.
  advertencia text,

  abierto_por uuid not null references usuarios(id),
  created_at  timestamptz not null default now(),

  constraint periodos_auditoria_tenant_uk unique (tenant_id, id),
  -- Un periodo por año por obligado: no tiene sentido abrir dos veces el
  -- mismo año, y si algo estuvo mal al abrirlo, se corrige con una fila
  -- nueva de otra manera — este periodo es append-only, no se reabre.
  constraint un_periodo_por_anio unique (tenant_id, anio),

  constraint periodo_de_evaluacion_del_mismo_obligado
    foreign key (tenant_id, evaluacion_entidad_id)
    references evaluaciones_entidad (tenant_id, id),

  constraint periodo_coherente check (periodo_fin > periodo_inicio),
  -- Arts. 42 y 43 cierran los dos el 31 de diciembre.
  constraint periodo_cierra_el_ultimo_dia_del_anio
    check (periodo_fin = make_date(extract(year from periodo_fin)::int, 12, 31)),
  constraint limite_despues_del_cierre check (fecha_limite_entrega > periodo_fin),
  -- Una advertencia vacía es peor que ninguna: se ve como si hubiera algo que
  -- decir y no dice qué. O es NULL —no había nada que advertir— o tiene texto.
  constraint advertencia_dice_algo
    check (advertencia is null or length(btrim(advertencia)) > 0)
);

comment on table periodos_auditoria is
  'El periodo de revisión de auditoría (Arts. 42/43) y la ruta que le toca '
  '(Arts. 44/45), CONGELADAS contra la evaluación de entidad vigente al '
  'momento de abrirlo — el mismo patrón que declaraciones_coherencia con su '
  'evaluación (ADR-42): la ruta se decidió contra un hecho concreto, en un '
  'momento concreto. Si después llega una evaluación de entidad nueva que '
  'daría otra ruta, este periodo NO se invalida ni se reescribe: envejece a '
  'la vista (coherenciaDeLaRuta en src/dominio/auditoria.ts dice sobre qué '
  'evaluación se fijó, y si hoy la ruta sería otra). Append-only: el periodo '
  'es un hecho, y corregirlo sería reescribir contra qué evaluación se '
  'decidió.';

create index on periodos_auditoria (tenant_id, evaluacion_entidad_id);

create trigger periodos_auditoria_append_only
  before update or delete on periodos_auditoria
  for each row execute function app.prohibir_mutacion();

create trigger periodos_auditoria_sin_truncate
  before truncate on periodos_auditoria
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 5. El auditor designado — Arts. 44/45
-- ---------------------------------------------------------------------------
create table auditores_designados (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  periodo_id uuid not null,
  tipo       tipo_auditor not null,

  -- Solo para tipo = 'interna': la persona de la plantilla del Cap. XII.
  persona_id uuid,

  -- Solo para tipo = 'externa': los cinco incisos del Art. 45.
  nombre                              text,
  profesion                           text,
  cedula_profesional                  text,
  anios_experiencia                   int,
  certificacion_uif_folio             text,
  certificacion_uif_vence             date,
  acredita_hash                       char(64),
  acredita_archivo                    text,
  -- Incisos c), d) y e): declaraciones que son REQUISITOS para poder ser
  -- designado, no evidencia de un proceso de contratación. Ver el comentario
  -- del CHECK más abajo sobre la diferencia deliberada con el ADR-34.
  sin_sentencia_patrimonial           boolean,
  sin_servicios_previos_en_conflicto  boolean,
  sin_cargo_rec_en_veda               boolean,

  designado_por uuid not null references usuarios(id),
  created_at    timestamptz not null default now(),

  -- La sustitución: nunca se borra al anterior, se le pone fecha y motivo.
  sustituido_en      timestamptz,
  motivo_sustitucion text,

  constraint auditores_designados_tenant_uk unique (tenant_id, id),
  constraint auditor_del_mismo_periodo
    foreign key (tenant_id, periodo_id)
    references periodos_auditoria (tenant_id, id),
  constraint auditor_interno_de_la_plantilla
    foreign key (tenant_id, persona_id)
    references personas_capacitables (tenant_id, id),

  constraint anios_de_experiencia_no_negativos
    check (anios_experiencia is null or anios_experiencia >= 0),
  constraint hash_de_acreditacion_es_sha256
    check (acredita_hash is null or acredita_hash ~ '^[0-9a-f]{64}$'),

  -- Inexpresable, nivel 1 de la regla dura 6: un auditor interno ES una
  -- persona de la plantilla, y no trae ninguno de los campos de externa.
  constraint auditor_interno_es_una_persona check (
    tipo <> 'interna' or (
      persona_id is not null
      and nombre is null and profesion is null and cedula_profesional is null
      and anios_experiencia is null and certificacion_uif_folio is null
      and certificacion_uif_vence is null and acredita_hash is null
      and acredita_archivo is null and sin_sentencia_patrimonial is null
      and sin_servicios_previos_en_conflicto is null and sin_cargo_rec_en_veda is null
    )
  ),

  -- Inexpresable, nivel 1: un auditor externo trae los cinco incisos del
  -- Art. 45 completos, y NO es nadie de la plantilla (persona_id null).
  --
  -- DIFERENCIA DELIBERADA CON EL ADR-34. Ahí una declaración en falso SÍ se
  -- guarda —"no ha sido sentenciado" en falso es evidencia real de un proceso
  -- de selección que el obligado necesita para aplicar sus medidas del ¶3—.
  -- Aquí los incisos c), d) y e) NO son evidencia de un proceso: son
  -- REQUISITOS para poder ser la persona auditora de este periodo. Quien no
  -- los cumple no se convierte en "auditor con una declaración en falso
  -- registrada para consulta futura": simplemente no se le puede designar. No
  -- hay nada que archivar sobre un candidato rechazado antes de existir como
  -- fila.
  constraint auditor_externo_con_sus_requisitos check (
    tipo <> 'externa' or (
      persona_id is null
      and nombre is not null and profesion is not null and cedula_profesional is not null
      and anios_experiencia is not null
      and certificacion_uif_folio is not null and certificacion_uif_vence is not null
      and sin_sentencia_patrimonial is true
      and sin_servicios_previos_en_conflicto is true
      and sin_cargo_rec_en_veda is true
    )
  ),

  constraint sustitucion_completa check (
    (sustituido_en is null and motivo_sustitucion is null)
    or (sustituido_en is not null and motivo_sustitucion is not null
        and length(btrim(motivo_sustitucion)) > 0)
  )
);

comment on table auditores_designados is
  'Quién dictamina el periodo (Arts. 44/45). Un auditor interno es una '
  'persona de personas_capacitables (Cap. XII); uno externo trae los cinco '
  'incisos del Art. 45. Solo uno vigente por periodo a la vez '
  '(un_auditor_vigente_por_periodo), pero la historia de sustituciones se '
  'conserva completa.';

-- Un solo auditor VIGENTE por periodo (sustituido_en is null), pero la
-- historia de sustituciones convive en la misma tabla.
create unique index un_auditor_vigente_por_periodo
  on auditores_designados (periodo_id)
  where sustituido_en is null;

create index on auditores_designados (tenant_id, persona_id) where persona_id is not null;

-- ---------------------------------------------------------------------------
-- Los dos requisitos del Art. 44, en UN trigger y en el orden del artículo
-- ---------------------------------------------------------------------------
-- Art. 44, línea 459: el área de auditoría interna debe estar «integrada por
-- personal independiente a la persona Representante Encargada de
-- Cumplimiento […] así como contar con al menos una acreditación de un
-- programa de capacitación anual a que se refiere el Capítulo XII».
--
-- POR QUÉ UN SOLO TRIGGER Y NO DOS. Postgres dispara los BEFORE en orden
-- ALFABÉTICO por nombre, y con dos triggers separados ganaba el de la
-- capacitación. A quien intentara designar a la propia REC —que además no
-- tuviera constancia— la base le contestaba «no tiene acreditación de
-- capacitación»: cierto, pero es el impedimento EQUIVOCADO, porque sugiere
-- que capacitándola quedaría habilitada, y siendo la REC no lo estará nunca.
-- Un mensaje que insinúa un remedio que no existe es peor que uno áspero.
-- Unificados, el orden lo decide el código y no el alfabeto: primero lo que
-- no tiene arreglo, después lo que sí — que además es el orden del texto.
--
-- BEFORE INSERT y no un CHECK porque ambas condiciones miran el estado ACTUAL
-- de otra tabla (el rol vigente de la persona, sus constancias), y un CHECK
-- solo puede ver su propia fila.
create or replace function app.auditor_interno_cumple_el_art_44()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rol    public.rol_capacitacion;
  v_baja   date;
  v_tiene  boolean;
begin
  if new.tipo <> 'interna' then return new; end if;

  -- `public.` calificado a propósito (lección del search_path de la semana
  -- 5, ver app.declaracion_contra_la_ultima_evaluacion, migración
  -- 20260907120000, y app.aprobar_exige_control_resuelto, 20260906100000):
  -- más barato calificar siempre que confiar en que este trigger nunca
  -- termine corriendo dentro de una función SECURITY DEFINER con
  -- search_path restringido.
  select rol, baja_del_area into v_rol, v_baja
    from public.personas_capacitables
   where tenant_id = new.tenant_id and id = new.persona_id;

  -- 1. Lo que no tiene remedio: ser la REC.
  if v_rol = 'rec' and v_baja is null then
    raise exception using
      errcode = 'check_violation',
      message = 'El auditor interno no puede ser la persona Representante Encargada de Cumplimiento',
      detail  = 'Art. 44, línea 459: el área de auditoría interna debe estar integrada por personal independiente a la persona REC.',
      hint    = 'Designa a otra persona de la plantilla del Cap. XII, o elige auditor externo (Art. 45).';
  end if;

  -- 2. Lo que sí se puede resolver: acreditar la capacitación.
  select exists (
    select 1 from public.asistencias_capacitacion
     where tenant_id = new.tenant_id and persona_id = new.persona_id
       and constancia_folio is not null
  ) into v_tiene;

  if not v_tiene then
    raise exception using
      errcode = 'check_violation',
      message = 'El auditor interno no tiene ninguna acreditación de capacitación del Cap. XII',
      detail  = 'Art. 44 in fine, línea 459: el área de auditoría interna debe contar con al menos una acreditación de un programa de capacitación anual a que se refiere el Capítulo XII.',
      hint    = 'Acredita primero la capacitación de esta persona (Capacitación → evaluación y constancia) y vuelve a designarla.';
  end if;

  return new;
end $$;

create trigger auditor_interno_cumple_el_art_44
  before insert on auditores_designados
  for each row execute function app.auditor_interno_cumple_el_art_44();

-- ---------------------------------------------------------------------------
-- La regla del Art. 45, en la base y no solo en la aplicación
-- ---------------------------------------------------------------------------
-- Art. 45, línea 460: «Cuando lo elija quien realice la Actividad Vulnerable
-- o su Riesgo sea evaluado como alto […] la revisión y emisión del dictamen
-- DEBERÁ realizarse por una persona auditora externa independiente».
--
-- Es la regla más consecuente del capítulo, y la relación es ASIMÉTRICA: un
-- periodo `externa_obligatoria` cierra la puerta al auditor interno, pero uno
-- `interna_permitida` admite los dos tipos —el obligado siempre puede ELEGIR
-- externo aunque no le sea obligatorio (el «cuando lo elija» del mismo
-- artículo)—. Esa asimetría se dice en una condición y no es razón para
-- dejarla fuera de la base.
--
-- La persistencia también la verifica, con un mensaje más largo. No es
-- redundancia ociosa: es el mismo reparto de dos capas que el Cap. XII usa
-- con `dirigida_a` —la aplicación explica, la base impide—, y CLAUDE.md es
-- explícito en que la precondición «es el último recurso, no el primero».
-- Un INSERT que no pase por `designarAuditorInterno` no puede saltarse esto.
create or replace function app.auditor_interno_solo_si_la_ruta_lo_permite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruta public.ruta_auditoria;
begin
  if new.tipo <> 'interna' then return new; end if;

  select ruta into v_ruta
    from public.periodos_auditoria
   where tenant_id = new.tenant_id and id = new.periodo_id;

  if v_ruta = 'externa_obligatoria' then
    raise exception using
      errcode = 'check_violation',
      message = 'Este periodo exige auditor externo: no admite uno interno',
      detail  = 'Art. 45, línea 460: cuando el Riesgo del obligado se evalúa como alto, la revisión y emisión del dictamen debe realizarla una persona auditora externa independiente con certificación vigente de la UIF.',
      hint    = 'Designa a una persona auditora externa que cumpla los cinco incisos del Art. 45.';
  end if;
  return new;
end $$;

create trigger auditor_interno_solo_si_la_ruta_lo_permite
  before insert on auditores_designados
  for each row execute function app.auditor_interno_solo_si_la_ruta_lo_permite();

-- La única mutación permitida sobre un auditor ya designado es sustituirlo:
-- de NULL a un valor, una sola vez, sin tocar nada de lo designado. Mismo
-- patrón que app.participacion_solo_se_cierra (migración 20260904160000) y
-- app.evento_solo_se_atiende (20260906150100).
create or replace function app.auditor_solo_se_sustituye()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.sustituido_en is not null then
    raise exception 'Este auditor ya fue sustituido; la sustitución no se edita ni se revierte';
  end if;
  if new.sustituido_en is null then
    raise exception 'Sustituir un auditor es ponerle fecha a la sustitución, no dejarla en null';
  end if;
  if (new.tenant_id, new.periodo_id, new.tipo, new.persona_id, new.nombre, new.profesion,
      new.cedula_profesional, new.anios_experiencia, new.certificacion_uif_folio,
      new.certificacion_uif_vence, new.acredita_hash, new.acredita_archivo,
      new.sin_sentencia_patrimonial, new.sin_servicios_previos_en_conflicto,
      new.sin_cargo_rec_en_veda, new.designado_por)
     is distinct from
     (old.tenant_id, old.periodo_id, old.tipo, old.persona_id, old.nombre, old.profesion,
      old.cedula_profesional, old.anios_experiencia, old.certificacion_uif_folio,
      old.certificacion_uif_vence, old.acredita_hash, old.acredita_archivo,
      old.sin_sentencia_patrimonial, old.sin_servicios_previos_en_conflicto,
      old.sin_cargo_rec_en_veda, old.designado_por) then
    raise exception 'De un auditor designado solo cambia su sustitución: lo designado es lo designado';
  end if;
  return new;
end $$;

create trigger auditor_solo_se_sustituye
  before update on auditores_designados
  for each row execute function app.auditor_solo_se_sustituye();

create trigger auditores_designados_no_se_borran
  before delete on auditores_designados
  for each row execute function app.prohibir_mutacion();

create trigger auditores_designados_sin_truncate
  before truncate on auditores_designados
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 6. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table periodos_auditoria    enable row level security;
alter table auditores_designados  enable row level security;

create policy "ver los periodos de auditoría de mi obligado" on periodos_auditoria
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin abre el periodo de auditoría" on periodos_auditoria
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver los auditores designados de mi obligado" on auditores_designados
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin designa al auditor" on auditores_designados
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());
create policy "admin sustituye al auditor" on auditores_designados
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on periodos_auditoria to authenticated;
grant select, insert, update on auditores_designados to authenticated;

revoke truncate, trigger, references, maintain on periodos_auditoria   from authenticated, anon;
revoke truncate, trigger, references, maintain on auditores_designados from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('periodos_auditoria','authenticated','INSERT',null,
   'Abrir el periodo de auditoría del año (Arts. 42/43), congelando ruta y evaluación (ADR-42). Append-only: nunca UPDATE ni DELETE — corregirlo sería reescribir contra qué evaluación se decidió'),
  ('auditores_designados','authenticated','INSERT',null,
   'Designar al auditor del periodo (Arts. 44/45)'),
  ('auditores_designados','authenticated','UPDATE',null,
   'Sustituir al auditor vigente; el trigger auditor_solo_se_sustituye acota el cambio a sustituido_en/motivo_sustitucion, de NULL a un valor, una sola vez')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_otro_tenant uuid; v_user uuid; v_otro_user uuid;
  v_bajo uuid; v_medio uuid; v_alto uuid; v_modelo uuid; v_elem uuid;
  v_eval_bajo uuid; v_eval_alto uuid;
  v_periodo_a uuid; v_periodo_b uuid; v_periodo_c uuid;
  v_rec uuid; v_apto uuid; v_sin_constancia uuid;
  v_prog uuid; v_sesion uuid; v_asis uuid;
  v_auditor_interno uuid; v_auditor_externo uuid; v_auditor_sustituto uuid;
  v_rechazo boolean; v_problemas text; v_mensaje text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('AUD280101AB1', 'Aserción auditoría', 'moral') returning id into v_tenant;
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('AUD280101CD2', 'Otro obligado', 'moral') returning id into v_otro_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-aud@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Auditoría', 'asercion-aud@ejemplo.mx');

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-aud-otro@ejemplo.mx') returning id into v_otro_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_otro_user, v_otro_tenant, 'admin', 'Aserción Otro', 'asercion-aud-otro@ejemplo.mx');

  -- ── Escenario: dos grados, dos evaluaciones de entidad ya resueltas ────
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo', 'Bajo', 1, false, 0, date '2027-03-01') returning id into v_bajo;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, date '2027-03-01') returning id into v_medio;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto', 'Alto', 3, true, 70, date '2027-03-01') returning id into v_alto;
  insert into modelos_riesgo (tenant_id, version, metodo_medicion, metodo_entidad)
  values (v_tenant, 1, 'suma_ponderada', 'residual_por_elemento') returning id into v_modelo;
  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Factor de aserción', 10);
  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  insert into evaluaciones_entidad
    (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
     total_clientes, total_operaciones, monto_operado_centavos,
     riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id, detalle, evaluado_por, vence)
  values
    (v_tenant, v_modelo, 'anio_completo', date '2027-01-01', date '2027-12-31',
     10, 10, 100000, 10, 0, 10, v_bajo, '{}'::jsonb, v_user, date '2029-01-01')
  returning id into v_eval_bajo;

  insert into evaluaciones_entidad
    (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
     total_clientes, total_operaciones, monto_operado_centavos,
     riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id, detalle, evaluado_por, vence)
  values
    (v_tenant, v_modelo, 'anio_completo', date '2028-01-01', date '2028-12-31',
     10, 10, 100000, 90, 0, 90, v_alto, '{}'::jsonb, v_user, date '2030-01-01')
  returning id into v_eval_alto;

  -- ── 1. periodo_fin que no es 31-dic muere ──────────────────────────────
  v_rechazo := false;
  begin
    insert into periodos_auditoria
      (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
       fecha_limite_entrega, limite_con_calendario, abierto_por)
    values (v_tenant, 2028, date '2028-01-01', date '2028-12-30', v_eval_bajo, 'interna_permitida',
            date '2029-03-30', false, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: entró un periodo cuyo cierre no es el 31 de diciembre';

  -- ── 2. límite anterior (o igual) al cierre muere ───────────────────────
  v_rechazo := false;
  begin
    insert into periodos_auditoria
      (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
       fecha_limite_entrega, limite_con_calendario, abierto_por)
    values (v_tenant, 2028, date '2028-01-01', date '2028-12-31', v_eval_bajo, 'interna_permitida',
            date '2028-12-31', false, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: entró un periodo cuya fecha límite no es posterior al cierre';

  -- ── 3. El camino bueno: periodo A, ruta interna_permitida ──────────────
  insert into periodos_auditoria
    (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
     fecha_limite_entrega, limite_con_calendario, abierto_por)
  values (v_tenant, 2028, date '2028-01-01', date '2028-12-31', v_eval_bajo, 'interna_permitida',
          date '2029-03-30', false, v_user)
  returning id into v_periodo_a;
  assert v_periodo_a is not null, 'ASERCIÓN 3: el periodo válido no entró';

  -- ── 3b. Una advertencia vacía se rechaza ───────────────────────────────
  -- O es NULL —no había nada que advertir— o dice algo. Una cadena en blanco
  -- se vería en pantalla como si hubiera una duda, sin decir cuál.
  v_rechazo := false;
  begin
    insert into periodos_auditoria
      (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
       fecha_limite_entrega, limite_con_calendario, advertencia, abierto_por)
    values (v_tenant, 2031, date '2031-01-01', date '2031-12-31', v_eval_bajo, 'interna_permitida',
            date '2032-03-31', false, '   ', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3b: entró un periodo con una advertencia en blanco';

  -- ── 4. Dos periodos del mismo año, mismo obligado ──────────────────────
  v_rechazo := false;
  begin
    insert into periodos_auditoria
      (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
       fecha_limite_entrega, limite_con_calendario, abierto_por)
    values (v_tenant, 2028, date '2028-01-01', date '2028-12-31', v_eval_bajo, 'interna_permitida',
            date '2029-03-29', false, v_user);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: un obligado quedó con dos periodos del mismo año';

  -- ── 5/6. El periodo es append-only ─────────────────────────────────────
  v_rechazo := false;
  begin
    update periodos_auditoria set ruta = 'externa_obligatoria' where id = v_periodo_a;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se editó un periodo de auditoría ya abierto';

  v_rechazo := false;
  begin
    delete from periodos_auditoria where id = v_periodo_a;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: se borró un periodo de auditoría';

  -- ── Plantilla del Cap. XII: el REC, quien acredita, quien no ───────────
  insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area)
  values (v_tenant, 'La REC del obligado', 'rec', date '2027-01-05') returning id into v_rec;
  insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area)
  values (v_tenant, 'Auditor interno apto', 'auditoria', date '2027-01-05') returning id into v_apto;
  insert into personas_capacitables (tenant_id, nombre, rol, ingreso_al_area)
  values (v_tenant, 'Sin constancia todavía', 'directivo', date '2027-01-05') returning id into v_sin_constancia;

  insert into programas_capacitacion (tenant_id, anio) values (v_tenant, 2027) returning id into v_prog;
  insert into sesiones_capacitacion
    (tenant_id, programa_id, titulo, fecha, temas, dirigida_a, instructor_nombre,
     instructor_anios_experiencia, registrado_por)
  values (v_tenant, v_prog, 'Curso anual', date '2027-03-01',
          '{marco_normativo}'::tema_capacitacion[], '{auditoria,directivo}'::rol_capacitacion[],
          'Instructora', 8, v_user)
  returning id into v_sesion;
  insert into asistencias_capacitacion
    (tenant_id, sesion_id, persona_id, evaluacion_satisfactoria, evaluacion_fecha, constancia_folio)
  values (v_tenant, v_sesion, v_apto, true, date '2027-03-02', 'C-2027-001')
  returning id into v_asis;
  assert v_asis is not null, 'la constancia de aserción no se registró';

  -- ── 7. Auditor interno que es el REC muere ─────────────────────────────
  v_rechazo := false;
  begin
    insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
    values (v_tenant, v_periodo_a, 'interna', v_rec, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se designó auditor interno a la propia persona REC';

  -- ── 8. Auditor interno sin ninguna constancia muere ────────────────────
  v_rechazo := false;
  begin
    insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
    values (v_tenant, v_periodo_a, 'interna', v_sin_constancia, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se designó auditor interno sin ninguna acreditación de capacitación';

  -- ── 8b. Siendo la REC Y sin constancia, gana el impedimento sin remedio ──
  -- `v_rec` cumple las dos causas de rechazo a la vez. El mensaje que debe
  -- salir es el de ser la REC —que no se arregla— y no el de la capacitación,
  -- que insinuaría que acreditándola quedaría habilitada. Antes de unificar
  -- los dos triggers en uno, el orden alfabético hacía ganar al equivocado.
  v_mensaje := '';
  begin
    insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
    values (v_tenant, v_periodo_a, 'interna', v_rec, v_user);
  exception when check_violation then
    get stacked diagnostics v_mensaje = message_text;
  end;
  assert v_mensaje like '%Representante Encargada de Cumplimiento%',
    'ASERCIÓN 8b: el rechazo de la REC sin constancia citó el impedimento equivocado: ' || v_mensaje;

  -- ── 9. Auditor interno CON constancia y que no es el REC, entra ────────
  insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
  values (v_tenant, v_periodo_a, 'interna', v_apto, v_user)
  returning id into v_auditor_interno;
  assert v_auditor_interno is not null, 'ASERCIÓN 9: el auditor interno válido no entró';

  -- ── 10. Dos auditores vigentes en el mismo periodo mueren ──────────────
  v_rechazo := false;
  begin
    insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
    values (v_tenant, v_periodo_a, 'interna', v_apto, v_user);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 10: dos auditores quedaron vigentes en el mismo periodo';

  -- ── El periodo B, ruta externa_obligatoria ─────────────────────────────
  insert into periodos_auditoria
    (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
     fecha_limite_entrega, limite_con_calendario, abierto_por)
  values (v_tenant, 2029, date '2029-01-01', date '2029-12-31', v_eval_alto, 'externa_obligatoria',
          date '2030-03-29', false, v_user)
  returning id into v_periodo_b;

  -- ── 10b. En un periodo de ruta externa, el interno no entra ────────────
  -- Art. 45, línea 460. Se prueba con una persona que SÍ cumple los dos
  -- requisitos del Art. 44 (no es la REC y tiene constancia acreditada): así
  -- lo único que puede rechazarla es la ruta del periodo, y no otro trigger.
  v_rechazo := false;
  begin
    insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
    values (v_tenant, v_periodo_b, 'interna', v_apto, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo,
    'ASERCIÓN 10b: se designó auditor interno en un periodo de ruta externa obligatoria (Art. 45)';

  -- ── 11. Auditor externo sin certificación UIF muere ────────────────────
  v_rechazo := false;
  begin
    insert into auditores_designados
      (tenant_id, periodo_id, tipo, nombre, profesion, cedula_profesional, anios_experiencia,
       certificacion_uif_folio, certificacion_uif_vence,
       sin_sentencia_patrimonial, sin_servicios_previos_en_conflicto, sin_cargo_rec_en_veda,
       designado_por)
    values
      (v_tenant, v_periodo_b, 'externa', 'Auditora Externa', 'Contaduría', 'CED-001', 5,
       null, null, true, true, true, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 11: entró un auditor externo sin certificación vigente de la UIF';

  -- ── 12. Auditor externo con una declaración en falso muere ─────────────
  v_rechazo := false;
  begin
    insert into auditores_designados
      (tenant_id, periodo_id, tipo, nombre, profesion, cedula_profesional, anios_experiencia,
       certificacion_uif_folio, certificacion_uif_vence,
       sin_sentencia_patrimonial, sin_servicios_previos_en_conflicto, sin_cargo_rec_en_veda,
       designado_por)
    values
      (v_tenant, v_periodo_b, 'externa', 'Auditora Externa', 'Contaduría', 'CED-001', 5,
       'UIF-001', date '2031-01-01', true, true, false, v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 12: entró un auditor externo con el inciso e) declarado en falso';

  -- ── 13. El camino bueno del externo, completo ──────────────────────────
  insert into auditores_designados
    (tenant_id, periodo_id, tipo, nombre, profesion, cedula_profesional, anios_experiencia,
     certificacion_uif_folio, certificacion_uif_vence,
     sin_sentencia_patrimonial, sin_servicios_previos_en_conflicto, sin_cargo_rec_en_veda,
     designado_por)
  values
    (v_tenant, v_periodo_b, 'externa', 'Auditora Externa', 'Contaduría', 'CED-001', 5,
     'UIF-001', date '2031-01-01', true, true, true, v_user)
  returning id into v_auditor_externo;
  assert v_auditor_externo is not null, 'ASERCIÓN 13: el auditor externo completo y correcto no entró';

  -- ── 14. Sustituir, y designar otro: entra y deja la historia ───────────
  update auditores_designados
     set sustituido_en = now(), motivo_sustitucion = 'Renuncia de la persona auditora'
   where id = v_auditor_interno;

  insert into auditores_designados (tenant_id, periodo_id, tipo, persona_id, designado_por)
  values (v_tenant, v_periodo_a, 'interna', v_apto, v_user)
  returning id into v_auditor_sustituto;
  assert v_auditor_sustituto is not null, 'ASERCIÓN 14: no se pudo designar al sustituto tras la sustitución';
  assert (select count(*) from auditores_designados where periodo_id = v_periodo_a) = 2,
    'ASERCIÓN 14b: la historia de auditores del periodo A no se conservó';

  -- ── 14c. La sustitución solo cambia lo que puede cambiar ───────────────
  v_rechazo := false;
  begin
    update auditores_designados set tipo = 'externa' where id = v_auditor_sustituto;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 14c: una "sustitución" cambió algo más que sustituido_en/motivo_sustitucion';

  -- ── 15. Un auditor no puede citar el periodo de OTRO obligado ──────────
  -- Un periodo C, propio y SIN auditor todavía: si se probara contra el
  -- periodo A, el índice único un_auditor_vigente_por_periodo se adelantaría
  -- con un unique_violation, porque A ya tiene auditor vigente (asignado en
  -- la aserción 14) — sin relación con el aislamiento que aquí se prueba.
  -- Con tipo 'externa' además, para no pasar por los triggers de interna
  -- (que consultan personas_capacitables y rechazarían por otra razón: v_apto
  -- tampoco existe bajo v_otro_tenant).
  insert into periodos_auditoria
    (tenant_id, anio, periodo_inicio, periodo_fin, evaluacion_entidad_id, ruta,
     fecha_limite_entrega, limite_con_calendario, abierto_por)
  values (v_tenant, 2030, date '2030-01-01', date '2030-12-31', v_eval_bajo, 'interna_permitida',
          date '2031-03-31', false, v_user)
  returning id into v_periodo_c;

  v_rechazo := false;
  begin
    insert into auditores_designados
      (tenant_id, periodo_id, tipo, nombre, profesion, cedula_profesional, anios_experiencia,
       certificacion_uif_folio, certificacion_uif_vence,
       sin_sentencia_patrimonial, sin_servicios_previos_en_conflicto, sin_cargo_rec_en_veda,
       designado_por)
    values
      (v_otro_tenant, v_periodo_c, 'externa', 'Ajena', 'Contaduría', 'CED-999', 5,
       'UIF-999', date '2031-01-01', true, true, true, v_otro_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 15: un auditor de otro obligado citó el periodo de este';

  -- ── 16. dias_inhabiles está declarada como tabla global ────────────────
  perform 1 from app.verificar_tenancy() where tabla = 'dias_inhabiles';
  assert not found, 'ASERCIÓN 16: dias_inhabiles no está declarada en app.tablas_globales';

  -- ── 17. La base sigue cuadrando con el inventario de privilegios ───────
  select string_agg(tabla || ': ' || problema, ' · ')
    into v_problemas from app.verificar_privilegios_declarados();
  assert v_problemas is null, 'ASERCIÓN 17: privilegios sin declarar: ' || coalesce(v_problemas, '');
  perform 1 from app.verificar_privilegios_por_omision() limit 1;
  assert not found, 'ASERCIÓN 17b: privilegios por omisión pendientes';

  raise notice 'Cap. XIV, Fase 1 (periodo y auditor — Arts. 42-45, 50 ¶1): 24 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
