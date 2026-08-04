# VIZO MVP — Registro de decisiones de arquitectura

**Formato:** ADR corto — qué se decidió, alternativas descartadas, por qué. Fechados. Una decisión se revierte con un ADR nuevo que la sustituye, nunca editando el viejo.
Las decisiones heredadas del paquete de referencia (`00_PLAN_MAESTRO.md`, `01_ARQUITECTURA_V4.md`, `CLAUDE.md`) no se repiten aquí salvo que este MVP las adopte con matices o se desvíe de ellas.

---

## ADR-01 · La acumulación de 6 meses SÍ entra al MVP — 2026-08-04

**Decisión:** el motor v1 evalúa acumulación completa (ventana deslizante de 6 meses, cross-sucursal, disparo en el momento de cruzar), no solo operación individual.
**Alternativas descartadas:** (a) solo individual con esquema listo; (b) decidirlo en la semana 4.
**Por qué:** en Fr. V Bis la identificación es "siempre", así que **todas** las operaciones de un cliente acumulan, y en preventa inmobiliaria los pagos parciales son la norma — la acumulación es el caso típico, no el borde. Un prototipo sin ella no demuestra la promesa central.
**Válvula de escape:** si al checkpoint de la semana 4 la suite no está en verde (<60% de ritmo), se degrada a esquema + pruebas en `skip` (regla de recorte en `PLAN.md §3`).

## ADR-02 · Captura solo interna; el link público queda fuera — 2026-08-04

**Decisión:** en el MVP solo captura el capturista logueado. El "link mágico" al comprador es post-MVP.
**Alternativas descartadas:** incluir el formulario público con token de un solo uso.
**Por qué:** el link es la superficie pública del sistema y arrastra ~2–3 semanas de trabajo de seguridad (tokens, rate limiting, URLs firmadas, aviso de privacidad) que desplazarían piezas del ciclo mínimo. El modelo de datos no se lo cierra: documentos y expediente no dependen de quién capturó (`POST-MVP.md`).

## ADR-03 · Automatización de captura = parser CFDI 4.0 propio; el LLM queda fuera — 2026-08-04

**Decisión:** la única automatización de captura del MVP es un parser propio del XML del CFDI (extrae monto, RFC, fecha, forma de pago). Sin asistente LLM.
**Alternativas descartadas:** (a) captura 100% manual; (b) asistente LLM para extraer datos de documentos.
**Por qué:** el criterio pedido fue "automatizado, sin mucho costo". El CFDI ya es XML estructurado: parsearlo es determinista, cuesta $0 por operación y ~3 h de build (bloque recortable). Un LLM agrega costo variable por captura y mete datos personales a un tercero — alcance desproporcionado para un prototipo, y roza la restricción "un LLM nunca calcula montos". `operaciones.cfdi_uuid` queda en el esquema desde el día 1.

## ADR-04 · El informe en cero SÍ entra al MVP — 2026-08-04

**Decisión:** el pipeline del aviso genera también el informe en cero para periodos sin operaciones reportables.
**Alternativas descartadas:** dejarlo post-MVP.
**Por qué:** es obligación legal (omitirlo sanciona igual que omitir un aviso), reutiliza el mismo pipeline y estados, y cuesta ~2 h. Es el mejor ratio costo/completitud regulatoria de todo el alcance.

## ADR-05 · Bitácora encadenada desde la migración 001 — 2026-08-04

**Decisión:** `bitacora` (append-only, hash encadenado por tenant, trigger en servidor) nace en la primera migración, y cada módulo escribe sus eventos desde su primer INSERT.
**Alternativas descartadas:** agregarla cuando existan flujos "interesantes" que auditar.
**Por qué:** es la restricción no-retrofiteable por excelencia: una bitácora añadida después no puede probar el pasado. El costo de arrancarla el día 1 es horas; el de retrofitearla es que nunca es completa.

## ADR-06 · Las tablas del esqueleto post-MVP nacen vacías en la migración 001 — 2026-08-04

**Decisión:** `consultas_screening`, `factores_riesgo`, `casos`, `verificaciones_kyc`, `sellos_nom151`, la columna `clientes_finales.nivel_riesgo` y los tipos de aviso `'24h'`/`'modificatorio'` se crean desde el día 1, con RLS, y nadie los escribe en v1.
**Alternativas descartadas:** agregarlos cuando se construyan las features.
**Por qué:** agregarlos después es migración de riesgo sobre datos vivos y regulados; crearlos vacíos hoy es gratis. Regla acompañante: una tabla-esqueleto no genera UI ni código — solo existe.

## ADR-07 · Sin tabla `acumulados` materializada (desviación de Arquitectura v4) — 2026-08-04

**Decisión:** la ventana de acumulación se calcula por consulta sobre `operaciones` en cada evaluación, y el resultado (suma + operaciones incluidas) queda registrado en `evaluaciones_umbral`. No existe la tabla `acumulados` que propone la v4.
**Alternativas descartadas:** tabla `acumulados` como caché mutable por cliente/actividad/ventana.
**Por qué:** un caché mutable es estado que puede divergir de la verdad (las operaciones) y exige invalidación — complejidad y riesgo de calcular con datos viejos. A la escala del MVP la consulta directa es trivial; el registro defendible es la evaluación, no el caché. Si a futuro el volumen lo pide, se agrega como vista materializada sin tocar el motor.

## ADR-08 · El motor es una función pura: `evaluar(operacion, configActividad)` — 2026-08-04

