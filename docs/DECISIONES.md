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

## ADR-20 · El Manual: VIZO acredita lo que hace, y deja el hueco de lo que no — 2026-08-16

**Contexto:** el Art. 37 Bis del Acuerdo 115/2026 exige un Manual de Políticas Internas con **catorce** apartados, exigible el 1 de marzo de 2027 (Transitorio Tercero) y dentro de los 90 días naturales del alta (Art. 37). Es la obligación que más sujetos obligados van a tener que resolver a la vez. Y toca de frente la frontera 5 de `ALCANCE.md`: *VIZO no asesora legalmente*.

**Lo que reencuadró la decisión:** al contrastar los catorce apartados contra el sistema, resultó que **VIZO solo puede demostrar siete**.

| Con evidencia verificable | Ocurre fuera de VIZO |
|---|---|
| I identificación · VI avisos · VII conservación · VIII acumulación · XIII confidencialidad · X REC *(parcial)* · XII control interno *(parcial)* | II riesgo · III debida diligencia · IV PEP · V perfil · IX listas · XI capacitación · XIV actualización |

No son dos grados del mismo trabajo: son **dos artefactos distintos**. Uno describe mecanismos implementados y cada frase puede señalar el dato que la respalda. El otro redacta políticas sobre lo que el obligado *debería* hacer, donde no hay evidencia que señalar — solo criterio. Lo primero es documentación técnica del propio producto; lo segundo es asesoría.

**Y el texto abre la puerta para separarlos.** Art. 37, párrafo 2: *«se deberán incluir las **referencias** de aquellos criterios, medidas, procedimientos internos y demás información que […] puedan quedar plasmados en **un documento distinto**»*. El Manual puede citar otros documentos. VIZO no necesita escribir el Manual para producir algo que el Manual cite.

**Decisión.** VIZO entrega **dos piezas**:

1. **La Constancia de mecanismos** — el «documento distinto» del Art. 37 ¶2. Completa, con evidencia verificable: versiones de catálogo, hashes, fechas, cadena de bitácora. Es el entregable terminado.
2. **El índice del Manual** — los catorce apartados. Los siete que VIZO acredita remiten a la Constancia; los otros siete aparecen como **hueco**, con su artículo citado y las preguntas que hay que contestar.

**La regla que hace la frontera verificable, y no una intención:**

> **VIZO no emite una sola frase que no pueda respaldar con un dato del sistema.** Cada sección tiene una consulta de evidencia; si la consulta no devuelve datos, la sección **no genera prosa: genera el hueco**.

Es la regla dura 6 aplicada a un documento en vez de a un cálculo — *nada se afirma en silencio con datos que no cuadran*. Y es comprobable en pruebas: se vacía la evidencia de una sección y se verifica que sale el hueco, no un párrafo.

**Alternativas descartadas:**

- **(a) Manual completo asistido**, con plantillas para los siete de fuera. Es lo que más vendería y cruza la frontera sin ambigüedad: una plantilla que dice qué medidas de debida diligencia aplicar es una recomendación sobre qué es *adecuado*. Además el **Art. 37 Bis 3** permite al SAT ordenar modificaciones al Manual — quien responde es el obligado, pero quien lo redactó sería VIZO.
- **(b) Solo la Constancia**, sin el índice. Más conservador y más barato, pero deja al obligado sin ver que ya tiene la mitad resuelta, y sin saber qué le falta. El índice es precisamente lo que convierte la Constancia en algo accionable.

**Lo que VIZO no hace nunca, aunque se lo pidan:** redactar una política, sugerir el texto de un hueco, clasificar riesgo, decidir qué debida diligencia corresponde, ni firmar el Manual. El hueco se queda hueco.

**Sobre el nombre, que es parte de la frontera:** el entregable **no se llama «su Manual»**. Un obligado que recibe algo llamado Manual lo trata como completo, y lo estaría entregando incompleto ante la autoridad. Se llama Constancia de mecanismos, y el índice dice en su encabezado cuántos apartados faltan.

**Costo:** por estimar. **Lo que abre:** el generador es data-driven sobre el catálogo, así que un apartado nuevo —o uno que VIZO empiece a acreditar cuando se construya el Cap. III Bis— es una fila, no código. Ver `docs/ROADMAP-2027.md`.

---

## ADR-21 · El riesgo: el obligado pone el criterio, VIZO pone el motor y la evidencia — 2026-08-20

**Contexto:** el 1 de marzo de 2027 entran juntos tres capítulos entrelazados — Cap. II Quáter (metodología de Riesgos), Cap. III Bis (grado de riesgo del cliente) y Cap. III Ter (conocimiento del cliente y perfil transaccional). El orden no es negociable por texto: el Art. 23 Bis exige que el modelo de grado sea «coherente con la metodología» del Cap. II Quáter, y el Art. 23 Ter ata las medidas reforzadas al valor «Grado de Riesgo alto» que el Cap. III Bis produce. Contraste completo en `docs/RIESGO-EBR.md`.

**La pregunta:** ¿VIZO puede proponer los factores de riesgo, sus indicadores y sus ponderaciones — o el obligado los configura y VIZO se limita a ejecutar, documentar y conservar?

**Lo que decidió el asunto, y no fue la prudencia:** las dos respuestas construyen **exactamente el mismo software**. El motor que aplica la ponderación, el histórico append-only de cambios de grado, el sistema de alertas por desviación de perfil, los cuestionarios de origen y destino y la compuerta de aprobación de directivo son producto en cualquiera de los dos casos — son ejecución y evidencia, no criterio. Lo único que cambia es **quién llena la tabla de configuración**. Proponer factores no compra una sola función; solo compra la responsabilidad de haber diseñado el modelo con el que se clasifica a una persona.

**Y el texto empuja en la misma dirección.** El Art. 37 ¶2 permite llevar contenido del Manual a «un documento distinto», pero solo de lo que «**por virtud de lo dispuesto en estas reglas**» pueda vivir fuera — no es autorización general. El ¶3 nombra qué es esa cosa, en singular: «se deberá incluir **el diseño de la metodología** a que se refiere el Capítulo II Quáter». En cambio el Art. 23 Bis dice que el modelo de grado «deberá estar establecido **en su Manual**» y el Art. 23 Ter que la política «deberá estar integrada **en el Manual**», ambos sin cláusula alterna. La asimetría de redacción es deliberada: **la metodología puede vivir en un documento de VIZO; el modelo de grado y la política de conocimiento, no.** Aunque VIZO quisiera sustituirlos, la norma no lo admite.

**Decisión.** Respuesta B, con la línea trazada donde es verificable:

> **La estructura que fija la norma es producto. Los valores y las ponderaciones son del obligado.**

VIZO transcribe del Acuerdo lo que el Acuerdo ya fijó —los cuatro elementos mínimos de exposición del Art. 10 Septies 1 fr. I, el piso de tres clasificaciones del Art. 23 Bis, los plazos de reevaluación, la lista de jurisdicciones que publica la UIF— porque eso es catálogo regulatorio con su fuente, igual que un umbral. Lo que **no** entrega es un solo factor, indicador o peso propuesto: la tabla de configuración del modelo **nace vacía** y solo el obligado la llena, con su especialista si lo necesita.

**La regla que hace la frontera verificable, y no una intención:**

> **Si la configuración del modelo está vacía, VIZO no calcula un grado de riesgo: devuelve el hueco.** Nunca un grado por defecto, nunca «bajo» mientras no se configure. Es la regla dura 6 aplicada al riesgo — *nada se calcula en silencio con datos que no cuadran*— y se comprueba en pruebas: se vacía la configuración y se verifica que el motor se detiene con un error accionable, no que devuelve un número.

**La trampa que hay que nombrar, porque va a aparecer en una junta de ventas:** «VIZO trae una plantilla de factores que el obligado puede editar» **es la Respuesta A disfrazada**. Un valor sugerido que nadie cambia se vuelve, en los hechos, la metodología del obligado. Si se prellena, es A. Si nace vacía, es B. No hay punto medio.

**Alternativas descartadas:**

- **(a) VIZO propone factores y pesos.** Cruza la frontera 5 de `ALCANCE.md`: decidir qué hace a un cliente más riesgoso, y cuánto pesa cada cosa, es interpretación normativa aplicada a un negocio concreto — el propio Art. 10 Septies ¶1 amarra la metodología «al contexto de cada Actividad Vulnerable». Y repite el argumento que descartó la alternativa (a) del ADR-20: el **Art. 37 Bis 3** permite al SAT ordenar modificaciones al Manual; respondería el obligado por un modelo que habría diseñado VIZO.
- **(b) Esperar a construir hasta que el obligado configure.** Deja el trabajo entero para después del 1 de marzo. El motor, el histórico y las alertas no dependen de qué factores se elijan: se construyen contra una configuración vacía y se prueban con configuraciones de prueba.

**Costo, dicho sin adorno:** el obligado necesita ayuda para llenar esa configuración con criterio propio, y VIZO **no puede llenar ese hueco con una recomendación** sin volver a (a) por la puerta trasera. Es el mismo hueco que el ADR-20 aceptó en el índice del Manual, y comercialmente es donde entra el despacho — que es justo lo que el material de venta ya dice que VIZO no sustituye.

**Lo que abre:** el esqueleto del ADR-06 **no le queda a este marco** y hay que rediseñarlo, no llenarlo: `nivel_riesgo` es un enum de tres valores fijos donde el Art. 23 Bis pone un piso de tres «y los intermedios que se quieran»; `factores_riesgo` guarda el resultado por cliente y no existe dónde guardar el modelo del tenant que exige el Art. 23 Bis 2; `clientes_finales.nivel_riesgo` es una columna mutable donde hace falta histórico append-only; y `tipo_alerta` no tiene valor para desviación de perfil. Detalle columna por columna en `docs/RIESGO-EBR.md` §3.2. Esas tablas nacieron el 6 de agosto de 2026 y el Acuerdo se publicó el 7: la puerta quedó abierta un día antes de que existiera el marco que debía recibir.

---

## ADR-22 · El Perfil transaccional: el tope lo pone el cliente, y el ¶2 es lo que lo sostiene — 2026-08-21

**Contexto:** el Cap. III Ter (Arts. 23 Ter a 23 Ter 5) entra el 1 de marzo de 2027 junto con los Caps. III Bis y III Quinquies (Transitorio Cuarto). El ADR-21 ya trazó la frontera para el Grado de Riesgo: la estructura que fija la norma es producto, los valores y ponderaciones son del obligado. La pregunta aquí es dónde cae esa misma frontera en el Perfil transaccional, y la respuesta **no es la misma**.

**Lo que decide el asunto es una lectura, no una postura:** el número contra el que se compara no lo pone VIZO **ni el obligado**. Lo pone el **cliente**.

