-- ---------------------------------------------------------------------------
-- Art. 23 Bis 4 · Una PEP extranjera es de Grado de Riesgo alto, al menos
-- ---------------------------------------------------------------------------
-- Contrastado el 3-sep-2026 contra `acuerdo-115-2026.txt`, línea 209.
--
-- EL ARTÍCULO TIENE DOS SUPUESTOS INDEPENDIENTES, y solo uno se puede construir
-- hoy:
--
--   «[…] deberán considerar como personas Clientes o Usuarias de Grado de
--    Riesgo alto, AL MENOS a aquéllas (1) no residentes en territorio mexicano
--    y que se encuentren, estén vinculados o tengan efectos en los países o
--    jurisdicciones que la legislación mexicana considera que aplican
--    regímenes fiscales preferentes o que […] determinen que no cuentan con
--    medidas […]; así como (2) a las PERSONAS POLÍTICAMENTE EXPUESTAS
--    EXTRANJERAS.»
--
--   · El supuesto (1) depende de una lista que el propio ¶3 del artículo pone
--     a cargo de la UIF: «la UIF pondrá a disposición […] a través del Portal
--     en Internet, la lista de los países y jurisdicciones». Esa lista no
--     existe todavía, y es la MISMA que bloquea el cuarto supuesto del Art. 41
--     fr. V. No se siembra nada de ella: un catálogo de jurisdicciones sin
--     fuente es lo que la regla dura 1 prohíbe.
--
--   · El supuesto (2) no depende de nada externo. VIZO ya sabe si un cliente
--     es PEP y si su función pública es extranjera — lo declara el Cap. III
--     Quáter, vínculo por vínculo, con su ámbito.
--
-- «AL MENOS» ES LA PALABRA QUE DECIDE EL DISEÑO. No dice «será de grado alto»:
-- dice que hay que considerarlo alto *al menos*. Es un PISO, no una
-- asignación. Un modelo que ya lo clasifique alto por sus propios factores no
-- cambia; uno que lo deje en medio, sube. Y el puntaje calculado NO se toca:
-- se conserva tal cual, porque es lo que la metodología del obligado produjo y
-- borrarlo sería reescribir su propio cálculo.

insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('riesgo_piso_pep_extranjera', 'true'::jsonb,
   'Si una Persona Políticamente Expuesta extranjera se considera de Grado de Riesgo alto al menos',
   '2027-03-01',
   'Art. 23 Bis 4 ¶1 del Acuerdo 115/2026 (DOF 7-ago-2026), línea 209: «deberán considerar como '
   'personas Clientes o Usuarias de Grado de Riesgo alto, AL MENOS a aquéllas […] así como a las '
   'Personas Políticamente Expuestas extranjeras». Es un PISO, no una asignación: «al menos». '
   'Exigible con el Cap. III Bis a partir de los actos del 1-mar-2027 (Transitorio Cuarto). El '
   'otro supuesto del mismo artículo —clientes no residentes vinculados a jurisdicciones— NO se '
   'siembra: depende de la lista que el ¶3 pone a cargo de la UIF y que aún no existe.');

-- ---------------------------------------------------------------------------
-- Qué quedó escrito de la evaluación
-- ---------------------------------------------------------------------------
-- `evaluaciones_riesgo` es append-only y se opone a una revisión años después.
-- Que el grado subió por el piso del artículo —y no por el puntaje— tiene que
-- poder leerse en la fila, no deducirse comparando el puntaje contra la escala
-- vigente hoy, que puede haber cambiado.
alter table evaluaciones_riesgo
  add column piso_pep_extranjera boolean not null default false;

comment on column evaluaciones_riesgo.piso_pep_extranjera is
  'true cuando el Grado de Riesgo alto NO salió del puntaje sino del piso del '
  'Art. 23 Bis 4 para Personas Políticamente Expuestas extranjeras.';

-- El piso solo puede haber elevado a un grado alto: si está prendido y el
-- grado no es alto, la fila se contradice a sí misma.
create or replace function app.piso_pep_exige_grado_alto() returns trigger
language plpgsql as $$
declare v_alto boolean;
begin
  if not new.piso_pep_extranjera then return new; end if;
  select es_alto into v_alto from grados_riesgo where id = new.grado_id;
  if not coalesce(v_alto, false) then
    raise exception using
      errcode = 'check_violation',
      message = 'El piso del Art. 23 Bis 4 quedó marcado sobre un grado que no es alto',
      detail  = 'El artículo manda considerar a la PEP extranjera de Grado de Riesgo alto al menos.',
      hint    = 'Si el grado no es alto, el piso no se aplicó: no lo marques.';
  end if;
  return new;
end $$;

create trigger piso_pep_exige_grado_alto
  before insert or update on evaluaciones_riesgo
  for each row execute function app.piso_pep_exige_grado_alto();

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_modelo uuid; v_elem uuid;
  v_bajo uuid; v_alto uuid; v_rechazo boolean;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('PPE270301AB1', 'Aserción piso PEP', 'moral') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated','authenticated','asercion-ppe@ejemplo.mx') returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción PPE', 'asercion-ppe@ejemplo.mx');
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, curp,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'fisica', 'Cliente PEP extranjera', 'PEPX800101HYNRSN01', false, v_dom)
  returning id into v_cliente;

  -- Tres clasificaciones: el Art. 23 Bis ¶2 exige al menos ese piso, y la
  -- base lo impide con un CHECK. Los intermedios son libres; el mínimo no.
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo', 'Bajo', 1, false, 0, '2027-01-01') returning id into v_bajo;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, '2027-01-01');
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto', 'Alto', 3, true, 70, '2027-01-01') returning id into v_alto;
  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;
  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Aserción', 10);
  update modelos_riesgo set estado = 'vigente', vigente_desde = '2027-01-01',
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  -- ── 1. El piso marcado sobre un grado ALTO entra ──────────────────────
  insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                   factores_aplicados, evaluado_por, vence, piso_pep_extranjera)
  values (v_tenant, v_cliente, v_modelo, v_alto, 10, '[]'::jsonb, v_user, '2028-04-01', true);

  -- ── 2. Y sobre uno que NO es alto, la fila se contradice: se rechaza ──
  v_rechazo := false;
  begin
    insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                     factores_aplicados, evaluado_por, vence, piso_pep_extranjera)
    values (v_tenant, v_cliente, v_modelo, v_bajo, 10, '[]'::jsonb, v_user, '2028-04-01', true);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: el piso del Art. 23 Bis 4 quedó marcado sobre un grado que no es alto';

  -- ── 3. Sin el piso, una evaluación baja sigue siendo válida ───────────
  insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                   factores_aplicados, evaluado_por, vence)
  values (v_tenant, v_cliente, v_modelo, v_bajo, 10, '[]'::jsonb, v_user, '2028-04-01');

  -- ── 4. El piso vive en el catálogo, con su fecha y su fuente ──────────
  assert (select count(*) from parametros_motor
           where clave = 'riesgo_piso_pep_extranjera'
             and vigente_desde = date '2027-03-01'
             and fuente like '%AL MENOS%') = 1,
    'ASERCIÓN 4: el piso no está en el catálogo con la palabra que decide su diseño';

  -- ── 5. Y NO se sembró nada del supuesto que depende de la UIF ─────────
  assert (select count(*) from parametros_motor
           where clave like '%jurisdiccion%' or clave like '%regimen_fiscal%') = 0,
    'ASERCIÓN 5: se sembró una lista de jurisdicciones que la UIF todavía no publica';

  raise notice 'Art. 23 Bis 4 (piso de la PEP extranjera): 5 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
