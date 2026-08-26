-- ===========================================================================
-- Art. 10 Septies 1 — lo que le faltaba a la metodología del Cap. II Quáter
-- Acuerdo 115/2026, DOF 7-ago-2026 (código 5795797, edición vespertina).
-- Texto oficial: regulatorio/dof/acuerdo-115-2026.doc, SHA-256 19af24b3…
-- Exigible: 1 de marzo de 2027 (Transitorio Segundo).
-- ===========================================================================
--
-- EL ARTÍCULO PIDE CUATRO COSAS, Y VIZO TENÍA UNA Y MEDIA
--
--   Fr. I   «Identificar los ELEMENTOS e INDICADORES asociados a cada uno de
--       ellos […] considerando al menos: a) actos u operaciones; b) tipo de
--       personas Clientes o Usuarias; c) países y áreas geográficas; d)
--       transacciones y canales […]»
--       → YA ESTABA: `elementos_riesgo` con los cuatro sembrados del catálogo,
--         y `factores_modelo.indicadores` con los del obligado (ADR-21).
--
--   Fr. II  «Utilizar un método para la medición […] y asignar UN VALOR A CADA
--       UNO DE ELLOS […]. A SU VEZ, SE DEBERÁ ASIGNAR UN VALOR A CADA UNO DE
--       LOS ELEMENTOS DE RIESGO DEFINIDOS […]»
--       → ESTABA A MEDIAS: había peso por indicador y NO por elemento. Son dos
--         niveles, y el artículo los pide con dos oraciones distintas.
--
--   Fr. III «Identificar los MITIGANTES que tenga implementados al momento del
--       diseño […] a fin de establecer el EFECTO que estos tendrán sobre los
--       indicadores y elementos de Riesgo […]»
--       → NO EXISTÍA.
--
--   ¶ final «[…] deberán establecer dentro de su metodología INDICADORES
--       ESPECÍFICOS relacionados con los DELITOS previstos en los artículos
--       139 QUÁTER y 400 BIS del Código Penal Federal, PARA CADA UNO de los
--       elementos de Riesgo […]»
--       → NO EXISTÍA, y es la exigencia más concreta de todo el artículo.
--
-- ---------------------------------------------------------------------------
-- TRES DECISIONES, Y POR QUÉ NINGUNA INVENTA METODOLOGÍA
-- ---------------------------------------------------------------------------
--
-- 1. EL PESO POR ELEMENTO NO CAMBIA NINGÚN MODELO YA CONFIGURADO. Añadirlo al
--    cálculo de `suma_ponderada` movería el puntaje de clientes ya
--    clasificados sin que nadie lo decidiera — el modo de falla de la regla
--    dura 6 en su forma más cara. Por eso entra como un MÉTODO NUEVO que el
--    obligado declara (`suma_ponderada_por_elemento`), y el motor ya sabe
--    detenerse ante un método que no conoce. Un modelo que siga en
--    `suma_ponderada` no se rompe: simplemente no acredita la segunda oración
--    de la fr. II, y eso se enseña como hueco.
--
-- 2. VIZO NO PROPONE MITIGANTES NI SU EFECTO. La fr. III los ata a «todas las
--    políticas, criterios, medidas y procedimientos internos previstos en su
--    Manual de Políticas Internas»: son del obligado, como los factores
--    (ADR-21). Lo que VIZO exige es que cada mitigante DIGA sobre qué elemento
--    actúa y con qué efecto — un mitigante que no dice sobre qué actúa no
--    permite «establecer el efecto» que el artículo pide.
--
-- 3. LOS DOS DELITOS SON DEL CÓDIGO PENAL, NO DEL CATÁLOGO DEL OBLIGADO. El
--    ¶ final los nombra: Arts. 139 Quáter (financiamiento al terrorismo) y 400
--    Bis (operaciones con recursos de procedencia ilícita). Por eso son un
--    enum de dos valores y no una tabla configurable: no hay un tercero que el
--    obligado pueda añadir. Lo que sí es suyo es QUÉ indicador se relaciona
--    con cuál.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Fr. II — el valor de cada ELEMENTO
-- ---------------------------------------------------------------------------
create table pesos_elemento (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  modelo_id   uuid not null references modelos_riesgo(id),
  elemento_id uuid not null references elementos_riesgo(id),
  -- «un valor […] en función de su importancia para describir los Riesgos a
  -- los que se está expuesto». El número lo pone el obligado; VIZO solo exige
  -- que no sea negativo, porque un peso negativo convertiría un elemento de
  -- riesgo en uno que RESTA riesgo, y eso no es un peso: es un mitigante, que
  -- vive en su propia tabla por mandato de la fr. III.
  peso        numeric(6,3) not null,
  created_at  timestamptz not null default now(),

  constraint peso_de_elemento_no_negativo check (peso >= 0),
  constraint un_peso_por_elemento_y_modelo unique (modelo_id, elemento_id)
);