> «deberán considerar […] la información que proporcione cada uno de sus Clientes o Usuarias en ese momento, relativa a los **montos máximos mensuales** de los actos u operaciones que **los propios Clientes o Usuarias estimen realizar**, para determinar su Perfil transaccional inicial, que deberá estar incluido en el sistema de alertas […] con objeto de **detectar inconsistencias entre la información proporcionada por el Cliente o Usuaria y el monto de los actos u operaciones que realice**» — Art. 23 Ter 1 ¶2

El texto nombra el dato (monto máximo mensual declarado), quién lo aporta (el cliente), y qué se hace con él (detectar inconsistencias con lo que efectivamente operó). Comparar dos datos que ya existen no es interpretar. Por eso **la comparación de monto sí es producto**, sin que eso cruce ninguna frontera del `ALCANCE.md`.

**Decisión.**

> **Lo que el cliente declaró es el tope. VIZO compara sin margen, y no propone ningún supuesto de desviación propio.**

Lo que **no** entrega: los «supuestos en que los actos u operaciones se aparten del Perfil transaccional» del Art. 23 Ter fr. IV más allá de esa inconsistencia de monto. Tolerancias, patrones, criterios sobre origen y destino, umbrales de frecuencia. Las columnas para todo eso existen —`frecuencia_esperada`, `zona_geografica`, `origen_recursos`, `destino_recursos`, `actividad_economica`, `otros_elementos`— y **nacen vacías**. El número declarado de operaciones al mes (fr. II) también es nullable: si el obligado no lo recabó, no se compara.

**La trampa, que aquí tiene otra cara que en el ADR-21:** allá era «una plantilla de factores que el obligado puede editar». Aquí es **«un margen de tolerancia del 5% para no llenar de ruido el panel»**. Suena a ergonomía y es criterio de riesgo: quien elige el margen está decidiendo cuánto puede apartarse un cliente antes de que alguien lo mire. Si VIZO lo elige, VIZO puso el criterio. La prueba que lo vigila compara un **centavo** por encima del tope y exige que desvíe; cualquier margen que alguien introduzca la mata.

**La segunda trampa, más silenciosa:** prellenar el monto declarado con lo que el cliente ya operó — «según su historial, unos 480 mil al mes». Eso convierte la declaración en una descripción, y **un perfil que se calcula del historial nunca se desvía de sí mismo**. La pantalla no sugiere ningún monto.

**Lo que hace que todo esto se sostenga, y es el hallazgo del diseño:** el piso de seis meses del ¶2. Sin él, la desviación sería trivial de silenciar — se sube el tope declarado y la alerta desaparece. Con él, **durante seis meses lo declarado gobierna y no se puede sustituir**, y el reloj vive en la base: reevaluar antes de la maduración no es una mala práctica, es una fila que Postgres rechaza. La aserción que lo prueba se llama, precisamente, «se reevaluó el perfil a los dos meses del acto».

**Los tres «seis meses» del Art. 23 Ter 1 no son el mismo plazo.** ¶2 (el perfil inicial rige seis meses) y ¶3 segunda oración (solo se reevalúa a quien operó seis meses antes) son la misma frontera vista desde los dos lados: un parámetro, `perfil_maduracion_meses`. ¶3 primera oración («al menos cada seis meses») es la cadencia: otro parámetro, `reevaluacion_perfil_meses`. Y ninguno comparte fila con `reevaluacion_grado_meses` (Art. 23 Bis 1) ni con `ventana_acumulacion_meses` (Art. 19 de la Ley). Cuatro plazos, el mismo número, cuatro fundamentos: si una reforma mueve uno, los otros no deben moverse solos. El aviso estaba escrito en `docs/RIESGO-EBR.md` §3.1 antes de construir.

**Una figura que el texto no nombra: `correccion`.** El ¶2 obliga a considerar «la información que proporcione» el cliente. Si lo capturado no es lo que dijo —un dedazo—, corregirlo **sirve** al ¶2. Lo que sí lo rodearía es subir el tope para callar una alerta, así que una corrección **hereda la fecha ancla y el vencimiento** de la fila que corrige: compra exactitud, nunca tiempo. Y como todo es append-only, quedan las dos filas con su autor y su razón.

**Y una separación que salió de una restricción de la base, no de una revisión:** «el cliente operó sin que nadie asentara lo que declaró» **no es una desviación** — no hay perfil del cual desviarse. Al principio las dos cosas eran una sola alerta `desviacion_perfil`, y el CHECK que exige `perfil_id` la rechazó. Ceder habría significado volver `perfil_id` opcional, y con eso se perdía la única garantía de que **toda** desviación pueda decir contra qué perfil se desvió. Son dos valores: `desviacion_perfil` y `perfil_ausente`. Se atienden distinto —una se mira, la otra se recaba— y ahora la pantalla puede decirlo.

**Dónde se recaba, y por qué no es un detalle de UI:** en el **formulario de la operación**, no en una pantalla aparte. El ¶2 lo ata al acto («en ese momento»), y la prueba de persistencia lo demostró antes de que fuera una opinión: asentar el perfil después dejaba siempre una alerta espuria sobre el acto que debía anclarlo. Un perfil que se captura después es un perfil que puede no capturarse nunca.

**Alternativas descartadas:**

- **(a) Que el obligado configure el criterio de desviación, como los factores de riesgo.** Sería consistente con el ADR-21 pero contradice el texto: el ¶2 no dice «según los criterios que establezca», dice «detectar inconsistencias entre la información proporcionada por el Cliente y el monto de los actos u operaciones que realice». Dejar esa comparación sin construir, esperando configuración, sería no construir el sistema de alertas que el Art. 23 Ter 2 exige tener.
- **(b) Calcular el perfil del historial en vez de declararlo.** Es la segunda trampa de arriba, y además contradice el ¶2 dos veces: la fuente («la información que proporcione el Cliente») y el momento («en ese momento»).
- **(c) Fusionar el mes del perfil con la ventana de acumulación del Art. 19.** Los dos números serían seis y la tentación es real. Son plazos con fundamentos distintos y `RIESGO-EBR.md` §3.1 ya lo había advertido; además la ventana del Art. 19 es deslizante y se mide desde cada operación, mientras el perfil habla de «montos máximos **mensuales**».

**Dos lecturas que son mías y no del texto, y van a la lista del especialista:** que «mensual» es mes de calendario, y que la comparación se hace contra el **monto total** de la operación (el Art. 6 del Reglamento resuelve la base para el umbral del Art. 17 y para el efectivo del Art. 32, y el Perfil transaccional no es ninguno de los dos). Ambas viven en `src/dominio/perfil-transaccional.ts`, documentadas en su encabezado; cambiarlas es cambiar esa función, no un dato.

**Lo que abre:** el Art. 23 Ter 3 (cuestionarios de origen y destino para riesgo alto, con Firma Electrónica) y el Art. 23 Ter 5 (aprobación de directivo cuando el cliente es PEP **y** de grado alto) siguen sin construirse. Los dos ya tienen de qué colgarse: el grado alto del Cap. III Bis y la declaración PEP del Cap. III Quáter existen.

---

## ADR-23 · La aprobación del Art. 23 Ter 5 no es una compuerta, y su disparador no es un booleano — 2026-08-22

**Contexto:** el Art. 23 Ter 5 cierra el Cap. III Ter. Exige, para operar con quien es Persona Políticamente Expuesta **y, además,** de Grado de Riesgo alto, «obtener la aprobación de un directivo o su equivalente que consienta los actos u operaciones respectivos». Es la última pieza del capítulo que ya tenía de qué colgarse: el grado alto lo produce el Cap. III Bis (ADR-21) y el carácter PEP lo registra el Cap. III Quáter, ambos construidos.

**Dos preguntas de diseño, y las dos las contesta el texto.**

### 1. ¿Impide operar?

No, y no por prudencia. El ¶1 dice «**previamente o con posterioridad** al acto u operación […] detecten». Si esto fuera una compuerta que niega el registro, el caso que el propio artículo relata —enterarse después— sería **inexpresable**: la operación ya ocurrió en el mundo, y lo único que se conseguiría es que no quedara asentada en ningún lado.

> **VIZO registra la realidad y señala el faltante. No la esconde.**

Es el mismo criterio que la regla dura 5 aplicado al revés: allá VIZO no presenta el aviso por su cuenta; aquí VIZO no impide el acto por su cuenta. En los dos casos la decisión con peso legal es de una persona, y lo que el sistema aporta es que quede registrada y que el faltante sea visible.

### 2. ¿El disparador es «PEP && alto»?

No, y esta es la parte que se puede escribir mal sin que nada reviente. La conjunción tiene dos mitades y **cada mitad tiene tres estados**: sí, no, y todavía no se sabe. Un cliente sin declaración PEP no es un cliente que no sea PEP. Un obligado que no ha configurado su metodología de riesgo no tiene clientes de grado bajo: tiene clientes **sin clasificar**.

Colapsar «no se sabe» a «no» devuelve «no se requiere aprobación», que **suena a respuesta y es una omisión** — la regla dura 6 en su forma más cara, porque no lanza ninguna excepción y el número es plausible.

Se resuelve con lógica de tres valores. La tabla, con la celda que sorprende marcada:

| PEP \ ALTO | sí | no | no se sabe |
|---|---|---|---|
| **sí** | EXIGIBLE | no exigible | INDETERMINABLE |
| **no** | no exigible | no exigible | **no exigible** ← |
| **no se sabe** | INDETERMINABLE | **no exigible** ← | INDETERMINABLE |

**Un falso definitivo en cualquiera de las dos mitades cierra la conjunción**, sin importar lo que valga la otra. Si consta que el cliente no es de grado alto, el Art. 23 Ter 5 no le aplica aunque nadie sepa si es PEP. No tapa nada: la declaración PEP que falta es un incumplimiento del Cap. III Quáter que se señala por su cuenta, en su propia sección del expediente.

**Y un solo principio para la caducidad**, del que salen dos casos que parecen asimétricos y no lo son:

> **Que un dato esté vencido nunca reduce la obligación.**

Un grado alto vencido sigue exigiendo la firma —caducar no degrada a nadie—. Un grado no-alto vencido deja de ser un «no» oponible: el Art. 23 Bis 1 declaró viejo ese dato al vencer los seis meses, y sostener un «no se requiere» sobre él sería apoyarse en algo que la norma ya descartó.

**Decisión.**

> **La operación se registra siempre. La exigencia se calcula con los hechos que ya existen y se cita, nunca se copia. Y cuando no se puede saber, se dice que no se sabe.**

En la pantalla eso significa que **nunca aparece «no se requiere aprobación» por falta de un dato**: aparece qué falta, y el formulario **no se ofrece**. Firmar sin saber si era exigible produce evidencia de algo que nadie comprobó.

**Lo que VIZO no decide, y es la frontera de siempre:** quién es «un directivo o su equivalente». Lo dice el Manual —el propio artículo lo remite: «de acuerdo con lo que al efecto se establezca en su Manual de Políticas Internas»—, y el apartado IV del Art. 37 Bis lo pregunta con todas sus letras: *«¿quién autoriza operar con una PEP, y dónde queda esa autorización?»*. **VIZO responde la segunda mitad.** Asienta quién aprobó, con qué cargo, cuándo y sobre qué actos; no valida la facultad, porque la facultad la define un documento que VIZO no redacta (ADR-20).

