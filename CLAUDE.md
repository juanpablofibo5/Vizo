# VIZO

SaaS de cumplimiento PLD (LFPIORPI) para actividades vulnerables en México.
Multi-tenant. Los clientes son sujetos obligados; VIZO es su **encargado** bajo la LFPDPPP.

## Reglas duras

**1. Nada regulatorio se escribe en código.** Umbrales, valores de UMA, campos obligatorios de expediente y formatos de aviso viven en el catálogo de la base de datos, versionados por vigencia. Si una tarea te lleva a escribir un número de umbral o una fracción del Art. 17 en un archivo `.ts`, para y pregunta.

**2. Ningún cálculo regulatorio se acepta sin prueba.** Todo cambio en el motor de umbrales necesita casos en `tests/umbrales/`. La suite completa debe pasar antes de considerar cualquier tarea terminada.

**3. Ningún dato personal en logs, errores, ni telemetría.** Nombres, RFC, CURP, direcciones, imágenes de identificaciones. En logs se usan IDs opacos.

La escala de lo que está en juego, con la ley ya en el repositorio (`regulatorio/leyes/LFPDPPP.pdf`, SHA-256 `04d67464…`, contrastada el 20-ago-2026):

| | Qué dice el texto | Efecto |
|---|---|---|
| **Art. 59** (sanciones administrativas) | «Tratándose de datos personales sensibles, las sanciones **podrán incrementarse** hasta por dos veces, los montos establecidos» | La multa **no** se duplica sola: es discrecional de la Secretaría |
| **Art. 64** (delitos) | «Tratándose de datos personales sensibles, **las penas** a que se refiere este Capítulo **se duplicarán**» | Automático, y sobre **prisión** — Arts. 62 y 63: hasta tres y hasta cinco años |

Y **si una identificación oficial es «dato sensible» no está resuelto**: la palabra «biométrico» no aparece en la ley. El Art. 2 fr. VI da un criterio —lo que afecte «la esfera más íntima» o cuyo uso indebido «pueda dar origen a discriminación»— y una lista **enunciativa más no limitativa** que nombra origen racial o étnico, salud, información genética, creencias, opiniones políticas y preferencia sexual. Ni identificaciones ni biometría. Es pregunta abierta para el abogado (`docs/LFPDPPP.md` §3, pregunta 1).

**Esta regla no depende de esa respuesta.** Aplica a todo dato personal, sea sensible o no; lo sensible solo agrava. La versión anterior de este párrafo afirmaba que «la multa se duplica» y que «los biométricos son datos sensibles», ninguna de las dos con respaldo en el texto — la regla dura 1 incumplida dentro de las reglas duras. Se deja escrito para que no vuelva a pasar.

**4. La bitácora es append-only.** Nunca escribas un `UPDATE` o `DELETE` sobre `bitacora`.

**5. VIZO nunca envía el aviso al SPPLD ni descarta una coincidencia de screening.** Ambas cosas requieren acción humana registrada. Si una tarea implica automatizar cualquiera de las dos, para y pregunta.

**6. Nada calcula en silencio con datos que no cuadran.** Ante un dato faltante o incoherente, detente con un error accionable. Nunca asumas un valor por defecto, nunca uses un fallback "razonable".

Esta regla existe porque el modo de falla de este proyecto **no es el crash**: es el cálculo mal hecho que nadie nota. Las tres auditorías encontraron el mismo patrón, siempre distinto por fuera:

| Qué pasó | Consecuencia |
|---|---|
| El motor aceptó una configuración de otra fecha | Se evaluó con la UMA equivocada → **aviso omitido** |
| La operación evaluada venía en su propio historial | Se contó dos veces → **aviso falso** |
| Con umbral `con_contribuciones`, una previa sin total sumaba solo su base | Suma de menos → **aviso omitido** |
| `registrarEvaluacion` aceptaba un `operacionId` suelto | Registro incoherente en **el objeto que se defiende ante la autoridad** |

Ninguna lanzó una excepción. Todas devolvieron un número plausible.

**Prefiere hacer el error imposible antes que detectarlo.** En orden de preferencia:

1. **Que no se pueda expresar.** `registrarEvaluacion` dejó de recibir un id suelto: lo toma de `evaluacion.operacionId`, que el motor sella. Ya no hay forma de guardar el cálculo de una operación contra otra.
2. **Que lo impida la base.** Un `CHECK`, una FK compuesta `(tenant_id, id)`, una exclusion constraint. No dependen de que alguien llame a la función correcta. Las aserciones de la migración 001 (`app.verificar_*`) son de este tipo.
3. **Que lo detecte una precondición.** Al inicio de la función, con un mensaje que diga qué hacer. Es el último recurso, no el primero.

**El nivel 2 solo existe si la aplicación no es superusuario.** La auditoría de la semana 5 encontró que las escrituras corrían como `postgres`, que tiene `rolbypassrls = true`: RLS no se evaluaba, y la validación de tenant de la bitácora —que depende de `app.tenant_id()`— se saltaba sola por falta de JWT.

Hoy la app se conecta como **`vizo_app`**: sin BYPASSRLS y NOINHERIT, así que no puede hacer nada hasta asumir `authenticated` con `enTransaccionDeSesion` (ADR-16 y ADR-18). Si escribes una función de persistencia y olvidas envolverla, ya no escribe sin RLS: muere con `permission denied`. **`VIZO_DB_URL_ADMIN` es el rol elevado y es solo para migraciones, seed y tests** — importarlo desde `app/` o `src/` es un incidente de seguridad, no un atajo.

