-- ---------------------------------------------------------------------------
-- El obligado se puede actualizar — pero solo su fecha de alta, y solo el admin
-- ---------------------------------------------------------------------------
-- DEFECTO ENCONTRADO AL PONER EL PORTAL EN PRODUCCIÓN.
--
-- La pantalla de Configuración tiene un formulario para registrar la fecha de
-- alta ante la autoridad. Nunca funcionó, en ningún ambiente:
--
--   · `tenants` tenía UNA política, «ver mi tenant», y es de SELECT;
--   · `authenticated` tenía UN privilegio sobre la tabla, y es SELECT.
--
-- Faltaban las dos capas, no una. El UPDATE tocaba 0 filas y la acción lo leía
-- como «solo un administrador puede cambiar su configuración» — un mensaje
-- plausible que apunta a la causa equivocada: ningún rol podía, tampoco el
-- admin. Es el modo de falla de la regla dura 6, esta vez en la capa de
-- permisos: nada reventó y la explicación mandaba a buscar donde no era.
--
-- Pasó desapercibido porque en local la fecha llega por `seed.sql`, así que el
-- campo SIEMPRE se veía lleno y nadie apretó el botón sobre uno vacío. En
-- producción el obligado se creó antes de que la columna existiera, quedó en
-- NULL, y el primer intento real de usar el formulario lo destapó.

-- ---------------------------------------------------------------------------
-- 1. El privilegio, POR COLUMNA
-- ---------------------------------------------------------------------------
-- `grant update on tenants` a secas dejaría a un admin cambiar su propio RFC y
-- su razón social. El RFC es la unidad de cobro y la llave del aislamiento: que
-- el cliente pueda reescribirlo desde su portal no es una función, es un
-- agujero. El privilegio por columna hace que el resto ni siquiera se pueda
-- expresar — nivel 1 de la preferencia de CLAUDE.md, no una validación que
-- alguien tenga que acordarse de escribir.
grant update (fecha_alta_autoridad) on tenants to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La política
-- ---------------------------------------------------------------------------
-- Su propio obligado y solo si es admin. `with check` además de `using` para
-- que tampoco pueda mover la fila HACIA otro tenant.
create policy "admin actualiza su obligado" on tenants
  for update to authenticated
  using (id = app.tenant_id() and app.es_admin())
  with check (id = app.tenant_id() and app.es_admin());

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
-- Cuatro comprobaciones, porque la política sola no dice nada sin el privilegio
-- y el privilegio solo no dice nada sin la política. Es justo la combinación
-- que faltaba.
do $$
declare
  v_a uuid; v_b uuid; v_admin uuid; v_capturista uuid; v_actividad uuid;
  v_admin_pudo boolean := false;
  v_capturista_pudo boolean := true;
  v_rfc_protegido boolean := false;
  v_ajeno_pudo boolean := true;
  v_filas int;
begin
  select id into v_actividad from actividades_vulnerables where fraccion = 'V_BIS';

  begin
    insert into tenants (rfc, razon_social, domicilio)
    values ('OBA010101AAA', 'Aserción obligado A', '{}'::jsonb) returning id into v_a;
    insert into tenants (rfc, razon_social, domicilio)
    values ('OBB020202BBB', 'Aserción obligado B', '{}'::jsonb) returning id into v_b;

    insert into auth.users (id, instance_id, aud, role, email,
                            confirmation_token, recovery_token, email_change_token_new,
                            email_change, email_change_token_current, phone_change,
                            phone_change_token, reauthentication_token)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'asercion-obligado-admin@vizo.test',
            '', '', '', '', '', '', '', '')
    returning id into v_admin;
    insert into usuarios (id, tenant_id, rol, nombre, email)
    values (v_admin, v_a, 'admin', 'Admin', 'asercion-obligado-admin@vizo.test');

    insert into auth.users (id, instance_id, aud, role, email,
                            confirmation_token, recovery_token, email_change_token_new,
                            email_change, email_change_token_current, phone_change,
                            phone_change_token, reauthentication_token)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'asercion-obligado-capt@vizo.test',
            '', '', '', '', '', '', '', '')
    returning id into v_capturista;
    insert into usuarios (id, tenant_id, rol, nombre, email)
    values (v_capturista, v_a, 'capturista', 'Capturista', 'asercion-obligado-capt@vizo.test');

    -- (a) El admin SÍ puede registrar la fecha de su obligado.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated',
        'app_metadata', json_build_object('tenant_id', v_a::text, 'rol', 'admin'))::text, true);
    set local role authenticated;
    update tenants set fecha_alta_autoridad = date '2026-03-09' where id = v_a;
    get diagnostics v_filas = row_count;
    v_admin_pudo := v_filas = 1;

    -- (b) Y NO puede tocar el RFC: el privilegio es por columna.
    begin
      update tenants set rfc = 'HACK010101AAA' where id = v_a;
    exception when insufficient_privilege then v_rfc_protegido := true;
    end;

    -- (c) Ni el obligado de otro.
    update tenants set fecha_alta_autoridad = date '2020-01-01' where id = v_b;
    get diagnostics v_filas = row_count;
    v_ajeno_pudo := v_filas > 0;

    reset role;

    -- (d) Un capturista no cambia la configuración del obligado.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_capturista::text, 'role', 'authenticated',
        'app_metadata', json_build_object('tenant_id', v_a::text, 'rol', 'capturista'))::text, true);
    set local role authenticated;
    update tenants set fecha_alta_autoridad = date '2019-01-01' where id = v_a;
    get diagnostics v_filas = row_count;
    v_capturista_pudo := v_filas > 0;

    reset role;

    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;
  end;

  if not v_admin_pudo then
    raise exception 'El admin no pudo registrar la fecha de alta de su propio obligado: falta el grant o la política.';
  end if;
  if not v_rfc_protegido then
    raise exception 'Un admin pudo cambiar el RFC de su obligado desde el portal. El RFC es la unidad de cobro y la llave del aislamiento.';
  end if;
  if v_ajeno_pudo then
    raise exception 'Un admin pudo actualizar el obligado de OTRO. La política no ata la fila al tenant de la sesión.';
  end if;
  if v_capturista_pudo then
    raise exception 'Un capturista pudo cambiar la configuración del obligado.';
  end if;
  if exists (select 1 from tenants where rfc in ('OBA010101AAA', 'OBB020202BBB')) then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  raise notice '✓ obligado: el admin registra su fecha de alta; el RFC, el obligado ajeno y el capturista quedan fuera';
end $$;
