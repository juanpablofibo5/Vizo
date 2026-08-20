# El trío entrelazado del 1 de marzo de 2027 — Metodología, Grado de Riesgo y Conocimiento del Cliente

**Contrastado contra el DOF el 20 de agosto de 2026.** Fuente: `regulatorio/dof/acuerdo-115-2026.txt` (código 5795797, edición vespertina del 7-ago-2026, mismo archivo que usó `ROADMAP-2027.md`). Leí íntegros los tres capítulos, líneas 122–241 del archivo. Método de contraste: el de `ACUERDO-115-2026.md §0` — **✅** con artículo citado, **⚠️** cuando la afirmación depende de algo que no leí yo mismo en esta pasada.

**Qué es esto:** la ampliación de lo que `ROADMAP-2027.md` ya resumió de estos tres capítulos (16-ago-2026) hasta el nivel de detalle que hace falta para diseñar el esquema — elementos mínimos, dependencias entre capítulos, y la pregunta de frontera que falta decidir antes de construir nada.
**Qué NO es:** no decide si VIZO construye esto, cuándo, ni cómo se resuelve la frontera de asesoría legal. Eso es un ADR de la siguiente sesión.

---

## 0. Relación con lo ya contrastado

`ROADMAP-2027.md` ya cerró tres cosas de este trío el 16-ago-2026 y no las repito, solo las confirmo con la lectura directa del artículo:

- Cap. II Quáter: "nada construido. Es el insumo del Manual (Transitorio Tercero), así que uno arrastra al otro." — confirmado y desarrollado en §2.
- Cap. III Bis: "`clientes_finales.nivel_riesgo` y la tabla `factores_riesgo` existen vacías desde la migración 001. La puerta quedó abierta a propósito (ADR-06)." — confirmado, y en §3 encuentro que la puerta está abierta a menos de lo que el artículo exige (ver el hallazgo del enum de 3 valores).
- Cap. III Ter: "el motor ya acumula por cliente en ventana deslizante, que es la materia prima del perfil. Del resto, nada." — confirmado y ampliado en §5.

Lo que este documento agrega: la transcripción con las frases que deciden diseño, el mapa de dependencias explícito y argumentado, el catálogo vs. estructura concreto, y la pregunta de frontera en su forma final.

---

## 1. La transcripción contrastada

### 1.1 Cap. II Quáter — Enfoque basado en Riesgos (Arts. 10 Septies a 10 Septies 6)

**✅ Art. 10 Septies** — obligación general: diseñar e implementar una metodología de evaluación de Riesgos, derivada de actos/operaciones, Clientes/Usuarias, transacciones y canales. Fundamento: Art. 18 fr. VII de la Ley.

> «El diseño de la metodología […] deberá estar establecido en su Manual de Políticas Internas, **o bien, en algún otro documento o manual** elaborado por quienes realicen Actividades Vulnerables» (¶2).

Esta cláusula es importante: Cap. II Quáter **sí** admite explícitamente que la metodología viva en un documento distinto del Manual — el mismo mecanismo que ADR-20 usó para la Constancia de mecanismos (`Art. 37 ¶2`, citado ahí, no releído por mí — ver nota de alcance en §2). Volveré a esto en el mapa de dependencias, porque **Cap. III Bis y Cap. III Ter no repiten esta cláusula en su propio texto** (ver 1.2 y 1.3).

También exige evaluación de Riesgos **antes** de lanzar nuevos medios/canales/productos/servicios o de dirigirse a nuevos tipos de Clientes (¶3) — un gatillo por evento, no solo por calendario.

**✅ Art. 10 Septies 1** — los elementos mínimos, en tres fracciones:

- **Fr. I — identificación de elementos e indicadores**, considerando **al menos** cuatro elementos de exposición:
  > a) actos u operaciones; b) tipo de personas Clientes o Usuarias; c) países y áreas geográficas; d) transacciones y canales de envío o distribución vinculados con los actos u operaciones celebrados con sus Clientes o Usuarias, en su caso.

- **Fr. II — método de medición**: relacionar indicadores con su elemento, **asignar un valor a cada indicador** de manera consistente según su importancia, y **asignar un valor a cada elemento** de la misma forma.

