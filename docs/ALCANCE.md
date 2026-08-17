# El alcance del SaaS — portal, backoffice y el sistema completo

**Fecha:** 10 de agosto de 2026 · **Complementa a:** `PLATAFORMA.md` (el diseño) · **Este documento:** qué entra, qué no, y cuándo

Regla de lectura: todo lo que está aquí es una **decisión**, no una idea. Cambiar algo de aquí es cambiar de dirección, y se hace a propósito.

---

## 0. Qué es VIZO — y las fronteras que no se cruzan

VIZO es **el sistema de registro del cumplimiento PLD de un sujeto obligado**, contratado por RFC. Todo lo que el obligado debe poder demostrar ante la autoridad —quién es su cliente, qué operaciones hizo, qué cálculo determinó cada obligación, qué avisó y cuándo— vive aquí, con evidencia verificable.

Lo que VIZO **no es, en ninguna fase** (fronteras de producto, no recortes):

1. **No presenta al SPPLD.** El envío es siempre del obligado con su e.firma. VIZO genera, valida, deja listo y registra el acuse.
2. **No decide riesgo con un LLM.** Ningún cálculo regulatorio sale de un modelo; un LLM a lo sumo asiste captura (F2+).
3. **No custodia e.firmas** ni credenciales del SAT. Nunca.
4. **No descarta coincidencias de screening** ni aprueba nada: toda decisión con peso legal es humana y queda registrada.
5. **No asesora legalmente.** Automatiza el cumplimiento de reglas verificadas contra fuente oficial; las dudas de interpretación van al especialista.

   **Cómo se verifica esta frontera** (ADR-20, al decidir el alcance del Manual de Políticas Internas): *VIZO no emite una sola frase que no pueda respaldar con un dato del sistema.* Todo documento que VIZO genere lleva una consulta de evidencia por sección; si la consulta no devuelve datos, la sección **no genera prosa: genera el hueco**, con su artículo citado. Es la regla dura 6 aplicada a un documento en vez de a un cálculo, y se prueba vaciando la evidencia y comprobando que sale el hueco.
6. **Sin impersonation.** Nadie de VIZO puede "entrar como" un cliente. El soporte, cuando exista, será un rol propio de solo lectura con consentimiento.

Estas seis líneas son el contrato de confianza del producto. Se venden tanto como las features.

### Los tres subsistemas

```
┌────────────────────┐   ┌────────────────────┐
│ PORTAL DEL OBLIGADO │   │ BACKOFFICE DE VIZO │
│  (uno por tenant)   │   │  (nuestro equipo)  │
└─────────┬──────────┘   └─────────┬──────────┘
          │       consumen         │ cura
          ▼                        ▼
┌───────────────────────────────────────────────┐
│                EL NÚCLEO (hecho)               │
│  motor de umbrales · bitácora encadenada ·     │
│  expediente · pipeline del aviso · RLS ·       │
│  catálogo regulatorio versionado por vigencia  │
└───────────────────────────────────────────────┘
```

El núcleo está construido y auditado (semanas 1–10). El catálogo regulatorio es el activo compartido: el backoffice lo cura, todos los portales lo consumen. Un valor mal cargado afecta a todos los clientes a la vez — por eso el backoffice hereda el patrón del aviso: **quien carga no es quien aprueba**.

### El ciclo de vida del cliente (lo que el software debe cubrir)

**Venta → Implementación** (proyecto cobrado aparte: carga inicial, sucursales, desarrollos, usuarios, capacitación) **→ Operación mensual** (captura → veredictos → aviso o informe en cero antes del día 17) **→ Ciclo anual** (reverificación de expedientes, auditoría Cap. XIV desde 2028) **→ Renovación/expansión** (más RFCs del mismo grupo).

Modelo comercial reflejado en software: **unidad de cobro = RFC obligado**; implementación separada de la suscripción (nota de precios del 10-ago). En F1 no hay software de cobro — facturación manual; Stripe u otro es F3.

---

## 1. Alcance del PORTAL

### Decisiones transversales de F1

- **Desktop-first, es-MX.** El capturista y el admin trabajan en escritorio. Responsive real es F2.
- **La UI nunca calcula**: pinta `evaluaciones_umbral` y estados de la base. Sin excepciones.
- **La UI refleja permisos de la base, jamás los inventa.** Botón deshabilitado = la base lo rechazaría.
- **Alta de usuarios en F1 la hace VIZO** (backoffice manual). El portal lista, cambia rol y desactiva. Invitaciones self-serve con correo: F2.
- **Onboarding en F1 es asistido**: lo ejecutamos nosotros con el runbook; el portal muestra un checklist de arranque visible para el cliente. Self-serve: F2.

### Mapa de rutas — F1 completo

