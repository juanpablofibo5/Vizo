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

## ADR-15 · El cumplimiento multi-parte entra al ESQUEMA, no al build — 2026-08-04

**Contexto:** el documento de producto `docs/referencia/VIZO-flujo-multiparte.pdf` define la tesis central de VIZO: una sola venta inmobiliaria genera obligaciones para **hasta tres sujetos obligados** (desarrollador Fr. V/V Bis, inmobiliaria Fr. V, asesor Fr. V/XI). El comprador se captura **una vez**; cada obligado presenta **su propio aviso** con su propia e.firma. *Captura una vez, cumple tres veces, la responsabilidad nunca se consolida.*

**Decisión:** el MVP de 12 semanas **no construye** el flujo multi-parte (sigue siendo un tenant, Fr. V Bis, captura interna), pero la migración 001 incluye las tres piezas que lo hacen posible sin migración de riesgo:

1. **`personas`** — identidad canónica del comprador, cross-tenant, con `clientes_finales.persona_id` (NULL en v1). Es lo que permite que tres obligados apunten a la misma captura.
2. **`consentimientos_comparticion`** — qué persona autorizó a qué tenant, con alcance, fecha y evidencia. Compartir el expediente entre tres entidades exige **consentimiento expreso** bajo la LFPDPPP, y define quién es responsable del tratamiento.
3. **`documentos.persona_id`** (NULL en v1) — para que un documento pueda pertenecer a la captura única y no solo a un expediente de un tenant.

**Alternativas descartadas:** (a) meter el flujo multi-parte al MVP — triplica el alcance y el prototipo dejaría de cerrar el ciclo; (b) dejarlo enteramente para después — separar "persona" de "cliente-de-un-tenant" con expedientes ya cargados es exactamente la cirugía sobre datos vivos y regulados que el esqueleto existe para evitar.

**Costo:** ~1 h en la semana 1, dentro de la holgura. **Regla acompañante:** en v1 `persona_id` siempre es NULL y las tablas están vacías. Cero UI, cero lógica.

**Nota de aislamiento:** `personas` no lleva `tenant_id` (es cross-tenant por definición), así que su RLS **no** puede ser la política estándar: se lee solo si existe un consentimiento vigente que nombre al tenant del usuario. Es la única excepción del modelo y está aquí para que no se implemente por accidente como "tabla sin RLS".

**Confirmación adicional que abre:** qué porcentaje de asesores está realmente dado de alta en el SPPLD por cuenta propia. Si la mayoría opera bajo el RFC de la inmobiliaria, la tercera rama del flujo es mucho más chica de lo que parece — dato de mercado, no de arquitectura, pero cambia la prioridad post-MVP.

---

## ADR-16 · La aplicación escribe como el usuario, no como el dueño de la base — 2026-08-07

**Contexto:** la auditoría de la semana 5 encontró que las **lecturas** de la UI iban por supabase-js con la sesión del usuario (RLS aplicada) pero las **escrituras** iban por `pg` contra `VIZO_DB_URL`, que apunta al rol `postgres`. Ese rol tiene `rolbypassrls = true`: las políticas no se evalúan. Comprobado con el mismo INSERT en un obligado ajeno — como `postgres` escribió; como `authenticated` con el JWT del usuario, `new row violates row-level security policy`.

El efecto de segundo orden era peor que el primero: `app.bitacora_registrar` valida el tenant con `if app.tenant_id() is not null and ...`, y sin JWT `app.tenant_id()` es NULL, así que **la corrección de la auditoría de la semana 1 se saltaba sola** en el único camino de escritura que la aplicación usa. Estaba viva en el smoke test y muerta en producción.

Nada de esto era explotable desde fuera: `tenant_id` sale de `app_metadata` de un JWT verificado por el servidor. Lo que faltaba era la segunda línea de defensa — el nivel 2 del orden de preferencia de CLAUDE.md ("que lo impida la base") era estructuralmente inalcanzable mientras la app fuera superusuario.

**Decisión:** toda escritura pasa por `enTransaccionDeSesion` (`src/persistencia/transaccion.ts`), que dentro de la transacción planta los claims del usuario y ejecuta `set local role authenticated`. A partir de ahí RLS decide y la bitácora valida el tenant, exactamente igual que en `tests/estructura/smoke.sql`.

