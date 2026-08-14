-- ---------------------------------------------------------------------------
-- Una operación que el aviso tiene que describir no se guarda a medias
-- ---------------------------------------------------------------------------
-- EL DEFECTO MÁS CARO ENCONTRADO HASTA AHORA, y venía del camino que usaría un
-- cliente de verdad.
--
-- El formulario de captura del portal no pedía el desarrollo inmobiliario, y
-- `operaciones.desarrollo_id` es nullable. `generarAviso` une contra
-- `desarrollos_inmobiliarios` con un INNER JOIN, así que la operación
-- desaparecía de la consulta.
--
-- Reproducido en `tests/aviso/operacion-sin-desarrollo.test.ts`: una operación
-- de $1,200,000 —muy por encima del umbral de $941,412.75—, evaluada por el
-- motor como reportable, con su alerta y su renglón en pantalla, producía un
-- **informe en cero**. El obligado presentaría «no operé» habiendo operado, con
-- acuse y todo.
--
-- Nada revienta, el número es plausible, y lo que produce es un AVISO OMITIDO:
-- la regla dura 6 en su forma más cara. No se vio antes porque `datos-demo.ts`
-- llena el desarrollo directamente — en local todo funcionaba.
--
-- Aquí van las capas 1 y 2. La 3 —que el generador se detenga en vez de
-- omitir— vive en `src/persistencia/aviso.ts`, y la 4 es el formulario.

-- ---------------------------------------------------------------------------
-- 1. Qué fracciones describen un desarrollo — dato de catálogo, no de código
-- ---------------------------------------------------------------------------
-- La Fr. V Bis lo exige porque su formato del SPPLD tiene un bloque
-- `<desarrollo>` obligatorio. La Fr. XV de arrendamiento no tiene ese bloque, y
-- exigirle un desarrollo la volvería incapturable. Como todo lo regulatorio,
-- esto es una fila, no un `if`.
alter table actividades_vulnerables
  add column requiere_desarrollo boolean not null default false;

comment on column actividades_vulnerables.requiere_desarrollo is
  'Si el formato del aviso de esta fracción describe un desarrollo inmobiliario. Cuando es cierto, una operación sin desarrollo no se puede guardar: saldría del aviso sin que nadie lo note.';

update actividades_vulnerables set requiere_desarrollo = true where fraccion = 'V_BIS';

-- ---------------------------------------------------------------------------
-- 2. La base lo impide
-- ---------------------------------------------------------------------------
-- Un CHECK no alcanza: la condición depende de OTRA tabla —la actividad—, y un
-- CHECK no puede consultar. El trigger es el nivel 2 disponible aquí.
create or replace function app.operacion_exige_desarrollo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_requiere boolean;
begin
  select requiere_desarrollo into v_requiere
    from public.actividades_vulnerables where id = new.actividad_id;

  if coalesce(v_requiere, false) and new.desarrollo_id is null then
    raise exception
      'Esta operación es de una fracción cuyo aviso describe un desarrollo inmobiliario, y no se indicó cuál. Sin él la operación quedaría fuera del aviso del periodo sin que nada falle, y el obligado presentaría un informe en cero habiendo operado.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger operaciones_exigen_desarrollo
  before insert on operaciones
  for each row execute function app.operacion_exige_desarrollo();

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_suc uuid; v_cli uuid; v_des uuid;
  v_vbis uuid; v_xv uuid;
  v_vbis_rechazada boolean := false;
  v_xv_aceptada boolean := false;
  v_con_desarrollo boolean := false;
begin
  select id into v_vbis from actividades_vulnerables where fraccion = 'V_BIS';
  select id into v_xv  from actividades_vulnerables where fraccion = 'XV';

  begin
    insert into tenants (rfc, razon_social, domicilio)
    values ('DES010101AAA', 'Aserción desarrollo', '{}'::jsonb) returning id into v_tenant;
    insert into actividades_tenant (tenant_id, actividad_id) values (v_tenant, v_vbis), (v_tenant, v_xv);
    insert into sucursales (tenant_id, nombre, clave) values (v_tenant, 'Matriz', 'MTZ')
    returning id into v_suc;
    insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
    values (v_tenant, 'moral', 'DES010101AA1', 'Compradora', 'MX') returning id into v_cli;
    insert into desarrollos_inmobiliarios
      (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal, colonia, calle,
       tipo_desarrollo, monto_desarrollo, unidades_comercializadas, costo_unidad,
       otras_empresas, objeto_aviso_anterior)
    values (v_tenant, 'Torre Aserción', 'LIC20260001', '31', '97000', 'CENTRO', 'CALLE 60', '5',
            50000000.00, 120.00, 941412.75, false, false) returning id into v_des;

    -- (a) Fr. V Bis SIN desarrollo: no entra.
    begin
      insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
                               monto_base, iva, isai, otros_accesorios, monto_total, forma_pago)
      values (v_tenant, v_suc, v_cli, v_vbis, current_date, 1000.00, 0, 0, 0, 1000.00, '03');
    exception when check_violation then v_vbis_rechazada := true;
    end;

    -- (b) Fr. V Bis CON desarrollo: entra, obviamente.
    insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
                             monto_base, iva, isai, otros_accesorios, monto_total, forma_pago,
                             desarrollo_id)
    values (v_tenant, v_suc, v_cli, v_vbis, current_date, 1000.00, 0, 0, 0, 1000.00, '03', v_des);
    v_con_desarrollo := true;

    -- (c) Fr. XV SIN desarrollo: entra. Su formato no describe ninguno, y
    --     exigírselo la volvería incapturable.
    insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
                             monto_base, iva, isai, otros_accesorios, monto_total, forma_pago)
    values (v_tenant, v_suc, v_cli, v_xv, current_date, 1000.00, 0, 0, 0, 1000.00, '03');
    v_xv_aceptada := true;

    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;
  end;

  if not v_vbis_rechazada then
    raise exception 'Se guardó una operación de Fr. V Bis sin desarrollo. Saldría del aviso en silencio.';
  end if;
  if not v_con_desarrollo then
    raise exception 'El trigger rechazó una operación que SÍ traía desarrollo.';
  end if;
  if not v_xv_aceptada then
    raise exception 'El trigger le exigió desarrollo a la Fr. XV, cuyo formato no describe ninguno.';
  end if;
  if exists (select 1 from tenants where rfc = 'DES010101AAA') then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  raise notice '✓ operaciones: la Fr. V Bis exige desarrollo, la Fr. XV no — y sale del catálogo';
end $$;