- **Fr. III — Mitigantes**: identificar los que ya están implementados al momento del diseño, considerando políticas/criterios/medidas/procedimientos del Manual **y su efectiva aplicación**, para establecer su efecto sobre los indicadores y elementos de la Fr. I.

  Además, un párrafo final de este artículo exige indicadores **específicos** ligados a los delitos de los Arts. 139 Quáter y 400 Bis del Código Penal Federal, para cada elemento de riesgo de la Fr. I — no es un elemento adicional, es una obligación transversal sobre los cuatro.

**✅ Art. 10 Septies 2** — implementación:

- Fr. I: sin inconsistencias entre la metodología y los mecanismos automatizados del Art. 18 fr. X de la Ley.
- Fr. II: usar **al menos** datos de un periodo **no menor a doce meses** (total de Clientes, actos/operaciones, monto operado). Sin operaciones en ese periodo → metodología inicial con **datos proyectados**, actualizable al cumplir los primeros doce meses.
- Si la implementación detecta Riesgos mayores o nuevos, modificar Mitigantes en **no más de doce meses** desde que se tengan los resultados de implementación identificados (año y mes).

**✅ Art. 10 Septies 3** — revisión y actualización: cuando se detecten nuevos Riesgos, cuando se actualice la Evaluación Nacional de Riesgos, o en **no más de doce meses** desde los resultados de implementación. Por escrito, a disposición del SAT. El SAT puede ordenar ajustes a la metodología o a los Mitigantes, y pedir un plan de acción. **Conservación: al menos diez años.**

**✅ Art. 10 Septies 4, 5, 6** — cumplimiento en concordancia con los resultados de la metodología (4); la UIF emite guías (5, no aplica al obligado); la Secretaría privilegia el enfoque basado en Riesgo en su ejercicio de facultades (6, dirigido a la autoridad).

### 1.2 Cap. III Bis — Clasificación del Grado de Riesgo (Arts. 23 Bis a 23 Bis 4)

**✅ Art. 23 Bis**:
> «deberán contar con un modelo de evaluación de Riesgos, que deberá ser **coherente con la metodología** a que se refiere el Capítulo II Quáter […] para clasificar a sus Clientes o Usuarias por Grado de Riesgo individual, el cual deberá **estar establecido en su Manual de Políticas Internas**.»

Nótese: aquí **no** aparece la cláusula «o bien, en algún otro documento» que sí trae el Art. 10 Septies. Marco esto **⚠️ pendiente de resolver junto con Cap. X** — ver §2.

> «deberán establecer, al menos, **tres clasificaciones**, consistentes en Grados de Riesgo bajo, medio y alto, pudiendo establecer tantos Grados de Riesgo **intermedios como consideren necesario**.» (¶2)

**✅ Art. 23 Bis 1** — Grado de Riesgo inicial a partir de la información que dé el Cliente. Reevaluación:
> «deberán llevar a cabo la evaluación del Grado de Riesgo **al menos cada seis meses** […] La frecuencia de la evaluación deberá ser mayor cuando la clasificación del Grado de Riesgo también lo sea.»

La frecuencia no es fija: es un piso (6 meses) que sube con el riesgo del cliente — no un intervalo único aplicable a toda la cartera.

**✅ Art. 23 Bis 2** — factores de Riesgo, **considerados en el desarrollo del mismo modelo del Cap. II Quáter** (no un modelo aparte), al menos dos categorías:
- Fr. I — **características inherentes**: antecedentes, tipo de persona, fecha de nacimiento/constitución, giro/actividad, nacionalidad, lugar de residencia, fuentes de ingreso, naturaleza y propósito de la relación, «entre otros» (lista no exhaustiva).
- Fr. II — **características transaccionales**: tipo, volumen en número, frecuencia y monto de actos/operaciones, número de contrapartes, origen y destino de recursos, instrumento monetario, tipo de moneda, «entre otros».

**✅ Art. 23 Bis 3** — factores de Riesgo **adicionales** para PEP de nacionalidad mexicana, para verificar si el comportamiento transaccional corresponde razonablemente con ingresos, funciones, nivel y responsabilidad. Fundamento: Art. 18 fr. X de la Ley.

