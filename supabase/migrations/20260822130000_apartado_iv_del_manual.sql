-- ---------------------------------------------------------------------------
-- El apartado IV del Manual deja de ser un hueco entero
-- ---------------------------------------------------------------------------
-- Art. 37 Bis, fr. IV: «Los procedimientos para la identificación y seguimiento
-- reforzado de Personas Políticamente Expuestas».
--
-- Nació como `del_obligado` el 16 de agosto de 2026, con este por_que_no:
-- «VIZO no consulta PEP […] en ese hueco el procedimiento es del obligado», y
-- tres preguntas. Desde entonces se construyeron dos de las cosas que
-- preguntaba, así que dejarlo como hueco entero ya no es prudencia: es decir
-- menos de lo que se puede demostrar.
--
-- ────────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA Y QUÉ NO, PORQUE ESTO ES UNA AFIRMACIÓN DE CUMPLIMIENTO
-- ────────────────────────────────────────────────────────────────────────────
-- Mover un apartado de hueco a parcial es afirmar algo ante una revisión, y el
-- ADR-20 pide que solo se afirme lo demostrable. Lo demostrable, hoy:
--
--   · Cómo se recaba el carácter PEP: una red declarada con los vínculos del
--     Art. 23 Quáter ¶3 y sus fechas, no una casilla; y la vigencia DERIVADA
--     de los dos relojes del catálogo, nunca capturada (issue #19).
--   · Dónde queda la autorización para operar con una PEP de riesgo alto: la
--     aprobación del Art. 23 Ter 5, con quién aprobó, cuándo, sobre qué actos,
--     y citando la evidencia que la hizo exigible (ADR-23).
--
-- Lo que sigue siendo del obligado, y por eso el apartado es PARCIAL y no
-- acreditado:
--
--   · **Quién** autoriza. El propio Art. 23 Ter 5 lo remite al Manual, y VIZO
--     no valida la facultad de nadie.
--   · El **seguimiento reforzado** de los Arts. 23 Ter 3 y 23 Ter 4, que no
--     está construido.
--   · Cómo se pregunta en la práctica: el guion, el formato, el momento.
--
-- La pregunta «¿quién autoriza operar con una PEP, y dónde queda esa
-- autorización?» se parte en dos porque tenía dos mitades: VIZO contesta la
-- segunda y la primera se queda, dicha con esas palabras.
update apartados_manual
   set origen = 'acreditado_parcial',
       clave_evidencia = 'pep_y_aprobacion',
       por_que_no =
         'VIZO acredita CÓMO queda registrado el carácter PEP y DÓNDE queda la autorización para operar, con su fecha y su autor. No acredita QUIÉN puede autorizar —el propio Art. 23 Ter 5 lo remite a este Manual— ni el seguimiento reforzado de los Arts. 23 Ter 3 y 23 Ter 4, que todavía no está construido.',
       preguntas = '["¿Quién, por cargo, puede autorizar una operación con una Persona Políticamente Expuesta de Grado de Riesgo alto?", "¿Cómo pregunta hoy si un cliente es PEP, o pariente hasta segundo grado, o socio con vínculo patrimonial?", "¿Qué seguimiento reforzado aplica después de autorizar?"]'::jsonb
 where fraccion = 'IV' and vigente_hasta is null;

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_origen text; v_clave text; v_preguntas int; v_total int;
begin
  select origen::text, clave_evidencia, jsonb_array_length(preguntas)
    into v_origen, v_clave, v_preguntas
    from apartados_manual where fraccion = 'IV' and vigente_hasta is null;

  if v_origen <> 'acreditado_parcial' then
    raise exception 'El apartado IV quedó como %, y debía pasar a parcial.', v_origen;
  end if;
  if v_clave is null then
    raise exception 'El apartado IV promete acreditar sin decir de dónde sale la evidencia.';
  end if;
  -- Un parcial que se quede sin preguntas deja de decir qué le falta al
  -- obligado, y ahí «parcial» se vuelve indistinguible de «acreditado».
  if v_preguntas < 3 then
    raise exception 'El apartado IV quedó con % pregunta(s): un parcial tiene que seguir diciendo qué le falta al obligado.', v_preguntas;
  end if;

  -- Y el conteo global no se movió: siguen siendo catorce.
  select count(*) into v_total from apartados_manual where vigente_hasta is null;
  if v_total <> 14 then
    raise exception 'El Manual quedó con % apartados vigentes y el Art. 37 Bis tiene catorce.', v_total;
  end if;

  raise notice '✓ apartado IV: parcial — VIZO acredita dónde queda la autorización, y quién puede darla sigue siendo del obligado';
end $$;
