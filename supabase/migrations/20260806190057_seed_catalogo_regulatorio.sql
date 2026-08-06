-- VIZO · Carga inicial del catálogo regulatorio (Capa 0)
--
-- POR QUÉ ES UNA MIGRACIÓN Y NO seed.sql: el catálogo regulatorio es dato de
-- PRODUCCIÓN. Sin él, el motor no puede evaluar nada. seed.sql se reserva
-- para los datos demo, que solo existen en local.
--
-- CADA FILA LLEVA SU FUENTE. Regla heredada de docs/03_EJECUCION_CLAUDE_CODE.md:
-- un valor regulatorio sin validar no se carga "provisionalmente" — se deja
-- fuera y el motor falla ruidosamente. Lo provisional se queda para siempre.
--
-- Verificado contra la tabla oficial del SPPLD capturada el 4 de agosto de
-- 2026 en regulatorio/paginas/umbrales_sppld_2026-08-04.html.

-- ---------------------------------------------------------------------------
-- 1. UMA por vigencia
-- ---------------------------------------------------------------------------
-- El INEGI publica la UMA en enero, pero los umbrales entran en vigor el
-- 1 DE FEBRERO. Una operación del 15 de enero de 2026 se evalúa con la UMA
-- de 2025. Confirmado textualmente por el portal del SAT: "$117.31 pesos
-- mexicanos a partir del 01 de febrero del 2026".
--
-- LÍMITE CONOCIDO: no se carga la UMA anterior a febrero de 2025. Una
-- operación previa a esa fecha devuelve NULL en app.uma_vigente() y el motor
-- debe rechazarla, no asumir un valor.
insert into uma_vigencias (valor_diario, vigente_desde, vigente_hasta, fuente_dof) values
  (113.14, '2025-02-01', '2026-01-31',
   'UMA 2025. Fuente: tabla oficial de umbrales del SPPLD (regulatorio/paginas/umbrales_sppld_2026-08-04.html) y docs/00_PLAN_MAESTRO.md §1.6'),
  (117.31, '2026-02-01', null,
   'UMA 2026. Fuente: portal SPPLD, textual: "$117.31 pesos mexicanos a partir del 01 de febrero del 2026" (capturado 2026-08-04)');

-- ---------------------------------------------------------------------------
-- 2. Actividad vulnerable
-- ---------------------------------------------------------------------------
-- Solo la Fracción V Bis: es el alcance del MVP. Dar de alta otra fracción
-- (la prueba de la semana 11 usa la XV) es un INSERT aquí más sus umbrales,
-- sin tocar el motor.
insert into actividades_vulnerables (fraccion, nombre, descripcion) values
  ('V_BIS', 'Desarrollo Inmobiliario',
   'Art. 17 fr. V Bis LFPIORPI. El portal del SAT publica su formato de aviso bajo el prefijo "din".');

-- ---------------------------------------------------------------------------
-- 3. Umbrales de la Fracción V Bis
-- ---------------------------------------------------------------------------
-- Tabla oficial del SPPLD, fila "V Bis · Desarrollo Inmobiliario":
--   Umbral de identificación: Siempre
--   Umbral de aviso:          8,025 UMA = $941,412.75
--
-- Vigencia desde el 17/07/2025, fecha en que entró en vigor la reforma a la
-- LFPIORPI publicada en el DOF el 16/07/2025.
--
-- SOBRE LA COLUMNA `base` — hay una contradicción abierta entre fuentes
-- propias sobre si el umbral del Art. 17 se evalúa sin impuestos o con
-- impuestos incluidos (docs/DECISIONES.md, POR CONFIRMAR-4). Se carga la
-- postura provisional. Si la confirmación la cambia, la corrección es cerrar
-- estas filas e insertar otras: cero código, cero despliegue. Esa es
-- exactamente la razón de que la Capa 0 exista.
with a as (select id from actividades_vulnerables where fraccion = 'V_BIS')
insert into umbrales (actividad_id, tipo, siempre, valor_uma, base, vigente_desde, fuente)
select a.id, t.tipo, t.siempre, t.valor_uma, t.base, '2025-07-17'::date, t.fuente
from a, (values
  ('identificacion'::tipo_umbral, true,  null::numeric,
   'sin_iva'::base_calculo,
   'Tabla oficial SPPLD: "Siempre". En Fr. V Bis se integra expediente de CADA comprador, sin importar el monto.'),
  ('aviso'::tipo_umbral, false, 8025::numeric,
   'sin_iva'::base_calculo,
   'Tabla oficial SPPLD: 8,025 UMA = $941,412.75 con UMA 2026. Base sin IVA = postura PROVISIONAL, ver POR CONFIRMAR-4.'),
  ('efectivo'::tipo_umbral, false, 8025::numeric,
   'con_iva'::base_calculo,
   'Art. 32 LFPIORPI. Se evalúa CON IVA y accesorios (Art. 6 del Reglamento reformado, DOF 27/03/2026).')
) as t(tipo, siempre, valor_uma, base, fuente);

