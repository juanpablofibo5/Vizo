# VIZO MVP — Plan de 12 semanas

**Versión 1 · 4 de agosto de 2026 · Sesión de planeación con Claude**
Alcance: prototipo de aprendizaje del ciclo mínimo completo PLD para la Fracción V Bis (desarrollo inmobiliario). Las decisiones detrás de este plan están en `DECISIONES.md`; el criterio de aceptación real está en `PRUEBAS.md`.

---

## 1. Presupuesto de horas

- **Arranque:** lunes 10 de agosto de 2026. **Cierre:** domingo 1 de noviembre de 2026.
- **15 h/semana brutas**, que incluyen todo: **~12 h de construcción + 1 h de sesión con Luis + 2 h de estudio/imprevistos**.
- Total: **180 h brutas** (dentro del rango objetivo 155–215).
- Holgura visible: 2 h/semana (24 h) + la semana 11 completa como buffer (12 h) = **36 h de holgura**, el 20% del presupuesto.
- **Regla de hierro:** si una semana necesita más de 15 h para cerrar su entregable, no se extiende el plazo ni se roba tiempo a la siguiente — se aplica la regla de recorte (§3).

La semana del 4 al 9 de agosto es la **semana 0**: homework sin código (descargas del SPPLD, cuentas, accesos). Está al final de este documento.

---

## 2. Calendario semana por semana

Cada semana tiene un entregable que un tercero (Luis) puede verificar en ≤10 minutos corriendo o leyendo algo — nunca "avancé en X".

### Semana 1 · 10–16 ago · Cimientos y Capa 0

**Objetivo:** repo funcionando con el catálogo regulatorio como datos y la bitácora encadenada desde la migración 001. Nada regulatorio nace en código.

| Bloque | Horas |
|---|---|
| Scaffold Next.js + TypeScript estricto + proyecto Supabase propio de VIZO + CI (GitHub Actions) | 4 |
| Migración 001: `tenants`, `sucursales`, `usuarios`, catálogo regulatorio completo (`uma_vigencias`, `actividades_vulnerables`, `umbrales`, `campos_expediente`, `formatos_aviso`, `parametros_motor`), `bitacora` encadenada, y las tablas-esqueleto post-MVP incluyendo las del multi-parte (`personas`, `consentimientos_comparticion` — ADR-15) — todas con RLS | 6 |
| Seed del catálogo: UMA 2025/2026 con vigencias, umbrales Fr. V Bis, parámetros del motor | 1 |
| Extraer campos del XSD de Fr. V Bis (descargado en semana 0) a `docs/campos-aviso.md` con Claude en modo plan | 2 |
| *(la hora extra de la migración sale de la holgura de la semana)* | |

**Entregable verificable:** `pnpm db:migrate` corre en una base limpia; una consulta al catálogo devuelve el umbral de aviso de V Bis vigente hoy; CI en verde en el último push; `docs/campos-aviso.md` existe con la lista de campos del XSD.
**Sesión con Luis:** revisión del modelo de datos (ARQUITECTURA.md) antes de que tenga encima código que lo defienda. Pregunta clave: ¿ves algo en el esquema que nos obligue a migración destructiva después?

### Semana 2 · 17–23 ago · La suite en rojo + vigencias

**Objetivo:** transcribir `PRUEBAS.md` a `tests/umbrales/` — la suite existe antes que el motor — y construir la única parte del motor que la suite necesita primero: resolución de vigencias.

| Bloque | Horas |
|---|---|
| Transcribir todos los casos de PRUEBAS.md a tests ejecutables, fallando explícitamente (no `skip`) | 5 |
| `uma_vigente(fecha)` y resolución de umbral vigente por actividad/fecha, leyendo del catálogo | 4 |
| Recalcular a mano 3 casos de la suite (calculadora, no código) y anotar la aritmética en el test | 2 |
| Holgura de bloque | 1 |

