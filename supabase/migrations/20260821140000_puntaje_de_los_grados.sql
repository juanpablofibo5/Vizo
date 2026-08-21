-- ---------------------------------------------------------------------------
-- Cada grado de la escala dice desde qué puntaje empieza
-- ---------------------------------------------------------------------------
-- Hueco encontrado al construir el motor, un día después del rediseño.
--
-- `grados_riesgo` tenía la escala —cuántos grados, en qué orden, cuál es el
-- alto— pero no CÓMO se llega a cada uno. Sin eso el motor puede calcular un
-- puntaje y no puede decir qué grado le corresponde: quedaría a criterio de
-- alguien, cada vez, que es justo lo contrario de un modelo.
--
-- El umbral de cada grado es del OBLIGADO, no de VIZO (ADR-21): la columna
-- nace obligatoria y sin valor por omisión. VIZO no sugiere dónde empieza el
-- riesgo alto.
--
-- Art. 10 Septies 1, fracción II: la metodología debe establecer «un método de
-- medición que asigne valores». Los valores los asigna el método; el corte
-- entre grados es la otra mitad de la misma decisión.

alter table grados_riesgo
  add column puntaje_minimo numeric(10,3);

comment on column grados_riesgo.puntaje_minimo is
  'Puntaje a partir del cual aplica este grado. Lo define el obligado como parte de su método de medición (Art. 10 Septies 1 fr. II); VIZO no propone cortes. El grado de menor orden empieza en 0: por debajo de eso no hay riesgo que clasificar.';

-- La escala tiene que ser monótona: un grado más severo no puede empezar por
-- debajo de uno más leve, o el mismo puntaje caería en dos grados y «cuál
-- aplica» dejaría de tener respuesta. Y el primero empieza en cero, porque un
-- puntaje por debajo del mínimo no tendría grado — y el motor devolvería un
-- hueco donde sí hay datos para clasificar.
create or replace function app.escala_de_riesgo_monotona()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previo numeric;
  v_orden_min smallint;
begin
  if new.puntaje_minimo is null then
    return new;
  end if;

  select min(orden) into v_orden_min
    from public.grados_riesgo where tenant_id = new.tenant_id;

  if new.orden <= coalesce(v_orden_min, new.orden) and new.puntaje_minimo <> 0 then
    raise exception
      'El grado de menor orden de la escala debe empezar en 0: un puntaje por debajo del mínimo no tendría grado que le corresponda.'
      using errcode = 'check_violation';
  end if;

  select max(puntaje_minimo) into v_previo
    from public.grados_riesgo
   where tenant_id = new.tenant_id and orden < new.orden and id <> new.id;

  if v_previo is not null and new.puntaje_minimo <= v_previo then
    raise exception
      'Este grado empieza en % y uno de orden menor ya empezaba en %. La escala tiene que ser creciente, o un mismo puntaje caería en dos grados.',
      new.puntaje_minimo, v_previo
      using errcode = 'check_violation';
  end if;

  select min(puntaje_minimo) into v_previo
    from public.grados_riesgo
   where tenant_id = new.tenant_id and orden > new.orden and id <> new.id;

  if v_previo is not null and new.puntaje_minimo >= v_previo then
    raise exception
      'Este grado empieza en % y uno de orden mayor empieza en %. La escala tiene que ser creciente.',
      new.puntaje_minimo, v_previo
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger grado_riesgo_escala_monotona
  before insert or update on grados_riesgo
  for each row execute function app.escala_de_riesgo_monotona();

