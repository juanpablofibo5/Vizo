-- ---------------------------------------------------------------------------
-- La pregunta más cara del proyecto queda contestada, y el catálogo cambia de
-- nombre para decir lo que la norma dice
-- ---------------------------------------------------------------------------
-- Issue #3, punto 4. La CONTRADICCIÓN ABIERTA de `docs/DECISIONES.md` — dos
-- fuentes propias citaban la MISMA reforma para conclusiones contrarias — se
-- resuelve contra el texto, no contra ninguna de las dos.
--
-- ────────────────────────────────────────────────────────────────────────────
-- EL TEXTO (✅ contrastado el 16 de agosto de 2026)
-- ────────────────────────────────────────────────────────────────────────────
-- Reglamento de la LFPIORPI, Artículo 6 —`regulatorio/leyes/Reg_LFPIORPI.pdf`,
-- SHA-256 8072a83e…, líneas 247-260 del texto extraído—:
--
--   «Para determinar el monto o valor de los actos u operaciones a que se
--    refiere el ARTÍCULO 17 de la Ley, este Reglamento y las reglas de carácter
--    general, quienes los realicen NO DEBERÁN CONSIDERAR LAS CONTRIBUCIONES Y
--    DEMÁS ACCESORIOS que correspondan a cada acto u operación. Sin perjuicio de
--    lo anterior, al momento de presentar el Aviso correspondiente, deberán
--    REPORTAR LOS MONTOS TOTALES de los pagos recibidos, INCLUIDOS los
--    relacionados con las contribuciones, SIN NECESIDAD DE DESGLOSARLOS.»
--                                            Párrafo reformado DOF 27-03-2026
--
--   «Para determinar el monto de los actos u operaciones a que se refiere el
--    ARTÍCULO 32 de la Ley, DEBERÁN CONSIDERARSE las contribuciones y demás
--    accesorios que en dicho acto u operación se generen.»
--                                           Párrafo adicionado DOF 27-03-2026
--
-- Son TRES reglas sobre el mismo dinero, y el modelo ya las tenía separadas:
--
--   1. Umbral del Art. 17   → `operaciones.monto_base`   (sin contribuciones)
--   2. Monto que va al Aviso → `operaciones.monto_total`  (con, sin desglosar)
--   3. Restricción del Art. 32 → `operaciones.monto_total` (con)
--
-- Que 2 y 3 sean la misma columna no es mezclarlas: el Reglamento pide el mismo
-- número para las dos —el total con contribuciones— y lo que difiere es para
-- qué se usa. Quien elige cuál se compara es `umbrales.base`, dato por umbral.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ SE RENOMBRA EL ENUM
-- ────────────────────────────────────────────────────────────────────────────
-- El enum se llamaba `sin_iva` / `con_iva` y **la norma no habla de IVA**: habla
-- de «contribuciones y demás accesorios». El ISAI es una contribución y no es
-- IVA. El comportamiento siempre fue correcto —`monto_base` excluye IVA, ISAI y
-- accesorios— pero el NOMBRE decía menos que la ley, y de ahí a que alguien
-- concluya «el ISAI no es IVA, luego sí cuenta para el umbral» hay un paso.
--
-- No cambia una sola comparación. Cambia que el catálogo se lea como el Art. 6.

alter type base_calculo rename value 'sin_iva' to 'sin_contribuciones';
alter type base_calculo rename value 'con_iva' to 'con_contribuciones';

-- ---------------------------------------------------------------------------
-- La fuente deja de ser una postura provisional
-- ---------------------------------------------------------------------------
update umbrales u
   set fuente = u.fuente || ' BASE DEL CÁLCULO ✅ CONTRASTADA el 2026-08-16: Art. 6, primer párrafo, del Reglamento de la LFPIORPI (reformado DOF 27-03-2026): para el Art. 17 «no deberán considerar las contribuciones y demás accesorios». El Aviso, en cambio, reporta «los montos totales […] incluidos los relacionados con las contribuciones, sin necesidad de desglosarlos».'
 where u.base = 'sin_contribuciones';

update umbrales u
   set fuente = u.fuente || ' BASE DEL CÁLCULO ✅ CONTRASTADA el 2026-08-16: Art. 6, tercer párrafo, del Reglamento de la LFPIORPI (adicionado DOF 27-03-2026): para el Art. 32 «deberán considerarse las contribuciones y demás accesorios que en dicho acto u operación se generen».'
 where u.base = 'con_contribuciones';

comment on column umbrales.base is
  'Contra qué monto se compara este umbral. sin_contribuciones = el Art. 17, que excluye contribuciones y demás accesorios (Art. 6 ¶1 del Reglamento). con_contribuciones = el Art. 32, que sí los incluye (Art. 6 ¶3). OJO: el monto que se REPORTA en el Aviso es siempre el total con contribuciones, sin desglosar — esa es una tercera regla del mismo artículo y no vive en esta columna.';

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_sin int; v_con int; v_valores int; v_sin_fuente int;
begin
  -- 1. NINGÚN umbral cambió de lado. Esta migración renombra y documenta; si
  --    moviera una base, sería otra cosa distinta de lo que dice ser — y la que
  --    más caro se paga, porque cambia qué operaciones son objeto de Aviso.
  select count(*) into v_sin from umbrales where base = 'sin_contribuciones';
  select count(*) into v_con from umbrales where base = 'con_contribuciones';

  -- Antes del renombre: 4 umbrales sin_iva (identificación y aviso de V Bis,
  -- identificación y aviso de Fr. XV) y 2 con_iva (los dos de efectivo).
  if v_sin <> 4 or v_con <> 2 then
    raise exception 'El reparto de bases cambió: % sin contribuciones y % con, cuando eran 4 y 2.', v_sin, v_con;
  end if;

  -- 2. Y ningún VALOR se movió tampoco.
  select count(*) into v_valores
    from umbrales u join actividades_vulnerables a on a.id = u.actividad_id
   where (a.fraccion = 'V_BIS' and u.tipo = 'aviso'          and u.valor_uma = 8025.00)
      or (a.fraccion = 'XV'    and u.tipo = 'identificacion' and u.valor_uma = 1605.00)
      or (a.fraccion = 'XV'    and u.tipo = 'aviso'          and u.valor_uma = 3210.00);
  if v_valores <> 3 then
    raise exception 'Un umbral cambió de valor y esta migración solo debía cambiar nombres y fuentes.';
  end if;

  -- 3. Todos citan ya el Art. 6. Un umbral con la base sin fundamento es el
  --    caso que la regla dura 1 persigue: calcula, y no se puede defender.
  select count(*) into v_sin_fuente
    from umbrales where fuente not like '%Art. 6%';
  if v_sin_fuente <> 0 then
    raise exception '% umbral(es) no citan el Art. 6 del Reglamento para su base.', v_sin_fuente;
  end if;

  -- 4. Los nombres viejos ya no existen: si alguno sobreviviera, habría código
  --    comparando contra un valor que la base ya no usa y fallaría en silencio
  --    devolviendo la base equivocada.
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'base_calculo' and e.enumlabel in ('sin_iva', 'con_iva')
  ) then
    raise exception 'El enum base_calculo conserva los nombres viejos.';
  end if;

  raise notice '✓ base del umbral: contrastada contra el Art. 6 del Reglamento — sin contribuciones para el Art. 17, con ellas para el Art. 32, y el Aviso reporta el total';
end $$;
