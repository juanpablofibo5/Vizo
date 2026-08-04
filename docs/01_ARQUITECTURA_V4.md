# VIZO — Arquitectura técnica v4

**Complemento a la v3.** No sustituye las capas 0–7; las aterriza en modelo de datos, decisiones cerradas y criterios de verificación.

---

## 1. Principio rector

> Todo lo regulatorio es **dato versionado por vigencia**. Nada regulatorio es **código**.

Consecuencia práctica: si el 12 de septiembre salen las RCG con formatos nuevos, la respuesta debe ser insertar filas en el catálogo y subir un XSD nuevo — no abrir un editor de código.

Prueba de que se cumple: *¿puedo dar de alta la Fracción VI (joyería) sin hacer un deploy?* Si la respuesta es no, la Capa 0 está mal construida.

---

## 2. Modelo de datos

### 2.1 Multi-tenant

Un solo esquema, aislamiento por `tenant_id` con Row Level Security. Cada cliente obligado es un tenant; las sucursales viven **dentro** del tenant (la matriz consolida — es lo que hace posible detectar acumulación cross-sucursal).

```
tenants                    -- cliente obligado (RFC, razón social, domicilio SPPLD)
  sucursales               -- puntos de venta del tenant
  actividades_tenant       -- qué fracciones del Art. 17 realiza (puede ser más de una)
  usuarios                 -- vendedor | rec | administrador
```

Regla no obvia: cuando un tenant realiza más de una actividad vulnerable, **los umbrales, expedientes y avisos se calculan por fracción y no se suman entre fracciones distintas**. Una agencia que vende autos y además otorga créditos presenta avisos separados por Fr. VIII y Fr. IV. El modelo debe forzar esa separación, no permitirla como opción.

### 2.2 Catálogo regulatorio (Capa 0)

```
uma_vigencias              -- valor, vigente_desde, vigente_hasta, fuente_dof
actividades_vulnerables    -- fraccion, nombre, descripcion
umbrales                   -- actividad, tipo(identificacion|aviso|efectivo),
                              valor_uma, base(con_iva|sin_iva),
                              vigente_desde, vigente_hasta
campos_expediente          -- actividad, campo, obligatorio, tipo, validacion
formatos_aviso             -- actividad, version_xsd, ruta_xsd, vigente_desde
```

Notas de diseño:

- `uma_vigencias` con vigencias reales: la UMA se publica en enero pero **los umbrales entran en vigor el 1 de febrero**. Las operaciones de enero se evalúan con la UMA del año anterior. Modelarlo como `uma_vigente(fecha_operacion)`.
- `umbrales.base` es lo que resuelve la trampa del IVA: Art. 17 se evalúa `sin_iva`, Art. 32 `con_iva`. Es una columna, no un `if`.
- Nada de esto se toca sin migración registrada y sin prueba nueva.

### 2.3 Núcleo operativo

```
clientes_finales           -- persona identificada por el tenant
                              rfc, curp, nombre_normalizado, tipo_persona,
                              nacionalidad, identidad_alterna (extranjeros sin RFC)
beneficiarios_controladores-- ligados a cliente persona moral (umbral 25%)
operaciones                -- tenant, sucursal, cliente, actividad, fecha,
                              monto_base, iva, monto_total, forma_pago,
                              cfdi_uuid, descripcion_bien
expedientes                -- operacion(es), estatus_completitud, version
documentos                 -- expediente, tipo, storage_path, hash_sha256
verificaciones_kyc         -- expediente, proveedor, resultado, payload, fecha
consultas_screening        -- sujeto, listas_consultadas, coincidencias,
                              resolucion_humana, resuelto_por, resuelto_en
evaluaciones_umbral        -- operacion, umbral_aplicado, uma_aplicada,
                              resultado, requiere_aviso, motivo
acumulados                 -- cliente, actividad, ventana_inicio, ventana_fin,
                              suma, disparó_aviso_en
avisos                     -- tenant, periodo, tipo(normal|acumulacion|24h|cero),
                              xml_generado, estatus, acuse_sppld
sellos_nom151              -- objeto_sellado, hash, constancia, psc, fecha_cierta
bitacora                   -- append-only, todo evento sobre todo objeto
```

### 2.4 Bitácora inmutable

