# Acta de retiro de especificaciones — BORRADOR para firma en sesión

**Fecha de redacción:** 27 de agosto de 2026 · **Estado:** borrador — se firma en la
sesión de revisión con Luis · **Fundamento:** ARQ-01 §06 («tener dos documentos de
diseño vigentes es material de hallazgo»), aplicado a los propios documentos de diseño.

## 1. Qué se retira

Quedan **retirados como documentos de diseño vigentes** — no borrados; archivados en
esta carpeta con el resto de la revisión externa:

| Documento | Última versión | Motivo del retiro |
|---|---|---|
| **ESP-EBR-01** (spec del motor EBR) y su distribución de pesos «SPEC EBR/MER» (30/25/25/20) | previa al 27-ago-2026 | Describe un esquema que no corresponde al construido (`factor_riesgo_catalogo`, `metodologia_version` no existen; los reales son `factores_modelo`, `modelos_riesgo`). Su distribución de pesos quedó sin objeto bajo ADR-21 |
| **EBR-01 v0.1** (matriz de 16 factores núcleo + plantilla sectorial, 100 puntos, 30/20/30/20) | v0.1 | Mismo motivo, y además: proponer factores y pesos desde el software cruza la frontera de asesoría (ADR-21, Respuesta B). La vía para la plantilla sectorial es la configuración de referencia firmada por especialista (issue #32) |

## 2. Qué queda en su lugar

- **El repositorio es la fuente única de verdad del motor**: esquema en
  `supabase/migrations/`, decisiones en `docs/DECISIONES.md` (ADRs), calendario
  regulatorio en `docs/ROADMAP-2027.md`, todo contrastado contra los textos de
  `regulatorio/` con huella.
- **El MER sigue existiendo — como documento del obligado, no de diseño**: se genera
  desde la configuración que el obligado declaró en el sistema (su metodología, sus
  pesos, sus mitigantes), con la misma regla del Manual (ADR-20): cada sección
  acredita con datos o muestra el hueco con su artículo.
- Los hallazgos de la revisión externa que sobrevivieron el contraste están absorbidos
  en los issues **#30** (nivel entidad) y **#31** (absorción de RES-11-A / Addendum A1),
  y en las migraciones `20260827150000` y `20260827160000`.

## 3. Firmas

| | Nombre | Fecha |
|---|---|---|
| Por la revisión externa (autor de los documentos retirados) | JP | |
| Por el repositorio (fuente de verdad del motor) | JP Jr. | |
| Testigo técnico de la sesión | Luis | |
