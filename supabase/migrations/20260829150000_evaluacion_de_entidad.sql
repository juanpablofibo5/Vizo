-- ===========================================================================
-- La evaluación de ENTIDAD — el riesgo del propio obligado
-- ===========================================================================
--
-- La Ley separa dos objetos de evaluación y VIZO solo tenía uno. El Art. 18
-- fr. VII (LFPIORPI, reforma 16-jul-2025, líneas 1024–1027 del .txt del repo)
-- exige «identificar, analizar, entender y mitigar SUS Riesgos, así como los
-- de las personas Clientes o Usuarias» — y la fr. XI cuelga de esa evaluación
-- la decisión más cara del calendario: auditoría interna o externa. Las Reglas
-- cierran el círculo en los Arts. 44 y 45 (Acuerdo 115/2026): dictamen interno
-- permitido «cuando el Riesgo de quien realiza la Actividad Vulnerable sea
-- evaluado como bajo o medio DE CONFORMIDAD CON LA METODOLOGÍA prevista en el
-- Capítulo II Quáter», y persona auditora externa independiente certificada
-- por la UIF cuando sea alto.
--
-- Hallazgo de la revisión externa ARQ-01 §02 (28-ago-2026), verificado contra
-- el texto primario el mismo día. Decisiones de JP del cuestionario de cierre:
-- la escala de efectividad es ORDINAL, con número fijo de niveles por modelo,
-- cada nivel amarrado a un tipo de evidencia documental exigible, versionada
-- con la metodología, SIN porcentaje continuo — y valores y umbrales los
-- declara el obligado (ADR-21 intacto). ADR-28 en docs/DECISIONES.md. La
-- sesión con Luis valida contra lo construido; sin datos de piloto todavía,
-- ajustar después cuesta una migración sobre tablas vacías.
--
-- TRES DECISIONES DE FORMA, Y POR QUÉ NINGUNA INVENTA METODOLOGÍA
--
-- 1. EL GRADO DE ENTIDAD VIVE EN LA ESCALA DEL OBLIGADO. Los Arts. 44/45
--    hablan de bajo/medio/alto «de conformidad con la metodología» — que es la
--    suya. `grados_riesgo.es_alto` ya es el disparador de las obligaciones
--    reforzadas; aquí es también el de la auditoría externa. No se inventa una
--    segunda escala.
--
-- 2. LOS MITIGANTES REDUCEN LA ENTIDAD, NUNCA EL GRADO DE UN CLIENTE. Es la
--    Opción B de ARQ-01 §04: meterlos al score individual abriría el hueco que
--    las compuertas cerraron (un tenant declarándose mitigación para bajar
--    grados). El grado por cliente queda intocado.
--
-- 3. EL MÉTODO DE ENTIDAD SE DECLARA, COMO EL DE MEDICIÓN. `residual_por_
--    elemento` es el único que el motor sabe ejecutar hoy: residual = Σ por
--    elemento de (valor declarado − mitigación declarada, sin bajar de cero).
--    El tope por elemento es estructura, no juicio: una exposición negativa no
--    es una exposición. Los números —valores de elemento, valores de nivel,
--    cortes de la escala— son todos del obligado.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. El método de entidad, declarado en la metodología
-- ---------------------------------------------------------------------------
alter table modelos_riesgo
  add column metodo_entidad text;

comment on column modelos_riesgo.metodo_entidad is
  'El método con el que se evalúa el riesgo de la ENTIDAD (Art. 18 fr. VII de '
  'la Ley; Arts. 44/45 del Acuerdo). Lo declara el obligado, como '
  'metodo_medicion; NULL significa que aún no lo declara y la evaluación de '
  'entidad muestra el hueco (regla dura 6). El motor se detiene ante un método '
  'que no conoce.';

-- ---------------------------------------------------------------------------
-- 1. El plazo de reevaluación, como dato con fuente
-- ---------------------------------------------------------------------------
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'reevaluacion_entidad_meses', '12'::jsonb,
   'Plazo máximo para revisar y actualizar la evaluación de Riesgos de la entidad. Es un techo: nuevos Riesgos detectados o una actualización de la Evaluación Nacional de Riesgos la adelantan.',
   date '2027-03-01',
   'Arts. 10 Septies 2 ¶3 y 10 Septies 3 del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): modificar Mitigantes y revisar la metodología «en un plazo no mayor a doce meses» desde los resultados de la implementación. NO comparte fila con periodo_minimo_datos_meses, que tiene el mismo número y fundamento distinto (Art. 10 Septies 2 fr. II). Contrastado el 2026-08-20 (RIESGO-EBR.md §1.1).');

