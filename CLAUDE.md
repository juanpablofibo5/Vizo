# VIZO

SaaS de cumplimiento PLD (LFPIORPI) para actividades vulnerables en México.
Multi-tenant. Los clientes son sujetos obligados; VIZO es su **encargado** bajo la LFPDPPP.

## Reglas duras

**1. Nada regulatorio se escribe en código.** Umbrales, valores de UMA, campos obligatorios de expediente y formatos de aviso viven en el catálogo de la base de datos, versionados por vigencia. Si una tarea te lleva a escribir un número de umbral o una fracción del Art. 17 en un archivo `.ts`, para y pregunta.

**2. Ningún cálculo regulatorio se acepta sin prueba.** Todo cambio en el motor de umbrales necesita casos en `tests/umbrales/`. La suite completa debe pasar antes de considerar cualquier tarea terminada.

**3. Ningún dato personal en logs, errores, ni telemetría.** Nombres, RFC, CURP, direcciones, imágenes de identificaciones. Los biométricos son datos sensibles: la multa bajo la LFPDPPP se duplica. En logs se usan IDs opacos.

**4. La bitácora es append-only.** Nunca escribas un `UPDATE` o `DELETE` sobre `bitacora`.

**5. VIZO nunca envía el aviso al SPPLD ni descarta una coincidencia de screening.** Ambas cosas requieren acción humana registrada. Si una tarea implica automatizar cualquiera de las dos, para y pregunta.

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