**Cuidado con lo que la base concede sin que nadie lo pida.** Supabase otorga TRUNCATE, TRIGGER, REFERENCES y MAINTAIN a `anon` y `authenticated` sobre **toda tabla nueva** de `public`, por *default privileges*. No aparece en ninguna migración, así que no se ve leyendo el código: `truncate bitacora` funcionaba para cualquier usuario con sesión y borraba el historial de todos los obligados. `app.verificar_privilegios_por_omision()` lo revisa en cada migración y en cada corrida del smoke test (ADR-17).

**Fronteras donde aplica con más fuerza:** entrada humana (formularios), archivos externos (CFDI, XSD), y todo lo que produzca el XML del aviso.

## Comandos

```bash
pnpm dev              # desarrollo
pnpm test             # suite completa
pnpm test:umbrales    # solo motor de umbrales — correr antes de cada commit
pnpm test:xsd         # valida los XML generados contra los XSD oficiales
pnpm typecheck
pnpm db:migrate       # migraciones de Supabase
pnpm db:types         # regenerar tipos de Postgres
```

## Stack

Next.js (App Router) · TypeScript estricto · Supabase (Postgres + Auth + Storage) · Vercel · Tailwind

## Convenciones

- El dominio se nombra en español (`expediente`, `aviso`, `umbral`, `sujeto_obligado`), la infraestructura en inglés. No traducir términos legales.
- Los montos son `numeric` en Postgres y enteros de centavos en TypeScript. **Nunca `float`.**
- Toda consulta cruza `tenant_id`. Toda tabla nueva nace con política RLS; una tabla sin RLS es un incidente de seguridad, no un pendiente.
- Las migraciones no se editan una vez aplicadas. Se corrige con una nueva.

## Contexto que no está en el código

- `00_PLAN_MAESTRO.md` — hallazgos regulatorios, economía, fases
- `01_ARQUITECTURA_V4.md` — modelo de datos y decisiones cerradas
- `docs/PLATAFORMA.md` — el diseño de producto: VIZO como SaaS completo (portal, roles, onboarding, backoffice), no solo el motor. La UI nunca calcula: pinta lo que el motor registró
- `docs/ALCANCE.md` — **las decisiones de alcance**: qué entra en cada fase (F0 núcleo ✓ · F1 plataforma · compuerta de viabilidad · F2/F3), las seis fronteras que no se cruzan, y el mapa de rutas de F1. Cambiar algo de ahí es cambiar de dirección
- `docs/ROADMAP-2027.md` — **el calendario del regulador**, contrastado transitorio por transitorio: qué entra el 30-nov-2026, el 1-mar-2027, el 1-jun-2027 y el 1-ene-2028, con lo que VIZO tiene de cada capítulo
- `regulatorio/` — XSD oficiales, instructivos, textos del DOF con su SHA-256, y `decisiones.md` del consultor PLD

## Gotchas

- Los umbrales cambian el **1 de febrero**, no el 1 de enero. Las operaciones de enero usan la UMA del año anterior.
- **Tres reglas sobre el mismo dinero**, y son del Art. 6 del Reglamento (`regulatorio/leyes/Reg_LFPIORPI.pdf`, ✅ contrastado el 16-ago-2026): el umbral del **Art. 17** se mide **sin contribuciones ni demás accesorios** (¶1); el **Aviso reporta el total** con contribuciones y **sin desglosar** (¶1); la restricción de efectivo del **Art. 32** se mide **con** ellos (¶3). Ojo con el vocabulario: la norma dice «contribuciones y demás accesorios», no «IVA» — el ISAI es una contribución. Por eso el enum es `sin_contribuciones`/`con_contribuciones`.
- El SPPLD rechaza XML de más de **2 MB**. Hay que fragmentar.
- Las Reglas de Carácter General **ya salieron**: Acuerdo 115/2026, DOF 7 de agosto de 2026, vigencia general 30 de noviembre de 2026. La apuesta que justificaba la regla dura 1 se cobró — y por mantener umbrales, campos y formatos como dato versionado por vigencia, absorberlo es un `INSERT` y no un rediseño. Nada nuevo es exigible antes del 30 de noviembre, así que el alcance del MVP no cambia. **Lo que sí cambia son tres supuestos del modelo de datos**: ver `docs/ACUERDO-115-2026.md`.
- **El Acuerdo 115/2026 está contrastado A MEDIAS contra el DOF.** El texto oficial vive en `regulatorio/dof/acuerdo-115-2026.doc` (código 5795797, edición vespertina). Lo verificado está marcado **✅ DOF** con su artículo en `docs/ACUERDO-115-2026.md` §0 — fideicomisos, fecha del acto, consolidación de avisos, y que **el Acuerdo NO toca el cálculo de umbrales**. Lo que sigue viniendo de análisis secundarios está marcado **⚠️ sin contrastar** y no se siembra en el catálogo ni se cita como fundamento. Un umbral con fuente equivocada es peor que un umbral faltante: el faltante revienta, el equivocado calcula.
- **La base del umbral ya está resuelta** (16-ago-2026). No la contestaba el Acuerdo —donde «impuesto» no aparece— sino el **Art. 6 del Reglamento**, reformado el 27-03-2026. Era la pregunta más cara del proyecto y la postura provisional resultó correcta, así que **no se movió ningún umbral ni ninguna comparación**: costó un renombre del enum y una fuente. Detalle y las tres reglas en `docs/DECISIONES.md`, punto 4 de POR CONFIRMAR. Del issue #3 siguen abiertos el sellado del manifiesto, la identidad de extranjero sin RFC y los campos obligatorios del expediente.