-- ---------------------------------------------------------------------------
-- 2. La escala de efectividad: ordinal, con evidencia exigible por nivel
-- ---------------------------------------------------------------------------
create table niveles_efectividad (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  modelo_id          uuid not null,
  -- 1 es el nivel que menos mitiga. El orden decide, no el nombre.
  orden              smallint not null,
  clave              text not null,
  nombre             text not null,
  -- Cada nivel se gana con papeles, no con optimismo: qué evidencia documental
  -- tiene que existir para que un mitigante pueda declararse en este nivel.
  evidencia_exigible text not null,
  -- Cuánto reduce. El número lo pone el obligado; VIZO solo exige que no sea
  -- negativo y que la escala crezca con el orden.
  valor              numeric(10,3) not null,
  created_at         timestamptz not null default now(),

  unique (tenant_id, modelo_id, id),
  unique (tenant_id, modelo_id, orden),
  unique (tenant_id, modelo_id, clave),
  foreign key (tenant_id, modelo_id) references modelos_riesgo (tenant_id, id),
  constraint orden_de_nivel_positivo check (orden >= 1),
  constraint valor_de_nivel_no_negativo check (valor >= 0),
  constraint evidencia_de_nivel_no_vacia check (length(btrim(evidencia_exigible)) > 0),
  constraint clave_de_nivel_no_vacia check (length(btrim(clave)) > 0)
);

comment on table niveles_efectividad is
  'La escala de efectividad de los Mitigantes, por versión de metodología. '
  'Decisión de JP (28-ago-2026, Q del cuestionario de cierre): ordinal con '
  'número fijo de niveles, cada nivel amarrado a un tipo de evidencia '
  'documental exigible, sin porcentaje continuo — «una efectividad de 73% es '
  'precisión falsa y es lo primero que pica un auditor». VIZO no siembra '
  'niveles ni valores (ADR-21): nace vacía y se congela con el modelo.';

-- La escala tiene que crecer con el orden: un nivel «mayor» que mitiga menos
-- haría que el mismo mitigante redujera más declarándose más abajo, y la
-- escala dejaría de ordenar nada.
create or replace function app.escala_de_efectividad_monotona()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previo numeric;
begin
  select max(valor) into v_previo
    from public.niveles_efectividad
   where modelo_id = new.modelo_id and orden < new.orden and id <> new.id;

  if v_previo is not null and new.valor <= v_previo then
    raise exception
      'Este nivel (orden %) reduce % y uno de orden menor ya reducía %. La escala de efectividad tiene que crecer con el orden, o el orden no ordena nada.',
      new.orden, new.valor, v_previo
      using errcode = 'check_violation';
  end if;

  select min(valor) into v_previo
    from public.niveles_efectividad
   where modelo_id = new.modelo_id and orden > new.orden and id <> new.id;

  if v_previo is not null and new.valor >= v_previo then
    raise exception
      'Este nivel (orden %) reduce % y uno de orden mayor reduce %. La escala de efectividad tiene que crecer con el orden.',
      new.orden, new.valor, v_previo
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger nivel_efectividad_escala_monotona
  before insert or update on niveles_efectividad
  for each row execute function app.escala_de_efectividad_monotona();

-- Se congela con el modelo, igual que factores, pesos y mitigantes: cambiar la
-- escala de un modelo vigente movería la mitigación con la que ya se evaluó.
create trigger nivel_efectividad_congelado
  before insert or update or delete on niveles_efectividad
  for each row execute function app.factor_modelo_solo_en_borrador();

create index on niveles_efectividad (tenant_id, modelo_id);

-- ---------------------------------------------------------------------------
-- 3. El mitigante declara su nivel — y con qué papel lo respalda
-- ---------------------------------------------------------------------------
alter table mitigantes
  add column nivel_id uuid,
  add column evidencia_ref text;

alter table mitigantes
  add constraint mitigante_nivel_del_mismo_modelo
  foreign key (tenant_id, modelo_id, nivel_id)
  references niveles_efectividad (tenant_id, modelo_id, id);

