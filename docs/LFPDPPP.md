# LFPDPPP — la ley al repositorio y el contraste del módulo de datos personales

> ✅ **Texto oficial descargado y contrastado el 20 de agosto de 2026.** Fuente: `diputados.gob.mx` (Cámara de Diputados, Secretaría de Servicios Parlamentarios) — `https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf`. Es la nueva Ley publicada en el DOF el **20 de marzo de 2025** (abrogó la de 2010), texto **vigente** con última reforma **DOF 14-11-2025**. El archivo vive en `regulatorio/leyes/LFPDPPP.pdf`, SHA-256 registrado en `regulatorio/README.md`.
>
> Mismo método que `docs/ACUERDO-115-2026.md` §0: lo contrastado contra el artículo se marca **✅** y cita el artículo; lo que no tiene fundamento textual hoy —porque el Reglamento de esta ley **sigue sin publicarse**, o porque la Ley simplemente no lo dice como se afirma— se marca **⚠️** y no se siembra en ningún catálogo ni se usa como base de una migración.

## 0. La fuente

| Campo | Valor |
|---|---|
| Archivo | `regulatorio/leyes/LFPDPPP.pdf` — 457,399 bytes, 24 páginas |
| Origen | `https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf`, descargado 20-ago-2026 |
| SHA-256 (PDF) | `04d67464e1efc0472040e2ff8012ced52c73ff4fc3573c8e2d3477fd976359c6` |
| Texto plano | `regulatorio/leyes/LFPDPPP.txt` (extraído con `pdftotext -layout`, para grep) |
| SHA-256 (TXT) | `14654ace642b1a27262a9e449324d62db9f22ef8eaf47127541cc4ed04a46b21` |
| Vigencia | Nueva Ley, DOF 20-mar-2025 (abroga la LFPDPPP del 5-jul-2010). Última reforma: DOF 14-11-2025 (homologación al Código Nacional de Procedimientos Civiles y Familiares — solo tocó el Art. 4) |
| Reglamento de esta Ley | **No se localizó publicado.** No hay referencia a su publicación en ninguna fuente consultada. El propio documento comercial contrastado lo confirma en su pie de página final: *"El Reglamento de la nueva ley sigue sin publicarse"*. Toda afirmación de este contraste que dependa del Reglamento (y no de la Ley) queda ⚠️ — nada de eso se puede sembrar en catálogo hasta que exista texto oficial. |

**El documento contrastado:** `Vizo-Modulo-Datos-Personales-LFPDPPP.pdf` (Orvex, v1.0, 20 de agosto de 2026), documento comercial recibido por WhatsApp — precios, horas y argumento de venta, no un dictamen legal. El contraste de abajo cubre únicamente sus **afirmaciones normativas** (la tabla de su sección 02 y las menciones sueltas de las secciones 01, 04 y 09); las cifras de negocio (precios, márgenes, punto de equilibrio) no son objeto de este documento.

## 1. Contraste afirmación por afirmación