| Ruta | Estado | Alcance F1 |
|---|---|---|
| `/login` | ● existe | Sin cambios |
| `/` Inicio | ◐ rediseño | Semáforo: periodo corriente (presentado / vence en N días / vencido), "requiere tu atención" con enlaces a la acción, el mes en números |
| `/clientes` + `/nuevo` + `/[id]/expediente` | ● existe | Completitud visible en la lista; huella explicada ("sin cambios desde que se subió") |
| `/operaciones` + `/nueva` | ● existe | + **Veredicto explicable** por operación |
| `/alertas` | ● existe | + veredicto explicable y enlaces a operación/cliente |
| `/avisos` | ○ nueva | Lista por periodo con estado del pipeline y plazo; los meses sin generar aparecen (el informe en cero es obligación, no ausencia) |
| `/avisos/[id]` | ○ nueva | Stepper de estados con quién/cuándo · lotes descargables con hash y tamaño · **Aprobar** (solo admin) · zona de acuse (subirlo mueve a `presentado`) · texto de frontera: "VIZO no presenta" |
| `/evidencia` | ○ nueva | Tres pestañas: manifiestos (generar/verificar/historial), cadena de bitácora (verificar → "íntegra" o dónde se rompió), reconstrucción histórica (expediente + fecha → estado a ese corte) |
| `/calendario` | ○ nueva | Plazos por periodo con estados de `plazoDePresentacion`. Muestra "desde cuándo debo" solo cuando exista la fecha de alta (#16, entra en F1) |
| `/configuracion` | ○ nueva | Pestañas: Obligado (RFC, razón social, **fecha de alta ante la autoridad** #16, actividades contratadas) · Usuarios (listar/rol/desactivar) · Sucursales (CRUD) · Desarrollos (CRUD) · Plan (informativo) |

**Componentes compartidos F1:** `VeredictoExplicable` (la representación del motor: resultado + desglose con UMA/vigencia, umbral, base, ventana, id de evaluación y versión de catálogo), `EstadoAviso` (stepper/pill), `PlazoBadge` (holgado/por vencer/vence hoy/vencido), shell con navegación y rol visible.

### Fuera del portal en F1 (decidido, no olvidado)

| Qué | Cuándo | Por qué |
|---|---|---|
| Captura por enlace al comprador (magic-link) | F2 | Puerta abierta en el esquema; el Art. 23 Ter la valida con Firma Electrónica, pero es alcance nuevo |
| ~~Rol REC como figura propia + aceptación de designación~~ | ✅ **construido el 15-ago** | Issue #12 cerrado. La designación es un estado con su tabla, sus transiciones y su paso de arranque. El REC sigue sin ser un rol de la app —es una figura con exposición personal— y eso no cambia |
| Aviso modificatorio y aviso 24h | F2 / bloqueado | El 24h espera Resolución de formatos (Transitorio Quinto) |
| Grado de riesgo, perfil transaccional, cuestionarios | F2/F3 | #9 ya cerró, así que el articulado está contrastado. Fechas y detalle en `ROADMAP-2027.md` |
| Manual de Políticas Internas | F2, **con frontera decidida** | ADR-20: VIZO acredita los 7 apartados que puede demostrar y deja el hueco en los otros 7. No redacta política |
| Parser CFDI | F2 | Recortable desde el plan original; captura manual completa existe |
| Notificaciones por correo | F2 | El semáforo cubre la necesidad en F1 |
| Multi-RFC / grupos | F3 | Issue #13; toca la decisión más delicada del esquema (aislamiento) |

---

## 2. Alcance del BACKOFFICE

Decisión central: **en F1 el backoffice es manual y documentado; el software del backoffice es F2, condicionado al go de viabilidad.** Construir pantallas para operar 1–3 clientes piloto es vanidad; documentar cómo se opera es obligatorio.

### F1 — runbooks (entregable: `docs/runbooks/` ✓ escritos el 12-ago)

1. [**Alta de un obligado**](runbooks/01-alta-de-obligado.md) — obligado, actividades, sucursales, usuarios. La verificación del alta es el propio checklist de arranque del portal.
2. [**Carga de una vigencia regulatoria**](runbooks/02-carga-de-vigencias.md) (UMA, umbrales, campos, formatos/XSD, catálogos SAT, parámetros): migración con **doble revisión contra el DOF** — quien redacta el SQL no es quien lo aprueba. El mismo patrón del aviso, ejercido por personas.
3. [**Monitoreo de la flota**](runbooks/03-monitoreo.md): CI, aserciones estructurales, y la consulta de salud (¿algún tenant con periodo vencido sin aviso?).
4. [**Soporte**](runbooks/04-soporte.md): qué se puede mirar (consulta de solo lectura, mínima y anotada) y qué jamás (impersonation).

### F2 — software (si el go se da)

- **Tenants**: alta guiada, estado, actividades por tenant.
- **Catálogo regulatorio**: la pieza mayor. Cargar una vigencia nueva propone un *draft*; un segundo rol la aprueba citando la fuente del DOF; la publicación queda en bitácora propia del backoffice. Sin draft aprobado, nada entra a producción.
- **Salud de la flota**: periodos por vencer/vencidos por tenant, errores de validación XSD recurrentes, expedientes estancados.
- **Roles internos**: operador regulatorio (carga), aprobador regulatorio (verifica contra DOF), soporte (solo lectura).

Fuera del backoffice para siempre: impersonation, edición de datos de clientes finales, tocar la bitácora de un tenant.

---

## 3. Fases y la compuerta de decisión

```
F0  NÚCLEO            ✓ hecho (semanas 1–10, auditado, CI verde)
F1  PLATAFORMA        ~2 semanas — portal F1 completo + runbooks + Fr. XV + demo
─── COMPUERTA DE VIABILIDAD ───────────────────────────────────────
F2  PRODUCTO 2027     solo con GO: backoffice software, REC, magic-link,
                      capítulos del Acuerdo (tras #9), modificatorio
F3  ESCALA            multi-RFC, billing, notificaciones, auditor
```

### La compuerta (el punto de este documento)

F1 **no termina en más software: termina en una decisión.** Insumos para tomarla, ninguno construible por mí:

1. **Contraste contra el DOF** (#9) — ¿las reglas implementadas son las correctas? Incluye la pregunta que puede invalidar el número central: base del umbral con/sin IVA (#3).
2. **Respuestas del especialista PLD** (#3) — las ocho preguntas abiertas.
3. **Entrevistas** — mínimo 5 sujetos obligados del segmento ancla viendo la demo. Qué preguntan primero, qué usan hoy, qué les cotizó un despacho, cuántos compradores extranjeros tienen.

**GO** = las reglas resisten el contraste **y** ≥3 de 5 entrevistados expresan intención concreta (piloto, carta de intención, o "cuánto cuesta"). **NO-GO** = el aprendizaje queda documentado, el núcleo queda como portafolio técnico, y la retro mide lo que este ejercicio realmente fue.

Cualquier resultado responde la pregunta original del proyecto. Por eso F1 se construye: sin demo operable no hay entrevista que valga.

---

## 4. Presupuesto de F1 (≈10 días hábiles)

| Bloque | Días |
|---|---|
| Shell + navegación + rol visible | 0.5 |
| `/avisos` + `/avisos/[id]` completo | 2 |
| Inicio como semáforo | 1 |
| Veredicto explicable (operaciones + alertas) | 1 |
| `/configuracion` + fecha de alta (#16) | 1.5 |
| `/evidencia` | 1 |
| `/calendario` | 0.5 |
| Checklist de arranque (onboarding asistido) | 0.5 |
| Runbooks del backoffice | 0.5 |
| Datos demo ricos | 1 |
| Prueba Fr. XV (solo INSERTs) | 0.5 |
| Guion de demo + cierre | 0.5 |

Con el ritmo real demostrado, esto es agresivo en calendario humano y holgado en calendario nuestro. La restricción de F1 no es construir: es que las entrevistas y el DOF avancen en paralelo.

### Cierre de F1 — 12 de agosto de 2026

Los doce bloques están entregados. Además se construyeron tres piezas que el presupuesto no contemplaba, cada una porque el trabajo destapó que faltaba: el **flujo de aprobación del expediente**, la **reconstrucción histórica con pantalla**, y el **aviso modificatorio** —que era F2, y se adelantó porque exige el folio del acuse, un dato que no se estaba guardando y que sin él habría que migrar avisos ya presentados—.

**Lo que queda es la compuerta, y ninguna de sus tres entradas es código.** Cualquier semana adicional de construcción antes del contraste contra el DOF es una semana apostada a que las reglas implementadas son las correctas — que es exactamente la pregunta que la compuerta existe para responder.

> **Corregido el 15 de agosto de 2026 (ADR-19).** La primera entrada de la compuerta —el contraste contra el DOF— **ya se hizo**, y con ella cayó el argumento del párrafo anterior: lo que se construya sobre reglas marcadas ✅ DOF en `ACUERDO-115-2026.md §0` ya no es una apuesta. Las entrevistas se posponen y el build continúa con las obligaciones verificadas (#12, #11, #10). **La compuerta no se cancela: se mueve**, y vuelve a mandar en cuanto el trabajo pendiente deje de tener fundamento citable — el primer punto donde eso pasa es el Manual de Cumplimiento. El riesgo de mercado sigue intacto y ahora se acumula a la vista.

> **Pendiente de despliegue, descubierto al cerrar F1:** el proyecto remoto va **9 migraciones atrás** del repositorio y sus usuarios no tienen contraseña, así que `app.vizo.mx` no es demostrable. Detalle e implicaciones en el issue #8.