comment on column mitigantes.nivel_id is
  'El nivel de efectividad que el obligado le declara a este mitigante, de SU '
  'escala y del MISMO modelo (la FK compuesta lo garantiza). NULL = sin '
  'declarar: la fr. III queda acreditada (identificar + efecto), pero la '
  'evaluación de entidad se detiene — contar un mitigante sin nivel como cero '
  'sería VIZO decidiendo que sus políticas no mitigan nada (regla dura 6).';

comment on column mitigantes.evidencia_ref is
  'Dónde vive el papel que respalda el nivel declarado: apartado del Manual o '
  'documento soporte. La evidencia_exigible del nivel dice QUÉ debe existir; '
  'esto dice DÓNDE está.';

-- ---------------------------------------------------------------------------
-- 4. La evaluación de entidad: append-only, con su base de información
-- ---------------------------------------------------------------------------
-- Art. 10 Septies 2 fr. II: la implementación usa «al menos» el total de
-- Clientes, el número de operaciones y el monto operado de un periodo no menor
-- a doce meses; sin operaciones en ese periodo, datos PROYECTADOS. Y el
-- Transitorio Segundo ¶2 añade el caso intermedio: información disponible
-- desde el inicio de la Actividad Vulnerable cuando no alcanza el año.
create type base_informacion_entidad as enum
  ('anio_completo', 'parcial_desde_inicio', 'proyectados');

create table evaluaciones_entidad (
  id                     uuid primary key default gen_random_uuid(),
  -- Mismo recurso que evaluaciones_riesgo.secuencia: dos evaluaciones en la
  -- misma transacción comparten `now()`, y «la más reciente» necesita respuesta.
  secuencia              bigserial not null,
  tenant_id              uuid not null references tenants(id),
  modelo_id              uuid not null,
  base_informacion       base_informacion_entidad not null,
  periodo_inicio         date,
  periodo_fin            date,
  -- Los tres datos que la norma nombra. En proyectados también son números:
  -- una proyección sin cifras no es una proyección.
  total_clientes         integer not null,
  total_operaciones      integer not null,
  monto_operado_centavos bigint  not null,
  riesgo_inherente       numeric(12,3) not null,
  mitigacion_aplicada    numeric(12,3) not null,
  riesgo_residual        numeric(12,3) not null,
  grado_id               uuid not null,
  -- El camino completo: valores por elemento, mitigantes con su nivel, método.
  -- Sin esto, cambiar el modelo volvería irreconstruible el pasado.
  detalle                jsonb not null,
  evaluado_en            timestamptz not null default now(),
  evaluado_por           uuid references usuarios(id),
  -- Arts. 10 Septies 2 ¶3 / 10 Septies 3: no más de doce meses. Del catálogo.
  vence                  date not null,

  foreign key (tenant_id, modelo_id) references modelos_riesgo (tenant_id, id),
  foreign key (tenant_id, grado_id)  references grados_riesgo  (tenant_id, id),

  constraint totales_no_negativos check (
    total_clientes >= 0 and total_operaciones >= 0 and monto_operado_centavos >= 0
  ),
  constraint inherente_no_negativo check (riesgo_inherente >= 0),
  constraint mitigacion_dentro_del_inherente check (
    mitigacion_aplicada >= 0 and mitigacion_aplicada <= riesgo_inherente
  ),
  -- La aritmética que la base no deja mentir: el residual ES la resta, no un
  -- tercer número que alguien tecleó.
  constraint residual_es_la_resta check (
    riesgo_residual = riesgo_inherente - mitigacion_aplicada
  ),
  -- Proyectados no tiene periodo histórico; las otras dos bases lo exigen.
  constraint periodo_coherente_con_su_base check (
    (base_informacion = 'proyectados' and periodo_inicio is null and periodo_fin is null)
    or (base_informacion <> 'proyectados'
        and periodo_inicio is not null and periodo_fin is not null
        and periodo_fin >= periodo_inicio)
  )
);

comment on table evaluaciones_entidad is
  'Histórico append-only del riesgo del PROPIO obligado (Art. 18 fr. VII de '
  'la Ley). Su grado —en la escala del obligado— decide el tipo de auditoría: '
  'interna permitida si bajo/medio, externa certificada obligatoria si alto '
  '(Arts. 44/45 del Acuerdo). Los mitigantes reducen aquí, nunca el grado de '
  'un cliente (ARQ-01 Opción B, ADR-28).';

create index on evaluaciones_entidad (tenant_id, secuencia desc);