**Entregable verificable:** `pnpm test:umbrales` corre; los casos de vigencia de UMA (enero vs. febrero, frontera 31 ene/1 feb) pasan; todos los demás fallan con mensaje claro. CI en rojo controlado (job del motor marcado `allowed-to-fail` esta semana, nunca después).
**Sesión con Luis:** leer juntos 3 casos de la suite. Si Luis no puede predecir la salida esperada leyendo la entrada, el caso está mal escrito.

### Semana 3 · 24–30 ago · Motor individual

**Objetivo:** evaluación determinista de una operación individual: identificación (siempre en V Bis), aviso individual, restricción de efectivo — con las bases de IVA correctas (Art. 17 sin IVA, Art. 32 con IVA) leídas de la columna `base` del catálogo, jamás de un `if`.

| Bloque | Horas |
|---|---|
| Motor: función pura `evaluar(operacion, configActividad)` — identificación, aviso individual, efectivo, alerta de proximidad | 6 |
| Registro de cada evaluación en `evaluaciones_umbral` (UMA usada, umbrales aplicados, montos considerados, resultado) | 3 |
| Casos de IVA y proximidad en verde; refactor de lo que truene | 3 |

**Entregable verificable:** los casos individuales, de IVA y de proximidad de la suite pasan. `git log` muestra que los tests se escribieron antes que el motor (semana 2).
**Sesión con Luis:** revisión del motor como función pura — ¿la firma `evaluar(operacion, configActividad)` de verdad no sabe nada de V Bis?

### Semana 4 · 31 ago–6 sep · Motor de acumulación → CHECKPOINT

**Objetivo:** acumulación de 6 meses en ventana deslizante: mismo cliente + misma actividad, a través de sucursales, disparo en el momento en que la suma cruza. La ventana (6 meses) y el criterio son parámetros del catálogo, no constantes.

| Bloque | Horas |
|---|---|
| Resolución de identidad: normalización RFC/CURP; extranjero sin RFC → acumulación conservadora por identidad alterna + bandera de revisión humana | 4 |
| Ventana deslizante sobre `operaciones` + integración con el motor; registro de las operaciones acumuladas en la evaluación | 6 |
| Toda la suite en verde; quitar el `allowed-to-fail` de CI | 2 |

**Entregable verificable:** **`pnpm test:umbrales` completo en verde en CI**, incluyendo acumulación cross-sucursal y fracciones independientes. Este es el entregable más importante del proyecto.
**Sesión con Luis:** **checkpoint de ritmo** (§3). Se decide con datos: entregables verificables cerrados de S1–S4.

### Semana 5 · 7–13 sep · Alta de clientes

**Objetivo:** primer módulo de UI: alta de cliente PF y PM con beneficiario controlador (umbral 25%), escribiendo eventos a la bitácora desde el primer INSERT.

| Bloque | Horas |
|---|---|
| Formularios PF/PM + beneficiario controlador; normalización de RFC/CURP al guardar | 6 |
| Auth Supabase + roles admin/capturista aplicados en RLS; dos tenants seed | 3 |
| Prueba negativa de RLS: el usuario del tenant B no puede leer clientes del tenant A (test automatizado) | 3 |

**Entregable verificable:** dar de alta un cliente PM con beneficiario controlador desde la UI en <3 min; el evento aparece en la bitácora con hash encadenado; el test negativo de RLS pasa.
**Sesión con Luis:** revisión de las políticas RLS línea por línea. Es la revisión de seguridad más importante del proyecto; después de esta semana solo se agregan políticas, no se corrigen.

### Semana 6 · 14–20 sep · Expediente documental

**Objetivo:** expediente por cliente con documentos en Storage, hash SHA-256 por documento y completitud calculada contra `campos_expediente` — el catálogo decide qué falta, no el código.

| Bloque | Horas |
|---|---|
| Subida de documentos a Storage + hash SHA-256 calculado y registrado al recibir | 4 |
| Completitud: cruzar documentos/datos capturados contra `campos_expediente` vigentes; estados incompleto → completo → aprobado | 4 |
| Test de ida y vuelta: el hash del archivo descargado = hash registrado (nunca hashear un archivo transformado) | 2 |
| Cruce `docs/campos-aviso.md` vs. modelo de datos: todo campo del XSD tiene columna de origen — lo que falte se corrige AHORA, no en semana 9 | 2 |

