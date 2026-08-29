-- ---------------------------------------------------------------------------
-- Un MER emitido es evidencia, no una descarga
-- ---------------------------------------------------------------------------
-- La pieza real de A-06 (issue #30) y la fila 19 de ESTADO-VIZO: el documento
-- de la metodología del Cap. II Quáter que ningún competidor declara como
-- entregable. Mismo criterio que las constancias (ADR-20, migración
-- 20260816140000): emitir congela el texto, lo hashea y lo deja en la
-- bitácora con quién y cuándo — el Manual va a REFERENCIAR este documento
-- (Art. 37 ¶2), y una referencia a un blanco móvil no es una referencia.
--
-- Se emite SOLO del modelo vigente: un MER de un borrador documentaría como
-- gobernada una metodología que el obligado no ha aprobado, con su nombre,
-- ante una autoridad. El trigger lo vuelve inexpresable.

create table mer_emitidos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  modelo_id     uuid not null,
  -- Denormalizada para listar sin join: la versión no cambia una vez aprobada.
  version       int not null,
  -- La fecha con la que se JUZGÓ: qué configuración y qué evaluación estaban
  -- vigentes. No es lo mismo que cuándo se pulsó el botón.
  fecha         date not null,
  -- El texto completo tal como se emitió. Es lo que se hashea: guardar solo
  -- el hash dejaría una huella de algo que nadie puede volver a leer.
  contenido     text not null,
  hash_sha256   char(64) not null,

  -- El resumen, para no reparsear el texto al listar.
  total          int not null,
  acreditadas    int not null,
  con_pendientes int not null,
  -- El grado de la evaluación de entidad citada, o NULL si no había.
  grado_entidad  text,

  emitido_por   uuid references usuarios(id),
  emitido_en    timestamptz not null default now(),

  foreign key (tenant_id, modelo_id) references modelos_riesgo (tenant_id, id),
  constraint mer_hash_es_sha256_hex check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  -- Aritmética, no norma: lo que esto impide es un resumen que no cuadre con
  -- su propio total.
  constraint mer_resumen_cuadra
    check (acreditadas + con_pendientes = total and total > 0),
  -- Dos MER idénticos del mismo día son el mismo: emitir dos veces sin que
  -- nada cambie no debería producir dos evidencias distintas.
  constraint mer_unico_por_contenido unique (tenant_id, fecha, hash_sha256)
);

comment on table mer_emitidos is
  'MER emitidos (Cap. II Quáter). Append-only: lo que se entrega a la '
  'autoridad se conserva tal como se entregó, para que el Manual pueda '
  'referenciarlo por fecha y huella (Art. 37 ¶2) y para que cualquier versión '
  'pueda regenerarse y compararse. Solo del modelo vigente (ADR-29).';

create index on mer_emitidos (tenant_id, fecha desc);

-- Un MER de un borrador documentaría una metodología que nadie aprobó.
create or replace function app.mer_solo_de_modelo_vigente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  select estado::text into v_estado
    from public.modelos_riesgo where id = new.modelo_id;

  if v_estado is distinct from 'vigente' then
    raise exception
      'No se emite el MER de un modelo en estado %. El MER documenta la metodología que el obligado aprobó; un borrador todavía no lo es.',
      coalesce(v_estado, 'inexistente')
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger mer_de_modelo_vigente
  before insert on mer_emitidos
  for each row execute function app.mer_solo_de_modelo_vigente();

-- Append-only. Corregir un MER es emitir otro: el anterior quedó en manos de
-- alguien, con su huella.
create trigger mer_emitidos_append_only
  before update or delete on mer_emitidos
  for each row execute function app.prohibir_mutacion();

create trigger mer_emitidos_sin_truncate
  before truncate on mer_emitidos
  execute function app.prohibir_mutacion();

alter table mer_emitidos enable row level security;

create policy "ver los MER de mi obligado" on mer_emitidos
  for select to authenticated using (tenant_id = app.tenant_id());

-- Emitir lo firma un admin: es el documento que el obligado entrega.
create policy "admin emite el MER" on mer_emitidos
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on mer_emitidos to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('mer_emitidos','authenticated','INSERT',null,
   'el admin emite el MER que su Manual va a referenciar (Art. 37 ¶2)');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_modelo uuid; v_elem uuid;
  v_rechazo boolean; v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('MER270301AB1', 'Aserción MER emitido', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-mer@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción MER', 'asercion-mer@ejemplo.mx');

  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;

  -- 1. De un borrador, no: documentaría una metodología que nadie aprobó.
  v_rechazo := false;
  begin
    insert into mer_emitidos
      (tenant_id, modelo_id, version, fecha, contenido, hash_sha256, total, acreditadas, con_pendientes)
    values (v_tenant, v_modelo, 1, current_date, '# MER', repeat('a', 64), 8, 8, 0);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: se emitió un MER de un modelo en borrador';

  -- Activar exige escala con cortes y al menos un factor.
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo',  'Bajo',  1, false, 0,  date '2027-03-01'),
         (v_tenant, 'medio', 'Medio', 2, false, 35, date '2027-03-01'),
         (v_tenant, 'alto',  'Alto',  3, true,  70, date '2027-03-01');
  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Factor de aserción', 10);
  update modelos_riesgo set estado = 'vigente', vigente_desde = current_date,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  -- 2. Un resumen que no cuadra con su total.
  v_rechazo := false;
  begin
    insert into mer_emitidos
      (tenant_id, modelo_id, version, fecha, contenido, hash_sha256, total, acreditadas, con_pendientes)
    values (v_tenant, v_modelo, 1, current_date, '# MER', repeat('a', 64), 8, 5, 2);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: entró un MER cuyo resumen no suma (5+2 no es 8)';

  -- El camino bueno pasa.
  insert into mer_emitidos
    (tenant_id, modelo_id, version, fecha, contenido, hash_sha256, total, acreditadas, con_pendientes, emitido_por)
  values (v_tenant, v_modelo, 1, current_date, '# MER de aserción', repeat('b', 64), 8, 6, 2, v_user);

  -- 3. Y no se reescribe: es evidencia con huella.
  v_rechazo := false;
  begin
    update mer_emitidos set contenido = 'otra cosa' where tenant_id = v_tenant;
  exception when others then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: se reescribió un MER emitido; corregir es emitir otro';

  -- 4. La base sigue cuadrando con el inventario.
  select string_agg(tabla || ': ' || problema, ' · ')
    into v_problemas from app.verificar_privilegios_declarados();
  assert v_problemas is null, 'ASERCIÓN 4: privilegios sin declarar: ' || coalesce(v_problemas, '');
  perform 1 from app.verificar_privilegios_por_omision() limit 1;
  assert not found, 'ASERCIÓN 4b: privilegios por omisión pendientes';

  raise notice '✓ MER emitido: solo del vigente, el resumen cuadra, append-only';
end $$;