-- Solo contra un modelo vigente: misma función que las evaluaciones de cliente.
create trigger evaluacion_entidad_contra_modelo_vigente
  before insert on evaluaciones_entidad
  for each row execute function app.evaluacion_riesgo_admisible();

create trigger evaluaciones_entidad_append_only
  before update or delete on evaluaciones_entidad
  for each row execute function app.prohibir_mutacion();

create trigger evaluaciones_entidad_sin_truncate
  before truncate on evaluaciones_entidad
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 5. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table niveles_efectividad  enable row level security;
alter table evaluaciones_entidad enable row level security;

create policy "ver la escala de efectividad de mi obligado" on niveles_efectividad
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin define su escala de efectividad" on niveles_efectividad
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());
create policy "admin corrige el borrador de la escala" on niveles_efectividad
  for delete to authenticated using (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver las evaluaciones de entidad de mi obligado" on evaluaciones_entidad
  for select to authenticated using (tenant_id = app.tenant_id());
-- Solo admin: de esta fila cuelga qué auditoría le toca al obligado.
create policy "admin registra la evaluación de entidad" on evaluaciones_entidad
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert, delete on niveles_efectividad  to authenticated;
grant select, insert         on evaluaciones_entidad to authenticated;
grant update (metodo_entidad) on modelos_riesgo      to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('niveles_efectividad','authenticated','INSERT',null,
   'el obligado define su escala de efectividad (ADR-28); VIZO nunca siembra aquí'),
  ('niveles_efectividad','authenticated','DELETE',null,
   'corregir el borrador antes de activarlo; el trigger lo impide una vez vigente'),
  ('evaluaciones_entidad','authenticated','INSERT',null,
   'append-only: el riesgo del obligado que decide su auditoría no se reescribe'),
  ('modelos_riesgo','authenticated','UPDATE','metodo_entidad',
   'POR COLUMNA: el método de evaluación de entidad, declarado por el obligado');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_modelo uuid; v_modelo2 uuid;
  v_bajo uuid; v_medio uuid; v_alto uuid;
  v_elem uuid; v_n1 uuid; v_n3 uuid; v_mit uuid; v_eval uuid;
  v_rechazo boolean; v_problemas text; r record;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('ENT270301AB1', 'Aserción evaluación de entidad', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-entidad@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Entidad', 'asercion-entidad@ejemplo.mx');

  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo',  'Bajo',  1, false, 0,  date '2027-03-01') returning id into v_bajo;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, date '2027-03-01') returning id into v_medio;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto',  'Alto',  3, true,  70, date '2027-03-01') returning id into v_alto;

  insert into modelos_riesgo (tenant_id, version, metodo_medicion, metodo_entidad)
  values (v_tenant, 1, 'suma_ponderada', 'residual_por_elemento') returning id into v_modelo;

  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Factor de aserción', 10);

  -- Un valor por CADA elemento (fr. II, segunda oración): 4 × 25 = 100.
  for r in select id from elementos_riesgo loop
    insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso)
    values (v_tenant, v_modelo, r.id, 25);
  end loop;

  insert into niveles_efectividad (tenant_id, modelo_id, orden, clave, nombre, evidencia_exigible, valor)
  values (v_tenant, v_modelo, 1, 'documentado', 'Documentado',
          'Política escrita en el Manual, con apartado citado.', 5) returning id into v_n1;
  insert into niveles_efectividad (tenant_id, modelo_id, orden, clave, nombre, evidencia_exigible, valor)
  values (v_tenant, v_modelo, 3, 'auditado', 'Auditado',
          'Política aplicada Y verificada por revisión interna con constancia.', 20) returning id into v_n3;

  -- 1. La escala de efectividad es monótona: orden 2 no puede reducir MÁS que orden 3.
  v_rechazo := false;
  begin
    insert into niveles_efectividad (tenant_id, modelo_id, orden, clave, nombre, evidencia_exigible, valor)
    values (v_tenant, v_modelo, 2, 'aplicado', 'Aplicado', 'Bitácora de aplicación.', 25);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: un nivel de orden 2 redujo más que el de orden 3 y la escala lo aceptó';

  insert into mitigantes (tenant_id, modelo_id, descripcion, efecto, nivel_id, evidencia_ref)
  values (v_tenant, v_modelo, 'Doble revisión del expediente antes de operar.',
          'Reduce la exposición del elemento tipo de cliente.', v_n3, 'Manual §7.2')
  returning id into v_mit;
  insert into mitigantes_elementos (tenant_id, mitigante_id, elemento_id)
  values (v_tenant, v_mit, v_elem);

  -- 2. Un mitigante no puede declarar un nivel de OTRO modelo.
  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 2) returning id into v_modelo2;
  v_rechazo := false;
  begin
    insert into mitigantes (tenant_id, modelo_id, descripcion, efecto, nivel_id)
    values (v_tenant, v_modelo2, 'Mitigante con nivel ajeno.', 'Efecto.', v_n3);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: un mitigante declaró un nivel de la escala de otro modelo';

  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  -- 3. Vigente el modelo, la escala de efectividad se congela.
  v_rechazo := false;
  begin
    insert into niveles_efectividad (tenant_id, modelo_id, orden, clave, nombre, evidencia_exigible, valor)
    values (v_tenant, v_modelo, 4, 'tardio', 'Tardío', 'Evidencia.', 30);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: la escala de efectividad de un modelo vigente aceptó un nivel nuevo';

  -- 4. El camino bueno: inherente 100, mitigación 20, residual 80 → alto.
  insert into evaluaciones_entidad
    (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
     total_clientes, total_operaciones, monto_operado_centavos,
     riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id,
     detalle, evaluado_por, vence)
  values
    (v_tenant, v_modelo, 'anio_completo', date '2026-01-01', date '2026-12-31',
     120, 350, 5000000000,
     100, 20, 80, v_alto,
     '{"metodo":"residual_por_elemento"}'::jsonb, v_user,
     (current_date + interval '12 months')::date)
  returning id into v_eval;
  assert v_eval is not null, 'ASERCIÓN 4: la evaluación de entidad válida no entró';

  -- 5. El residual ES la resta: un tercer número tecleado no pasa.
  v_rechazo := false;
  begin
    insert into evaluaciones_entidad
      (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
       total_clientes, total_operaciones, monto_operado_centavos,
       riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id, detalle, vence)
    values
      (v_tenant, v_modelo, 'anio_completo', date '2026-01-01', date '2026-12-31',
       1, 1, 1, 100, 20, 70, v_medio, '{}'::jsonb, current_date + 365);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: entró una evaluación cuyo residual no es inherente menos mitigación';

  -- 6. Proyectados no carga periodo histórico.
  v_rechazo := false;
  begin
    insert into evaluaciones_entidad
      (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
       total_clientes, total_operaciones, monto_operado_centavos,
       riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id, detalle, vence)
    values
      (v_tenant, v_modelo, 'proyectados', date '2026-01-01', date '2026-12-31',
       1, 1, 1, 10, 0, 10, v_bajo, '{}'::jsonb, current_date + 365);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: una evaluación con datos proyectados cargó periodo histórico';

  -- 7. Append-only: la fila que decide la auditoría no se reescribe.
  v_rechazo := false;
  begin
    update evaluaciones_entidad set riesgo_residual = 0, mitigacion_aplicada = 100
     where id = v_eval;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se editó una evaluación de entidad ya asentada';

  -- 8. Contra un borrador, no: el obligado no aprobó esa metodología.
  v_rechazo := false;
  begin
    insert into evaluaciones_entidad
      (tenant_id, modelo_id, base_informacion, periodo_inicio, periodo_fin,
       total_clientes, total_operaciones, monto_operado_centavos,
       riesgo_inherente, mitigacion_aplicada, riesgo_residual, grado_id, detalle, vence)
    values
      (v_tenant, v_modelo2, 'anio_completo', date '2026-01-01', date '2026-12-31',
       1, 1, 1, 10, 0, 10, v_bajo, '{}'::jsonb, current_date + 365);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se evaluó la entidad contra un modelo en borrador';

  -- 9. La base sigue cuadrando con el inventario de privilegios.
  select string_agg(tabla || ': ' || problema, ' · ')
    into v_problemas from app.verificar_privilegios_declarados();
  assert v_problemas is null, 'ASERCIÓN 9: privilegios sin declarar: ' || coalesce(v_problemas, '');
  perform 1 from app.verificar_privilegios_por_omision() limit 1;
  assert not found, 'ASERCIÓN 9b: privilegios por omisión pendientes';

  raise notice '✓ Evaluación de entidad: escala monótona y congelada, nivel del mismo modelo, residual como resta, append-only, solo contra vigente';
end $$;