| # | Afirmación del documento comercial | Resultado | Fundamento |
|---|---|---|---|
| 1 | Hay una nueva LFPDPPP vigente desde marzo de 2025 que abrogó la de 2010 | ✅ | Decreto, Art. Tercero + Transitorio Segundo fr. I: abroga la «Ley Federal de Protección de Datos Personales en Posesión de los Particulares, publicada... el 5 de julio de 2010». Publicación de la nueva: DOF 20-mar-2025 |
| 2 | El INAI desapareció y sus funciones pasaron a la Secretaría Anticorrupción y Buen Gobierno | ✅ | Art. 2 fr. XV («Secretaría: Secretaría Anticorrupción y Buen Gobierno»); Transitorios Cuarto, Quinto—Décimo Cuarto (transferencia íntegra de recursos, personal, expedientes y procedimientos del INAI) |
| 3 | La ley obliga a todo particular que trate datos personales, sin excepción de tamaño | ✅ | Art. 1: observancia general; únicas excepciones son sociedades de información crediticia (fr. I) y tratamiento estrictamente personal sin fines de divulgación o uso comercial (fr. II). No hay excepción por tamaño de empresa — se buscó explícitamente ("micro", "pequeñ", "pyme") y no aparece en el texto |
| 4 | VIZO trata datos por cuenta de su cliente y eso lo convierte en «persona encargada», con obligaciones y responsabilidad propias | ✅ (la definición) / ⚠️ (el detalle de esas obligaciones) | Art. 2 fr. XII define «Persona encargada: persona física o jurídica que sola o conjuntamente con otras trate datos personales por cuenta del responsable». Que VIZO encaje en esa definición es correcto. Pero ver fila 14: la Ley **no** desarrolla un capítulo propio de obligaciones del encargado |
| 5 | El aviso de privacidad debe declarar identidad del responsable, datos tratados señalando los sensibles, finalidades distinguiendo las que requieren consentimiento, medios para limitar el uso, mecanismo ARCO y procedimiento de cambios | ✅ | Art. 15, frs. I–VI — coincide punto por punto |
| 6 | El aviso de privacidad tiene **tres modalidades**: integral, simplificado y corto | ⚠️ | El Art. 16 solo distingue **dos** formas de entrega: (I) cuando el dato se recaba en persona por formato impreso, se da a conocer el aviso completo en ese momento; (II) cuando se recaba por medio electrónico, se entrega una **«modalidad simplificada»** que remite al aviso integral. La palabra **«corto» no aparece en ningún lugar del texto vigente**. El «aviso corto» era una figura del Reglamento de la Ley de 2010 (abrogada); el Reglamento de la Ley nueva no existe todavía, así que hoy no hay base textual para una tercera modalidad |
| 7 | El consentimiento es libre, específico e informado; el tácito sigue siendo válido como regla general; si cambia la finalidad hay que volver a pedirlo | ✅ | Art. 2 fr. IV (definición); Art. 7 párrs. 2–4 (expreso/tácito, tácito como regla general); Art. 11 (finalidad distinta exige nuevo consentimiento) |
| 8 | Los datos sensibles requieren consentimiento expreso y por escrito | ✅ | Art. 8: «el responsable deberá obtener el consentimiento expreso y por escrito... a través de su firma autógrafa, firma electrónica, o cualquier mecanismo de autenticación» |
| 9 | Derechos ARCO: responder en máximo 20 días y, si procede, hacerlo efectivo dentro de los 15 días siguientes | ✅ | Art. 31: plazo de comunicación de la determinación, 20 días desde la recepción; ejecución, dentro de los 15 días siguientes a la respuesta. Ambos plazos son ampliables **una sola vez por un periodo igual**, si las circunstancias lo justifican (mismo artículo, párr. 2) |
| 10 | Plazo de conservación: los datos se bloquean primero y se suprimen después, una vez cumplido el plazo y cuando ya no son necesarios | ✅ | Art. 2 fr. III (definición de Bloqueo); Art. 10 párr. 2 («deberán ser suprimidos previo bloqueo, en su caso, y una vez que concluya el plazo de conservación»); Art. 24 párrs. 2–3 (cancelación → bloqueo → supresión; el periodo de bloqueo equivale al **plazo de prescripción de las acciones derivadas de la relación jurídica** que fundó el tratamiento) |
| 11 | Medidas de seguridad administrativas, técnicas y físicas contra daño, pérdida, alteración o acceso no autorizado | ✅ | Art. 18: «medidas de seguridad administrativas, técnicas y físicas que permitan proteger los datos personales contra daño, pérdida, alteración, destrucción o el uso, acceso o tratamiento no autorizado» |
| 12 | Comunicar de forma inmediata a los titulares las brechas que afecten significativamente sus derechos | ✅ (con matiz) | Art. 19: vulneraciones que afecten «de forma significativa los derechos patrimoniales o morales» se informan «de forma inmediata» al titular. **Matiz no capturado por el documento comercial:** el texto vigente no impone un deber paralelo de notificar a la Secretaría — solo al titular |
| 13 | Deber de confidencialidad reforzado que alcanza a empleados, encargados y terceros, y subsiste después de terminada la relación jurídica | ✅ | Art. 20: obliga a «todas aquellas personas que intervengan en cualquier fase del tratamiento» a guardar confidencialidad, «obligación que subsistirá aun después de finalizar sus relaciones con el mismo» |
| 14 | Vizo asume por contrato las obligaciones de encargado, con medidas de seguridad documentadas, cláusulas de confidencialidad y **un régimen explícito para subencargados** | ⚠️ (la parte de subencargados) | La Ley define «persona encargada» (fila 4) y la menciona solo dos veces más: Art. 35 (una transferencia a la persona encargada no cuenta como «transferencia» sujeta a aviso de terceros) y Art. 53 (responsabilidad civil de «el responsable o la persona encargada»). **No existe un capítulo ni articulado de obligaciones específicas del encargado** (contenido mínimo del contrato, régimen de subcontratación, etc.) — se buscó "subencargad" y "subcontrat" en el texto completo y no aparecen. Ese desarrollo vivía en el Reglamento de la Ley de 2010 (abrogada, ya no aplica) y el Reglamento de la Ley nueva no está publicado. La obligación de VIZO como encargado hoy descansa en la definición general + responsabilidad civil (Art. 53), no en un checklist legal específico |
| 15 | Responsable designado: una persona o departamento que atienda las solicitudes de los titulares | ✅ | Art. 29: «Todo responsable... designará a una persona, o departamento de datos personales, quien dará trámite a las solicitudes» |
| 16 | Si hay datos sensibles, las sanciones se incrementan hasta al doble | ✅ (discrecional, no automático) | Art. 59 fr. IV: «tratándose de infracciones cometidas en el tratamiento de datos sensibles, las sanciones **podrán** incrementarse hasta por dos veces, los montos establecidos». Es una facultad de la Secretaría («podrán»), no una duplicación automática — matiz que el documento comercial no distingue |
| 17 | Rangos de multa: 100–160,000 UMA (fracs. II–VII del Art. 58) y 200–320,000 UMA (fracs. VIII–XVIII); reincidencia agrega 100–320,000 UMA adicionales | ✅ | Art. 59 frs. II, III y IV, textual. Los montos en pesos citados por el documento (11,731 – 18.8 M / 23,462 – 37.5 M / hasta 75 M) cuadran aritméticamente con la UMA 2026 de $117.31 diarios ya contrastada en el proyecto (`docs/ACUERDO-115-2026.md`) |
| 18 | Apercibimiento (llamado formal) por no atender una solicitud ARCO sin razón fundada | ✅ | Art. 58 fr. I + Art. 59 fr. I |
| 19 | La autoridad competente es la Secretaría Anticorrupción y Buen Gobierno | ✅ | Art. 2 fr. XV; Arts. 38–39 (atribuciones, incluida imponer sanciones) |
| 20 | «Casi todos los avisos de privacidad siguen nombrando al INAI» | N/A | Observación de mercado del documento comercial, no una afirmación sobre el contenido de la Ley — no es objeto de este contraste legal |

