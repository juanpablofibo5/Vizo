-- ---------------------------------------------------------------------------
-- Fracción VIII — Comercialización y distribución de vehículos
-- ---------------------------------------------------------------------------
-- La fracción del PILOTO (PIL-01, Grupo Dicas: dos sucursales automotrices).
-- Igual que la Fr. XV, entra ÚNICAMENTE por INSERTs al catálogo — cero cambios
-- en src/ — y `tests/umbrales/fraccion-viii.test.ts` la ejercita con las
-- mismas funciones que V Bis y XV, incluida la acumulación por pagos que la
-- sesión de NEXUM (26-ago-2026) describió como el dolor real del sector:
-- «el cálculo se hacía de forma artesanal en Excel».
--
-- A DIFERENCIA DE LA XV, ESTOS UMBRALES SÍ ESTÁN CONTRASTADOS — contra el
-- texto de la Ley que vive en el repo (regulatorio/leyes/LFPIORPI.txt,
-- reforma DOF 16-jul-2025):
--
--   · Identificación: Art. 17 fr. VIII — «con un valor igual o superior al
--     equivalente a TRES MIL DOSCIENTAS DIEZ veces el valor diario de la UMA».
--   · Aviso: Art. 17 fr. VIII ¶2 — «igual o superior al equivalente a SEIS MIL
--     CUATROCIENTAS VEINTE veces el valor diario de la UMA».
--   · Efectivo: Art. 32 fr. II — «transmisiones de propiedad o constitución de
--     derechos reales sobre vehículos […] TRES MIL DOSCIENTAS DIEZ veces».
--
-- Con la UMA de 2026 ($117.31): $376,565.10 · $753,130.20 · $376,565.10.
--
-- DOBLE REVISIÓN (runbook 02): quien apruebe el go-live del piloto relee los
-- tres números contra las líneas citadas antes de operar. Lo que SIGUE sin
-- contrastar es el formato del aviso: la tabla oficial del SPPLD y el XSD de
-- vehículos no se han descargado, por eso clave_sppld queda NULL y
-- `generarAviso` se detiene con un mensaje que lo dice — el piloto captura y
-- evalúa desde el día uno; el XSD se carga cuando se descargue (semana 0).

insert into actividades_vulnerables (fraccion, nombre, descripcion, clave_sppld)
values (
  'VIII',
  'Comercialización de Vehículos',
  'Art. 17 Fr. VIII de la LFPIORPI: comercialización o distribución habitual o profesional de vehículos, nuevos o usados, aéreos, marítimos o terrestres. Umbrales contrastados contra el texto de la Ley (reforma DOF 16-jul-2025); XSD del SPPLD pendiente de descarga.',
  -- NULL a propósito: sin el formato oficial descargado no se arma
  -- <clave_actividad>. Adivinar tres letras produciría avisos rechazados.
  null
)
on conflict do nothing;

insert into umbrales (actividad_id, tipo, siempre, valor_uma, base, vigente_desde, fuente)
select av.id, u.tipo::tipo_umbral, u.siempre, u.valor_uma, u.base::base_calculo, date '2025-07-17', u.fuente
  from actividades_vulnerables av,
       (values
         ('identificacion', false, 3210.00, 'sin_contribuciones',
          'Art. 17 fr. VIII de la LFPIORPI (reforma DOF 16-jul-2025): «tres mil doscientas diez veces el valor diario de la UMA». Contrastado contra regulatorio/leyes/LFPIORPI.txt el 2026-08-30. Base sin contribuciones por el Art. 6 ¶1 del Reglamento (contrastado 2026-08-16).'),
         ('aviso',          false, 6420.00, 'sin_contribuciones',
          'Art. 17 fr. VIII, segundo párrafo: «serán objeto de Aviso […] igual o superior al equivalente a seis mil cuatrocientas veinte veces el valor diario de la UMA». Contrastado contra regulatorio/leyes/LFPIORPI.txt el 2026-08-30.'),
         ('efectivo',       false, 3210.00, 'con_contribuciones',
          'Art. 32 fr. II de la LFPIORPI: transmisiones de propiedad o derechos reales sobre vehículos, «tres mil doscientas diez veces el valor diario de la UMA». Contrastado el 2026-08-30. Base con contribuciones por el Art. 6 ¶3 del Reglamento.')
       ) as u(tipo, siempre, valor_uma, base, fuente)
 where av.fraccion = 'VIII';

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from umbrales u join actividades_vulnerables av on av.id = u.actividad_id
   where av.fraccion = 'VIII';

  if v_n <> 3 then
    raise exception 'La Fr. VIII quedó con % umbrales en vez de 3. Sin los tres, el motor no puede evaluarla.', v_n;
  end if;

  if not exists (select 1 from parametros_motor where clave = 'ventana_acumulacion_meses') then
    raise exception 'Falta el parámetro de ventana: la Fr. VIII no podría acumular — y la acumulación ES el caso del piloto.';
  end if;

  raise notice '✓ Fracción VIII dada de alta SOLO con INSERTs — los tres umbrales citando la Ley, sin tocar src/';
end $$;
