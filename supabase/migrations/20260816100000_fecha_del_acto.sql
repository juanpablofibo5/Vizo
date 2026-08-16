-- ---------------------------------------------------------------------------
-- Qué fecha cuenta como «la del acto», y por qué no es la misma en cada fracción
-- ---------------------------------------------------------------------------
-- Issue #10, primera mitad (el Art. 24 Bis 1 ya se implementó el 15 de agosto:
-- ver `tests/aviso/consolidacion.test.ts`).
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE EL TEXTO (✅ contrastado contra el DOF)
-- ────────────────────────────────────────────────────────────────────────────
-- Acuerdo 115/2026, Art. 24 Bis —línea 272 del texto—: «Además de las
-- establecidas en los artículos 5 y 24 del Reglamento, la fecha del acto u
-- operación que deberá considerarse para la presentación del Aviso es:», y
-- enumera fracción por fracción. La que toca:
--
--   «IV. Para el artículo 17, fracción V BIS de la Ley, aquélla en que se
--    RECIBIÓ Y DESTINÓ LA ÚLTIMA APORTACIÓN a un desarrollo inmobiliario, EN EL
--    MES CALENDARIO.»
--
-- Y el párrafo final, que es el que la vuelve consecuente:
--
--   «Con la fecha del acto u operación se INICIARÁ EL CONTEO DEL PLAZO máximo
--    para la presentación del Aviso correspondiente a que se refiere el artículo
--    23 de la Ley…»
--
-- ────────────────────────────────────────────────────────────────────────────
-- LO QUE EL ARTÍCULO **NO** DICE, Y ES LA MITAD DEL HALLAZGO
-- ────────────────────────────────────────────────────────────────────────────
-- La enumeración cubre las fracciones I, II, III, V, V Bis, VI, VII, VIII, IX,
-- X, XI, XIII y XVI. **La Fracción XV —arrendamiento— NO APARECE.** Tampoco la
-- XII ni la XIV.
--
-- Para esas fracciones rige el encabezado: «además de las establecidas en los
-- artículos 5 y 24 del REGLAMENTO», que no se ha contrastado. Así que la
-- respuesta honesta para la Fr. XV no es «la misma que V Bis» ni «la fecha de
-- la operación»: es **no lo sabemos todavía**.
--
-- Por eso este parámetro se siembra SOLO para la Fr. V Bis, y quien lo pida
-- para otra fracción recibe un error que dice qué falta. Sembrar una regla
-- inventada para la Fr. XV no habría reventado nada: habría corrido el plazo
-- desde la fecha equivocada, en silencio, que es como se pierde un día 17.

insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente)
select a.id, 'fecha_del_acto', '"ultima_aportacion_del_mes"'::jsonb,
       'Qué fecha inicia el conteo del plazo de presentación: la de la última aportación recibida y destinada al desarrollo dentro del mes calendario.',
       date '2026-11-30',
       'Art. 24 Bis, fracción IV, del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797): «aquélla en que se recibió y destinó la última aportación a un desarrollo inmobiliario, en el mes calendario». El plazo corre desde ahí por el último párrafo del mismo artículo, en relación con el Art. 23 de la Ley. Contrastado el 2026-08-16.'
  from actividades_vulnerables a
 where a.fraccion = 'V_BIS';

-- DESDE CUÁNDO SE EXIGE, también como dato.
--
-- El Art. 24 Bis entra el 30 de noviembre de 2026 (Transitorio Primero). Antes
-- de esa fecha no hay regla que aplicar y el aviso simplemente no la lleva: el
-- plazo sigue saliendo del Art. 23 de la Ley, que manda desde 2013 y dice «el
-- día 17 del mes inmediato siguiente […] a aquel en que se hubiera llevado a
-- cabo la operación». Para la Fr. V Bis las dos lecturas coinciden, porque la
-- última aportación del mes cae dentro de ese mismo mes.
--
-- Este parámetro es el que convierte «no hay regla» en dos casos distintos:
--   · antes del 30-nov-2026 → no se exige, el aviso no lleva fecha del acto
--   · desde el 30-nov-2026 y sin regla para la fracción → SE DETIENE
-- Sin él, el segundo caso —la Fr. XV— pasaría callado.
insert into parametros_motor (actividad_id, clave, valor, descripcion, vigente_desde, fuente)
values (null, 'exige_fecha_del_acto', 'true'::jsonb,
  'Desde cuándo el aviso debe declarar la fecha del acto del Art. 24 Bis. Antes de esta vigencia, el plazo sale del Art. 23 de la Ley sobre el mes del periodo.',
  date '2026-11-30',
  'Transitorio Primero del Acuerdo 115/2026: «El presente Acuerdo entrará en vigor el treinta de noviembre de dos mil veintiséis, salvo las excepciones previstas en los siguientes artículos transitorios», y el Art. 24 Bis no está en ninguna de esas excepciones. Contrastado el 2026-08-16.');