**Las dos ramas del ¶2 son excluyentes, y no las separa una preferencia:** las separa qué es el obligado. Una persona física no tiene directivos que firmen, y el ¶2 no le ofrece una alternativa cómoda —dice que la constancia **subsana** la aprobación—. Una moral que se emitiera «constancia de motivos» a sí misma estaría saltándose la firma que el ¶1 le exige. Por eso `via` no es un campo del formulario: se deriva de `tenants.tipo_persona`, y un trigger lo hace inexpresable en la base.

**La evidencia se cita por clave compuesta con el cliente.** La aprobación apunta a la declaración PEP y a la evaluación de riesgo que la hicieron exigible. Apuntar a la declaración de una persona y a la evaluación de otra produciría una fila impecable por fuera e indefendible por dentro; con la clave compuesta no es una validación que alguien pueda olvidar llamar, es una fila que no entra.

**Alternativas descartadas:**

- **(a) Bloquear el registro de la operación hasta que exista la aprobación.** Vuelve inexpresable el caso del propio ¶1 (detección posterior) y empuja la operación fuera del sistema, que es el único lugar donde podría quedar asentada. Además el artículo no prohíbe operar: obliga a obtener la aprobación.
- **(b) Tratar el disparador como un `&&` de dos booleanos.** Es la alternativa que ningún test atraparía por accidente: devuelve «no se requiere» donde debía decir «no se sabe». Por eso la prueba que lo vigila recorre la tabla celda por celda, y el primer sabotaje del arnés es exactamente ese cambio.
- **(c) Una tabla de personas facultadas para aprobar, que VIZO valide.** Sería VIZO haciendo cumplir una regla que el Manual define, sobre un apartado que precisamente está marcado como del obligado. Lo que sí queda: quién aprobó y **quién lo registró** son campos distintos, con fecha, y todo append-only. Eso es evidencia; validar la facultad no es de VIZO.

**Una decisión de ruido, dicha para que se pueda discutir:** con la exigencia **indeterminable** no se levanta alerta por operación. Lo que suele causarla —que el obligado no tenga metodología de riesgo vigente— es un hueco único y global, ya señalado en Configuración y en la sección de riesgo del expediente; levantarlo otra vez por cada operación daría N alertas para un solo arreglo, y un panel que nadie mira es peor que uno corto. El hueco se muestra en el expediente, con lo que falta. Si en la práctica resulta que se pasa por alto, la corrección es alertar una vez por cliente, no una por acto.

**Lo que abre:** del Cap. III Ter quedan el **Art. 23 Ter 3** (cuestionarios de origen y destino para riesgo alto, con Firma Electrónica, que es evidencia y no texto libre) y el **Art. 23 Ter 4** (medidas reforzadas: cónyuge y dependientes económicos para personas físicas, accionistas verificados contra la Secretaría de Economía para morales, y documentación adicional para PEP extranjeras).

---

## ADR-24 · El expediente es la puerta: las cinco secciones de conocimiento del cliente viven detrás de él — 2026-08-22

**Contexto:** la página del expediente tiene un retorno temprano. Cuando el cliente existe pero **no tiene expediente abierto**, la pantalla muestra solo su nombre y un botón «Abrir expediente». Detrás de ese retorno quedaron, una tras otra según se construyeron, cinco secciones: revisión anual (Art. 21), Grado de Riesgo (Cap. III Bis), Perfil transaccional (Cap. III Ter), aprobación para operar (Art. 23 Ter 5) y declaración PEP (Cap. III Quáter).

**Se anotó como «accidente» dos veces y no lo es.** Lo que empezó como el orden en que se fueron pegando las secciones resultó tener un fundamento, y conviene escribirlo antes de que alguien lo «arregle»:

> **En la Fracción V Bis se integra expediente de cada aportante, sin importar el monto.** Abrirlo no es un paso opcional que se pueda posponer: es la primera obligación, y precede a todas las demás.

Las cinco secciones son **conocimiento del cliente**, y el conocimiento del cliente se asienta *en su expediente*. Ofrecer la clasificación de riesgo, el perfil transaccional o la aprobación de directivo sobre alguien que todavía no tiene expediente sería ofrecer construir el segundo piso antes que el primero — y peor, produciría filas colgando de un cliente cuya identificación nadie ha empezado a integrar.

**Decisión.** Se queda como está, y ahora por escrito:

> **El expediente abierto es la precondición de las cinco secciones de conocimiento del cliente. La pantalla de «Abrir expediente» no es un error de layout: es la puerta, y dice cuál es el siguiente paso.**

**Lo que sí cambia, y es lo que motivó escribir esto hoy:** esa pantalla es un **estado vacío**, y los estados vacíos son uno de los cuatro territorios donde el naranja de marca entra (decisión de identidad del 16-ago). Hoy es una línea de texto y un botón. Que sea la puerta de todo lo demás significa que tiene que decirlo: qué se integra, por qué precede al resto, y qué se desbloquea al abrirlo. Se rediseña en la sesión de diseño, no antes.

**Alternativas descartadas:**

- **(a) Mover las secciones arriba del retorno.** Haría capturables un Grado de Riesgo y un Perfil transaccional sobre un cliente sin expediente. El Art. 23 Ter fr. IV liga el perfil a «la revisión y actualización del expediente de identificación»: sin expediente, esa liga no tiene a dónde apuntar.
- **(b) Mostrarlas deshabilitadas, con un candado.** Suena amable y enseña cinco cosas que no se pueden hacer en la pantalla de alguien que solo necesita hacer una. La versión honesta de un candado es decir qué lo abre, y para eso basta la puerta.

**Lo que abre:** cuando existan las secciones del Art. 23 Ter 3 y 23 Ter 4, serán **siete** detrás de la misma puerta. El patrón de sección del expediente se diseña para siete, no para cinco.

---

## ADR-25 · El cuestionario del Art. 23 Ter 3: tres lecturas del texto que decidieron el modelo — 2026-08-23

**Contexto:** el Art. 23 Ter 3 es el último pendiente grande del Cap. III Ter junto con las medidas reforzadas del 23 Ter 4. Tiene **tres párrafos** y cada uno pide otra cosa: el ¶1 pide mayor información sobre la **actividad preponderante** y monitoreo más estricto; el ¶2 pide **cuestionarios de identificación** sobre el **origen y destino de los recursos** y sobre los actos «que realicen o que pretendan llevar a cabo»; el ¶3 dice que puede aplicarse por vía remota, «los cuales en todo caso deberán contener la **Firma Electrónica** de quien los suscribe».

**Decisión.** Se construye como registro con evidencia, append-only, atado por FK compuesta a la evaluación de riesgo que lo exigió. Tres lecturas del texto lo decidieron, y ninguna es obvia:

**1. «Firma Electrónica» no es la e.firma del SAT.** El propio Acuerdo define las dos por separado en su Art. 3: la **fr. VIII Ter** es «Firma Electrónica» —datos electrónicos que identifican al suscriptor y prueban que aprueba el contenido, «conforme al **Código de Comercio**»— y la **fr. IX** es «Firma Electrónica **Avanzada**», que sí es «el certificado digital que refiere el Código Fiscal». El ¶3 pide la primera.

*Corregido el 27-ago-2026: esta línea citaba una «fr. VIII Quáter» que **no existe** — el Acuerdo ADICIONA al Art. 3 las fracciones VIII Bis, VIII Ter, IX Bis y XI Bis a XI Sexties, y REFORMA la IX, que es la Firma Electrónica Avanzada (líneas 7 y 37–38 de `acuerdo-115-2026.txt`). El razonamiento no cambia; la cita sí. Lo detectó la revisión externa RES-11-A. El mismo error vive en dos comentarios de la migración `20260823180000` —incluido un `COMMENT ON` que quedó en la base— y las migraciones aplicadas no se editan: queda pendiente una migración correctiva que reemita ese comentario.*

Cambia la frontera: si pidiera la avanzada, VIZO no podría tocarla (`ALCANCE.md` §0.3). Al ser la del Código de Comercio, el cliente puede suscribir sin certificado del SAT. Aun así **VIZO no produce ni valida la firma**: calcula y registra la huella SHA-256 del archivo firmado, igual que hace con el acuse del SPPLD. Si un mecanismo concreto alcanza el estándar del Código de Comercio es pregunta jurídica → **POR CONFIRMAR-9**.

**2. La Firma Electrónica la exige la vía remota, no el cuestionario.** El «los cuales» del ¶3 se refiere a «los medios digitales o electrónicos», no al cuestionario en abstracto. Un cuestionario aplicado en persona y firmado de puño y letra ya tiene una firma autógrafa y el artículo no le pide otra. Por eso la modalidad es una columna y el CHECK ata la evidencia de firma **solo** a `remoto_digital`. Exigirla también en el presencial sería inventar una obligación — y eso cuesta lo mismo que omitir una.

**3. El artículo no da plazo de vigencia, así que el sistema no inventa ninguno.** No dice cada cuánto se repite el cuestionario ni cuándo caduca. Lo que sí dice es a quién se aplica: a los catalogados de Grado alto «así como a los Clientes nuevos clasificados como tal». Por eso el cuestionario **cita** la evaluación que lo motivó, y cuando el cliente se reclasifica el sistema dice **«sobre otra clasificación»** —un hecho— y nunca «vencido», que sería una regla que nadie promulgó. Si una reclasificación obliga a repetirlo → **POR CONFIRMAR-10**.

**Lo que la base hace inexpresable** (diez aserciones en la migración): un cuestionario citando una evaluación que no clasificó alto; citando la evaluación de otro cliente; remoto sin Firma Electrónica; con «pendiente» escrito donde va una huella; con media evidencia de archivo; con una respuesta del piso en blanco; aplicado antes de la clasificación que lo motiva; y editado o borrado después de asentado.

**Un error propio, registrado porque volverá a tentar:** el trigger de coherencia nació `deferrable initially deferred`, copiando el patrón de la declaración PEP sin preguntarse si aplicaba. Ahí el diferimiento es necesario —la coherencia depende de vínculos que se insertan después—; aquí no, porque el cuestionario cita una evaluación que ya existe. Diferirlo tenía un costo real: el error llegaba en el commit y no en el INSERT. Lo delató la aserción 2, que pasó cuando debía morir.

**Alternativas descartadas:**

- **(a) Que VIZO proponga las preguntas.** El ¶2 dice «conforme a su **Manual de Políticas Internas**». Mismo criterio del ADR-21 con los factores de riesgo: VIZO pone el registro y el piso que el artículo nombra; el obligado pone el criterio. Lo que pregunte de más vive en `respuestas_del_manual`.
- **(b) Una sola columna «origen y destino».** El artículo los nombra juntos pero son dos hechos, y el ¶2 además distingue los actos que el cliente **realiza** de los que **pretende** — dos tiempos verbales, y lo que pretende es lo único de todo el capítulo que mira hacia adelante. Cuatro columnas, no una.

