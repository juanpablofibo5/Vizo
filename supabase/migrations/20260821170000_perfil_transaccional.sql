-- ---------------------------------------------------------------------------
-- El Perfil transaccional: el tope lo declara el cliente, VIZO lo compara
-- ---------------------------------------------------------------------------
-- Cap. III Ter del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina,
-- código 5795797), Arts. 23 Ter 1 y 23 Ter 2. Exigible a partir de los actos u
-- operaciones realizados el 1 de marzo de 2027 (Transitorio Cuarto).
-- Contraste del capítulo completo en `docs/RIESGO-EBR.md` §1.3.
--
-- ────────────────────────────────────────────────────────────────────────────
-- DÓNDE CAE LA FRONTERA DEL ADR-21 EN ESTE CAPÍTULO
-- ────────────────────────────────────────────────────────────────────────────
-- En el Grado de Riesgo, la configuración vacía era del obligado. Aquí la
-- frontera cae en otro lado, y conviene decirlo antes de leer el esquema:
--
--   · El **número contra el que se compara lo pone el CLIENTE**, no VIZO ni el
--     obligado. Art. 23 Ter 1 ¶2: «la información que proporcione cada uno de
--     sus Clientes o Usuarias en ese momento, relativa a los MONTOS MÁXIMOS
--     MENSUALES de los actos u operaciones que los propios Clientes o Usuarias
--     ESTIMEN REALIZAR». Es una declaración, no un criterio de riesgo.
--
--   · Y la comparación que dispara la alerta también la nombra el texto:
--     «con objeto de DETECTAR INCONSISTENCIAS entre la información
--     proporcionada por el Cliente o Usuaria y el monto de los actos u
--     operaciones que realice» (mismo ¶2). Comparar lo declarado con lo
--     ocurrido no es interpretar: es aritmética sobre dos datos que ya están.
--
--   · Lo que sí es del obligado, y VIZO no toca, son «los supuestos en que los
--     actos u operaciones se aparten del Perfil transaccional» del Art. 23 Ter
--     fr. IV, más allá de esa inconsistencia de monto: tolerancias, patrones,
--     criterios de origen y destino. Esas columnas existen y nacen vacías.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LOS DOS RELOJES DE SEIS MESES, QUE NO SON EL MISMO
-- ────────────────────────────────────────────────────────────────────────────
-- El Art. 23 Ter 1 dice «seis meses» tres veces y no siempre habla de lo mismo:
--
--   ¶2  «al menos durante los seis primeros meses siguientes en que se llevó a
--        cabo el acto u operación» — el perfil inicial, construido con lo que
--        el cliente declaró, RIGE ese periodo. Es un piso: no se puede
--        sustituir antes.
--
--   ¶3a «al menos cada seis meses, la evaluación del Perfil transaccional» —
--        la CADENCIA del ejercicio periódico. Es un techo: puede ser más
--        seguido, y el Art. 23 Ter 3 pide justo eso para el riesgo alto.
--
--   ¶3b «sobre aquellos Clientes o Usuarias cuyo acto u operación se hubiere
--        realizado al menos con seis meses de anticipación» — la MADURACIÓN:
--        antes de esa fecha al cliente no le toca reevaluación.
--
-- ¶2 y ¶3b son la misma frontera vista desde los dos lados, y por eso viven en
-- un solo parámetro. ¶3a es otro, con su propia fuente: si una reforma mueve
-- la cadencia y deja la maduración, no deben moverse juntos. El mismo cuidado
-- que `docs/RIESGO-EBR.md` §3.1 pidió para no fusionar este seis con el seis
-- del Art. 23 Bis 1 (reevaluación del Grado) ni con el del Art. 19
-- (acumulación del umbral): tres plazos con el mismo número y tres
-- fundamentos distintos.

-- ---------------------------------------------------------------------------
-- 1. Los tipos
-- ---------------------------------------------------------------------------
create type origen_perfil as enum (
  'inicial',       -- Art. 23 Ter 1 ¶2: lo declarado al momento del acto
  'reevaluacion',  -- Art. 23 Ter 1 ¶3: el ejercicio periódico
  'correccion',    -- no lo nombra el texto; ver el comentario de abajo
  'acto_unico'     -- Art. 23 Ter 1 ¶4: un solo acto y la relación se extingue
);

