# VIZO como plataforma — del motor al SaaS

**Fecha:** 10 de agosto de 2026 · **Estado:** diseño aprobable, guía de las próximas 2 semanas

## Por qué existe este documento

Hasta la semana 10 se construyó casi exclusivamente **el componente**: motor de umbrales, bitácora encadenada, expediente, pipeline del aviso. Todo auditado y en verde — y casi todo invisible. La UI existente (captura, alertas) es una fachada mínima sobre un backend que hace mucho más de lo que enseña.

El objetivo real del proyecto es **medir si esto es viable como SaaS**. Esa pregunta no la responde el motor: la responde la experiencia de quien lo contrata. ¿Qué veo al entrar? ¿Cómo sé si estoy en regla? ¿Dónde apruebo un aviso? ¿Qué hace mi capturista y qué no puede hacer? Un motor perfecto con una fachada pobre mide la viabilidad de un motor, no la de un producto.

Este documento fija el diseño de la plataforma completa. La restricción de siempre se mantiene y se vuelve principio de producto: **la UI nunca calcula — pinta lo que el motor ya registró.**

---

## 1. Los dos planos de la plataforma

VIZO no es una aplicación: son dos, sobre la misma base.

### Plano A — El portal del obligado (lo que se vende)

Lo que contrata un sujeto obligado, **por RFC** (la unidad de cobro, según la nota estratégica del Acuerdo 115). Multi-tenant desde el día uno — eso ya existe y está probado con ataques cross-tenant en la suite.

### Plano B — El backoffice de VIZO (lo que nos permite operar)

Hoy, cargar una UMA nueva o un XSD nuevo es una migración de SQL. Eso funciona para un prototipo con un desarrollador; no funciona para un SaaS donde lo regulatorio cambia con el DOF y el que lo carga no debe necesitar un deploy.

El diseño por vigencias hace que el backoffice sea conceptualmente simple — insertar filas con su fuente — pero exige el mismo patrón que el aviso: **quien carga no es quien aprueba**. Un valor de UMA mal cargado altera los cálculos de todos los clientes a la vez; la doble firma contra el DOF es el control. El backoffice es post-MVP como software, pero el diseño queda fijado aquí para que ninguna decisión del portal lo estorbe.

---

## 2. Roles y permisos

La matriz completa, incluyendo lo que ya está impuesto por la base (RLS + funciones `SECURITY DEFINER`). **La UI refleja permisos; jamás los inventa.** Si un botón aparece deshabilitado es porque la base lo rechazaría — no al revés.

| Capacidad | Capturista | Admin | Enforcement hoy |
|---|---|---|---|
| Alta de clientes y expedientes | ✓ | ✓ | RLS |
| Subir documentos | ✓ | ✓ | RLS + políticas de Storage |
| Registrar operaciones | ✓ | ✓ | RLS |
| Ver alertas y evaluaciones | ✓ | ✓ | RLS |
| Aprobar expediente | — | ✓ | `app.expediente_aprobar` |
| Generar aviso | — | ✓ | política INSERT de `avisos` |
| Aprobar aviso | — | ✓ | `app.aviso_aprobar` |
| Registrar acuse | — | ✓ | `app.aviso_registrar_acuse` |
| Gestionar usuarios, sucursales, desarrollos | — | ✓ | RLS (políticas admin) |

**Roles del roadmap** (diseñados, no construidos):