**✅ Art. 23 Bis 4** — riesgo alto por defecto, la frase que decide diseño:

> «deberán considerar como personas Clientes o Usuarias de Grado de Riesgo alto, **al menos** a aquéllas no residentes en territorio mexicano y que se encuentren, estén vinculados o tengan efectos en los países o jurisdicciones que la legislación mexicana considera que aplican regímenes fiscales preferentes o que […] no cuentan con medidas para prevenir, detectar y combatir dichas operaciones, o bien, cuando la aplicación de dichas medidas sea deficiente; **así como a las Personas Políticamente Expuestas extranjeras**.»

Dos gatillos automáticos de riesgo alto: (a) no residente + jurisdicción señalada, (b) PEP extranjera — sin excepción, sin discreción del obligado. Además:
- ¶2: cuando se dé este caso, hay que **recabar y asentar las razones** por las que el Cliente celebró el acto en territorio mexicano.
- ¶3: **la UIF publica la lista** de países/jurisdicciones en el Portal — el obligado no la construye ni la interpreta, la consume.

### 1.3 Cap. III Ter — Conocimiento de la Persona Cliente o Usuaria (Arts. 23 Ter a 23 Ter 5)

**✅ Art. 23 Ter** — política de conocimiento del cliente, **al menos** cinco elementos (Art. 18 fr. I de la Ley):
- Fr. I: políticas/criterios/medidas/procedimientos/controles para mitigar Riesgos, **«que deben ajustarse a los resultados derivados de la implementación de la metodología»** del Cap. II Quáter.
- Fr. II: procedimientos de seguimiento y monitoreo de actos/operaciones.
- Fr. III: procedimientos para el debido conocimiento del **Perfil transaccional**.
- Fr. IV: supuestos en que un acto/operación se aparta del Perfil transaccional, y cuándo eso obliga a revisar/actualizar el expediente.
- Fr. V: **criterios para establecer y, en su caso, modificar el Grado de Riesgo previamente determinado** al Cliente.

> «La política […] se deberá basar en el **Grado de Riesgo** que represente el Cliente o Usuaria y estar **integrada en el Manual de Políticas Internas**.» (¶ final)

Igual que en Cap. III Bis, aquí tampoco aparece la cláusula del «documento distinto» — dice «integrada», no «establecida, o bien, en algún otro documento».

**✅ Art. 23 Ter 1** — Perfil transaccional, **al menos**:
- Fr. I: información del Cliente o la que obre en archivos propios.
- Fr. II: monto, número y frecuencia de actos/operaciones.
- Fr. III: origen y destino de recursos/bienes.
- Fr. IV: **«los demás elementos y criterios que determine quien realice la Actividad Vulnerable»** — el artículo mismo delega la definición de criterios adicionales al obligado, no a un tercero.

Mecánica temporal, literal:
> «deberán considerar, **al menos durante los seis primeros meses** siguientes en que se llevó a cabo el acto u operación […] la información que proporcione cada uno de sus Clientes […] relativa a los **montos máximos mensuales** […] para determinar su Perfil transaccional **inicial**, que deberá estar incluido en el sistema de alertas […] con objeto de detectar inconsistencias» (¶2)
> «deberán llevar a cabo, **al menos cada seis meses**, la evaluación del Perfil transaccional […] Las evaluaciones se realizarán sobre aquellos Clientes […] cuyo acto u operación se hubiere realizado **al menos con seis meses de anticipación**» (¶3)

Caso especial (¶4): cliente de un solo acto/operación que extingue la relación en el momento → el Perfil transaccional se integra solo con lo declarado en ese acto único.

**✅ Art. 23 Ter 2** — sistema de alertas:
> «deberán tener e implementar un sistema de alertas que permita el seguimiento y, en su caso, **la detección oportuna de algún cambio en el comportamiento o Perfil transaccional** del Cliente o Usuaria que le permita implementar las medidas necesarias para prevenir o detectar actos, operaciones u omisiones» ligadas a los Arts. 139 Quáter o 400 Bis del Código Penal Federal.

