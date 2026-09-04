-- ---------------------------------------------------------------------------
-- Art. 23 Quinquies · La documentación que sustenta el procedimiento
-- ---------------------------------------------------------------------------
-- El párrafo de cierre pide CUATRO cosas y hasta hoy VIZO cumplía tres:
--
--   «deberán DOCUMENTAR EL PROCEDIMIENTO SEGUIDO para la identificación del
--    Beneficiario Controlador, CONSERVAR LA INFORMACIÓN, DOCUMENTACIÓN Y
--    REGISTROS QUE LA SUSTENTEN, mantenerlos actualizados durante la vigencia
--    de la Relación de negocios y resguardarlos en términos del artículo 18,
--    fracción IV de la Ley»
--
-- El procedimiento se guarda entero desde el ADR-32: cada fracción evaluada,
-- su motivo, quién resultó y por qué vía. Lo que faltaba es lo segundo — el
-- acta de asamblea que prueba el 40% de tenencia, el poder que acredita el
-- control por otros medios, el organigrama del funcionario de mayor grado.
--
-- NO SE CREA UN ALMACÉN PARALELO. `documentos` ya existe con su huella
-- SHA-256, su ruta única y su retención; lo que se agrega es el VÍNCULO entre
-- un documento del expediente y el paso o el hallazgo que respalda. Un segundo
-- lugar donde guardar archivos del mismo cliente sería la misma trampa que el
-- ADR-32 evitó con la identidad: dos respuestas posibles a la misma pregunta.

create table sustentos_bc (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),

  documento_id      uuid not null,
  identificacion_id uuid not null,

  -- A QUÉ parte del camino respalda. Los dos opcionales y excluyentes: un
  -- documento puede sustentar una fracción evaluada («revisé el libro de
  -- accionistas y nadie llega al 25%»), una persona hallada («esta acta la
  -- nombra administradora única»), o el procedimiento entero.
  paso_id     uuid,
  hallazgo_id uuid,

  -- Qué prueba, en palabras de quien lo subió. Obligatoria: un archivo colgado
  -- sin decir qué demuestra obliga a abrirlo para saber por qué está ahí, y
  -- dentro de dos años nadie recuerda.
  nota text not null,

  registrado_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),

  constraint sustentos_bc_tenant_uk unique (tenant_id, id),
  constraint sustento_del_mismo_obligado
    foreign key (tenant_id, documento_id) references documentos (tenant_id, id),
  constraint sustento_de_la_misma_identificacion
    foreign key (tenant_id, identificacion_id) references identificaciones_bc (tenant_id, id),
  constraint nota_no_vacia check (length(btrim(nota)) > 0),
  constraint paso_o_hallazgo_pero_no_ambos check (paso_id is null or hallazgo_id is null),
  -- El mismo documento no se cuelga dos veces del mismo lugar.
  --
  -- NULLS NOT DISTINCT, y es la mitad de la regla. Por omisión Postgres trata
  -- dos NULL como distintos, así que dos vínculos al mismo paso —ambos con
  -- `hallazgo_id` nulo— pasarían como filas diferentes y el duplicado entraría.
  -- Lo encontró la aserción 6 de este mismo archivo.
  constraint un_sustento_por_lugar unique nulls not distinct
    (tenant_id, documento_id, identificacion_id, paso_id, hallazgo_id)
);

-- El paso y el hallazgo tienen que ser DE ESA identificación, no de otra. Se
-- vuelve inexpresable con llaves de tres columnas, que es el nivel 2 de la
-- regla dura 6: no depende de que nadie valide nada.
alter table pasos_prelacion_bc
  add constraint pasos_bc_identificacion_uk unique (tenant_id, identificacion_id, id);
alter table hallazgos_bc
  add constraint hallazgos_bc_identificacion_uk unique (tenant_id, identificacion_id, id);

alter table sustentos_bc
  add constraint sustento_del_paso_de_esa_identificacion
    foreign key (tenant_id, identificacion_id, paso_id)
    references pasos_prelacion_bc (tenant_id, identificacion_id, id),
  add constraint sustento_del_hallazgo_de_esa_identificacion
    foreign key (tenant_id, identificacion_id, hallazgo_id)
    references hallazgos_bc (tenant_id, identificacion_id, id);

create index on sustentos_bc (tenant_id, identificacion_id);

comment on table sustentos_bc is
  'El vínculo entre un documento del expediente y el paso o hallazgo del Art. '
  '23 Quinquies que respalda. La documentación no se duplica: vive en '
  '`documentos`, con su huella.';

