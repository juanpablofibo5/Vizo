# VIZO — Plan maestro de ejecución

**Versión 1 · 3 de agosto de 2026**
Documento de arranque. Sustituye la sección "Siguientes pasos" de la Arquitectura v3.

---

## Resumen ejecutivo

La arquitectura v3 está bien pensada. La investigación no la contradice, pero cambia cinco cosas de forma material:

1. **Las Reglas de Carácter General están vencidas y son inminentes.** El plazo legal venció el 16–17 de julio de 2026 y al cierre de esa fecha no se habían publicado. Van a redefinir los formatos oficiales de avisos, el alta en el SPPLD y activar el aviso de 24 horas. Esto es simultáneamente el mayor riesgo técnico del proyecto y la mejor ventana de mercado que va a existir.
2. **Los costos variables están sobrestimados entre 3× y 5×.** El costo real por expediente está cerca de $32 MXN, no $90. El problema no son los costos variables: son dos costos fijos que el documento no contempla (licencia de datos de screening y consultor PLD).
3. **La granularidad del sellado tiene una respuesta técnica defendible.** No hace falta seguir con esa decisión abierta.
4. **La competencia es el doble de densa** de lo que asume el documento, y generar el XML del aviso **no es diferenciación** — todos lo hacen.
5. **El primer incremento a construir no es el formulario de captura.** Es el motor de umbrales con su suite de pruebas.

---

## 1. Hallazgos que cambian decisiones

### 1.1 Las RCG: el reloj que define todo

Cronología verificada:

| Fecha | Hecho |
|---|---|
| 16 jul 2025 | Se publica en DOF la reforma a la LFPIORPI (y al Art. 400 Bis del CPF) |
| 17 jul 2025 | Entra en vigor. Umbrales nuevos, conservación a 10 años, beneficiario controlador al 25% |
| 27 mar 2026 | Se publica la reforma al Reglamento (vigente 28 mar 2026) |
| 16 jul 2026 | Vence el plazo de la SHCP para emitir las RCG. **No se publicaron.** |
| Hoy | Pendientes. Verificar antes de escribir cualquier línea de código regulatorio. |

Lo que traerán las RCG cuando salgan:

- Nuevos formatos y modelos de avisos → **nuevos XSD**
- Nuevos formatos de inscripción en el SPPLD
- El **aviso de 24 horas** por operación intentada o sospechosa
- Procedimiento de consulta de PEPs ante la UIF
- Medidas simplificadas de identificación
- Requisitos de auditoría y de mecanismos de monitoreo automatizado

Además, cinco obligaciones del Art. 18 (fr. VII a XI) están hoy **en pausa** y se activan con las RCG: enfoque basado en riesgos, manual de políticas, capacitación anual, mecanismos automatizados con perfil transaccional, y auditoría anual.

**Qué significa para el producto.** Cuando salgan, los ~218,000 sujetos obligados del padrón tienen que actualizar procesos al mismo tiempo. Es un evento de compra masivo y sincronizado. Entrar al mercado con un producto que ya está listo para absorber el cambio es una ventaja de timing que no se repite.

**Qué significa para la arquitectura.** La decisión de la Capa 0 (motor de reglas parametrizable) deja de ser elegancia y pasa a ser condición de supervivencia. Regla dura:

> Ningún umbral, ningún campo obligatorio de expediente, ningún formato de aviso, ningún valor de UMA se escribe en código. Todo vive como datos versionados por vigencia.

**Qué hay que dejar previsto.** El aviso de 24 horas no es una variante del aviso mensual. El mensual es batch con fecha límite el día 17; el de 24 horas es *event-driven* con disparo por sospecha. Si el modelo de datos solo contempla el ciclo mensual, ese módulo se convierte después en una refactorización, no en una feature.

### 1.2 La economía real

| Concepto | Supuesto v3 | Realidad investigada | Fuente |
|---|---|---|---|
| KYC | $35 MXN | **~$6 MXN** (Didit: $0.33 USD por flujo completo, 500 gratis/mes, precio público) | Precios públicos Didit |
| Screening | $30 MXN | **~$2 MXN por consulta** (OpenSanctions API €0.10) o fijo si se autohospeda `yente` | OpenSanctions |
| Sellado NOM-151 | $25 MXN | **$18–26 MXN por constancia** (AllSign desde $18; MiFiel $89/doc; Cincel por paquetes) | Precios públicos |
| Mensajería | $5 → $0 | $0 confirmado | — |

Costo variable realista, con 1 KYC + 2 consultas de screening (cliente y beneficiario controlador) + 1 constancia por expediente:

