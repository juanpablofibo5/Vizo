-- VIZO · Smoke test estructural de la migración 001
--
-- Verifica lo que no se puede romper sin que el proyecto deje de servir:
-- aislamiento entre tenants, append-only, encadenamiento de la bitácora y
-- separación de roles.
--
-- Correr contra una base RECIÉN RESETEADA:
--   supabase db reset && psql "$DB_URL" -f tests/estructura/smoke.sql
--
-- Sale con error en la primera aserción que falle (ON_ERROR_STOP).

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Guarda: este script NO es idempotente
-- ---------------------------------------------------------------------------
-- No puede serlo: la bitácora es append-only, así que no hay forma de limpiar
-- lo que escribe una corrida anterior.
--
-- Se comprueba la ausencia de SUS PROPIOS tenants, no que la base esté vacía:
-- el seed demo (supabase/seed.sql) crea sus datos para la UI y no debe
-- estorbar aquí. Por eso los RFC de este script llevan el prefijo SMK.
do $$
begin
  if exists (select 1 from tenants where rfc like 'SMK%') then
    raise exception
      'El smoke test necesita una base recién reseteada (la bitácora es append-only). Corre: pnpm db:reset';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Datos mínimos: dos tenants, un cliente cada uno
-- ---------------------------------------------------------------------------
insert into tenants (rfc, razon_social) values
  ('SMK010101AAA', 'Smoke Tenant A'),
  ('SMK020202BBB', 'Smoke Tenant B');


insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social) values
  ((select id from tenants where rfc='SMK010101AAA'), 'fisica', 'SMKX010101000', 'Cliente del tenant A'),
  ((select id from tenants where rfc='SMK020202BBB'), 'moral',  'SMKB020202BBB', 'Cliente del tenant B');

-- Un usuario REAL del tenant A. Hace falta para las pruebas de ataque: sin él,
-- la FK de actor_id bloquea por accidente y la prueba pasa sin probar nada.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'smoke-capturista@ejemplo.mx', 'x', now(), now());
insert into usuarios (id, tenant_id, rol, nombre, email)
select '11111111-1111-1111-1111-111111111111', id, 'capturista', 'Capturista A', 'smoke-capturista@ejemplo.mx'
from tenants where rfc='SMK010101AAA';

insert into sucursales (tenant_id, nombre, clave)
select id, 'Norte', 'NTE' from tenants where rfc='SMK010101AAA';

-- Un desarrollo del tenant A. La Fr. V Bis lo exige desde
-- `operaciones_exigen_desarrollo`, y sin él los dos INSERT de abajo morirían
-- por FALTA DE DESARROLLO en vez de por lo que cada uno pretende probar — uno
-- reventaría el smoke test y el otro pasaría por la razón equivocada.
insert into desarrollos_inmobiliarios
  (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal, colonia, calle,
   tipo_desarrollo, monto_desarrollo, unidades_comercializadas, costo_unidad,
   otras_empresas, objeto_aviso_anterior)
select id, 'Torre del Smoke', 'LICSMK00001', '31', '97000', 'CENTRO', 'CALLE 60', '5',
       50000000.00, 120.00, 941412.75, false, false
from tenants where rfc='SMK010101AAA';

-- Los UUID quedan en variables de sesión: el bloque de ataque (§12) corre
-- dentro de la sesión del atacante, donde RLS ya no deja leerlos.
select set_config('vizo.tenant_a',  (select id::text from tenants where rfc='SMK010101AAA'), false),
       set_config('vizo.tenant_b',  (select id::text from tenants where rfc='SMK020202BBB'), false),
       set_config('vizo.cliente_b', (select id::text from clientes_finales
                                      where nombre_o_razon_social like '%tenant B%'), false),
       set_config('vizo.sucursal_a',(select id::text from sucursales limit 1), false),
       set_config('vizo.desarrollo_a',(select id::text from desarrollos_inmobiliarios limit 1), false),
       set_config('vizo.actividad', (select id::text from actividades_vulnerables
                                      where fraccion='V_BIS'), false);

