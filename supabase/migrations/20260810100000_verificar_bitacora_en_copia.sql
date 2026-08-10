-- VIZO · Migración 019 — Verificar la cadena sobre una COPIA
--
-- Semana 8. `app.bitacora_verificar` ya detecta el eslabón exacto donde se
-- rompe una cadena y por qué. Su límite es que lee de `public.bitacora` a
-- secas, así que la única forma de demostrar que la detección sirve era
-- alterar la bitácora REAL —desactivando su trigger— y volver a dejarla como
-- estaba.
--
-- Eso funciona en una base de pruebas desechable y no debería existir en
-- ninguna otra parte. El plan de la semana 8 lo dice con todas sus letras: la
-- demo de alteración corre sobre una copia, y la bitácora real jamás se toca.
--
-- La pieza que faltaba: poder verificar una TABLA CUALQUIERA con la misma
-- forma. Se generaliza el verificador y `app.bitacora_verificar` pasa a ser
-- una llamada a él con `public.bitacora`.
--
-- Que sea el MISMO código importa más de lo que parece. Una demo con su propia
-- implementación de la verificación demuestra que esa copia detecta
-- alteraciones — no que las detecte la que corre en producción. Sería teatro.

create or replace function app.bitacora_verificar_en(
  p_tenant uuid,
  p_origen regclass
)
returns table (secuencia_rota bigint, motivo text)
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

  -- `p_origen` es regclass y no text: Postgres lo resuelve a un OID de tabla
  -- existente al convertirlo, así que aquí no puede llegar SQL arbitrario.
  for r in execute
    format('select * from %s where tenant_id = $1 order by secuencia', p_origen)
    using p_tenant
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

comment on function app.bitacora_verificar_en(uuid, regclass) is
  'Verifica la cadena de una tabla con la forma de bitacora. Permite demostrar la detección sobre una COPIA sin tocar la bitácora real (semana 8).';

-- `bitacora_verificar` conserva su firma —la usan tests y el smoke— y pasa a
-- delegar. Un solo algoritmo, dos puntos de entrada.
create or replace function app.bitacora_verificar(p_tenant uuid)
returns table (secuencia_rota bigint, motivo text)
language sql
stable
set search_path = ''
as $$
  select * from app.bitacora_verificar_en(p_tenant, 'public.bitacora'::regclass);
$$;

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
-- Se comprueba sobre una copia de verdad, no leyendo el catálogo: que la
-- función exista no dice que detecte nada.
do $$
declare
  v_tenant  uuid;
  v_rota    bigint;
  v_motivo  text;
  v_n       int;
  v_ok      boolean := false;
begin
  -- ── La aserción NO deja rastro ──────────────────────────────────────────
  -- Todo lo que sigue crea un obligado de prueba y le escribe eventos. En una
  -- base local da igual: el siguiente `db reset` lo borra. En PRODUCCIÓN se
  -- quedaría para siempre — la bitácora es append-only y ni siquiera TRUNCATE
  -- la vacía, así que esos tres eventos serían indeleble basura dentro del
  -- único objeto que se defiende ante la autoridad.
  --
  -- Por eso el bloque de abajo se deshace a sí mismo: hace su trabajo, guarda
  -- el veredicto en variables (que no son transaccionales y sobreviven) y
  -- revierte con una excepción propia. Si una aserción falla de verdad, su
  -- excepción lleva otro SQLSTATE y sale hacia arriba sin ser atrapada.
  begin
    create temp table bitacora_asercion
      (like public.bitacora including all excluding identity) on commit drop;

    insert into tenants (rfc, razon_social)
    values ('ASR010101AAA', 'Aserción de la migración 019')
    returning id into v_tenant;

    perform app.bitacora_registrar(v_tenant, 'catalogo.seed_aplicado', 'catalogo');
    perform app.bitacora_registrar(v_tenant, 'cliente.alta', 'cliente', gen_random_uuid());
    perform app.bitacora_registrar(v_tenant, 'operacion.registrada', 'operacion', gen_random_uuid());

    insert into bitacora_asercion select * from public.bitacora where tenant_id = v_tenant;

    select count(*) into v_n from bitacora_asercion;
    if v_n <> 3 then
      raise exception 'La copia debía traer 3 eventos, trajo %', v_n;
    end if;

    -- La copia íntegra verifica.
    select secuencia_rota into v_rota
      from app.bitacora_verificar_en(v_tenant, 'bitacora_asercion'::regclass) limit 1;
    if v_rota is not null then
      raise exception 'La copia sin alterar no debería reportar rotura (eslabón %)', v_rota;
    end if;

    -- Se altera el segundo evento EN LA COPIA.
    update bitacora_asercion set datos = '{"alterado":true}'::jsonb where secuencia = 2;

    select secuencia_rota, motivo into v_rota, v_motivo
      from app.bitacora_verificar_en(v_tenant, 'bitacora_asercion'::regclass) limit 1;
    if v_rota is distinct from 2 then
      raise exception 'La alteración del eslabón 2 no se detectó (reportó %)', v_rota;
    end if;

    -- Y la bitácora REAL sigue intacta: nunca se tocó.
    select secuencia_rota into v_rota from app.bitacora_verificar(v_tenant) limit 1;
    if v_rota is not null then
      raise exception 'La bitácora real quedó rota: la demo no debe tocarla';
    end if;

    v_ok := true;
    raise exception using errcode = 'VZ001', message = 'deshacer los datos de la aserción';
  exception
    when sqlstate 'VZ001' then null;  -- revierte el obligado y sus eventos
  end;

  if not v_ok then
    raise exception 'La aserción de la migración 019 no llegó a completarse';
  end if;

  if exists (select 1 from tenants where rfc = 'ASR010101AAA') then
    raise exception 'La aserción dejó datos en la base: tenía que revertirse sola';
  end if;

  raise notice 'Verificación sobre copia: OK. Alteración detectada en el eslabón 2 (%), real intacta, sin dejar rastro.', v_motivo;
end;
$$;