Además, `altaCliente` dejó de recibir `tenantId` y `actorId` sueltos: los toma de `sesion`. El alta en el obligado equivocado dejó de ser expresable (nivel 1) *y* la base la rechaza (nivel 2).

**Alternativas descartadas:** (a) escribir por PostgREST como las lecturas — no hay transacciones de varios pasos, habría que mover el alta completa a una función SQL y con ella las reglas de validación que hoy viven en TypeScript con sus 21 tests; (b) confiar en que el código siempre pase el `tenant_id` correcto — es el patrón exacto de la regla dura 6.

**Costo:** ~1.5 h dentro de la auditoría. **Deuda que abre:** el rol de la aplicación sigue siendo `postgres` con el privilegio de bajarse a `authenticated`. En producción corresponde un rol propio `vizo_app` sin superusuario y sin BYPASSRLS, para que olvidar el cambio de rol no sea posible en vez de ser detectable. Anotado en `INFRA.md` y en el issue de la semana 7.

**Lo que lo dejó pasar:** `tests/soporte/db.ts` documentaba con toda claridad que los tests corren como `postgres` y que el aislamiento se prueba aparte, en el smoke test. El razonamiento era correcto y cubría los tests. Nadie notó que la aplicación se conectaba igual.

---

## ADR-17 · Los privilegios que Supabase concede por omisión se revocan y se vigilan — 2026-08-07

**Contexto:** la misma auditoría encontró que `truncate bitacora` **funcionaba** para cualquier usuario con sesión, y borraba la bitácora de **todos** los obligados. `DELETE` y `UPDATE` estaban correctamente denegados desde la migración 008; `TRUNCATE` no, porque nunca se concedió en ninguna migración: llega solo. Supabase instala `alter default privileges ... grant D,x,t,m on tables to anon, authenticated, service_role` en el esquema `public` — TRUNCATE, REFERENCES, TRIGGER y MAINTAIN sobre toda tabla nueva, antes de que el proyecto conceda nada. Eran 248 concesiones vivas sobre 31 tablas.

RLS no filtra TRUNCATE y los triggers `for each row` no lo ven, así que las dos defensas del proyecto miraban hacia otro lado. El comentario de la migración 004 —"aplica incluso a service_role y al owner: no existe ruta administrativa que reescriba el historial"— era falso.

**Alcance real:** PostgREST no expone TRUNCATE, así que no se alcanzaba desde la API pública con la llave publicable. Se alcanzaba desde cualquier ruta que ejecutara SQL bajo esos roles. No era una puerta a la calle; era una puerta sin cerradura dentro de la casa, en el cuarto donde se guarda lo único que se defiende ante la autoridad.

**Decisión:** tres capas, en el orden de preferencia de CLAUDE.md — revocar el privilegio de las tablas existentes; revocarlo de los *default privileges* para las que aún no existen; y un trigger `before truncate` en las seis tablas append-only, que aplica también a `postgres` y a `service_role`. Más `app.verificar_privilegios_por_omision()`, que revienta la migración y el smoke test si algo de esto se desanda.

**Por qué la aserción es la parte importante:** el privilegio por omisión vuelve con **cada tabla nueva**. Sin la aserción, la tabla de documentos de la semana 6 nacería otra vez con TRUNCATE para cualquiera con sesión, y nadie lo vería leyendo las migraciones — que es justo lo que pasó aquí.

---

## ADR-18 · La aplicación se conecta con un rol que no puede saltarse RLS — 2026-08-09

**Contexto:** el ADR-16 corrigió el hallazgo de la semana 5 haciendo que toda escritura bajara el rol a `authenticated` dentro de la transacción. Funciona y hay tests que se ponen rojos si alguien lo quita, pero la causa seguía viva: la conexión era del rol `postgres`, con `rolbypassrls = true`. La seguridad dependía de **acordarse** de usar la protección — el nivel 3 del orden de preferencia de CLAUDE.md, que es el último recurso y no el primero.

**Decisión:** un rol propio `vizo_app`, `NOSUPERUSER NOBYPASSRLS NOINHERIT`, miembro de `authenticated`. Dos cadenas de conexión con nombres distintos: `VIZO_DB_URL` (la app) y `VIZO_DB_URL_ADMIN` (migraciones, seed y tests).