**≈ $32 MXN por expediente.** A precio de $180, margen bruto ≈ 82%.

Dos correcciones importantes al modelo:

- **Incode absorbió a MetaMap en 2025.** Ya no son dos candidatos independientes; son uno. Los candidatos reales son: Didit (precio público, barato, cobertura global), Nubarium (especialista mexicano: INE, RENAPO, CURP, SAT, IMSS), Incode y Truora (enterprise, cotización cerrada).
- **OFAC, ONU, la Lista de Personas Bloqueadas de la UIF y el 69-B del SAT son públicas y gratuitas.** Lo único que realmente se paga en screening es la base de PEPs y la infraestructura de *fuzzy matching*. Esto tira por tierra la necesidad de ComplyAdvantage / Dow Jones / LSEG en año 1.

**Los costos que sí importan y no están en el documento:**

1. **Licencia de datos de OpenSanctions en modalidad *reseller/OEM*.** VIZO no es usuario interno: incorpora los datos a un producto que le vende a terceros. Esa licencia es más cara que la de uso interno y **es una incógnita que puede cambiar la viabilidad**. Hay que cotizarla antes de comprometerse con el proveedor.
2. **El consultor PLD.** Validación inicial de umbrales, formato de aviso y granularidad de sellado, más un retenedor para cuando salgan las RCG. Es el costo fijo más importante del año 1 y no está presupuestado.

La conclusión honesta: **el costo variable nunca fue el problema.** El modelo financiero debe reescribirse alrededor de los costos fijos.

### 1.3 Granularidad del sellado: propuesta cerrada

El documento marca esto como decisión abierta. Propuesta técnica para llevarle al consultor ya resuelta, no como pregunta:

**Sellar el manifiesto del expediente, no cada documento.**

El manifiesto es un JSON canónico que contiene:

- El hash SHA-256 de cada documento del expediente (identificación, comprobante, CFDI, evidencias)
- Los metadatos de la operación (monto, fecha, forma de pago, RFC, fracción aplicable)
- El resultado de KYC y de cada consulta de screening, con su timestamp
- El hash de la bitácora hasta ese punto
- La versión del catálogo de reglas con que se evaluó

Se emite **una constancia por versión sellada del expediente**. Cuando el expediente cambia (llega un documento faltante, se corrige un dato), se sella una versión nueva; las anteriores se conservan.

Por qué funciona:

- El objeto que la autoridad requiere en una visita es *el expediente*, no cada archivo suelto.
- Una sola constancia prueba la integridad de todos los componentes, y permite verificar después documento por documento comparando hashes.
- Hace el costo lineal en expedientes en vez de lineal en documentos. Sellar 4 documentos por separado cuesta 4×.
- El hash de la bitácora dentro del manifiesto ata la cadena de custodia al historial de acciones, que es exactamente lo que se defiende en una verificación.

Aparte, sellar una vez al mes el par **aviso XML + acuse del SPPLD**. Ese costo se amortiza sobre todo el lote y es marginal.

Esto sigue requiriendo el visto bueno del consultor PLD. La diferencia es que llegas con una propuesta defendible en vez de una pregunta abierta.

### 1.4 Acumulación: 6 meses, ventana deslizante, disparo inmediato

Confirmado en el webinar oficial SAT–UIF del 20 de junio de 2026:

- El periodo de acumulación es de **6 meses**.
- El aviso se presenta **en el momento en que la suma alcanza o rebasa el umbral**, no al cierre del periodo. Si se rebasa en el mes 2, se presenta en el mes 2.
- En la suma solo entran los actos que **individualmente** se ubican en el supuesto de identificación.

Implicaciones de ingeniería:

- No es un job mensual. Es una evaluación que se dispara con cada operación nueva contra una ventana deslizante de 6 meses.
- Depende por completo de la **resolución de identidad del cliente**. "Mismo cliente en dos sucursales" solo funciona si RFC y CURP están normalizados y hay estrategia para clientes sin RFC (extranjeros — justo el caso del sureste). Este es el punto donde la promesa del pitch se gana o se pierde.

### 1.5 IVA: dos reglas opuestas en el mismo sistema

Aclarado por el Reglamento reformado (Art. 6, DOF 27/03/2026) y confirmado por el SAT:

| Artículo | Qué mide | ¿Incluye IVA y accesorios? |
|---|---|---|
| Art. 17 | Umbrales de identificación y aviso | **NO** — solo monto base |
| Art. 32 | Restricción de pago en efectivo | **SÍ** — incluye IVA y accesorios |
| Aviso presentado | Monto reportado | Total recibido, incluyendo contribuciones |

