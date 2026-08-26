# Once preguntas al especialista PLD

**24 de agosto de 2026** · Fracción V Bis, desarrollo inmobiliario
Contrastado contra el texto del DOF, código 5795797, edición vespertina del 7 de agosto de 2026.

> **Versión para mandar:** este documento reagrupa las preguntas de `DECISIONES.md` §POR
> CONFIRMAR por **lo que cuesta equivocarse**, y está escrito para leerse sin conocer el
> repositorio. Los identificadores entre corchetes remiten al original.

---

## Cómo leer esto

VIZO es el sistema de registro del cumplimiento PLD de un sujeto obligado. Todo lo regulatorio
—umbrales, plazos, campos obligatorios— vive como **dato versionado por vigencia**, no escrito en
el programa. Corregir una postura suele costar un renglón de catálogo, no un rediseño: ya pasó con
la base del umbral, que se confirmó cuatro meses después y costó un renombre.

Cada pregunta trae el texto que la origina, qué hace VIZO hoy, y qué habría que mover si la
respuesta es otra. **Si el tiempo alcanza solo para tres, que sean las del bloque A.**

---

## Bloque A · Cambian qué avisos se generan

Una postura equivocada aquí produce avisos de más o de menos sobre operaciones reales. El aviso de
más se corrige; el omitido se sanciona con 10,000 a 65,000 UMA.

### A.1 — Después del primer aviso por acumulación, ¿qué se reporta? [#8]

En una preventa, los pagos 1 a 3 acumulan y disparan un aviso. El pago 4 deja la suma de la
ventana **todavía por encima** del umbral. Dos lecturas, y el marco no la resuelve expresamente:

- **(a)** cada operación nueva que mantiene la suma sobre el umbral se reporta.
- **(b)** la ventana se reinicia tras el aviso, y vuelve a disparar solo cuando las operaciones no
  reportadas cruzan el umbral por su cuenta.

**Hoy:** la lectura (a), por conservadora, fijada con prueba para que cambiarla sea deliberado.
**Si es (b):** cambia el motor de acumulación y hay que reevaluar el histórico. Es el cambio más
caro de la lista.

### A.2 — ¿Contra qué monto se compara el Perfil transaccional? [#7]

El Art. 6 del Reglamento resuelve la base para dos cosas: el umbral del Art. 17 se mide sin
contribuciones, y la restricción de efectivo del Art. 32 con ellas. Pero el **Perfil transaccional
no es ninguna de las dos**, y ningún artículo lo alcanza.

**Hoy:** compara contra el **monto total**, contribuciones incluidas — es lo que el cliente
desembolsa y por tanto lo que estima. Ante la duda, detecta de más.
**Si es «sin contribuciones»:** cambia qué operaciones levantan alerta de desviación. No toca
avisos, pero sí el sistema de alertas del Art. 23 Ter 2.

**Relacionada:** un cliente de *acto único* (Art. 23 Ter 1 ¶4), ¿queda sujeto al ejercicio
semestral del ¶3? El ¶4 no lo exime expresamente, así que hoy sí queda — y eso produce
reevaluaciones sobre relaciones ya extinguidas.

### A.3 — «Montos máximos mensuales»: ¿mes de calendario o ventana de 30 días? [#12]

> «…la información que proporcione cada uno de sus Clientes o Usuarias […] relativa a los **montos
> máximos mensuales** de los actos u operaciones que los propios Clientes o Usuarias estimen
> realizar…» — Art. 23 Ter 1 ¶2

El texto dice «mensuales» sin más. Lo leímos como **mes de calendario** porque es lo que un cliente
entiende al estimar y lo que puede verificar si se le pregunta. La alternativa —ventana deslizante
de 30 días— detectaría además el reparto a caballo entre dos meses (90% del tope el día 31 y otro
90% el día 1 nunca cruzarían un mes de calendario), pero no sale del texto.

**Por qué pesa distinto:** no es un dato de catálogo como los plazos — **es la forma de la regla**.
Cambiarla es cambiar código, no una fila.

---

## Bloque B · Cambian qué podemos afirmar

No alteran ningún cálculo. Determinan si la evidencia que VIZO produce resiste una verificación.

### B.1 — Sellado del manifiesto: ¿uno por expediente o uno por documento? [#1]

VIZO genera un *manifiesto*: un documento que lista todos los archivos de un expediente con su
huella SHA-256. ¿Una constancia NOM-151 sobre ese manifiesto satisface la exigencia de fecha
cierta, o la autoridad espera constancia por cada documento?

**Hoy:** manifiesto por versión de expediente, con la tabla de sellado diseñada y vacía. El costo
es lineal en expedientes, no en documentos.
**Si es por documento:** el costo se multiplica por el número de archivos. La tabla ya existe.

### B.2 — ¿Qué campos son obligatorios en el expediente de Fr. V Bis? [#3]

El XSD del aviso exige ciertos campos, pero el expediente de identificación puede exigir más. Hoy
VIZO integra el expediente estándar del Art. 18 y lo marca como **pendiente de confirmar** en la
propia pantalla. Va junto una validación formal de la tabla de umbrales del catálogo: 8,025 UMA,
vigencia desde el 1 de febrero, y las tres bases del Art. 6 del Reglamento.

**Qué cambia:** una fila del catálogo por campo. Cero código. **Por qué importa igual:** un
expediente que el sistema declara «completo» y no lo está es peor que uno que declara faltantes.

### B.3 — Comprador extranjero sin RFC: ¿qué criterio de identidad resiste? [#2]

La acumulación de seis meses se hace por cliente, y sin RFC ni CURP no hay identificador fuerte
para saber si dos operaciones son de la misma persona. En el corredor Cancún–Tulum no es un caso
de borde.

