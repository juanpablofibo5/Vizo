# Siete preguntas al especialista PLD

**27 de agosto de 2026** · Fracción V Bis, desarrollo inmobiliario
Contrastado contra el texto del DOF, código 5795797, edición vespertina del 7 de agosto de 2026.

> **Versión para mandar.** Sustituye a «Once preguntas» del 24 de agosto. Cuatro preguntas se
> cerraron contra el texto publicado —dos porque el propio Acuerdo las contesta, dos porque
> dejaron de ser preguntas legales para volverse decisiones de producto— y dos citas se
> corrigieron (la Firma Electrónica Avanzada es la **fr. IX** del Art. 3, no una «VIII Quáter»
> que no existe; y la ventana de seis meses vive en el **Art. 19 de las Reglas**, no de la Ley).
> El 27-ago se sustituyó además una pregunta por instrucción de la revisión: la validación
> estricta del XSD bajó a nota de cortesía, y entró **el conflicto del histórico inmutable con
> el derecho de supresión** (B.3). El detalle de los cierres: revisión externa RES-11-A
> (`docs/referencia/orvex-specs-2026-08-27/`) e issue #31. Los identificadores entre corchetes
> remiten a `DECISIONES.md` §POR CONFIRMAR.

---

## Cómo leer esto

VIZO es el sistema de registro del cumplimiento PLD de un sujeto obligado. Todo lo regulatorio
—umbrales, plazos, campos obligatorios— vive como **dato versionado por vigencia**, no escrito en
el programa. Corregir una postura suele costar un renglón de catálogo, no un rediseño: ya pasó con
la base del umbral, que se confirmó contra el Art. 6 del Reglamento y costó un renombre.

Cada pregunta tiene hoy una **postura provisional funcionando en el sistema**. Ninguna bloquea el
desarrollo; todas bloquean lo que podemos afirmar. Van agrupadas por lo que cuesta equivocarse.
**Si el tiempo alcanza solo para tres, que sean las del bloque A.**

**Regla de la casa (estándar desde el 27-ago-2026):** todo lo que se manda al especialista cita
**el silencio exacto de la fuente, no solo su ausencia** — se nombra el artículo leído y se
transcribe lo que dice alrededor de lo que no dice. Una pregunta que solo afirma «la norma no lo
resuelve» obliga al especialista a releer todo; una que cita el silencio le deja discutir contra
el texto.

---

## Bloque A · Lo más caro — cambian qué avisos se generan

Una postura equivocada aquí produce avisos de más o de menos sobre operaciones reales. El aviso
de más se corrige; el omitido se sanciona con 10,000 a 65,000 UMA.

### A.1 — Después del primer aviso por acumulación, ¿qué se reporta? [#8]

En una preventa, los pagos 1 a 3 acumulan y disparan un aviso. El pago 4 deja la suma de la
ventana todavía por encima del umbral. Caben dos lecturas: **(a)** cada operación nueva que
mantiene la suma sobre el umbral se reporta; **(b)** la ventana se reinicia tras el aviso y vuelve
a disparar solo cuando las operaciones no reportadas cruzan el umbral por su cuenta.

**El marco guarda silencio, y ya lo leímos completo (27-ago-2026):** el Art. 19 de las Reglas
—reformado por el Acuerdo— fija la mecánica («periodos de hasta seis meses», iniciando con el
primer acto u operación) y remite al **Art. 7 del Reglamento**, que dispone presentar el Aviso
«al momento de realizar la última operación con la que se alcance o supere el umbral […] aun
cuando no se haya agotado el periodo referido» (`regulatorio/leyes/Reg_LFPIORPI.txt`, reformado
27-03-2026). **Ninguno de los dos aborda el efecto del aviso ya presentado sobre la ventana en
curso.** La pregunta es de interpretación, no de lectura.

**Hoy:** la lectura (a), por conservadora, fijada con prueba para que cambiarla sea deliberado.
**Si la respuesta es (b):** cambia el motor de acumulación y hay que reevaluar el histórico. Es el
cambio más caro de la lista.

### A.2 — ¿Contra qué monto se compara el Perfil transaccional? [#7]

El Art. 6 del Reglamento resuelve la base para dos cosas: el umbral del Art. 17 sin
contribuciones, la restricción de efectivo del Art. 32 con ellas. El Perfil transaccional no es
ninguna de las dos y ningún artículo lo alcanza: el Art. 3 fr. XI Sexties lo define por sus
elementos sin calificar la base del monto.

**Hoy:** se compara contra el monto total, contribuciones incluidas — es lo que el cliente
desembolsa y por tanto lo que estima al declarar. Ante la duda, detecta de más.
**Si es «sin contribuciones»:** cambia qué operaciones levantan alerta de desviación (Art. 23
Ter 2); no toca avisos.

