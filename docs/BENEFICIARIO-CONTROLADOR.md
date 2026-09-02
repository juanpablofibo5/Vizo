# Beneficiario Controlador — Cap. III Quinquies contrastado y diseño

> **Contrastado contra el DOF el 20 de agosto de 2026.** Fuente: `regulatorio/dof/acuerdo-115-2026.txt` (Arts. 23 Quinquies a 23 Quinquies 3, Art. 3 fr. IV, Art. 12 fr. VII, Art. 22) y `regulatorio/leyes/LFPIORPI.txt` (Art. 18, frs. III y IV — la Ley a la que el Acuerdo remite). Método: cada afirmación regulatoria va marcada **✅ DOF** con su artículo y archivo; lo no verificado va **⚠️** y no se siembra en ningún catálogo ni se cita como fundamento. Es el mismo método de `docs/ACUERDO-115-2026.md` §0.
>
> Exigible el **1 de marzo de 2027** (Transitorio Cuarto — ver `docs/ROADMAP-2027.md`). Este documento no propone fecha de implementación: solo contrasta el texto y deja el diseño en papel.

## 1. El contraste, artículo por artículo

### 1.1 Qué es un Beneficiario Controlador — Art. 3, fracción IV

✅ DOF (`acuerdo-115-2026.txt`, líneas 23–28). La definición tiene **dos ramas independientes**, no una:

> «Beneficiario Controlador, a la persona física o grupo de personas físicas que: a) Directamente o por medio de alguna persona Cliente o Usuaria obtiene, en última instancia, el beneficio de goce, uso, disfrute, aprovechamiento o disposición del bien o servicio [...], o b) Ejerce el control efectivo en última instancia de aquella persona moral que [...] lleve a cabo actos u operaciones [...]»

Y el control efectivo del inciso b) se define así:

> «Se entiende que una persona o grupo de personas controla de manera efectiva en última instancia a una persona moral cuando, a través de la titularidad de valores, por contrato o cualquier otro acto [...] puede: [...] ii) Mantener la titularidad de los derechos que permitan, directa o indirectamente, ejercer el voto respecto de más del veinticinco por ciento del capital social [...]»

**Por qué decide el diseño:** el 25% de esta definición está anclado a **derechos de voto**, no a tenencia accionaria a secas. El Art. 23 Quinquies (§1.2) usa un 25% distinto — «composición accionaria o parte social del capital social» — sin mencionar voto. El esquema no puede asumir que ambos 25% son la misma prueba; ver pregunta 1 en §6.

### 1.2 El orden de prelación para personas morales — Art. 23 Quinquies

✅ DOF (`acuerdo-115-2026.txt`, líneas 253–259). El artículo manda establecer en el Manual los criterios de identificación y fija el orden:

> «Para la identificación del Beneficiario Controlador de Clientes o Usuarias que sean personas morales, se deberá considerar por lo menos el siguiente orden de prelación:
> I. Identificar a la persona física o grupo de personas físicas que directa o indirectamente, adquiera, sea titular o posea por cualquier título legal, el 25% o más de la composición accionaria o parte social del capital social del Cliente o Usuaria.
> II. Identificar a la persona física o grupo de personas físicas que tenga el control del Cliente o Usuaria por otros medios distintos a la fracción anterior y sus funciones se encuentren relacionadas con la estrategia, toma de decisiones y la dirección de las principales políticas del Cliente o Usuaria.
> III. Identificar a la persona física o grupo de personas que ocupa la posición de funcionario administrativo de mayor grado o de alta dirección.»

**Por qué decide el diseño:** «por lo menos» y el orden numerado (I → II → III) obligan a un **procedimiento secuencial y agotado**, no a una elección libre entre criterios. No se puede llegar a la fracción III sin haber primero buscado —y no encontrado— alguien en la I y en la II. El registro tiene que demostrar ese agotamiento, no solo el resultado final. Es la base de todo §5.

### 1.3 Fideicomisos — Art. 23 Quinquies 1

