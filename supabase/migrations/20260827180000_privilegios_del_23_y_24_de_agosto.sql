-- VIZO · Migración — Los privilegios que el 23 y el 24 de agosto olvidaron declarar
--
-- El CI está en rojo desde el commit de los cuestionarios (23-ago): las
-- migraciones 20260823180000, 20260823210000 y 20260824090000 crearon seis
-- tablas sin la sección de privilegios que toda migración desde ADR-17 debe
-- traer, y la aserción 1f-bis del smoke test hizo exactamente su trabajo:
--
--   FALLA 1f-bis: privilegios de escritura sin declarar
--
-- Doce privilegios en seis tablas. La corrección sigue el precedente de
-- `factores_modelo` (migración 20260821120000): lo legítimo se declara con su
-- motivo; lo que no tiene caso de uso se revoca. Detectado el 27-ago-2026 al
-- revisar el CI tras el push del día — cuatro commits tarde, que es la razón
-- de mirar el CI y no solo la suite local.

-- ---------------------------------------------------------------------------
-- 1. Lo que se revoca: UPDATE sobre la configuración del modelo
-- ---------------------------------------------------------------------------
-- El precedente es factores_modelo: corregir el borrador es DELETE + INSERT,
-- nunca UPDATE — así una corrección no puede dejar mitades viejas, y el
-- trigger `factor_modelo_solo_en_borrador` congela todo al activar el modelo.
-- `mitigantes_elementos` además es tabla de enlace pura: un UPDATE ahí no
-- significa nada que un borrar-y-volver-a-enlazar no diga mejor.

revoke update on pesos_elemento        from authenticated;
revoke update on mitigantes            from authenticated;
revoke update on mitigantes_elementos  from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lo que se declara, con su porqué
-- ---------------------------------------------------------------------------
insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  -- Evidencia append-only del Cap. III Ter: solo se agrega, nunca se cambia.
  ('cuestionarios_riesgo_alto','authenticated','INSERT',null,
   'append-only: las respuestas del Art. 23 Ter 3 no se reescriben (ADR-25)'),
  ('medidas_reforzadas','authenticated','INSERT',null,
   'append-only: lo adoptado bajo el Art. 23 Ter 4 queda asentado (ADR-26)'),
  ('personas_vinculadas_reforzadas','authenticated','INSERT',null,
   'append-only: las personas que la medida reforzada documenta (Art. 23 Ter 4)'),

  -- Configuración del modelo, editable solo en borrador (mismo trato que
  -- factores_modelo): el obligado captura, VIZO nunca siembra aquí (ADR-21).
  ('pesos_elemento','authenticated','INSERT',null,
   'el obligado asigna el valor de cada elemento (Art. 10 Septies 1 fr. II); VIZO nunca siembra aquí (ADR-21)'),
  ('pesos_elemento','authenticated','DELETE',null,
   'corregir el borrador antes de activarlo; el trigger lo impide una vez vigente'),
  ('mitigantes','authenticated','INSERT',null,
   'el obligado declara SUS mitigantes (Art. 10 Septies 1 fr. III); VIZO no los propone'),
  ('mitigantes','authenticated','DELETE',null,
   'corregir el borrador antes de activarlo; el trigger lo impide una vez vigente'),
  ('mitigantes_elementos','authenticated','INSERT',null,
   'sobre qué elementos actúa cada mitigante; sin el enlace la fr. III no queda acreditada'),
  ('mitigantes_elementos','authenticated','DELETE',null,
   'quitar un enlace del borrador; congelado junto con el modelo');

-- ---------------------------------------------------------------------------
-- Aserción: la base vuelve a cuadrar con el inventario
-- ---------------------------------------------------------------------------
do $$
declare v_problemas text;
begin
  select string_agg(tabla || ': ' || problema, ' · ')
    into v_problemas from app.verificar_privilegios_declarados();
  if v_problemas is not null then
    raise exception 'Privilegios sin declarar tras la corrección: %', v_problemas;
  end if;

  perform 1 from app.verificar_privilegios_por_omision() limit 1;
  if found then
    raise exception 'Privilegios por omisión pendientes tras la corrección';
  end if;
end $$;