**Relacionada:** un cliente de acto único (Art. 23 Ter 1 ¶4), ¿queda sujeto al ejercicio
semestral del ¶3? El ¶4 no lo exime expresamente, así que hoy sí queda — y eso produce
reevaluaciones sobre relaciones ya extinguidas.

### A.3 — «Montos máximos mensuales»: ¿mes de calendario o ventana de 30 días? [#6]

El Art. 23 Ter 1 ¶2 dice «mensuales», a secas. Lo leímos como mes de calendario: es lo que un
cliente entiende al estimar y lo que puede verificar si se le pregunta. La ventana deslizante de
30 días detectaría el reparto a caballo entre dos meses, pero esa lectura no sale del texto.

**Argumento que apoya la lectura actual:** cuando el mismo Acuerdo quiso una ventana móvil, la
ancló con esas palabras — el Art. 19 de las Reglas dispone que el periodo «iniciará a partir de
que se realice el primer acto u operación». En el 23 Ter 1 escribió «mensuales» sin ancla.
¿Basta ese contraste para sostener el mes de calendario ante un verificador, o la práctica de la
autoridad apunta en otra dirección?

**Por qué esta pesa distinto:** no es un dato de catálogo — es la forma de la regla. Cambiarla es
cambiar código.

---

## Bloque B · Lo que se sostiene ante la autoridad — cambian qué podemos afirmar

No alteran ningún cálculo. Determinan si la evidencia resiste una verificación y qué se puede
decir sin exagerar en una demostración de venta.

### B.1 — Sellado del manifiesto: ¿una constancia por expediente o por documento? [#1]

VIZO genera un manifiesto por versión de expediente: la lista de todos los archivos con su huella
SHA-256. ¿Una constancia NOM-151 sobre ese manifiesto satisface la exigencia de fecha cierta, o
la autoridad espera una por documento?

**Elemento nuevo:** el Art. 12 de las Reglas, reformado, permite conservar datos y documentos
«dentro de un mismo archivo físico o electrónico único» — la norma concibe el expediente como
unidad archivística. ¿Es argumento suficiente, o la práctica en visitas va por documento?

**Hoy:** manifiesto por versión de expediente, tabla de sellado diseñada y vacía. **Si es por
documento:** el costo se multiplica por el número de archivos; la tabla ya existe — se llenaría
distinto, no se rediseña.

### B.2 — Comprador extranjero sin RFC: ¿qué criterio de identidad resiste? [#2]

La acumulación de seis meses es por cliente, y sin RFC ni CURP no hay identificador fuerte. En el
corredor Cancún–Tulum no es caso de borde. El Anexo 5 admite pasaporte o documento del país de
origen y la documentación del INM; admite el documento, no resuelve qué combinación de datos es
una llave estable seis meses.

**Hoy:** acumulación conservadora por documento de identidad, con alerta y revisión humana.
**Lo que buscamos:** un criterio que un verificador acepte — pasaporte, FM/FMM, o combinación con
nacionalidad y fecha de nacimiento.

### B.3 — El histórico que por diseño no se puede borrar, frente a una solicitud de supresión [#11]

VIZO conserva la evidencia en almacenamiento **append-only**: bitácora encadenada, evaluaciones,
perfiles, cuestionarios. Eso resuelve los diez años que exige la LFPIORPI —Art. 18 fr. IV de la
Ley, y Arts. 41 fr. IV y 10 Septies 3 de las Reglas— pero no resuelve, y probablemente agrava, el
conflicto con la LFPDPPP: **un dato que por diseño no se puede borrar es una respuesta incómoda
ante una solicitud ARCO.**

**El silencio exacto:** la LFPDPPP sí trae la válvula — el Art. 25 fr. II exime de cancelar
cuando los datos «deban ser tratados por disposición legal», y el Art. 24 ordena **bloqueo**
previo a toda supresión (contrastados en `docs/LFPDPPP.md`). Lo que ningún texto dice es cómo
opera esa excepción **frente a un almacenamiento inmutable**: ni la LFPIORPI ni las Reglas
mencionan la supresión, y la LFPDPPP no distingue entre «no borro porque la ley me obliga a
conservar» y «no puedo borrar porque mi evidencia perdería integridad».

**Hoy:** el flujo está diseñado en papel (`docs/LFPDPPP.md` §2–3): solicitud ARCO con su reloj
de 20+15 días → cruce contra las excepciones del Art. 25 → lo exceptuado se **bloquea** citando
la obligación LFPIORPI, lo demás se suprime; cada resultado va a la bitácora con su artículo.
**Lo que buscamos:** si responder la supresión con bloqueo fundado en el Art. 25 fr. II sobre el
expediente y las evaluaciones **resiste en la práctica** ante la autoridad garante y en visitas
de verificación — y si la conservación inmutable de la *evidencia de cumplimiento* (no solo del
expediente) está cubierta por la misma excepción. **Si la respuesta es adversa:** toca la
arquitectura de conservación — el cambio más profundo de esta lista.

