-- ---------------------------------------------------------------------------
-- El expediente no se integra una vez: se revisa cada año
-- ---------------------------------------------------------------------------
-- Issue #11, segunda mitad. Exigible el 30 de noviembre de 2026 (Transitorio
-- Primero; el Art. 21 vive en el Capítulo III y ningún transitorio lo excluye).
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE EL TEXTO (✅ contrastado contra el DOF)
-- ────────────────────────────────────────────────────────────────────────────
--   «Quienes realicen Actividades Vulnerables VERIFICARÁN, CUANDO MENOS UNA VEZ
--    AL AÑO, que los expedientes de identificación de los Clientes o Usuarias
--    CON LOS QUE SE TENGA UNA RELACIÓN DE NEGOCIOS cuenten con todos los datos y
--    documentos previstos en el artículo 12 […] y SE ENCUENTREN ACTUALIZADOS…»
--
-- Y la definición que decide a quién le aplica, Art. 3 fr. XIV del mismo
-- Acuerdo —línea 55 del texto—:
--
--   «Relación de negocios, aquélla establecida de manera FORMAL Y HABITUAL entre
--    quien realiza una Actividad Vulnerable y sus Clientes o Usuarias,
--    EXCLUYENDO LOS ACTOS U OPERACIONES QUE SE CELEBREN OCASIONALMENTE…»
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ `relacion_negocios` SE DECLARA Y NO SE DEDUCE
-- ────────────────────────────────────────────────────────────────────────────
-- Sería fácil deducirla —«tiene más de una operación, luego es habitual»— y
-- sería inventar derecho. «Formal y habitual» es una calificación jurídica sobre
-- una relación concreta, no un conteo de filas, y quien la puede hacer es el
-- obligado. VIZO le enseña la definición y guarda su respuesta.
--
-- Nullable, con el mismo criterio que `tenants.tipo_persona`: NULL es «no lo
-- sabemos». Un cliente sin respuesta NO entra al ciclo anual y el portal lo
-- dice — porque marcarlo como ocasional por omisión escondería la obligación, y
-- marcarlo como relación de negocios inventaría trabajo que quizá no toca.

alter table clientes_finales
  add column relacion_negocios boolean;

comment on column clientes_finales.relacion_negocios is
  'Si con este cliente hay una Relación de negocios en el sentido del Art. 3 fr. XIV del Acuerdo 115/2026: formal y habitual, excluyendo los actos ocasionales. Lo declara el obligado, no lo deduce el sistema: es una calificación jurídica, no un conteo de operaciones. NULL = sin declarar, y por tanto fuera del ciclo anual del Art. 21 hasta que se responda.';

-- ---------------------------------------------------------------------------
-- La verificación anual, con su evidencia
-- ---------------------------------------------------------------------------
alter table expedientes
  add column verificado_en date,
  add column verificado_por uuid references usuarios(id),
  -- La completitud calculada EN EL MOMENTO de verificar. No es redundante con
  -- `completitud`: aquella se congela cuando el expediente se aprueba —una
  -- aprobación no se degrada sola— y esta dice qué se vio el día que alguien
  -- afirmó que el expediente seguía en orden.
  add column verificado_completitud jsonb;

comment on column expedientes.verificado_en is
  'Fecha de la última verificación anual del Art. 21. NULL = nunca verificado: el reloj corre entonces desde la aprobación.';

-- ---------------------------------------------------------------------------
-- Una verificación no puede contradecir su propia evidencia
-- ---------------------------------------------------------------------------
-- El Art. 21 pide verificar que el expediente CUENTE con todo y esté
-- ACTUALIZADO. Una verificación registrada sobre un expediente al que le falta
-- algo no es una verificación: es una afirmación falsa con fecha y firma.
--
-- Esto es lo más cerca que la base puede estar de impedirlo. La completitud la
-- calcula el dominio en TypeScript —la base no sabe de antigüedades ni de
-- catálogos por vigencia—, así que lo que se garantiza aquí es que el registro
-- sea COHERENTE: quien verifique tiene que guardar la evidencia, y la evidencia
-- tiene que decir «completo». Un obligado que quisiera mentir tendría que
-- escribir la mentira, y quedaría contradicha por sus propios documentos en la
-- misma base. De invisible pasa a auditable.
-- El `is not null` de la evidencia NO es redundante, y omitirlo fue el primer
-- error de esta migración: con la columna en NULL, `->>'estatus' = 'completo'`
-- vale NULL, y **un CHECK que da NULL se cumple**. La restricción existía y
-- dejaba pasar exactamente el caso que venía a impedir. Es el mismo modo de
-- falla de todo este proyecto —protección plausible que no protege— y aquí lo
-- cazó su propia aserción.
alter table expedientes
  add constraint verificacion_exige_su_evidencia check (
    (verificado_en is null and verificado_por is null and verificado_completitud is null)
    or (verificado_en is not null and verificado_por is not null
        and verificado_completitud is not null
        and verificado_completitud->>'estatus' = 'completo')
  );