-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid := (select id from tenants where rfc='SMK010101AAA');
  v_tenant_b uuid := (select id from tenants where rfc='SMK020202BBB');
  v_n        int;
  v_texto    text;
  v_ok       boolean;
  v_monto    numeric;
begin
  -- 1. Aserciones estructurales de la propia migración -----------------------
  perform 1 from app.verificar_rls()          limit 1; if found then raise exception 'FALLA 1a: hay tablas sin RLS o sin políticas'; end if;
  perform 1 from app.verificar_append_only()  limit 1; if found then raise exception 'FALLA 1b: append-only comprometido'; end if;
  perform 1 from app.verificar_tenancy()      limit 1; if found then raise exception 'FALLA 1c: tabla sin tenant_id'; end if;
  perform 1 from app.verificar_grants()       limit 1; if found then raise exception 'FALLA 1d: RLS sin GRANT (tabla inaccesible)'; end if;
  -- 1e vigila lo que Supabase concede SIN que ninguna migración lo pida:
  -- TRUNCATE, TRIGGER, REFERENCES y MAINTAIN sobre toda tabla nueva de public.
  -- La auditoría de la semana 5 encontró 248 de esas concesiones vivas, y una
  -- de ellas permitía vaciar la bitácora de todos los obligados. Se revisa en
  -- cada corrida porque el privilegio por omisión vuelve con cada tabla nueva.
  perform 1 from app.verificar_privilegios_por_omision() limit 1; if found then raise exception 'FALLA 1e: privilegios concedidos por omisión (TRUNCATE y compañía)'; end if;
  -- 1f: lo mismo en el esquema `storage`, donde NO se puede arreglar con un
  -- revoke (las tablas son de supabase_storage_admin) y la protección es un
  -- trigger. Ahí vive la evidencia documental del expediente.
  perform 1 from app.verificar_privilegios_storage() limit 1; if found then raise exception 'FALLA 1f: storage.objects sin guardia de TRUNCATE'; end if;
  -- 1f-bis: la otra mitad de 1e. INSERT, UPDATE y DELETE no se pueden prohibir
  -- en bloque —algunos son legítimos—, así que se declaran uno por uno y esto
  -- falla ante cualquier privilegio de escritura que nadie haya declarado.
  -- Producción tenía ~170 contra los 28 del proyecto, incluidos los del
  -- catálogo regulatorio; RLS los contenía, pero la primera política de UPDATE
  -- que se escribió los despertó.
  perform 1 from app.verificar_privilegios_declarados() limit 1; if found then raise exception 'FALLA 1f-bis: privilegios de escritura sin declarar'; end if;

  -- Una vista que enumera columnas se queda atrás cuando la tabla crece, y
  -- quien la consulte creerá que el dato no existe — o tomará uno parecido.
  -- `moneda` y `moneda_codigo` son catálogos DISTINTOS y viven en esa tabla.
  perform app.verificar_vista_operaciones_vigentes();
  -- 1g: una vista de public sin `security_invoker` evalúa RLS como su DUEÑO,
  -- que es postgres y se salta RLS. `operaciones_vigentes` llevaba meses así:
  -- un obligado con 1 operación veía 298, de 246 obligados distintos. Una vista
  -- nueva nace sin la opción, así que el agujero se reabre solo.
  perform app.verificar_vistas_invocador();
  raise notice '✓ 1. Aserciones estructurales (RLS, append-only, tenancy, grants, privilegios en public y storage, vistas con invocador)';

  -- 2. La bitácora encadena --------------------------------------------------
  perform app.bitacora_registrar(v_tenant_a, 'catalogo.seed_aplicado', 'catalogo');
  perform app.bitacora_registrar(v_tenant_a, 'cliente.alta', 'cliente', gen_random_uuid());
  perform app.bitacora_registrar(v_tenant_a, 'operacion.registrada', 'operacion', gen_random_uuid());

  select count(*) into v_n from bitacora b
   where b.tenant_id = v_tenant_a
     and b.hash_previo = coalesce(
       (select p.hash from bitacora p where p.tenant_id = b.tenant_id and p.secuencia = b.secuencia - 1),
       app.bitacora_genesis());
  if v_n <> 3 then raise exception 'FALLA 2: la cadena no enlaza (% de 3 eslabones correctos)', v_n; end if;

  -- Secuencia por tenant, sin huecos
  select count(*) into v_n from bitacora where tenant_id = v_tenant_a;
  if (select max(secuencia) from bitacora where tenant_id = v_tenant_a) <> v_n then
    raise exception 'FALLA 2b: hueco en la secuencia';
  end if;
  raise notice '✓ 2. Bitácora encadenada, secuencia sin huecos';

  -- 3. El verificador confirma integridad ------------------------------------
  perform 1 from app.bitacora_verificar(v_tenant_a) limit 1;
  if found then raise exception 'FALLA 3: el verificador reporta la cadena rota cuando no lo está'; end if;
  raise notice '✓ 3. Verificador: cadena íntegra';

  -- 4. El verificador DETECTA una alteración ---------------------------------
  -- Se desactiva el trigger a propósito para simular a alguien con acceso
  -- directo a la base. Es la única forma de probar que la detección sirve.
  alter table bitacora disable trigger bitacora_append_only;
  update bitacora set datos = '{"alterado":true}'::jsonb
   where tenant_id = v_tenant_a and secuencia = 2;
  alter table bitacora enable trigger bitacora_append_only;

  select motivo into v_texto from app.bitacora_verificar(v_tenant_a) limit 1;
  if v_texto is null then raise exception 'FALLA 4: una alteración pasó desapercibida'; end if;
  raise notice '✓ 4. Verificador detecta manipulación: %', v_texto;

  -- se restaura para no dejar la cadena rota
  alter table bitacora disable trigger bitacora_append_only;
  update bitacora set datos = '{}'::jsonb where tenant_id = v_tenant_a and secuencia = 2;
  alter table bitacora enable trigger bitacora_append_only;

  -- 5. Append-only bloquea UPDATE y DELETE -----------------------------------
  begin
    update bitacora set evento = 'manipulado' where tenant_id = v_tenant_a and secuencia = 1;
    raise exception 'FALLA 5: se permitió UPDATE sobre bitacora';
  exception when restrict_violation then null;
  end;

  begin
    delete from bitacora where tenant_id = v_tenant_a and secuencia = 1;
    raise exception 'FALLA 5b: se permitió DELETE sobre bitacora';
  exception when restrict_violation then null;
  end;
  raise notice '✓ 5. Append-only: UPDATE y DELETE bloqueados';

  -- 6. El monto total tiene que cuadrar --------------------------------------
  begin
    insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id, fecha_operacion,
                             monto_base, iva, monto_total, forma_pago, desarrollo_id)
    values (v_tenant_a,
            (select id from sucursales where tenant_id = v_tenant_a limit 1),
            (select id from clientes_finales where tenant_id = v_tenant_a limit 1),
            (select id from actividades_vulnerables where fraccion = 'V_BIS'),
            '2026-03-15', 100000, 16000, 100000, '03',
            (select id from desarrollos_inmobiliarios where tenant_id = v_tenant_a limit 1));
    raise exception 'FALLA 6: se aceptó una operación con monto_total descuadrado';
  exception when check_violation or not_null_violation then null;
  end;
  raise notice '✓ 6. CHECK monto_total = base + iva + isai + accesorios';

  -- 7. Vigencias del catálogo sin traslape -----------------------------------
  -- El catálogo ya viene cargado por migración; cualquier fila que pise una
  -- vigencia existente debe ser rechazada por la base, no por la aplicación.
  begin
    insert into uma_vigencias (valor_diario, vigente_desde, vigente_hasta, fuente_dof)
      values (999.99, '2026-06-01', null, 'prueba: traslapa con la UMA 2026 vigente');
    raise exception 'FALLA 7: se aceptaron dos UMA vigentes el mismo día';
  exception when exclusion_violation then null;
  end;
  raise notice '✓ 7. Vigencias sin traslape (dos UMA el mismo día = imposible)';

  -- 8. uma_vigente() respeta la frontera del 1 de febrero ---------------------
  -- Contra los valores REALES del catálogo, no contra fixtures inventados.
  if app.uma_vigente('2026-01-15') <> 113.14 then
    raise exception 'FALLA 8a: una operación del 15 de enero de 2026 debe usar la UMA de 2025 (113.14), se obtuvo %',
      app.uma_vigente('2026-01-15');
  end if;
  if app.uma_vigente('2026-01-31') <> 113.14 then
    raise exception 'FALLA 8b: el 31 de enero todavía es UMA 2025';
  end if;
  if app.uma_vigente('2026-02-01') <> 117.31 then
    raise exception 'FALLA 8c: el 1 de febrero ya es UMA 2026';
  end if;
  raise notice '✓ 8. uma_vigente(): la frontera es el 1 de febrero, no el 1 de enero';

  -- 8-bis. El catálogo reproduce la tabla oficial del SAT ---------------------
  select round(u.valor_uma * app.uma_vigente('2026-02-15'), 2) into v_monto
  from umbrales u
  join actividades_vulnerables a on a.id = u.actividad_id
  where a.fraccion = 'V_BIS' and u.tipo = 'aviso'
    and daterange(u.vigente_desde, u.vigente_hasta, '[]') @> '2026-02-15'::date;

  if v_monto <> 941412.75 then
    raise exception 'FALLA 8d: el umbral de aviso de V Bis debe dar $941,412.75 (tabla oficial SPPLD), dio %', v_monto;
  end if;

  -- Identificación "siempre" en V Bis: expediente de CADA comprador
  select siempre into v_ok from umbrales u
  join actividades_vulnerables a on a.id = u.actividad_id
  where a.fraccion = 'V_BIS' and u.tipo = 'identificacion'
    and daterange(u.vigente_desde, u.vigente_hasta, '[]') @> '2026-02-15'::date;
  if not coalesce(v_ok, false) then
    raise exception 'FALLA 8e: la identificación en Fr. V Bis debe ser "siempre"';
  end if;

  -- Art. 32 se evalúa con IVA
  perform 1 from umbrales u
  join actividades_vulnerables a on a.id = u.actividad_id
  where a.fraccion = 'V_BIS' and u.tipo = 'efectivo' and u.base = 'con_contribuciones';
  if not found then
    raise exception 'FALLA 8f: el umbral de efectivo (Art. 32) debe tener base con_contribuciones';
  end if;

  raise notice '✓ 8-bis. Catálogo = tabla oficial del SAT: 8,025 UMA = $941,412.75, identificación siempre, efectivo con IVA';

  -- 8-ter. Los parámetros del motor son datos, no constantes -----------------
  if (app.parametro_vigente(null, 'ventana_acumulacion_meses', '2026-02-15'))::int <> 6 then
    raise exception 'FALLA 8g: la ventana de acumulación debe ser 6 meses y venir del catálogo';
  end if;
  if (app.parametro_vigente(null, 'dia_limite_presentacion', '2026-02-15'))::int <> 17 then
    raise exception 'FALLA 8h: el día límite de presentación debe ser 17 y venir del catálogo';
  end if;
  raise notice '✓ 8-ter. Ventana de 6 meses y día 17 son filas de parametros_motor, no constantes';

  -- 8-quater. Catálogos de valores del SAT -----------------------------------
  -- El XSD no tiene ninguna enumeration: valida forma, no valores. Sin estos
  -- catálogos, un aviso puede validar contra el XSD y traer códigos que no
  -- existen.
  if not app.codigo_valido('tipo_tercero', '2', '2026-02-15') then
    raise exception 'FALLA 8i: falta el tercero tipo 2 (Cliente en Preventa), que es el caso de uso central';
  end if;
  if not app.codigo_valido('tipo_operacion', '1601', '2026-02-15') then
    raise exception 'FALLA 8j: falta el tipo de operación 1601 de la fracción';
  end if;
  if app.codigo_valido('tipo_desarrollo', '7', '2026-02-15') then
    raise exception 'FALLA 8k: se aceptó un tipo de desarrollo inexistente (7)';
  end if;
  select count(*) into v_n from catalogos_sat;
  if v_n < 800 then
    raise exception 'FALLA 8l: se esperaban ~850 valores de catálogo, hay %', v_n;
  end if;
  raise notice '✓ 8-quater. Catálogos del SAT cargados y rechazando códigos inexistentes';

  -- 9. Normalización de nombres ----------------------------------------------
  if app.normalizar_nombre('  José   Ramírez  Ñuño ') <> 'JOSE RAMIREZ NUNO' then
    raise exception 'FALLA 9: normalización incorrecta: %', app.normalizar_nombre('  José   Ramírez  Ñuño ');
  end if;
  raise notice '✓ 9. Normalización de nombres (acentos, ñ, espacios)';

  raise notice '';
  raise notice 'TODAS LAS ASERCIONES DE ESTRUCTURA PASARON';
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Aislamiento entre tenants (requiere cambiar de rol, fuera del bloque DO)
-- ---------------------------------------------------------------------------
begin;
  select set_config('request.jwt.claims', json_build_object(
    'sub', gen_random_uuid(),
    'app_metadata', json_build_object(
      'tenant_id', (select id from tenants where rfc='SMK010101AAA'),
      'rol', 'capturista'))::text, true);
  set local role authenticated;

  do $$
  declare v_visibles int; v_fugas int;
  begin
    select count(*), count(*) filter (where nombre_o_razon_social like '%tenant B%')
      into v_visibles, v_fugas from clientes_finales;
    if v_fugas > 0 then raise exception 'FALLA 10: FUGA CROSS-TENANT — se ven % clientes de otro tenant', v_fugas; end if;
    if v_visibles <> 1 then raise exception 'FALLA 10b: se esperaba ver 1 cliente propio, se ven %', v_visibles; end if;

    -- el catálogo regulatorio sí es global
    select count(*) into v_visibles from actividades_vulnerables;
    if v_visibles < 1 then raise exception 'FALLA 10c: el catálogo debe ser legible por cualquier usuario autenticado'; end if;

    -- un capturista no aprueba
    begin
      perform app.expediente_aprobar(gen_random_uuid());
      raise exception 'FALLA 10d: un capturista pudo llamar a expediente_aprobar';
    exception when insufficient_privilege then null;
    end;

    raise notice '✓ 10. Aislamiento cross-tenant + catálogo global + capturista no aprueba';
  end;
  $$;