**✅ Art. 23 Ter 3** — riesgo alto → mayor información sobre actividad preponderante y **monitoreo más estricto**. Además:
> «deberá aplicar a sus Clientes […] que hayan catalogado con Grado de Riesgo alto […] así como a los Clientes […] nuevos clasificados como tal, **cuestionarios de identificación** para obtener mayor información sobre el **origen y destino de los recursos** y de los actos u operaciones que realicen o pretendan llevar a cabo.» (¶2)

El cuestionario puede ser remoto/digital, pero **debe llevar Firma Electrónica** de quien lo suscribe (¶3).

**✅ Art. 23 Ter 4** — medidas reforzadas para riesgo alto, tres fracciones: personas físicas (origen/destino reforzado, y datos de cónyuge/dependientes/sociedades vinculadas si el Manual lo prevé); personas morales (mayor info de accionistas/socios, verificada contra registros electrónicos de la Secretaría de Economía); PEP extranjeras (documentación adicional de las personas de la Fr. I inciso b).

**✅ Art. 23 Ter 5** — la aprobación de directivo, la frase que decide el flujo:

> «Para los casos en que […] detecten que la persona que pretenda ser Cliente o Usuaria o que ya lo sea […] reúne los requisitos para ser considerada Persona Políticamente Expuesta y, además, con **Grado de Riesgo alto** deberá, de acuerdo con lo que al efecto se establezca en su Manual de Políticas Internas, **obtener la aprobación de un directivo o su equivalente** que consienta los actos u operaciones respectivos.»

Excepción explícita (¶2):
> «Cuando quien realice la Actividad Vulnerable sea una persona física, la aprobación referida […] se subsanará con una **constancia** en la que señale los motivos que consideró para realizar el acto u operación y documentarlo […]»

Dos caminos, no uno: (a) obligado persona moral → aprobación de un directivo que **consienta antes de operar** (bloqueante); (b) obligado persona física → autoconstancia razonada (no bloqueante, pero registrada). El gatillo es la **intersección** PEP + Grado de Riesgo alto, no cualquiera de los dos por separado.

---

## 2. El mapa de dependencias, explícito

**El orden normativo es metodología → grado → conocimiento/perfil, y no es negociable, por texto:**

1. **Grado de Riesgo depende de metodología, no la complementa — la usa.** Art. 23 Bis dice que el modelo debe ser «coherente con la metodología» del Cap. II Quáter, y Art. 23 Bis 2 va más lejos: los factores de riesgo se consideran **«en el desarrollo del modelo»** de ese mismo capítulo. No son dos modelos que luego se concilian; es **un solo modelo**, cuyo diseño ocurre en Cap. II Quáter y cuya salida (clasificación por cliente) se declara en Cap. III Bis. Construir la tabla de "factores de riesgo con peso" sin haber resuelto qué es un "elemento", un "indicador" y un "valor" en el sentido del Art. 10 Septies 1 es construir la mitad de un modelo sin la otra mitad.

2. **Conocimiento del cliente depende de metodología Y de grado, en dos puntos distintos del texto.** Art. 23 Ter fr. I ata las políticas de mitigación a **«los resultados derivados de la implementación de la metodología»** — no hay resultados que ajustar si la metodología no corrió. Y Art. 23 Ter fr. V liga los criterios de conocimiento a **«modificar el Grado de Riesgo previamente determinado»** — presupone que ya existe una clasificación previa. El propio disparador de las obligaciones reforzadas de Cap. III Ter (cuestionarios del Art. 23 Ter 3, medidas del 23 Ter 4, aprobación del 23 Ter 5) es literalmente el valor «Grado de Riesgo alto», que solo existe si Cap. III Bis ya corrió sobre ese cliente.

3. **Por qué no se puede invertir el orden en el build.** Construir el Perfil transaccional o el sistema de alertas antes de que exista Grado de Riesgo obligaría a una de dos cosas: (a) tratar a todos los clientes igual, lo cual contradice directamente el mandato de que la política «se deberá basar en el Grado de Riesgo» (Art. 23 Ter, párrafo final); o (b) hardcodear un nivel de riesgo provisional que después hay que retrofitear sobre expedientes y operaciones ya vivos — exactamente el patrón que ADR-05, ADR-06 y ADR-15 existen para evitar (una tabla o columna agregada después, sobre datos personales regulados, es migración de riesgo).

