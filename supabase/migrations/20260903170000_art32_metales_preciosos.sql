-- ---------------------------------------------------------------------------
-- Art. 32 · La prohibición no es solo de efectivo: también de Metales Preciosos
-- ---------------------------------------------------------------------------
-- HALLAZGO. El motor implementaba media prohibición. `efectivoRestringido` se
-- derivaba de `forma_pago = '01'` y nada más, así que un pago de dos millones
-- en oro pasaba como operación normal — sin la alerta granate que sí levanta
-- el mismo monto en billetes. No revienta: calcula de menos, que es el modo de
-- falla caro de este proyecto.
--
-- EL TEXTO (LFPIORPI, `regulatorio/leyes/LFPIORPI.txt`, línea 1320):
--
--   «Artículo 32. Queda prohibido dar cumplimiento a obligaciones y, en
--    general, liquidar o pagar, así como aceptar la liquidación o el pago, de
--    actos u operaciones mediante el uso de MONEDAS Y BILLETES, en moneda
--    nacional o divisas Y METALES PRECIOSOS, aun cuando la liquidación o el
--    pago se realice en efectivo por conducto de una Entidad Financiera […]»
--
-- Y QUÉ SON (misma Ley, Art. 3 fr. IX, línea 157):
--
--   «Metales Preciosos, al ORO, LA PLATA Y EL PLATINO;»
--
-- Con esas dos líneas el mapeo contra el catálogo del SPPLD no interpreta
-- nada: los cuatro códigos que caen dentro son los que nombran esos metales o
-- el efectivo, y ninguno más. `catalogos_sat` ya los tenía sembrados.

insert into parametros_motor (clave, valor, descripcion, vigente_desde, fuente) values
  ('art32_instrumentos_restringidos', '["1","13","14","15"]'::jsonb,
   'Códigos de instrumento_monetario cuyo uso prohíbe el Art. 32 al alcanzar el umbral',
   '2013-08-23',
   'Art. 32 ¶1 de la LFPIORPI: la prohibición alcanza «monedas y billetes, en moneda nacional o '
   'divisas Y METALES PRECIOSOS». Y el Art. 3 fr. IX de la misma Ley define «Metales Preciosos, '
   'al oro, la plata y el platino». Contra el catálogo instrumento_monetario del SPPLD eso son: '
   '1 (Efectivo) — monedas y billetes; 13 (Oro o Platino Amonedados); 14 (Plata Amonedada); y '
   '15 (Metales Preciosos). Ningún otro código del catálogo nombra esos metales ni el efectivo. '
   'La vigencia arranca con la publicación de la Ley: la prohibición no es del Acuerdo 115/2026.');

-- ---------------------------------------------------------------------------
-- Qué instrumento la disparó
-- ---------------------------------------------------------------------------
-- `evaluaciones_umbral.efectivo_restringido` se queda con su nombre. Es
-- append-only —hay evidencia histórica apuntándole— y renombrarlo reescribiría
-- el pasado. Lo que se agrega es CUÁL instrumento la disparó, porque un
-- booleano llamado «efectivo» que ahora también se prende con oro sería
-- exactamente el cajón único que el ADR-32 criticó del enum de beneficiarios.
--
-- En las filas anteriores a esta migración viene NULL, y eso NO quiere decir
-- «no se sabe»: hasta hoy el único disparador posible era el efectivo, así que
-- una fila con la restricción prendida y sin instrumento fue por efectivo. Se
-- deja dicho aquí porque dentro de dos años nadie lo va a recordar.
alter table evaluaciones_umbral
  add column instrumento_restringido text;

comment on column evaluaciones_umbral.instrumento_restringido is
  'Código de instrumento_monetario que disparó la restricción del Art. 32. '
  'NULL en filas anteriores al 3-sep-2026, cuando el único disparador posible '
  'era el efectivo por forma de pago.';

alter table evaluaciones_umbral
  add constraint instrumento_solo_si_hay_restriccion check (
    instrumento_restringido is null or efectivo_restringido = true);

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare v_codigos jsonb; v_faltan text;
begin
  select valor into v_codigos from parametros_motor
   where clave = 'art32_instrumentos_restringidos';

  -- ── 1. Los cuatro códigos, y su fuente cita las dos normas ────────────
  assert jsonb_array_length(v_codigos) = 4,
    'ASERCIÓN 1: la lista del Art. 32 no tiene los cuatro instrumentos';
  assert (select fuente from parametros_motor
           where clave = 'art32_instrumentos_restringidos') like '%oro, la plata y el platino%',
    'ASERCIÓN 2: la fuente no cita la definición del Art. 3 fr. IX que hace el mapeo';

  -- ── 3. Cada código existe de verdad en el catálogo del SPPLD ──────────
  -- Un código restringido que el catálogo no conoce sería una regla que nunca
  -- se dispara: peor que faltante, porque parece cubierta.
  select string_agg(codigo, ', ') into v_faltan
    from jsonb_array_elements_text(v_codigos) as codigo
   where not exists (
     select 1 from catalogos_sat
      where catalogo = 'instrumento_monetario' and catalogos_sat.codigo = codigo);
  assert v_faltan is null,
    format('ASERCIÓN 3: el catálogo del SPPLD no conoce los códigos %s', v_faltan);

  -- ── 4. Y los tres de metales son los que nombran oro, plata o platino ─
  assert (select count(*) from catalogos_sat
           where catalogo = 'instrumento_monetario'
             and codigo in ('13','14','15')
             and (descripcion ilike '%oro%' or descripcion ilike '%plata%'
                  or descripcion ilike '%platino%' or descripcion ilike '%metales preciosos%')) = 3,
    'ASERCIÓN 4: los códigos de metales dejaron de corresponder a su descripción';

  -- ── 5. El instrumento no se puede anotar sin la restricción prendida ──
  assert (select count(*) from pg_constraint
           where conname = 'instrumento_solo_si_hay_restriccion') = 1,
    'ASERCIÓN 5: falta la restricción que ata el instrumento a la prohibición';

  raise notice 'Art. 32 (efectivo y Metales Preciosos): 5 aserciones en verde.';
end $$;