rollback;

-- ---------------------------------------------------------------------------
-- 12. Pruebas de ATAQUE cross-tenant
-- ---------------------------------------------------------------------------
-- Las tres se reprodujeron con éxito en la auditoría de la semana 1 y se
-- cerraron en la migración 20260806201936. Quedan aquí como pruebas
-- permanentes: si alguna vuelve a pasar, es un incidente de seguridad.
begin;
  select set_config('request.jwt.claims', json_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
    'app_metadata', json_build_object(
      'tenant_id', (select id from tenants where rfc='SMK010101AAA'),
      'rol', 'capturista'))::text, true);
  set local role authenticated;

  do $$
  declare
    v_b   uuid;
    v_bc  uuid;
    v_a   uuid;
    v_suc uuid;
    v_act uuid;
    v_des uuid;
  begin
    -- El atacante conoce los UUID del otro tenant: es el escenario realista
    -- (circulan en URLs, exports y tickets de soporte). Se leen como el rol
    -- que corre el test, no dentro de la sesión atacante.
    select current_setting('vizo.tenant_b')::uuid into v_b;
    select current_setting('vizo.cliente_b')::uuid into v_bc;
    select current_setting('vizo.tenant_a')::uuid into v_a;
    select current_setting('vizo.sucursal_a')::uuid into v_suc;
    select current_setting('vizo.actividad')::uuid into v_act;
    select current_setting('vizo.desarrollo_a')::uuid into v_des;

    -- ATAQUE 1: escribir en la bitácora de otro tenant
    begin
      perform app.bitacora_registrar(v_b, 'evento.falsificado', 'cliente');
      raise exception 'FALLA 12a: FUGA — se escribió en la bitácora de otro tenant';
    exception when insufficient_privilege then null;
    end;

    -- ATAQUE 2: verificar la bitácora de otro tenant (devolvía "íntegra")
    begin
      perform * from app.bitacora_verificar(v_b);
      raise exception 'FALLA 12b: se pudo verificar la bitácora de otro tenant';
    exception when insufficient_privilege then null;
    end;

    -- ATAQUE 3: operación propia que apunta a un cliente de otro tenant
    begin
      insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                               fecha_operacion, monto_base, iva, monto_total, forma_pago,
                               desarrollo_id)
      values (v_a, v_suc, v_bc, v_act, '2026-03-15', 500000, 0, 500000, '03', v_des);
      raise exception 'FALLA 12c: FUGA — una operación referenció a un cliente de otro tenant';
    exception when foreign_key_violation then null;
    end;

    -- CONTROL: el mismo usuario en su propio tenant sigue trabajando
    perform app.bitacora_registrar(v_a, 'cliente.alta', 'cliente');

    raise notice '✓ 12. Ataques cross-tenant bloqueados (bitácora, verificador, FK) y el caso legítimo intacto';
  end;
  $$;