✅ DOF (`acuerdo-115-2026.txt`, líneas 260–262). Para fideicomisos el criterio **no es el mismo orden de prelación**: es una prueba única de control efectivo, más amplia:

> «[...] se considerará como Beneficiario Controlador a cualquier persona física que, en última instancia, ejerza el control efectivo sobre el fideicomiso mediante facultades contractuales, legales o de cualquier otra naturaleza que le permitan disponer, administrar o dirigir el destino de los bienes o derechos fideicomitidos, instruir o autorizar distribuciones, modificar o extinguir el fideicomiso, nombrar o remover a quienes ejerzan funciones de administración, decisión, o imponer, directa o indirectamente, decisiones respecto de su operación o administración, quien puede tener el carácter de fiduciarios, fideicomitentes, fideicomisarios, protectoras, cuando existan o miembros del comité técnico o de cualquier órgano equivalente [...]»

Y el descenso cuando quien controla es persona moral:

> «Cuando los fideicomitentes, fideicomisarios o cualquier otra de las personas consideradas como Beneficiarios Controladores conforme al párrafo anterior sean personas morales o estructuras jurídicas, deberá identificarse a la persona física que sea su Beneficiario Controlador, de conformidad con lo previsto en el artículo 23 Quinquies de las presentes reglas, ascendiendo en la cadena de titularidad y control hasta identificar a la persona física que, en última instancia, ejerza el control efectivo.»

Y el momento en que debe ocurrir la identificación:

> «La identificación del Beneficiario Controlador deberá realizarse con carácter previo a la realización del acto u operación o, a más tardar, al momento del establecimiento de la Relación de negocios.»

**Por qué decide el diseño:** dos cosas. (1) El «control efectivo» del fideicomiso **no es una casilla, es una red de roles** (fiduciario, fideicomitente, fideicomisario, protector, miembro del comité técnico) igual que ya se modeló para la propia estructura del obligado en `integrantes_estructura` (migración `20260817150000_estructura_del_obligado.sql`) — pero ahí el objeto es la figura por la que actúa **el obligado**; aquí el objeto es el Beneficiario Controlador **del cliente**. Son tablas distintas con el mismo patrón de roles, no la misma tabla. (2) El descenso remite explícitamente al Art. 23 Quinquies, es decir: cuando el control lo tiene una persona moral, esa persona moral se resuelve con el **orden de prelación de §1.2**, no con una regla nueva. Es recursión real: fideicomiso → persona moral → (fr. I, II o III) → persona física, o fideicomiso → persona moral → otra persona moral → ...

### 1.4 Las excepciones — Art. 23 Quinquies 2

✅ DOF (`acuerdo-115-2026.txt`, líneas 263–265):

> «Quienes realicen Actividades Vulnerables no estarán obligadas a recabar los datos de identificación del Beneficiario Controlador en términos de lo previsto en el artículo 18, fracción III, primer párrafo de la Ley, en los siguientes casos:
> I. Cuando el Cliente o Usuaria sea un fideicomiso o persona moral que coticen en alguna bolsa de valores mexicana o en mercados de valores del exterior reconocidos en la legislación mexicana, siempre que proporcione la clave de pizarra, referencia o identificador con el que pueda localizarse dicho fideicomiso o persona moral en las bolsas de valores existentes.
> II. Cuando el Cliente o Usuaria sea una persona moral de las previstas en los Anexos 4 Bis, 6 Bis, 7-A y 7 Bis A de estas reglas.»

Ver detalle de qué anexos están y cuáles faltan en §2.

### 1.5 Lineamientos opcionales de la UIF — Art. 23 Quinquies 3

✅ DOF (`acuerdo-115-2026.txt`, línea 266):

> «Quienes realicen Actividades Vulnerables podrán considerar para el cumplimiento de lo previsto en este capítulo, los lineamientos que al efecto emita la UIF, previa opinión del SAT, los cuales se darán a conocer a través del Portal en Internet.»

⚠️ Sin contrastar si esos lineamientos ya existen. El verbo es «podrán» — son opcionales si y cuando se publiquen, no una obligación pendiente. No bloquea el diseño; ver pregunta 7 en §6.