**Tally:** 16 filas ✅ (una con matiz de discrecionalidad, otra con matiz de alcance de la notificación), 3 filas ⚠️ (modalidades del aviso, régimen de subencargados/obligaciones del encargado, y — ver §2 — la calificación de biométricos/identificaciones como dato sensible), 1 fuera de alcance.

### 1.1 Hallazgo transversal — la calificación de "dato sensible" para biometría/identificaciones no tiene texto que la respalde hoy

El repo ya afirma, en varios lugares, que las identificaciones oficiales y los biométricos son datos sensibles bajo la LFPDPPP:

- `docs/01_ARQUITECTURA_V4.md:140` — *"Los biométricos y las identificaciones son **datos sensibles** bajo la LFPDPPP: la multa se duplica."*
- `docs/00_PLAN_MAESTRO.md:186` — *"Multas de 100 a 320,000 UMA, se duplican tratándose de datos sensibles. Los biométricos son sensibles."*
- `supabase/migrations/20260806182338_esqueleto_post_mvp.sql:92-93` (comentario) — *"el payload del proveedor trae datos personales y biométricos, que son datos SENSIBLES bajo la LFPDPPP"*
- El documento comercial, sección "El riesgo propio de esta línea": *"Si un cliente carga datos sensibles —expedientes con información de salud, biometría— las sanciones aplicables se incrementan hasta al doble."*

El **Art. 2 fr. VI** de la Ley (texto vigente) define dato sensible así:

> *"Aquellos datos personales que afecten a la esfera más íntima de la persona titular, o cuya utilización indebida pueda dar origen a discriminación o conlleve un riesgo grave para esta. De manera enunciativa más no limitativa se consideran sensibles los datos personales que puedan revelar aspectos como origen racial o étnico, estado de salud presente o futuro, información genética, creencias religiosas, filosóficas y morales, opiniones políticas y preferencia sexual."*

La lista es **enunciativa, no limitativa** — así que no cerrar la puerta a que biometría o identificación oficial encajen por la vía del estándar general ("esfera más íntima" / "riesgo grave"). Pero el texto **no los nombra**, ni directa ni indirectamente. La calificación que ya vive en el código y en la arquitectura es una **extensión interpretativa razonable** (probablemente heredada de los criterios del INAI bajo la ley abrogada, donde sí se trataba a los biométricos como sensibles), no una cita textual de la Ley vigente. Es la razón central de la Pregunta 1 en §3.

## 2. Diseño en papel — PROPUESTA NO EJECUTABLE

**Todo lo de esta sección es diseño conceptual, no un plan de migración.** Está pendiente de (a) que se resuelva la Pregunta 1 de §3 — la definición operativa de dato sensible —, (b) contraste contra el Reglamento de la Ley cuando se publique, y (c) visto bueno del abogado. Ningún nombre de tabla, columna o tipo de aquí debe copiarse a una migración sin pasar antes por ese contraste completo.

### 2.1 Lo que hoy existe (para no proponer sobre supuestos falsos)

Verificado contra `supabase/migrations/`:

- `expedientes.estatus` es `estatus_expediente as enum ('incompleto', 'completo', 'aprobado')` (`20260806182325_fundamentos.sql:145`), columna **mutable**, con una única restricción de coherencia: `(estatus = 'aprobado') = (aprobado_en is not null)`. No existe un cuarto valor `bloqueado`.
- `documentos` (`20260806182334_nucleo_operativo.sql:97-115`) es **append-only**: trigger `documentos_append_only` prohíbe `UPDATE`/`DELETE` sobre la tabla. No tiene columna de estado — la corrección se modela como fila nueva con `reemplaza_a` apuntando a la fila vieja. No hay forma de "marcar" una fila existente como bloqueada sin violar el append-only.
- `operaciones` (misma migración, `:127-160`) también es append-only, mismo patrón de corrección por fila nueva (`corrige_a`). Tampoco tiene columna de estado.
- El bucket de Storage `expedientes` no tiene política de `UPDATE` ni `DELETE` (`20260808120000_expediente_storage.sql`) — los archivos son inmutables por diseño, a propósito.
- La bitácora es append-only por regla dura 4 de `CLAUDE.md`.

**Consecuencia para el diseño:** un estado «bloqueado» **no puede ser una columna que se actualiza** sobre `documentos` ni sobre `operaciones`, porque eso violaría el append-only que el proyecto ya defendió como invariante de seguridad (evidencia que se puede reconstruir, nunca sobrescribir). Tiene que modelarse como el resto de las cosas append-only del proyecto: un **evento nuevo**, no una mutación.

### 2.2 El estado «bloqueado» — propuesta

Un `bloqueo` no es un atributo de `documentos`/`operaciones`/`expedientes`: es una **relación con vigencia propia** entre "algo que ya existe" y "una razón legal por la que no se puede tratar, pero tampoco se puede suprimir todavía". Mismo patrón que ya usa el proyecto para `alertas` (evento ligado a un origen, con su propio ciclo de vida) en vez de una columna en la tabla origen.

En papel:

- Una tabla nueva, del estilo `bloqueos` (nombre provisional), **separada** de `documentos`, `operaciones` y `expedientes` — nunca una columna en ellas.
  - Columnas conceptuales: `tenant_id`, `origen_tabla` (`documento` | `operacion` | `expediente`), `origen_id`, `motivo` (`conservacion_kyc` | `obligacion_legal_aviso` | ... — versionado, no un enum cerrado a la primera pasada), `fundamento_legal` (el artículo exacto que obliga a conservar — Art. 25 fr. II de la LFPDPPP más el artículo específico de la LFPIORPI o su Reglamento que fija el plazo), `vigente_desde`, `vigente_hasta` (calculado, no capturado a mano — ver más abajo), `levantado_en` (nullable).
  - El bloqueo activo de una fila se **deriva** (una vista o una función, nunca un booleano que alguien tenga que recordar sincronizar): existe un bloqueo con `levantado_en is null` y `vigente_hasta > now()`.
