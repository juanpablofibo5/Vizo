-- VIZO · Cierre de dos fugas de aislamiento entre tenants
--
-- Encontradas en la auditoría de la semana 1, ambas REPRODUCIDAS con un
-- usuario legítimo, no teóricas.
--
-- FUGA 1 — Escritura en la bitácora de otro tenant.
--   app.bitacora_registrar() es SECURITY DEFINER (lo necesita: el trigger que
--   encadena corre con privilegios) y recibía p_tenant SIN VALIDARLO. Un
--   capturista del tenant A que conociera el UUID del tenant B escribía
--   eventos falsificados en la bitácora de B. Como la bitácora es el objeto
--   que se defiende en una visita de verificación, esto la volvía impugnable.
--   Las barreras que "salvaron" el primer intento (RLS ocultando el UUID, la
--   FK de actor_id) eran accidentales: con el UUID en mano, escribía.
--
-- FUGA 2 — Referencias cruzadas entre tenants.
--   Toda FK era de una sola columna, así que el tenant no se validaba: un
--   usuario del tenant A creó una operación apuntando al cliente del tenant B.
--   Además de corromper datos, rompe la acumulación (el motor sumaría
--   operaciones de dos obligados sobre el mismo cliente) y deja el aviso sin
--   datos de la persona, porque RLS filtra el JOIN.
--   Se cierra con claves foráneas COMPUESTAS (tenant_id, id): declarativas,
--   no se pueden olvidar al agregar una tabla nueva.

-- ---------------------------------------------------------------------------
-- 1. La bitácora valida el tenant de quien escribe
-- ---------------------------------------------------------------------------
create or replace function app.bitacora_registrar(
  p_tenant      uuid,
  p_evento      text,
  p_objeto_tipo text,
  p_objeto_id   uuid default null,
  p_datos       jsonb default '{}'::jsonb,
  p_actor       uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  -- Un usuario autenticado SOLO escribe en la bitácora de su propio tenant.
  -- Cuando no hay JWT (migraciones, seed, jobs con service_role) se permite,
  -- porque esos caminos no vienen de una sesión de usuario.
  if app.tenant_id() is not null and p_tenant is distinct from app.tenant_id() then
    raise exception 'No se puede registrar en la bitácora de otro tenant'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.bitacora (tenant_id, evento, objeto_tipo, objeto_id, datos, actor_id, hash_previo, hash)
  values (p_tenant, p_evento, p_objeto_tipo, p_objeto_id, p_datos,
          coalesce(p_actor, auth.uid()),
          '', '')   -- el trigger los reemplaza; nunca se confía en lo que llegue
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. El verificador distingue "íntegra" de "no puedo verla"
-- ---------------------------------------------------------------------------
-- Antes, pedir la verificación de otro tenant devolvía 0 filas — que el
-- llamador lee como "cadena íntegra". Un "todo bien" falso es peor que un
-- error.
create or replace function app.bitacora_verificar(p_tenant uuid)
returns table (
  secuencia_rota bigint,
  motivo         text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  r             record;
  v_esperado    char(64) := app.bitacora_genesis();
  v_secuencia   bigint := 0;
  v_recalculado char(64);
begin
  if app.tenant_id() is not null and p_tenant is distinct from app.tenant_id() then
    raise exception 'No se puede verificar la bitácora de otro tenant'
      using errcode = 'insufficient_privilege';
  end if;

  for r in
    select * from public.bitacora
    where tenant_id = p_tenant
    order by secuencia
  loop
    v_secuencia := v_secuencia + 1;

    if r.secuencia <> v_secuencia then
      secuencia_rota := r.secuencia;
      motivo := format('hueco en la secuencia: se esperaba %s', v_secuencia);
      return next;
      return;
    end if;

    if r.hash_previo <> v_esperado then
      secuencia_rota := r.secuencia;
      motivo := 'hash_previo no corresponde al eslabón anterior';
      return next;
      return;
    end if;

    v_recalculado := encode(
      sha256(convert_to(
        app.bitacora_payload(
          r.tenant_id, r.secuencia, r.evento, r.objeto_tipo,
          r.objeto_id, r.datos, r.actor_id, r.ocurrido_en, r.hash_previo
        ), 'UTF8')),
      'hex'
    )::char(64);

    if v_recalculado <> r.hash then
      secuencia_rota := r.secuencia;
      motivo := 'el contenido del evento fue alterado: el hash no cuadra';
      return next;
      return;
    end if;

    v_esperado := r.hash;
  end loop;
end;
$$;

create or replace function app.bitacora_cabeza(p_tenant uuid)
returns char(64)
language plpgsql
stable
set search_path = ''
as $$
begin
  if app.tenant_id() is not null and p_tenant is distinct from app.tenant_id() then
    raise exception 'No se puede leer la cabeza de la bitácora de otro tenant'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(
    (select b.hash from public.bitacora b
      where b.tenant_id = p_tenant order by b.secuencia desc limit 1),
    app.bitacora_genesis()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Claves foráneas compuestas: el tenant viaja en la referencia
-- ---------------------------------------------------------------------------
-- Requisito previo: cada tabla padre necesita UNIQUE (tenant_id, id) para que
-- una FK compuesta pueda apuntarle.
alter table clientes_finales         add constraint clientes_tenant_id_uk         unique (tenant_id, id);
alter table sucursales               add constraint sucursales_tenant_id_uk       unique (tenant_id, id);
alter table usuarios                 add constraint usuarios_tenant_id_uk         unique (tenant_id, id);
alter table expedientes              add constraint expedientes_tenant_id_uk      unique (tenant_id, id);
alter table operaciones              add constraint operaciones_tenant_id_uk      unique (tenant_id, id);
alter table evaluaciones_umbral      add constraint evaluaciones_tenant_id_uk     unique (tenant_id, id);
alter table avisos                   add constraint avisos_tenant_id_uk           unique (tenant_id, id);
alter table documentos               add constraint documentos_tenant_id_uk       unique (tenant_id, id);
alter table desarrollos_inmobiliarios add constraint desarrollos_tenant_id_uk     unique (tenant_id, id);
alter table consultas_screening      add constraint screening_tenant_id_uk        unique (tenant_id, id);
alter table casos                    add constraint casos_tenant_id_uk            unique (tenant_id, id);

-- Núcleo operativo
alter table clientes_finales
  drop constraint clientes_finales_created_by_fkey,
  add  constraint clientes_created_by_fk
       foreign key (tenant_id, created_by) references usuarios(tenant_id, id);

alter table beneficiarios_controladores
  drop constraint beneficiarios_controladores_cliente_id_fkey,
  add  constraint beneficiarios_cliente_fk
       foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id);

alter table representantes
  drop constraint representantes_cliente_id_fkey,
  add  constraint representantes_cliente_fk
       foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id);

alter table expedientes
  drop constraint expedientes_cliente_id_fkey,
  add  constraint expedientes_cliente_fk
       foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id),
  drop constraint expedientes_aprobado_por_fkey,
  add  constraint expedientes_aprobado_por_fk
       foreign key (tenant_id, aprobado_por) references usuarios(tenant_id, id);