-- POR QUÉ EXISTE `correccion`, SI EL TEXTO NO LA NOMBRA.
--
-- El ¶2 obliga a considerar durante seis meses «la información que proporcione
-- cada uno de sus Clientes». Si lo capturado no es lo que el cliente dijo —un
-- dedazo—, corregirlo SIRVE al ¶2; no lo rodea. Lo que sí lo rodearía es subir
-- el tope para callar una alerta, y por eso una corrección **no puede mover el
-- reloj**: hereda la misma fecha ancla y el mismo vencimiento que la fila que
-- corrige. Compra exactitud, nunca tiempo. Y como todo aquí es append-only,
-- las dos filas quedan: quién corrigió qué, cuándo y por qué.

create type fuente_perfil as enum (
  -- Art. 23 Ter 1 fr. I, sus dos opciones, textuales:
  'declarada_por_cliente',   -- «la información proporcionada por el Cliente o Usuaria»
  'archivos_del_obligado'    -- «la que obre en los archivos de quien realice la Actividad Vulnerable»
);

-- ---------------------------------------------------------------------------
-- 2. El perfil, con histórico
-- ---------------------------------------------------------------------------
create table perfiles_transaccionales (
  id            uuid primary key default gen_random_uuid(),
  -- Misma lección que `evaluaciones_riesgo.secuencia`: `now()` devuelve el
  -- instante de la TRANSACCIÓN, no del statement. Dos filas escritas en la
  -- misma transacción comparten `registrado_en` al milisegundo y «el perfil
  -- vigente» se vuelve indeterminado. La aserción 8 de aquella migración lo
  -- encontró; esta nace con el remedio puesto.
  secuencia     bigserial not null,
  tenant_id     uuid not null references tenants(id),
  cliente_id    uuid not null,
  origen        origen_perfil not null,
  fuente        fuente_perfil not null,

  -- Art. 23 Ter 1 ¶2. El único número que el texto nombra, y lo pone el
  -- cliente. Sin él no hay contra qué comparar, así que es NOT NULL: un perfil
  -- sin tope no es un perfil, es un registro vacío que aparenta cumplimiento.
  monto_maximo_mensual numeric(14,2) not null check (monto_maximo_mensual >= 0),

  -- Art. 23 Ter 1 fr. II: «el monto, número y frecuencia». El monto es el de
  -- arriba. Estos dos son NULLABLE a propósito: si el obligado no los recabó,
  -- no se comparan. Un tope inventado por omisión sería la regla dura 6 rota
  -- justo donde más barato parece romperla.
  operaciones_maximas_mensuales integer check (operaciones_maximas_mensuales > 0),
  frecuencia_esperada  text,

  -- Art. 23 Ter 1 fr. III y Art. 3 fr. XI Sexties incisos c), d) y e).
  zona_geografica      text,
  origen_recursos      text,
  destino_recursos     text,
  actividad_economica  text,

  -- Art. 23 Ter 1 fr. IV y XI Sexties f): «los demás elementos y criterios que
  -- determine quien realice la Actividad Vulnerable». La forma la decide él,
  -- por eso jsonb y no columnas. VIZO no siembra ninguna clave aquí.
  otros_elementos jsonb not null default '{}'::jsonb,

  -- El ancla del reloj: la fecha del «acto u operación de que se trate» (¶2).
  -- No es la fecha de captura ni la de vigencia: es la que hace correr los
  -- seis meses, y por eso una reevaluación la hereda en vez de moverla.
  fecha_ancla   date not null,
  operacion_id  uuid,

  vigente_desde date not null,
  -- La fecha A PARTIR DE LA CUAL este perfil debe reevaluarse. Mismo nombre y
  -- mismo sentido que `evaluaciones_riesgo.vence`. No la escribe quien captura:
  -- el trigger la contrasta contra el catálogo.
  vence         date not null,

  corrige_a     uuid,
  motivo        text,
  registrado_por uuid references usuarios(id),
  registrado_en  timestamptz not null default now(),

  unique (tenant_id, id),
  foreign key (tenant_id, cliente_id)   references clientes_finales(tenant_id, id),
  foreign key (tenant_id, operacion_id) references operaciones(tenant_id, id),
  foreign key (tenant_id, corrige_a)    references perfiles_transaccionales(tenant_id, id),

  -- El ¶4 habla de UN acto concreto. Un perfil de acto único que no lo nombre
  -- no es comprobable.
  constraint acto_unico_nombra_su_acto
    check (origen <> 'acto_unico' or operacion_id is not null),
  constraint correccion_nombra_lo_que_corrige
    check ((origen = 'correccion') = (corrige_a is not null)),
  -- Reevaluar y corregir son decisiones; una decisión sin razón asentada no se
  -- puede defender en una revisión.
  constraint decision_dice_por_que
    check (origen not in ('reevaluacion', 'correccion')
           or (motivo is not null and length(btrim(motivo)) > 0)),
  constraint vence_despues_de_vigencia check (vence > vigente_desde),
  constraint vigencia_no_precede_al_acto check (vigente_desde >= fecha_ancla)
);

