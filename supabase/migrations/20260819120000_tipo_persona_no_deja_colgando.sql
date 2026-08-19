-- ---------------------------------------------------------------------------
-- Cambiar la clase de persona no puede dejar colgando la estructura
-- ---------------------------------------------------------------------------
-- Hallazgo del 19 de agosto de 2026, al preparar un obligado de demo aparte
-- para fideicomisos.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LA ASIMETRÍA
-- ────────────────────────────────────────────────────────────────────────────
-- `app.estructura_del_obligado_admisible()` vigila el INSERT: una persona
-- moral no puede registrar una estructura del Anexo 2 Bis. Pero nada vigilaba
-- el camino inverso —registrar la estructura y DESPUÉS cambiar la clase de
-- persona—, así que un obligado podía quedar como `moral` conservando intacta
-- su estructura de fideicomiso.
--
-- Se comprobó contra producción antes de escribir esto: el UPDATE se aceptaba,
-- una fila afectada, una estructura colgando.
--
-- Es el patrón de siempre: la regla se aplica donde el dato NACE y se olvida
-- donde el dato CAMBIA. No revienta nada — deja un obligado cuya configuración
-- se contradice a sí misma, que es peor, porque las dos mitades se leen bien
-- por separado.
--
-- Se resuelve como el nivel 2 de la regla dura 6: lo impide la base, no la
-- pantalla. Una estructura no se borra desde la aplicación (no hay DELETE
-- concedido), así que el mensaje dice qué significa el caso en vez de sugerir
-- un botón que no existe.

create or replace function app.tipo_persona_coherente_con_estructura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_figura text;
  v_integrantes int;
  v_compatible boolean;
begin
  if new.tipo_persona is not distinct from old.tipo_persona then
    return new;
  end if;

  select e.tipo_figura::text,
         (select count(*) from public.integrantes_estructura i where i.estructura_id = e.id)
    into v_figura, v_integrantes
    from public.estructura_del_obligado e
   where e.tenant_id = new.id;

  -- Sin estructura registrada, la clase de persona se cambia libremente: es el
  -- caso normal del arranque, cuando todavía se está averiguando.
  if v_figura is null then
    return new;
  end if;

  v_compatible := (new.tipo_persona::text = 'fideicomiso' and v_figura = 'fideicomiso')
               or (new.tipo_persona::text = 'figura_juridica' and v_figura <> 'fideicomiso');

  if not v_compatible then
    raise exception
      'Este obligado ya tiene registrada una estructura del Capítulo II Ter (%, % integrante(s)) y cambiarlo a % la dejaría colgando: una clase de persona que no corresponde con el anexo que se envió al SAT. Si el obligado realmente es de otra clase, es otro obligado — no el mismo con la configuración cambiada.',
      v_figura, v_integrantes, new.tipo_persona
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger tenant_tipo_persona_coherente
  before update on tenants
  for each row execute function app.tipo_persona_coherente_con_estructura();

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant  uuid;
  v_est     uuid;
  v_rechazo boolean;
  v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('TPC260819AB1', 'Aserción tipo_persona vs estructura', 'fideicomiso')
  returning id into v_tenant;

  -- 1. Sin estructura, la clase de persona se cambia libremente.
  update tenants set tipo_persona = 'moral' where id = v_tenant;
  update tenants set tipo_persona = 'fideicomiso' where id = v_tenant;

  insert into estructura_del_obligado
    (tenant_id, tipo_figura, numero_referencia, fecha_constitucion, rfc,
     cotiza_en_bolsa, fideicomisarios_determinados)
  values (v_tenant, 'fideicomiso', 'F-ASERCION', '2020-01-01', 'TPC200101AB1', false, false)
  returning id into v_est;

  -- 2. Con estructura, volverse moral se rechaza…
  v_rechazo := false;
  begin
    update tenants set tipo_persona = 'moral' where id = v_tenant;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un obligado con estructura del Anexo 2 Bis se volvió persona moral y su estructura quedó colgando.';
  end if;

  -- 3. …y volverse otra figura jurídica también, porque su anexo es el 2 Ter.
  v_rechazo := false;
  begin
    update tenants set tipo_persona = 'figura_juridica' where id = v_tenant;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un fideicomiso con estructura del 2 Bis pasó a figura jurídica, cuyo anexo es el 2 Ter.';
  end if;

  -- 4. Lo demás del tenant se sigue actualizando con normalidad: el trigger
  --    vigila una columna, no congela la fila.
  update tenants set fecha_alta_autoridad = current_date where id = v_tenant;

  delete from estructura_del_obligado where id = v_est;
  delete from tenants where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ tipo_persona: no se cambia a una clase que contradiga la estructura ya registrada';
end $$;