**Por qué NOINHERIT, que es la parte no obvia:** heredando, `vizo_app` tendría los permisos de `authenticated` sin pedirlos, y una consulta que olvidara `set local role` funcionaría igual — correctamente filtrada por RLS, pero por accidente. Con NOINHERIT el rol de conexión no puede hacer *nada* por sí mismo, así que el olvido falla ruidosamente. De una capa de seguridad se quiere precisamente eso.

**Comprobado conectándose de verdad como `vizo_app`**, no consultando `pg_roles` —que un rol declare no tener BYPASSRLS y que de hecho no pueda saltarse las políticas son dos afirmaciones distintas, y solo la segunda importa—:

| Intento | Antes (`postgres`) | Ahora (`vizo_app`) |
|---|---|---|
| `select` sin asumir el rol | devolvía los datos de **todos** los obligados | `permission denied` |
| `insert` sin asumir el rol | escribía saltándose RLS | `permission denied` |
| `insert` en el obligado ajeno, por el camino correcto | escribía | lo detiene la política |
| `set role postgres` / concederse BYPASSRLS / leer `auth.users` | — | `permission denied` |

**Alternativas descartadas:** (a) dejarlo como estaba y confiar en los tests de regresión — vigilan que la línea exista, no que alguien escriba una función nueva que no la use; (b) que `vizo_app` heredara de `authenticated` — ver arriba.

**Costo:** ~1 h. **Lo que abre:** en producción hay que cargar la contraseña del rol una vez, a mano, y cambiar `VIZO_DB_URL` del proyecto de Vercel. Anotado en `INFRA.md §5`.

---

## ADR-19 · La compuerta se pospone: se sigue construyendo contra el DOF, no contra el mercado — 2026-08-15

**Contexto:** `ALCANCE.md §3` cerró F1 diciendo que *«cualquier semana adicional de construcción antes del contraste contra el DOF es una semana apostada a que las reglas implementadas son las correctas»*. Era cierto el 12 de agosto. Dejó de serlo tres días después, por dos hechos verificables:

1. **El contraste se hizo.** El Acuerdo 115/2026 está contrastado contra el texto oficial del DOF en lo que tocaba al núcleo: fideicomisos, fecha del acto, consolidación de avisos, y —lo que importaba— **que el Acuerdo no toca el cálculo de umbrales**. Ver `ACUERDO-115-2026.md §0`. Lo que quedó sin resolver está marcado y no se sembró.
2. **La pregunta cara no bloquea el build.** La base del umbral con o sin IVA es la columna `umbrales.base`, que el motor lee (`src/dominio/motor.ts`). La respuesta del especialista cuesta un `UPDATE`, no una reescritura. Bloquea **afirmar** que el número es correcto — que es de lo que trata esta sección, y por eso su título ya decía «bloquea afirmaciones, no el build».