- Para `expedientes.estatus`: **no** convertir `bloqueado` en un cuarto valor del enum `estatus_expediente`. Completitud/aprobación y bloqueo por protección de datos son **dos ejes independientes** — un expediente puede estar `aprobado` (workflow de negocio) y al mismo tiempo bloqueado (protección de datos) mientras corre su plazo de conservación. Colapsarlos en un solo enum lineal perdería esa combinación, exactamente el motivo por el que el proyecto ya evitó cargar semántica extra en enums existentes en otras partes (p. ej. `estatus_aviso` separado de `estado_alerta`).
- `vigente_hasta` no se captura a mano por persona: se calcula contra un **plazo de conservación versionado por vigencia** en el catálogo regulatorio (regla dura 1 de `CLAUDE.md` — nada regulatorio en código ni tecleado suelto). Ese plazo numérico para el expediente KYC **no está resuelto en esta sesión** — es la Pregunta 2 de §3.

### 2.3 La cancelación parcial fundada — propuesta

El ejemplo del documento comercial (página 5) — correo/teléfono se suprime, identificación y comprobante del expediente KYC se bloquean, datos de la operación reportada se bloquean — es coherente con el Art. 25 fr. II de la Ley (*"El responsable no estará obligado a cancelar los datos personales cuando... [d]eban ser tratados por disposición legal"*), que es exactamente el caso de un expediente exigido por la LFPIORPI.

**Un matiz que el ejemplo comercial simplifica de más:** el Art. 24 párr. 2 dice que **toda** cancelación pasa primero por un periodo de bloqueo — no distingue entre datos con base legal de conservación y datos sin ella. Así que, en rigor, incluso el correo/teléfono de marketing pasaría por un bloqueo (equivalente al plazo de prescripción de la relación jurídica, Art. 24 párr. 3) antes de la supresión — no es una supresión inmediata como sugiere la tabla de la página 5. Este matiz queda ⚠️ hasta que el abogado confirme si en la práctica se puede tratar como supresión inmediata cuando el plazo de prescripción aplicable es, de hecho, cero o irrelevante para ese dato.

Flujo en papel:

1. Llega una solicitud de cancelación (ARCO). Se registra en una tabla de solicitudes con su propio ciclo de vida — mismo patrón que `designaciones_rec` o `estado_integrante`: el estado es un **ciclo de vida vigilado**, no una casilla. El reloj de 20+15 días del Art. 31 vive ahí (recibida → clasificada → respondida en ≤20 días → ejecutada en ≤15 días más).
2. Para cada dato del titular, el motor cruza sus finalidades registradas contra las excepciones del Art. 25:
   - Sin excepción aplicable (p. ej. marketing) → bloqueo del Art. 24 (posiblemente trivial en duración) → supresión.
   - Excepción del Art. 25 fr. II por obligación LFPIORPI (expediente KYC, operación reportada) → **bloqueo**, sin fecha de supresión hasta que venza el plazo de conservación vigente en el catálogo.
3. Cada resultado (qué se suprimió, qué se bloqueó y por qué) se escribe en la bitácora append-only, con el artículo exacto que lo fundó — es lo que se le enseña a la Secretaría si audita, y lo que el propio documento comercial identifica como el verdadero producto ("razonamiento redactado y fundado... registrado con fecha, versión de reglas y responsable").

**Lo que esto exige del esquema actual, sin proponer una migración:**

- Una tabla nueva para solicitudes ARCO con su reloj (hoy no existe ninguna).
- La tabla `bloqueos` de §2.2, que no toca la mutabilidad de `documentos`/`operaciones`/`expedientes`.
- Un catálogo de plazos de conservación por finalidad, versionado por vigencia (regla dura 1) — hoy no existe; su fuente (qué artículo de la LFPIORPI o su Reglamento fija el número de años) es la Pregunta 2 de §3.
- Una noción explícita de "finalidad" por dato/documento, para poder cruzarla contra las excepciones del Art. 25 — hoy `documentos.campo` identifica *qué campo del expediente* satisface un documento, pero no *para qué finalidad* se recabó, que es un dato distinto que la Ley exige declarar en el aviso (Art. 15 fr. III).