**Lo que abre:** del Cap. III Ter queda solo el Art. 23 Ter 4. La sección 06 del expediente dejó de decir «Por construir»; queda la 07.

## ADR-26 · Las medidas reforzadas del Art. 23 Ter 4: la fracción se deriva, y el artículo no alcanza a todos — 2026-08-23

**Contexto:** el Art. 23 Ter 4 cierra el Cap. III Ter. Tiene tres fracciones que **no son tres opciones**: la I (personas físicas) y la II (personas morales) son excluyentes, y la III (PEP extranjeras) se apila sobre la que toque.

**Decisión.** Registro append-only atado por FK compuesta a la evaluación de riesgo que lo exigió, con dos tablas —las medidas y las personas del inciso b)—. Cuatro lecturas lo decidieron:

**1. La fracción no se elige: la decide la clase de persona.** Se deriva de `clientes_finales.tipo_persona` y no se ofrece como campo, igual que la `via` del Art. 23 Ter 5. Un capturista que pudiera marcar «fracción II» sobre una persona física produciría una fila coherente por fuera e indefendible por dentro. La base lo verifica además en un trigger: la aplicación ya no lo ofrece, y eso es la primera línea, no la única.

**2. El artículo nombra dos clases de persona y el sistema tiene cuatro.** `tipo_persona` admite además `fideicomiso` y `figura_juridica`, y el Art. 23 Ter 4 **no las nombra**. No se les asigna fracción por parecido: el enum tiene dos valores y para esos clientes **no se puede asentar nada**. La pantalla lo dice —el cliente ES de grado alto, así que algo hay que hacer, pero el texto no lo alcanza— y va a **POR CONFIRMAR-11**. Dejarles asentar «medidas de la fracción II» fabricaría evidencia de cumplir una regla que quizá no existe, que es peor que el hueco.

**3. «Debiendo consultar» no admite lectura opcional.** La fr. II obliga a consultar los registros electrónicos de la Secretaría de Economía para confirmar los datos del cliente, así que sin esa consulta la fracción no está cumplida y su fecha es `not null` para toda fila de fr. II. Pero **la consulta la hace el obligado, no VIZO**: automatizarla convertiría a VIZO en quien afirma que los datos coinciden, que es la misma frontera que impide descartar una coincidencia de screening (regla dura 5). VIZO registra que se hizo, cuándo, qué arrojó y la huella del acuse.

**4. La fr. III se apila y sube el listón sobre las mismas personas.** «Obtener, **además** de los datos a que se refiere el presente artículo, la **documentación**» del Cap. III respecto de las personas de la fr. I inciso b). Por eso las personas vinculadas son **una** tabla con dos niveles —datos y documentación— y no dos tablas: es el mismo conjunto de gente visto con dos exigencias. Y que el cliente sea **PEP extranjera se deriva** de que tenga un vínculo PEP catalogado con ámbito `extranjero`: no se teclea, y cambia solo cuando corren los dos relojes del Art. 23 Quáter.

**Lo que el inciso b) NO exige, y costó leer bien:** dice «obtener, **en su caso**, los datos […] **en los términos que al efecto prevean en su Manual de Políticas Internas**». Es doblemente condicional, así que VIZO **no** exige que haya personas registradas — exige que alguien haya **decidido** si las hay. La ausencia sin decisión es un olvido disfrazado de cumplimiento; la ausencia con decisión es una postura registrada.

**Lo que la base hace inexpresable** (once aserciones): una fr. II sin la consulta a la Secretaría de Economía; una fracción que no corresponde a la clase de persona; un fideicomiso bajo cualquier fracción; una fila que afirme campos de las dos fracciones; una PEP extranjera sin la documentación adicional; una persona del inciso b) sin documentación cuando la fr. III aplica; medidas sobre una clasificación que no fue alta; y editar o borrar lo asentado.

**Un contraste con el ADR-25 que vale registrar:** allá el trigger de coherencia nació diferido sin motivo y hubo que quitarlo. Aquí el de la fr. III **sí** tiene que ser `deferrable initially deferred`, porque las personas vinculadas se insertan **después** de la medida en la misma transacción y comprobarlas en el INSERT diría siempre que faltan. El patrón no se copia: se decide caso por caso.

**Lo que abre:** el Cap. III Ter queda completo, y las siete secciones del expediente existen de verdad — ninguna dice ya «Por construir». `rielPorConstruir` se eliminó por lo mismo.

## ADR-27 · El segundo nivel de la fr. II entra como método nuevo, no como cambio del viejo — 2026-08-24

**Contexto:** al revisar qué faltaba del Cap. II Quáter apareció que `ROADMAP-2027.md` decía «nada construido» y era **falso**: la fr. I del Art. 10 Septies 1 estaba desde el ADR-21. Lo que sí faltaba era más preciso: la segunda oración de la fr. II, la fr. III completa y el párrafo final.

**La decisión que gobierna todo lo demás:** la fr. II pide dos niveles de valor —uno por indicador y, «a su vez», uno por elemento— y el motor solo tenía el primero. Añadir el segundo a `suma_ponderada` habría **movido el puntaje de todos los clientes ya clasificados** sin que nadie lo decidiera: el modo de falla de la regla dura 6 en su forma más cara, porque el número nuevo seguiría siendo plausible.

> **El segundo nivel entra como un MÉTODO DE MEDICIÓN NUEVO —`suma_ponderada_por_elemento`— que el obligado declara.** El motor ya sabía detenerse ante un método que no conoce; ahora conoce dos. Un modelo que siga en `suma_ponderada` no se rompe: simplemente no acredita la segunda oración de la fr. II, y eso se enseña como hueco.

Una prueba fija explícitamente que el puntaje del método viejo no cambió (40 + 15 sigue siendo 55).

**Tres decisiones menores que valen escribirse:**

1. **Sin el valor de un elemento, el motor se detiene; no supone 1.** Suponer sería VIZO decidiendo la importancia de un elemento de la metodología ajena. Y cero **sí** es una respuesta válida —el obligado diciendo que ese elemento no describe su exposición—, así que distinguir `0` de `undefined` es el punto.
2. **El desglose enseña los dos pesos, no el producto.** Un «87.5» sin decir qué parte vino del indicador y qué del elemento no se puede reproducir dos años después, que es lo que el Art. 41 fr. IV exige poder hacer.
3. **Un peso de elemento negativo no se acepta.** Un elemento que RESTA riesgo no es un peso: es un mitigante, y la fr. III le da su propia tabla.

**La pieza de más valor no es ninguna tabla: es la cobertura.** `coberturaDeLaMetodologia` responde, con hechos consultables y sin interpretar nada, cuáles de las cuatro exigencias del artículo tienen respaldo en lo configurado. Es el criterio del ADR-20 aplicado a la metodología: se acredita lo que se puede demostrar con un dato del sistema, y lo demás sale como hueco con su fundamento. Lo que **no** hace es juzgar si la metodología es buena — eso es del especialista (ALCANCE §0.5).

Dos celdas de esa cobertura concentran el riesgo de acreditar de más, y las dos tienen prueba y sabotaje:

- **Guardar los pesos por elemento no basta si el método no los aplica.** Un peso que la aritmética ignora es un número decorativo, no «utilizar un método que asigne valores».
- **El párrafo final exige POR ELEMENTO Y POR DELITO.** Un indicador de 400 Bis en geografía no cubre a 139 Quáter en geografía ni a 400 Bis en los otros tres elementos. Son **ocho** celdas.

**Alternativas descartadas:**

- **(a) Migrar los modelos vigentes al método nuevo con peso 1 por elemento.** Habría dejado el puntaje intacto y acreditado la fr. II sin que el obligado asignara ningún valor — evidencia de cumplir algo que nadie decidió.
- **(b) Hacer configurable la lista de delitos.** El párrafo final nombra dos artículos del Código Penal Federal y no hay un tercero que el obligado pueda añadir. Es un enum de dos valores; lo configurable es qué indicador se relaciona con cuál.

**Lo que abre:** del Cap. II Quáter quedan las dos exigencias del Art. 10 Septies que arrastran al Manual — que la metodología esté descrita en él, y la reevaluación previa a nuevos productos o canales (¶3). Y el Manual es donde `ALCANCE.md` dice que la compuerta de viabilidad vuelve a mandar.

## ADR-28 · La evaluación de ENTIDAD: el riesgo del propio obligado, en su propia escala — 2026-08-29

**Contexto.** La Ley separa dos objetos de evaluación y VIZO solo tenía uno: el Art. 18 fr. VII exige «identificar, analizar, entender y mitigar **sus** Riesgos, así como los de las personas Clientes o Usuarias», y la fr. XI cuelga de esa evaluación el tipo de auditoría anual. Los Arts. 44 y 45 del Acuerdo cierran el círculo: dictamen **interno permitido** cuando el riesgo del obligado sea bajo o medio «de conformidad con la metodología prevista en el Capítulo II Quáter», **auditor externo independiente certificado por la UIF** cuando sea alto. Es el hallazgo real de la revisión externa ARQ-01 §02 (28-ago), verificado contra el texto primario el mismo día, y la única parte del producto con un número en pesos pegado. Las posturas de JP del cuestionario de cierre (28-ago) fijaron la escala de efectividad y la prioridad; la sesión con Luis **valida contra lo construido** — con las tablas todavía vacías, ajustar es una migración sin datos.

**Decisión.** Cinco piezas de forma, cero de criterio:

1. **`evaluaciones_entidad`, append-only y separada del per-cliente.** Los dos objetos que la Ley separa viven en tablas separadas. La fila guarda la base de información que la norma nombra (Art. 10 Septies 2 fr. II: total de clientes, operaciones y monto, de un periodo no menor a doce meses — con los tres casos del texto: año completo, parcial desde el inicio de la actividad [Transitorio Segundo ¶2], o **datos proyectados**), el camino completo en `detalle`, y un vencimiento derivado del catálogo (`reevaluacion_entidad_meses` = 12, Arts. 10 Septies 2 ¶3 / 10 Septies 3).
2. **El grado de entidad vive en la escala del obligado.** Los Arts. 44/45 hablan de bajo/medio/alto «de conformidad con la metodología» — la suya. `grados_riesgo.es_alto` ya dispara las obligaciones reforzadas de cliente; aquí dispara también la auditoría externa. No se inventó una segunda escala ni un mapeo.
3. **Los mitigantes reducen la entidad, nunca el grado de un cliente** (la Opción B de ARQ-01 §04, la que JP recomendó): el score individual queda intocado y las compuertas de cliente siguen indiluibles por construcción — la Opción C quedó descartada con el argumento de ARQ-01: abriría el hueco del tenant que se declara mitigación para bajar grados.
4. **La escala de efectividad es ordinal y se gana con papeles** (postura de JP, 28-ago): `niveles_efectividad` por versión de modelo — número fijo de niveles, cada uno con su **evidencia documental exigible**, monótona con el orden, congelada con el modelo, **sin porcentaje continuo** («una efectividad de 73% es precisión falsa y es lo primero que pica un auditor»). Los valores y los cortes los declara el obligado; VIZO no siembra ninguno (ADR-21). El mitigante declara su nivel por FK compuesta al **mismo modelo**, y `evidencia_ref` dice dónde vive el papel.
5. **El método de entidad se declara, como el de medición**: `modelos_riesgo.metodo_entidad`, con `residual_por_elemento` como único método que el motor sabe ejecutar — residual = Σ por elemento de (valor declarado − mitigación declarada, **sin bajar de cero**). El tope por elemento es estructura, no juicio: una exposición negativa no es una exposición, y sin el tope un elemento sobre-mitigado abarataría a los demás.

