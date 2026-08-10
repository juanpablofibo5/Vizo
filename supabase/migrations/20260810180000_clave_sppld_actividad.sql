-- ---------------------------------------------------------------------------
-- clave_actividad del SPPLD por actividad vulnerable
-- ---------------------------------------------------------------------------
-- El XSD exige <clave_actividad> dentro de <sujeto_obligado>, y para la Fr. V
-- Bis su `clave_actividad_type` restringe el valor a exactamente "DIN":
--
--     <xsd:pattern value="DIN"/>
--     <xsd:length value="3"/>
--
-- Es dato regulatorio y por lo tanto va al catálogo, no a una constante en el
-- generador (regla dura 1). Cuando entre otra fracción —la XV de arrendamiento
-- es la prueba de diseño de la semana 11— su clave es un INSERT más, y el
-- generador no se entera.
--
-- Fuente: regulatorio/xsd/din.xsd, descargado del SPPLD el 2026-08-04. NO viene
-- del Acuerdo 115/2026, que sigue sin contrastarse contra el DOF (issue #9).

alter table actividades_vulnerables
  add column clave_sppld text;

comment on column actividades_vulnerables.clave_sppld is
  'Clave de tres letras que el XSD del SPPLD exige en <clave_actividad>. NULL mientras no se haya descargado el formato oficial de esa fracción: es la diferencia entre "no lo sabemos" y un valor inventado.';

-- La longitud la fija el propio esquema oficial. Se replica aquí para que un
-- INSERT equivocado muera en la base y no seis pasos después, cuando el XML ya
-- se armó (nivel 2 de la preferencia de CLAUDE.md).
alter table actividades_vulnerables
  add constraint clave_sppld_tres_letras
  check (clave_sppld is null or clave_sppld ~ '^[A-Z]{3}$');

update actividades_vulnerables
   set clave_sppld = 'DIN'
 where fraccion = 'V_BIS';

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from actividades_vulnerables
     where fraccion = 'V_BIS' and clave_sppld = 'DIN'
  ) then
    raise exception 'La Fr. V Bis quedó sin clave_sppld. Sin ella el generador no puede armar <clave_actividad> y ningún aviso valida.';
  end if;

  -- Las demás fracciones se quedan en NULL A PROPÓSITO: sus XSD no se han
  -- descargado. Un valor adivinado produciría un aviso que no valida, y lo
  -- descubriría el sujeto obligado al presentarlo.
  raise notice '✓ clave_sppld: V_BIS = DIN. Las demás fracciones quedan en NULL hasta descargar su formato oficial.';
end $$;
