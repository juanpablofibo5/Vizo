-- ---------------------------------------------------------------------------
-- Desde cuándo rigen los Caps. III Bis, III Ter y III Quinquies
-- ---------------------------------------------------------------------------
-- Transitorio Cuarto del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina,
-- código 5795797):
--
--   «A partir de los actos u operaciones realizados el primero de marzo de dos
--    mil veintisiete, quienes realicen las Actividades Vulnerables deberán
--    observar lo previsto en los Capítulos III Bis; III Ter y III Quinquies de
--    estas reglas.»
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTA FILA EXISTE, SI EL VALOR YA ESTABA «DISPONIBLE»
-- ────────────────────────────────────────────────────────────────────────────
-- Hasta hoy, la exigibilidad del Perfil transaccional se leía del
-- `vigente_desde` de `perfil_maduracion_meses`, que vale 2027-03-01. Daba la
-- respuesta correcta por una coincidencia: ese `vigente_desde` dice desde
-- cuándo rige ESE PLAZO, no desde cuándo es exigible el capítulo. Son dos
-- hechos distintos que hoy comparten valor, y ese es exactamente el patrón que
-- `docs/RIESGO-EBR.md` §3.1 mandó evitar con los cuatro «seis meses»: si una
-- reforma moviera uno, el otro se movería solo y nadie lo notaría.
--
-- Además el Transitorio Cuarto gobierna TRES capítulos, así que colgarlo de un
-- parámetro de uno de ellos deja a los otros dos sin fuente propia.
--
-- La diferencia entre las dos columnas, dicha una vez:
--   · `vigente_desde` = desde cuándo rige esta REGLA (la publicación del DOF).
--   · `valor`         = la fecha que la regla FIJA para los actos u operaciones.
-- No son la misma cosa y aquí, a propósito, no coinciden.
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'exigibilidad_transitorio_cuarto', '"2027-03-01"'::jsonb,
   'Fecha del acto u operación a partir de la cual son exigibles los Capítulos III Bis (Grado de Riesgo), III Ter (Conocimiento del Cliente) y III Quinquies (Beneficiario Controlador). Se compara contra la FECHA DEL ACTO, no contra la de captura.',
   date '2026-08-07',
   'Transitorio Cuarto del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): «A partir de los actos u operaciones realizados el primero de marzo de dos mil veintisiete […] deberán observar lo previsto en los Capítulos III Bis; III Ter y III Quinquies». Contrastado el 2026-08-22.');

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_valor text; v_desde date;
begin
  select valor #>> '{}', vigente_desde into v_valor, v_desde
    from parametros_motor where clave = 'exigibilidad_transitorio_cuarto';

  if v_valor is null then
    raise exception 'El Transitorio Cuarto no quedó en el catálogo.';
  end if;
  if v_valor::date <> date '2027-03-01' then
    raise exception 'La fecha del Transitorio Cuarto quedó como %, y el texto dice el primero de marzo de dos mil veintisiete.', v_valor;
  end if;

  -- La distinción que motiva la fila: si alguien la «arregla» igualando las dos
  -- columnas, vuelve la conflación que esta migración vino a quitar.
  if v_desde = v_valor::date then
    raise exception 'El vigente_desde de la regla quedó igual a la fecha que la regla fija. Son dos hechos distintos: la regla rige desde su publicación (7-ago-2026) y fija los actos desde el 1-mar-2027.';
  end if;

  raise notice '✓ Transitorio Cuarto: la fecha de los actos es dato con fuente, y no el vigente_desde de otro parámetro';
end $$;