4. **El Manual (Cap. X, fuera de mi encargo) es el punto de convergencia — pero el texto no trata a los tres capítulos igual respecto de si puede vivir fuera del Manual.** Art. 10 Septies ¶2 dice expresamente que la metodología puede constar en el Manual **«o bien, en algún otro documento o manual»**. Art. 23 Bis dice que el modelo de grado **«deberá estar establecido en su Manual»** (sin la cláusula alterna). Art. 23 Ter, párrafo final, dice que la política de conocimiento debe **«estar integrada en el Manual»** (misma ausencia). 

   **⚠️ Esto es una tensión textual real que no resolví, porque su resolución depende de un artículo fuera de mi capítulo asignado**: `ACUERDO-115-2026.md §0` y ADR-20 ya contrastaron y citaron el **Art. 37 ¶2** — *«se deberán incluir las referencias de aquellos criterios, medidas, procedimientos internos y demás información que […] puedan quedar plasmados en un documento distinto»* — como la cláusula general que permite separar Manual de Constancia. Si esa cláusula general del Art. 37 aplica a **todo** el contenido del Manual (los 14 apartados, sin importar el capítulo de origen), entonces Cap. III Bis y Cap. III Ter también pueden vivir en un documento distinto, y la ausencia de la cláusula alterna en sus propios artículos es irrelevante — el Art. 37 ya la cubre a nivel de Manual completo. Si en cambio el Art. 37 ¶2 es una cláusula sobre "referencias" y no una autorización blanket para sacar contenido normativo del Manual, la distinción de redacción entre Cap. II Quáter (con cláusula alterna) y Caps. III Bis/III Ter (sin ella) podría ser deliberada — y entonces el patrón de ADR-20 (Constancia + hueco) aplicaría distinto por capítulo. **Quien construya el ADR de este trío necesita leer el Art. 37 completo, no solo el ¶2 ya citado, antes de asumir que el patrón de la Constancia se extiende sin fricción a Grado de Riesgo y Conocimiento del Cliente.**

**Resumen del bloqueo, en una frase:** no se puede diseñar el esquema de Grado de Riesgo sin que Metodología ya haya definido qué es un factor y cómo se pondera; no se puede diseñar Perfil transaccional/alertas sin que Grado de Riesgo ya clasifique al cliente, porque el propio texto activa las obligaciones reforzadas de Conocimiento del Cliente sobre el valor «alto» que Grado de Riesgo produce.

---

## 3. Qué sería dato de catálogo y qué sería estructura

### 3.1 Dato de catálogo (regla dura 1 — versionado por vigencia, nunca hardcode)

| Dato | Valor citado | Fundamento | Nota |
|---|---|---|---|
| Plazo de reevaluación del Grado de Riesgo | al menos 6 meses | Art. 23 Bis 1 | Sube con el riesgo del cliente — no es un solo valor, es un piso |
| Plazo de reevaluación del Perfil transaccional | al menos 6 meses | Art. 23 Ter 1 ¶3 | **Mismo valor numérico que el de arriba, pero fundamento distinto** — no deben compartir fila en el catálogo. Si una RCG futura cambia uno, el otro no se mueve solo |
| Periodo mínimo de datos para implementar la metodología | no menor a 12 meses | Art. 10 Septies 2 fr. II | Ya existe el patrón: `parametros_motor` guarda la ventana de 6 meses del Art. 19 con el mismo tratamiento |
| Plazo de actualización con datos proyectados | primeros 12 meses de operación | Art. 10 Septies 2 ¶2 | Mismo valor (12) que el de arriba, fundamento distinto — mismo cuidado |
| Plazo máximo para modificar Mitigantes tras detectar nuevo riesgo | no mayor a 12 meses | Art. 10 Septies 2 ¶3 / 10 Septies 3 | — |
| Conservación de info/documentación del Cap. II Quáter | al menos 10 años | Art. 10 Septies 3 ¶2 | Fundamento propio — no asumir que es "la misma" retención de 10 años que cita `ACUERDO-115-2026.md §6` para el Art. 41 (Cap. XIII, fuera de mi encargo); son dos artículos distintos con el mismo número |
| Lista de países/jurisdicciones de riesgo alto por defecto | — | Art. 23 Bis 4 ¶3 | La publica la UIF vía Portal. VIZO la **carga**, no la decide — mismo patrón que `catalogos_sat` |
| Los cuatro elementos mínimos de exposición | actos/operaciones · tipo de cliente · países y áreas geográficas · transacciones y canales | Art. 10 Septies 1 fr. I | Estructuralmente estable pero versionado: si un Acuerdo futuro cambia la lista, es un INSERT, no un redeploy |
| Mínimo de clasificaciones de Grado de Riesgo | al menos 3 | Art. 23 Bis ¶2 | El mínimo es dato; el conjunto real de grados por tenant es estructura (ver 3.2) |

