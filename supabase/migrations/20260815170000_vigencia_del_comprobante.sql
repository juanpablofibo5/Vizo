-- ---------------------------------------------------------------------------
-- Un comprobante de domicilio de 2019 subido hoy deja de pasar
-- ---------------------------------------------------------------------------
-- Issue #11, primera mitad.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE EL TEXTO (✅ contrastado contra el DOF)
-- ────────────────────────────────────────────────────────────────────────────
-- Acuerdo 115/2026, Art. 21 —`regulatorio/dof/acuerdo-115-2026.txt`, línea 197,
-- Capítulo III «Identificación de la persona Cliente o Usuaria»—:
--
--   «Quienes realicen Actividades Vulnerables verificarán, cuando menos una vez
--    al año, que los expedientes de identificación de los Clientes o Usuarias
--    con los que se tenga una Relación de negocios cuenten con todos los datos
--    y documentos previstos en el artículo 12 […] y se encuentren actualizados,
--    SALVO EL DOCUMENTO QUE COMPRUEBE EL DOMICILIO el cual deberá cumplir con
--    una ANTIGÜEDAD NO MAYOR A TRES MESES conforme a los Anexos de estas reglas
--    que así lo solicitan.»
--
-- ────────────────────────────────────────────────────────────────────────────
-- LA FECHA: EL ISSUE SE EQUIVOCABA POR TRES MESES Y MEDIO
-- ────────────────────────────────────────────────────────────────────────────
-- El issue #11 decía «exigible 1 mar 2027». No: el Art. 21 vive en el Capítulo
-- III, y NINGÚN transitorio lo exceptúa —el Segundo cubre el Cap. II Quáter, el
-- Tercero el Manual, el Cuarto los Caps. III Bis, III Ter y III Quinquies, el
-- Quinto los Avisos de 24 h—. Le aplica el Transitorio Primero:
--
--   «El presente Acuerdo entrará en vigor el TREINTA DE NOVIEMBRE DE DOS MIL
--    VEINTISÉIS, salvo las excepciones previstas en los siguientes artículos
--    transitorios.»
--
-- Por eso la vigencia que se siembra es 2026-11-30 y no 2027-03-01. Sembrar la
-- fecha equivocada no habría reventado: habría dejado pasar comprobantes viejos
-- durante tres meses, en silencio.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ `created_at` NO SERVÍA
-- ────────────────────────────────────────────────────────────────────────────
-- `documentos.created_at` dice cuándo se SUBIÓ el archivo, no cuándo se EMITIÓ
-- el recibo. Son preguntas distintas y solo la segunda es la que la regla mide.
-- Un comprobante de 2019 escaneado hoy tiene `created_at` de hoy y cumpliría.

-- ---------------------------------------------------------------------------
-- 1. Cuándo se emitió el documento
-- ---------------------------------------------------------------------------
alter table documentos
  add column fecha_emision date;

comment on column documentos.fecha_emision is
  'Fecha en que la emitió quien la expide —el recibo de luz, la credencial—, no cuándo se subió (eso es created_at). NULL = no se capturó: para un campo con regla de antigüedad eso NO cuenta como cumplido, porque no se puede afirmar que cumpla.';

-- Un documento emitido mañana no existe. La fecha solo envejece, así que este
-- CHECK no puede volverse falso con el tiempo sobre filas ya escritas.
alter table documentos
  add constraint documento_no_se_emite_en_el_futuro
  check (fecha_emision is null or fecha_emision <= current_date);

-- ---------------------------------------------------------------------------
-- 2. El catálogo aprende a decir de dónde sale cada campo
-- ---------------------------------------------------------------------------
-- `umbrales` tiene `fuente` desde el primer día y `campos_expediente` no lo
-- tenía: la misma regla dura 1, aplicada a la mitad. Nace nullable porque las
-- 17 filas de la siembra inicial salieron del XSD y del Art. 12 sin que se
-- registrara cuál de los dos — y rellenarlas ahora de memoria sería inventar
-- una fuente, que es exactamente lo que la columna existe para impedir.
alter table campos_expediente
  add column fuente text;

comment on column campos_expediente.fuente is
  'Artículo, anexo o XSD del que sale la exigencia, con fecha de contraste. NULL = heredado de la siembra inicial, sin fuente registrada. Una fila nueva sin fuente es una fila que nadie puede defender.';

