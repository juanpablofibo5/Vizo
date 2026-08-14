-- ---------------------------------------------------------------------------
-- Las vistas dejan de saltarse RLS
-- ---------------------------------------------------------------------------
-- HALLAZGO AL DESPLEGAR A PRODUCCIÓN. El linter de Supabase marcó
-- `operaciones_vigentes` como SECURITY DEFINER VIEW, y resultó ser la fuga
-- cross-tenant más grande que ha tenido este proyecto.
--
-- Una vista sin `security_invoker` evalúa permisos y políticas **como su
-- dueño**. El dueño es `postgres`, que tiene `rolbypassrls`. Así que RLS no se
-- aplicaba en absoluto al consultarla:
--
--     como authenticated de un obligado con 1 operación
--       select count(*) from operaciones            →   1     (RLS aplica)
--       select count(*) from operaciones_vigentes   → 298      (RLS NO aplica)
--       select count(distinct tenant_id) from ...   → 246 obligados
--
-- No es teórico: `app/page.tsx` contaba «operaciones capturadas este mes»
-- leyendo la vista SIN filtro de tenant, confiando en RLS. Ese número incluía
-- las operaciones de todos los demás obligados.
--
-- El resto de las consultas se salvó por dos capas que aquí quedaron solas:
-- el filtro explícito `where o.tenant_id = $1` (calendario, historial, aviso —
-- el generador del aviso, por fortuna, sí lo tenía) y los joins por UUID contra
-- tablas que sí aplican RLS. «Las dos capas se sostienen» era exactamente el
-- argumento de la auditoría de F1; esta vez una de las dos llevaba meses
-- ausente y nadie lo vio, porque una vista no se lee como código de acceso.
--
-- El aislamiento multi-tenant es la promesa central del producto. Que se
-- sostuviera por accidente no es que se sostuviera.

alter view operaciones_vigentes set (security_invoker = true);

comment on view operaciones_vigentes is
  'Operaciones no corregidas. security_invoker: evalúa RLS con el rol de quien consulta, no con el dueño. Sin eso, una vista de public es un agujero en el aislamiento. app.verificar_vistas_invocador() lo comprueba en cada migración.';

-- ---------------------------------------------------------------------------
-- La aserción que lo vuelve imposible de repetir
-- ---------------------------------------------------------------------------
-- Igual que `verificar_privilegios_por_omision` vigila lo que Supabase concede
-- solo: esto vigila lo que Postgres asume por omisión. Una vista nueva nace SIN
-- security_invoker, así que el agujero se abre de nuevo cada vez que alguien
-- crea una vista — y no aparece en ninguna revisión de código, porque el `create
-- view` se ve perfectamente normal.
create or replace function app.verificar_vistas_invocador()
returns void
language plpgsql
set search_path = ''
as $$
declare v_vistas text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_vistas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('v', 'm')
     and coalesce(
           (select option_value
              from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'),
           'false'
         ) <> 'true';

  if v_vistas is not null then
    raise exception
      'Estas vistas de public evalúan RLS como su dueño y no como quien consulta: %. El dueño es postgres, que se salta RLS, así que la vista devuelve los datos de TODOS los obligados. Añade "with (security_invoker = true)".',
      v_vistas;
  end if;
end $$;

-- La función anterior nació sin `set search_path` y el linter también lo marcó.
-- Una función sin search_path fijo resuelve nombres con el del invocador, que es
-- manipulable.
create or replace function app.verificar_vista_operaciones_vigentes()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_faltantes text;
begin
  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into v_faltantes
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'operaciones'
     and not exists (
       select 1 from information_schema.columns v
        where v.table_schema = 'public'
          and v.table_name = 'operaciones_vigentes'
          and v.column_name = c.column_name
     );

  if v_faltantes is not null then
    raise exception
      'operaciones_vigentes no expone estas columnas de operaciones: %. Una vista que enumera columnas se queda atrás sin avisar, y quien la consulte creerá que el dato no existe — o peor, tomará uno parecido. Recréala incluyéndolas.',
      v_faltantes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Aserción: se comprueba que la vista YA filtra
-- ---------------------------------------------------------------------------
-- Declarar la opción no basta —es el mismo principio de las otras quince
-- aserciones—: aquí se consulta la vista con el rol y los claims de un obligado
-- y se exige que las filas de otro no aparezcan.
do $$
declare
  v_a uuid; v_b uuid; v_usuario_a uuid;
  v_actividad uuid; v_suc_b uuid; v_cli_b uuid;
  v_visibles int;
begin
  perform app.verificar_vistas_invocador();

  select id into v_actividad from actividades_vulnerables where fraccion = 'V_BIS';

  begin
    insert into tenants (rfc, razon_social, domicilio)
    values ('VIA010101AAA', 'Aserción vistas A', '{}'::jsonb) returning id into v_a;
    insert into tenants (rfc, razon_social, domicilio)
    values ('VIB020202BBB', 'Aserción vistas B', '{}'::jsonb) returning id into v_b;

    insert into actividades_tenant (tenant_id, actividad_id) values (v_a, v_actividad), (v_b, v_actividad);

    -- Un usuario de A, que es quien va a consultar.
    insert into auth.users (id, instance_id, aud, role, email,
                            confirmation_token, recovery_token, email_change_token_new,
                            email_change, email_change_token_current, phone_change,
                            phone_change_token, reauthentication_token)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'asercion-vistas@vizo.test',
            '', '', '', '', '', '', '', '')
    returning id into v_usuario_a;
    insert into usuarios (id, tenant_id, rol, nombre, email)
    values (v_usuario_a, v_a, 'admin', 'Aserción', 'asercion-vistas@vizo.test');

    -- Y UNA OPERACIÓN DE B, que A no debe ver por ningún camino.
    insert into sucursales (tenant_id, nombre, clave) values (v_b, 'Matriz', 'MTZ')
    returning id into v_suc_b;
    insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
    values (v_b, 'moral', 'VIB020202BB1', 'Cliente de B', 'MX') returning id into v_cli_b;
    insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
                             monto_base, iva, isai, otros_accesorios, monto_total, forma_pago)
    values (v_b, v_suc_b, v_cli_b, v_actividad, current_date,
            1000.00, 0, 0, 0, 1000.00, '03');

    -- Ahora se consulta COMO A.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usuario_a::text, 'role', 'authenticated',
        'app_metadata', json_build_object('tenant_id', v_a::text, 'rol', 'admin'))::text, true);
    set local role authenticated;

    select count(*) into v_visibles from operaciones_vigentes;

    reset role;

    if v_visibles <> 0 then
      raise exception
        'Un obligado ve % operación(es) de otro a través de operaciones_vigentes. La vista sigue evaluando RLS como su dueño.',
        v_visibles;
    end if;

    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;
  end;

  if exists (select 1 from tenants where rfc in ('VIA010101AAA', 'VIB020202BBB')) then
    raise exception 'La aserción dejó datos en la base.';
  end if;

  raise notice '✓ vistas con security_invoker: un obligado no ve las operaciones de otro por la vista';
end $$;