**La regla dura 6, en su caso más caro hasta ahora:** un mitigante **sin nivel declarado detiene la evaluación** — contarlo como cero sería VIZO decidiendo que las políticas del obligado no mitigan nada; ignorarlo, que mitigan sin decir cuánto. Y el residual es un CHECK de la base (`residual_es_la_resta`): no existe la fila donde el residual no sea la resta.

**Lo que se rechazó:**
- **(a) Una segunda escala para la entidad.** Habría exigido un mapeo entidad→auditoría que alguien tendría que decidir; `es_alto` ya existe y ya es del obligado.
- **(b) La aprobación humana adicional sobre la evaluación.** La fila es append-only y corre bajo un modelo que el obligado **ya aprobó** con nombre y hora; quien la corre queda asentado (`evaluado_por`, solo admin por política). Si la sesión decide exigir un segundo acto, es una tabla nueva de aprobaciones — nunca una mutación de la fila.
- **(c) Calcular el inherente desde los totales del periodo.** La norma exige *considerar* esos datos, no una aritmética sobre ellos; inventarla sería metodología de VIZO. Se registran con la evaluación como base acreditable, y el inherente sale de los valores por elemento que el obligado declaró (fr. II, segunda oración — ADR-27).

**Frontera comercial, escrita aquí porque JP la pidió escrita:** VIZO **nunca** dice que baja el grado ni que evita al auditor. VIZO produce **la evidencia auditable que sostiene el grado que arroje la metodología del obligado.**

**Fijado con:** aserciones en la migración `20260829150000` (escala monótona y congelada, nivel del mismo modelo, residual como resta, append-only, solo contra vigente, privilegios declarados) y `tests/persistencia/entidad.test.ts` (motor puro + punta a punta, incluido el tope estructural y el hueco que no escribe).

## ADR-29 · El MER se emite, no se descarga — y solo del modelo vigente — 2026-08-29

**Contexto.** El benchmark del 28-ago lo dijo con todas sus letras: ninguno de los siete competidores declara el MER como **artefacto entregable, versionado y aprobable** — todos construyen scoring, ninguno la evidencia de que el scoring fue diseñado, aprobado y revisado. La acción A-06 lo pidió como eje del pitch, y la pregunta del verificador que el documento contesta es la de BMK-01: «¿por qué este cliente quedó en riesgo medio en marzo de 2027, con qué metodología, aprobada por quién, y puedes reconstruirlo?».

**Decisión.** El MER hereda la doctrina completa de la Constancia (ADR-20):

1. **Emitir es un acto**: el texto (Markdown — se hashea, se diffea, se lee en veinte años) se congela en `mer_emitidos` con su SHA-256, quién y cuándo, y un resumen que cuadra por CHECK. Dos emisiones idénticas del mismo día son el mismo documento. El Manual lo referencia por fecha y huella (Art. 37 ¶2).
2. **Solo del modelo vigente** — trigger propio: un MER de un borrador documentaría, con el nombre del obligado, una metodología que nadie aprobó.
3. **Cada afirmación cita su respaldo, y la cobertura no se re-decide**: la sección del Art. 10 Septies 1 viene de `coberturaDeLaMetodologia` (ADR-27), la misma función que pinta la pantalla. Donde falta configuración hay un pendiente con su artículo — incluida la evaluación de entidad ausente (Art. 18 fr. VII) y los mitigantes sin nivel (ADR-28).
4. **La evaluación de entidad citada es la del modelo vigente**: citar la de una versión anterior le colgaría a esta metodología un resultado que no produjo.

**Ocho secciones**: gobierno y versiones · fr. I · fr. II · fr. III · ¶ final (la matriz 4×2 de los delitos) · escala de grados · evaluación de entidad con su consecuencia de los Arts. 44/45 escrita · cobertura. La sección de cobertura **resume** las no acreditadas sin repetir sus faltas — repetirlas haría parecer el doble de pendientes (lo cazó una prueba, no una revisión).

**Fijado con:** aserciones en la migración `20260829200000` y `tests/persistencia/mer.test.ts` (composición pura con huecos contados, emisión congelada con huella verificada, dedupe del mismo día, append-only).

## ADR-30 · El screening: detecta de más, resuelve el humano, y la consulta es un acto con snapshot — 2026-08-29

**Contexto.** Decisión Q3 del cuestionario de cierre (issue #34): las cuatro listas públicas al sprint — OFAC SDN, la consolidada de la ONU, el 69-B del CFF y la LPB — con PEP como dependencia comercial aparte. El esqueleto esperaba desde la migración 001 con la resolución humana en CHECK; activarlo era las listas, el matching y los guardias.

**Decisión.** Cinco piezas:

1. **Las listas son catálogo GLOBAL y versionado**: cada descarga es una fila con fecha, hash del archivo fuente y conteo (runbook 06, cargadas por backoffice con el rol de catálogo — la app solo lee). La consulta **snapshotea** qué versión de cada lista usó.
2. **Sin las cuatro vigentes, la consulta se detiene** nombrando las que faltan (regla dura 6): «sin coincidencias» sobre lo que no se miró sería el silencio más caro del producto.
3. **El matching detecta de más y resuelve el humano**: una sola normalización (`app.normalizar_para_screening` — **distinta** de la de identidad de la semana 4, que tiene sus propios dependientes — con su espejo TypeScript y una prueba de paridad que los compara), trigramas con índice sobre un **umbral OPERATIVO** del catálogo cuya fuente dice con todas sus letras que no proviene de ninguna norma, y RFC exacto donde la lista lo trae (69-B, con la situación a la vista del humano).
4. **La consulta nace pendiente y la resolución es un acto irreversible con razonamiento** (≥ una oración), de un admin, que atiende la alerta en el mismo movimiento. Nacer resuelta, descartar sin razonamiento, re-resolver o editar la evidencia son inexpresables por trigger. Toda consulta escribe — el folio limpio también es evidencia.
5. **Parsers puros con las mañas escritas donde muerden**: OFAC (`-0-` como vacío; los alias de `alt.csv` NO se cargan aún y el runbook lo dice), 69-B (encabezado flotante, latin1), genérico para la vía provisional de ONU/LPB con el hash del convertido declarado. Un parser que truena ante formato cambiado es el comportamiento correcto.

**Lo que se rechazó:** compuertas automáticas por coincidencia (una tipología es señal, no certeza — y descartar o confirmar es del humano, regla dura 5); un umbral cableado en código (decisión versionada en catálogo); y cargar ONU/LPB a medias (peor que no cargarlas).

**Fijado con:** aserciones en la migración `20260829230000` y las pruebas de `tests/catalogo/listas-screening.test.ts` + `tests/persistencia/screening.test.ts` (paridad de normalización, las cuatro exigidas, snapshot, RFC exacto, folio limpio, resolución única).

## ADR-31 · El Cap. XII: lo que acredita es la CONSTANCIA, y el primer periodo lo fija el catálogo — 2026-08-31

**Contexto.** El Art. 39 Bis pide capacitación anual a nueve papeles del obligado sobre cinco temas, impartida por quien acredite cinco años de experiencia; el 39 Bis 1 le cuelga la evaluación, la constancia, diez años de conservación y —en su ¶3— una obligación **distinta**: capacitar de manera previa o simultánea al ingreso al área. VIZO no puede impartir la capacitación: la fr. III pide una persona con experiencia acreditada. Lo que sí puede es contestar, cualquier día del año, quién falta.

**Decisión.** Seis piezas:

1. **La cobertura cuenta CONSTANCIAS, no asistencias.** El ¶2 ata la constancia a una evaluación satisfactoria, así que es lo único que acredita. Contar asistencias diría que basta con sentarse en la sala. En la base es inexpresable lo contrario: `constancia_exige_evaluacion_satisfactoria`.
2. **El ¶3 se reporta APARTE de la cobertura anual.** Son dos obligaciones y mezclarlas en un marcador dejaría a quien entró en noviembre viéndose cubierto por un curso de marzo al que no fue. Alcanza solo a los papeles que la frase nombra —atención al público y administración de recursos—, no a los nueve.
3. **La plantilla es la del artículo, no la de la aplicación.** El enlace a `usuarios` es opcional: el consejo de administración tiene que capacitarse y normalmente no entra al portal. Quien deja el área se da de **baja**, no se borra: quien estuvo parte del año cuenta para ese periodo completo, y borrarlo cambiaría hacia atrás la respuesta a «quién faltaba».
4. **El periodo lo fija el catálogo, no la pantalla.** Antes del primer periodo del Transitorio Séptimo no hay nada que acreditar y la base lo rechaza (`anio_desde_el_primer_periodo`), así que la pantalla trabaja sobre el primer periodo real y no ofrece un formulario que solo podría fallar. Los tres plazos —periodicidad, años de experiencia y retención— salen de `parametros_motor` con su fuente: la regla dura 1 vale también para este capítulo.
5. **Se registra lo impartido, no lo programado.** Una sesión fechada en el futuro se rechaza: su lista de asistencia sería de gente que no fue.
6. **Cero de cero no es cumplimiento.** Con la plantilla del periodo vacía la pantalla dice «nadie en la plantilla del periodo» y no «toda la plantilla acredita» — y por eso el dominio expone `personasEnElPeriodo`, que no se deduce de `personasFaltantes`.

**Lo que se rechazó:** contar asistencias como acreditación; poner la pantalla dentro de Configuración (capacitar es un acto periódico, no un ajuste que se hace una vez — el mismo criterio que ADR-28 para el riesgo de la entidad); y una guarda `sesiones.length > 0` en `acreditado`, que resultó lógica muerta: los temas salen de las sesiones, así que sin ninguna los cinco faltan y la conjunción ya da falso.

**Asimetría conocida:** las tres tablas de evidencia —programas, sesiones y asistencias— bloquean `DELETE` por trigger; la plantilla no, porque también sirve para corregir un alta equivocada. Un borrado desde la base cambiaría la cobertura de un periodo cerrado. No es alcanzable desde el producto (la pantalla solo ofrece baja) y queda anotado aquí para no descubrirlo dos veces.

**Fijado con:** las 13 aserciones de la migración `20260831100000`, `tests/clientes/capacitacion.test.ts` (dominio, 17 casos) y `tests/persistencia/capacitacion.test.ts` (base real, 16 casos: el mínimo de años leído del catálogo, la constancia sin evaluación, la sesión de otro año, la futura, la evaluación de otro obligado que no pasa en silencio y la baja que no borra el pasado).

## ADR-32 · El Cap. III Quinquies: lo que se guarda es el PROCEDIMIENTO, y el orden lo impone la base — 2026-09-02

**Contexto.** El motor del Beneficiario Controlador existía desde el 20-ago-2026 —`src/dominio/beneficiario-controlador.ts`, con el orden de prelación del Art. 23 Quinquies, el control efectivo del 23 Quinquies 1 y sus pruebas— y **nada lo importaba**. `docs/BENEFICIARIO-CONTROLADOR.md` §5 traía el modelo de datos en papel, marcado «NO es una migración». Esto lo construye.

**Lo que decide el modelo no es el 25%**, es el párrafo de cierre, que aparece dos veces —una por régimen— casi palabra por palabra: «deberán documentar el **procedimiento seguido** […], conservar la información […], mantenerlos actualizados durante la vigencia de la Relación de negocios y resguardarlos en términos del artículo 18, fracción IV de la Ley». Guardar quién ganó no cumple ninguno de los cuatro verbos.

**Decisión.** Seis piezas:

1. **Se asienta el camino, no el resultado.** Una fila por **cada fracción evaluada**, no solo por la que resolvió, con el motivo obligatorio cuando no encontró a nadie. Eso es lo que demuestra que la fr. I y la fr. II se agotaron antes de caer en la III — y sin ello «llegué por la fracción III» es indistinguible de un atajo.
2. **El orden es irrompible desde el esquema.** Un trigger inmediato rechaza una fracción cuya anterior no quedó sin resultado, y también continuar después de que una encontró. La pantalla, en consecuencia, **no tiene selector de fracción**: se capturan insumos y el motor decide.
3. **La identidad NO se duplica.** El diseño en papel (§5.3) ponía los datos de la persona en una tabla hija nueva; aquí el hallazgo **apunta** a `beneficiarios_controladores`, que ya es el sujeto de `consultas_screening`. Mover la identidad habría dejado dos respuestas posibles a «quién es el Beneficiario Controlador de este cliente». Es una desviación deliberada del documento.
4. **El umbral y su BORDE salen del catálogo y se congelan en la fila.** Dos parámetros, no uno: parametrizar el 25 y dejar el `>=` en el código es la mitad de la regla escrita en código igual. En 25.00% exacto la lectura del Art. 23 Quinquies fr. I («o más», sobre capital) y la del Art. 3 fr. IV b) ii) de la Ley («más del», sobre voto) dan respuestas opuestas. El snapshot va en la identificación porque una determinación de 2027 tiene que poder reconstruirse en 2029.
5. **Reidentificar sustituye, nunca edita.** «Mantenerlos actualizados» solo se puede demostrar si la anterior sigue entera. Un índice parcial garantiza una sola vigente por cliente; el UPDATE está acotado por trigger a `vigente → sustituida` y nada más.
6. **La excepción del Art. 23 Quinquies 2 se registra, no se deduce.** La de bolsa exige la clave de pizarra que el texto condiciona con «siempre que». `anexo_7a` y `anexo_7bisa` existen en el enum y **ninguna regla los llena**: el texto de esos anexos no está contrastado, y decidir por regla que un cliente cae en ellos sería sembrar una fuente que nadie leyó.