**Entregable verificable:** subir un documento → hash visible; quitar un campo obligatorio del seed del catálogo → la completitud del expediente cambia sin tocar código.
**Sesión con Luis:** demo del expediente + revisar el cruce campos-aviso vs. modelo.

### Semana 7 · 21–27 sep · Operaciones + motor en vivo

**Objetivo:** registro de operaciones append-only (timestamp UTC del servidor, corrección = evento nuevo con `corrige_a`) que dispara el motor en cada alta, con alertas visibles.

| Bloque | Horas |
|---|---|
| Formulario de operación + INSERT append-only con `registrado_en` del servidor; vista de operaciones vigentes (excluye corregidas) | 4 |
| Integración: cada operación nueva dispara `evaluar()` y persiste la evaluación; alertas (proximidad, aviso requerido, revisión de identidad) en el panel | 5 |
| Parser CFDI 4.0: arrastrar XML → extrae monto, RFC, fecha, forma de pago **[BLOQUE RECORTABLE]** | 3 |

**Entregable verificable:** reproducir desde la UI el caso de acumulación de la suite (pagos parciales de preventa) y ver dispararse la alerta de aviso por acumulación en el pago que cruza.
**Sesión con Luis:** demo en vivo del ciclo captura → evaluación → alerta.

### Semana 8 · 28 sep–4 oct · Manifiesto y bitácora completa

**Objetivo:** el manifiesto canónico del expediente (sellable a futuro sin rediseño) y la bitácora demostrablemente íntegra y reconstruible.

| Bloque | Horas |
|---|---|
| Manifiesto JSON canónico por versión de expediente: hashes de documentos, metadatos de operaciones, cabeza de la bitácora, versión del catálogo; hash del manifiesto registrado | 5 |
| Verificador de cadena de bitácora + demo de alteración simulada (sobre una COPIA de la base — la bitácora real jamás se toca) | 4 |
| Reconstrucción histórica: "¿cómo estaba el expediente X en la fecha Y?" a partir de la bitácora | 3 |

**Entregable verificable:** correr el verificador → cadena válida; alterar un evento en la copia → el verificador detecta exactamente dónde se rompió; consulta de reconstrucción devuelve el estado histórico correcto.
**Sesión con Luis:** que Luis intente romper la cadena sin ser detectado.

### Semana 9 · 5–11 oct · Pipeline del aviso, parte 1

**Objetivo:** de expedientes aprobados a XML validado contra el XSD oficial. La validación es un paso bloqueante del pipeline: si no valida, no existe.

| Bloque | Horas |
|---|---|
| Agrupar operaciones reportables por tenant + actividad + periodo; generar XML según el XSD vigente en `formatos_aviso` | 6 |
| `pnpm test:xsd`: validación contra el XSD oficial como test bloqueante en CI, con los ejemplos del SAT como fixtures | 4 |
| Informe en cero para periodos sin operaciones reportables | 2 |

**Entregable verificable:** `pnpm test:xsd` en verde: el XML del expediente demo valida contra el XSD oficial descargado del SPPLD. Es el criterio de aceptación más duro del producto.
**Sesión con Luis:** revisar el pipeline y el manejo de errores de validación (¿qué ve el usuario cuando el XML no valida?).

### Semana 10 · 12–18 oct · Pipeline del aviso, parte 2 + roles

**Objetivo:** el flujo humano alrededor del XML: aprobación registrada, acuse, y la separación real admin/capturista.

| Bloque | Horas |
|---|---|
| Flujo de estados del aviso: generado → validado → listo para revisión → aprobado (solo admin, registrado en bitácora) → presentado; registro del acuse que sube el usuario | 5 |
| Roles aplicados de punta a punta: el capturista captura, el admin aprueba; test de que el capturista NO puede aprobar | 3 |
| Fragmentación por límite de 2 MB del SPPLD con numeración de lotes **[BLOQUE RECORTABLE — el diseño queda, la implementación puede ser test en skip]** | 3 |
| Alerta de calendario: fecha límite día 17 del mes siguiente, aviso desde el día 10 | 1 |