rollback;

-- ---------------------------------------------------------------------------
-- 11. Sin sesión no se ve nada
-- ---------------------------------------------------------------------------
begin;
  select set_config('request.jwt.claims', '', true);
  set local role authenticated;
  do $$
  declare v_n int;
  begin
    select count(*) into v_n from clientes_finales;
    if v_n <> 0 then raise exception 'FALLA 11: sin JWT se ven % clientes', v_n; end if;
    raise notice '✓ 11. Sin sesión: cero filas visibles';
  end;
  $$;
rollback;

-- ---------------------------------------------------------------------------
-- 13. La bitácora no se puede vaciar
-- ---------------------------------------------------------------------------
-- HALLAZGO DE LA AUDITORÍA DE LA SEMANA 5. DELETE y UPDATE estaban revocados
-- desde la migración 008, pero TRUNCATE llegaba gratis por los privilegios por
-- omisión de Supabase, no lo veía ningún trigger `for each row` y no lo filtra
-- RLS. Un capturista podía vaciar la bitácora de TODOS los obligados.
--
-- Se prueba con el rol y el JWT reales, no como postgres: probarlo como
-- postgres habría dado verde desde antes del arreglo.
begin;
  select set_config('request.jwt.claims', json_build_object(
    'sub', (select id::text from usuarios where email='smoke-capturista@ejemplo.mx'),
    'role', 'authenticated',
    'app_metadata', json_build_object(
      'tenant_id', (select id::text from tenants where rfc='SMK010101AAA'),
      'rol', 'capturista')
  )::text, true);
  set local role authenticated;

  do $$
  declare v_paso boolean := false;
  begin
    begin
      execute 'truncate bitacora';
      v_paso := true;
    exception when others then
      null;  -- lo esperado
    end;
    if v_paso then
      raise exception 'FALLA 13: un capturista vació la bitácora con TRUNCATE';
    end if;

    -- Y lo mismo para el resto de las append-only.
    begin
      execute 'truncate operaciones cascade';
      v_paso := true;
    exception when others then
      null;
    end;
    if v_paso then
      raise exception 'FALLA 13: un capturista vació operaciones con TRUNCATE';
    end if;

    raise notice '✓ 13. TRUNCATE bloqueado en las tablas append-only';
  end;
  $$;
rollback;
