# El calendario que escribió el regulador

**Contrastado contra el DOF el 16 de agosto de 2026.** Fuente: `regulatorio/dof/acuerdo-115-2026.doc` (código 5795797, edición vespertina del 7-ago-2026, SHA-256 `19af24b3…`); el `.txt` del mismo directorio es la extracción de ese archivo y tiene huella propia (`b9e50b4e…`). *Corregido el 23-ago-2026: esta línea le atribuía al `.txt` el hash del `.doc`, y toda la disciplina del proyecto descansa en que esas huellas se puedan verificar.* Cada renglón cita su artículo transitorio y su capítulo. Lo que no pude confirmar en el texto va marcado **⚠️**.

**Qué es esto:** el índice de lo que deja de ser apuesta y pasa a ser lista con vencimientos.
**Qué NO es:** un plan ni un compromiso. Ninguna fecha de aquí es una fecha de VIZO — son las del obligado. Que VIZO construya cada pieza, y cuándo, es una decisión de producto que este documento no toma.

---

## 1. Las fechas, y de dónde sale cada una

| Exigible | Qué entra | Fundamento |
|---|---|---|
| **30 nov 2026** | Vigencia general: todo lo que no esté exceptuado. Incluye **Cap. II Ter** (fideicomisos), **Cap. III Quáter** (PEP) y **Cap. III** (identificación, con la revisión anual del Art. 21) | Transitorio **Primero** |
| **1 ene 2027** | Arranca el primer periodo anual de capacitación (**Cap. XII**), del 1 de enero al 31 de diciembre | Transitorio **Séptimo** |
| **1 mar 2027** | **Cap. II Quáter** — la evaluación con enfoque basado en Riesgo, a disposición de la autoridad previo requerimiento, con información del año inmediato anterior | Transitorio **Segundo** |
| **1 mar 2027** | **Cap. X** — el Manual de Políticas Internas incluyendo la metodología del Cap. II Quáter | Transitorio **Tercero** |
| **1 mar 2027** | **Caps. III Bis, III Ter y III Quinquies** — grado de riesgo, conocimiento del cliente y Beneficiario Controlador, *«a partir de los actos u operaciones realizados»* ese día | Transitorio **Cuarto** |
| **1 mar 2027** | Los procedimientos de selección de personal del Art. 39 Bis 2, solo para **nuevas contrataciones** | Transitorio **Sexto** |
| **30 may 2027** *(calc.)* | Fr. XVI (activos virtuales): actualizar la información del Art. 10 Bis. Seis meses desde la vigencia | Transitorio **Décimo Segundo** |
| **1 jun 2027** | **Cap. XIII** — los mecanismos automatizados del Art. 41. El texto acota: *«deberá contener la información de los actos u operaciones realizados A PARTIR DE ESA FECHA»* | Transitorio **Noveno** |
| **30 jul 2027** *(calc.)* | Sistema de notificaciones electrónicas de la SHCP. Ocho meses desde la vigencia — **a cargo de la autoridad**, no del obligado | Transitorio **Décimo Primero** |
| **30 ago 2027** *(calc.)* | La aplicación **Consulta PEP 2.0** queda disponible. Nueve meses desde la vigencia | Transitorio **Décimo** |
| **1 ene 2028** | Arranca el primer periodo de revisión de auditoría (**Cap. XIV**), hasta el 31 de diciembre | Transitorio **Octavo** |
| **Indeterminada** | Avisos de 24 h (Arts. 26 Bis, 26 Bis 1, 26 Bis 2 y 27 ¶2): seis meses **después** de que se publique la Resolución de formatos, que aún no existe | Transitorio **Quinto** |

### El hueco de nueve meses que nadie va a resolver por ti

El **Cap. III Quáter (PEP) es exigible el 30 de noviembre de 2026** y la **aplicación oficial de consulta no existe hasta el 30 de agosto de 2027**. Son nueve meses en los que la obligación corre y la herramienta de la autoridad no está.

