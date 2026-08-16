-- ---------------------------------------------------------------------------
-- Si el umbral incluye su propio valor, lo dice el umbral
-- ---------------------------------------------------------------------------
-- ISSUE #17. El motor comparaba con `>=` en todos los casos, y la Ley no usa
-- una sola fórmula:
--
--   Art. 17 fr. V Bis  · aviso          «IGUAL O SUPERIOR al equivalente a
--                                        ocho mil veinticinco veces…»   → >=
--   Art. 17 fr. VIII   · identificación «con un valor IGUAL O SUPERIOR…» → >=
--   Art. 17 fr. XV     · identificación «por un valor mensual SUPERIOR
--                                        al equivalente a mil seiscientas
--                                        cinco veces…»                  → >
--   Art. 17 fr. XV     · aviso          «IGUAL O SUPERIOR…»             → >=
--
-- En exactamente 1,605 UMA de renta mensual —$188,282.55 con la UMA de 2026—
-- VIZO pedía identificación y la Ley no. Un peso menos y coinciden; un peso más
-- y coinciden. Solo difieren en el punto exacto, que es donde nadie mira.
--
-- No se arregla con un `if` en el motor: es una propiedad DEL UMBRAL, y los
-- umbrales son dato de catálogo (regla dura 1). Una fracción nueva trae la suya
-- y el motor no se entera — la misma propiedad que demostró la prueba X-01.

alter table umbrales
  add column inclusivo boolean not null default true;

comment on column umbrales.inclusivo is
  'Si el umbral se alcanza CON su propio valor. true = «igual o superior» (>=), la fórmula habitual del Art. 17. false = «superior a» (>), como la identificación de la Fr. XV. Sale del verbo de la Ley, no de una convención del motor.';

-- La única excepción conocida al 15 de agosto de 2026.
update umbrales u
   set inclusivo = false
  from actividades_vulnerables a
 where a.id = u.actividad_id and a.fraccion = 'XV' and u.tipo = 'identificacion';

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_xv boolean; v_vbis int;
begin
  select u.inclusivo into v_xv
    from umbrales u join actividades_vulnerables a on a.id = u.actividad_id
   where a.fraccion = 'XV' and u.tipo = 'identificacion';

  if v_xv is not false then
    raise exception 'La identificación de la Fr. XV quedó inclusiva, y su artículo dice «superior a».';
  end if;

  -- La Fr. V Bis es la única fracción CONTRATADA hoy, y todos sus umbrales
  -- usan «igual o superior». Si alguno quedara exclusivo, el obligado dejaría
  -- de avisar justo en el monto del umbral.
  select count(*) into v_vbis
    from umbrales u join actividades_vulnerables a on a.id = u.actividad_id
   where a.fraccion = 'V_BIS' and u.inclusivo;

  if v_vbis <> 3 then
    raise exception 'La Fr. V Bis debe tener sus 3 umbrales inclusivos y tiene %.', v_vbis;
  end if;

  raise notice '✓ umbrales: la inclusividad sale del verbo de la Ley — Fr. XV identificación es «superior a»';
end $$;