alter table documentos
  drop constraint documentos_expediente_id_fkey,
  add  constraint documentos_expediente_fk
       foreign key (tenant_id, expediente_id) references expedientes(tenant_id, id),
  drop constraint documentos_reemplaza_a_fkey,
  add  constraint documentos_reemplaza_fk
       foreign key (tenant_id, reemplaza_a) references documentos(tenant_id, id),
  drop constraint documentos_subido_por_fkey,
  add  constraint documentos_subido_por_fk
       foreign key (tenant_id, subido_por) references usuarios(tenant_id, id);

alter table operaciones
  drop constraint operaciones_cliente_id_fkey,
  add  constraint operaciones_cliente_fk
       foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id),
  drop constraint operaciones_sucursal_id_fkey,
  add  constraint operaciones_sucursal_fk
       foreign key (tenant_id, sucursal_id) references sucursales(tenant_id, id),
  drop constraint operaciones_corrige_a_fkey,
  add  constraint operaciones_corrige_fk
       foreign key (tenant_id, corrige_a) references operaciones(tenant_id, id),
  drop constraint operaciones_registrado_por_fkey,
  add  constraint operaciones_registrado_por_fk
       foreign key (tenant_id, registrado_por) references usuarios(tenant_id, id),
  drop constraint operaciones_desarrollo_id_fkey,
  add  constraint operaciones_desarrollo_fk
       foreign key (tenant_id, desarrollo_id) references desarrollos_inmobiliarios(tenant_id, id);

alter table evaluaciones_umbral
  drop constraint evaluaciones_umbral_operacion_id_fkey,
  add  constraint evaluaciones_operacion_fk
       foreign key (tenant_id, operacion_id) references operaciones(tenant_id, id);