**Lo que se rechazó:** ensanchar `beneficiarios_controladores` con más columnas (no hay dónde poner un camino en una fila); dejar que el capturista elija la fracción; y cablear el descenso del Art. 23 Quinquies 1 ¶2 como un árbol en memoria — se aplana en identificaciones encadenadas, igual que el Anexo 2 Bis para el fideicomiso anidado.

**Un número que se fue:** `PARTICIPACION_BENEFICIARIO_PCT = 25` vivía en `src/dominio/clientes.ts`. Ninguna función lo leía —solo una prueba afirmaba que valía 25—, y eso es lo que lo hacía peligroso: el día que alguien lo usara para comparar, compararía contra un número sin vigencia y sin fuente.

**Fijado con:** las 12 aserciones de la migración `20260902100000`, `tests/persistencia/beneficiario-controlador.test.ts` (14 casos) y seis casos de riel. Dos de esas pruebas existen **solo** en la persistencia y no pueden estar en la migración: el disparador de coherencia es DIFERIDO y el bloque de aserciones revierte antes del COMMIT, así que ahí nunca llegaría a dispararse.

## ADR-33 · Las alertas del Art. 41 fr. V cuelgan del ACTO, no del cliente — 2026-09-02

**Contexto.** El `ROADMAP-2027.md` daba el Cap. XIII por casi vacío («III no · IV no · V no»), y su columna era anterior a media docena de capítulos ya construidos. Contrastadas las seis funciones contra la base, el único hueco real de la fr. V eran dos de sus cuatro supuestos.

**Lo que decide el diseño es la preposición.** El texto dice «alertas respecto de aquellos **actos u operaciones que se pretendan llevar a cabo CON** Clientes o Usuarias de Grado de Riesgo alto, Personas Políticamente Expuestas […]». No pide una alerta al clasificar a alguien: pide una por cada acto con esa clase de cliente. Por eso se levantan desde `registrarOperacion`, en la misma transacción, como la desviación de perfil — y dos operaciones del mismo cliente alto levantan **dos** alertas.

**Decisión.** Cinco piezas:

1. **Dos tipos, no uno.** Se atienden distinto: el riesgo alto pide medidas reforzadas y cuestionario; el PEP, aprobación de directivo y seguimiento. Un solo tipo obligaría a leer el `detalle` para saber qué hacer.
2. **Cada alerta nombra su hecho, y la base lo exige.** `cliente_riesgo_alto` no existe sin la evaluación del Cap. III Bis que clasificó, ni `cliente_pep` sin la declaración del Cap. III Quáter — mismo principio que ya obliga a `desviacion_perfil` a decir contra qué perfil se desvió.
3. **El vencimiento se mide contra la FECHA DEL ACTO, no contra el reloj.** La vista `clientes_riesgo_vigente` calcula `vencida` con `now()`, que contesta «¿está vencida hoy?». Para una alerta que habla de un acto, lo que importa es si la clasificación seguía viva ese día: registrar hoy una operación de hace tres meses no debe teñirse con el calendario de hoy. Y cuando ya había vencido, el tono sube a granate por el canal `por`, el mismo que usa `efectivo_restringido`.
4. **El PEP solo alcanza a personas físicas**, porque la declaración del Cap. III Quáter solo existe para ellas y la base lo impide para una moral. Si el Beneficiario Controlador de una moral es PEP, el texto no lo dice con todas sus letras: es pregunta para el especialista, y hasta que se conteste no se inventa aquí una alerta que el artículo no pide.
5. **El cuarto supuesto —países o jurisdicciones— NO se construye.** La regla es citable; la LISTA no está en el Acuerdo, que remite a «la legislación mexicana» y a lo que determinen autoridades y organismos internacionales. Sembrar jurisdicciones sin contrastar su fuente es lo que la regla dura 1 prohíbe, y una alerta que no dispara sobre la lista correcta es peor que ninguna: tranquiliza.

**Un error que corrigió una prueba.** El módulo afirmaba en su docstring que el caso «no se sabe si es alto o PEP» ya lo cubría `aprobacion_directivo_pendiente`. **Es falso**: esa alerta solo nace cuando la exigencia es `exigible`; con `indeterminable` devuelve `null`. Hoy ese hueco se ve en el riel del cliente pero no llega a la bandeja de alertas. Queda escrito en el código y fijado por una prueba que lo documenta, para que el día que se decida cerrarlo se sepa que el cambio fue a propósito.

**Fijado con:** las 6 aserciones de `20260902160100`, `tests/persistencia/alertas-art41.test.ts` (9 casos) y 4 de vocabulario. Los tipos del enum van en una migración aparte (`20260902160000`) porque Postgres no deja usar un valor de enum en la misma transacción que lo crea.

## ADR-34 · El Art. 39 Bis 2: se acredita la declaración, no la honorabilidad — 2026-09-03

**Contexto.** El Cap. XII quedó al 90% el 31-ago: faltaba su segundo artículo, con fecha propia (Transitorio Sexto: nuevas contrataciones desde el 1-mar-2027). Contrastado contra el DOF el 3-sep (líneas 439–443 y 748).

**El artículo pide tres cosas y solo una es de VIZO.** El ¶1 manda *establecer procedimientos de selección* que garanticen calidad técnica, experiencia y honorabilidad; el ¶3 manda tener *medidas* para cuando alguien deje de tenerlas, y las manda al Manual. Las dos son del obligado — VIZO no juzga honorabilidad. Lo único acreditable con un dato es el ¶2: que exista la **declaración firmada**, con fecha, diciendo lo que el texto manda que diga.

**Decisión.** Cuatro piezas:

1. **La declaración se guarda tal como se firmó, incluso en falso.** Las tres negativas de la fr. II van en columnas separadas y **ninguna tiene CHECK que la obligue a ser verdadera**. Es la excepción razonada a «hacer el error imposible»: quien declara con verdad que sí fue sentenciado produce un hecho real que el obligado necesita para aplicar las medidas de su ¶3. Rechazar esa fila empujaría a no registrarla, o a mentir en el formulario. La cobertura la reporta aparte, como declaración que no satisface la fracción.
2. **Hizo falta una fecha nueva: `fecha_contratacion`.** No sirve `ingreso_al_area` —la que el Art. 39 Bis 1 ¶3 ata a la capacitación—: alguien contratado en 2020 puede entrar a atención al público en 2027 sin ser una contratación nueva. Son dos hechos distintos.
3. **Sin esa fecha la respuesta es «no se sabe», no «no aplica».** Lógica de tres valores, y `acreditado` exige que no queden indeterminadas: con una sola persona sin fecha, decir «cubierto» afirmaría algo sobre gente de la que no se sabe si entra.
4. **Comparte la plantilla del Cap. XII.** Son la misma gente vista por dos artículos, y dos padrones darían dos respuestas a «quién trabaja aquí».

**Lo que se rechazó:** un CHECK que rechace la manifestación en falso (ver 1); un padrón propio de personal; y derivar la exigibilidad de `ingreso_al_area`, que habría contado como nueva contratación a quien solo cambió de área.

**Fijado con:** las 9 aserciones de la migración `20260903100000`, `tests/clientes/seleccion-personal.test.ts` (13 casos de dominio) y `tests/persistencia/seleccion-personal.test.ts` (11 contra la base real).

## ADR-35 · El piso del Art. 12 fr. VII: dos catálogos, y ninguno repite al otro — 2026-09-03

