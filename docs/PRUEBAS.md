# VIZO MVP — Suite de pruebas del motor

**Versión 1 · 4 de agosto de 2026 · Sesión de planeación con Claude**
Este documento existe **antes** que el motor y es el criterio de aceptación real del proyecto. En la semana 2 se transcribe tal cual a `tests/umbrales/`, fallando. El proyecto está terminado cuando todos los casos no recortados pasan en CI.

**Regla:** ningún valor de esta página se escribe como constante en el código del motor. Los tests cargan el **seed del catálogo** (fixtures) y el motor lee de ahí. Las cantidades esperadas están precalculadas aquí, con su aritmética visible, para poder verificarlas a mano con calculadora — si al recalcular un caso no cuadra, el caso está mal y se corrige ANTES de escribir motor.

---

## 0. Fixtures del catálogo (seed de pruebas)

| Dato | Valor | Vigencia |
|---|---|---|
| UMA diaria 2025 | $113.14 | 1 feb 2025 – 31 ene 2026 |
| UMA diaria 2026 | $117.31 | desde 1 feb 2026 |
| Fr. V Bis — identificación | **siempre** | — |
| Fr. V Bis — aviso | 8,025 UMA, base **sin IVA** | — |
| Fr. V Bis — efectivo (Art. 32) | 8,025 UMA, base **con IVA** | — |
| Fr. XV — identificación / aviso / efectivo | 1,605 / 3,210 / 3,210 UMA | (solo para casos A-04 y X-01) |
| Ventana de acumulación | 6 meses (parámetro) | — |
| Umbral de proximidad | 90% del umbral de aviso (parámetro) | — |

Umbrales en pesos, precalculados:

| Umbral | Aritmética | Pesos |
|---|---|---|
| Aviso V Bis con UMA 2026 | 8,025 × 117.31 | **$941,412.75** |
| Aviso V Bis con UMA 2025 | 8,025 × 113.14 | **$907,948.50** |
| Proximidad V Bis 2026 (90%) | 941,412.75 × 0.90 | **$847,271.48** (redondeo a centavo hacia arriba) |
| Identificación XV 2026 | 1,605 × 117.31 | **$188,282.55** |
| Aviso XV 2026 | 3,210 × 117.31 | **$376,565.10** |

Datos demo: tenant "Desarrollos Península" con sucursales **Norte** y **Centro**. Clientes: **CLI-A** (PF mexicana con RFC), **CLI-B** (PM con RFC y beneficiario controlador), **CLI-EXT** (PF extranjera sin RFC, pasaporte US-123456789). Salvo indicación, moneda MXN y forma de pago transferencia.

Toda evaluación, además de su salida, debe registrar: UMA aplicada, umbrales snapshot, parámetros, montos considerados y (si aplica) operaciones acumuladas. Un caso que pasa sin dejar ese registro **no pasa**.

---

## 1. Casos de umbral individual e identificación

### U-01 · Identificación "siempre", sin aviso
- **Entrada:** CLI-A, V Bis, 15 feb 2026, monto_base $200,000.00, IVA $0, transferencia.
- **Esperado:** `requiere_identificacion = true` (V Bis identifica siempre, sin importar monto) · `resultado_aviso = 'no'` · `efectivo_restringido = false` · `alerta_proximidad = false` (200,000 < 847,271.48).

### U-02 · Aviso individual
- **Entrada:** CLI-A, V Bis, 15 feb 2026, monto_base $950,000.00, IVA $0, transferencia.
- **Esperado:** `resultado_aviso = 'individual'` (950,000 ≥ 941,412.75) · `efectivo_restringido = false` (la forma de pago no es efectivo — la restricción del Art. 32 se evalúa sobre pago en efectivo).

### U-03 · Un centavo por debajo → proximidad, no aviso
- **Entrada:** CLI-A, V Bis, 15 feb 2026, monto_base $941,412.74, IVA $0.
- **Esperado:** `resultado_aviso = 'no'` · `alerta_proximidad = true` (941,412.74 ≥ 847,271.48) · `requiere_identificacion = true`.

## 2. Casos de IVA (las tres bases sobre el mismo número)