No es una tabla de auditoría cualquiera. Es el objeto que se defiende en una visita de verificación.

- Solo `INSERT`. Sin `UPDATE`, sin `DELETE`, forzado por permisos de rol en Postgres, no por convención.
- Encadenada: cada registro incluye el hash del anterior. Alterar un evento intermedio rompe la cadena de forma detectable.
- El hash de la cabeza de la cadena entra en el manifiesto sellado del expediente.

### 2.5 Conservación: 10 años

La reforma subió el plazo de 5 a 10 años para operaciones realizadas a partir del 17 de julio de 2025. Las anteriores conservan el plazo previo.

Implicación de costo que nadie modela: **almacenamiento por una década**. Fotos de identificaciones a resolución alta durante 10 años, multiplicado por miles de expedientes, no es gratis. Definir desde ahora una política de compresión y de almacenamiento frío para expedientes cerrados, y que el hash sellado se calcule sobre el archivo que efectivamente se conserva, no sobre uno que después se recomprime.

---

## 3. Motor de umbrales (Capa 4) — el corazón

Es el único componente que no se delega. Especificación funcional:

**Entrada:** operación (tenant, sucursal, cliente, actividad, fecha, monto base, IVA, forma de pago).

**Proceso:**

1. Resolver `uma_vigente(fecha)`.
2. Resolver umbrales vigentes para la actividad en esa fecha.
3. Evaluar **identificación**: `monto_base >= umbral_identificacion` (o `siempre` para Fr. V, V Bis, III, IV, X, XVI).
4. Evaluar **aviso individual**: `monto_base >= umbral_aviso`.
5. Evaluar **acumulación**: sumar operaciones del mismo cliente, misma actividad, que individualmente caigan en supuesto de identificación, dentro de una ventana de 6 meses hacia atrás. Si la suma cruza el umbral de aviso **en esta operación**, disparar aviso por acumulación ahora.
6. Evaluar **restricción de efectivo** con `monto_total` (con IVA) contra el límite del Art. 32.
7. Registrar la evaluación completa en `evaluaciones_umbral`, incluyendo qué UMA y qué versión de catálogo se usaron. Sin esto no hay cómo defender el cálculo tres años después.

**Salidas:** requiere identificación (sí/no) · requiere aviso (no / individual / acumulación) · efectivo permitido hasta X · alerta de proximidad al umbral · bloqueo blando si cruza sin expediente completo.

### 3.1 Casos de prueba obligatorios

Esta suite es el criterio de verificación de todo el proyecto. Debe existir **antes** que el motor.

| # | Caso | Esperado |
|---|---|---|
| 1 | Auto de $800,000 (Fr. VIII, umbral aviso $753,130) | Aviso individual |
| 2 | Dos autos de $400,000 al mismo cliente con 3 meses de diferencia | Aviso por acumulación disparado en la **segunda** operación |
| 3 | Los mismos dos autos con 8 meses de diferencia | Sin aviso por acumulación |
| 4 | Operación de $1,000,000 + IVA $160,000, umbral aviso $941,412 | Rebasa umbral (base) **y** rebasa límite de efectivo (total) |
| 5 | Operación del 15 de enero de 2026 | Se evalúa con UMA 2025 ($113.14), no 2026 |
| 6 | Operación del 15 de febrero de 2026 | Se evalúa con UMA 2026 ($117.31) |
| 7 | Preventa inmobiliaria de $200,000 (Fr. V Bis) | Requiere identificación (siempre), no requiere aviso |
| 8 | Tenant con Fr. IV y Fr. VIII, cliente con operaciones en ambas | Acumulados **independientes**, nunca sumados entre fracciones |
| 9 | Mismo cliente, dos sucursales distintas, suma cruza umbral | Aviso por acumulación (esta es la promesa del pitch) |
| 10 | Operación un centavo por debajo del umbral | Alerta de proximidad, sin aviso |

Los casos 1, 2 y 4 están tomados de ejemplos oficiales del SAT. Los otros derivan de reglas explícitas del marco. Si alguno falla, no se despliega.

---

## 4. Captura por link (Capa 1A) — seguridad

El link es la superficie pública del sistema. Es por donde entran datos personales sensibles sin sesión ni cuenta.