-- Un modelo no se activa con la escala a medias: si algún grado no dice desde
-- qué puntaje aplica, el motor no puede clasificar y devolvería un hueco sobre
-- un obligado que cree tener su modelo listo.
create or replace function app.modelo_riesgo_activable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grados int; v_altos int; v_factores int; v_minimo int; v_sin_puntaje int;
begin
  if new.estado <> 'vigente' or old.estado = 'vigente' then
    return new;
  end if;

  select (valor #>> '{}')::int into v_minimo
    from public.parametros_motor
   where clave = 'minimo_clasificaciones_riesgo' and actividad_id is null
   order by vigente_desde desc limit 1;

  select count(*), count(*) filter (where es_alto), count(*) filter (where puntaje_minimo is null)
    into v_grados, v_altos, v_sin_puntaje
    from public.grados_riesgo where tenant_id = new.tenant_id;

  if v_grados < coalesce(v_minimo, 3) then
    raise exception
      'La escala de Grado de Riesgo tiene % clasificación(es) y el Art. 23 Bis exige al menos %. Los intermedios son libres; el piso no.',
      v_grados, coalesce(v_minimo, 3)
      using errcode = 'check_violation';
  end if;

  if v_altos = 0 then
    raise exception
      'Ningún grado está marcado como alto. De ese valor cuelgan las medidas reforzadas de los Arts. 23 Ter 3, 23 Ter 4 y la aprobación de directivo del 23 Ter 5: sin él, esas obligaciones no se dispararían nunca.'
      using errcode = 'check_violation';
  end if;

  if v_sin_puntaje > 0 then
    raise exception
      '% grado(s) de la escala no dicen desde qué puntaje aplican. Sin ese corte el motor calcula un puntaje y no puede decir qué grado le toca.',
      v_sin_puntaje
      using errcode = 'check_violation';
  end if;

  select count(*) into v_factores
    from public.factores_modelo where modelo_id = new.id;

  if v_factores = 0 then
    raise exception
      'Este modelo no tiene ningún factor configurado. VIZO no propone factores ni ponderaciones (ADR-21): los captura el obligado. Un modelo vacío no puede clasificar a nadie, y activarlo produciría grados que nadie decidió.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

grant update (puntaje_minimo) on grados_riesgo to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('grados_riesgo','authenticated','UPDATE','puntaje_minimo',
   'POR COLUMNA: el corte de cada grado, que define el obligado con su método de medición');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_modelo uuid; v_alto uuid; v_elem uuid;
  v_rechazo boolean; v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('PGR270301AB1', 'Aserción puntaje de grados', 'moral') returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-puntaje@ejemplo.mx')
  returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Puntaje', 'asercion-puntaje@ejemplo.mx');

  select id into v_elem from elementos_riesgo where clave = 'geografia';
  insert into modelos_riesgo (tenant_id, version, metodo_medicion)
  values (v_tenant, 1, 'suma_ponderada') returning id into v_modelo;
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Domicilio en jurisdicción señalada', 40);

  -- 1. El grado de menor orden no puede empezar arriba de cero.
  v_rechazo := false;
  begin
    insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde, puntaje_minimo)
    values (v_tenant, 'bajo', 'Bajo', 1, false, date '2027-03-01', 10);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'El primer grado empezó arriba de cero: un puntaje menor no tendría grado.';
  end if;

  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde, puntaje_minimo)
  values (v_tenant, 'bajo', 'Bajo', 1, false, date '2027-03-01', 0);
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde, puntaje_minimo)
  values (v_tenant, 'medio', 'Medio', 2, false, date '2027-03-01', 35);

  -- 2. Una escala que no crece: el mismo puntaje caería en dos grados.
  v_rechazo := false;
  begin
    insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde, puntaje_minimo)
    values (v_tenant, 'alto', 'Alto', 3, true, date '2027-03-01', 20);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'La escala aceptó un grado más severo que empieza por debajo de uno más leve.';
  end if;

  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, vigente_desde, puntaje_minimo)
  values (v_tenant, 'alto', 'Alto', 3, true, date '2027-03-01', 70) returning id into v_alto;

  -- 3. Con la escala completa, el modelo activa.
  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  -- 4. Y si un grado se queda sin corte, no habría activado.
  update modelos_riesgo set estado = 'sustituido' where id = v_modelo;
  insert into modelos_riesgo (tenant_id, version, metodo_medicion)
  values (v_tenant, 2, 'suma_ponderada') returning id into v_modelo;
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Otro factor', 10);
  update grados_riesgo set puntaje_minimo = null where id = v_alto;

  v_rechazo := false;
  begin
    update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
           aprobado_por = v_user, aprobado_en = now() where id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un modelo se activó con un grado sin puntaje: el motor no podría clasificar.';
  end if;

  -- Limpieza.
  alter table factores_modelo disable trigger factor_modelo_congelado;
  delete from factores_modelo where tenant_id = v_tenant;
  alter table factores_modelo enable trigger factor_modelo_congelado;
  delete from modelos_riesgo  where tenant_id = v_tenant;
  delete from grados_riesgo   where tenant_id = v_tenant;
  delete from usuarios        where tenant_id = v_tenant;
  delete from auth.users      where id = v_user;
  delete from tenants         where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ escala: creciente, empieza en cero, y ningún modelo se activa con un grado sin corte';
end $$;