comment on table perfiles_transaccionales is
  'Histórico append-only del Perfil transaccional por cliente (Art. 23 Ter 1 del Acuerdo 115/2026). El monto máximo mensual lo declara el CLIENTE, no VIZO ni el obligado; VIZO compara lo declarado con lo ocurrido, que es lo que el ¶2 pide detectar. El perfil vigente se lee de la vista clientes_perfil_vigente: no hay columna que se sobrescriba, porque el Art. 41 fr. IV exige conservar el histórico de sus modificaciones por no menos de diez años.';

create index on perfiles_transaccionales (tenant_id, cliente_id, secuencia desc);
create index on perfiles_transaccionales (tenant_id, vence);

-- ---------------------------------------------------------------------------
-- 3. Los plazos, como dato con fuente
-- ---------------------------------------------------------------------------
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'perfil_maduracion_meses', '6'::jsonb,
   'Cuánto rige el Perfil transaccional inicial, y a partir de cuándo el cliente queda sujeto a reevaluación. Es un piso: antes de esa fecha, lo declarado por el cliente gobierna.',
   date '2027-03-01',
   'Art. 23 Ter 1, párrafos 2 y 3, del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): «al menos durante los seis primeros meses siguientes en que se llevó a cabo el acto u operación» (¶2) y «cuyo acto u operación se hubiere realizado al menos con seis meses de anticipación» (¶3, segunda oración). Son la misma frontera vista desde los dos lados. Contrastado el 2026-08-21.'),
  (null, 'reevaluacion_perfil_meses', '6'::jsonb,
   'Cada cuánto se reevalúa el Perfil transaccional de un cliente ya maduro. Es un techo: puede hacerse más seguido, y para el riesgo alto el Art. 23 Ter 3 lo pide.',
   date '2027-03-01',
   'Art. 23 Ter 1, párrafo 3, primera oración, del Acuerdo 115/2026: «deberán llevar a cabo, al menos cada seis meses, la evaluación del Perfil transaccional». NO comparte fila con perfil_maduracion_meses ni con reevaluacion_grado_meses (Art. 23 Bis 1) ni con ventana_acumulacion_meses (Art. 19 de la Ley): cuatro plazos con el mismo número y cuatro fundamentos distintos. Si una reforma mueve uno, los otros no deben moverse solos. Contrastado el 2026-08-21.');

-- ---------------------------------------------------------------------------
-- 4. Lo que la base no deja escribir
-- ---------------------------------------------------------------------------
create or replace function app.perfil_transaccional_coherente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maduracion int;
  v_cadencia   int;
  v_previo     public.perfiles_transaccionales%rowtype;
  v_fecha_op   date;
  v_ops        int;
  v_limite     date;