### 1.6 Qué datos y documentos se recaban — Art. 12, fracción VII

✅ DOF (`acuerdo-115-2026.txt`, líneas 164–166):

> «Tratándose del Beneficiario Controlador, quienes realicen las Actividades Vulnerables asentarán y recabarán los mismos datos y documentos que los establecidos en los Anexos 3, 4, 5, 6 u 8 de las presentes reglas, según corresponda, en caso de que el Cliente o Usuaria sea persona física y cuente con dicha información.
> En caso de que el Cliente o Usuaria sea persona moral o fideicomiso, quienes realicen las Actividades Vulnerables recabarán los datos establecidos en los numerales i), ii), iv) y ix) del inciso a) del Anexo 3 de las presentes reglas, en todos los casos.»

**Por qué decide el diseño:** hay dos niveles de exigencia, no uno. Si el Beneficiario Controlador identificado es persona física y el cliente **cuenta con la información**, se recaba el expediente completo del Anexo que corresponda (3, 4, 5, 6 u 8 — el mismo catálogo de documentos que usa `expedientes`/`documentos` hoy). Si el cliente es persona moral o fideicomiso, hay un **piso mínimo obligatorio en todos los casos**: solo cuatro numerales del inciso a) del Anexo 3 (nombre, y tres más que este documento no transcribe porque el Acuerdo los deja como «i), ii), iv) y ix)» sin abrir su contenido en el fragmento consultado — ⚠️ el texto exacto de esos cuatro numerales del Anexo 3 no se transcribió en este contraste, hay que leerlo del Anexo 3 completo antes de sembrar catálogo).

### 1.7 El disparador implícito — Art. 22

✅ DOF (`acuerdo-115-2026.txt`, línea 198):

> «Cuando quien realiza una Actividad Vulnerable cuente con información basada en indicios o hechos acerca de que alguno de sus Clientes o Usuarias actúa por cuenta de otra persona, sin que lo haya declarado [...], deberá solicitar al Cliente o Usuaria de que se trate, información que le permita identificar al Beneficiario Controlador [...]»

**Por qué decide el diseño:** la identificación del Beneficiario Controlador no siempre nace de un tipo de persona (moral/fideicomiso). También puede nacer de una sospecha operativa sobre un cliente persona física que en principio no la requeriría. El campo `es_declaracion` ya cubre el caso «persona física, declaró que no sabe de un beneficiario» (§1.8); este artículo es el caso «persona física, VIZO tiene indicios de que sí hay uno pese a lo declarado» — un motivo de apertura distinto que hoy no tiene dónde registrarse.

### 1.8 La obligación de la Ley que el Acuerdo reglamenta — Art. 18, frs. III y IV, LFPIORPI

✅ DOF (`regulatorio/leyes/LFPIORPI.txt`, líneas 956–966 — Art. 18, última reforma DOF 16-07-2025):

> «III. Cuando la Cliente o Usuaria sea persona moral, fideicomiso u otra figura jurídica, recabar documentos u otros medios de identificación con reconocimiento oficial que permita identificar a su Beneficiario Controlador [...]
> Cuando la Cliente o Usuaria sea persona física, recabar la declaración acerca de si tiene o no conocimiento de la existencia de una persona Beneficiario Controlador y, en su caso, la documentación que permita identificarla [...]»

Esto es lo que ya está bien reflejado en el esquema: `es_declaracion` en `beneficiarios_controladores` es exactamente la rama «persona física declara si sabe o no» de esta fracción III. La fracción IV es la que ancla la retención:

> «IV. Custodiar, proteger, resguardar y evitar la destrucción u ocultamiento de la información y documentación que sirva de soporte a la Actividad Vulnerable [...] La información y documentación [...] deberá conservarse [...] por al menos un plazo de diez años contado a partir de la fecha de la realización de la Actividad Vulnerable [...]»

**Por qué decide el diseño:** cuando el Art. 23 Quinquies dice «resguardarlos en términos del artículo 18, fracción IV de la Ley», remite a este plazo de **diez años**, no a un plazo propio del capítulo. Todo lo que se guarde del camino de prelación hereda esta retención mínima.