- **REC** (Representante Encargado de Cumplimiento). Hoy sus funciones las ejerce `admin`. El Acuerdo 115 lo convierte en figura con exposición personal — acepta su designación en el Portal del SAT con su propia e.firma (issue #12). Cuando se construya, hereda de admin las aprobaciones y deja la administración de usuarios al dueño.
- **Auditor** (solo lectura + paquete de evidencia). Lo exige el Cap. XIV desde 2028; el manifiesto y la bitácora ya producen lo que ese rol consumiría.

---

## 3. El mapa del portal

Ocho áreas. Las marcadas ● existen hoy; ◐ existen a medias; ○ no existen.

```
┌─────────────────────────────────────────────────────────┐
│  VIZO                                    [obligado] [rol]│
├──────────────┬──────────────────────────────────────────┤
│ ● Inicio ◐   │                                          │
│ ● Clientes   │   El área de trabajo responde SIEMPRE    │
│ ● Operaciones│   una pregunta del cumplimiento, nunca   │
│ ● Alertas    │   una pregunta de la base de datos.      │
│ ○ Avisos     │                                          │
│ ○ Evidencia  │                                          │
│ ○ Calendario │                                          │
│ ○ Config.    │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### 3.1 Inicio — el semáforo de cumplimiento ◐

La pantalla existe pero no responde la única pregunta que importa: **"¿estoy en regla hoy?"**. Rediseño:

- **La tarjeta grande**: el periodo corriente. "Julio 2026 — aviso presentado ✓" o "Julio 2026 — vence en 4 días" o "VENCIDO hace 2 días". Sale de `plazoDePresentacion` + estado del aviso. Un color, un dato, cero ambigüedad.
- **Requiere tu atención**: avisos en `listo_revision` esperando aprobación, expedientes incompletos con operaciones registradas, alertas de proximidad activas. Cada renglón es un enlace a la acción, no a un reporte.
- **El mes en números**: operaciones capturadas, ninguna⁄N reportables, suma de ventanas activas. Todo pintado desde `evaluaciones_umbral` — nada se recalcula.

### 3.2 Clientes y expedientes ●

Existe (S5–S6). Mejoras de producto: filtro por completitud, el estado del expediente visible en la lista (hoy hay que entrar uno por uno), y la huella SHA-256 presentada como lo que es — "este documento no ha cambiado desde que se subió" — en lugar de un hex críptico.

### 3.3 Operaciones — y el veredicto explicable ●→◐

Existe la captura. Lo que falta es la representación correcta del motor, y es **la pieza de frontend más importante de la plataforma**:

> **El veredicto explicable.** Cada operación muestra su resultado ("No requiere aviso" / "Requiere aviso individual" / "Cruza por acumulación") con un desglose expandible: la UMA aplicada y su vigencia, el umbral en pesos, la base considerada (con/sin IVA según el artículo), la suma de la ventana con las operaciones que la integran, y el id de la evaluación con su versión de catálogo.
>
> Nada de esto se calcula en el navegador. `evaluaciones_umbral` ya guarda **todos** los insumos de cada veredicto — se diseñó así desde la semana 3 precisamente para poder defenderlo. El componente solo lo cuenta en lenguaje humano.

Esto convierte la mayor ansiedad del cliente ("¿por qué el sistema dice que debo avisar?") en el mayor diferenciador ("aquí está la aritmética, el fundamento y la fecha, defendible ante la autoridad"). Excel no puede hacer esto; un despacho lo cobra por hora.

### 3.4 Alertas ●

Existe (S7). Se le añade el veredicto explicable (mismo componente) y el enlace directo a la operación y al cliente.

### 3.5 Avisos ○ — la construcción principal

El backend completo existe y está probado; no hay ni una pantalla. Es el hueco más grande entre lo que el sistema hace y lo que enseña.

- **Lista por periodo**: cada mes con su estado del pipeline (`borrador → validado → listo_revision → aprobado → presentado`) y su plazo. Los periodos sin aviso generado aparecen — un mes sin generar también es información, y el informe en cero es una obligación, no una ausencia.
- **Detalle del aviso**: el stepper de estados con quién y cuándo en cada paso; los lotes descargables con tamaño y hash (fragmentación 2 MB ya resuelta); el botón **Aprobar** (solo admin, y el botón explica el peso del acto: es la firma registrada en bitácora); la zona de **acuse** — subir el PDF que devolvió el SPPLD mueve el aviso a `presentado`: el estado lo declara la evidencia, no un clic.
- **La frontera visible**: la pantalla dice explícitamente "VIZO no presenta. Descarga los lotes, preséntalos en el SPPLD con tu e.firma y registra aquí el acuse." La regla dura 5 como texto de producto, no como disclaimer legal.

### 3.6 Evidencia ○

Los tres artefactos probatorios que ya existen en backend, expuestos:

- **Manifiestos** del expediente: generar versión, verificar hash, historial de versiones.
- **Verificación de la cadena**: correr `bitacora_verificar` y mostrar "íntegra al corte de hoy" — o exactamente dónde se rompió.
- **Reconstrucción histórica**: "¿cómo estaba este expediente el 15 de mayo?" con el resultado fechado.

Nadie más en el segmento puede enseñar esta pantalla. Es la tesis de retención del producto hecha visible.

### 3.7 Calendario de obligaciones ○

El plazo del día 17 por periodo y actividad, con los estados de `plazoDePresentacion` (holgado / por vencer / vence hoy / vencido). Depende del issue #16 (fecha de alta ante la autoridad) para responder "desde cuándo debo informar en cero" — ese campo entra a Configuración.

### 3.8 Configuración ○

- **Del obligado**: RFC, razón social, **fecha de alta ante la autoridad** (#16), actividades contratadas (fracciones — aquí se ve el diseño multi-fracción).
- **Usuarios y roles**: invitar, asignar rol, desactivar. La matriz de §2 en acción.
- **Sucursales y desarrollos**: los catálogos operativos que hoy solo se tocan por SQL.
- **Plan** (informativo): la unidad de cobro es el RFC; la separación implementación/suscripción de la nota de precios se refleja aquí cuando exista cobro.

---

## 4. Onboarding del obligado

El flujo de alta que hoy no existe como experiencia (hoy: SQL). Ocho pasos, cada uno ya soportado por el esquema:

1. Alta del obligado (RFC, razón social) → 2. Fecha de alta ante la autoridad (#16) → 3. Actividades (fracción V Bis; el diseño admite más) → 4. Sucursales → 5. Desarrollos inmobiliarios → 6. Usuarios y roles → 7. Primer cliente y expediente → 8. Primer periodo: si no hubo operaciones reportables, **el primer acto de cumplimiento del cliente en VIZO es un informe en cero presentado** — valor visible el día uno.

El paso del REC aceptando su designación (Art. 10) se inserta entre 2 y 3 cuando se construya (#12).

---

## 5. Qué existe contra qué falta

| Área | Backend | UI | Trabajo restante |
|---|---|---|---|
| Motor + acumulación | ● probado | ◐ resultado plano | Veredicto explicable |
| Clientes/expedientes | ● probado | ● funcional | Pulido, completitud en lista |
| Operaciones | ● probado | ● funcional | Veredicto explicable |
| Alertas | ● probado | ● funcional | Enlaces + veredicto |
| Avisos (pipeline completo) | ● probado | ○ **nada** | Pantalla completa: la prioridad |
| Evidencia (manifiesto/cadena/reconstrucción) | ● probado | ○ nada | Pantalla de solo lectura |
| Calendario | ● probado | ○ nada | Pantalla + #16 |
| Configuración/onboarding | ◐ (esquema sí, flujos no) | ○ nada | Flujos + pantalla |
| Backoffice VIZO | ○ (hoy: migraciones) | ○ | Solo diseño (este doc) |

## 6. Plan de las dos semanas

**Semana A — la plataforma núcleo.** Shell de navegación con rol visible · pantalla de **Avisos** completa (lista, detalle, aprobar, acuse, lotes) · **Inicio** como semáforo · **veredicto explicable** en operaciones y alertas. Al cierre: el ciclo completo se opera con clics, con dos sesiones de rol distinto.

**Semana B — plataforma completa y cierre.** Configuración + onboarding (incluye #16) · Evidencia · Calendario · datos demo ricos (un desarrollo con clientes, expedientes y operaciones que ejercitan todos los caminos) · **prueba Fr. XV** (S11: alta por INSERTs, cero cambios en `src/`) · **demo de la plataforma** (S12) — que ahora es la demo de un SaaS, no de un motor.

**En paralelo, trabajo humano que ningún sprint sustituye:** contrastar el Acuerdo 115 contra el DOF (#9), las ocho preguntas al especialista PLD (#3), y las entrevistas con sujetos obligados — la ventana de novedad de la norma se cierra en semanas.

---

*La viabilidad del SaaS no la decide este documento: la decide poner esta plataforma frente a alguien del sector y ver qué pregunta hace primero.*
