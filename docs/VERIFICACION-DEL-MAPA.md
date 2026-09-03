# Verificación del mapa — contrastar los documentos contra el código

> **Por qué existe este archivo.** `ROADMAP-2027.md` y `ALCANCE.md` son los
> documentos con los que se decide qué se construye. En dos días aparecieron
> **cuatro** afirmaciones suyas que daban por «no construido» algo que sí
> estaba: el Cap. II Quáter (24-ago), el Cap. III Bis y dos filas de la tabla
> del Cap. XIII (2-sep). No es mala fe ni descuido: cada capítulo construido
> deja atrás una línea que nadie volvió a leer.
>
> El costo ya se cobró. El 2-sep recomendé arrancar con el Beneficiario
> Controlador diciendo «falta el árbol»; el árbol llevaba doce días escrito y
> con pruebas — lo que faltaba era que algo lo importara. Y el Cap. XIII se
> veía como el hueco grande cuando tres de sus seis funciones ya estaban.
>
> Un mapa que exagera lo que falta hace planear de más; uno que exagera lo
> construido hace llegar tarde. Los dos errores son del mismo tipo: una
> afirmación que nadie volvió a contrastar.

## El método

Uno por uno, y sin atajos:

1. Lee la afirmación completa, no su encabezado.
2. Búscala en el código: tablas en la base local, funciones en `src/`,
   pantallas en `app/`, pruebas en `tests/`. **Ver el archivo no basta** — el
   caso del Beneficiario Controlador era un módulo entero con pruebas que
   nadie importaba. Comprueba que algo lo *use*.
3. Marca el resultado en la tabla de abajo con la fecha.
4. Si la afirmación está mal, **corrígela en su documento** dejando dicho qué
   decía antes y por qué era falsa — igual que las correcciones que ya llevan
   esos archivos. Una corrección silenciosa se vuelve a introducir.
5. Un commit por afirmación corregida, o uno por grupo si son de la misma
   sección. La suite en verde antes de cada uno.

**Lo que NO hace este barrido:** construir nada, ni decidir alcance, ni tocar
producción. Si al verificar aparece un hueco real, se anota aquí y se sigue.

## `docs/ROADMAP-2027.md` §2 — capítulo por capítulo

