# VIZO

SaaS de cumplimiento PLD (LFPIORPI) para actividades vulnerables en México.
Multi-tenant. Los clientes son sujetos obligados; VIZO es su **encargado** bajo la LFPDPPP.

## Reglas duras

**1. Nada regulatorio se escribe en código.** Umbrales, valores de UMA, campos obligatorios de expediente y formatos de aviso viven en el catálogo de la base de datos, versionados por vigencia. Si una tarea te lleva a escribir un número de umbral o una fracción del Art. 17 en un archivo `.ts`, para y pregunta.

**2. Ningún cálculo regulatorio se acepta sin prueba.** Todo cambio en el motor de umbrales necesita casos en `tests/umbrales/`. La suite completa debe pasar antes de considerar cualquier tarea terminada.

**3. Ningún dato personal en logs, errores, ni telemetría.** Nombres, RFC, CURP, direcciones, imágenes de identificaciones. Los biométricos son datos sensibles: la multa bajo la LFPDPPP se duplica. En logs se usan IDs opacos.

**4. La bitácora es append-only.** Nunca escribas un `UPDATE` o `DELETE` sobre `bitacora`.

**5. VIZO nunca envía el aviso al SPPLD ni descarta una coincidencia de screening.** Ambas cosas requieren acción humana registrada. Si una tarea implica automatizar cualquiera de las dos, para y pregunta.

**6. Nada calcula en silencio con datos que no cuadran.** Ante un dato faltante o incoherente, detente con un error accionable. Nunca asumas un valor por defecto, nunca uses un fallback "razonable".

Esta regla existe porque el modo de falla de este proyecto **no es el crash**: es el cálculo mal hecho que nadie nota. Las tres auditorías encontraron el mismo patrón, siempre distinto por fuera:

| Qué pasó | Consecuencia |
|---|---|
| El motor aceptó una configuración de otra fecha | Se evaluó con la UMA equivocada → **aviso omitido** |
| La operación evaluada venía en su propio historial | Se contó dos veces → **aviso falso** |
| Con umbral `con_iva`, una previa sin total sumaba solo su base | Suma de menos → **aviso omitido** |
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
- `regulatorio/` — XSD oficiales, instructivos y `decisiones.md` del consultor PLD

## Gotchas

- Los umbrales cambian el **1 de febrero**, no el 1 de enero. Las operaciones de enero usan la UMA del año anterior.
- Art. 17 (umbrales) se calcula **sin IVA**. Art. 32 (efectivo) **con IVA**. El aviso se reporta con el total.
- El SPPLD rechaza XML de más de **2 MB**. Hay que fragmentar.
- Las Reglas de Carácter General **ya salieron**: Acuerdo 115/2026, DOF 7 de agosto de 2026, vigencia general 30 de noviembre de 2026. La apuesta que justificaba la regla dura 1 se cobró — y por mantener umbrales, campos y formatos como dato versionado por vigencia, absorberlo es un `INSERT` y no un rediseño. Nada nuevo es exigible antes del 30 de noviembre, así que el alcance del MVP no cambia. **Lo que sí cambia son tres supuestos del modelo de datos**: ver `docs/ACUERDO-115-2026.md`.
- **Nada del Acuerdo 115/2026 está verificado contra el DOF todavía.** Lo que hay viene de análisis secundarios, dos de ellos de competidores directos. No se siembra en el catálogo ni se cita como fundamento hasta contrastarlo contra el texto oficial (código 5795797). Un umbral con fuente equivocada es peor que un umbral faltante: el faltante revienta, el equivocado calcula.