comment on table pesos_elemento is
  'Art. 10 Septies 1 fr. II, segunda oración: «se deberá asignar un valor a '
  'cada uno de los elementos de Riesgo definidos». Es el SEGUNDO nivel de '
  'ponderación —el primero es factores_modelo.peso, por indicador—. VIZO no '
  'sugiere valores: un peso sugerido que nadie cambia se vuelve, en los '
  'hechos, la metodología del obligado (ADR-21).';

create index on pesos_elemento (tenant_id, modelo_id);

-- Se congela con el modelo, igual que los factores: cambiar un peso de un
-- modelo vigente movería el criterio con el que ya se clasificó a clientes.
create trigger peso_elemento_congelado
  before insert or update or delete on pesos_elemento
  for each row execute function app.factor_modelo_solo_en_borrador();

-- ---------------------------------------------------------------------------
-- 2. Fr. III — los Mitigantes
-- ---------------------------------------------------------------------------
create table mitigantes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  modelo_id   uuid not null references modelos_riesgo(id),
  -- «las políticas, criterios, medidas y procedimientos implementados» (Art. 3
  -- fr. XI Quáter). Texto libre porque son del Manual del obligado.
  descripcion text not null,
  -- «a fin de establecer el EFECTO que estos tendrán sobre los indicadores y
  -- elementos de Riesgo». Un mitigante sin efecto declarado no cumple la
  -- fracción: es una política mencionada, no un mitigante identificado.
  efecto      text not null,
  created_at  timestamptz not null default now(),

  constraint descripcion_de_mitigante_no_vacia check (length(btrim(descripcion)) > 0),
  constraint efecto_de_mitigante_no_vacio check (length(btrim(efecto)) > 0)
);

comment on table mitigantes is
  'Art. 10 Septies 1 fr. III. VIZO no propone mitigantes ni su efecto: son las '
  'políticas del Manual de Políticas Internas del obligado. Lo que sí exige es '
  'que cada uno diga sobre QUÉ elemento actúa (mitigantes_elementos) y con qué '
  'efecto, porque sin eso no se puede «establecer el efecto» que pide el texto.';

create index on mitigantes (tenant_id, modelo_id);

create trigger mitigante_congelado
  before insert or update or delete on mitigantes
  for each row execute function app.factor_modelo_solo_en_borrador();

-- Un mitigante puede actuar sobre varios elementos, y un elemento puede tener
-- varios mitigantes. Tabla de enlace y no una columna: repetir la descripción
-- por elemento haría que corregirla en un renglón y no en otro fuera posible.
create table mitigantes_elementos (
  tenant_id    uuid not null references tenants(id),
  mitigante_id uuid not null references mitigantes(id) on delete cascade,
  elemento_id  uuid not null references elementos_riesgo(id),
  primary key (mitigante_id, elemento_id)
);

comment on table mitigantes_elementos is
  'Sobre qué elementos de Riesgo actúa cada mitigante (Art. 10 Septies 1 fr. '
  'III). Sin al menos un elemento, el mitigante no permite establecer su '
  'efecto y la fracción no queda acreditada.';

create index on mitigantes_elementos (tenant_id, elemento_id);

-- ---------------------------------------------------------------------------
-- 3. ¶ final — los indicadores de los dos delitos
-- ---------------------------------------------------------------------------
-- Enum y no tabla: el párrafo nombra DOS artículos del Código Penal Federal y
-- no hay un tercero que el obligado pueda añadir. Lo configurable es qué
-- indicador se relaciona con cuál, no cuáles delitos existen.
create type delito_cpf as enum (
  'art_139_quater',  -- financiamiento al terrorismo
  'art_400_bis'      -- operaciones con recursos de procedencia ilícita
);

-- Los factores que ya existen se quedan con el arreglo vacío, que es la
-- verdad: no se declararon como indicadores de delito. Un default distinto
-- afirmaría que sí lo son.
alter table factores_modelo
  add column delitos delito_cpf[] not null default '{}'::delito_cpf[];

comment on column factores_modelo.delitos is
  'Art. 10 Septies 1, párrafo final: los indicadores específicos relacionados '
  'con los delitos de los Arts. 139 Quáter y 400 Bis del CPF, exigidos PARA '
  'CADA UNO de los elementos de Riesgo. Vacío significa que este indicador no '
  'se declaró como tal — no que no lo sea.';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table pesos_elemento        enable row level security;
alter table mitigantes            enable row level security;
alter table mitigantes_elementos  enable row level security;

create policy "ver los pesos de mi obligado" on pesos_elemento
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin configura los pesos" on pesos_elemento
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver los mitigantes de mi obligado" on mitigantes
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin configura los mitigantes" on mitigantes
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