**Hoy:** acumula conservadoramente por documento de identidad y **escala a revisión humana** con
una alerta, en vez de decidir solo.
**Lo que buscamos:** un criterio que un verificador acepte — pasaporte, FM/FMM, o combinación con
nacionalidad y fecha de nacimiento.

### B.4 — ¿El portal SPPLD valida estrictamente contra el XSD? [#6]

El ejemplo de XML que el SAT publica para Fr. V Bis **no valida contra su propio esquema**: trae
`caractersiticas_desarrollo` donde el XSD declara `caracteristicas_desarrollo`. Si el portal es
estricto, el ejemplo publicado induce a error a quien lo copie.

**Postura, que no depende de la respuesta:** VIZO genera y valida según el **XSD**, nunca según el
ejemplo. Validar más duro que la autoridad no produce rechazos; lo contrario sí.
**Qué cambia:** nada del sistema. Cambia lo que le advertimos a un cliente que arma su XML a mano.

---

## Bloque C · Huecos que el Acuerdo dejó abiertos

Exigibles el 1 de marzo de 2027 (Transitorio Cuarto). Salieron de construir los Caps. III Ter y
III Quáter contra el texto del DOF. En los cuatro, VIZO enseña el hueco en pantalla.

### C.1 — ¿Qué mecanismo de firma remota cumple el estándar del Código de Comercio? [#9]

> «El cuestionario […] podrá realizarse vía remota, por medios digitales o electrónicos, los
> cuales en todo caso deberán contener la **Firma Electrónica** de quien los suscribe.»
> — Art. 23 Ter 3 ¶3

El propio Acuerdo define dos cosas distintas en su Art. 3: la **fr. VIII Ter** es «Firma
Electrónica» conforme al **Código de Comercio**, y la **fr. VIII Quáter** es «Firma Electrónica
Avanzada», que es el certificado del Código Fiscal —la e.firma—. El ¶3 pide la primera.

Eso abre la puerta a que el cliente suscriba sin certificado del SAT. La pregunta es cuál
mecanismo concreto —firma en tablet, click-to-sign con acuse, correo con evidencia de atribución—
resiste una verificación bajo ese estándar.

**Hoy:** VIZO registra la huella SHA-256 del archivo firmado y **no se pronuncia sobre su
validez**. Garantiza que el archivo guardado es el que se subió, nada más.

### C.2 — ¿Una reclasificación obliga a repetir el cuestionario? [#10]

El Art. 23 Ter 3 ¶2 dice a quién se le aplica —a los catalogados de grado alto «así como a los
Clientes o Usuarias *nuevos* clasificados como tal»— pero **no da plazo de vigencia** ni dice qué
pasa cuando el mismo cliente se vuelve a clasificar seis meses después.

**Hoy:** el cuestionario cita la clasificación que lo motivó. Al reclasificar, la pantalla dice
**«se aplicó sobre otra clasificación»** —un hecho— y nunca «vencido», que sería una regla que
nadie promulgó.
**Qué está en juego:** si hay que repetirlo, es una carga operativa semestral por cada cliente de
riesgo alto.

### C.3 — ¿Qué medidas reforzadas le tocan a un fideicomiso de grado alto? [#11]

> «I. Para el caso de personas **físicas**: […]»
> «II. Para el caso de personas **morales**, obtener mayor información de sus principales
> accionistas o socios […]» — Art. 23 Ter 4

El artículo nombra dos clases de persona. Un cliente puede además ser un **fideicomiso** o una
figura jurídica —el Cap. II Ter del mismo Acuerdo los reconoce— y el 23 Ter 4 no los alcanza.

**Hoy:** VIZO no le asigna fracción por parecido. La pantalla dice que el cliente es de grado alto
y que el artículo no nombra su clase de persona, y **no deja asentar nada**. Asentar «medidas de
la fracción II» sobre un fideicomiso fabricaría evidencia de cumplir una regla que quizá no
existe.

### C.4 — La ventana PEP: ¿año calendario o doce meses? [#5]

> «…a aquellas personas que hubieran tenido tal carácter, durante el año siguiente **a aquel en
> que** hubiesen dejado su cargo.» — Art. 23 Quáter ¶4

Lo leímos como **año calendario siguiente completo**: un cese en enero de 2026 cataloga hasta el
31 de diciembre de 2027. Es la lectura literal y la conservadora — nunca acorta la ventana.

**Segunda parte:** la **PEP extranjera cesada quedó sin fecha de fin**, porque los dos párrafos
hablan solo de nacionales. ¿Es correcto que su carácter no caduque?

**Qué cambia si nos equivocamos:** el reloj vive en el catálogo. Corregirlo es un `UPDATE` con su
fuente, no un redespliegue. Y nuestra lectura cataloga de más, nunca de menos.

---

## Dos notas para no gastar tiempo

**Ya resuelta: la base del umbral [#4].** Se cerró el 16 de agosto contra el **Art. 6 del
Reglamento**, reformado el 27 de marzo de 2026, que define tres reglas sobre el mismo dinero: el
umbral del Art. 17 se mide *sin* contribuciones ni accesorios; el aviso reporta el *total* con
ellas y sin desglosar; la restricción de efectivo del Art. 32 se mide *con* ellas. **No hace falta
revisarla** — se menciona porque estaba en la lista.

**Fuera de este paquete: el registro real de los asesores [#13].** Qué porcentaje de asesores
inmobiliarios está dado de alta en el SPPLD por cuenta propia frente a los que operan bajo el RFC
de la inmobiliaria. **No es una pregunta legal**: es investigación de mercado, y define si una de
las tres ramas del flujo multi-parte existe de verdad.