## 2. Las excepciones y sus anexos — qué está y qué falta

La fracción I del Art. 23 Quinquies 2 (bolsa de valores) es autocontenida: no invoca ningún anexo, solo exige capturar la clave de pizarra/referencia/identificador. Eso sí se puede diseñar hoy.

La fracción II invoca cuatro anexos. De ellos:

| Anexo | ¿Está el texto en `acuerdo-115-2026.txt`? | Qué contiene |
|---|---|---|
| 4 Bis | ✅ Sí (líneas 641–649) | Datos y documentos de identificación de personas morales mexicanas **de derecho público** |
| 6 Bis | ✅ Sí (líneas 678–689) | Datos y documentos de identificación de **embajada, consulado u organismo internacional** acreditado ante el gobierno mexicano |
| 7-A | ⚠️ **No está** | Referenciado por el Art. 12, fr. V (líneas 160–161) y por el Anexo 7 (línea 693) como «las personas morales, dependencias y entidades referidas en el Anexo 7-A», pero el cuerpo del Anexo 7-A —la lista misma de qué entidades son— **no aparece en ningún punto del archivo fuente** |
| 7 Bis-A | ⚠️ **No está** | Mismo patrón: el Art. 12, fr. V Bis (línea 162) y el Anexo 7 Bis (línea 700) lo invocan como «personas morales mexicanas de derecho público referidas en el Anexo 7 Bis-A», pero su lista tampoco aparece |

**No se inventa su contenido.** Esto ya lo tenía anotado `docs/ROADMAP-2027.md` (línea 134) como pendiente del capítulo completo; este contraste lo confirma específicamente para la excepción del Art. 23 Quinquies 2, fr. II: mientras no se consiga el texto de los Anexos 7-A y 7 Bis-A, **no se puede sembrar en catálogo la lista de entidades exceptuadas por esa vía** — solo la exención por 4 Bis y 6 Bis, que sí tienen texto verificado.

## 3. La obligación de documentar el camino — la frase que decide el modelo de datos

Aparece **dos veces, casi idéntica**, una vez por cada régimen (personas morales y fideicomisos):

Art. 23 Quinquies, párrafo de cierre (✅ DOF, línea 259):

> «Quienes realicen Actividades Vulnerables deberán documentar el procedimiento seguido para la identificación del Beneficiario Controlador, conservar la información, documentación y registros que la sustenten, mantenerlos actualizados durante la vigencia de la Relación de negocios y resguardarlos en términos del artículo 18, fracción IV de la Ley [...]»

Art. 23 Quinquies 1, párrafo de cierre (✅ DOF, línea 262): la misma obligación, palabra por palabra, aplicada a fideicomisos.

Cuatro verbos, cuatro exigencias distintas sobre el esquema:

1. **«documentar el procedimiento seguido»** — no basta con guardar el nombre del Beneficiario Controlador que ganó. Hay que guardar **el camino**: qué fracción se evaluó, en qué orden, con qué resultado en cada una.
2. **«conservar la información, documentación y registros que la sustenten»** — el camino necesita evidencia adjunta (documentos del Anexo correspondiente, no solo una anotación de texto).
3. **«mantenerlos actualizados durante la vigencia de la Relación de negocios»** — esto es una obligación **continua**, no un evento único al alta. Contrasta con el ciclo de vida ya construido para la reverificación anual del expediente (Art. 21, migración `20260815180000_reverificacion_anual.sql`), que este documento no reabre pero cuya relación con este artículo queda como pregunta 8 en §6.
4. **«resguardarlos [...] diez años»** — retención larga y append-only, no un campo que se sobrescribe.

Esta frase, no el 25%, es la que decide que el diseño correcto **no es una fila `beneficiarios_controladores` más ancha**, sino un registro del procedimiento en sí — igual que `integrantes_estructura` no es una fila de datos de un integrante sino un ciclo de vida con historia, por la misma razón (el propio artículo exige poder reconstruir qué se hizo y por qué).