**Entregable verificable:** ciclo completo del aviso con dos usuarios de rol distinto; el intento de aprobación del capturista falla y queda demostrado por test.
**Sesión con Luis:** demo del flujo de aprobación con dos sesiones abiertas.

### Semana 11 · 19–25 oct · Buffer + prueba de la Fracción XV

**Objetivo:** semana de holgura estructural. Si todo va a tiempo: la prueba de diseño que valida la arquitectura completa.

| Bloque | Horas |
|---|---|
| Recuperación de atrasos de S5–S10 (si los hay) | 6 |
| **Prueba Fr. XV:** dar de alta arrendamiento SOLO con INSERTs al catálogo (actividad, umbrales 1,605/3,210/3,210 UMA, campos, parámetros) — cero cambios en `src/` — y el caso Fr. XV de la suite pasa | 3 |
| Datos demo completos: desarrollo inmobiliario ficticio con clientes, expedientes y operaciones que ejercitan todos los caminos | 3 |

**Entregable verificable:** `git diff` de la semana no toca `src/` para la Fr. XV — solo seed/migración de datos — y el caso Fr. XV de la suite pasa. Si esto se cumple, el motor es agnóstico de fracción de verdad.
**Sesión con Luis:** revisión del diff de la prueba Fr. XV.

### Semana 12 · 26 oct–1 nov · Demo del ciclo completo y cierre

**Objetivo:** demostrar el ciclo mínimo completo de punta a punta y medir la velocidad real — el insumo del plan de 12 meses.

| Bloque | Horas |
|---|---|
| Guion de demo de 10 min: alta de cliente PM → expediente con documentos → pagos parciales de preventa → alerta de acumulación → aviso XML validado → aprobación admin → bitácora reconstruida | 4 |
| Correr la demo completa frente a Luis; checklist de criterios de aceptación (PRUEBAS.md) marcado caso por caso | 3 |
| Retro escrita: horas reales vs. plan por semana, qué se recortó, velocidad medida (h por entregable) | 3 |
| Actualizar DECISIONES.md y POST-MVP.md con lo aprendido | 2 |

**Entregable verificable:** la demo corre de punta a punta sin trampa; documento de retro con la velocidad real medida.
**Sesión con Luis:** la demo es la sesión.

---

## 3. Checkpoint de la semana 4 y regla de recorte

**La regla es recortar alcance, no extender plazo.** Medición al cierre de la semana 4, con Luis:

- **Ritmo ≥80%** (los 4 entregables de S1–S4 verificables, suite en verde): el plan sigue como está.
- **Ritmo 60–80%** (suite en verde pero con atrasos acumulados): recortes chicos, en este orden:
  1. Parser CFDI (S7, ~3 h) → la captura queda 100% manual
  2. Fragmentación 2 MB implementada (S10, ~3 h) → queda el diseño + test en skip
  3. Reconstrucción histórica en UI (S8) → queda como consulta SQL documentada
- **Ritmo <60%** (la suite NO está en verde al cierre de S4): recorte grande — **la acumulación se degrada a esquema + pruebas en skip**. El motor v1 queda solo individual, las semanas se recorren una posición y la S11 absorbe el resto. Los casos de acumulación de PRUEBAS.md no se borran: quedan en skip como deuda visible.
- La prueba Fr. XV (S11) es **lo último que se recorta**: es la validación de que la arquitectura sirve.

Micro-regla continua: si en cualquier semana el entregable no cierra en 15 h, se aplica el siguiente recorte disponible de la lista — nunca se roba tiempo a la semana siguiente.

---

## 4. Riesgos por fase y señal temprana

### Fase 1 · S1–S4 · Cimientos y motor

