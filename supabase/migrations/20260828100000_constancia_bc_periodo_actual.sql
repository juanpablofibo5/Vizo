-- VIZO · Migración — La constancia de conocimiento del BC también rige HOY
--
-- La migración 20260827160000 sembró la constancia del Anexo 3 b) iv) con
-- vigencia 30-nov-2026 (la reforma del Acuerdo 115/2026) y dejó UN contraste
-- pendiente: si bajo los Anexos PRE-reforma existía la obligación equivalente.
-- Ese contraste ya está hecho, y la cadena completa es esta:
--
--   * 23-ago-2013 — las RCG originales nacen con la constancia en el Anexo 3
--     b) iv): «…si tiene conocimiento de la existencia del Dueño Beneficiario»
--     — y el Art. 3 fr. VII define «Dueño Beneficiario, al Beneficiario
--     Controlador» (líneas 990–993 y 115 de
--     `regulatorio/dof/rcg-historico/rcg-2013-original-sat.txt`).
--   * 24-jul-2014 — el párrafo se reforma y queda «deberá estar firmada por el
--     Cliente o Usuario» (nota de reforma en el mismo numeral).
--   * 30-nov-2020 — el Acuerdo 126/2020 (DOF, código 5606232;
--     `rcg-historico/rcg-reforma-2020-shcp.txt` línea 94) reforma SOLO los
--     Arts. 4 y 5 y la denominación del Cap. II, y adiciona el Cap. II Bis
--     (activos virtuales) y el 34 Bis. **No toca los Anexos ni el Art. 12.**
--   * 7-ago-2026 — el Acuerdo 115/2026 reescribe el numeral con el término
--     nuevo (Beneficiario Controlador) y admite Firma Electrónica, exigible el
--     30-nov-2026 (la fila de la migración anterior).
--
-- Conclusión: la constancia es exigible HOY, no solo desde el 30-nov-2026.
-- Esta fila cubre el periodo actual y cierra el 29-nov-2026 — las consultas
-- de vigencia son inclusivas en ambos extremos (`vigente_hasta >= fecha`,
-- `src/persistencia/expediente.ts`), así que cerrar el 29 evita que el 30
-- haya dos filas vigentes del mismo campo.
--
-- VIGENCIA DESDE 17-jul-2025: es la línea base del catálogo («misma vigencia
-- que el resto», seed 20260808140000) — la Fr. V Bis solo existe desde la
-- reforma de la Ley de 2025, así que no hay periodo anterior que cubrir.
--
-- EL PUNTO QUE LA DOBLE REVISIÓN DEBE BENDECIR (runbook 02): que las RCG
-- pre-reforma aplican a la Fr. V Bis en el interinato. La lectura: el Art. 12
-- de las RCG remite a los Anexos POR TIPO DE CLIENTE para quienes realicen
-- Actividades Vulnerables — cualquier Actividad Vulnerable, incluida una
-- fracción nueva de la Ley que se identifica bajo las reglas vigentes mientras
-- las reformadas entran en vigor. Es una lectura razonable, no un texto
-- literal: por eso esta migración se redactó y validó en local, y NO se
-- aplica a producción hasta la segunda revisión.

do $$
declare
  v_actividad uuid;
begin
  select id into strict v_actividad
    from actividades_vulnerables where fraccion = 'V_BIS';

  insert into campos_expediente
    (actividad_id, aplica_a, campo, etiqueta, tipo_dato, obligatorio, validacion, orden,
     vigente_desde, vigente_hasta)
  values
    (v_actividad, 'persona_fisica', 'constancia_conocimiento_bc',
     'Constancia firmada: se solicitó información sobre conocimiento del Beneficiario Controlador',
     'documento', true, '{}'::jsonb, 170, date '2025-07-17', date '2026-11-29');
end;
$$;

-- ---------------------------------------------------------------------------
-- Aserciones: las dos filas existen y nunca rigen a la vez
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from campos_expediente ce
    join actividades_vulnerables av on av.id = ce.actividad_id
   where av.fraccion = 'V_BIS' and ce.campo = 'constancia_conocimiento_bc';
  if v_n <> 2 then
    raise exception 'La constancia debe tener 2 filas de vigencia (actual y reforma); hay %', v_n;
  end if;

  -- En ninguna fecha puede haber dos filas vigentes del mismo campo: la del
  -- periodo actual cierra el 29-nov y la de la reforma abre el 30-nov.
  select count(*) into v_n
    from campos_expediente a
    join campos_expediente b
      on a.actividad_id = b.actividad_id and a.aplica_a = b.aplica_a
     and a.campo = b.campo and a.id < b.id
   where a.campo = 'constancia_conocimiento_bc'
     and coalesce(a.vigente_hasta, 'infinity') >= b.vigente_desde
     and coalesce(b.vigente_hasta, 'infinity') >= a.vigente_desde;
  if v_n <> 0 then
    raise exception 'Las vigencias de la constancia se traslapan (% pares)', v_n;
  end if;
end;
$$;