## 4. El delta contra lo que ya existe

`beneficiarios_controladores` (migración `20260806182334_nucleo_operativo.sql`, líneas 53–68) hoy:

```
id                 uuid
tenant_id          uuid
cliente_id         uuid → clientes_finales
nombre             text
rfc                text
curp               text
participacion_pct  numeric(5,2)
control_por        control_beneficiario  -- enum: 'participacion' | 'control_efectivo'
es_declaracion     boolean
created_at         timestamptz
```

Columna por columna, contra el Cap. III Quinquies:

| Columna existente | Cubre | Le falta |
|---|---|---|
| `nombre`, `rfc`, `curp` | Identificación mínima | El Art. 12 fr. VII (§1.6) pide el expediente completo del Anexo 3/4/5/6/8 cuando el cliente cuenta con la información — fecha de nacimiento, nacionalidad, domicilio, identificación oficial. No hay dónde guardarlo ni vínculo a `documentos` |
| `participacion_pct` | Art. 23 Quinquies, fr. I | Nada — esta columna sí está bien anclada, y el `PARTICIPACION_BENEFICIARIO_PCT = 25` de `src/dominio/clientes.ts` cita correctamente el umbral. Pero fr. I habla de «composición accionaria o parte social», y el Art. 3 fr. IV inciso b) ii) habla de derechos de **voto** — ver §1.1: son pruebas potencialmente distintas y la columna no distingue cuál se capturó |
| `control_por` (`participacion` \| `control_efectivo`) | Distingue fr. I de "el resto" | **Es el hueco central.** El enum tiene dos valores para un capítulo con al menos cuatro caminos posibles: fr. I (participación ≥25%), fr. II (control por otros medios — estrategia/decisión/políticas), fr. III (funcionario de mayor grado o alta dirección), y el control efectivo de fideicomisos del Art. 23 Quinquies 1 (que es una prueba distinta, no una fracción de la lista). Hoy `control_efectivo` es un cajón único que no dice si el caso fue fr. II, fr. III, o un fideicomiso — y no queda registro de que fr. I y fr. II se intentaron y no dieron resultado antes de llegar a fr. III |
| `es_declaracion` | Art. 18 fr. III, párrafo 2 de la Ley | Nada — alineación correcta (§1.8). Pero falta el caso del Art. 22 (§1.7): cliente persona física con indicios de actuar por cuenta de otro, pese a haber declarado que no |
| `created_at` | Cuándo se capturó la fila | No hay `fecha_identificacion` (el momento que exige el Art. 23 Quinquies 1: antes del acto u operación, o al establecer la Relación de negocios — dato distinto de cuándo se tecleó en VIZO). No hay actualización versionada: una tabla mutable no puede demostrar «se mantuvo actualizado durante la vigencia» sin borrar la versión anterior |
| *(no existe)* | — | Sin **excepción** del Art. 23 Quinquies 2: no hay booleano ni motivo para registrar que este cliente quedó exento (bolsa de valores + clave de pizarra, o Anexo 4 Bis/6 Bis/7-A/7 Bis-A) en vez de tener beneficiarios capturados |
| *(no existe)* | — | Sin **descenso recursivo** para fideicomisos (Art. 23 Quinquies 1, párrafo 2): cuando el Beneficiario Controlador resuelto es persona moral, hay que seguir identificando hasta una persona física, y la tabla no tiene forma de encadenar ese descenso ni de decir en qué nivel se detuvo y por qué |
| *(no existe)* | — | Sin vínculo a `documentos` ni a `expedientes` (versión): la evidencia que sustenta el camino no tiene dónde vivir, y no hay forma de saber contra qué versión del expediente se hizo la determinación |

## 5. Diseño en papel del registro del camino de prelación