### 3.2 Estructura (tablas nuevas o rediseño — porque son relaciones u objetos con historia, no valores)

- **Modelo de riesgo del tenant, separado del resultado por cliente.** La tabla `factores_riesgo` (`supabase/migrations/20260806182338_esqueleto_post_mvp.sql:44`) está *scoped* a `cliente_id`: guarda el resultado de aplicar un factor a un cliente (`factor`, `valor`, `peso`, `evaluado_en`), no la **configuración** del modelo (qué factores existen, qué indicadores tiene cada uno, con qué peso, vigente desde cuándo). Art. 23 Bis 2 exige que el modelo se desarrolle una vez y se aplique consistentemente a todos los clientes — hace falta una tabla de configuración por tenant (con vigencia), y `factores_riesgo` pasa a ser el registro histórico de haberla ejecutado sobre un cliente — el mismo patrón que `evaluaciones_umbral` respecto de `umbrales`.

- **El enum `nivel_riesgo` no alcanza lo que exige Art. 23 Bis ¶2.** `create type nivel_riesgo as enum ('bajo', 'medio', 'alto')` (`supabase/migrations/20260806182325_fundamentos.sql:161`) fija exactamente tres valores. El artículo dice **«al menos» tres, pudiendo establecer tantos intermedios como consideren necesario** — eso es configuración por tenant, y un enum de Postgres no lo permite sin una migración cada vez que un obligado quiera un grado intermedio. Hace falta una tabla catálogo de grados (global con niveles configurables, o por tenant) en vez del enum actual — este es el hallazgo estructural más concreto de este contraste.

- **Histórico de cambios de Grado de Riesgo, append-only.** Hoy `clientes_finales.nivel_riesgo` es una columna mutable (`supabase/migrations/20260806182334_nucleo_operativo.sql:30`). `ACUERDO-115-2026.md §6` cita el Art. 41 (Cap. XIII, fuera de mi encargo) exigiendo conservar el histórico de modificaciones del grado — una columna que se sobrescribe no lo cumple. Hace falta una tabla `evaluaciones_riesgo` append-only, mismo patrón que `evaluaciones_umbral`.

- **Tabla `perfil_transaccional`, que no existe.** Necesita: monto máximo mensual declarado (inicial, Art. 23 Ter 1 ¶2), vigente desde/hasta, y su propio histórico append-only (mismo patrón, porque Art. 23 Ter 1 ¶3 exige reevaluar y "determinar si resulta o no necesario modificarlo" — modificar con historia, no sobrescribir).

- **El enum `tipo_alerta` no tiene categoría para desviación de perfil.** Valores actuales: `'proximidad', 'aviso_requerido', 'revision_identidad', 'screening', 'calendario'` (`supabase/migrations/20260806182325_fundamentos.sql:147`). Art. 23 Ter 2 exige alertar sobre **cambios en el comportamiento o Perfil transaccional** — no hay valor para eso. Además `alertas.evaluacion_id` hoy solo referencia `evaluaciones_umbral` (`supabase/migrations/20260806182334_nucleo_operativo.sql:238-240`); una desviación de perfil no nace de una evaluación de umbral, nace de comparar una operación contra el perfil declarado — la FK actual no le queda.

- **Tabla de cuestionarios de origen/destino para riesgo alto**, que no existe. Art. 23 Ter 3 exige que puedan firmarse electrónicamente (Firma Electrónica) — eso es un campo de evidencia, no solo texto libre.