-- ---------------------------------------------------------------------------
-- 3. La regla entra como DATO, con su vigencia
-- ---------------------------------------------------------------------------
-- Se cierra la vigencia del campo actual y se abre una nueva. No se edita la
-- fila existente: un expediente integrado en 2026 se juzga con las reglas de
-- 2026, igual que los umbrales (runbook 02).
update campos_expediente ce
   set vigente_hasta = date '2026-11-29'
  from actividades_vulnerables a
 where a.id = ce.actividad_id
   and a.fraccion = 'V_BIS'
   and ce.campo = 'comprobante_domicilio'
   and ce.vigente_hasta is null;

insert into campos_expediente
  (actividad_id, aplica_a, campo, etiqueta, tipo_dato, obligatorio, validacion, orden,
   vigente_desde, fuente)
select ce.actividad_id, ce.aplica_a, ce.campo, ce.etiqueta, ce.tipo_dato, ce.obligatorio,
       jsonb_build_object('antiguedad_maxima_meses', 3),
       ce.orden,
       date '2026-11-30',
       'Art. 21 del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): «salvo el documento que compruebe el domicilio el cual deberá cumplir con una antigüedad no mayor a tres meses». Vigencia por el Transitorio Primero. Contrastado el 2026-08-15. PENDIENTE: el artículo acota «conforme a los Anexos de estas reglas que así lo solicitan» y el Anexo de la Fr. V Bis no se ha transcrito.'
  from campos_expediente ce
  join actividades_vulnerables a on a.id = ce.actividad_id
 where a.fraccion = 'V_BIS'
   and ce.campo = 'comprobante_domicilio'
   and ce.vigente_hasta = date '2026-11-29';

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_antes    jsonb;
  v_despues  jsonb;
  v_vigentes int;
begin
  -- Una sola fila vigente a cada lado de la frontera. Dos filas vigentes harían
  -- que la completitud dependiera del orden en que salieran de la consulta.
  select count(*) into v_vigentes
    from campos_expediente ce
    join actividades_vulnerables a on a.id = ce.actividad_id
   where a.fraccion = 'V_BIS' and ce.campo = 'comprobante_domicilio'
     and ce.vigente_desde <= date '2026-11-29'
     and (ce.vigente_hasta is null or ce.vigente_hasta >= date '2026-11-29');
  if v_vigentes <> 1 then
    raise exception 'El 29 de noviembre hay % filas vigentes del comprobante de domicilio.', v_vigentes;
  end if;

  select count(*) into v_vigentes
    from campos_expediente ce
    join actividades_vulnerables a on a.id = ce.actividad_id
   where a.fraccion = 'V_BIS' and ce.campo = 'comprobante_domicilio'
     and ce.vigente_desde <= date '2026-11-30'
     and (ce.vigente_hasta is null or ce.vigente_hasta >= date '2026-11-30');
  if v_vigentes <> 1 then
    raise exception 'El 30 de noviembre hay % filas vigentes del comprobante de domicilio.', v_vigentes;
  end if;

  select ce.validacion into v_antes from campos_expediente ce
    join actividades_vulnerables a on a.id = ce.actividad_id
   where a.fraccion = 'V_BIS' and ce.campo = 'comprobante_domicilio'
     and ce.vigente_desde <= date '2026-11-29'
     and (ce.vigente_hasta is null or ce.vigente_hasta >= date '2026-11-29');

  select ce.validacion into v_despues from campos_expediente ce
    join actividades_vulnerables a on a.id = ce.actividad_id
   where a.fraccion = 'V_BIS' and ce.campo = 'comprobante_domicilio'
     and ce.vigente_desde <= date '2026-11-30'
     and (ce.vigente_hasta is null or ce.vigente_hasta >= date '2026-11-30');

  -- Antes del 30 de noviembre la regla NO existe: un expediente integrado hoy
  -- no puede quedar incompleto por una exigencia que todavía no es exigible.
  if v_antes ? 'antiguedad_maxima_meses' then
    raise exception 'La regla de antigüedad aplica antes de su vigencia y volvería incompletos expedientes que hoy están bien.';
  end if;

  if coalesce((v_despues->>'antiguedad_maxima_meses')::int, 0) <> 3 then
    raise exception 'Desde el 30 de noviembre el comprobante debe traer la regla de tres meses y trae %.', v_despues;
  end if;

  -- El CHECK de la fecha futura NO se ejerce aquí: las migraciones corren antes
  -- del seed y `documentos` exige un expediente que todavía no existe. Una
  -- aserción que no puede correr no se escribe como si corriera — la cubre
  -- `tests/expediente/vigencia-comprobante.test.ts`, con un expediente real.

  raise notice '✓ comprobante de domicilio: la regla de tres meses entra el 2026-11-30, y ni un día antes';
end $$;
