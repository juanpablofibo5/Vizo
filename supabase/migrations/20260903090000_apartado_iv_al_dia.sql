-- ---------------------------------------------------------------------------
-- El Apartado IV del Manual dejó de ser cierto
-- ---------------------------------------------------------------------------
-- Hallazgo del barrido del mapa (2-sep-2026). La fila vigente de la fracción
-- IV dice, con estas palabras:
--
--   «No acredita QUIÉN puede autorizar […] ni el seguimiento reforzado de los
--    Arts. 23 Ter 3 y 23 Ter 4, que todavía no está construido.»
--
-- La segunda mitad caducó el 23 de agosto, cuando se construyeron el
-- cuestionario del Art. 23 Ter 3 (ADR-25) y las medidas reforzadas del Art. 23
-- Ter 4 (ADR-26). Esa fila la escribió la migración `20260822130000`, un día
-- antes.
--
-- POR QUÉ ESTO PESA MÁS QUE UNA LÍNEA DE DOCUMENTACIÓN. El Manual de Políticas
-- Internas es lo que el obligado presenta ante la autoridad, y esta fila sale
-- impresa en su Constancia de mecanismos. Una afirmación de menos sobre lo que
-- el sistema hace no es tan grave como una de más — pero le pide al obligado
-- que resuelva por su cuenta algo que ya tiene resuelto, y le hace escribir en
-- su Manual que no cuenta con lo que sí cuenta.
--
-- QUÉ NO CAMBIA:
--
--   · El `origen` sigue siendo `acreditado_parcial`. El hueco de fondo —QUIÉN
--     puede autorizar, que el propio Art. 23 Ter 5 remite al Manual— sigue
--     abierto, y VIZO no valida la facultad de nadie. Cambiar el origen sería
--     una afirmación de cumplimiento nueva, y esto es una corrección.
--   · `clave_evidencia` se queda en `pep_y_aprobacion`. Que la Constancia
--     recolecte además los hechos del cuestionario y de las medidas es una
--     mejora, no una corrección: pide un recolector nuevo y cambia lo que el
--     documento afirma. Queda anotado en `docs/VERIFICACION-DEL-MAPA.md`.
--
-- Las migraciones aplicadas no se editan; esta corrige con una fila nueva.

update apartados_manual
   set por_que_no =
         'VIZO acredita CÓMO queda registrado el carácter PEP y DÓNDE queda la autorización '
         'para operar, con su fecha y su autor. Desde el 23 de agosto de 2026 registra también '
         'el cuestionario del Art. 23 Ter 3 y las medidas reforzadas del Art. 23 Ter 4, cada uno '
         'atado a la clasificación de riesgo que lo exigió. Lo que no acredita es QUIÉN puede '
         'autorizar: el propio Art. 23 Ter 5 lo remite a este Manual, y VIZO no valida la '
         'facultad de nadie.',
       preguntas =
         '["¿Quién, por cargo, puede autorizar una operación con una Persona Políticamente '
         'Expuesta de Grado de Riesgo alto?", "¿Cómo pregunta hoy si un cliente es PEP, o '
         'pariente hasta segundo grado, o socio con vínculo patrimonial?", "Además de lo que el '
         'sistema registra, ¿qué seguimiento aplica su política después de autorizar?"]'::jsonb
 where fraccion = 'IV' and vigente_hasta is null;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare v_texto text; v_origen text; v_preguntas jsonb;
begin
  select por_que_no, origen::text, preguntas into v_texto, v_origen, v_preguntas
    from apartados_manual where fraccion = 'IV' and vigente_hasta is null;

  -- 1. La frase falsa se fue.
  assert v_texto not like '%todavía no está construido%',
    'ASERCIÓN 1: el Apartado IV sigue diciendo que el seguimiento reforzado no está construido';

  -- 2. Y en su lugar dice lo que sí registra, con su fecha.
  assert v_texto like '%23 Ter 3%' and v_texto like '%23 Ter 4%',
    'ASERCIÓN 2: el Apartado IV ya no nombra los dos artículos que ahora acredita';

  -- 3. El hueco de fondo NO se cerró: sigue siendo del obligado quién autoriza.
  assert v_texto like '%QUIÉN puede autorizar%',
    'ASERCIÓN 3: se perdió el hueco que el apartado tiene que seguir declarando';
  assert v_origen = 'acreditado_parcial',
    'ASERCIÓN 4: una corrección de texto cambió una afirmación de cumplimiento';

  -- 5. Siguen siendo tres preguntas para el obligado, no dos.
  assert jsonb_array_length(v_preguntas) = 3,
    'ASERCIÓN 5: el apartado dejó de preguntarle al obligado lo que le toca';

  raise notice 'Apartado IV del Manual: 5 aserciones en verde.';
end $$;
