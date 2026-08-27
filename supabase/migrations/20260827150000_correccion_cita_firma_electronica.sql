-- VIZO · Migración — Corrección de cita: la Firma Electrónica Avanzada es la fr. IX
--
-- El comentario de `cuestionarios_riesgo_alto` (migración 20260823180000)
-- citaba una «fr. VIII Quáter» del Art. 3 del Acuerdo 115/2026 que NO existe.
-- El texto del DOF (líneas 7 y 37–38 de `regulatorio/dof/acuerdo-115-2026.txt`)
-- ADICIONA al Art. 3 las fracciones VIII Bis, VIII Ter, IX Bis y XI Bis a
-- XI Sexties, y REFORMA la fr. IX, que es la «Firma Electrónica Avanzada, al
-- certificado digital que refiere el Código Fiscal de la Federación».
--
-- El razonamiento de ADR-25 no cambia: el ¶3 del Art. 23 Ter 3 pide la Firma
-- Electrónica del Código de Comercio (fr. VIII Ter), no la e.firma. Lo que
-- cambia es la cita — y una cita a una fracción inexistente, en el comentario
-- de la tabla que un tercero puede leer con `\d+`, destruye la credibilidad
-- del resto. Lo detectó la revisión externa RES-11-A (27-ago-2026,
-- `docs/referencia/orvex-specs-2026-08-27/`).
--
-- Las migraciones aplicadas no se editan (convención del proyecto), así que el
-- comentario se reemite aquí completo, idéntico salvo la fracción corregida.

comment on table cuestionarios_riesgo_alto is
  'Art. 23 Ter 3 del Acuerdo 115/2026. Append-only. Las cinco respuestas del '
  'piso son las que el artículo nombra; lo que el Manual añada va en '
  'respuestas_del_manual. La Firma Electrónica del ¶3 se guarda como huella, '
  'no se produce ni se valida: es del Código de Comercio (Art. 3 fr. VIII '
  'Ter), no la e.firma del SAT (fr. IX).';
