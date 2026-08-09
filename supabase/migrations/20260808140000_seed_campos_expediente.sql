-- VIZO · Migración 016 — Qué integra el expediente de Fracción V Bis
--
-- Semana 6. `campos_expediente` estaba VACÍA a propósito desde la migración
-- 001, esperando el análisis del XSD. Ya está hecho (docs/campos-aviso.md y
-- tests/expediente/cruce-xsd.test.ts), así que se puede sembrar.
--
-- ADVERTENCIA QUE NO SE PUEDE OMITIR AL DEMOSTRAR ESTO:
-- POR CONFIRMAR-3 sigue abierto. La pregunta "¿qué documentos son obligatorios
-- MÁS ALLÁ de lo que exige el XSD?" es para un especialista PLD, no para quien
-- programa. Lo que se siembra aquí es el piso defendible:
--
--   * los DATOS que el XSD exige para poder emitir el aviso — eso es
--     verificable y está probado contra `regulatorio/xsd/din.xsd`;
--   * los DOCUMENTOS del expediente de identificación estándar del Art. 18,
--     que es práctica de la industria y NO una conclusión legal verificada.
--
-- La distinción importa: si el especialista dice que falta uno, se agrega una
-- fila. Si dice que sobra, se cierra su vigencia. En ninguno de los dos casos
-- se toca código — que es exactamente lo que esta tabla existe para permitir.
--
-- CÓMO SE SATISFACE CADA CAMPO:
--   tipo_dato = 'documento'  -> con un archivo en `documentos.campo`
--   los demás                -> con un valor no nulo en la columna que nombra
--                               `validacion->>'columna'` de `clientes_finales`
--
-- Esa columna va en `validacion` y no en el código a propósito: si el mapeo
-- viviera en TypeScript, agregar un campo obligatorio exigiría un deploy, y
-- entonces esta tabla no serviría para nada.

do $$
declare
  v_actividad uuid;
  v_desde     date := date '2025-07-17';  -- misma vigencia que el resto del catálogo
begin
  select id into strict v_actividad
    from actividades_vulnerables where fraccion = 'V_BIS';

  insert into campos_expediente
    (actividad_id, aplica_a, campo, etiqueta, tipo_dato, obligatorio, validacion, orden, vigente_desde)
  values
    -- ── Datos que el XSD exige para emitir el aviso ────────────────────────
    (v_actividad, 'ambas', 'rfc', 'RFC', 'texto', true,
     '{"columna":"rfc"}'::jsonb, 10, v_desde),

    (v_actividad, 'persona_fisica', 'nombre_pila', 'Nombre de pila', 'texto', true,
     '{"columna":"nombre_pila"}'::jsonb, 20, v_desde),

    (v_actividad, 'persona_fisica', 'apellido_paterno', 'Apellido paterno', 'texto', true,
     '{"columna":"apellido_paterno"}'::jsonb, 30, v_desde),

    -- El XSD pide CURP para persona física, pero un extranjero no la tiene.
    -- Obligatorio = false, y la identidad alterna cubre ese caso (A-05).
    (v_actividad, 'persona_fisica', 'curp', 'CURP', 'texto', false,
     '{"columna":"curp"}'::jsonb, 40, v_desde),

    (v_actividad, 'persona_moral', 'nombre_o_razon_social', 'Razón social', 'texto', true,
     '{"columna":"nombre_o_razon_social"}'::jsonb, 20, v_desde),

    (v_actividad, 'ambas', 'fecha_nacimiento_o_constitucion',
     'Fecha de nacimiento o constitución', 'fecha', true,
     '{"columna":"fecha_nacimiento_o_constitucion"}'::jsonb, 50, v_desde),

    (v_actividad, 'ambas', 'nacionalidad', 'País de nacionalidad', 'catalogo', true,
     '{"columna":"nacionalidad","catalogo":"pais"}'::jsonb, 60, v_desde),

    (v_actividad, 'ambas', 'domicilio', 'Domicilio', 'texto', true,
     '{"columna":"domicilio"}'::jsonb, 70, v_desde),

    (v_actividad, 'persona_fisica', 'actividad_economica', 'Actividad económica', 'catalogo', true,
     '{"columna":"actividad_economica","catalogo":"actividad_economica"}'::jsonb, 80, v_desde),

    (v_actividad, 'persona_moral', 'giro_mercantil', 'Giro mercantil', 'catalogo', true,
     '{"columna":"giro_mercantil","catalogo":"giro_mercantil"}'::jsonb, 80, v_desde),

    -- ── Documentos del expediente de identificación (Art. 18) ──────────────
    -- PROVISIONAL: ver la advertencia del encabezado.
    (v_actividad, 'ambas', 'identificacion_oficial',
     'Identificación oficial vigente', 'documento', true, '{}'::jsonb, 100, v_desde),

    (v_actividad, 'ambas', 'comprobante_domicilio',
     'Comprobante de domicilio (máximo 3 meses)', 'documento', true, '{}'::jsonb, 110, v_desde),

    (v_actividad, 'ambas', 'constancia_situacion_fiscal',
     'Constancia de situación fiscal', 'documento', true, '{}'::jsonb, 120, v_desde),

    (v_actividad, 'persona_moral', 'acta_constitutiva',
     'Acta constitutiva', 'documento', true, '{}'::jsonb, 130, v_desde),

    (v_actividad, 'persona_moral', 'poder_representante',
     'Poder del representante o apoderado', 'documento', true, '{}'::jsonb, 140, v_desde),

    (v_actividad, 'persona_moral', 'identificacion_representante',
     'Identificación oficial del representante', 'documento', true, '{}'::jsonb, 150, v_desde),

    -- La declaración de beneficiario controlador se recaba SIEMPRE, incluso
    -- cuando la respuesta es que no existe: la declaración misma es la
    -- obligación (por eso `beneficiarios_controladores.es_declaracion`).
    (v_actividad, 'persona_moral', 'declaracion_beneficiario',
     'Declaración de beneficiario controlador', 'documento', true, '{}'::jsonb, 160, v_desde);
end;
$$;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_n         int;
  v_sin_col   text;
begin
  select count(*) into v_n from campos_expediente;
  if v_n <> 17 then
    raise exception 'Se esperaban 17 campos de expediente sembrados, hay %', v_n;
  end if;

  -- Todo campo que NO es documento tiene que decir de qué columna sale, y esa
  -- columna tiene que existir. Un campo sin columna sería imposible de
  -- satisfacer y dejaría el expediente permanentemente incompleto, sin que
  -- nadie pudiera explicar por qué.
  select string_agg(c.campo, ', ') into v_sin_col
    from campos_expediente c
   where c.tipo_dato <> 'documento'
     and not exists (
       select 1 from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = 'clientes_finales'
          and ic.column_name = c.validacion->>'columna'
     );
  if v_sin_col is not null then
    raise exception 'Campos sin columna de origen válida en clientes_finales: %', v_sin_col;
  end if;

  raise notice 'Campos del expediente V Bis: % sembrados (10 datos + 7 documentos). POR CONFIRMAR-3 sigue abierto.', v_n;
end;
$$;