create policy "ver los elementos de un mitigante" on mitigantes_elementos
  for select to authenticated using (tenant_id = app.tenant_id());
create policy "admin liga mitigante y elemento" on mitigantes_elementos
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.es_admin())
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert, update, delete on pesos_elemento       to authenticated;
grant select, insert, update, delete on mitigantes           to authenticated;
grant select, insert, update, delete on mitigantes_elementos to authenticated;

select app.verificar_privilegios_por_omision();

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_modelo uuid; v_elem uuid; v_elem2 uuid;
  v_mit uuid; v_rechazo boolean;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('IIQ270401AB1', 'Aserción Cap. II Quáter', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-iiq@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción IIQ', 'asercion-iiq@ejemplo.mx');

  select id into v_elem  from elementos_riesgo where clave = 'tipo_cliente';
  select id into v_elem2 from elementos_riesgo where clave = 'geografia';
  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;

  -- ── 1. El camino feliz, en borrador ───────────────────────────────────
  insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso)
  values (v_tenant, v_modelo, v_elem, 2.5);
  insert into mitigantes (tenant_id, modelo_id, descripcion, efecto)
  values (v_tenant, v_modelo, 'Doble revisión del expediente antes de operar.',
          'Reduce la exposición del elemento tipo de cliente al detectar identidades incompletas.')
  returning id into v_mit;
  insert into mitigantes_elementos (tenant_id, mitigante_id, elemento_id)
  values (v_tenant, v_mit, v_elem);
  assert v_mit is not null, 'ASERCIÓN 1: la configuración válida no entró';

  -- ── 2. Un peso NEGATIVO no es un peso: es un mitigante disfrazado ─────
  v_rechazo := false;
  begin
    insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso)
    values (v_tenant, v_modelo, v_elem2, -1);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: entró un peso de elemento negativo';

  -- ── 3. Dos pesos para el mismo elemento del mismo modelo ──────────────
  v_rechazo := false;
  begin
    insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso)
    values (v_tenant, v_modelo, v_elem, 9);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: un elemento quedó con dos pesos en el mismo modelo';

  -- ── 4. Un mitigante sin EFECTO declarado ──────────────────────────────
  v_rechazo := false;
  begin
    insert into mitigantes (tenant_id, modelo_id, descripcion, efecto)
    values (v_tenant, v_modelo, 'Una política cualquiera.', '   ');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: entró un mitigante sin efecto: la fr. III lo exige';

  -- ── 5. Los factores viejos NO se declaran solos indicadores de delito ─
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Factor sin delitos', 10);
  assert (select delitos from factores_modelo
           where modelo_id = v_modelo and factor = 'Factor sin delitos') = '{}'::delito_cpf[],
    'ASERCIÓN 5: un factor existente se declaró solo como indicador de delito';

  -- ── 6. Y sí se pueden declarar los dos delitos del ¶ final ────────────
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso, delitos)
  values (v_tenant, v_modelo, v_elem2, 'Cliente en zona de frontera', 20,
          '{art_139_quater,art_400_bis}'::delito_cpf[]);
  assert (select cardinality(delitos) from factores_modelo
           where modelo_id = v_modelo and factor = 'Cliente en zona de frontera') = 2,
    'ASERCIÓN 6: no se pudieron declarar los dos delitos del Código Penal';

  -- ── 7, 8 y 9. Un modelo VIGENTE se congela, como los factores ─────────
  -- La escala va antes: `app.escala_de_riesgo_*` no deja poner vigente un
  -- modelo sin las tres clasificaciones del Art. 23 Bis. Lo descubrió esta
  -- migración al correr, que es para lo que sirven esas guardas.
  insert into grados_riesgo (tenant_id,clave,nombre,orden,es_alto,puntaje_minimo,vigente_desde)
  values (v_tenant,'bajo','Bajo',1,false,0,current_date),
         (v_tenant,'medio','Medio',2,false,35,current_date),
         (v_tenant,'alto','Alto',3,true,70,current_date);

  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  v_rechazo := false;
  begin
    insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso)
    values (v_tenant, v_modelo, v_elem2, 3);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se añadió un peso a un modelo ya vigente';

  v_rechazo := false;
  begin
    update pesos_elemento set peso = 99 where modelo_id = v_modelo;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se movió el peso de un elemento en un modelo vigente';

  v_rechazo := false;
  begin
    insert into mitigantes (tenant_id, modelo_id, descripcion, efecto)
    values (v_tenant, v_modelo, 'Otra política.', 'Otro efecto.');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 9: se añadió un mitigante a un modelo ya vigente';

  raise notice 'Cap. II Quáter (Art. 10 Septies 1): 9 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
