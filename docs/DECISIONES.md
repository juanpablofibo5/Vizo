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

## POR CONFIRMAR con el especialista PLD (bloquea afirmaciones, no el build)

1. **Sellado del manifiesto** (ADR-10): ¿una constancia NOM-151 sobre el manifiesto con los hashes de todos los documentos satisface la exigencia de fecha cierta, o la autoridad espera constancia por documento?
2. **Identidad de comprador extranjero sin RFC** (caso A-05): ¿qué criterio de identidad resiste una verificación? Mientras tanto el sistema acumula conservadoramente por documento de identidad y escala a revisión humana.
3. **Expediente y umbrales de V Bis:** ¿qué campos son obligatorios más allá de lo que exige el XSD?, y validación formal de la tabla de umbrales/vigencias cargada al catálogo (8,025 UMA, vigencia 1 de febrero, bases de IVA).
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

5. **Registro real de los asesores inmobiliarios:** qué porcentaje está dado de alta en el SPPLD por cuenta propia (Fr. V/XI) vs. operando bajo el RFC de la inmobiliaria. Define si la tercera rama del flujo multi-parte existe de verdad (ADR-15).

Las preguntas 1–3 ya están redactadas en detalle en `02_FASE_0_PROVEEDORES.md §C`; aquí se listan porque el MVP toma postura provisional en todas y debe decirse en la demo.