| Riesgo | Señal temprana | Respuesta |
|---|---|---|
| Los XSD/instructivos del SPPLD no se descargaron o el portal cambió | Cierre de semana 0 sin archivos en `regulatorio/` | Solo bloquea S6/S9, no el motor. Descargar en S1 sí o sí; si el portal cambió, capturar lo que haya y marcar POR CONFIRMAR |
| Una expectativa de la suite está mal derivada (regla mal entendida) — el motor "pasa" pero calcula mal | Al recalcular un caso a mano, el resultado no cuadra con la salida esperada escrita | La aritmética de cada caso está explícita en PRUEBAS.md; recalcular 3 casos a mano en S2 antes de escribir motor |
| El setup se come las semanas (scaffold, CI, RLS) — el clásico de junior | Cierre de S1 sin la migración corriendo en limpio | La lista de S1 es cerrada; todo lo que no está listado se aplaza sin culpa |

### Fase 2 · S5–S8 · Expediente y operaciones

| Riesgo | Señal temprana | Respuesta |
|---|---|---|
| RLS mal escrita: fuga cross-tenant, o políticas que bloquean todo y se "arreglan" desactivando RLS | El test negativo de S5 pasa cuando no debería, o aparece la service key en código de app | El test negativo es bloqueante en CI desde S5; desactivar RLS nunca es un fix, es un incidente |
| Hash calculado sobre un archivo transformado (recompresión, doble subida) → manifiesto indefendible | El hash del archivo descargado ≠ el hash registrado | Test de ida y vuelta en S6; el hash se calcula sobre el byte stream que efectivamente se guarda |
| Scope creep de UI (pulir en vez de cerrar el ciclo) | Una vista toma >4 h o más de 2 sesiones | La UI del MVP es utilitaria: tablas y formularios. El criterio de calidad es el ciclo, no el diseño |

### Fase 3 · S9–S12 · Aviso y cierre

| Riesgo | Señal temprana | Respuesta |
|---|---|---|
| El XML no valida porque el modelo no capturó campos que el XSD/instructivo exige | En el cruce de S6, campos de `campos-aviso.md` sin columna de origen | Por eso el cruce se hace en S6 y no en S9; lo que aparezca ahí se corrige con 3 semanas de margen |
| Las RCG se publican a mitad del build → XSD y formatos nuevos | La alerta del DOF (semana 0) dispara | NO es refactor: se carga el XSD nuevo en `formatos_aviso` con su vigencia. La demo del prototipo puede validar contra el XSD viejo — es un prototipo de aprendizaje, y absorber el cambio como datos ES la demostración de la arquitectura |
| La S11 se consume en atrasos: sin prueba Fr. XV ni datos demo | Llegar a S11 con >1 entregable pendiente de S9–S10 | Aplicar recortes chicos restantes antes de sacrificar la prueba Fr. XV; la demo de S12 se hace con lo que esté en verde, sin fingir |

---

## 5. Qué llevar a cada sesión con Luis

Patrón fijo de la sesión (1 h): 10 min de demo del entregable verificable · 30 min de revisión de lo más riesgoso de la semana (indicado en cada semana arriba) · 10 min de checkpoint de horas reales vs. plan · 10 min de plan de la semana siguiente.

Las dudas **regulatorias** NO van con Luis: se anotan en `regulatorio/por-confirmar.md` y se acumulan para el especialista PLD (las 3 primeras ya están en DECISIONES.md).

---

## 6. Semana 0 (4–9 de agosto) — homework sin código

1. **Descargar del portal SPPLD del SAT** (Fr. V Bis, página de inmuebles): XSD del aviso, instructivo de llenado, ejemplos de XML, plantilla .xlsm, criterios generales y tabla oficial de umbrales. Guardar en `regulatorio/` con fecha de descarga. **Es lo primero que bloquea todo.**
2. **Crear la organización propia de Supabase para VIZO** (separada de klokk y de cualquier otro proyecto) y el proyecto vacío. Plan Pro (~$25 USD/mes) puede esperar a S1.
3. **Crear el repo privado en GitHub** (cuenta propia) y subir este contenido.
4. **Configurar la alerta de publicación de las RCG en el DOF** (alerta de Google + suscripción al sumario del DOF con "Reglas de Carácter General" + "LFPIORPI").
5. **Agendar la sesión semanal fija con Luis** (misma hora, las 12 semanas).
6. Proyecto en Vercel conectado al repo (puede esperar a S1 si falta tiempo).