-- ---------------------------------------------------------------------------
-- 4. Parámetros del motor
-- ---------------------------------------------------------------------------
-- Se distingue explícitamente lo REGULATORIO de lo que es DECISIÓN DE
-- PRODUCTO. Confundirlos es como se cuela un criterio inventado a un
-- expediente que después hay que defender.
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente) values
  (null, 'ventana_acumulacion_meses', '6'::jsonb,
   'Meses hacia atrás desde la operación evaluada, ventana deslizante.',
   '2025-07-17',
   'REGULATORIO. Confirmado en el webinar oficial SAT-UIF del 20/06/2026 y en la skill umbrales-lfpiorpi.'),

  (null, 'dia_limite_presentacion', '17'::jsonb,
   'Día del mes siguiente en que vence la presentación del aviso.',
   '2025-07-17',
   'REGULATORIO. Fuente: instructivos del SPPLD y skill aviso-sppld.'),

  (null, 'umbral_proximidad_pct', '90'::jsonb,
   'Porcentaje del umbral de aviso a partir del cual se levanta alerta de proximidad.',
   '2025-07-17',
   'DECISIÓN DE PRODUCTO, no regulatoria. La ley no exige alertar por proximidad: es una ayuda operativa. Ajustable sin fundamento legal.'),

  (null, 'dia_alerta_presentacion', '10'::jsonb,
   'Día del mes a partir del cual se avisa que se acerca la fecha límite.',
   '2025-07-17',
   'DECISIÓN DE PRODUCTO, no regulatoria.');

-- ---------------------------------------------------------------------------
-- 5. Formato de aviso vigente
-- ---------------------------------------------------------------------------
-- El XSD descargado del portal el 4 de agosto de 2026. Es el único publicado
-- para la fracción.
--
-- POR CONFIRMAR: el portal NO publica desde cuándo rige este XSD. Se asume la
-- vigencia de la reforma. Cuando salgan las RCG (vencidas desde el 16/07/2026)
-- traerán formatos nuevos: la respuesta correcta será cerrar esta fila e
-- insertar la siguiente con su vigencia, no editar esta.
with a as (select id from actividades_vulnerables where fraccion = 'V_BIS')
insert into formatos_aviso (actividad_id, version, ruta_xsd, vigente_desde, notas)
select a.id, 'din-sppld-2026-08', 'regulatorio/xsd/din.xsd', '2025-07-17',
  'Descargado del SPPLD el 2026-08-04. El portal no documenta fecha de vigencia; se asume la de la reforma. '
  'OJO: el ejemplo oficial de XML publicado por el SAT NO valida contra este XSD (typo en caractersiticas_desarrollo). '
  'El fixture usable es regulatorio/ejemplos/ejemplo_din.CORREGIDO.xml. Ver regulatorio/README.md.'
from a;

-- ---------------------------------------------------------------------------
-- 6. campos_expediente — DELIBERADAMENTE VACÍA
-- ---------------------------------------------------------------------------
-- Qué campos integran el expediente de Fr. V Bis sale del análisis del XSD
-- (158 elementos, 40 catálogos cerrados) y del instructivo, más lo que el
-- especialista PLD confirme que la autoridad exige más allá del XSD
-- (POR CONFIRMAR-3). Ese trabajo es el siguiente bloque de la semana 1.
--
-- Cargar aquí una lista "razonable" mientras tanto sería inventar un criterio
-- regulatorio. La tabla se queda vacía y la completitud del expediente falla
-- ruidosamente hasta que haya datos validados.

-- ---------------------------------------------------------------------------
-- Verificación: los valores cargados reproducen la tabla oficial
-- ---------------------------------------------------------------------------
do $$
declare
  v_uma_2026   numeric;
  v_uma_2025   numeric;
  v_umbral_uma numeric;
  v_pesos      numeric;
begin
  -- La frontera del 1 de febrero
  v_uma_2025 := app.uma_vigente('2026-01-15');
  v_uma_2026 := app.uma_vigente('2026-02-15');

  if v_uma_2025 <> 113.14 then
    raise exception 'Una operación del 15/01/2026 debe evaluarse con UMA 2025 (113.14), se obtuvo %', v_uma_2025;
  end if;
  if v_uma_2026 <> 117.31 then
    raise exception 'Una operación del 15/02/2026 debe evaluarse con UMA 2026 (117.31), se obtuvo %', v_uma_2026;
  end if;

  -- El umbral de aviso en pesos tiene que dar exactamente lo que publica el SAT
  select u.valor_uma into v_umbral_uma
  from public.umbrales u
  join public.actividades_vulnerables a on a.id = u.actividad_id
  where a.fraccion = 'V_BIS' and u.tipo = 'aviso'
    and daterange(u.vigente_desde, u.vigente_hasta, '[]') @> '2026-02-15'::date;

  v_pesos := round(v_umbral_uma * v_uma_2026, 2);

  if v_pesos <> 941412.75 then
    raise exception 'El umbral de aviso de V Bis debe ser $941,412.75 según la tabla oficial del SPPLD; se calculó %', v_pesos;
  end if;

  raise notice 'Catálogo cargado. Umbral de aviso V Bis: % UMA x $% = $% (coincide con la tabla oficial del SAT)',
    v_umbral_uma, v_uma_2026, v_pesos;
  raise notice 'campos_expediente queda VACÍA a propósito: pendiente del análisis del XSD y de POR CONFIRMAR-3.';
end;
$$;