- **Estado de aprobación de directivo (Art. 23 Ter 5), con dos caminos.** Mismo patrón que `designaciones_rec` (citado en `ACUERDO-115-2026.md §0`): un estado con transiciones, quién aprobó, cuándo, bloqueante para persona moral; y una rama distinta (constancia autogenerada, no bloqueante) cuando el obligado mismo es persona física. No es una casilla "aprobado sí/no": el artículo describe dos procedimientos distintos según el tipo de obligado.

---

## 4. La pregunta de frontera

**Forma final, lista para convertirse en ADR sin releer el Acuerdo:**

> **¿VIZO puede proponer los factores de riesgo, sus indicadores y sus ponderaciones (pesos) del modelo del Cap. II Quáter / Cap. III Bis — o el obligado debe configurarlos y VIZO se limita a ejecutar el cálculo, documentarlo y conservarlo?**

**Respuesta A — VIZO propone factores y pesos.**
- Cruza la frontera 5 de `ALCANCE.md §0` («No asesora legalmente»): decidir qué hace a un cliente más o menos riesgoso, y cuánto pesa cada cosa, es exactamente el tipo de juicio que el propio Art. 10 Septies ¶1 amarra al **contexto de cada Actividad Vulnerable** — es interpretación normativa aplicada a un negocio concreto, no un hecho verificable con una consulta a la base.
- Es además la misma línea que la frontera 2 («No decide riesgo con un LLM») protege en su forma más simple: aquí no habría LLM, pero el resultado —un número que clasifica el riesgo de una persona— sería igual de un juicio de VIZO, no del obligado.
- Consecuencia práctica: cualquier peso o indicador "por defecto" que VIZO sugiera se vuelve, en los hechos, la metodología del obligado, y el Art. 37 Bis 3 permite al SAT ordenar modificaciones al Manual — quien respondería por un modelo mal calibrado sería el obligado, pero quien lo habría diseñado sería VIZO. Es el mismo argumento que descartó la alternativa (a) de ADR-20 para el Manual completo asistido.

**Respuesta B — El obligado configura, VIZO ejecuta/documenta/conserva.**
- Es el paralelo exacto de la Constancia de ADR-20: VIZO no redacta política, VIZO **acredita con datos** lo que el obligado ya decidió y ejecutó. El obligado entra al sistema con sus propios elementos, indicadores y pesos (dentro de los cuatro elementos mínimos que el propio Art. 10 Septies 1 fr. I ya fija como piso — eso sí es transcripción de la norma, no propuesta de VIZO); VIZO corre el cálculo de forma consistente, guarda el histórico append-only, genera las alertas y bloquea la operación con PEP+riesgo alto hasta que exista la aprobación registrada.
- Consecuencia práctica: VIZO puede construir el **motor** (engine que aplica la ponderación configurada, exactamente como ya hace con el motor de umbrales — ADR-08, función pura sobre datos versionados) sin tocar la frontera, porque el motor no decide qué pesa: ejecuta lo que el obligado configuró. La UI de configuración es la misma pieza que la UI del catálogo regulatorio, aplicada por tenant en vez de por regulación.
- Costo: el obligado necesita ayuda para llenar esa configuración con criterio propio (probablemente vía su especialista PLD o despacho), y VIZO **no puede llenar ese hueco con una recomendación** sin volver a Respuesta A por la puerta trasera — el mismo cuidado que ADR-20 puso en el índice del Manual: el hueco se queda hueco, con su artículo citado.

**Lo que no cambia según cuál se elija:** el motor de cálculo (ADR-08), el histórico append-only, el sistema de alertas, los cuestionarios de captura y el gate de aprobación de directivo son producto en cualquiera de las dos respuestas — son ejecución y evidencia, no propuesta de criterio. Lo único que cambia es **quién llena la tabla de configuración de factores/pesos**: si VIZO la prellena con valores sugeridos, es Respuesta A; si nace vacía y solo el obligado la llena (con o sin ayuda externa a VIZO), es Respuesta B.

---

## 5. Lo que ya tiene VIZO, y lo que falta

**Insumo existente — materia prima real, no solo intención:**

