-- ---------------------------------------------------------------------------
-- Un aviso solo puede existir bajo una actividad que el obligado tenga
-- ---------------------------------------------------------------------------
-- AUDITORÍA DE F1.
--
-- `avisos.actividad_id` apuntaba a `actividades_vulnerables` a secas. Nada
-- impedía guardar un aviso bajo una fracción que el obligado NO tiene
-- contratada — y `actividadId` llega a la acción del servidor desde un campo
-- oculto del formulario, así que es entrada del atacante.
--
-- Lo que producía no era un error: era un aviso perfectamente válido
-- declarándole a la autoridad una actividad que el obligado no realiza.
--
-- La consulta del generador ya se corrigió, pero eso es el nivel 3 de la
-- preferencia de CLAUDE.md —una precondición— y depende de que todos pasen por
-- ahí. Esto es el nivel 2: la base no puede guardar la fila, venga de donde
-- venga.

alter table avisos
  drop constraint avisos_actividad_id_fkey,
  add constraint avisos_actividad_contratada_fk
    foreign key (tenant_id, actividad_id)
    references actividades_tenant (tenant_id, actividad_id);

comment on constraint avisos_actividad_contratada_fk on avisos is
  'El aviso cuelga de la actividad CONTRATADA por el obligado, no del catálogo global. Un aviso bajo una fracción que no ejerce declara ante la autoridad una actividad falsa.';

-- ---------------------------------------------------------------------------
-- Aserción: la restricción rechaza de verdad
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
  v_actividad uuid;
  v_formato uuid;
  v_rechazo boolean := false;
begin
  select id into v_actividad from actividades_vulnerables where fraccion = 'V_BIS';
  select id into v_formato from formatos_aviso where actividad_id = v_actividad limit 1;

  begin
    insert into tenants (rfc, razon_social, domicilio)
    values ('ACT010101AAA', 'Aserción actividad', '{}'::jsonb)
    returning id into v_tenant;

    -- El obligado existe pero NO contrata nada. Antes de esta migración, este
    -- INSERT pasaba sin quejarse.
    begin
      insert into avisos (tenant_id, actividad_id, periodo, tipo, formato_aviso_id)
      values (v_tenant, v_actividad, '2026-05-01', 'normal', v_formato);
    exception
      when foreign_key_violation then v_rechazo := true;
    end;

    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;
  end;

  if not v_rechazo then
    raise exception 'La FK aceptó un aviso de una actividad no contratada. Declararla no basta: hay que comprobar que muerde.';
  end if;

  if exists (select 1 from tenants where rfc = 'ACT010101AAA') then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  raise notice '✓ avisos: solo bajo actividad contratada, comprobado con un obligado sin actividades';
end $$;
