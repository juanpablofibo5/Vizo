-- ---------------------------------------------------------------------------
-- Art. 41 fr. V · La alerta nombra el hecho que la justifica
-- ---------------------------------------------------------------------------
-- Los tipos se agregaron en `20260902160000` (Postgres no deja usar un valor
-- de enum en la misma transacción que lo crea). Aquí van las columnas, las
-- restricciones y las aserciones.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LA ALERTA CUELGA DEL ACTO, NO DEL CLIENTE
-- ────────────────────────────────────────────────────────────────────────────
-- El texto dice «respecto de aquellos ACTOS U OPERACIONES QUE SE PRETENDAN
-- LLEVAR A CABO CON Clientes o Usuarias de Grado de Riesgo alto, Personas
-- Políticamente Expuestas […]». No pide una alerta por cliente clasificado:
-- pide una por acto que se vaya a realizar con esa clase de cliente. Por eso
-- `operacion_id` es obligatorio en los dos tipos y la alerta se levanta en la
-- misma transacción que la operación, igual que la desviación de perfil.
--
-- Y cada una nombra SU hecho: la de riesgo alto, la evaluación que clasificó
-- al cliente; la de PEP, la declaración. Es el mismo principio que ya obliga a
-- `desviacion_perfil` a decir contra qué perfil se desvió — una alerta que no
-- puede señalar su fundamento no se puede defender ante la autoridad.

alter table alertas
  add column evaluacion_riesgo_id uuid,
  add column declaracion_pep_id   uuid;

-- `evaluaciones_riesgo` tenía llave única por (tenant_id, cliente_id, id) —
-- pensada para que una evaluación no se pueda atar al cliente equivocado— y
-- eso no sirve para apuntarle desde una tabla que no lleva `cliente_id`. Se
-- agrega la de (tenant_id, id), que es el patrón `*_tenant_uk` del resto del
-- esquema. La otra se queda: sigue protegiendo lo suyo.
alter table evaluaciones_riesgo
  add constraint evaluaciones_riesgo_tenant_uk unique (tenant_id, id);

alter table alertas
  add constraint alertas_evaluacion_riesgo_fk
    foreign key (tenant_id, evaluacion_riesgo_id)
    references evaluaciones_riesgo (tenant_id, id),
  add constraint alertas_declaracion_pep_fk
    foreign key (tenant_id, declaracion_pep_id)
    references declaraciones_pep (tenant_id, id);

alter table alertas
  add constraint riesgo_alto_nombra_su_evaluacion_y_operacion check (
    tipo <> 'cliente_riesgo_alto'
    or (evaluacion_riesgo_id is not null and operacion_id is not null)),
  add constraint pep_nombra_su_declaracion_y_operacion check (
    tipo <> 'cliente_pep'
    or (declaracion_pep_id is not null and operacion_id is not null));

comment on column alertas.evaluacion_riesgo_id is
  'La evaluación del Cap. III Bis que clasificó al cliente como de Grado de '
  'Riesgo alto (Art. 41 fr. V). Obligatoria en las alertas de ese tipo.';