| Afirmación | Estado | Qué se encontró |
|---|---|---|
| Cap. II Ter · Fideicomisos (línea ~42) | ✅ 2-sep-2026 | **Exacta.** `estructura_del_obligado` + `integrantes_estructura` con los campos del Anexo por naturaleza impuestos por CHECK (`campos_de_fisica`, `campos_de_fideicomiso`), el ciclo `capturado→enviado→baja` con `corrige_a`, y el anidado acotado a fideicomitente/fideicomisario. La usa `app/configuracion` |
| Cap. III Quáter · PEP (~49) | ✅ 2-sep-2026 | Lo construido es exacto (dos relojes en catálogo, coherencia y congelado por trigger). **Dos frases caducadas, corregidas**: el «seguimiento reforzado pendiente» se construyó el 23-ago, y `consultas_screening` ya no está vacía. El riesgo alto por defecto de PEP extranjeras (23 Bis 4) sí sigue pendiente |
| Cap. II Quáter · Enfoque basado en Riesgos (~54) | ✅ 24-ago-2026 | Decía «nada construido»; la fr. I estaba desde el ADR-21 y la fr. II a medias |
| Cap. III Bis · Grado de riesgo (~66) | ✅ 2-sep-2026 | Decía «tablas vacías desde la migración 001»; están el modelo, la escala, las evaluaciones append-only y la pantalla que clasifica |
| Cap. III Ter · Perfil transaccional (~71) | ✅ 2-sep-2026 | **Exacta.** Tablas, vista de vigente, los dos «seis meses» en catálogo, persistencia, pantalla y pruebas |
| Cap. III Ter · Aprobación del Art. 23 Ter 5 (~73) | ✅ 2-sep-2026 | **Exacta.** `aprobaciones_directivo` y `operaciones_consentidas`, con pantalla y pruebas |
| Cap. III Ter · Cuestionario del Art. 23 Ter 3 (~75) | ✅ 2-sep-2026 | **Exacta.** `cuestionarios_riesgo_alto`, con pantalla y pruebas |
| Cap. III Ter · Medidas reforzadas del Art. 23 Ter 4 (~77) | ✅ 2-sep-2026 | **Exacta.** `medidas_reforzadas`, con pantalla y pruebas |
| Cap. III Quinquies · Beneficiario Controlador (~90) | ✅ 2-sep-2026 | Decía «falta el árbol»; el árbol estaba desde el 20-ago sin que nadie lo importara |
| Cap. X · Manual (~94) | ✅ 2-sep-2026 | **Decía que faltaba decidir una frontera, y llevaba diecisiete días decidida** (ADR-20, 16-ago). El índice del Manual existe en `apartados_manual` y sale en la Constancia. El reparto ya no es 7 y 7: es 5 acreditados, 3 parciales y 6 del obligado. Lo que sí falta es el documento del Manual. **Esta línea me hizo aconsejar mal**: el 2-sep le dije al usuario que el Cap. X «sigue bloqueado por una decisión tuya» |
| Cap. XII · Capacitación (~104) | ✅ 31-ago y 2-sep-2026 | |
| Cap. XIII · Mecanismos automatizados, tabla de seis funciones (~108) | ✅ 2-sep-2026 | Tres filas daban «no» sobre cosas construidas; la fr. V quedó parcial de verdad |
| Cap. XIV · Auditoría (~124) | ✅ 2-sep-2026 | **Tenía la peor de todas**: decía que el grado de riesgo de la ENTIDAD «no existe en el modelo» (issue #30). Existe desde el 30-ago y de él cuelga qué auditor aplica. Corregida. Lo del paquete de evidencia por obligación sigue siendo cierto: hay `manifiestos` y bitácora encadenada, no exportación por obligación |

## `docs/ROADMAP-2027.md`, otras secciones

| Sección | Estado | Qué se encontró |
|---|---|---|
| §1 · La tabla de fechas y sus transitorios | ✅ 2-sep-2026 | Trece renglones contra los Transitorios Primero a Décimo Segundo (líneas 741–754). Las tres fechas calculadas cuadran (30-nov-2026 + 6, 8 y 9 meses). **Una imprecisión corregida**: el renglón del Décimo decía que la aplicación Consulta PEP 2.0 «queda disponible»; el texto difiere la CONSULTA, no dice nada de la aplicación. De ahí colgaba un argumento de venta entero |
| §3 · Lo que el contraste corrigió del análisis original | ✅ 2-sep-2026 | **Exacta, las tres.** Cap. XI es «De los mecanismos de prevención» (línea 414) y su Art. 38 es lo que establece la UIF; Cap. XII es «Capacitación y selección de personal»; la fecha de la consulta PEP es derivable |
| §5 · Lo que sigue sin verificar | ✅ 2-sep-2026 | **Era más pesimista que la realidad y bloqueaba trabajo.** Decía que solo estaban transcritos el 2 Bis y el 2 Ter y marcaba el Anexo 10 como ausente; están los Anexos 1 al 10. Lo que falta de verdad son el **7-A** y el **7 Bis-A**, que no son el 7 ni el 7 Bis: aquéllos son las listas de entidades, éstos los datos que se piden de ellas. La decisión del ADR-32 de no llenar esos dos tipos era correcta |

## `docs/ALCANCE.md` — el mapa de rutas de F1

Catorce filas de la tabla de rutas más la tabla de estimación. Cada fila
declara un estado (`● existe`, `◐ rediseño`, `○ nueva`, `✅ construida`) y un
alcance.

| Fila | Estado | Qué se encontró |
|---|---|---|
| `/login` | ✅ 2-sep-2026 | **Exacta** |
| `/` Inicio | ✅ 2-sep-2026 | Decía `◐ rediseño`; el semáforo está construido (379 líneas, con sus estados de plazo). Corregida a `✅` |
| `/clientes` + `/nuevo` + `/[id]/expediente` | ✅ 2-sep-2026 | Decía «las siete secciones de conocimiento»; son ocho desde que entró la 08. Corregida |
| `/operaciones` + `/nueva` | ✅ 2-sep-2026 | **Exacta** |
| `/alertas` | ✅ 2-sep-2026 | **Exacta.** Su alcance F1 no enumera tipos de alerta, así que los del Art. 41 fr. V no la caducan |
| `/avisos` y `/avisos/[id]` | ✅ 2-sep-2026 | Decían `○ nueva`; las dos existen. Corregidas |
| `/entidad` | ✅ 2-sep-2026 | **Exacta** |
| `/mer` | ✅ 2-sep-2026 | **Exacta** |
| `/clientes/[id]/expediente` §08 | ✅ 2-sep-2026 | Fila nueva |
| `/capacitacion` | ✅ 31-ago-2026 | Fila nueva |
| `/evidencia` | ✅ 2-sep-2026 | Decía `○ nueva`; existe. Corregida |
| `/calendario` | ✅ 2-sep-2026 | Decía `○ nueva`; existe. Corregida |
| `/configuracion` | ✅ 2-sep-2026 | Decía `○ nueva`; existe con sus siete anclas. Corregida |
| Tabla de estimación (~151) | ✅ 2-sep-2026 | Las once rutas existen: ya no estima, describe. Marcada como histórico y conservada, porque el contraste estimado-vs-real es el único dato para estimar lo que sigue |

## Cierre del barrido — 2-sep-2026

Veintisiete afirmaciones contrastadas entre los dos documentos. **Once habían
caducado**, y ninguna por descuido: cada capítulo construido dejó atrás una
línea que nadie volvió a leer.

Las tres que más costaron, por orden de daño:

1. **Cap. XIV** decía que el grado de riesgo de la entidad «no existe en el
   modelo» y lo colgaba de un issue abierto. Existía desde el 30-ago, y de él
   cuelga qué auditor puede dictaminar — la decisión más cara del capítulo.
2. **Cap. X** decía que faltaba decidir una frontera decidida diecisiete días
   antes. Con esa línea le recomendé al usuario que el capítulo seguía
   bloqueado por una decisión suya.
3. **§5** daba por no transcritos anexos que sí están, y con eso bloqueaba el
   piso documental del Art. 12 fr. VII.

El patrón se repite en las once: **el documento se escribió antes de
construir y nadie volvió a leerlo después**. La única defensa barata es que
cada capítulo que se cierre actualice su línea en el mismo commit — como ya
se hizo con el Cap. XII y el Cap. III Quinquies, que salieron exactos.

## Después del barrido

- **Art. 39 Bis 2 · selección de personal** — construido el 3-sep-2026 (ADR-34).
  Con él, el Cap. XII queda completo salvo la coherencia temas↔metodología.

## Huecos reales encontrados durante el barrido

Se anotan aquí y **no se construyen** en este trabajo.

- **El «no se sabe» del Art. 41 fr. V no llega a la bandeja de alertas.** Un
  cliente sin clasificar y sin declaración PEP no levanta nada; se ve en el
  riel del expediente pero no en `/alertas`. Decisión de producto pendiente
  (ADR-33).
- **El cuarto supuesto del Art. 41 fr. V** —jurisdicciones— necesita dos
  fuentes que no tenemos contrastadas y un dato que el modelo no guarda.
- **La plantilla del Cap. XII no bloquea `DELETE`** como sí lo hacen las tres
  tablas de evidencia (ADR-31, «asimetría conocida»).
- ~~**El Apartado IV del Manual afirma algo que ya no es cierto.**~~ **Corregido
  el 3-sep-2026** con la migración `20260903090000`. Lo que sigue abierto es la
  mejora, no la corrección: que la Constancia recolecte además los hechos del
  cuestionario y de las medidas reforzadas pide un recolector nuevo y cambia lo
  que el documento afirma. El texto original del hallazgo:
- **(histórico) El Apartado IV del Manual afirmaba algo que ya no era cierto.** La fila que
  sirve `apartados_manual` dice que «el seguimiento reforzado de los Arts. 23
  Ter 3 y 23 Ter 4 […] todavía no está construido», y los dos se construyeron
  el 23-ago (ADR-25 y ADR-26). Sus tres `preguntas` para el obligado incluyen
  una que el sistema ya contesta. **Pesa más que una línea de documento**: el
  Manual es lo que el obligado presenta ante la autoridad. Se corrige con una
  migración nueva —las aplicadas no se editan— y el `origen` se queda en
  `acreditado_parcial`, porque el hueco de «quién autoriza» sigue abierto.
- **El inciso a) del Anexo 3 está elidido en el `.txt`.** Trae los numerales
  i) y v) y colapsa el resto («ii) a iv) …», «vi) a x) …»). El Art. 12 fr. VII
  ¶2 exige i), ii), iv) y ix). Lo que dicen los otros tres vive en
  `campos_expediente`, transcrito del RCG histórico, y esas filas ya llevan
  escrito `PENDIENTE: contraste directo contra el DOF`. **Lo escribí mal yo en
  este barrido**: dije que el Anexo 3 estaba y que eso desbloqueaba construir
  contra texto verificado, y me duró cuatro commits. Que el encabezado de un
  anexo esté no quiere decir que esté el numeral que se necesita.
- **El riesgo alto por defecto de las PEP extranjeras** (Art. 23 Bis 4,
  exigible 1-mar-2027) no está construido. Verificado el 2-sep.