Tres reglas distintas sobre el mismo número. Es exactamente el error que un Excel comete y un motor bien construido no. Es argumento de venta y es prueba unitaria obligatoria.

### 1.6 Los umbrales cambian el 1 de febrero, no el 1 de enero

El INEGI publica la UMA en enero, pero los umbrales entran en vigor el 1 de febrero. Las operaciones de enero se evalúan con la UMA del año anterior.

El motor no puede tener una constante `UMA_2026`. Necesita `uma_vigente(fecha_de_operacion)` con una tabla de vigencias.

UMA 2026: **$117.31 diarios** ($3,566.22 mensual, $42,794.64 anual). UMA 2025: $113.14.

### 1.7 Umbrales de los dos verticales ancla (UMA 2026)

| Fracción | Actividad | Identificación | Aviso | Límite efectivo |
|---|---|---|---|---|
| **V Bis** | Desarrollo inmobiliario | **Siempre** | 8,025 UMA = $941,412.75 | 8,025 UMA |
| **VIII** | Vehículos terrestres, aéreos y marítimos | 3,210 UMA = $376,565.10 | 6,420 UMA = $753,130.20 | 3,210 UMA |
| V | Comercialización de inmuebles | Siempre | 8,025 UMA = $941,412.75 | 8,025 UMA |

**Ojo con la Fracción V Bis:** identificación "siempre" significa que un desarrollador en preventa integra expediente de **cada** comprador sin importar el monto. Eso multiplica el volumen de expedientes. Es bueno para VIZO, que cobra por expediente, pero hay que decirlo en el diagnóstico y no dejar que el cliente lo descubra en la primera factura.

### 1.8 Restricciones técnicas duras del SPPLD

- **Límite de 2 MB por archivo XML.** Un desarrollador con cientos de avisos lo rebasa. Hay que fragmentar por lotes desde el diseño, no como parche.
- **No existe API.** El envío es manual por el portal, con e.firma del REC. La arquitectura v3 ya lo asume correctamente: VIZO deja el aviso listo, no lo presenta.
- Los XSD e instructivos están publicados **por actividad vulnerable** en el SPPLD. Son la especificación real del producto.

### 1.9 No custodies la e.firma del cliente

Para la ingesta CFDI automática vía descarga masiva del SAT se requiere la e.firma del contribuyente (.cer + .key + contraseña). Eso es la llave fiscal completa de la empresa: permite facturar, presentar declaraciones y firmar actos con efectos legales.

Custodiarla en una empresa de un desarrollador en año 1 es una exposición desproporcionada. Si algo pasa, el daño no es una multa: es responsabilidad sobre actos fiscales del cliente.

- **Fase 1:** carga manual de XML (arrastrar y soltar, o un buzón de correo dedicado por cliente al que reenvían sus facturas).
- **Fase 2:** descarga masiva vía un proveedor que custodie las credenciales (Facturapi, CSFacturación, SW Sapien), nunca VIZO directamente.

### 1.10 La competencia

Competidores directos identificados que ya generan avisos XML para el SPPLD:

ALDDA · Kumpli · ArmorAML · KYC Systems · Regcheq (PLD X) · PreveNet · Artu AI

Son siete, no dos. El más peligroso no es ALDDA: es **KYC Systems**, que tiene una máquina de contenido SEO que domina las búsquedas de "umbrales", "listas negras", "SPPLD" y ya está vendiendo la conexión a la PUI como producto aparte. Están capturando la demanda antes de que llegue a comparar.

**Conclusión incómoda: generar el XML del aviso no es diferenciación.** Es tabla de apuesta. Los diferenciadores que quedan en pie son:

1. La captura sin fricción (el link) — nadie más lo hace así
2. La acumulación cross-sucursal con resolución de identidad seria
3. Bilingüe para compradores extranjeros — real en el sureste
4. El sellado NOM-151 como cadena de custodia completa
5. La relación local

Recomendación de posicionamiento: **no compitas en "software PLD". Compite en "el expediente se cierra solo".** Es el único claim que ninguno de los siete puede hacer hoy.

### 1.11 LFPDPPP nueva (marzo 2025)

La ley de datos personales se sustituyó completa el 20 de marzo de 2025 (vigente desde el 21).

- El INAI desapareció. La autoridad ahora es la **Secretaría Anticorrupción y Buen Gobierno**.
- Multas de 100 a 320,000 UMA, **se duplican tratándose de datos sensibles**. Los biométricos son sensibles.
- Hasta 5 años de prisión por tratamiento con engaño o con fin de lucro indebido.
- **No hay requisito de localización de datos.** Supabase y Vercel en regiones de EE. UU. son jurídicamente viables.