-- ---------------------------------------------------------------------------
-- El aviso guarda la fecha desde la que corre su plazo
-- ---------------------------------------------------------------------------
-- No es derivable después: las operaciones de un periodo pueden cambiar —una
-- corrección es una operación nueva— y la fecha que se usó para computar el
-- plazo del aviso ya presentado es la que hay que poder defender. Guardarla es
-- la misma razón por la que existe `hash_xml`.
alter table avisos
  add column fecha_acto date;

comment on column avisos.fecha_acto is
  'La fecha del acto u operación del Art. 24 Bis, desde la que corre el plazo del Art. 23 de la Ley. Para la Fr. V Bis: la última aportación del mes calendario. NULL en los avisos generados antes de que esto existiera, y en los informes en cero, donde no hubo acto.';

-- La fecha del acto cae DENTRO del periodo reportado. Fuera de él, el plazo que
-- se calculó no es el que la Ley pide y el aviso se presentaría tarde o pronto
-- sin que nadie lo note.
alter table avisos
  add constraint fecha_acto_dentro_del_periodo check (
    fecha_acto is null
    or (fecha_acto >= periodo and fecha_acto < (periodo + interval '1 month')::date)
  );

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_vbis   int;
  v_otras  int;
  v_valor  jsonb;
begin
  select count(*) into v_vbis
    from parametros_motor p
    join actividades_vulnerables a on a.id = p.actividad_id
   where p.clave = 'fecha_del_acto' and a.fraccion = 'V_BIS';
  if v_vbis <> 1 then
    raise exception 'La Fr. V Bis debe tener exactamente una regla de fecha del acto y tiene %.', v_vbis;
  end if;

  -- Y NINGUNA otra fracción, sobre todo la XV: el Art. 24 Bis no la enumera.
  select count(*) into v_otras
    from parametros_motor p
    left join actividades_vulnerables a on a.id = p.actividad_id
   where p.clave = 'fecha_del_acto'
     and (a.fraccion is distinct from 'V_BIS');
  if v_otras <> 0 then
    raise exception 'Hay % regla(s) de fecha del acto para fracciones que el Art. 24 Bis no enumera. Sembrarlas es inventar la norma.', v_otras;
  end if;

  select p.valor into v_valor
    from parametros_motor p
    join actividades_vulnerables a on a.id = p.actividad_id
   where p.clave = 'fecha_del_acto' and a.fraccion = 'V_BIS';
  if v_valor #>> '{}' <> 'ultima_aportacion_del_mes' then
    raise exception 'La regla de la Fr. V Bis quedó como % y el Art. 24 Bis fr. IV dice la última aportación del mes.', v_valor;
  end if;

  -- La exigencia empieza el 30 de noviembre y NO antes: si arrancara antes,
  -- todos los avisos de periodos anteriores se detendrían por una regla que
  -- todavía no existía.
  if exists (
    select 1 from parametros_motor
     where clave = 'exige_fecha_del_acto' and vigente_desde < date '2026-11-30'
  ) then
    raise exception 'La fecha del acto se exige antes de que el Acuerdo entre en vigor.';
  end if;

  if not exists (
    select 1 from parametros_motor
     where clave = 'exige_fecha_del_acto'
       and vigente_desde <= date '2026-11-30'
       and (vigente_hasta is null or vigente_hasta >= date '2026-11-30')
  ) then
    raise exception 'El 30 de noviembre de 2026 no se exige la fecha del acto, y el Transitorio Primero dice que sí.';
  end if;

  raise notice '✓ fecha del acto: solo la Fr. V Bis, que es la única contratada que el Art. 24 Bis enumera, y exigible desde el 2026-11-30';
end $$;
