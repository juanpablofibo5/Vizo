-- ---------------------------------------------------------------------------
-- Fracción XV — Arrendamiento de inmuebles
-- ---------------------------------------------------------------------------
-- LA PRUEBA DE DISEÑO DEL PROYECTO (caso X-01 de docs/PRUEBAS.md).
--
-- Toda la fracción entra por INSERTs al catálogo. Esta migración no viene
-- acompañada de UN SOLO cambio en `src/`: si diera de alta una fracción nueva
-- exigiera tocar el motor, la restricción no negociable #7 —el motor es
-- agnóstico de fracción— estaría rota, y sería un defecto de arquitectura y no
-- de la prueba.
--
-- El test `tests/umbrales/fraccion-xv.test.ts` ejercita el motor contra estos
-- datos sin importar nada nuevo: usa el mismo `cargarConfigActividad` y el
-- mismo `evaluar` que la Fr. V Bis.
--
-- Umbrales: identificación 1,605 UMA · aviso 3,210 UMA · efectivo 3,210 UMA.
-- Con la UMA de 2026 ($117.31): $188,282.55 y $376,565.10.
--
-- FUENTE: son los valores que docs/PRUEBAS.md fijó en la planeación para el
-- caso X-01. **No están contrastados contra la tabla oficial del SPPLD**, que
-- solo se descargó para la Fr. V Bis. Van marcados como tales en `fuente`: esta
-- fracción existe para probar la arquitectura, no para operarla.

insert into actividades_vulnerables (fraccion, nombre, descripcion, clave_sppld)
values (
  'XV',
  'Arrendamiento de Inmuebles',
  'Art. 17 Fr. XV de la LFPIORPI. Alta de prueba de arquitectura: los umbrales no están contrastados contra el SPPLD y clave_sppld queda NULL porque su XSD no se ha descargado.',
  -- NULL a propósito: sin el formato oficial descargado no se puede armar
  -- <clave_actividad>, y `generarAviso` se detiene con un mensaje que lo dice.
  -- Adivinar tres letras produciría avisos que la autoridad rechaza.
  null
)
on conflict do nothing;

insert into umbrales (actividad_id, tipo, siempre, valor_uma, base, vigente_desde, fuente)
select av.id, u.tipo::tipo_umbral, u.siempre, u.valor_uma, u.base::base_calculo, date '2025-07-17', u.fuente
  from actividades_vulnerables av,
       (values
         -- La identificación de la Fr. XV NO es "siempre" como en V Bis: tiene
         -- su propio umbral. Que las dos fracciones se comporten distinto sin
         -- tocar código es justo lo que esta prueba demuestra.
         ('identificacion', false, 1605.00, 'sin_iva', 'docs/PRUEBAS.md — prueba de arquitectura, SIN contrastar contra el SPPLD'),
         ('aviso',          false, 3210.00, 'sin_iva', 'docs/PRUEBAS.md — prueba de arquitectura, SIN contrastar contra el SPPLD'),
         ('efectivo',       false, 3210.00, 'con_iva', 'docs/PRUEBAS.md — prueba de arquitectura, SIN contrastar contra el SPPLD')
       ) as u(tipo, siempre, valor_uma, base, fuente)
 where av.fraccion = 'XV';

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from umbrales u join actividades_vulnerables av on av.id = u.actividad_id
   where av.fraccion = 'XV';

  if v_n <> 3 then
    raise exception 'La Fr. XV quedó con % umbrales en vez de 3. Sin los tres, el motor no puede evaluarla.', v_n;
  end if;

  -- Los parámetros del motor (ventana de 6 meses, proximidad) son GLOBALES:
  -- la fracción nueva los hereda sin cargar nada. Si algún día un parámetro
  -- fuera por actividad, esto lo diría en la migración que lo introduzca.
  if not exists (select 1 from parametros_motor where clave = 'ventana_acumulacion_meses') then
    raise exception 'Falta el parámetro de ventana: la Fr. XV no podría acumular.';
  end if;

  raise notice '✓ Fracción XV dada de alta SOLO con INSERTs — sin tocar src/';
end $$;