alter table alertas
  drop constraint alertas_evaluacion_id_fkey,
  add  constraint alertas_evaluacion_fk
       foreign key (tenant_id, evaluacion_id) references evaluaciones_umbral(tenant_id, id),
  drop constraint alertas_atendida_por_fkey,
  add  constraint alertas_atendida_por_fk
       foreign key (tenant_id, atendida_por) references usuarios(tenant_id, id),
  drop constraint alertas_consulta_screening_fk,
  add  constraint alertas_screening_fk
       foreign key (tenant_id, consulta_screening_id) references consultas_screening(tenant_id, id),
  drop constraint alertas_caso_fk,
  add  constraint alertas_caso_compuesta_fk
       foreign key (tenant_id, caso_id) references casos(tenant_id, id);

-- Aviso
alter table avisos
  drop constraint avisos_aprobado_por_fkey,
  add  constraint avisos_aprobado_por_fk
       foreign key (tenant_id, aprobado_por) references usuarios(tenant_id, id);

alter table aviso_operaciones
  drop constraint aviso_operaciones_aviso_id_fkey,
  add  constraint aviso_operaciones_aviso_fk
       foreign key (tenant_id, aviso_id) references avisos(tenant_id, id),
  drop constraint aviso_operaciones_operacion_id_fkey,
  add  constraint aviso_operaciones_operacion_fk
       foreign key (tenant_id, operacion_id) references operaciones(tenant_id, id),
  drop constraint aviso_operaciones_evaluacion_id_fkey,
  add  constraint aviso_operaciones_evaluacion_fk
       foreign key (tenant_id, evaluacion_id) references evaluaciones_umbral(tenant_id, id);

alter table manifiestos
  drop constraint manifiestos_expediente_id_fkey,
  add  constraint manifiestos_expediente_fk
       foreign key (tenant_id, expediente_id) references expedientes(tenant_id, id);

-- Bitácora
alter table bitacora
  drop constraint bitacora_actor_id_fkey,
  add  constraint bitacora_actor_fk
       foreign key (tenant_id, actor_id) references usuarios(tenant_id, id);

-- Esqueleto post-MVP: se corrigen ahora para que nazcan bien y nadie tenga
-- que acordarse al construirlas.
alter table factores_riesgo
  drop constraint factores_riesgo_cliente_id_fkey,
  add  constraint factores_riesgo_cliente_fk
       foreign key (tenant_id, cliente_id) references clientes_finales(tenant_id, id);

alter table consultas_screening
  drop constraint consultas_screening_resuelto_por_fkey,
  add  constraint screening_resuelto_por_fk
       foreign key (tenant_id, resuelto_por) references usuarios(tenant_id, id);

alter table casos
  drop constraint casos_abierto_por_fkey,
  add  constraint casos_abierto_por_fk
       foreign key (tenant_id, abierto_por) references usuarios(tenant_id, id);

alter table verificaciones_kyc
  drop constraint verificaciones_kyc_expediente_id_fkey,
  add  constraint verificaciones_kyc_expediente_fk
       foreign key (tenant_id, expediente_id) references expedientes(tenant_id, id);

-- ---------------------------------------------------------------------------
-- 4. Aserción 5: ninguna FK entre tablas del tenant sin llevar tenant_id
-- ---------------------------------------------------------------------------
-- La red que impide que esto vuelva a pasar al agregar una tabla.
create or replace function app.verificar_fks_tenant()
returns table (tabla text, problema text)
language sql
stable
set search_path = ''
as $$
  select c.conrelid::regclass::text,
         format('la FK %s no incluye tenant_id: permite referenciar filas de otro tenant', c.conname)
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and array_length(c.conkey, 1) = 1
    and a.attname <> 'tenant_id'
    -- ambas tablas son del tenant
    and exists (select 1 from pg_attribute t where t.attrelid = c.confrelid
                 and t.attname = 'tenant_id' and not t.attisdropped)
    and exists (select 1 from pg_attribute t where t.attrelid = c.conrelid
                 and t.attname = 'tenant_id' and not t.attisdropped);
$$;

do $$
declare v_problemas text;
begin
  select string_agg(format('  · %s: %s', tabla, problema), e'\n') into v_problemas
  from (
    select * from app.verificar_rls()
    union all select * from app.verificar_append_only()
    union all select * from app.verificar_tenancy()
    union all select * from app.verificar_grants()
    union all select * from app.verificar_fks_tenant()
  ) t;

  if v_problemas is not null then
    raise exception e'Quedan fugas de aislamiento:\n%', v_problemas;
  end if;

  raise notice 'Aislamiento cross-tenant: OK. Bitácora validada por tenant y % FKs compuestas.',
    (select count(*) from pg_constraint where contype='f' and array_length(conkey,1)=2);
end;
$$;