### V-01 · Art. 17 sin IVA vs. Art. 32 con IVA — divergen
- **Entrada:** CLI-B, V Bis (local comercial), 15 mar 2026, monto_base $900,000.00, IVA $144,000.00 (total $1,044,000.00), **pago en efectivo**.
- **Esperado:** `resultado_aviso = 'no'` — el umbral de aviso se evalúa con la base **sin IVA**: 900,000 < 941,412.75 · `efectivo_restringido = true` — la restricción se evalúa **con IVA**: 1,044,000 ≥ 941,412.75 · `alerta_proximidad = true` (900,000 ≥ 847,271.48).
- Este caso detecta el error clásico: un sistema que use una sola base falla aquí en una dirección o en la otra.

### V-02 · Ambos rebasan (ejemplo tipo SAT)
- **Entrada:** CLI-B, V Bis, 15 mar 2026, monto_base $1,000,000.00, IVA $160,000.00 (total $1,160,000.00), pago en efectivo.
- **Esperado:** `resultado_aviso = 'individual'` (1,000,000 ≥ 941,412.75) · `efectivo_restringido = true` (1,160,000 ≥ 941,412.75).
- **Nota para el pipeline:** el monto que el aviso XML reporta es el **total** ($1,160,000.00), no la base con la que se evaluó. Se verifica en `test:xsd`, no aquí.

## 3. Casos de vigencia de UMA

### G-01 / G-02 · Mismo monto, mes distinto, resultado distinto
- **Entrada G-01:** CLI-A, V Bis, **15 ene 2026**, monto_base $910,000.00, IVA $0.
- **Esperado G-01:** se evalúa con UMA **2025** (los umbrales cambian el 1 de febrero, no el 1 de enero): umbral $907,948.50 → `resultado_aviso = 'individual'` (910,000 ≥ 907,948.50). La evaluación registra uma_valor = 113.14.
- **Entrada G-02:** idéntica pero **15 feb 2026**.
- **Esperado G-02:** UMA **2026**: umbral $941,412.75 → `resultado_aviso = 'no'` · `alerta_proximidad = true` (910,000 ≥ 847,271.48). La evaluación registra uma_valor = 117.31.

### G-03 / G-04 · Frontera exacta 31 ene / 1 feb
- **Entrada G-03:** operación del **31 ene 2026**, monto_base $920,000.00 → UMA 2025, umbral $907,948.50 → `'individual'`.
- **Entrada G-04:** operación del **1 feb 2026**, monto_base $920,000.00 → UMA 2026, umbral $941,412.75 → `'no'` + proximidad.
- Un error de límite (`<` vs `<=` en la vigencia) truena exactamente aquí.

## 4. Casos de acumulación (ventana de 6 meses)

### A-01 · Pagos parciales de preventa — el caso típico de V Bis
- **Entrada:** CLI-A compra un departamento en preventa. Tres pagos, misma sucursal, monto_base $400,000.00 c/u, IVA $0: **15 mar 2026**, **15 abr 2026**, **15 may 2026**.
- **Esperado:**
  - Pago 1: suma ventana = 400,000 → `'no'`.
  - Pago 2: suma = 800,000 → `'no'`, sin proximidad (800,000 < 847,271.48).
  - Pago 3: suma = 1,200,000 ≥ 941,412.75 → **`resultado_aviso = 'acumulacion'` disparado en el pago 3 (15 may), no al cierre de periodo**. `operaciones_acumuladas` contiene los 3 pagos; `suma_ventana = 1,200,000.00`.
  - Los tres pagos entran a la suma porque en V Bis **todas** las operaciones caen individualmente en supuesto de identificación (identificación "siempre").

### A-02 · Ventana vencida — no acumula
- **Entrada:** CLI-A, dos pagos de monto_base $500,000.00: **10 ene 2026** y **10 sep 2026**.
- **Esperado:** ventana de la segunda operación = 10 mar 2026 → 10 sep 2026 (6 meses hacia atrás); el pago de enero queda **fuera**. Suma = 500,000 → `'no'` en ambas. (La de enero además se evaluó individualmente con UMA 2025: 500,000 < 907,948.50 → `'no'`.)

### A-03 · Cross-sucursal — la promesa del producto
- **Entrada:** CLI-B: **1 jun 2026** sucursal **Norte** monto_base $500,000.00; **15 jul 2026** sucursal **Centro** monto_base $480,000.00.
- **Esperado:** la segunda evaluación suma a través de sucursales: 500,000 + 480,000 = 980,000 ≥ 941,412.75 → `'acumulacion'` disparado el 15 jul. Un sistema por sucursal (el Excel) da `'no'` aquí — este caso es el diferenciador.

