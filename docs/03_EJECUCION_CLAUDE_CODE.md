# Ejecutar VIZO con Claude Code

Guía operativa. Basada en las prácticas oficiales de Claude Code, aterrizadas a este proyecto.

---

## 1. El principio que manda sobre todos los demás

> Dale a Claude algo que pueda correr para verificar su propio trabajo.

Sin un check que devuelva pasa/falla, **tú eres el bucle de verificación**: cada error espera a que tú lo notices. Con un check, el bucle se cierra solo — Claude escribe, corre, lee el resultado e itera hasta que pasa.

VIZO tiene dos checks perfectos, y no es casualidad que sean los dos entregables más importantes:

| Check | Qué prueba | Cuándo existe |
|---|---|---|
| `pnpm test:umbrales` | Que el cálculo regulatorio es correcto | **Antes** del motor |
| `pnpm test:xsd` | Que el aviso generado es presentable ante el SAT | Fase 2 |

Escribe la suite de umbrales antes que el motor. Los diez casos están en `01_ARQUITECTURA_V4.md §3.1`. Con esa suite existiendo, Claude Code puede trabajar largo rato sin supervisión sobre la parte más delicada del sistema. Sin ella, cada línea necesita que tú la revises.

---

## 2. Setup del repositorio

```
vizo/
├── CLAUDE.md                          # ya redactado
├── .claude/
│   ├── skills/
│   │   ├── umbrales-lfpiorpi/SKILL.md # ya redactado
│   │   └── aviso-sppld/SKILL.md       # ya redactado
│   ├── agents/
│   │   └── revisor-regulatorio.md     # ya redactado
│   └── settings.json                  # hooks y permisos
├── regulatorio/
│   ├── xsd/                           # XSD oficiales del SPPLD
│   ├── instructivos/
│   ├── ejemplos/                      # XML de ejemplo del SAT → fixtures
│   └── decisiones.md                  # respuestas del consultor PLD
├── tests/umbrales/                    # la suite que define el proyecto
├── docs/
│   ├── 00_PLAN_MAESTRO.md
│   └── 01_ARQUITECTURA_V4.md
└── src/
```

### Por qué está repartido así

La guía oficial es explícita: **CLAUDE.md corto**. Se carga en cada sesión y compite por contexto con el trabajo real. Si crece, Claude empieza a ignorar la mitad. Ahí van solo las reglas que, si las quitas, provocan errores.

El conocimiento de dominio —los umbrales, las reglas de acumulación, el pipeline del aviso— va en **skills**, que Claude carga solo cuando la tarea las necesita. Eso es lo que evita que cada sesión arranque cargando 4,000 tokens de derecho fiscal para arreglar un botón.

El **subagente revisor** corre en su propio contexto: ve el diff y los criterios, no el razonamiento que produjo el cambio. Por eso lo evalúa por sus propios méritos.

### Hooks recomendados en `.claude/settings.json`

Los hooks son deterministas; CLAUDE.md es advisory. Para las reglas que no pueden fallar, usa hooks:

1. **Stop hook** que corre `pnpm test:umbrales` y bloquea el fin de turno si falla.
2. **PreToolUse hook** que bloquea escrituras a `regulatorio/xsd/` (esos archivos son de la autoridad, no se editan).
3. **PostToolUse hook** que corre el typecheck después de cada edición en `src/dominio/`.

Puedes pedirle a Claude que te los escriba: *"escribe un hook que corra pnpm test:umbrales antes de terminar el turno y bloquee si falla"*.

### MCP a conectar

Ya tienes Supabase y Vercel conectados. Agrega:

- **Didit** — expone su API de verificación por MCP, pensado para agentes de código.
- **yente-client** de OpenSanctions — trae servidor MCP para consultas de screening.

Instálalos con `claude mcp add`. Que Claude pueda consultar el esquema real de Supabase en vez de adivinarlo cambia mucho la calidad de las migraciones.

---

## 3. Workflow por fase

### Fase 0 — sin código

No uses Claude Code para esto. Es investigación, llamadas y contratos. Lo único útil aquí es pedirle que te arme la lista de preguntas para cada proveedor a partir de `02_FASE_0_PROVEEDORES.md`.

**Excepción que sí vale la pena:** cuando tengas los XSD descargados, abre una sesión en modo plan y pídele:

```
Lee los XSD e instructivos en regulatorio/ para Fr. VIII y Fr. V Bis.
Extrae la lista completa de campos, sus tipos, cuáles son obligatorios,
y qué catálogos de valores cerrados usa el SAT.
Escríbelo en docs/campos-aviso.md. No escribas código todavía.
```

Ese documento es la entrada real al diseño del modelo de datos. Vale más que cualquier suposición.

### Fase 1 — el arranque

**Paso 1: deja que Claude te entreviste.** Es la técnica que mejor rinde en features grandes:

```
Quiero construir el motor de umbrales de VIZO. Entrevístame a detalle
usando la herramienta AskUserQuestion.

Pregunta sobre implementación técnica, casos borde, y trade-offs.
No preguntes lo obvio, métete en las partes difíciles que quizá no he
considerado. Ten en cuenta docs/01_ARQUITECTURA_V4.md y la skill
umbrales-lfpiorpi.

Sigue entrevistándome hasta cubrir todo, luego escribe la especificación
completa en SPEC-motor-umbrales.md.
```

Cuando termine, **abre una sesión nueva** para implementar. Contexto limpio, con la spec escrita como referencia.

**Paso 2: explorar → planear → implementar → commit.** Modo plan para todo lo que toque varios archivos. `Ctrl+G` abre el plan en tu editor para corregirlo antes de que empiece.

Salta el modo plan solo cuando puedas describir el diff en una frase.

**Paso 3: revisión adversarial antes de dar por hecho.**

```
Usa el subagente revisor-regulatorio para revisar el diff contra
SPEC-motor-umbrales.md. Verifica que los diez casos de prueba estén
implementados y que nada regulatorio quedó en código.
Reporta huecos, no preferencias de estilo.
```

### Orden de construcción sugerido en Fase 1

1. Migraciones del catálogo regulatorio + seed con la tabla validada por el consultor
2. `tests/umbrales/` — los diez casos, fallando
3. Motor de umbrales hasta que los diez pasen
4. Modelo multi-tenant + RLS
5. Formulario de captura por link
6. Parser CFDI 4.0
7. Panel mínimo

Los pasos 2 y 3 en ese orden. Es la única parte del proyecto donde escribir la prueba primero no es dogma, es gestión de riesgo penal.

---

## 4. Higiene de sesión

- `/clear` entre tareas no relacionadas. La sesión que empieza con el motor de umbrales y termina ajustando un color tiene el contexto lleno de basura.
- Si corregiste lo mismo dos veces, **no corrijas una tercera**. `/clear` y vuelve a arrancar con un prompt mejor que incorpore lo que aprendiste. Una sesión limpia con buen prompt casi siempre gana a una sesión larga con correcciones acumuladas.
- `/rename` las sesiones: `motor-umbrales`, `captura-link`, `parser-cfdi`. Trátalas como ramas.
- Subagentes para investigar: *"usa subagentes para revisar cómo maneja el XSD los campos de forma de pago"*. Exploran en contexto aparte y te devuelven el resumen.
- `/btw` para dudas rápidas que no quieres que ensucien el hilo.

## 5. Trabajo en paralelo

Cuando el proyecto tenga masa, los worktrees valen la pena: una sesión en el motor de umbrales y otra en el formulario de captura, en checkouts aislados, sin colisiones.

El patrón escritor/revisor también aplica bien aquí: una sesión implementa el generador de XML, otra sesión distinta lo revisa contra el XSD. La sesión que no escribió el código no está sesgada hacia defenderlo.

## 6. Errores a evitar en este proyecto en particular

| Patrón | Por qué duele aquí |
|---|---|
| CLAUDE.md que crece | Las cinco reglas duras se pierden en el ruido y aparece un umbral hardcodeado |
| Dar por terminado sin correr las pruebas | El costo de un cálculo mal no es un bug, es un aviso omitido |
| Explorar sin acotar | Los XSD del SAT son enormes; sin subagente te comes el contexto |
| Confiar en el resumen en vez de la evidencia | Pide siempre la salida de la prueba, no la afirmación de que pasó |
| Meter valores regulatorios "provisionales" | El provisional se queda. Si no tienes el dato validado, deja la tabla vacía y que el motor falle ruidosamente |

## 7. Sobre secretos

Ninguna llave en el repo. Las de Supabase, Didit, el PSC y OpenSanctions van en variables de entorno y en el gestor de Vercel. Vale la pena un hook de `PreToolUse` que bloquee commits con patrones de llave, porque este es exactamente el tipo de proyecto donde una llave filtrada no es una molestia sino un incidente de datos personales reportable.
