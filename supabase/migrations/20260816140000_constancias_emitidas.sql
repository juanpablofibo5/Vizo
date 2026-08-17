-- ---------------------------------------------------------------------------
-- Una Constancia emitida es evidencia, no una descarga
-- ---------------------------------------------------------------------------
-- ADR-20, segunda pieza (issue #18). El Manual de Políticas Internas va a
-- REFERENCIAR la Constancia de mecanismos, y eso solo funciona si la referencia
-- apunta a algo fijo.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTO NO PODÍA QUEDARSE COMO UN BOTÓN DE DESCARGA
-- ────────────────────────────────────────────────────────────────────────────
-- Art. 37, párrafo 2: el Manual «deberá incluir las REFERENCIAS de aquellos
-- criterios, medidas, procedimientos internos y demás información que […]
-- puedan quedar plasmados en un documento distinto».
--
-- Una referencia a un documento que se regenera distinto cada vez no es una
-- referencia: es un deseo. Si el obligado escribe en su Manual «ver Constancia
-- de mecanismos» y esa constancia cambia cada vez que alguien pulsa el botón
-- —porque subió un documento, porque presentó un aviso— entonces el Manual
-- remite a un blanco móvil, y ante una revisión nadie puede decir QUÉ decía la
-- constancia el día que el Manual la citó.
--
-- Emitir es entonces un acto, no una descarga: se congela el texto, se hashea,
-- y queda en la bitácora con quién y cuándo. Es el mismo criterio del aviso y
-- del manifiesto — lo que se entrega a la autoridad se conserva tal como se
-- entregó.

create table constancias (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  -- La fecha con la que se JUZGÓ: decide qué apartados estaban vigentes y con
  -- qué evidencia se cruzaron. No es lo mismo que cuándo se pulsó el botón.
  fecha         date not null,
  -- El texto completo tal como se entregó. Es lo que se hashea: guardar solo
  -- el hash dejaría una huella de algo que nadie puede volver a leer.
  contenido     text not null,
  hash_sha256   char(64) not null,

  -- El reparto, para no tener que reparsear el texto al listarlas.
  total         int not null,
  acreditados   int not null,
  parciales     int not null,
  huecos        int not null,
  degradados    text[] not null default '{}',

  -- Cuando se emitió ANTES de que el Art. 37 Bis entrara en vigor: la fecha en
  -- que entra. NULL = se emitió con el artículo ya vigente.
  anticipada_desde date,

  emitida_por   uuid references usuarios(id),
  emitida_en    timestamptz not null default now(),

  constraint constancia_hash_es_sha256_hex check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  -- Aritmética, no norma: el 14 del Art. 37 Bis vive en el catálogo, no aquí.
  -- Lo que esto impide es una constancia cuyo propio resumen no cuadre.
  constraint constancia_reparto_cuadra
    check (acreditados + parciales + huecos = total and total > 0),
  -- Un degradado es un apartado que el catálogo daba por acreditado y se quedó
  -- sin evidencia, así que no puede haber más degradados que huecos.
  constraint constancia_degradados_caben
    check (cardinality(degradados) <= huecos),
  -- Dos constancias idénticas del mismo día son la misma: emitir dos veces sin
  -- que nada cambie no debería producir dos evidencias distintas.
  constraint constancia_unica_por_contenido unique (tenant_id, fecha, hash_sha256)
);

comment on table constancias is
  'Constancias de mecanismos emitidas. Append-only: lo que se entrega a la autoridad se conserva tal como se entregó, para que el Manual pueda referenciarla por fecha y huella (Art. 37 ¶2 del Acuerdo 115/2026).';

create index on constancias (tenant_id, fecha desc);

-- Append-only. Corregir una constancia es emitir otra, igual que un aviso
-- modificatorio: la anterior se quedó en manos de alguien.
create trigger constancias_append_only
  before update or delete on constancias
  for each row execute function app.prohibir_mutacion();

create trigger constancias_sin_truncate
  before truncate on constancias
  execute function app.prohibir_mutacion();

alter table constancias enable row level security;

create policy "ver constancias de mi obligado" on constancias
  for select to authenticated using (tenant_id = app.tenant_id());

-- Emitir la firma un admin: es el documento que el obligado entrega, y la
-- misma separación de funciones que aprueba avisos y expedientes.
create policy "admin emite constancias" on constancias
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on constancias to authenticated;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('constancias','authenticated','INSERT',null,
   'el admin emite la constancia que su Manual va a referenciar');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
  v_rechazo boolean;
  v_problemas text;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('CON010101AAA', 'Aserción constancias', 'moral') returning id into v_tenant;

  -- 1. Un resumen que no cuadra con su total.
  v_rechazo := false;
  begin
    insert into constancias (tenant_id, fecha, contenido, hash_sha256, total, acreditados, parciales, huecos)
    values (v_tenant, current_date, 'x', repeat('a', 64), 14, 5, 2, 9);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se emitió una constancia cuyo propio resumen no suma: 5+2+9 no es 14.';
  end if;

  -- 2. Más degradados que huecos, que es imposible por construcción.
  v_rechazo := false;
  begin
    insert into constancias (tenant_id, fecha, contenido, hash_sha256, total, acreditados, parciales, huecos, degradados)
    values (v_tenant, current_date, 'x', repeat('a', 64), 14, 5, 2, 7, array['I','II','III','IV','V','VI','VII','VIII']);
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se emitió una constancia con más apartados degradados que huecos.';
  end if;

  -- El camino bueno pasa.
  insert into constancias (tenant_id, fecha, contenido, hash_sha256, total, acreditados, parciales, huecos, degradados)
  values (v_tenant, current_date, '# Constancia', repeat('b', 64), 14, 5, 2, 7, array['VII']);

  -- 3. Y no se puede reescribir: es evidencia.
  v_rechazo := false;
  begin
    update constancias set contenido = 'otra cosa' where tenant_id = v_tenant;
  exception when others then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se pudo reescribir una constancia ya emitida. Corregir es emitir otra.';
  end if;

  -- La limpieza tiene que apagar el guardia, y eso es una buena señal: la
  -- tabla es append-only de verdad, incluso para quien corre la migración. Se
  -- vuelve a encender enseguida — dejarlo apagado sería peor que no haberlo
  -- puesto, porque nadie lo notaría.
  alter table constancias disable trigger constancias_append_only;
  delete from constancias where tenant_id = v_tenant;
  alter table constancias enable trigger constancias_append_only;

  delete from tenants where id = v_tenant;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'constancias_append_only' and not tgisinternal
       and tgenabled <> 'D'
  ) then
    raise exception 'El guardia append-only quedó apagado después de la limpieza.';
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios fuera de lo declarado tras crear constancias:%s', E'\n' || v_problemas;
  end if;

  select string_agg(tabla || ': ' || problema, E'\n')
    into v_problemas from app.verificar_tenancy();
  if v_problemas is not null then
    raise exception 'Tenancy:%s', E'\n' || v_problemas;
  end if;

  raise notice '✓ constancias: append-only, el resumen cuadra con su total, y una emitida no se reescribe';
end $$;