**Decisión:** se construyen las obligaciones **con fundamento verificado en el DOF** antes de levantar las entrevistas. En orden: aceptación del REC (#12, Art. 10), vigencia del expediente (#11, Art. 21) y fecha del acto por fracción (#10, Art. 24 Bis).

**Lo que esta decisión NO dice:** que el riesgo de mercado desapareció. Sigue intacto y ahora se acumula: cada semana de construcción es una semana más apostada a que alguien lo quiera. La diferencia con la apuesta anterior es que **esta es visible y aquella era silenciosa** — una regla mal implementada se descubre en una multa; un producto que nadie quiere se descubre el día que se pregunta, cuando se pregunte.

**Criterio para volver a la compuerta:** cuando el trabajo pendiente deje de tener fundamento citable en el DOF. El primer punto donde eso pasa es el **Manual de Cumplimiento** (Art. 37 Bis): el artículo dice qué debe contener, no cómo debe generarse, y generarlo roza la frontera de «VIZO no da asesoría legal». Esa pieza no se empieza sin decidir la frontera primero.

**Alternativas descartadas:** (a) parar y entrevistar, que era el plan — se pospone, no se cancela; (b) construir el Manual ya, que es la superficie de producto más grande y la de fecha más lejana (1 mar 2027) — se hace después de lo que vence el 30 de noviembre.

---

## POR CONFIRMAR con el especialista PLD (bloquea afirmaciones, no el build)

1. **Sellado del manifiesto** (ADR-10): ¿una constancia NOM-151 sobre el manifiesto con los hashes de todos los documentos satisface la exigencia de fecha cierta, o la autoridad espera constancia por documento?
2. **Identidad de comprador extranjero sin RFC** (caso A-05): ¿qué criterio de identidad resiste una verificación? Mientras tanto el sistema acumula conservadoramente por documento de identidad y escala a revisión humana.
3. **Expediente y umbrales de V Bis:** ¿qué campos son obligatorios más allá de lo que exige el XSD?, y validación formal de la tabla de umbrales/vigencias cargada al catálogo (8,025 UMA, vigencia 1 de febrero, bases de IVA).

4. **⚠️ CONTRADICCIÓN ABIERTA — la base del umbral: ¿sin impuestos o con impuestos?** Es la pregunta más cara de la lista y hay dos fuentes propias en conflicto:
   - `01_ARQUITECTURA_V4.md`, `00_PLAN_MAESTRO.md §1.5`, la skill `umbrales-lfpiorpi` y el prompt de esta sesión: **Art. 17 sin IVA**, Art. 32 con IVA, el aviso reporta el total. Los tres citan el Art. 6 del Reglamento reformado (DOF 27/03/2026).
   - `docs/referencia/VIZO-flujo-multiparte.pdf §7`: *"Reforma al Reglamento del 27 de marzo de 2026. El umbral se calcula con impuestos incluidos. El motor debe sumar IVA, ISAI y accesorios al valor de la operación."* — citando **la misma reforma** para la conclusión contraria. El propio documento marca esto como pendiente de confirmar en el DOF antes de configurar el motor.
   - **Postura provisional del MVP:** se mantiene `sin_iva` para Art. 17 (es lo que dicen tres de las cuatro fuentes y lo que fija el prompt de la sesión). **No es una conclusión legal.**
   - **Por qué no bloquea el build:** la base es la columna `umbrales.base`. Si la confirmación dice "con impuestos", el cambio es cerrar la vigencia e insertar la fila nueva — cero código. Los casos V-01 y V-02 de `PRUEBAS.md` se recalculan cambiando el fixture del catálogo, no el motor. **Esta contradicción es, de hecho, la mejor demostración de por qué la Capa 0 existe.**
   - **Lo que sí hay que hacer desde el día 1** (y por eso está aquí y no solo en la lista de dudas): capturar **ISAI y accesorios como columnas propias** de la operación. Si no se capturan y después se confirma que cuentan, las operaciones viejas no tienen el dato y no hay forma de reevaluarlas. Ver ARQUITECTURA.md §3.3.

6. **¿El portal SPPLD valida estrictamente contra el XSD?** El ejemplo oficial de XML publicado por el SAT para Fr. V Bis **no valida contra su propio XSD** (trae `caractersiticas_desarrollo` donde el esquema declara `caracteristicas_desarrollo`; ver `regulatorio/README.md`). Si el portal es estricto, el ejemplo publicado induce a error a quien lo copie. **Postura del MVP, que no depende de la respuesta:** VIZO genera y valida según el **XSD**, nunca según el ejemplo. Validar más duro que la autoridad no produce avisos rechazados; lo contrario sí.

8. **⚠️ Qué pasa DESPUÉS del primer aviso por acumulación.** Si los pagos 1-3 de una preventa ya dispararon un aviso por acumulación, el pago 4 deja la suma por encima del umbral. Dos lecturas posibles: (a) cada operación nueva que mantiene la suma sobre el umbral se reporta; (b) la ventana se reinicia tras el aviso y solo vuelve a disparar cuando las operaciones no reportadas cruzan el umbral por su cuenta. **El marco no lo resuelve explícitamente.** El MVP implementa (a) por conservador: un aviso de más se corrige, uno omitido se sanciona con 10,000 a 65,000 UMA. Documentado con test en `tests/umbrales/precondiciones.test.ts` para que un cambio de criterio sea deliberado. Encontrado en la auditoría de la semana 4.

5. **Registro real de los asesores inmobiliarios:** qué porcentaje está dado de alta en el SPPLD por cuenta propia (Fr. V/XI) vs. operando bajo el RFC de la inmobiliaria. Define si la tercera rama del flujo multi-parte existe de verdad (ADR-15).

Las preguntas 1–3 ya están redactadas en detalle en `02_FASE_0_PROVEEDORES.md §C`; aquí se listan porque el MVP toma postura provisional en todas y debe decirse en la demo.
