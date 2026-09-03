-- ---------------------------------------------------------------------------
-- Art. 12 fr. VII · El piso de datos del Beneficiario Controlador
-- ---------------------------------------------------------------------------
-- Contrastado el 3-sep-2026. El párrafo que manda está VERBATIM en el DOF
-- (`acuerdo-115-2026.txt`, línea 163):
--
--   «En caso de que el Cliente o Usuaria sea persona moral o fideicomiso,
--    quienes realicen las Actividades Vulnerables recabarán los datos
--    establecidos en los numerales i), ii), iv) y ix) del inciso a) del Anexo
--    3 de las presentes reglas, EN TODOS LOS CASOS.»
--
-- Y el párrafo anterior, para clientes persona física, pide «los mismos datos
-- y documentos […] de los Anexos 3, 4, 5, 6 u 8 […] EN CASO DE QUE el Cliente
-- o Usuaria […] cuente con dicha información». Son dos regímenes distintos:
-- uno incondicional y otro condicionado a que el cliente tenga el dato.
--
-- ────────────────────────────────────────────────────────────────────────────
-- DE DÓNDE SALE QUÉ DICE CADA NUMERAL, Y POR QUÉ NO SE ESCRIBE AQUÍ
-- ────────────────────────────────────────────────────────────────────────────
-- El inciso a) del Anexo 3 viene ELIDIDO en la transcripción del Acuerdo: el
-- archivo trae los numerales i) y v) y colapsa el resto en «ii) a iv) …» y
-- «vi) a x) …». Así que este archivo NO transcribe qué dice cada numeral.
--
-- Lo que dicen vive desde el 30-ago en `campos_expediente`, con su fuente del
-- RCG histórico y con su `PENDIENTE: contraste directo contra el DOF`. Este
-- piso se apoya en esas filas en vez de repetirlas: si mañana se corrigen
-- contra el DOF, el piso se corrige solo. Duplicarlas aquí sería crear una
-- segunda verdad sobre el mismo texto, que es como se desincronizan.
--
-- Lo único que se siembra es CUÁLES numerales exige el artículo — eso sí está
-- verbatim en el Acuerdo.

insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('beneficiario_piso_anexo3', '["i","ii","iv","ix"]'::jsonb,
   'Numerales del inciso a) del Anexo 3 exigibles del Beneficiario Controlador de un cliente persona moral o fideicomiso',
   '2027-03-01',
   'Art. 12 fr. VII ¶2 del Acuerdo 115/2026 (DOF 7-ago-2026), línea 163 del texto: «En caso de '
   'que el Cliente o Usuaria sea persona moral o fideicomiso, quienes realicen las Actividades '
   'Vulnerables recabarán los datos establecidos en los numerales i), ii), iv) y ix) del inciso '
   'a) del Anexo 3 de las presentes reglas, en todos los casos.» Qué dice cada numeral NO se '
   'siembra aquí: vive en campos_expediente, porque el inciso a) viene elidido en la '
   'transcripción del Acuerdo y repetirlo crearía una segunda verdad sobre el mismo texto.');

-- ---------------------------------------------------------------------------
-- Los dos datos que le faltaban a la fila de identidad
-- ---------------------------------------------------------------------------
-- `beneficiarios_controladores` ya traía nombre (numeral i), RFC y CURP
-- (numeral ix). Faltaban los otros dos del piso.
alter table beneficiarios_controladores
  add column fecha_nacimiento date,
  add column nacionalidad     text;

comment on column beneficiarios_controladores.fecha_nacimiento is
  'Numeral ii) del inciso a) del Anexo 3, exigible por el Art. 12 fr. VII ¶2.';
comment on column beneficiarios_controladores.nacionalidad is
  'Numeral iv) del inciso a) del Anexo 3, exigible por el Art. 12 fr. VII ¶2.';

alter table beneficiarios_controladores
  add constraint nacionalidad_es_codigo_de_pais check (
    nacionalidad is null or nacionalidad ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid; v_cliente uuid; v_ben uuid; v_rechazo boolean; v_n int;
  v_dom jsonb := '{"calle":"60","numero":"1","codigo_postal":"97000","colonia":"Centro","municipio":"31","entidad":"31","pais":"MX"}'::jsonb;
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('PBC270301AB1', 'Aserción piso BC', 'moral') returning id into v_tenant;
  insert into clientes_finales (tenant_id, tipo_persona, nombre_o_razon_social, rfc,
                                requiere_revision_identidad, domicilio)
  values (v_tenant, 'moral', 'Cliente del piso', 'CPB270301XY9', false, v_dom)
  returning id into v_cliente;

  -- ── 1. Los dos datos nuevos se pueden guardar ─────────────────────────
  insert into beneficiarios_controladores
    (tenant_id, cliente_id, nombre, control_por, es_declaracion, fecha_nacimiento, nacionalidad)
  values (v_tenant, v_cliente, 'Persona con piso completo', 'participacion', false,
          '1980-01-15', 'MX')
  returning id into v_ben;
  assert v_ben is not null, 'ASERCIÓN 1: no se pudo guardar el piso del Anexo 3';

  -- ── 2. La nacionalidad es código de país, no prosa ────────────────────
  v_rechazo := false;
  begin
    insert into beneficiarios_controladores
      (tenant_id, cliente_id, nombre, control_por, es_declaracion, nacionalidad)
    values (v_tenant, v_cliente, 'Con país en prosa', 'participacion', false, 'Mexicana');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: se guardó una nacionalidad que no es código de país';

  -- ── 3. Siguen siendo nulables: el piso se REPORTA, no se impone ───────
  -- El Art. 12 fr. VII no dice que no se pueda registrar a quien identificaste
  -- mientras le consigues la fecha de nacimiento. Dice que hay que recabarla.
  -- Bloquear la fila empujaría a no registrar el hallazgo del Art. 23
  -- Quinquies, que es peor: se perdería el procedimiento entero.
  insert into beneficiarios_controladores
    (tenant_id, cliente_id, nombre, control_por, es_declaracion)
  values (v_tenant, v_cliente, 'Identificado sin piso todavía', 'control_efectivo', false);

  -- ── 4. Los numerales exigidos están en el catálogo, con su fuente ─────
  select jsonb_array_length(valor) into v_n from parametros_motor
   where clave = 'beneficiario_piso_anexo3';
  assert v_n = 4, 'ASERCIÓN 4: el piso del Art. 12 fr. VII no tiene sus cuatro numerales';
  assert (select fuente from parametros_motor where clave = 'beneficiario_piso_anexo3')
         like '%en todos los casos%',
    'ASERCIÓN 5: la fuente del piso no cita el «en todos los casos» que lo vuelve incondicional';

  -- ── 6. Y qué dice cada numeral NO se duplicó aquí: vive en el otro catálogo
  assert (select count(*) from campos_expediente
           where vigente_hasta is null and fuente like 'Anexo 3 a)%') >= 4,
    'ASERCIÓN 6: el catálogo de campos ya no resuelve los numerales del Anexo 3';

  raise notice 'Art. 12 fr. VII (piso del Beneficiario Controlador): 6 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