**Contexto.** Identificar al Beneficiario Controlador (Cap. III Quinquies, ADR-32) no cierra la obligación: el Art. 12 fr. VII manda además **recabar sus datos**. El barrido del mapa lo había dado por desbloqueado diciendo que el Anexo 3 estaba transcrito; al ir a construirlo resultó falso — el encabezado está, el inciso a) viene elidido, y de los cuatro numerales que el artículo cita solo el i) tiene texto.

**Decisión.** Cuatro piezas:

1. **Dos catálogos, y ninguno repite al otro.** Cuáles numerales se exigen sale de `parametros_motor` —ese párrafo sí está verbatim en el DOF, línea 163, con su «en todos los casos»—. Qué dice cada numeral **no se siembra**: ya vive en `campos_expediente` desde el 30-ago, transcrito del RCG histórico y con su propio `PENDIENTE: contraste directo contra el DOF`. Repetirlo habría creado una segunda verdad sobre el mismo Anexo, que es exactamente cómo se desincronizan dos catálogos.
2. **El mapeo numeral → columna vive en código, y se dice por qué.** Qué significa el numeral ii) lo dice el catálogo; en qué columna guardamos nosotros esa respuesta es presentación, no regulación. Y un numeral que el módulo no sepa leer **se detiene** en vez de darse por cubierto o por faltante: las dos respuestas serían inventadas.
3. **El ix) se cumple con CURP *o* con RFC.** El numeral los nombra juntos y condicionados —«cuando cuente con ellas»—, así que exigir los dos sería inventar un requisito que el texto no pone.
4. **El piso se reporta, no se impone.** Las columnas nuevas son nulables y la fila de identidad se guarda sin ellas. Bloquearla empujaría a no registrar el hallazgo del Art. 23 Quinquies mientras se consiguen los datos, y se perdería el procedimiento entero — que es lo que más cuesta reconstruir dos años después.

**Los dos regímenes del artículo, que no son el mismo:** el ¶1 pide los datos del Beneficiario Controlador de un cliente **persona física** «en caso de que […] cuente con dicha información»; el ¶2 los pide de un cliente **persona moral o fideicomiso** «en todos los casos». Este piso evalúa el segundo, que es el incondicional y el que alcanza a los clientes del Cap. III Quinquies.

**Fijado con:** las 6 aserciones de la migración `20260903140000`, `tests/clientes/piso-beneficiario.test.ts` (6 casos) y cuatro casos nuevos en las pruebas de persistencia del capítulo.

## ADR-36 · El Art. 32 no es solo de efectivo: también de Metales Preciosos — 2026-09-03

**Contexto.** Al contrastar el Cap. XIII contra el código, la fr. VI del Art. 41 —«Monitoreo de uso de efectivo y **metales preciosos**»— aparecía como «parcial: el umbral existe». Lo que estaba parcial no era el monitoreo: era la prohibición.

**El hallazgo.** El motor derivaba la restricción de `forma_pago = '01'` y nada más. El texto dice otra cosa:

> «Queda prohibido […] liquidar o pagar […] mediante el uso de **monedas y billetes**, en moneda nacional o divisas **y Metales Preciosos** […]» (Art. 32 ¶1 de la LFPIORPI)

y el **Art. 3 fr. IX** de la misma Ley define «Metales Preciosos, al **oro, la plata y el platino**». Un pago de dos millones en oro pasaba como operación normal, sin la alerta granate que sí levantaba el mismo monto en billetes. El dato entraba —el formulario captura `instrumento_monetario` y la fila lo guardaba— y el motor no lo miraba. No reventaba: calculaba de menos.

**Decisión.** Cinco piezas:

1. **Los códigos restringidos van al catálogo, no al código.** `art32_instrumentos_restringidos` = `["1","13","14","15"]`, con una fuente que cita las **dos** normas: el Art. 32 ¶1 que prohíbe, y el Art. 3 fr. IX que define qué es un Metal Precioso. Con esas dos, el mapeo contra el catálogo del SPPLD no interpreta nada.
2. **Basta con que UNA de las dos declaraciones lo diga.** `forma_pago` e `instrumento_monetario` son dos respuestas del capturista sobre el mismo pago. Exigir que coincidan dejaría de detectar el efectivo declarado solo por forma de pago; mirar solo el instrumento perdería todo lo capturado antes. Ante una **prohibición**, detectar de más y que lo mire un humano es el error barato — el mismo criterio del screening (ADR-30).
3. **El booleano conserva su nombre y gana un acompañante.** `evaluaciones_umbral.efectivo_restringido` es append-only y hay evidencia histórica apuntándole; renombrarlo reescribiría el pasado. Lo que se agrega es `instrumento_restringido`, para que un booleano llamado «efectivo» que ahora también se prende con oro no sea el cajón único que el ADR-32 criticó. En filas anteriores viene NULL, y eso significa efectivo: era el único disparador posible.
4. **La alerta se llama por lo que pasó.** «Metales Preciosos por encima del límite del Art. 32» cuando fue metal. El `por` no cambia —es el canal del tono granate y ya tiene historia—, pero el título y el desglose sí.
5. **La descripción se congela en la alerta.** No solo el código: la alerta más grave del portal diciendo «13» obligaría a ir al catálogo para entenderla, y el catálogo puede cambiar de descripción. Mismo principio que el snapshot de listas del screening.

**Y sin la lista, el motor se detiene.** `cargarConfigActividad` lanza si el catálogo no la tiene. Devolver una lista vacía habría dejado al motor calculando media prohibición sin que nada avisara — que es exactamente el estado del que venimos.

**Una prueba que envenenaba a las demás.** La primera versión del caso «sin la lista» hacía `delete` sobre `parametros_motor` dentro de una transacción. Es catálogo global y esa tabla tiene una exclusion constraint, así que cualquier otro archivo de la suite que escribiera ahí en paralelo se quedaba esperando el rollback. Costó una falla intermitente que aparecía en `tests/xsd/informe.test.ts` —un `afterAll` colgado, sin relación con esto— antes de encontrarla. Ahora se prueba con un ejecutor que miente sobre esa consulta. Una prueba que envenena a las demás es peor que una faltante: la falla aparece lejos de su causa.

**Fijado con:** las 5 aserciones de la migración `20260903170000`, `tests/umbrales/art32-metales.test.ts` (8 casos, con los dos lados del OR saboteados) y `tests/persistencia/art32-alerta.test.ts` (5 contra la base real).

## POR CONFIRMAR con el especialista PLD (bloquea afirmaciones, no el build)

> **Los números son identificadores estables, no un orden.** Se citan desde el código y desde
> otros documentos —`POR CONFIRMAR-4` aparece en tres migraciones y en `motor.ts`, `-11` en
> `src/dominio/medidas-reforzadas.ts`— así que **no se renumeran** aunque la lista no quede en
> secuencia. El 24-ago-2026 se corrigieron dos colisiones: había dos «6» y dos «5». Los que
> conservaron su número son los que otros archivos ya citaban; los otros dos pasaron a **12** y
> **13**.
>
> Para mandar: [`docs/CONSULTA-PLD.md`](CONSULTA-PLD.md) reagrupa estas mismas preguntas por
> **lo que cuesta equivocarse** y está escrito para leerse sin conocer el repositorio.

1. **Sellado del manifiesto** (ADR-10): ¿una constancia NOM-151 sobre el manifiesto con los hashes de todos los documentos satisface la exigencia de fecha cierta, o la autoridad espera constancia por documento?
2. **Identidad de comprador extranjero sin RFC** (caso A-05): ¿qué criterio de identidad resiste una verificación? Mientras tanto el sistema acumula conservadoramente por documento de identidad y escala a revisión humana.
3. **Expediente y umbrales de V Bis:** ¿qué campos son obligatorios más allá de lo que exige el XSD?, y validación formal de la tabla de umbrales/vigencias cargada al catálogo (8,025 UMA, vigencia 1 de febrero, bases de IVA).
12. **«Montos máximos mensuales» como MES DE CALENDARIO** (ADR-22): el Art. 23 Ter 1 ¶2 dice «mensuales» sin más. Se leyó como mes de calendario porque es lo que un cliente entiende al estimar y lo que puede verificar si se le pregunta. La alternativa —ventana deslizante de 30 días— detectaría además el reparto a caballo entre dos meses (90% el día 31 y 90% el día 1 nunca cruzarían un mes de calendario), pero no sale del texto, y la ventana deslizante de este proyecto tiene otro fundamento (Art. 19 de la Ley) que `RIESGO-EBR.md` §3.1 pidió no fusionar. **A diferencia de los relojes, esto no es un dato de catálogo: es la forma de la regla**, y cambiarlo es cambiar `contrastarConElPerfil` en `src/dominio/perfil-transaccional.ts`.

7. **Contra qué monto se compara el Perfil transaccional** (ADR-22): el Art. 6 del Reglamento resuelve la base para el umbral del Art. 17 (sin contribuciones) y para la restricción del Art. 32 (con ellas), pero el Perfil transaccional **no es ninguno de los dos** y ningún artículo lo alcanza. Se toma el **monto total**, contribuciones incluidas, porque es lo que el cliente desembolsa y por tanto lo que estima, y porque ante la duda detecta de más. Confirmar. Relacionado: si un cliente de **acto único** (¶4) queda o no sujeto al ejercicio semestral del ¶3 — el ¶4 no lo exime expresamente, así que hoy sí queda, y eso produce una reevaluación que se resuelve en un clic sobre una relación ya extinguida.