- `operaciones` (`supabase/migrations/20260806182334_nucleo_operativo.sql:127`) ya captura, por cliente, fecha del acto, monto, forma de pago — exactamente los datos que Art. 23 Bis 2 fr. II pide como «características transaccionales» (tipo, volumen, frecuencia, monto) y que Art. 23 Ter 1 fr. II pide para el Perfil transaccional (monto, número, frecuencia).
- `evaluaciones_umbral.suma_ventana` y `evaluaciones_umbral.operaciones_acumuladas` (`supabase/migrations/20260806182334_nucleo_operativo.sql:203-227`) ya acumulan por cliente en ventana deslizante (Art. 19, construido semana 4) — es la ventana de **umbral**, no la de **perfil**, pero la mecánica de acumular-por-cliente-en-el-tiempo ya existe y probada: es el primer borrador operativo de lo que Art. 23 Ter 1 pide como Perfil transaccional, aunque el fundamento y el periodo (6 meses de perfil vs. 6 meses de acumulación de umbral, por Art. 19) sean legalmente distintos y no deban fusionarse sin más (ver 3.1).
- `clientes_finales.nivel_riesgo` y `factores_riesgo` existen vacías desde ADR-06 — la puerta está abierta, pero según §3.2, el enum de 3 valores y el *scope* por cliente (no por modelo del tenant) no alcanzan lo que exige Art. 23 Bis ¶2. La puerta está abierta a una habitación más chica de lo necesario.
- `alertas` existe con su propio enum y patrón de atención humana (`estado`, `atendida_por`, `atendida_en`) — el patrón de "alerta abierta → atendida por alguien, con timestamp" ya está probado y es reutilizable para desviaciones de perfil; falta el valor del enum y una FK que no dependa de `evaluaciones_umbral`.
- El patrón de aprobación-que-bloquea-con-camino-alterno-para-persona-física ya tiene un precedente construido: `designaciones_rec` (citado en `ACUERDO-115-2026.md §0`), que resuelve un problema estructuralmente parecido (una obligación que recae en la persona física a falta de un tercero designado).

**Lo que falta, en el orden que dicta el mapa de dependencias de §2:**

1. Metodología (Cap. II Quáter): nada — ni tabla de configuración del modelo, ni de mitigantes declarados, ni del método de medición.
2. Grado de riesgo (Cap. III Bis): el enum de grados configurable, la tabla de configuración del modelo (separada del resultado por cliente), el histórico append-only de evaluaciones de riesgo, y la lista de jurisdicciones de riesgo alto (dato de catálogo pendiente de que la UIF la publique).
3. Conocimiento del cliente (Cap. III Ter): la tabla `perfil_transaccional` completa, la extensión de `alertas` para desviaciones de perfil, los cuestionarios de origen/destino con Firma Electrónica, y el estado de aprobación de directivo con su rama de persona física.

Ninguna de las tres piezas se puede construir de forma útil sin que la anterior exista primero — no por preferencia de diseño, sino porque el propio texto liga unas a otras (§2).

---

## 6. Resumen para el reporte

**Contrastado con lectura directa del DOF (líneas 122–241 de `acuerdo-115-2026.txt`):** los tres capítulos completos — Cap. II Quáter (Arts. 10 Septies a 10 Septies 6), Cap. III Bis (Arts. 23 Bis a 23 Bis 4), Cap. III Ter (Arts. 23 Ter a 23 Ter 5, incluida la excepción de persona física del párrafo final).

**Marcado ⚠️ — no verificado en esta pasada:**
- La interacción exacta entre la cláusula alterna de documento del Art. 10 Septies ¶2 y la ausencia de esa misma cláusula en Art. 23 Bis y Art. 23 Ter — depende de leer el **Art. 37 completo** (Cap. X, fuera de mi encargo), no solo el ¶2 que ya citó ADR-20.
- Las seis funciones del Art. 41 (Cap. XIII) y el histórico de 10 años que cita `ACUERDO-115-2026.md §6` — no las releí; las cito por referencia a ese documento, no como contraste propio.

**La pregunta de frontera, en su forma final, está en §4** — con sus dos respuestas y las consecuencias de cada una, sin necesidad de releer el Acuerdo para decidirla en la siguiente sesión.