Pero hay una estructura contractual que no se puede saltar:

> El cliente obligado es el **responsable** del tratamiento. VIZO es el **encargado**. Supabase, Vercel, Didit y el PSC son **sub-encargados** de VIZO.

Eso obliga a: un contrato de encargado con cada cliente, que el aviso de privacidad del cliente contemple la cadena de sub-encargados, y cláusulas de transferencia internacional. Sin eso, VIZO opera en incumplimiento desde el primer expediente. **Grecia debería redactar esto en Fase 0, no después.**

### 1.12 PUI — adyacente, no scope

La Plataforma Única de Identidad (RENAPO/ATDT) obliga a interconexión a hospedaje, salud, financiero, transporte, telecom y educación. **Inmobiliarias y automotrices no están en la lista.** No aplica a VIZO hoy.

Vale la pena tenerlo en el radar por dos razones: el sector hospedaje sí está obligado y es donde Terra58 tiene red; y a mediano plazo la CURP biométrica se convierte en el Documento Nacional de Identificación, lo que desplazará parte del valor de los proveedores KYC actuales hacia el SNIP.

---

## 2. Fases de ejecución

### Fase 0 — Certidumbre · 2 a 3 semanas · sin código de producto

El objetivo es eliminar todo lo que puede invalidar la arquitectura después de haber escrito código.

1. **Descargar los XSD e instructivos vigentes** del SPPLD para Fracción V Bis (o V) y Fracción VIII, y meterlos al repo bajo `regulatorio/xsd/`. Son la especificación real del modelo de datos. Sin ellos no se puede diseñar la tabla de expedientes.
2. **Verificar el estado de las RCG** en el DOF y en el SPPLD. Configurar alerta. Si salen a mitad del desarrollo, es un cambio de datos; si el diseño no lo previó, es una reescritura.
3. **Cotizar en firme:**
   - OpenSanctions — licencia *reseller/OEM*, no de uso interno
   - Didit y Nubarium — KYC, y confirmar validación contra INE/RENAPO
   - PSC NOM-151 — AllSign, Cincel, Incode PSC (volumen y precio por constancia)
   - Confirmar si la base de PEPs de México requiere pago aparte
4. **Contratar al consultor PLD** y llevarle una lista **cerrada** de preguntas, no una conversación abierta:
   - ¿Confirmas estos umbrales por fracción y su vigencia desde el 1 de febrero?
   - ¿El manifiesto sellado del expediente satisface la exigencia de fecha cierta, o la autoridad espera constancia por documento?
   - ¿Qué campos son obligatorios en el expediente para Fr. V Bis y Fr. VIII, más allá de lo que dice el XSD?
   - ¿Cómo se documenta el criterio de identidad de cliente para acumulación cuando no hay RFC (comprador extranjero)?
   - ¿Qué tratamiento debe darse a una coincidencia de screening descartada, y qué evidencia se conserva?
5. **Cerrar con el cliente ancla** el alcance del piloto y la métrica de decisión por escrito.

**Entregable:** `regulatorio/decisiones.md` con todo cerrado y fechado, más los XSD en el repo.

### Fase 1 — Núcleo verificable · 6 a 8 semanas

El primer incremento demostrable **no es el formulario**. Es el motor de umbrales, porque es lo único que no se delega a un tercero y lo único donde un error tiene consecuencia penal.

1. **Motor de reglas y umbrales.** Catálogo de actividades como datos, UMA temporal, cálculo diferenciado Art. 17 / Art. 32, acumulación de 6 meses en ventana deslizante, alertas escalonadas. Con una suite de pruebas derivada de los ejemplos oficiales del SAT.
2. **Modelo de datos multi-tenant con RLS.** Aislamiento por cliente obligado, con sucursales dentro del mismo tenant.
3. **Formulario de captura por link.** Token firmado de un solo uso, sin datos sensibles en la URL, guardado parcial, responsivo primero.
4. **Parser CFDI 4.0** para extraer monto, forma de pago, RFC, fecha y descripción.
5. **Panel mínimo:** lista de expedientes con estatus de completitud y rol de vendedor.

**Criterio de verificación:** la suite de pruebas del motor de umbrales corre en CI y pasa. Esto es lo que le permite a Claude Code trabajar sin supervisión constante — sin un check que devuelva pasa/falla, tú eres el bucle de verificación.

### Fase 2 — Cumplimiento completo · 6 a 8 semanas

KYC, screening con revisión humana obligatoria, sellado NOM-151, generación del XML del aviso, bitácora inmutable, informes en cero, panel bilingüe.

