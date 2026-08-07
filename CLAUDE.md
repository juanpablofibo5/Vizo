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

**El nivel 2 solo existe si la aplicación no es superusuario.** La auditoría de la semana 5 encontró que las escrituras corrían como `postgres`, que tiene `rolbypassrls = true`: RLS no se evaluaba, y la validación de tenant de la bitácora —que depende de `app.tenant_id()`— se saltaba sola por falta de JWT. Toda escritura pasa por `enTransaccionDeSesion`, que baja el rol a `authenticated` y planta los claims. Si escribes una función de persistencia nueva y no la usas, la base no te está protegiendo aunque el esquema diga que sí (ADR-16).

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
- `regulatorio/` — XSD oficiales, instructivos y `decisiones.md` del consultor PLD

## Gotchas

- Los umbrales cambian el **1 de febrero**, no el 1 de enero. Las operaciones de enero usan la UMA del año anterior.
- Art. 17 (umbrales) se calcula **sin IVA**. Art. 32 (efectivo) **con IVA**. El aviso se reporta con el total.
- El SPPLD rechaza XML de más de **2 MB**. Hay que fragmentar.
- Las Reglas de Carácter General están **vencidas y pendientes** desde julio de 2026. Van a cambiar los formatos de aviso. Por eso existe la regla dura 1.