No es un detalle: es el argumento de venta más limpio del calendario, y a la vez la trampa más fácil. Lo que VIZO puede hacer ahí es **flujo asistido con captura de evidencia** —qué se preguntó, qué contestó el cliente, quién lo revisó y cuándo— nunca una API de terceros que «resuelva» si alguien es PEP. La regla dura 5 no admite excepción operativa: VIZO no descarta una coincidencia de screening.

---

## 2. Capítulo por capítulo: qué exige y qué tiene VIZO

### Cap. II Ter · Fideicomisos y otras figuras jurídicas — **30 nov 2026**
Alta y registro mediante el XML que genera la herramienta del Portal, con la información de los Anexos **2 Bis** (fideicomiso) y **2 Ter** (otra figura). Arts. 10 Sexies y 10 Sexies 1.

**Lo que decide el modelo:** un fideicomitente o un fideicomisario **puede ser a su vez un fideicomiso** (Anexo 2 Bis, secciones III.III y IV.III). La estructura es recursiva. Un modelo que asuma «persona física o moral» se rompe con el primer fideicomiso dentro de otro — y en el corredor Cancún–Tulum eso no es exótico.

**En VIZO (issue #20, 17-ago-2026):** la estructura del obligado como registro con evidencia — los datos de la figura y sus integrantes con los campos exactos del Anexo por naturaleza, y el ciclo capturado → enviado → baja del Art. 10 Sexies (corregir es dar de baja y reenviar, nunca editar). El contraste del Anexo 2 Bis además desactivó el susto de la recursión: el fideicomiso anidado se identifica con 4 datos, no con su estructura completa. Los grupos multi-RFC siguen en el issue #13.

### Cap. III Quáter · PEP — **30 nov 2026**
Art. 23 Quáter define quién es PEP y **asimila** —literal— «el cónyuge, la concubina, el concubinario y las personas con quienes […] mantengan parentesco **por consanguinidad o afinidad hasta el segundo grado**, así como los **asociados o socios** de personas morales con las que mantengan vínculos patrimoniales». También sigue siendo PEP nacional **durante el año siguiente** a dejar el cargo — y el ¶5 añade un **segundo reloj**: si el cese cayó dentro del año previo al acto u operación, se le cataloga PEP durante el año siguiente **al acto**, no al cese. Art. 23 Quáter 1: la consulta se hace en la aplicación **Consulta PEP 2.0** de la UIF, con la e.firma del alta.

**Lo que eso significa para el formulario:** no es una casilla «¿es usted PEP?». Es una red de hasta segundo grado más los socios patrimoniales, y esa red la tiene que declarar el cliente. El diseño de la captura es el trabajo, no la consulta.

**En VIZO (issue #19, 17-ago-2026):** la declaración con su red y evidencia — captura tipificada con el vocabulario del ¶3 (vínculo, grado, cargo, ámbito, fechas), coherencia declaración↔vínculos garantizada por la base, revisión de admin que congela, y la vigencia derivada con los dos relojes desde el catálogo. Pendiente: el seguimiento reforzado (Manual Fr. IV) y el riesgo alto por defecto de extranjeras (23 Bis 4, 1-mar-2027). `consultas_screening` sigue vacía a propósito: la consulta oficial es Consulta PEP 2.0, del obligado con su e.firma.

### Cap. II Quáter · Enfoque basado en Riesgos — **1 mar 2027**
Art. 10 Septies 1 pide **tres** cosas de la metodología, y dentro de la primera, **cuatro elementos mínimos** de exposición: *actos u operaciones · tipo de personas Clientes o Usuarias · países y áreas geográficas · transacciones y canales*. Más un método de medición que asigne valores, y la identificación de los Mitigantes ya implementados.

**En VIZO (24-ago-2026): el Art. 10 Septies 1 queda cubierto.** *La versión anterior de esta línea decía «nada construido» y era falsa: la fr. I estaba desde el ADR-21 —los cuatro elementos sembrados del catálogo y los indicadores del obligado— y la fr. II a medias.* Lo que se cerró hoy:

- **Fr. II, segunda oración** — el valor de cada ELEMENTO (`pesos_elemento`), que faltaba. Entra como un **método de medición nuevo** que el obligado declara (`suma_ponderada_por_elemento`), no como un cambio de `suma_ponderada`: mover la aritmética del método viejo habría reclasificado clientes sin que nadie lo decidiera. Una prueba fija que el puntaje del método viejo no cambió.
- **Fr. III** — los **Mitigantes** (`mitigantes` + `mitigantes_elementos`). VIZO no los propone —son las políticas del Manual del obligado— pero exige que cada uno diga sobre qué elemento actúa y con qué efecto: sin eso no se puede «establecer el efecto» que pide el texto.
- **¶ final** — los indicadores de los delitos de los **Arts. 139 Quáter y 400 Bis** del CPF (`factores_modelo.delitos`), exigidos *para cada uno* de los elementos. Son cuatro elementos × dos delitos: ocho celdas, no cuatro.
- **La cobertura del artículo, en pantalla.** Configuración dice cuál de las cuatro exigencias acredita el modelo y cuál no, con la falta escrita en las palabras del artículo. No es un porcentaje de avance: el Transitorio Segundo no admite avances parciales el 1 de marzo de 2027. ADR-27.

**Lo que sigue faltando de este capítulo:** el Art. 10 Septies pide que la metodología esté **descrita en el Manual** (Cap. X) y que se reevalúe **antes de nuevos productos, canales o tipos de cliente** (¶3). Las dos cosas arrastran al Manual, y el Manual es donde `ALCANCE.md` dice que la compuerta vuelve a mandar.

### Cap. III Bis · Grado de riesgo — **1 mar 2027**
Art. 23 Bis: modelo de evaluación coherente con la metodología del Cap. II Quáter, **al menos tres clasificaciones** (bajo, medio, alto) y los intermedios que se quieran. Art. 23 Bis 1: reevaluación **al menos cada seis meses**, más frecuente cuanto mayor el riesgo. Art. 23 Bis 4: **riesgo alto por defecto** para no residentes de jurisdicciones señaladas y para PEP extranjeras.

**En VIZO:** `clientes_finales.nivel_riesgo` y la tabla `factores_riesgo` existen **vacías** desde la migración 001. La puerta quedó abierta a propósito (ADR-06).

### Cap. III Ter · Conocimiento del cliente — **1 mar 2027**
Perfil transaccional, alertas ante desviaciones, y para riesgo alto cuestionarios de origen y destino de recursos. Aprobación de un directivo antes de operar con PEP o riesgo alto.

**En VIZO (21-ago-2026):** **construido el Perfil transaccional y su sistema de alertas.** `perfiles_transaccionales` guarda append-only lo que el cliente declara —monto máximo mensual, y opcionalmente número, frecuencia, origen y destino, zona y actividad—, anclado a la fecha del acto. Los tres «seis meses» del Art. 23 Ter 1 quedaron en **dos** parámetros de catálogo con fuente propia (`perfil_maduracion_meses`, `reevaluacion_perfil_meses`), y la base impide mover el reloj: reevaluar antes de la maduración es una fila que Postgres rechaza. Al registrar una operación se contrasta el mes contra lo declarado y se levanta la alerta del Art. 23 Ter 2 —`desviacion_perfil`— o la del hueco —`perfil_ausente`— en la misma transacción. ADR-22.

**En VIZO (22-ago-2026): construida también la aprobación del Art. 23 Ter 5.** `aprobaciones_directivo` asienta el consentimiento —o la constancia de motivos que lo subsana cuando el obligado es persona física, que son ramas excluyentes según `tenants.tipo_persona`— y `operaciones_consentidas` nombra qué actos consiente, porque el ¶1 dice «los actos u operaciones respectivos». **No es una compuerta:** la operación se registra y queda su alerta, porque el ¶1 contempla detectar esto «con posterioridad al acto». El disparador se resuelve con lógica de tres valores: sin declaración PEP o sin modelo de riesgo la respuesta no es «no se requiere», es que no se puede saber. ADR-23.

**En VIZO (23-ago-2026): construido el cuestionario del Art. 23 Ter 3.** `cuestionarios_riesgo_alto` guarda append-only las cinco respuestas que el artículo nombra —la actividad preponderante del ¶1, y el origen y destino de los recursos más los actos que realiza *o pretende* del ¶2—, atadas por FK compuesta a la evaluación de riesgo que las exigió. Tres lecturas decidieron el modelo: la «Firma Electrónica» del ¶3 es la del **Código de Comercio** (Art. 3 fr. VIII Ter), no la e.firma del SAT (fr. VIII Quáter), así que VIZO registra su huella sin producirla ni validarla; el «los cuales» del ¶3 ata esa firma a la **vía remota**, no al cuestionario, y por eso el presencial no la necesita; y el artículo **no da plazo de vigencia**, así que cuando el cliente se reclasifica el sistema dice «sobre otra clasificación» y nunca «vencido». ADR-25.

**En VIZO (23-ago-2026): construidas también las medidas reforzadas del Art. 23 Ter 4, y con esto el Cap. III Ter queda completo.** `medidas_reforzadas` guarda append-only lo que el obligado adoptó, atado por FK compuesta a la clasificación que lo exigió. Cuatro lecturas decidieron el modelo: la **fracción no se elige** —la I es de físicas y la II de morales, y se deriva de `tipo_persona`—; el artículo **nombra dos clases de persona y el sistema tiene cuatro**, así que a un fideicomiso de grado alto no se le inventa fracción y sale como hueco (POR CONFIRMAR-11); el **«debiendo consultar»** de la fr. II hace que la consulta a la Secretaría de Economía sea obligatoria, y **la hace el obligado, no VIZO**; y la **fr. III se apila** sobre la que toque, subiendo el listón de «los datos» a «la documentación» sobre las mismas personas del inciso b). Que el cliente sea PEP extranjera se deriva del Cap. III Quáter, no se teclea. ADR-26.

### Cap. III Quinquies · Beneficiario Controlador — **1 mar 2027**
Art. 23 Quinquies, orden de prelación **literal**:

1. quien directa o indirectamente posea el **25% o más** del capital,
2. quien tenga el control **por otros medios**,
3. quien ocupe la **posición de funcionario administrativo de mayor grado**.

Art. 23 Quinquies 1 para fideicomisos: quien ejerza el control efectivo, y si son personas morales, hay que seguir bajando. La identificación va **antes** del acto u operación o, a más tardar, al establecer la Relación de negocios.

**La pieza de mejor relación valor/esfuerzo de todo el calendario:** es un árbol de decisión determinista. Se codifica una vez, se documenta el camino seguido —que el propio artículo exige conservar— y sustituye criterio humano repetido.

**En VIZO:** existe `beneficiarios_controladores` con el 25% capturado a mano. Falta el árbol y la evidencia del procedimiento.

### Cap. X · Manual de Políticas Internas — **1 mar 2027**
Art. 37 Bis: **catorce** apartados (fracciones I a XIV). Art. 37: dentro de los **90 días naturales** siguientes al alta. Art. 37 Bis 1 para grupos empresariales; Art. 37 Bis 2 exime de los supuestos que no se realizan **si se hace constar**.

**El puente honesto:** la fracción VIII exige *«los mecanismos para dar seguimiento y acumular actos u operaciones»* — que es exactamente lo que VIZO ya hace y puede enseñar funcionando. Ver `docs/DEMO.md`.

**Antes de construirlo hay que decidir una frontera:** generar el Manual desde la configuración real del obligado es producto; generar texto que interpreta la norma es asesoría legal (`ALCANCE.md §0`).

### Cap. XII · Capacitación y selección de personal — **1 ene 2027**
Art. 39 Bis: cursos **al menos una vez al año** para consejo, administrador, directivos, el REC y el personal de atención al público, identificación, envío de avisos o auditoría. Contenido mínimo en cuatro incisos, y los temas deben ser **coherentes con los resultados de la metodología** del Cap. II Quáter. Fracción III: quien imparta la capacitación debe **acreditar experiencia de por lo menos cinco años**.

**En VIZO:** nada. Es repositorio de evidencia con retención, no motor — y el requisito del capacitador lo vuelve **canal de distribución**, no línea de producto.

### Cap. XIII · Mecanismos automatizados — **1 jun 2027**
Art. 41, **seis** funciones mínimas. Es una especificación de producto ya escrita:

| | Qué pide | VIZO hoy |
|---|---|---|
| I | Conservar, actualizar y permitir consulta del expediente único | **sí** |
| II | Base consolidada por cliente, monitoreo de desviaciones del perfil y **acumulación** | **parcial** — acumula; no hay perfil |
| III | Proveer la información de la metodología del Cap. II Quáter | no |
| IV | Ejecutar el modelo de riesgo **conservando el histórico de modificaciones** del grado | no |
| V | Sistema de alertas para riesgo alto, PEP y listados | no |
| VI | Monitoreo de efectivo y metales preciosos (Art. 32) | **parcial** — el umbral existe |

### Cap. XIV · Auditoría — **1 ene 2028**
Art. 48: cada obligación evaluada se cataloga en **cinco** niveles — *Cumple · Cumple mayoritariamente · Cumple parcialmente · No cumple · No aplica*. Art. 49: el dictamen lleva hallazgos, acciones correctivas y el **seguimiento** que hizo el auditado.

**Lo que implica para el producto:** exportación de un paquete de evidencia **por obligación**, no un volcado. La bitácora encadenada y el manifiesto ya son la mitad de eso.

---

## 3. Lo que el contraste corrigió del análisis original

El issue #14 se escribió con fuentes secundarias. Al leer el texto, tres cosas no eran como decía:

1. **El Cap. XI no es «mecanismos de prevención para OSC».** Se llama *De los mecanismos de prevención* y su Art. 38 describe lo que **la UIF establece** para todos los que realizan Actividades Vulnerables; el Art. 38 Bis es el que toca a las asociaciones sin fines de lucro. No es una obligación nueva del obligado, así que sale del calendario y entra como algo que hay que **vigilar** cuando la UIF publique.
2. **El Cap. XII es «Capacitación y selección de personal»**, no solo capacitación. El Transitorio Sexto le pone fecha propia a la parte de selección (1 mar 2027, solo nuevas contrataciones).
3. **La fecha de la Consulta PEP es derivable, no aproximada:** nueve meses desde la vigencia (Transitorio Décimo) = **30 de agosto de 2027**. Igual las otras dos marcadas *(calc.)*.

---

## 4. El matiz que más vale, y sí está en el texto

Art. 3, fracción **XI Ter** — la definición de *mecanismo automatizado*:

> «…que pueden incluir desde sistemas informáticos especializados hasta procesos automatizados apoyados en **hojas de cálculo**, bases de datos u otros medios equivalentes, siempre que sus funciones cumplan…»

**El regulador no prohibió Excel.** Confirma que el competidor real es la hoja de cálculo más el despacho, no otro SaaS.

Y en la misma frase entrega el argumento contrario: *«siempre que sus funciones cumplan»* las seis del Art. 41 — entre ellas conservar el **histórico de modificaciones del grado de riesgo** y un **sistema de alertas activo**. Formalmente posible en Excel. Operativamente, no.

---

## 5. Lo que sigue sin verificar

- **⚠️ Los Anexos** citados por el Cap. III Quinquies para las excepciones de Beneficiario Controlador (bolsa reconocida y similares). El Acuerdo trae sus anexos al final; solo se transcribieron el 2 Bis y el 2 Ter.
- **⚠️ El Anexo 10** que menciona el Art. 23 Quáter 2.

Nada de esto se siembra en el catálogo hasta contrastarlo. Un umbral con fuente equivocada es peor que uno faltante: el faltante revienta, el equivocado calcula.
