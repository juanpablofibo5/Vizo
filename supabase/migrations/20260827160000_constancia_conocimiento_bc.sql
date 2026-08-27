-- VIZO · Migración — La constancia de conocimiento del Beneficiario Controlador
--                    en el expediente de persona física
--
-- FUENTE (✅ DOF, contrastado el 27-ago-2026 contra
-- `regulatorio/dof/acuerdo-115-2026.txt`):
--
--   * Anexo 3, inciso b), numeral iv) — línea 625 del .txt — persona física
--     mexicana o extranjera residente temporal/permanente:
--     «Constancia por la que se acredite que quien realice la Actividad
--     Vulnerable solicitó a su Cliente o Usuaria, información acerca de si
--     tiene conocimiento de la existencia del Beneficiario Controlador, la
--     cual deberá estar firmada por el Cliente o Usuaria de manera autógrafa
--     o bien, mediante Firma Electrónica.»
--   * Anexo 5, inciso b), numeral iv) — línea 663 — la réplica exacta para la
--     persona física extranjera visitante. Una sola fila `persona_fisica`
--     cubre ambos perfiles: el catálogo de VIZO no distingue condición
--     migratoria, y el requisito es idéntico en los dos Anexos.
--   * Obligación marco: Art. 18 fr. III ¶2 de la LFPIORPI (reforma 16-jul-2025,
--     líneas 961–964 de `regulatorio/leyes/LFPIORPI.txt`) — para persona
--     física, «recabar la declaración acerca de si tiene o no conocimiento de
--     la existencia de una persona Beneficiario Controlador».
--
-- VIGENCIA: 30-nov-2026 — Transitorio Primero del Acuerdo 115/2026 (vigencia
-- general de los Anexos reformados). La fila queda inerte hasta esa fecha: la
-- completitud del expediente la empieza a exigir sola ese día, sin deploy.
-- Ese es exactamente el trabajo para el que existe este catálogo.
--
-- POR CONFIRMAR (no bloquea esta fila):
--   * La obligación equivalente EXISTE desde el texto original: Anexo 3 b) iv)
--     de las RCG 2013 con reforma 2014 — «…si tiene conocimiento de la
--     existencia del Dueño Beneficiario, la cual deberá estar firmada por el
--     Cliente o Usuario» (línea 990 de
--     `regulatorio/dof/rcg-historico/rcg-2013-original-sat.txt`; el Art. 3
--     fr. VII original define «Dueño Beneficiario, al Beneficiario
--     Controlador»). Antes de sembrar la fila del periodo ACTUAL falta un solo
--     contraste: que la reforma DOF 30-nov-2020 no haya tocado ese numeral —
--     su texto aún no está en el repo (ver README de `rcg-historico/`).
--   * Qué mecanismo de firma remota cumple el estándar del Código de Comercio
--     — pregunta 07 del paquete al especialista (POR CONFIRMAR-9). Mientras
--     tanto el obligado firma en papel o por su cuenta y sube el documento;
--     VIZO registra la huella, como con el cuestionario de riesgo alto.
--
-- RUNBOOK-02: redactado el 27-ago-2026 (Claude). La doble revisión contra el
-- DOF —quien redacta no es quien aprueba— está pendiente antes de aplicar en
-- producción. El hallazgo viene de la revisión externa RES-11-A
-- (`docs/referencia/orvex-specs-2026-08-27/`).

do $$
declare
  v_actividad uuid;
begin
  select id into strict v_actividad
    from actividades_vulnerables where fraccion = 'V_BIS';

  insert into campos_expediente
    (actividad_id, aplica_a, campo, etiqueta, tipo_dato, obligatorio, validacion, orden, vigente_desde)
  values
    (v_actividad, 'persona_fisica', 'constancia_conocimiento_bc',
     'Constancia firmada: se solicitó información sobre conocimiento del Beneficiario Controlador',
     'documento', true, '{}'::jsonb, 170, date '2026-11-30');
end;
$$;

-- La Fr. XV (prueba de arquitectura) no recibe la fila a propósito: su
-- catálogo está marcado como no contrastado contra el SPPLD y darle campos
-- nuevos verificados mezclaría lo probado con lo provisional. Cuando la
-- Fr. XV se operacionalice, esta fila se replica con la misma fuente.

-- ---------------------------------------------------------------------------
-- Aserción
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from campos_expediente ce
    join actividades_vulnerables av on av.id = ce.actividad_id
   where av.fraccion = 'V_BIS'
     and ce.campo = 'constancia_conocimiento_bc'
     and ce.aplica_a = 'persona_fisica'
     and ce.vigente_desde = date '2026-11-30';

  if v_n <> 1 then
    raise exception 'La constancia de conocimiento del BC quedó con % filas en vez de 1.', v_n;
  end if;
end;
$$;
