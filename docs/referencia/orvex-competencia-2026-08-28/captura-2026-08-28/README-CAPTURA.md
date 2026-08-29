# Captura fechada de notalia.app y artu.ai — 28-ago-2026

**La evidencia perecedera que ERR-01 §05 marcaba «sin dueño, ~0.5 h, valor total si
se hace hoy»** — hecha el mismo día. Sirve para hacer oponibles ante terceros los
hallazgos de BMK-01/COMP-01 confirmados en `../CONTRASTE.md`.

**Momento de la captura:** 2026-08-29 01:43 UTC (28-ago-2026, 19:43 hora de Mérida —
el propio navegador estampó «8/28/26, 7:43 PM» y la URL en cada página de los PDF).
**Método:** HTML crudo con `curl -sL`; render visual con `chrome-headless-shell`
(Playwright build 1208) — `--screenshot` a 1280×4000 y `--print-to-pdf` con
`--virtual-time-budget=20000`. **Huellas:** `SHA256SUMS.txt` en esta carpeta.

| Artefacto | Qué prueba |
|---|---|
| `notalia-home-2026-08-28.html` | **La pieza central.** El mapeo de fracciones está textual en el HTML servido (ver tabla abajo) |
| `notalia-home-2026-08-28.pdf` | El sitio completo (14 páginas) con fecha/hora/URL estampadas por el navegador; precios $0/$19/$39/$59 y narrativa sin el Acuerdo 115/2026 |
| `notalia-home-2026-08-28.png` | Captura visual del hero y los chips de sectores (las secciones con animación al scroll salen sin pintar — por eso el PDF es la pieza visual completa) |
| `artu-home-2026-08-28.html` | **Cero coincidencias** de «115/2026» en el HTML servido — la ventana del §04.2 de COMP-01, abierta a la fecha |
| `artu-home-2026-08-28.pdf` / `.png` | Render visual de artu.ai el mismo día |

## El mapeo de Notalia, extraído textual del HTML capturado

Cada renglón es texto contiguo en `notalia-home-2026-08-28.html` (etiqueta de
fracción seguida del `<h3>` del sector):

| Notalia publica (textual) | Ley vigente (Art. 17, `regulatorio/leyes/LFPIORPI.txt` desde la línea 551) | Veredicto |
|---|---|---|
| «Fr. X · Notarías y corredurías públicas» | Fr. X es traslado/custodia de valores; la fe pública es la **Fr. XII** | ❌ |
| «Fr. VII · Compraventa de vehículos» | Fr. VII es obras de arte; vehículos es la **Fr. VIII** | ❌ |
| «Fr. VIII y IX · Blindadoras y transporte de valores» | Blindaje es **IX**; la VIII es vehículos y el traslado de valores es la **X** | ❌ |
| «Fr. IV y XIII · Brokers y SOFOM» | La XIII es **donativos** | ❌ |
| «Fr. XV — nueva 2025 · Mediadores» | La XV es **arrendamiento inmobiliario** (la que VIZO tiene sembrada) | ❌ |
| **La Fr. XII no aparece en ninguna parte de su sitio** | Es justamente la de notarías — su vertical insignia | ❌ |
| Fr. VI joyerías · Fr. XIV aduanales · Fr. XVI activos virtuales · V/V Bis inmuebles | Coinciden | ✅ |

**Citabilidad:** estos artefactos hacen el hallazgo oponible con fecha. Antes de
usarlo frente a un cliente o en material comparativo, re-verificar si el sitio sigue
igual (puede corregirse cualquier día) y citar esta captura como «al 28-ago-2026».