> **CONSTRUIDO el 2-sep-2026** en la migración `20260902100000_beneficiario_controlador.sql`. Lo que sigue es el diseño tal como se escribió el 20-ago; **dos cosas cambiaron al implementarlo** y están razonadas en el ADR-32: la identidad NO se movió a una tabla hija (§5.3) —el hallazgo apunta a `beneficiarios_controladores`, que ya es el sujeto del screening, para no dejar dos respuestas a «quién es el Beneficiario Controlador»—, y el umbral se sembró como **dos** parámetros y no uno, porque el borde («o más» -vs- «más del») es parte de la regla. Las nueve preguntas de §6 siguen abiertas y ninguna bloqueó la construcción: lo que dependía de ellas no se construyó.

**El texto original de esta sección era una propuesta de modelo de datos, NO una migración.**

La idea central: el Cap. III Quinquies no pide guardar un resultado, pide poder reconstruir un procedimiento dos años después. Eso es exactamente lo mismo que ya resolvió `integrantes_estructura` (§1.3) para la estructura del propio obligado: datos inmutables, un ciclo de estado, y la corrección modelada como baja + fila nueva, nunca como `UPDATE`. La propuesta reusa ese patrón para el Beneficiario Controlador **del cliente**, no del obligado — son conceptos distintos aunque el patrón de tabla se parezca.

### 5.1 El intento de identificación (uno por cliente, versionado, append-only)

Una tabla nueva — nombre tentativo `identificaciones_beneficiario_controlador` — que registra, por intento:

- `cliente_id`, `expediente_id` (a qué versión del expediente pertenece esta determinación — resuelve el vínculo que hoy falta)
- `via`: `prelacion_persona_moral` | `control_efectivo_fideicomiso` | `declaracion_persona_fisica` | `excepcion` — el fideicomiso no usa el mismo camino que la persona moral, y hay que poder distinguirlos desde la fila raíz
- `fecha_identificacion`: la fecha que exige el Art. 23 Quinquies 1 (antes del acto, o al establecer la Relación de negocios) — distinta de `created_at`
- `estado`: `vigente` | `sustituida` — nunca se hace `UPDATE` sobre una determinación; una reidentificación (la actualización que exige «durante la vigencia de la Relación de negocios») es una fila nueva que **sustituye** a la anterior, igual que `documentos.reemplaza_a` u `operaciones.corrige_a`. La vieja se conserva íntegra: es la única forma de que la retención de diez años (Art. 18 fr. IV) tenga algo que retener
- `sustituye_a`: apunta a la fila anterior cuando aplica

### 5.2 Los pasos del orden de prelación (uno por fracción evaluada, solo para `via = prelacion_persona_moral`)

Una tabla hija — tentativa `pasos_prelacion` — con una fila **por cada fracción efectivamente evaluada**, no solo por la que ganó:

- `identificacion_id`, `fraccion` (`I` | `II` | `III`)
- `resultado`: `encontrado` | `no_encontrado`
- `motivo_no_encontrado`: texto libre obligatorio cuando `resultado = 'no_encontrado'` — es lo que demuestra que fr. I y fr. II de verdad se agotaron antes de caer en fr. III, no que se saltaron
- Constraint: no puede existir una fila de fr. II sin que exista una de fr. I con `no_encontrado` (y lo mismo fr. III sobre fr. II) — el orden de prelación se hace irrompible en el esquema, no solo en el procedimiento escrito, siguiendo el mismo principio de «nivel 2» de `CLAUDE.md`: que la base lo impida, no que dependa de que el capturista siga el orden

### 5.3 Los beneficiarios encontrados (uno o más, ligados al paso que los produjo)

Aquí sí vive lo que hoy es `beneficiarios_controladores`: nombre, RFC/CURP, datos del Anexo 3/4/5/6/8 cuando aplica, y **el `paso_id` que lo produjo** (o, para fideicomisos, el rol: fiduciario/fideicomitente/fideicomisario/protector/miembro del comité técnico) — para que quede trazable «se llegó a esta persona por fr. II, no por fr. I».

