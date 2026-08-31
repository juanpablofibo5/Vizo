-- ---------------------------------------------------------------------------
-- Los privilegios de escritura del Cap. XII, declarados
-- ---------------------------------------------------------------------------
-- La migración 20260831100000 creó las cuatro tablas de capacitación con sus
-- GRANT y sus políticas, pero no las declaró en `app.privilegios_declarados`.
-- El smoke test estructural lo detuvo en CI con FALLA 1f-bis, que es
-- exactamente para lo que existe: INSERT y UPDATE no se pueden prohibir en
-- bloque —algunos son legítimos— así que la única defensa es que cada uno esté
-- escrito con su motivo, y que aparezca uno sin declarar sea un error.
--
-- No se edita la migración anterior: ya está aplicada en producción, y la casa
-- corrige con una migración nueva.
--
-- DELETE no aparece en ninguna de las cuatro. En tres de ellas ni siquiera se
-- concede: programas, sesiones y asistencias son la evidencia que el Art. 39
-- Bis 1 ¶1 manda conservar diez años, y además de no tener el privilegio las
-- protege un trigger. En `personas_capacitables` tampoco se concede: quien
-- deja el área se da de baja con `baja_del_area`, porque borrarlo cambiaría
-- hacia atrás la respuesta a «quién faltaba» en un periodo ya cerrado.

insert into app.privilegios_declarados (tabla, rol, privilegio, columna, motivo) values
  ('personas_capacitables','authenticated','INSERT',null,
   'El obligado arma la plantilla del Art. 39 Bis ¶1 — los nueve papeles, tengan o no cuenta en el portal'),
  ('personas_capacitables','authenticated','UPDATE',null,
   'La baja del área (Art. 39 Bis 1 ¶3): quien la deja no se borra, deja de contar desde una fecha'),

  ('programas_capacitacion','authenticated','INSERT',null,
   'El programa del periodo anual (Transitorio Séptimo), que se crea al registrar la primera sesión'),
  ('programas_capacitacion','authenticated','UPDATE',null,
   'La descripción del programa; el año lo fija el periodo y la base lo acota con anio_desde_el_primer_periodo'),

  ('sesiones_capacitacion','authenticated','INSERT',null,
   'Los cursos impartidos con sus temas y quien los impartió (Art. 39 Bis fr. I a III)'),
  ('sesiones_capacitacion','authenticated','UPDATE',null,
   'La huella del material y la del documento que acredita la experiencia, que llegan después de la sesión'),

  ('asistencias_capacitacion','authenticated','INSERT',null,
   'La lista de asistencia de cada sesión'),
  ('asistencias_capacitacion','authenticated','UPDATE',null,
   'La evaluación y su constancia (Art. 39 Bis 1 ¶2), que se asientan después de impartida la sesión')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  -- 1. Ya no queda ningún privilegio de escritura sin declarar en toda la base.
  perform 1 from app.verificar_privilegios_declarados() limit 1;
  if found then
    raise exception 'FALLA 1: sigue habiendo privilegios de escritura sin declarar';
  end if;

  -- 2. Las cuatro tablas del capítulo quedaron declaradas, y solo con INSERT y
  --    UPDATE: un DELETE declarado aquí sería el error que este archivo evita.
  select count(*) into v_n from app.privilegios_declarados
   where tabla in ('personas_capacitables','programas_capacitacion',
                   'sesiones_capacitacion','asistencias_capacitacion');
  if v_n <> 8 then
    raise exception 'FALLA 2: se esperaban 8 declaraciones del Cap. XII y hay %', v_n;
  end if;

  select count(*) into v_n from app.privilegios_declarados
   where tabla in ('personas_capacitables','programas_capacitacion',
                   'sesiones_capacitacion','asistencias_capacitacion')
     and privilegio = 'DELETE';
  if v_n <> 0 then
    raise exception 'FALLA 3: hay % DELETE declarados sobre la evidencia del Cap. XII', v_n;
  end if;

  -- 3. Y que nadie tenga el privilegio de verdad, no solo que no esté escrito.
  select count(*) into v_n
    from information_schema.role_table_grants
   where grantee = 'authenticated' and privilege_type = 'DELETE'
     and table_name in ('personas_capacitables','programas_capacitacion',
                        'sesiones_capacitacion','asistencias_capacitacion');
  if v_n <> 0 then
    raise exception 'FALLA 4: authenticated tiene DELETE sobre % tablas del Cap. XII', v_n;
  end if;
end $$;