-- ---------------------------------------------------------------------------
-- Que el documento sea del MISMO cliente que la identificación
-- ---------------------------------------------------------------------------
-- Esto sí es un trigger y no una llave, y vale decir por qué. `documentos` no
-- lleva `cliente_id`: lleva `expediente_id`, y el cliente cuelga del
-- expediente. Para volverlo inexpresable habría que denormalizar `cliente_id`
-- en una tabla que usa TODO el producto, para servir a un capítulo. El trigger
-- es el nivel 3 de la regla dura 6 —una precondición— y aquí es el precio
-- correcto; queda escrito para que nadie lo lea como descuido.
create or replace function app.sustento_bc_del_mismo_cliente() returns trigger
language plpgsql as $$
declare v_cliente_doc uuid; v_cliente_ident uuid;
begin
  select e.cliente_id into v_cliente_doc
    from documentos d join expedientes e on e.id = d.expediente_id
   where d.id = new.documento_id;

  select cliente_id into v_cliente_ident
    from identificaciones_bc where id = new.identificacion_id;

  if v_cliente_doc is distinct from v_cliente_ident then
    raise exception using
      errcode = 'foreign_key_violation',
      message = 'Ese documento es del expediente de otro cliente',
      detail  = 'La documentación que sustenta el procedimiento tiene que ser del mismo Cliente o Usuaria cuyo Beneficiario Controlador se identificó.',
      hint    = 'Súbelo al expediente de este cliente y vuelve a vincularlo.';
  end if;
  return new;
end $$;

create trigger sustento_bc_del_mismo_cliente
  before insert on sustentos_bc
  for each row execute function app.sustento_bc_del_mismo_cliente();

-- ---------------------------------------------------------------------------
-- Append-only: diez años (Art. 18 fr. IV, al que el capítulo remite)
-- ---------------------------------------------------------------------------
create or replace function app.sustento_bc_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception using
    errcode = 'restrict_violation',
    message = 'El vínculo entre un documento y el procedimiento no se edita ni se borra',
    detail  = 'Art. 23 Quinquies, párrafo de cierre: conservar la documentación que lo sustenta.',
    hint    = 'Si el documento cambió, súbelo de nuevo y vincula el nuevo.';
end $$;

create trigger sustentos_bc_inmutables
  before update or delete on sustentos_bc
  for each row execute function app.sustento_bc_inmutable();

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table sustentos_bc enable row level security;

create policy "ver sustentos bc" on sustentos_bc for select
  to authenticated using (tenant_id = app.tenant_id());
create policy "vincular sustentos bc" on sustentos_bc for insert
  to authenticated with check (tenant_id = app.tenant_id());