*La mitad LFPDPPP de esta pregunta va también al abogado (`docs/LFPDPPP.md` §3); al especialista
PLD se le pregunta la práctica de la autoridad, no la teoría del texto.*

---

## Bloque C · Capítulo nuevo, exigible el 1 de marzo de 2027 — abre o cierra un flujo

### C.1 — ¿Qué mecanismo de firma remota cumple el estándar del Código de Comercio? [#9]

> «El cuestionario […] podrá realizarse vía remota, por medios digitales o electrónicos, los
> cuales en todo caso deberán contener la **Firma Electrónica** de quien los suscribe.»
> — Art. 23 Ter 3 ¶3

El propio Acuerdo define dos cosas distintas en su Art. 3: la **fr. VIII Ter** es «Firma
Electrónica» conforme al **Código de Comercio**; la **fr. IX** es «Firma Electrónica Avanzada»,
el certificado del Código Fiscal — la e.firma. El ¶3 pide la primera. Eso abre la puerta a que el
cliente suscriba sin certificado del SAT. La pregunta es cuál mecanismo concreto —firma en
tablet, click-to-sign con acuse, correo con evidencia de atribución— resiste una verificación
bajo ese estándar.

**Hoy:** VIZO registra la huella SHA-256 del archivo firmado y no se pronuncia sobre su validez.
**Con la respuesta:** se puede construir el flujo remoto completo; hoy el obligado firma por su
cuenta y sube el resultado.

**Alcance ampliado — y ya sembrado:** la misma exigencia aparece en los **Anexos 3 y 5, inciso
b), numeral iv)** (líneas 625 y 663 del texto publicado): la **constancia de que se solicitó al
cliente información sobre su conocimiento del Beneficiario Controlador**, firmada autógrafa o con
Firma Electrónica — un documento de **todo expediente de persona física**, no solo del riesgo
alto. VIZO ya la exige en el catálogo con vigencia 30-nov-2026 (migración `20260827160000`). El
antecedente existe desde 2013/2014 como «Dueño Beneficiario» firmada
(`regulatorio/dof/rcg-historico/`); si esa versión sigue vigente hoy depende de la reforma del
30-nov-2020, cuyo texto está pendiente de conseguir. La respuesta sobre el mecanismo de firma
aplica a los dos documentos.

---

## Cuatro notas para no gastar tiempo

**De cortesía, si sobra un minuto: el ejemplo oficial del XSD está roto.** El XML de ejemplo que
el SAT publica para la Fr. V Bis no valida contra su propio esquema (`caractersiticas_desarrollo`
donde el XSD declara `caracteristicas_desarrollo`). VIZO genera y valida contra el XSD, nunca
contra el ejemplo, así que la respuesta no cambia el sistema — cambia lo que le advertimos a un
cliente que arma su XML a mano. Y cualquier señal sobre el calendario de la Resolución de
formatos del Transitorio Quinto se agradece.

**Ya resuelta: la base del umbral.** Cerrada el 16-ago contra el Art. 6 del Reglamento (reformado
27-03-2026): el umbral del Art. 17 sin contribuciones ni accesorios; el Aviso reporta el total
con ellas, sin desglosar; el efectivo del Art. 32 con ellas. No hace falta revisarla.

**Cerradas contra el texto del Acuerdo (27-ago-2026), no ocupan tiempo de consulta:** los campos
obligatorios del expediente remiten a Anexos concretos por tipo de cliente (Art. 12); la vigencia
del cuestionario de riesgo alto la delega la norma al Manual de cada obligado (Art. 23 Ter fr. V
y Art. 37 Bis fr. III — se vuelve parámetro configurable del producto); el fideicomiso de grado
alto queda fuera del Art. 23 Ter 4 por omisión del legislador y el hueco se enseña documentado;
y la ventana PEP tiene dos relojes (Art. 23 Quáter ¶4 y ¶5) que ya están modelados por separado.
Si alguna le parece mal cerrada, la observación se agradece.

**Fuera de este paquete: el registro real de los asesores.** Qué porcentaje de asesores
inmobiliarios está dado de alta en el SPPLD por cuenta propia frente a los que operan bajo el RFC
de la inmobiliaria. No es pregunta legal: es investigación de mercado, y define si una rama del
flujo multi-parte existe de verdad. Si tiene una impresión del campo, se agradece.

---

*Las citas provienen del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina), de la LFPIORPI
(reforma 16-jul-2025) y de su Reglamento (reforma 27-mar-2026), cuyos textos viven en
`regulatorio/` con su huella. Las posturas descritas son provisionales y operan hoy en el
sistema; se documentan para que la consulta parta de un estado conocido y no de una hoja en
blanco.*