5. **La ventana PEP como año calendario** (issue #19): el Art. 23 Quáter ¶4 y ¶5 dicen «durante el año siguiente **a aquel en que**» — se leyó como **año calendario siguiente completo** (un cese de enero 2026 cataloga hasta el 31-dic-2027), no como 12 meses. Es la lectura literal y la conservadora: nunca acorta la ventana. También: la extranjera cesada quedó **sin fecha de fin** porque los dos párrafos hablan solo de nacionales. Confirmar ambas lecturas; el reloj vive en `parametros_motor` (`pep_vigencia_tras_cese`/`_tras_acto`), así que corregirlo sería un UPDATE con fuente, no un redeploy.

4. **✅ RESUELTA el 16 de agosto de 2026 — la base del umbral.** Contrastada contra el **Art. 6 del Reglamento de la LFPIORPI** (`regulatorio/leyes/Reg_LFPIORPI.pdf`, SHA-256 `8072a83e…`), que la contesta en dos párrafos y define **tres** reglas sobre el mismo dinero:

   | Regla | Qué monto | Fundamento |
   |---|---|---|
   | Umbral del **Art. 17** (identificación y aviso) | **Sin** contribuciones ni demás accesorios | Art. 6 ¶1, reformado DOF 27-03-2026 |
   | Monto que se **reporta en el Aviso** | El **total**, incluidas las contribuciones, **sin desglosar** | Art. 6 ¶1, segunda oración |
   | Restricción de **efectivo del Art. 32** | **Con** contribuciones y demás accesorios | Art. 6 ¶3, adicionado DOF 27-03-2026 |

   **La postura provisional del MVP era la correcta**, así que no se movió ningún umbral ni ninguna comparación: lo que cambió es que ahora se puede citar de dónde sale. Tres de las cuatro fuentes propias acertaban; `docs/referencia/VIZO-flujo-multiparte.pdf §7` decía lo contrario y **se equivocaba**.

   Lo que sí cambió es el **nombre**: el enum `base_calculo` decía `sin_iva`/`con_iva` y el Art. 6 habla de «contribuciones y demás accesorios», que es más amplio — el ISAI es una contribución y no es IVA. Ahora dice `sin_contribuciones`/`con_contribuciones`. El comportamiento era correcto; el nombre decía menos que la ley, y de ahí a concluir «el ISAI no es IVA, luego cuenta para el umbral» hay un paso.

   Fijado con casos en `tests/umbrales/base-del-calculo.test.ts`, construidos para que las tres reglas den respuestas **distintas** sobre la misma operación.

   <details><summary>El registro de la contradicción, tal como estuvo abierta</summary>

   **⚠️ CONTRADICCIÓN (cerrada) — ¿sin impuestos o con impuestos?** Era la pregunta más cara de la lista y había dos fuentes propias en conflicto:
   - `01_ARQUITECTURA_V4.md`, `00_PLAN_MAESTRO.md §1.5`, la skill `umbrales-lfpiorpi` y el prompt de esta sesión: **Art. 17 sin IVA**, Art. 32 con IVA, el aviso reporta el total. Los tres citan el Art. 6 del Reglamento reformado (DOF 27/03/2026).
   - `docs/referencia/VIZO-flujo-multiparte.pdf §7`: *"Reforma al Reglamento del 27 de marzo de 2026. El umbral se calcula con impuestos incluidos. El motor debe sumar IVA, ISAI y accesorios al valor de la operación."* — citando **la misma reforma** para la conclusión contraria. El propio documento marca esto como pendiente de confirmar en el DOF antes de configurar el motor.
   - **Postura provisional del MVP:** se mantiene `sin_iva` para Art. 17 (es lo que dicen tres de las cuatro fuentes y lo que fija el prompt de la sesión). **No es una conclusión legal.**
   - **Por qué no bloquea el build:** la base es la columna `umbrales.base`. Si la confirmación dice "con impuestos", el cambio es cerrar la vigencia e insertar la fila nueva — cero código. Los casos V-01 y V-02 de `PRUEBAS.md` se recalculan cambiando el fixture del catálogo, no el motor. **Esta contradicción es, de hecho, la mejor demostración de por qué la Capa 0 existe.**
   - **Lo que sí hay que hacer desde el día 1** (y por eso está aquí y no solo en la lista de dudas): capturar **ISAI y accesorios como columnas propias** de la operación. Si no se capturan y después se confirma que cuentan, las operaciones viejas no tienen el dato y no hay forma de reevaluarlas. Ver ARQUITECTURA.md §3.3.

   </details>

   **La lección, que vale más que la respuesta:** el argumento «no bloquea el build porque la base es un dato del catálogo» resultó cierto de punta a punta. La confirmación llegó cuatro meses después de sembrar el catálogo y costó **un renombre y una fuente** — cero cambios en el motor, cero recálculos, cero migraciones de datos. Y el punto sobre capturar ISAI y accesorios por separado desde el día 1 se cobró solo: sin esas columnas, la regla 3 del Art. 6 no sería expresable hoy.

6. **¿El portal SPPLD valida estrictamente contra el XSD?** El ejemplo oficial de XML publicado por el SAT para Fr. V Bis **no valida contra su propio XSD** (trae `caractersiticas_desarrollo` donde el esquema declara `caracteristicas_desarrollo`; ver `regulatorio/README.md`). Si el portal es estricto, el ejemplo publicado induce a error a quien lo copie. **Postura del MVP, que no depende de la respuesta:** VIZO genera y valida según el **XSD**, nunca según el ejemplo. Validar más duro que la autoridad no produce avisos rechazados; lo contrario sí.

8. **⚠️ Qué pasa DESPUÉS del primer aviso por acumulación.** Si los pagos 1-3 de una preventa ya dispararon un aviso por acumulación, el pago 4 deja la suma por encima del umbral. Dos lecturas posibles: (a) cada operación nueva que mantiene la suma sobre el umbral se reporta; (b) la ventana se reinicia tras el aviso y solo vuelve a disparar cuando las operaciones no reportadas cruzan el umbral por su cuenta. **El marco no lo resuelve explícitamente.** El MVP implementa (a) por conservador: un aviso de más se corrige, uno omitido se sanciona con 10,000 a 65,000 UMA. Documentado con test en `tests/umbrales/precondiciones.test.ts` para que un cambio de criterio sea deliberado. Encontrado en la auditoría de la semana 4.

13. **Registro real de los asesores inmobiliarios:** qué porcentaje está dado de alta en el SPPLD por cuenta propia (Fr. V/XI) vs. operando bajo el RFC de la inmobiliaria. Define si la tercera rama del flujo multi-parte existe de verdad (ADR-15).

Las preguntas 1–3 ya están redactadas en detalle en `02_FASE_0_PROVEEDORES.md §C`; aquí se listan porque el MVP toma postura provisional en todas y debe decirse en la demo.
9. **El estándar de la Firma Electrónica** (ADR-25): el Art. 23 Ter 3 ¶3 pide la del **Código de Comercio** (Art. 3 fr. VIII Ter), no la e.firma. ¿Qué mecanismo concreto de suscripción remota resiste una verificación? VIZO registra la huella del archivo firmado sin pronunciarse sobre su validez.
10. **¿Una reclasificación obliga a repetir el cuestionario?** (ADR-25): el artículo no da plazo de vigencia. Mientras no haya respuesta, VIZO enseña el hecho —«se aplicó sobre otra clasificación»— sin llamarlo vencido.
11. **¿Qué medidas reforzadas le tocan a un fideicomiso o a otra figura jurídica de Grado de Riesgo alto?** (ADR-26): el Art. 23 Ter 4 nombra personas físicas (fr. I) y morales (fr. II) y no las alcanza. VIZO enseña el hueco y no asienta nada bajo una fracción que no les corresponde.
14. **Sin XSD, ¿qué sube de «condicionado» a obligatorio en la Fr. VIII?** (migración `20260830140000`): la V Bis fija sus obligatorios cruzando los Anexos con el **XSD del aviso**; la Fr. VIII no tiene XSD (`clave_sppld` es NULL), así que su catálogo se sembró solo con el texto — y el texto condiciona el RFC y la CURP («cuando cuente con ellas»), la actividad y el giro («para los casos en que se establezca una Relación de Negocios», Art. 18 fr. II de la Ley), el teléfono, el correo, la Cédula de Identificación Fiscal y el comprobante de domicilio **de persona física**. Quedaron `obligatorio = false`: siguen siendo capturables y visibles, pero no bloquean la aprobación. **La pregunta es si la autoridad los espera de todos modos.** No bloquea nada: cuando se descargue el XSD de vehículos, lo que el formato exija sube con una vigencia nueva y su fuente. Hermana de la **3**, que es la misma pregunta para la V Bis.

15. **La antigüedad de tres meses del comprobante de domicilio es POR TIPO DE DOCUMENTO, y eso toca a la V Bis.** Al transcribir los Anexos 3 y 4 (30-ago-2026) se ve por qué el Art. 21 dice «conforme a los Anexos de estas reglas **que así lo solicitan**»: el límite cuelga del «recibo de pago por servicios domiciliados o estados de cuenta bancarios, **todos ellos** con una antigüedad no mayor a tres meses», y **no** del «contrato de arrendamiento vigente» ni de la «Constancia de inscripción en el RFC», que el mismo numeral acepta sin límite. `documentos` no registra cuál de los tres se subió. La Fr. VIII **no** siembra `antiguedad_maxima_meses` por eso; la V Bis **sí lo trae** desde el 30-nov-2026 (migración `20260815170000`, que además avisó de este riesgo: «el Anexo de la Fr. V Bis no se ha transcrito»). Ya está transcrito. **Si la lectura es correcta, la fila de la V Bis rechaza comprobantes válidos** — y un rechazo falso se ve como si el sistema tuviera razón. Corregirlo es una migración nueva con su propia doble revisión, no una edición: las aplicadas no se editan.

16. **El Beneficiario Controlador de persona moral deja de ser una constancia el 30-nov-2026, y el catálogo no puede expresar lo que lo sustituye.** El Anexo 4 b) v) reformado cambia «recabar la constancia firmada» por «deberá **identificar** […] al Beneficiario Controlador», remitiendo al Art. 12 fr. VII ¶2, que exige recabar nombre y apellidos, fecha de nacimiento, país de nacionalidad y CURP/RFC **«en todos los casos»**. Es más estricto. Pero un campo de dato de `campos_expediente` solo puede satisfacerse desde una columna de `clientes_finales`, y los datos del BC viven en `beneficiarios_controladores`. La Fr. VIII lo modela como **documento probatorio** (`identificacion_beneficiario_controlador`) para que el expediente no se vuelva *más fácil* el día en que la regla se endurece — con la aproximación escrita en su propia columna `fuente` y una aserción en la migración que revienta si alguien cierra la vigencia vieja sin abrir la nueva. **La sustitución correcta es captura estructurada del BC**, y hasta que exista, esta fila pide un archivo donde el texto pide datos. La V Bis todavía no modela este cambio en absoluto: su `declaracion_beneficiario` sigue abierta sin cierre.

17. **`aplica_a` tiene tres valores y las RCG tienen nueve tipos de cliente.** El Art. 12 remite a los Anexos 3 (PF nacional o residente), 4 (PM mexicana), 4 Bis (PM de derecho público), 5 (**PF extranjera visitante** — pide pasaporte, no INE), 6 (PM extranjera), 6 Bis (embajadas y organismos internacionales), 7 y 7 Bis (medidas simplificadas) y 8 (fideicomiso). `campos_expediente.aplica_a` solo distingue `persona_fisica`, `persona_moral` y `ambas`, así que **lo sembrado cubre los Anexos 3 y 4 y nada más** — en la Fr. VIII y en la V Bis por igual. Un turista que compra un vehículo se mide hoy contra el Anexo equivocado. No se rellenó por parecido: sembrar el Anexo 3 como si cubriera al extranjero visitante fabricaría evidencia de haber cumplido una regla distinta de la aplicable. Relacionado con el caso **A-05** y con la pregunta **2**.

Las **14 a 17** salieron todas del mismo trabajo: sembrar el expediente de la Fr. VIII (30-ago-2026) obligó a transcribir los Anexos completos por primera vez, y tres de las cuatro resultaron ser hallazgos sobre la **V Bis**, no sobre la fracción nueva.