## 3. Preguntas para el abogado

**1. La definición operativa de «dato sensible» — la más importante, porque bloquea el producto tal como está redactada la recomendación.**

El documento comercial recomienda, textualmente: *"no aceptar[los] en la versión 1.0 y bloquearlos por diseño"* para datos sensibles. Pero:

- El expediente de VIZO **exige** subir identificación oficial y comprobante de domicilio — es un requisito de la LFPIORPI, no opcional (`docs/01_ARQUITECTURA_V4.md`, capa de captura por link).
- `01_ARQUITECTURA_V4.md:140` ya afirma, sin cita textual de la Ley, que "los biométricos y las identificaciones son datos sensibles bajo la LFPDPPP".
- El Art. 2 fr. VI de la Ley (texto vigente) **no nombra** identificaciones ni biometría en su lista enunciativa (origen racial/étnico, salud, genética, religión, opiniones políticas, preferencia sexual) — aunque la lista es "enunciativa más no limitativa", así que no las descarta tampoco.

Si la respuesta es "sí, la identificación oficial (o su fotografía/biometría) es dato sensible", la recomendación del documento comercial —tal como está escrita— **bloquearía el producto entero**, porque el expediente KYC no puede existir sin ese documento. Se necesita del abogado una definición operativa: ¿la identificación oficial completa es sensible, o solo lo son campos específicos que pudiera revelar (p. ej. una fotografía que permite inferir origen étnico)? ¿Y qué trato distinto exige, si alguno, la LFPIORPI cuando conserva ese mismo documento por obligación legal frente a la LFPDPPP?

**2. El plazo de conservación numérico del expediente KYC.** El Art. 24 de la Ley remite el periodo de bloqueo al "plazo de prescripción de las acciones derivadas de la relación jurídica que funda el tratamiento" — para el expediente PLD, esa relación jurídica es la obligación LFPIORPI, no un contrato civil ordinario. ¿Qué artículo de la LFPIORPI o su Reglamento fija ese número exacto de años para efectos del bloqueo (10 años, por analogía con el histórico de cambios de perfil del Art. 41 del Acuerdo 115/2026, u otro)? Sin esa cita, el catálogo de plazos de conservación de §2.3 no se puede sembrar (regla dura 1).

**3. El vacío del Reglamento.** El Reglamento de la nueva LFPDPPP sigue sin publicarse. Varias piezas que el documento comercial da por existentes —la tercera modalidad del aviso ("corto"), el régimen de subencargados, la forma de acreditar identidad en una solicitud ARCO (Art. 41 párr. 2 de la Ley remite expresamente al Reglamento)— no tienen hoy fuente textual vigente. ¿VIZO puede apoyarse provisionalmente en los criterios del Reglamento de 2010 (abrogado) mientras no exista el nuevo, o eso es exactamente el tipo de fuente secundaria que el proyecto decidió no usar para sembrar catálogo?

**4. Alcance de la obligación de confidencialidad del Art. 20 sobre subcontratistas.** El Art. 20 obliga a "todas aquellas personas que intervengan en cualquier fase del tratamiento" — sin mencionar expresamente encargados ni subencargados como categoría propia (a diferencia de como lo redacta el documento comercial). ¿Alcanza contractualmente a los proveedores de VIZO (Didit, Nubarium, OpenSanctions) en los mismos términos, o hace falta una cláusula específica en cada contrato de proveedor, dado que la Ley no desarrolla un régimen propio de subencargados (fila 14 del contraste)?

**5. La cancelación parcial y el matiz del Art. 24 párr. 2.** ¿Es correcto tratar la supresión de datos de marketing (correo/teléfono) como inmediata, como sugiere el ejemplo del documento comercial, o —siguiendo el texto literal del Art. 24— corresponde pasar igual por un periodo de bloqueo (aunque sea corto) antes de suprimir, incluso cuando no hay obligación legal de conservación de por medio?