**Criterio de verificación:** el XML generado valida contra el XSD oficial del SAT. Es un test automatizable y es el criterio de aceptación más duro que tiene el producto. Si valida, el aviso es presentable.

### Fase 3 — Piloto en producción

Correr en paralelo al proceso actual del cliente durante un ciclo mensual completo. Métricas: porcentaje de expedientes completos sin que nadie persiga al cliente, y minutos por aviso frente al proceso manual.

### Fase 4 — Condicionadas por evidencia

WhatsApp nativo (según los gatillos ya definidos en la v3) · aviso de 24 horas (cuando salgan las RCG) · descarga masiva de CFDI vía proveedor · verticales adicionales como configuración.

---

## 3. Stack y servicios

| Capa | Servicio | Por qué este | Costo estimado |
|---|---|---|---|
| Frontend / panel | Vercel | Ya lo usas, preview deploys por rama, MCP conectado | $0–20 USD/mes |
| BD, Auth, Storage | Supabase — **proyecto propio, separado de Klokk** | RLS nativo en Postgres, storage cifrado, MCP conectado | $25 USD/mes (Pro) |
| KYC | Didit | Precio público, 500 gratis/mes, sin mínimos, servidor MCP para Claude Code | ~$6 MXN/expediente |
| Screening | OpenSanctions — API hospedada primero, `yente` autohospedado después | Listas públicas + PEP, motor MIT, los datos del cliente no salen si autohospedas | €0.10/consulta o licencia fija |
| Sellado | AllSign / Cincel / Incode PSC | Acreditados por Secretaría de Economía | $18–26 MXN/constancia |
| CFDI | Parser propio de XML | Cero dependencia externa en Fase 1 | $0 |
| Correo transaccional | Resend | Envío de links y recordatorios | $0–20 USD/mes |
| Monitoreo de errores | Sentry | | $0–26 USD/mes |
| CI | GitHub Actions | Corre la suite de umbrales en cada push | $0 |

**Nota de continuidad:** el riesgo de "concentración en un solo desarrollador" que ya identifica la v3 se agrava si la infraestructura no está a tu nombre. En Klokk, el proyecto de Supabase lo posee Luis y tú no tienes acceso de colaborador. **En VIZO, la organización de Supabase, el dominio, el repo y las cuentas de proveedor deben estar a nombre de VIZO desde el día uno**, con los demás como colaboradores. Es una decisión de cinco minutos hoy y un problema de meses después.

---

## 4. Riesgos abiertos (adiciones a la tabla de la v3)

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Las RCG salen a mitad del desarrollo | Reescritura de la capa de avisos | Nada regulatorio en código. Catálogo versionado por vigencia desde el primer commit. |
| La licencia *reseller* de OpenSanctions resulta prohibitiva | Se cae la Capa 3 completa | Cotizar en Fase 0 **antes** de integrar. Plan B: motor propio sobre listas públicas + PEP de fuentes abiertas, asumiendo que la calidad de PEP es el punto débil y documentándolo. |
| VIZO opera como encargado sin contrato bajo LFPDPPP | Exposición directa, multa duplicada por datos sensibles | Contrato de encargado + cláusulas de sub-encargados redactados en Fase 0. |
| Screening calibrado a match exacto | Falsos negativos — el riesgo de mayor costo penal del stack | Umbral de coincidencia deliberadamente bajo, revisión humana de **toda** alerta, y bitácora de la decisión de descarte. Un sistema que solo alerta con coincidencia exacta es peor que no tener sistema. |
| Resolución de identidad débil para compradores extranjeros | La acumulación cross-sucursal, que es la promesa central, falla justo en el segmento del sureste | Definir la estrategia de identidad sin RFC en Fase 0, con el consultor. |
| Custodia de e.firma del cliente | Responsabilidad sobre actos fiscales ajenos | No hacerlo. Fase 1 sin e.firma; Fase 2 vía proveedor que custodie. |
| El piloto no valida mercado | Falso positivo de tracción | Conseguir un segundo cliente sin relación con el primero antes de escalar. |

---

## 5. Lo que hay que decidir esta semana

1. ¿Cuál es la fracción del Art. 17 del cliente que te contrató? Todo el diseño de Fase 1 depende de eso.
2. ¿El presupuesto contempla al consultor PLD? Si no, el proyecto tiene un hueco estructural.
3. ¿A nombre de quién quedan la organización de Supabase, el dominio y el repo?
4. ¿Quién es el REC del cliente ancla y ya tiene e.firma vigente? Sin eso no hay piloto que cierre el ciclo.
