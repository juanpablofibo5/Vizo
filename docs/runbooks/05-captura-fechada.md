# Runbook 05 — Captura fechada de un sitio de terceros

**Para qué.** Hacer oponible un hallazgo sobre el sitio de un competidor o de una
autoridad: lo que publicaba, tal día, con evidencia que se fecha sola. Escrito para
que cualquiera lo ejecute (Q15: el método se le pasa a Grecia para las capturas
trimestrales de A-08).

**Cuándo.** El mismo día del hallazgo — la evidencia es perecedera. Y cada
trimestre para artu.ai (vigilar la aparición del Acuerdo 115/2026, que cierra
nuestra ventana narrativa).

## El procedimiento (≈15 minutos por sitio)

1. **Carpeta.** `docs/referencia/<tema>/captura-AAAA-MM-DD/`
2. **HTML crudo** (la pieza textual):
   ```bash
   curl -sL "https://SITIO" -o sitio-home-AAAA-MM-DD.html
   ```
3. **Render visual** — pantalla y PDF (el PDF estampa fecha, hora y URL en cada
   página, por eso es la pieza visual que vale):
   ```bash
   CHROME="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell"
   "$CHROME" --disable-gpu --virtual-time-budget=20000 --window-size=1280,4000 --screenshot="$PWD/sitio-home-AAAA-MM-DD.png" "https://SITIO"
   "$CHROME" --disable-gpu --virtual-time-budget=20000 --print-to-pdf="$PWD/sitio-home-AAAA-MM-DD.pdf" "https://SITIO"
   ```
4. **Verificar que la afirmación está adentro** (si se captura para probar un texto,
   confirmarlo en el HTML — un sitio con animaciones puede salir vacío en pantalla):
   ```bash
   grep -o "TEXTO BUSCADO" sitio-home-AAAA-MM-DD.html
   ```
5. **Sellar** con huellas y momento:
   ```bash
   shasum -a 256 * > SHA256SUMS.txt && date -u +"%Y-%m-%dT%H:%M:%SZ"
   ```
6. **README-CAPTURA.md** en la carpeta: qué se capturó, cuándo (UTC y hora local),
   con qué comando, y qué prueba cada archivo. Ejemplo completo:
   `docs/referencia/orvex-competencia-2026-08-28/captura-2026-08-28/`.

## Notas

- **Citabilidad:** siempre «al AAAA-MM-DD». Antes de usar la captura frente a un
  tercero, re-verificar si el sitio cambió — la captura prueba lo que publicaban ese
  día, no lo que publican hoy.
- **DOF:** para notas del Diario Oficial no se captura — se descarga el `.doc`/PDF
  oficial (o `&print=true` sobre la URL de la nota da el texto corrido) y se guarda
  en `regulatorio/` con SHA-256, como todo texto normativo.
- **Uso interno:** las capturas de competidores son munición para manejo de
  objeciones, no material de entrega (Q14) — impreso se lee como ataque, y quien
  vende cumplimiento no ataca: cita.