create index on expedientes (tenant_id, verificado_en);

-- ---------------------------------------------------------------------------
-- Registrar la verificación
-- ---------------------------------------------------------------------------
create or replace function app.expediente_verificar(
  p_expediente   uuid,
  p_completitud  jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_exp record;
begin
  if not app.es_admin() then
    raise exception 'Solo un usuario con rol admin puede registrar la verificación anual de un expediente'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_exp from public.expedientes
   where id = p_expediente and tenant_id = app.tenant_id();

  if not found then
    raise exception 'Expediente no encontrado en este tenant'
      using errcode = 'no_data_found';
  end if;

  -- Verificar es afirmar que el expediente está en orden HOY. Sobre uno que
  -- nadie ha aprobado no hay nada que reafirmar: primero se integra y se
  -- aprueba, después se reverifica cada año.
  if v_exp.estatus <> 'aprobado' then
    raise exception 'La verificación anual es sobre un expediente aprobado, y este está en «%»', v_exp.estatus
      using errcode = 'check_violation';
  end if;

  -- HOY EN MÉXICO, no en UTC. La base corre en UTC y `current_date` a las 18:00
  -- de Mérida ya dice mañana: el mismo hallazgo de la auditoría de la semana 6
  -- que produjo `hoyEnMexico`. Aquí importa porque de esta fecha cuelga el
  -- vencimiento del año siguiente, y un día de corrimiento se hereda para
  -- siempre. Se calcula adentro y no se recibe: así no depende de que quien
  -- llame se acuerde.
  update public.expedientes
     set verificado_en = (now() at time zone 'America/Mexico_City')::date,
         verificado_por = auth.uid(),
         verificado_completitud = p_completitud
   where id = p_expediente;

  perform app.bitacora_registrar(
    v_exp.tenant_id, 'expediente.verificado', 'expediente', p_expediente,
    -- REGLA DURA 3: cuántos requisitos, no cuáles valores.
    jsonb_build_object(
      'verificado_en', (now() at time zone 'America/Mexico_City')::date,
      'cubiertos', p_completitud->'cubiertos',
      'total_obligatorios', p_completitud->'totalObligatorios'
    )
  );
end;
$$;

revoke all on function app.expediente_verificar(uuid, jsonb) from public;
grant execute on function app.expediente_verificar(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Qué expedientes deben su revisión
-- ---------------------------------------------------------------------------
-- Vista con `security_invoker` — la lección de la migración 20260813020000:
-- una vista sin él evalúa RLS como su DUEÑO, que es `postgres` y tiene
-- BYPASSRLS, así que enseñaría los expedientes de todos los obligados.
create view expedientes_por_reverificar
with (security_invoker = true) as
  select e.tenant_id,
         e.id as expediente_id,
         e.cliente_id,
         e.verificado_en,
         -- Desde cuándo corre el año: la última verificación o, si nunca hubo,
         -- la aprobación. Sin aprobación no hay expediente que reverificar.
         --
         -- `at time zone 'America/Mexico_City'` NO es decoración: `aprobado_en`
         -- es timestamptz y la base corre en UTC, así que una aprobación de las
         -- 19:00 de Mérida se convertiría en la fecha del día siguiente y el
         -- aniversario quedaría corrido un día para siempre. Lo encontró el
         -- test de esta migración, no una revisión.
         coalesce(e.verificado_en, (e.aprobado_en at time zone 'America/Mexico_City')::date) as desde,
         (coalesce(e.verificado_en, (e.aprobado_en at time zone 'America/Mexico_City')::date)
           + interval '1 year')::date as vence
    from expedientes e
    join clientes_finales c on c.tenant_id = e.tenant_id and c.id = e.cliente_id
   where e.estatus = 'aprobado'
     and e.aprobado_en is not null
     -- Solo Relación de negocios. El acto ocasional no entra al ciclo anual, y
     -- el cliente sin declarar tampoco: de ese no se sabe.
     and c.relacion_negocios is true;

comment on view expedientes_por_reverificar is
  'Expedientes aprobados de clientes con Relación de negocios, con la fecha en que vence su revisión anual (Art. 21 del Acuerdo 115/2026). Incluye los que todavía no vencen: quien consulta decide el corte, para que la misma vista sirva al aviso temprano y al vencido.';

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------
grant select on expedientes_por_reverificar to authenticated;

grant update (relacion_negocios) on clientes_finales to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('clientes_finales','authenticated','UPDATE','relacion_negocios',
   'POR COLUMNA: el obligado declara si hay Relación de negocios (Art. 3 fr. XIV)');

-- `clientes_finales` ya tenía UPDATE de tabla declarado, así que el grant por
-- columna de arriba es redundante en la práctica. Se declara igual: el día que
-- el UPDATE de tabla se acote, esta línea es la que evita que el portal deje de
-- poder responder la pregunta sin que nadie sepa por qué.

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
  v_usuario uuid;
  v_cliente uuid;
  v_exp uuid;
  v_rechazo boolean;
  v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('REV010101AAA', 'Aserción reverificación', 'moral') returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-reverificacion@ejemplo.mx')
  returning id into v_usuario;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_usuario, v_tenant, 'admin', 'Aserción', 'asercion-reverificacion@ejemplo.mx');

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'moral', 'REVC010101AA', 'Cliente de aserción', 'MX')
  returning id into v_cliente;

  insert into expedientes (tenant_id, cliente_id, actividad_id, estatus, aprobado_por, aprobado_en)
  select v_tenant, v_cliente, av.id, 'aprobado', v_usuario, now() - interval '2 years'
    from actividades_vulnerables av where av.fraccion = 'V_BIS'
  returning id into v_exp;

  -- 1. Una verificación sin su evidencia.
  v_rechazo := false;
  begin
    update expedientes set verificado_en = current_date, verificado_por = v_usuario
     where id = v_exp;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se registró una verificación sin guardar la completitud que la justifica.';
  end if;

  -- 2. Una verificación cuya evidencia dice que el expediente está incompleto.
  v_rechazo := false;
  begin
    update expedientes
       set verificado_en = current_date, verificado_por = v_usuario,
           verificado_completitud = '{"estatus":"incompleto","cubiertos":9,"totalObligatorios":13}'::jsonb
     where id = v_exp;
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se registró como verificado un expediente cuya propia evidencia dice que está incompleto.';
  end if;

  -- El camino bueno pasa.
  update expedientes
     set verificado_en = current_date, verificado_por = v_usuario,
         verificado_completitud = '{"estatus":"completo","cubiertos":13,"totalObligatorios":13}'::jsonb
   where id = v_exp;

  -- 3. Un cliente SIN declarar relación de negocios no entra al ciclo.
  if exists (select 1 from expedientes_por_reverificar where expediente_id = v_exp) then
    raise exception 'Un cliente sin declarar Relación de negocios entró al ciclo anual: se le inventó una obligación.';
  end if;

  update clientes_finales set relacion_negocios = false where id = v_cliente;
  if exists (select 1 from expedientes_por_reverificar where expediente_id = v_exp) then
    raise exception 'Un cliente ocasional entró al ciclo anual, y el Art. 21 lo excluye expresamente.';
  end if;

  -- 4. Con Relación de negocios sí entra, y su vencimiento es un año después.
  update clientes_finales set relacion_negocios = true where id = v_cliente;
  if not exists (
    select 1 from expedientes_por_reverificar
     where expediente_id = v_exp and vence = (current_date + interval '1 year')::date
  ) then
    raise exception 'El expediente verificado hoy no vence dentro de un año.';
  end if;

  delete from expedientes where id = v_exp;
  delete from clientes_finales where id = v_cliente;
  delete from usuarios where id = v_usuario;
  delete from auth.users where id = v_usuario;
  delete from tenants where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado tras la reverificación:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ reverificación anual: solo Relación de negocios declarada, y ninguna verificación sin su evidencia';
end $$;
