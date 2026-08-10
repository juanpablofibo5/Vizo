-- ---------------------------------------------------------------------------
-- Ninguna ruta de Storage apunta fuera de la carpeta del obligado
-- ---------------------------------------------------------------------------
-- AUDITORÍA DE LA SEMANA 10. `app.aviso_registrar_acuse` recibía la ruta como
-- texto libre y la guardaba sin mirarla. Nada impedía registrar un acuse que
-- apunta a la carpeta de OTRO obligado.
--
-- Lo que eso produce no es un error: es un aviso en estado `presentado` cuya
-- prueba de cumplimiento señala un archivo que ni siquiera se puede leer —las
-- políticas de Storage lo impiden—. El sistema afirma que se cumplió y no puede
-- respaldarlo. Y el estado ya no se corrige: a partir de `aprobado` la fila deja
-- de ser modificable.
--
-- Las políticas de Storage YA aíslan por carpeta: leen
-- storage.foldername(name)[1] = app.tenant_id(). Lo que faltaba era que la BASE
-- de datos exigiera lo mismo de las rutas que guarda. Dos sistemas que
-- discrepan sobre dónde vive un archivo es cómo se llega a una ruta que apunta
-- a la nada.
--
-- Va como CHECK y no como validación en TypeScript por la preferencia de
-- CLAUDE.md: el nivel 2 no depende de que alguien llame a la función correcta.

alter table avisos
  add constraint avisos_acuse_ruta_del_obligado
  check (acuse_storage_path is null
         or acuse_storage_path like tenant_id::text || '/%'),
  add constraint avisos_xml_ruta_del_obligado
  check (xml_storage_path is null
         or xml_storage_path like tenant_id::text || '/%');

alter table aviso_lotes
  add constraint aviso_lotes_ruta_del_obligado
  check (storage_path like tenant_id::text || '/%');

comment on constraint avisos_acuse_ruta_del_obligado on avisos is
  'La ruta del acuse empieza con el tenant_id, igual que exigen las políticas del bucket. Un acuse fuera de la carpeta propia es una prueba de cumplimiento ilegible.';

-- ---------------------------------------------------------------------------
-- Aserción: se comprueba que el CHECK realmente rechaza
-- ---------------------------------------------------------------------------
-- Declararlo no basta. Un CHECK con la expresión mal escrita —`like` sin `%`,
-- una comparación que siempre da true— se crea igual y no protege nada.
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
    values ('RUT010101AAA', 'Aserción rutas', '{}'::jsonb)
    returning id into v_tenant;

    begin
      insert into avisos (tenant_id, actividad_id, periodo, tipo, formato_aviso_id,
                          xml_storage_path)
      values (v_tenant, v_actividad, '2026-05-01', 'normal', v_formato,
              '00000000-0000-0000-0000-000000000000/ajeno.xml');
    exception
      when check_violation then v_rechazo := true;
    end;

    -- Se deshace sola: la aserción no deja obligados de prueba en la base.
    -- Misma técnica que la migración 019 — SQLSTATE propio para que un fallo
    -- real, que lleva otro código, siga saliendo hacia arriba.
    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;
  end;

  if not v_rechazo then
    raise exception 'El CHECK de rutas no rechazó una ruta de otro obligado. Declararlo no basta: hay que comprobar que muerde.';
  end if;

  if exists (select 1 from tenants where rfc = 'RUT010101AAA') then
    raise exception 'La aserción dejó datos en la base: tenía que revertirse sola';
  end if;

  raise notice '✓ rutas de Storage atadas al obligado, comprobado con una ruta ajena';
end $$;