**Decisión:** el motor no consulta la base ni conoce fracciones: recibe la operación (con su historial de ventana) y un snapshot de configuración "as of" la fecha de operación. Un cargador aparte arma ese snapshot desde la Capa 0.
**Alternativas descartadas:** motor con acceso a BD; lógica por fracción con ramas (`if fraccion === 'V_BIS'`).
**Por qué:** es la única forma barata de cumplir la restricción #7 (agregar Fr. XV sin tocar el núcleo) y de probar el motor sin infraestructura. La prueba de diseño X-01 (`PRUEBAS.md`) lo verifica en la semana 11.

## ADR-09 · Hasta los parámetros no-umbral son datos: `parametros_motor` — 2026-08-04

**Decisión:** la ventana de 6 meses, el % de proximidad, el día límite (17) y el día de alerta (10) viven en `parametros_motor` con vigencias — no como constantes.
**Alternativas descartadas:** constantes "razonables" en código para valores "que no van a cambiar".
**Por qué:** la ventana y el calendario son exactamente el tipo de cosa que las RCG pendientes pueden cambiar. La regla "nada regulatorio en código" no admite la excepción "salvo lo que parece estable" — ahí es donde se cuelan los hardcodeos.

## ADR-10 · Manifiesto canónico por versión de expediente; sellado diferido — 2026-08-04

**Decisión:** se adopta la propuesta del plan maestro: manifiesto JSON canónico por versión de expediente (hashes de documentos + metadatos + cabeza de bitácora + versión de catálogo), con hash registrado. El sellado NOM-151 se contrata cuando haya cliente real; `sellos_nom151` espera vacía.
**Alternativas descartadas:** constancia por documento; no diseñar el manifiesto hasta contratar PSC.
**Por qué:** el objeto que se defiende ante la autoridad es el expediente; una constancia por versión hace el costo lineal en expedientes; y diseñar el manifiesto hoy hace que el sellado futuro sea llenar una tabla, no un rediseño. **POR CONFIRMAR-1 con el especialista PLD** (abajo).

## ADR-11 · Roles v1: admin y capturista; el admin ejerce la aprobación tipo REC — 2026-08-04

**Decisión:** dos roles. Las transiciones sensibles (aprobar expediente, aprobar aviso, registrar acuse) son exclusivas del admin y pasan por funciones `SECURITY DEFINER` que validan rol y escriben bitácora en la misma transacción.
**Alternativas descartadas:** rol REC separado desde v1; un solo rol "porque es un tenant demo".
**Por qué:** dos roles bastan para demostrar la separación captura/aprobación (que es lo regulatoriamente relevante) sin el costo de un modelo de permisos completo. Con un solo rol, el flujo de aprobación humana bloqueante sería teatro. Agregar el rol `rec` después es una fila en un enum, no una migración de riesgo.

## ADR-12 · Infraestructura propia y aislada de VIZO — 2026-08-04

**Decisión:** organización de Supabase, repo de GitHub y proyecto de Vercel propios de VIZO, separados de klokk y de cualquier otro proyecto, creados en la semana 0.
**Alternativas descartadas:** reutilizar cuentas/organizaciones existentes "mientras tanto".
**Por qué:** restricción no negociable #6, y lección directa de klokk (proyecto de Supabase a nombre de un tercero = meses de fricción). Es una decisión de cinco minutos hoy.

## ADR-13 · Convenciones de montos y tiempo (adoptadas de CLAUDE.md) — 2026-08-04

**Decisión:** montos `numeric(14,2)` en Postgres y enteros de centavos en TypeScript; nunca `float`. Todo timestamp lo pone el servidor en UTC; el cliente aporta solo `fecha_operacion` (fecha del acto).
**Por qué queda como ADR:** son las dos convenciones cuya violación es silenciosa y corrompe datos regulatorios (un float que pierde un centavo = caso U-03 mal evaluado; un timestamp de cliente = bitácora impugnable).

## ADR-14 · La asesoría semanal es técnica (Luis); lo regulatorio va a una lista para especialista PLD — 2026-08-04

**Decisión:** la sesión semanal con Luis revisa diseño, código y ritmo. Ninguna duda regulatoria se resuelve ahí: se anota en `regulatorio/por-confirmar.md` y se acumula para un especialista PLD.
**Alternativas descartadas:** tratar la sesión como validación regulatoria.
**Por qué:** validar umbrales con un dev senior produce confianza falsa — el tipo de error más caro de este dominio. La frontera explícita evita que "suena razonable" se convierta en fundamento.

---

## POR CONFIRMAR con el especialista PLD (bloquea afirmaciones, no el build)

1. **Sellado del manifiesto** (ADR-10): ¿una constancia NOM-151 sobre el manifiesto con los hashes de todos los documentos satisface la exigencia de fecha cierta, o la autoridad espera constancia por documento?
2. **Identidad de comprador extranjero sin RFC** (caso A-05): ¿qué criterio de identidad resiste una verificación? Mientras tanto el sistema acumula conservadoramente por documento de identidad y escala a revisión humana.
3. **Expediente y umbrales de V Bis:** ¿qué campos son obligatorios más allá de lo que exige el XSD?, y validación formal de la tabla de umbrales/vigencias cargada al catálogo (8,025 UMA, vigencia 1 de febrero, bases de IVA).

Estas tres preguntas ya están redactadas en detalle en `02_FASE_0_PROVEEDORES.md §C`; aquí se listan porque el MVP toma postura provisional en las tres y debe decirse en la demo.
