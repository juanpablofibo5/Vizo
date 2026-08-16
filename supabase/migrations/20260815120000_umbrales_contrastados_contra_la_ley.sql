-- ---------------------------------------------------------------------------
-- Los umbrales dejan de citar una fuente secundaria
-- ---------------------------------------------------------------------------
-- No cambia UN SOLO número. Cambia de dónde dice que salen, que bajo la regla
-- dura 1 es la mitad del dato: «un umbral con fuente equivocada es peor que un
-- umbral faltante».
--
-- Contrastados el 15 de agosto de 2026 contra el texto consolidado de la
-- LFPIORPI publicado por la Cámara de Diputados —última reforma DOF
-- 16-07-2025—, artículo 17:
--
--   · Fr. V Bis: «Serán objeto de Aviso […] cuando el acto u operación sea por
--     una cantidad igual o superior al equivalente a OCHO MIL VEINTICINCO veces
--     el valor diario de la UMA». Coincide con las 8,025 que ya estaban.
--
--   · Fr. XV: «por un valor mensual SUPERIOR al equivalente a MIL SEISCIENTAS
--     CINCO veces […] Serán objeto de Aviso […] cuando el monto del acto u
--     operación mensual sea IGUAL O SUPERIOR al equivalente a TRES MIL
--     DOSCIENTAS DIEZ veces». Coinciden con las 1,605 y 3,210 que se habían
--     sembrado como prueba de arquitectura.
--
-- Que los números adivinados en la planeación resultaran ser los correctos es
-- suerte, no método. Lo que se corrige aquí es el método: ahora se puede
-- responder de dónde salen.
--
-- SE QUEDA SIN CONTRASTAR el umbral de EFECTIVO de la Fr. XV. Sale del Art. 32,
-- que no se leyó en esta pasada, y suponer que es igual al de aviso sería
-- exactamente lo que esta migración corrige.

update umbrales u
   set fuente = 'Art. 17 fr. V Bis LFPIORPI (texto consolidado, última reforma DOF 16-07-2025): «igual o superior al equivalente a ocho mil veinticinco veces el valor diario de la UMA». Contrastado el 2026-08-15.'
  from actividades_vulnerables a
 where a.id = u.actividad_id and a.fraccion = 'V_BIS' and u.tipo = 'aviso';

update umbrales u
   set fuente = 'Art. 17 fr. XV LFPIORPI (texto consolidado, última reforma DOF 16-07-2025): «por un valor mensual superior al equivalente a mil seiscientas cinco veces el valor diario de la UMA». OJO: la Ley dice SUPERIOR, no «igual o superior» — ver issue de la comparación inclusiva. Contrastado el 2026-08-15.'
  from actividades_vulnerables a
 where a.id = u.actividad_id and a.fraccion = 'XV' and u.tipo = 'identificacion';

update umbrales u
   set fuente = 'Art. 17 fr. XV LFPIORPI (texto consolidado, última reforma DOF 16-07-2025): «cuando el monto del acto u operación mensual sea igual o superior al equivalente a tres mil doscientas diez veces el valor diario de la UMA». Contrastado el 2026-08-15.'
  from actividades_vulnerables a
 where a.id = u.actividad_id and a.fraccion = 'XV' and u.tipo = 'aviso';

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_sin_contrastar int; v_valores int;
begin
  -- Los números NO se movieron. Si esta migración los tocara, sería otra cosa
  -- distinta de lo que dice ser.
  select count(*) into v_valores
    from umbrales u join actividades_vulnerables a on a.id = u.actividad_id
   where (a.fraccion = 'V_BIS' and u.tipo = 'aviso'          and u.valor_uma = 8025.00)
      or (a.fraccion = 'XV'    and u.tipo = 'identificacion' and u.valor_uma = 1605.00)
      or (a.fraccion = 'XV'    and u.tipo = 'aviso'          and u.valor_uma = 3210.00);

  if v_valores <> 3 then
    raise exception 'Un umbral cambió de valor y esta migración solo debía cambiar su fuente.';
  end if;

  select count(*) into v_sin_contrastar
    from umbrales u join actividades_vulnerables a on a.id = u.actividad_id
   where u.fuente like '%SIN contrastar%';

  -- Queda uno: el efectivo de la Fr. XV, a propósito.
  if v_sin_contrastar <> 1 then
    raise exception 'Se esperaba exactamente 1 umbral sin contrastar (efectivo de Fr. XV) y hay %.', v_sin_contrastar;
  end if;

  raise notice '✓ umbrales: V Bis y Fr. XV citan la Ley; el efectivo de Fr. XV sigue marcado sin contrastar';
end $$;