grant select, insert on sustentos_bc to authenticated;
revoke truncate, trigger, references, maintain on sustentos_bc from authenticated, anon;

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('sustentos_bc','authenticated','INSERT',null,
   'El obligado vincula el documento que sustenta el procedimiento del Art. 23 Quinquies')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_otro_cliente uuid;
  v_exp uuid; v_exp_otro uuid; v_doc uuid; v_doc_otro uuid;
  v_ident uuid; v_ident_otra uuid; v_paso uuid; v_paso_otro uuid;
  v_ben uuid; v_hallazgo uuid; v_sustento uuid; v_rechazo boolean;
  v_act uuid;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('SBC270301AB1', 'Aserción sustentos', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-sbc@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción SBC', 'asercion-sbc@ejemplo.mx');
  select id into v_act from actividades_vulnerables where fraccion = 'V_BIS';

  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente con sustento', 'CCS270301XY9', false, v_dom)
  returning id into v_cliente;
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Otro cliente', 'OTC270301XY9', false, v_dom)
  returning id into v_otro_cliente;

  insert into expedientes (tenant_id, cliente_id, actividad_id, version)
  values (v_tenant, v_cliente, v_act, 1) returning id into v_exp;
  insert into expedientes (tenant_id, cliente_id, actividad_id, version)
  values (v_tenant, v_otro_cliente, v_act, 1) returning id into v_exp_otro;

  insert into documentos (tenant_id, expediente_id, campo, storage_path, hash_sha256,
                          tamano_bytes, mime, subido_por)
  values (v_tenant, v_exp, 'acta_constitutiva', 'sbc/acta.pdf', repeat('a',64), 1024,
          'application/pdf', v_user) returning id into v_doc;
  insert into documentos (tenant_id, expediente_id, campo, storage_path, hash_sha256,
                          tamano_bytes, mime, subido_por)
  values (v_tenant, v_exp_otro, 'acta_constitutiva', 'sbc/otra.pdf', repeat('b',64), 1024,
          'application/pdf', v_user) returning id into v_doc_otro;

  insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                   umbral_pct, umbral_inclusivo, determinada_por)
  values (v_tenant, v_cliente, 'prelacion_persona_moral', '2027-03-15', 25, true, v_user)
  returning id into v_ident;
  insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado,
                                  motivo, insumos_evaluados)
  values (v_tenant, v_ident, 'I', 'no_encontrado', 'Libro de accionistas revisado', '[]'::jsonb)
  returning id into v_paso;

  insert into identificaciones_bc (tenant_id, cliente_id, via, fecha_identificacion,
                                   umbral_pct, umbral_inclusivo, determinada_por)
  values (v_tenant, v_otro_cliente, 'prelacion_persona_moral', '2027-03-15', 25, true, v_user)
  returning id into v_ident_otra;
  insert into pasos_prelacion_bc (tenant_id, identificacion_id, fraccion, resultado,
                                  motivo, insumos_evaluados)
  values (v_tenant, v_ident_otra, 'I', 'no_encontrado', 'Otro libro', '[]'::jsonb)
  returning id into v_paso_otro;

  -- ── 1. Un documento del cliente, colgado de su paso ───────────────────
  insert into sustentos_bc (tenant_id, documento_id, identificacion_id, paso_id, nota,
                            registrado_por)
  values (v_tenant, v_doc, v_ident, v_paso,
          'Libro de accionistas al 15-mar-2027: la mayor tenencia es 12%', v_user)
  returning id into v_sustento;
  assert v_sustento is not null, 'ASERCIÓN 1: no se pudo vincular un documento a su paso';

  -- ── 2. Un documento de OTRO cliente no se puede colgar aquí ───────────
  v_rechazo := false;
  begin
    insert into sustentos_bc (tenant_id, documento_id, identificacion_id, paso_id, nota,
                              registrado_por)
    values (v_tenant, v_doc_otro, v_ident, v_paso, 'Del expediente equivocado', v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: se sustentó el procedimiento con el documento de otro cliente';

  -- ── 3. Ni un paso de OTRA identificación ──────────────────────────────
  -- Esto lo impide una llave de tres columnas, no un trigger: es inexpresable.
  v_rechazo := false;
  begin
    insert into sustentos_bc (tenant_id, documento_id, identificacion_id, paso_id, nota,
                              registrado_por)
    values (v_tenant, v_doc, v_ident, v_paso_otro, 'Paso de otro procedimiento', v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: un sustento apuntó a un paso de otra identificación';

  -- ── 4. Un paso Y un hallazgo a la vez no: son cosas distintas ─────────
  insert into beneficiarios_controladores (tenant_id, cliente_id, nombre, control_por,
                                           es_declaracion)
  values (v_tenant, v_cliente, 'Persona hallada', 'control_efectivo', false)
  returning id into v_ben;
  insert into hallazgos_bc (tenant_id, identificacion_id, beneficiario_id, paso_id, base)
  values (v_tenant, v_ident, v_ben, v_paso, 'Base de la aserción')
  returning id into v_hallazgo;

  v_rechazo := false;
  begin
    insert into sustentos_bc (tenant_id, documento_id, identificacion_id, paso_id,
                              hallazgo_id, nota, registrado_por)
    values (v_tenant, v_doc, v_ident, v_paso, v_hallazgo, 'Las dos cosas', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: un sustento apuntó a un paso y a un hallazgo a la vez';

  -- ── 5. Sin decir qué prueba, no entra ─────────────────────────────────
  v_rechazo := false;
  begin
    insert into sustentos_bc (tenant_id, documento_id, identificacion_id, nota, registrado_por)
    values (v_tenant, v_doc, v_ident, '   ', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se colgó un documento sin decir qué demuestra';

  -- ── 6. El mismo documento no se cuelga dos veces del mismo lugar ──────
  v_rechazo := false;
  begin
    insert into sustentos_bc (tenant_id, documento_id, identificacion_id, paso_id, nota,
                              registrado_por)
    values (v_tenant, v_doc, v_ident, v_paso, 'Otra vez lo mismo', v_user);
  exception when unique_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: el mismo documento se colgó dos veces del mismo paso';

  -- ── 7. Pero SÍ puede sustentar otro lugar del mismo procedimiento ─────
  -- Un acta puede probar la tenencia y nombrar al funcionario a la vez.
  insert into sustentos_bc (tenant_id, documento_id, identificacion_id, hallazgo_id, nota,
                            registrado_por)
  values (v_tenant, v_doc, v_ident, v_hallazgo, 'La misma acta la nombra', v_user);

  -- ── 8. Lo vinculado no se edita ni se borra ───────────────────────────
  v_rechazo := false;
  begin
    update sustentos_bc set nota = 'otra cosa' where id = v_sustento;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se reescribió qué probaba un documento';

  v_rechazo := false;
  begin
    delete from sustentos_bc where id = v_sustento;
  exception when restrict_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: se borró evidencia que hay que conservar diez años';

  raise notice 'Art. 23 Quinquies (documentación que sustenta): 8 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