- Token opaco de un solo uso, aleatorio criptográficamente. **Nada de datos sensibles ni identificadores adivinables en la URL.**
- Expiración configurable por tenant; por defecto corta.
- El token se guarda hasheado, no en claro.
- Rate limiting por IP y por token.
- Guardado parcial atado al token, no a una cookie.
- Subida directa del navegador al storage con URL firmada de corta vida — el archivo no pasa por el servidor de aplicación.
- Cifrado en reposo. Los biométricos y las identificaciones son **datos sensibles** bajo la LFPDPPP: la multa se duplica.
- Aviso de privacidad en modalidad simplificada mostrado **antes** de la primera captura, con enlace al integral. Es obligación del Art. 35, no cortesía.
- Ningún dato personal en logs, en Sentry, ni en mensajes de error. Esta regla se rompe sola si no hay un hook que la vigile.

---

## 5. Screening (Capa 3) — calibración

El error de diseño más común aquí es optimizar contra falsos positivos. Es el error equivocado.

- Un falso positivo cuesta cinco minutos de revisión humana.
- Un falso negativo es un aviso que debió presentarse y no se presentó: multa de 10,000 a 65,000 UMA y exposición penal.

Reglas:

1. Umbral de coincidencia deliberadamente bajo. Coincidencia fonética y difusa activadas por defecto.
2. **Toda** coincidencia se escala a revisión humana. El sistema nunca descarta por su cuenta.
3. El descarte se registra con quién, cuándo y con qué razonamiento. Esa evidencia es lo que se presenta si la autoridad pregunta por qué se operó con esa persona.
4. Se consulta el 100% de los clientes, independientemente del monto — el cotejo contra listas no está sujeto a umbral.
5. Se re-consulta periódicamente a clientes activos: las listas cambian, OFAC se actualiza varias veces por semana.

Listas mínimas: OFAC SDN · Consejo de Seguridad de la ONU (anexos A–D publicados por la UIF) · Lista de Personas Bloqueadas de la UIF · Art. 69-B del CFF (EFOS/EDOS) · PEPs.

---

## 6. Generación del aviso (Capa 6)

- Se genera XML validado **contra el XSD oficial vigente** de la actividad, tomado de `formatos_aviso`. La validación es parte del pipeline, no una revisión manual.
- Fragmentación automática por el límite de **2 MB** del SPPLD, con numeración de lotes coherente.
- Informes en cero cuando no hubo operaciones que reportar en el mes.
- Aprobación humana obligatoria antes de marcar como listo. El sistema asiste, no envía.
- El envío al portal lo hace el REC con su e.firma. VIZO registra el acuse que el REC sube de vuelta y lo sella junto con el XML.

**Criterio de aceptación del producto:** el XML valida contra el XSD oficial. Es binario, automatizable, y es la prueba más dura que existe de que el producto funciona.

---

## 7. Decisiones cerradas en esta versión

| Decisión abierta en v3 | Resolución v4 |
|---|---|
| Granularidad del sellado | Manifiesto del expediente, una constancia por versión. Ver Plan Maestro §1.3. Sujeta a visto bueno del consultor. |
| Proveedor KYC | Didit como primario por precio público y sin mínimos; Nubarium como complemento para validaciones mexicanas (INE, RENAPO, CURP). Incode/MetaMap son ahora un solo proveedor. |
| Proveedor de screening | OpenSanctions. API hospedada en piloto, `yente` autohospedado al escalar. **Condicionado a la cotización de licencia reseller.** |
| Ingesta CFDI | Carga manual de XML en Fase 1. Sin custodia de e.firma. Descarga masiva vía proveedor en Fase 2. |
| Primer incremento a construir | Motor de umbrales con suite de pruebas, no el formulario. |

---

## 8. Lo que sigue sin resolver

- Estrategia de identidad para compradores extranjeros sin RFC. Bloquea la promesa de acumulación cross-sucursal en el segmento del sureste. **A resolver con el consultor en Fase 0.**
- Modelo de la matriz de riesgo por cliente: qué factores, qué pesos, qué evidencia. Depende de las RCG (enfoque basado en riesgos, Art. 18 fr. VII).
- Costo real de conservación a 10 años y política de almacenamiento frío.