Cuando el beneficiario encontrado es persona moral o estructura jurídica (el descenso del Art. 23 Quinquies 1, párrafo 2), su fila no cierra el registro: apunta a una **nueva `identificacion_id`** con `via = prelacion_persona_moral` para esa persona moral, repitiendo §5.2 sobre ella. Es la misma recursión que el artículo describe («ascendiendo en la cadena de titularidad y control»), aplanada en filas encadenadas en vez de en un árbol en memoria — mismo principio de aplanamiento que ya usa el Anexo 2 Bis para el fideicomiso anidado (`estructura_del_obligado`, comentario de la migración `20260817150000`).

### 5.4 La excepción (para `via = excepcion`)

Una fila con:
- `tipo_excepcion`: `bolsa_de_valores` | `anexo_4bis` | `anexo_6bis` | `anexo_7a` | `anexo_7bisa`
- Para `bolsa_de_valores`: `clave_pizarra` obligatoria (es el dato que exige el texto)
- Para los anexos: el vínculo al tipo de cliente que ya existiría en `clientes_finales` o en una clasificación equivalente

`anexo_7a` y `anexo_7bisa` quedan **modelados en papel pero no sembrables**: la migración real que implemente esto no puede poner ninguna regla de negocio que decida automáticamente si un cliente cae en el Anexo 7-A o 7 Bis-A, porque el contenido de esos anexos sigue sin contrastar (§2). El campo existiría; la lógica que lo llena, no.

### 5.5 Documentos

`identificaciones_beneficiario_controlador` y `beneficiarios_controladores` (la tabla hija de §5.3) ganan el mismo vínculo que ya tiene `documentos.expediente_id` — probablemente una FK opcional desde `documentos` hacia la fila de beneficiario o hacia la identificación, reusando la tabla `documentos` existente en vez de crear un storage paralelo.

## 6. Preguntas para el especialista PLD

1. El Art. 3 fr. IV inciso b) ii) mide el 25% en **derechos de voto**; el Art. 23 Quinquies fr. I lo mide en **composición accionaria o parte social del capital social**, sin mencionar voto. ¿Son la misma prueba en la práctica, o hay que capturar ambas por separado (por ejemplo, acciones sin voto que superan 25% del capital pero no dan control)?
2. ¿Existe un estándar mínimo de diligencia para poder declarar `no_encontrado` en la fracción I o II (por ejemplo, exigir el libro de registro de accionistas) antes de que sea válido descender a la fracción III, o basta la manifestación del cliente?
3. El descenso del Art. 23 Quinquies 1, párrafo 2 (fideicomiso cuyo fideicomitente o fideicomisario es persona moral) dice «ascendiendo en la cadena [...] hasta identificar a la persona física» sin fijar un límite de niveles. ¿Hay un tope razonable de profundidad para el diseño, o debe soportar cadenas arbitrariamente largas?
4. Para la excepción de bolsa de valores (Art. 23 Quinquies 2, fr. I), ¿la clave de pizarra basta como evidencia por sí sola, o se espera una constancia adicional, como la que el Anexo 5 exige para personas físicas?
5. Los Anexos 7-A y 7 Bis-A (las listas de entidades exceptuadas invocadas por el Art. 23 Quinquies 2, fr. II) no están en `regulatorio/dof/acuerdo-115-2026.txt`. ¿Dónde se consigue su texto oficial completo?
6. ¿Cómo se acredita en la práctica «funcionario administrativo de mayor grado o de alta dirección» (fr. III) — organigrama declarado por el cliente, o exige algún soporte documental adicional (poder notarial, acta de asamblea)?
7. ¿Ya existen los lineamientos de la UIF que menciona el Art. 23 Quinquies 3, o siguen sin publicarse? Si existen, ¿dónde se consultan para poder contrastarlos?
8. La actualización «durante la vigencia de la Relación de negocios» que exige el Art. 23 Quinquies, ¿debe correr en el mismo ciclo que la revisión anual del expediente del Art. 21 (ya construida), o es una obligación independiente con su propio disparador?
9. El piso mínimo del Art. 12 fr. VII para clientes persona moral o fideicomiso («numerales i), ii), iv) y ix) del inciso a) del Anexo 3, en todos los casos») — ¿aplica también cuando el cliente cae en una excepción del Art. 23 Quinquies 2, o la excepción libera de este piso también?