comment on column alertas.declaracion_pep_id is
  'La declaración del Cap. III Quáter por la que el cliente es Persona '
  'Políticamente Expuesta (Art. 41 fr. V). Obligatoria en las alertas de ese tipo.';

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_op uuid; v_suc uuid; v_des uuid;
  v_modelo uuid; v_grado uuid; v_eval uuid; v_decl uuid; v_alerta uuid;
  v_rechazo boolean; v_act uuid; v_elem uuid; v_fisica uuid; v_op_fisica uuid;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('A41270101AB1', 'Aserción Art. 41', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-a41@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción 41', 'asercion-a41@ejemplo.mx');

  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente de riesgo alto', 'CRA270101XY9', false, v_dom)
  returning id into v_cliente;

  insert into sucursales (tenant_id, nombre, clave)
  values (v_tenant, 'Matriz', 'MAT') returning id into v_suc;
  insert into desarrollos_inmobiliarios
    (tenant_id, nombre, registro_licencia, entidad_federativa, codigo_postal,
     colonia, calle, tipo_desarrollo, monto_desarrollo, unidades_comercializadas, costo_unidad)
  values (v_tenant, 'Torre de aserción', 'LIC41', '31', '97000',
          'Centro', 'Calle 60', '5', 40000000, 20, 2000000) returning id into v_des;
  select id into v_act from actividades_vulnerables where fraccion = 'V_BIS';

  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_suc, v_cliente, v_act, '2027-04-01', 100000, 100000, '03', v_des)
  returning id into v_op;

  -- El hecho que justifica cada alerta.
  -- La escala completa: la base exige que el grado de menor orden empiece en 0.
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo', 'Bajo', 1, false, 0, '2027-01-01');
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, '2027-01-01');
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto', 'Alto', 3, true, 70, '2027-01-01') returning id into v_grado;

  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;
  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Aserción', 80);
  update modelos_riesgo set estado = 'vigente', vigente_desde = '2027-01-01',
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                   factores_aplicados, evaluado_por, evaluado_en, vence)
  values (v_tenant, v_cliente, v_modelo, v_grado, 80, '[]'::jsonb, v_user, '2027-04-01', '2028-04-01')
  returning id into v_eval;

  -- La declaración PEP es de personas FÍSICAS (Art. 23 Quáter ¶1) y la base lo
  -- impide para una moral. Por eso la alerta de PEP necesita su propio cliente:
  -- no es un detalle del fixture, es el alcance del supuesto.
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, curp,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'fisica', 'Cliente PEP', 'PEPX800101HYNRSN01', false, v_dom)
  returning id into v_fisica;
  insert into operaciones (tenant_id, sucursal_id, cliente_id, actividad_id,
                           fecha_operacion, monto_base, monto_total, forma_pago, desarrollo_id)
  values (v_tenant, v_suc, v_fisica, v_act, '2027-04-02', 100000, 100000, '03', v_des)
  returning id into v_op_fisica;

  insert into declaraciones_pep (tenant_id, cliente_id, resultado, fecha_declaracion, capturada_por)
  values (v_tenant, v_fisica, 'pep_por_funcion', '2027-04-01', v_user) returning id into v_decl;

  -- ── 1. La alerta de riesgo alto EXIGE nombrar su evaluación ───────────
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, operacion_id, titulo)
    values (v_tenant, 'cliente_riesgo_alto', v_op, 'Sin decir qué evaluación');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 1: se levantó una alerta de riesgo alto sin la evaluación que clasificó';

  -- ── 2. Y su operación: el artículo habla de ACTOS, no de clientes ─────
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, evaluacion_riesgo_id, titulo)
    values (v_tenant, 'cliente_riesgo_alto', v_eval, 'Sin decir qué acto');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: se levantó una alerta de riesgo alto sin el acto que la disparó';

  -- ── 3. Con las dos cosas, entra ───────────────────────────────────────
  insert into alertas (tenant_id, tipo, evaluacion_riesgo_id, operacion_id, titulo)
  values (v_tenant, 'cliente_riesgo_alto', v_eval, v_op,
          'Operación con cliente de Grado de Riesgo alto')
  returning id into v_alerta;
  assert v_alerta is not null, 'ASERCIÓN 3: no se pudo levantar una alerta bien formada';

  -- ── 4. Lo mismo para la de PEP ────────────────────────────────────────
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, operacion_id, titulo)
    values (v_tenant, 'cliente_pep', v_op_fisica, 'Sin decir qué declaración');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se levantó una alerta de PEP sin la declaración que la sustenta';

  insert into alertas (tenant_id, tipo, declaracion_pep_id, operacion_id, titulo)
  values (v_tenant, 'cliente_pep', v_decl, v_op_fisica,
          'Operación con Persona Políticamente Expuesta');

  -- ── 5. La evaluación de riesgo de OTRO obligado no se puede citar ─────
  -- La FK es compuesta por (tenant_id, id): apuntar a la evaluación de otro
  -- no es un problema de RLS, es una fila que no existe.
  v_rechazo := false;
  begin
    insert into alertas (tenant_id, tipo, evaluacion_riesgo_id, operacion_id, titulo)
    values (v_tenant, 'cliente_riesgo_alto', gen_random_uuid(), v_op, 'Evaluación inventada');
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: una alerta citó una evaluación de riesgo que no es de este obligado';

  -- ── 6. Los tipos viejos siguen sin exigir las columnas nuevas ─────────
  insert into alertas (tenant_id, tipo, operacion_id, titulo)
  values (v_tenant, 'perfil_ausente', v_op, 'El hueco de siempre');

  raise notice 'Art. 41 fr. V (riesgo alto y PEP): 6 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