begin
  select (valor #>> '{}')::int into v_maduracion
    from public.parametros_motor
   where clave = 'perfil_maduracion_meses' and actividad_id is null
   order by vigente_desde desc limit 1;

  select (valor #>> '{}')::int into v_cadencia
    from public.parametros_motor
   where clave = 'reevaluacion_perfil_meses' and actividad_id is null
   order by vigente_desde desc limit 1;

  -- Sin plazo en el catálogo no se deriva nada. La regla dura 6 antes que un
  -- coalesce cómodo: un seis hardcodeado aquí sobreviviría a la reforma que lo
  -- cambie, y nadie lo notaría hasta la revisión.
  if v_maduracion is null or v_cadencia is null then
    raise exception
      'Faltan los plazos del Perfil transaccional en parametros_motor (perfil_maduracion_meses, reevaluacion_perfil_meses). Sin ellos no se puede derivar cuándo vence un perfil.'
      using errcode = 'check_violation';
  end if;

  -- La fecha ancla tiene que ser la del acto que se nombra, no otra.
  if new.operacion_id is not null then
    select fecha_operacion into v_fecha_op
      from public.operaciones where id = new.operacion_id;
    if v_fecha_op is distinct from new.fecha_ancla then
      raise exception
        'La fecha ancla del perfil (%) no es la del acto que nombra (%). De esa fecha cuelgan los seis meses del Art. 23 Ter 1 ¶2.',
        new.fecha_ancla, v_fecha_op
        using errcode = 'check_violation';
    end if;
  end if;

  select * into v_previo
    from public.perfiles_transaccionales
   where tenant_id = new.tenant_id and cliente_id = new.cliente_id
   order by secuencia desc limit 1;

  if new.origen in ('inicial', 'acto_unico') then
    -- Un perfil inicial solo abre la historia de un cliente. La excepción: un
    -- cliente de acto único que vuelve a operar rompió la premisa del ¶4 («en
    -- ese momento se extinga la relación»), y entonces sí necesita uno nuevo,
    -- anclado en el acto nuevo.
    if v_previo.id is not null and v_previo.origen <> 'acto_unico' then
      raise exception
        'Este cliente ya tiene Perfil transaccional (origen %). Un perfil inicial no sustituye al vigente: se reevalúa o se corrige.',
        v_previo.origen
        using errcode = 'check_violation';
    end if;

    -- El ¶4 describe un caso concreto: UN acto y la relación se extingue ahí.
    if new.origen = 'acto_unico' then
      select count(*) into v_ops
        from public.operaciones
       where tenant_id = new.tenant_id and cliente_id = new.cliente_id;
      if v_ops <> 1 then
        raise exception
          'El perfil de acto único del Art. 23 Ter 1 ¶4 supone un solo acto, y este cliente tiene %. Con más de uno el perfil se integra con lo declarado y se reevalúa como cualquier otro.',
          v_ops
          using errcode = 'check_violation';
      end if;
    end if;

    -- ¶2 es un piso y ¶3 una elegibilidad: el primer perfil vence exactamente
    -- al cumplirse la maduración. Ni antes (lo declarado gobierna) ni después
    -- (la cadencia ya corre).
    if new.vence <> (new.fecha_ancla + (v_maduracion || ' months')::interval)::date then
      raise exception
        'Un perfil % vence el %, y el Art. 23 Ter 1 lo fija en la fecha del acto más % meses: el %.',
        new.origen, new.vence, v_maduracion,
        (new.fecha_ancla + (v_maduracion || ' months')::interval)::date
        using errcode = 'check_violation';
    end if;

  elsif new.origen = 'reevaluacion' then
    if v_previo.id is null then
      raise exception
        'No hay Perfil transaccional que reevaluar para este cliente. La primera fila es inicial (¶2) o de acto único (¶4).'
        using errcode = 'check_violation';
    end if;

    -- El ancla no se mueve: es la fecha del acto, no la del ejercicio.
    if new.fecha_ancla is distinct from v_previo.fecha_ancla then
      raise exception
        'La reevaluación cambió la fecha ancla de % a %. El ancla es la del acto original; moverla correría el reloj del Art. 23 Ter 1 hacia adelante.',
        v_previo.fecha_ancla, new.fecha_ancla
        using errcode = 'check_violation';
    end if;

    -- ¶3, segunda oración: al cliente todavía no le toca.
    v_limite := (v_previo.fecha_ancla + (v_maduracion || ' months')::interval)::date;
    if new.vigente_desde < v_limite then
      raise exception
        'La reevaluación es del % y el acto fue el %: el Art. 23 Ter 1 ¶3 la reserva a clientes cuyo acto ocurrió al menos % meses antes, o sea a partir del %. Hasta entonces gobierna lo que el cliente declaró.',
        new.vigente_desde, v_previo.fecha_ancla, v_maduracion, v_limite
        using errcode = 'check_violation';
    end if;

    -- ¶3, primera oración: «al menos cada seis meses» es un techo.
    if new.vence > (new.vigente_desde + (v_cadencia || ' months')::interval)::date then
      raise exception
        'La reevaluación fija el siguiente repaso para el %, más de % meses después del %. El Art. 23 Ter 1 ¶3 pone ese plazo como máximo, no como sugerencia.',
        new.vence, v_cadencia, new.vigente_desde
        using errcode = 'check_violation';
    end if;

  else  -- correccion
    if v_previo.id is null or v_previo.id <> new.corrige_a then
      raise exception
        'Una corrección solo aplica sobre el perfil vigente del cliente. No se corrige una fila intermedia del histórico.'
        using errcode = 'check_violation';
    end if;
    -- La corrección compra exactitud, nunca tiempo.
    if new.fecha_ancla is distinct from v_previo.fecha_ancla
       or new.vence is distinct from v_previo.vence then
      raise exception
        'Una corrección no mueve el reloj: hereda la fecha ancla (%) y el vencimiento (%) de la fila que corrige. Si lo que cambió es el plazo y no el dato, eso es una reevaluación.',
        v_previo.fecha_ancla, v_previo.vence
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger perfil_transaccional_coherencia
  before insert on perfiles_transaccionales
  for each row execute function app.perfil_transaccional_coherente();

create trigger perfiles_append_only
  before update or delete on perfiles_transaccionales
  for each row execute function app.prohibir_mutacion();

create trigger perfiles_sin_truncate
  before truncate on perfiles_transaccionales
  execute function app.prohibir_mutacion();

-- ---------------------------------------------------------------------------
-- 5. El perfil vigente se LEE
-- ---------------------------------------------------------------------------
create view clientes_perfil_vigente
with (security_invoker = true) as
select distinct on (p.cliente_id)
       p.tenant_id,
       p.cliente_id,
       p.id           as perfil_id,
       p.origen,
       p.fuente,
       p.monto_maximo_mensual,
       p.operaciones_maximas_mensuales,
       p.fecha_ancla,
       p.vigente_desde,
       p.vence,
       (p.vence <= (now() at time zone 'America/Mexico_City')::date) as reevaluacion_debida
  from perfiles_transaccionales p
 order by p.cliente_id, p.secuencia desc;

comment on view clientes_perfil_vigente is
  'El Perfil transaccional vigente de cada cliente: la fila más reciente. reevaluacion_debida marca a quienes ya cumplieron la maduración del Art. 23 Ter 1 ¶3 y esperan el ejercicio periódico.';

-- ---------------------------------------------------------------------------
-- 6. La alerta del Art. 23 Ter 2, colgada de lo que la produce
-- ---------------------------------------------------------------------------
-- `alertas.evaluacion_id` apunta a `evaluaciones_umbral`, y una desviación de
-- perfil no nace de una evaluación de umbral: nace de comparar una operación
-- contra lo que el cliente declaró. Sin estas dos columnas la alerta existiría
-- sin poder decir de qué operación ni contra qué perfil se levantó — y el
-- panel de alertas, que hoy trae el nombre del aportante por join desde
-- `evaluaciones_umbral`, la mostraría sin cliente.
alter table alertas add column perfil_id    uuid;
alter table alertas add column operacion_id uuid;

alter table alertas
  add constraint alertas_perfil_fk
    foreign key (tenant_id, perfil_id) references perfiles_transaccionales(tenant_id, id),
  add constraint alertas_operacion_fk
    foreign key (tenant_id, operacion_id) references operaciones(tenant_id, id),
  add constraint desviacion_nombra_perfil_y_operacion
    check (tipo <> 'desviacion_perfil'
           or (perfil_id is not null and operacion_id is not null));

-- ---------------------------------------------------------------------------
-- 7. RLS y privilegios
-- ---------------------------------------------------------------------------
alter table perfiles_transaccionales enable row level security;

create policy "ver los perfiles de mi obligado" on perfiles_transaccionales
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "registrar el perfil" on perfiles_transaccionales
  for insert to authenticated with check (tenant_id = app.tenant_id());

grant select, insert on perfiles_transaccionales to authenticated;
grant select on clientes_perfil_vigente to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('perfiles_transaccionales','authenticated','INSERT',null,
   'se asienta lo que el cliente declara, y cada reevaluación o corrección agrega fila; nunca se edita');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_otro uuid;
  v_sucursal uuid; v_actividad uuid; v_desarrollo uuid;
  v_op1 uuid; v_op2 uuid;
  v_perfil uuid; v_alerta uuid;
  v_rechazo boolean; v_problemas text;
  v_ancla date := date '2027-03-05';
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('PTR270301AB1', 'Aserción perfil transaccional', 'moral') returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-perfil@ejemplo.mx')
  returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Perfil', 'asercion-perfil@ejemplo.mx');

  insert into sucursales (tenant_id, nombre, clave)
  values (v_tenant, 'Matriz de aserción', 'ASP') returning id into v_sucursal;

  select id into v_actividad from actividades_vulnerables where fraccion = 'V_BIS';

  insert into desarrollos_inmobiliarios
    (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal,
     colonia, calle, tipo_desarrollo, monto_desarrollo, unidades_comercializadas, costo_unidad)
  values (v_tenant, 'Desarrollo de aserción', 'ASP-001', '31', '97100',
          'Itzimná', 'Calle 21', '1', 40000000, 20, 2000000)
  returning id into v_desarrollo;

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'PEAA800101AA1', 'Cliente de Aserción', 'MX')
  returning id into v_cliente;

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'PEBB800101BB2', 'Cliente de Acto Único', 'MX')
  returning id into v_otro;

  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_sucursal, v_cliente, v_actividad, v_ancla, 500000, 500000, '03', v_desarrollo)
  returning id into v_op1;

  -- 1. La fecha ancla tiene que ser la del acto que nombra.
  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, operacion_id, vigente_desde, vence)
    values (v_tenant, v_cliente, 'inicial', 'declarada_por_cliente', 800000,
            v_ancla + 40, v_op1, v_ancla + 40, (v_ancla + 40 + interval '6 months')::date);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un perfil se ancló en una fecha que no es la del acto que nombra: los seis meses del ¶2 correrían desde una fecha inventada.';
  end if;

  -- 2. El primer perfil vence exactamente a los seis meses del acto. Ni antes.
  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, operacion_id, vigente_desde, vence)
    values (v_tenant, v_cliente, 'inicial', 'declarada_por_cliente', 800000,
            v_ancla, v_op1, v_ancla, (v_ancla + interval '2 months')::date);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un perfil inicial venció a los dos meses: el Art. 23 Ter 1 ¶2 obliga a considerar lo declarado por el cliente al menos seis.';
  end if;

  -- El camino bueno.
  insert into perfiles_transaccionales
    (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
     operaciones_maximas_mensuales, origen_recursos, fecha_ancla, operacion_id,
     vigente_desde, vence, registrado_por)
  values (v_tenant, v_cliente, 'inicial', 'declarada_por_cliente', 800000,
          2, 'Ahorro y venta de un inmueble previo', v_ancla, v_op1,
          v_ancla, (v_ancla + interval '6 months')::date, v_user)
  returning id into v_perfil;

  -- 3. Un segundo perfil inicial no sustituye al vigente.
  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, operacion_id, vigente_desde, vence)
    values (v_tenant, v_cliente, 'inicial', 'declarada_por_cliente', 9000000,
            v_ancla, v_op1, v_ancla, (v_ancla + interval '6 months')::date);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se abrió un segundo perfil inicial sobre un cliente que ya tenía uno: el tope se habría subido sin dejar rastro de reevaluación.';
  end if;

  -- 4. Reevaluar antes de la maduración: el ¶3 lo reserva a clientes maduros.
  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, vigente_desde, vence, motivo)
    values (v_tenant, v_cliente, 'reevaluacion', 'archivos_del_obligado', 9000000,
            v_ancla, (v_ancla + interval '2 months')::date,
            (v_ancla + interval '8 months')::date, 'Subir el tope');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se reevaluó el perfil a los dos meses del acto. Ese es el hueco que el ¶2 cierra: subir el tope declarado para que la operación grande deje de desviarse.';
  end if;

  -- 5. Y una reevaluación no puede empujar el siguiente repaso más allá de la cadencia.
  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, vigente_desde, vence, motivo)
    values (v_tenant, v_cliente, 'reevaluacion', 'archivos_del_obligado', 900000,
            v_ancla, (v_ancla + interval '6 months')::date,
            (v_ancla + interval '30 months')::date, 'Repaso semestral');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una reevaluación fijó el siguiente repaso a dos años: el Art. 23 Ter 1 ¶3 pone seis meses como máximo.';
  end if;

  -- 6. Una corrección no puede mover el reloj.
  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, operacion_id, vigente_desde, vence, corrige_a, motivo)
    values (v_tenant, v_cliente, 'correccion', 'declarada_por_cliente', 850000,
            v_ancla, v_op1, v_ancla, (v_ancla + interval '18 months')::date,
            v_perfil, 'Se capturó 800 mil y el cliente declaró 850 mil');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Una corrección movió el vencimiento: habría comprado un año de vigencia sin reevaluar nada.';
  end if;

  -- La corrección buena, que sí pasa.
  insert into perfiles_transaccionales
    (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
     fecha_ancla, operacion_id, vigente_desde, vence, corrige_a, motivo, registrado_por)
  values (v_tenant, v_cliente, 'correccion', 'declarada_por_cliente', 850000,
          v_ancla, v_op1, v_ancla, (v_ancla + interval '6 months')::date,
          v_perfil, 'Se capturó 800 mil y el cliente declaró 850 mil', v_user);

  -- 7. La vista devuelve la MÁS RECIENTE, y las dos filas se conservan.
  if (select monto_maximo_mensual from clientes_perfil_vigente where cliente_id = v_cliente) <> 850000 then
    raise exception 'La vista del perfil vigente no devolvió la fila más reciente. Con dos filas en la misma transacción, ordenar por registrado_en es indeterminado.';
  end if;
  if (select count(*) from perfiles_transaccionales where cliente_id = v_cliente) <> 2 then
    raise exception 'El histórico perdió una fila: el Art. 41 fr. IV exige conservar las modificaciones del Perfil transaccional.';
  end if;

  -- 8. El perfil es append-only.
  v_rechazo := false;
  begin
    update perfiles_transaccionales set monto_maximo_mensual = 99000000 where id = v_perfil;
  exception when others then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Un perfil se pudo reescribir: se habría cambiado hacia atrás el tope contra el que ya se comparó una operación.';
  end if;

  -- 9. El acto único del ¶4 supone un solo acto.
  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_sucursal, v_otro, v_actividad, v_ancla, 200000, 200000, '03', v_desarrollo)
  returning id into v_op2;
  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_sucursal, v_otro, v_actividad, v_ancla + 10, 200000, 200000, '03', v_desarrollo);

  v_rechazo := false;
  begin
    insert into perfiles_transaccionales
      (tenant_id, cliente_id, origen, fuente, monto_maximo_mensual,
       fecha_ancla, operacion_id, vigente_desde, vence)
    values (v_tenant, v_otro, 'acto_unico', 'declarada_por_cliente', 200000,
            v_ancla, v_op2, v_ancla, (v_ancla + interval '6 months')::date);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se registró un perfil de acto único para un cliente con dos operaciones: la premisa del ¶4 —que la relación se extinga en ese momento— ya no se cumplía.';
  end if;

  -- 10. La alerta de desviación tiene que decir de qué operación y contra qué perfil.
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, titulo, detalle)
    values (v_tenant, 'desviacion_perfil', 'Sin decir contra qué', '{}'::jsonb);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se levantó una alerta de desviación de perfil sin nombrar la operación ni el perfil: no habría forma de mostrar contra qué se desvió.';
  end if;

  insert into alertas (tenant_id, tipo, perfil_id, operacion_id, titulo, detalle)
  values (v_tenant, 'desviacion_perfil', v_perfil, v_op1,
          'La operación se aparta del perfil declarado',
          '{"por":"monto_mensual"}'::jsonb)
  returning id into v_alerta;

  -- Limpieza.
  delete from alertas where tenant_id = v_tenant;
  alter table perfiles_transaccionales disable trigger perfiles_append_only;
  delete from perfiles_transaccionales where tenant_id = v_tenant;
  alter table perfiles_transaccionales enable trigger perfiles_append_only;
  alter table operaciones disable trigger operaciones_append_only;
  delete from operaciones      where tenant_id = v_tenant;
  alter table operaciones enable trigger operaciones_append_only;
  delete from desarrollos_inmobiliarios where tenant_id = v_tenant;
  delete from clientes_finales where tenant_id = v_tenant;
  delete from sucursales       where tenant_id = v_tenant;
  delete from usuarios         where tenant_id = v_tenant;
  delete from auth.users       where id = v_user;
  delete from tenants          where id = v_tenant;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_por_omision();
  if v_problemas is not null then
    raise exception 'Privilegios por omisión sobre la tabla nueva:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_tenancy();
  if v_problemas is not null then
    raise exception 'Tenancy incompleta:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ perfil transaccional: el tope lo declara el cliente, el reloj no se puede correr, y el histórico queda';
end $$;
