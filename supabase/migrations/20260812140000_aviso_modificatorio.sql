-- ---------------------------------------------------------------------------
-- El aviso modificatorio
-- ---------------------------------------------------------------------------
-- Corregir un aviso ya presentado no es volver a generarlo: es presentar OTRO
-- que dice cuál corrige y por qué. El XSD lo tiene previsto desde siempre
-- (`modificatorio_type`), y `avisos.tipo` ya lo contemplaba.
--
-- Al construirlo apareció un hueco que no se veía: el bloque exige
-- `folio_modificacion` con patrón \d{4}-\d{1,9} — el folio que el SPPLD asigna
-- al aceptar el aviso. VIZO guardaba el ACUSE en PDF y no el folio, así que un
-- modificatorio era imposible de generar. El dato que hace falta meses después
-- estaba enfrente y nadie lo pidió.

-- ---------------------------------------------------------------------------
-- 1. El folio del acuse
-- ---------------------------------------------------------------------------
alter table avisos
  add column acuse_folio text,
  -- El patrón sale del XSD, no de la imaginación. Un folio con otra forma
  -- produce un modificatorio que no valida, y eso se descubriría al presentar.
  add constraint avisos_acuse_folio_forma
    check (acuse_folio is null or acuse_folio ~ '^\d{4}-\d{1,9}$'),
  -- El acuse y su folio van juntos: uno sin el otro es media evidencia. Con el
  -- PDF pero sin folio no se puede corregir; con folio pero sin PDF no se puede
  -- demostrar.
  add constraint avisos_acuse_completo
    check ((acuse_storage_path is null) = (acuse_folio is null));

comment on column avisos.acuse_folio is
  'Folio que el SPPLD asignó al aceptar el aviso. Sin él no se puede presentar un modificatorio: el XSD lo exige para decir cuál aviso se corrige.';

-- ---------------------------------------------------------------------------
-- 2. Qué aviso corrige
-- ---------------------------------------------------------------------------
alter table avisos
  add column modifica_a uuid,
  -- FK COMPUESTA: un modificatorio no puede colgar del aviso de otro obligado.
  add constraint avisos_modifica_fk
    foreign key (tenant_id, modifica_a) references avisos (tenant_id, id),
  -- Los dos sentidos. Un modificatorio SIN original no dice qué corrige; un
  -- aviso normal CON original es una contradicción que nadie sabría leer.
  add constraint avisos_modifica_solo_modificatorio
    check ((tipo = 'modificatorio') = (modifica_a is not null)),
  -- Corregirse a sí mismo es un ciclo que rompe cualquier lectura del
  -- historial.
  add constraint avisos_no_se_modifica_a_si_mismo
    check (modifica_a is null or modifica_a <> id);

-- ---------------------------------------------------------------------------
-- 3. Un periodo admite VARIOS modificatorios
-- ---------------------------------------------------------------------------
-- `avisos_unico_por_periodo` cubría (tenant, actividad, periodo, tipo), lo que
-- permite un solo modificatorio por periodo. Eso está mal: si el primero
-- también sale con un dato equivocado, hay que corregirlo otra vez, y la base
-- lo impediría — obligando a no presentar o a falsear el tipo.
--
-- La unicidad sigue valiendo para todo lo demás: dos avisos normales del mismo
-- periodo sí son un error.
drop index avisos_unico_por_periodo;

create unique index avisos_unico_por_periodo
  on avisos (tenant_id, actividad_id, periodo, tipo)
  where tipo <> 'modificatorio';

-- ---------------------------------------------------------------------------
-- 4. El acuse ahora pide su folio
-- ---------------------------------------------------------------------------
create or replace function app.aviso_registrar_acuse(
  p_aviso uuid, p_storage_path text, p_folio text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_aviso record;
begin
  if not app.es_admin() then
    raise exception 'Solo un usuario con rol admin puede registrar el acuse'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_aviso from public.avisos
   where id = p_aviso and tenant_id = app.tenant_id();

  if not found then
    raise exception 'Aviso no encontrado en este tenant'
      using errcode = 'no_data_found';
  end if;

  if v_aviso.estatus <> 'aprobado' then
    raise exception 'El acuse solo se registra sobre un aviso aprobado y presentado (estatus actual: %)', v_aviso.estatus
      using errcode = 'check_violation';
  end if;

  update public.avisos
     set estatus = 'presentado',
         acuse_storage_path = p_storage_path,
         acuse_folio = p_folio,
         acuse_registrado_en = now()
   where id = p_aviso;

  perform app.bitacora_registrar(
    v_aviso.tenant_id, 'aviso.acuse_registrado', 'aviso', p_aviso,
    jsonb_build_object('periodo', v_aviso.periodo, 'folio', p_folio)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_actividad uuid; v_formato uuid; v_aviso uuid;
  v_folio_malo boolean := false;
  v_sin_original boolean := false;
  v_dos_modificatorios boolean := true;
begin
  select id into v_actividad from actividades_vulnerables where fraccion = 'V_BIS';
  select id into v_formato from formatos_aviso where actividad_id = v_actividad limit 1;

  begin
    insert into tenants (rfc, razon_social, domicilio)
    values ('MOD010101AAA', 'Aserción modificatorio', '{}'::jsonb) returning id into v_tenant;
    insert into actividades_tenant (tenant_id, actividad_id) values (v_tenant, v_actividad);

    insert into avisos (tenant_id, actividad_id, periodo, tipo, formato_aviso_id,
                        acuse_storage_path, acuse_folio)
    values (v_tenant, v_actividad, '2026-05-01', 'normal', v_formato,
            v_tenant::text || '/acuse.pdf', '2026-12345')
    returning id into v_aviso;

    -- Un folio con otra forma no entra.
    begin
      update avisos set acuse_folio = 'ABC-1' where id = v_aviso;
    exception when check_violation then v_folio_malo := true;
    end;

    -- Un modificatorio sin decir qué corrige, tampoco.
    begin
      insert into avisos (tenant_id, actividad_id, periodo, tipo, formato_aviso_id)
      values (v_tenant, v_actividad, '2026-05-01', 'modificatorio', v_formato);
    exception when check_violation then v_sin_original := true;
    end;

    -- Y DOS modificatorios del mismo periodo sí se pueden: corregir dos veces
    -- es un caso real.
    begin
      insert into avisos (tenant_id, actividad_id, periodo, tipo, formato_aviso_id, modifica_a)
      values (v_tenant, v_actividad, '2026-05-01', 'modificatorio', v_formato, v_aviso),
             (v_tenant, v_actividad, '2026-05-01', 'modificatorio', v_formato, v_aviso);
    exception when unique_violation then v_dos_modificatorios := false;
    end;

    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;
  end;

  if not v_folio_malo then
    raise exception 'El CHECK del folio aceptó una forma que el XSD rechaza.';
  end if;
  if not v_sin_original then
    raise exception 'Se pudo guardar un modificatorio sin decir qué aviso corrige.';
  end if;
  if not v_dos_modificatorios then
    raise exception 'No se pudieron guardar dos modificatorios del mismo periodo, y corregir dos veces es un caso real.';
  end if;
  if exists (select 1 from tenants where rfc = 'MOD010101AAA') then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  raise notice '✓ modificatorio: folio con la forma del XSD, original obligatorio, y varios por periodo';
end $$;