### A-04 · Fracciones independientes — nunca se suman (requiere fixture Fr. XV)
- **Entrada:** CLI-A en un tenant con V Bis y XV activas: V Bis 20 abr 2026 monto_base $700,000.00 · XV (renta de oficina) 1 abr 2026 y 1 may 2026, monto_base $200,000.00 c/u.
- **Esperado:**
  - XV: cada renta cae individualmente en identificación XV (200,000 ≥ 188,282.55) → acumulan entre sí: 400,000 ≥ 376,565.10 → `'acumulacion'` de **XV** disparada en la renta del 1 may.
  - V Bis: 700,000 solo → `'no'`.
  - **El error que caza este caso:** si el motor sumara fracciones, 700,000 + 400,000 = 1,100,000 cruzaría el umbral de V Bis y dispararía un aviso falso. No debe existir.

### A-05 · Extranjero sin RFC — acumulación conservadora + revisión humana
- **Entrada:** CLI-EXT (sin RFC ni CURP; identidad_alterna = pasaporte US-123456789): dos pagos de monto_base $500,000.00, **1 jun 2026** (Norte) y **1 ago 2026** (Centro).
- **Esperado:** el motor NO asume que son clientes distintos: acumula por identidad alterna → 1,000,000 ≥ 941,412.75 → `'acumulacion'` en el segundo pago · `requiere_revision_identidad = true` en ambas evaluaciones y alerta de revisión de identidad abierta.
- **POR CONFIRMAR con especialista PLD:** el criterio definitivo de identidad sin RFC. Mientras tanto, el comportamiento conservador (sumar y escalar a humano) es el diseño: un falso positivo cuesta minutos; un falso negativo es un aviso omitido.

### A-06 · Proximidad por suma de ventana
- **Entrada:** CLI-A, dos pagos de monto_base $430,000.00: **15 jun 2026** y **15 jul 2026**.
- **Esperado:** suma = 860,000 < 941,412.75 → `'no'`, pero 860,000 ≥ 847,271.48 → `alerta_proximidad = true` en la segunda evaluación (proximidad aplica también a la ventana, no solo a la operación individual).

## 5. Caso de agnosticismo de fracción

### X-01 · Fr. XV solo con configuración (se ejecuta en la semana 11)
- **Precondición:** la Fr. XV se dio de alta **únicamente** con INSERTs al catálogo (actividad, umbrales 1,605/3,210/3,210 UMA, parámetros). `git diff` de ese alta no toca `src/`.
- **Entrada:** renta, XV, 15 feb 2026, monto_base $400,000.00, IVA $0.
- **Esperado:** `requiere_identificacion = true` (400,000 ≥ 188,282.55) · `resultado_aviso = 'individual'` (400,000 ≥ 376,565.10).
- Si este caso exige tocar el motor, la restricción no negociable #7 está rota y es defecto de arquitectura, no de la prueba.

---

## 6. Casos del pipeline del aviso (`test:xsd`, semanas 9–10)

No son del motor, pero son parte del criterio de aceptación:

| # | Caso | Esperado |
|---|---|---|
| P-01 | Generar el aviso del periodo may 2026 (contiene A-01) | El XML **valida contra el XSD oficial** de V Bis descargado del SPPLD. Si no valida, el aviso no avanza de estado. Monto reportado = total con contribuciones |
| P-02 | Periodo sin operaciones reportables (jul 2026 en datos demo) | Se genera **informe en cero** por el mismo pipeline, y también valida |
| P-03 | Aprobación con rol capturista | **Rechazada** por RLS/función de transición; ningún cambio de estado; nada en bitácora salvo el intento fallido si se decide registrarlo |
| P-04 | Aprobación con rol admin | Estado → 'aprobado' y evento `aviso.aprobado` con actor en bitácora, misma transacción |
| P-05 | XML > 2 MB | Fragmentación con numeración de lotes coherente **[RECORTABLE: si se recorta, queda como test en `skip`, nunca se borra]** |
| P-06 | Cadena de bitácora alterada (en una copia de la BD) | El verificador detecta la fila exacta donde se rompió la cadena |

---

## 7. Qué NO prueba esta suite (a propósito)

Screening, nivel de riesgo, casos, sellado NOM-151, aviso 24h y modificatorio: fuera del build del MVP (el esquema los espera — ver `POST-MVP.md`). Si alguien agrega un caso de estos "de una vez", está agregando alcance, no calidad.
