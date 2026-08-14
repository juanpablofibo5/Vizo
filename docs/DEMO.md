# Guion de demo — 10 minutos

**Para:** un sujeto obligado de la Fr. V Bis (desarrollo inmobiliario), o su Representante Encargado de Cumplimiento.
**Objetivo real:** no vender. **Escuchar qué pregunta primero** — esa pregunta es el dato que la demo existe para conseguir.

---

## Antes de empezar (5 minutos, a solas)

**En local:**

```bash
pnpm db:reset && pnpm demo:datos && pnpm dev
```

**Contra el ambiente desplegado** (`app.vizo.mx`), una sola vez: copia `.env.produccion.ejemplo` a `.env.produccion`, pega ahí la cadena de conexión admin del panel de Supabase, y corre

```bash
pnpm demo:datos:remoto
```

Es idempotente: si el obligado ya tiene operaciones, no toca nada.

Los dos deben imprimir `mayo → no`, `junio → no`, `junio → acumulacion`. Si el tercero no dice `acumulacion`, **no demuestres**: algo cambió y el momento clave no va a ocurrir.

Entra con `admin@vizo.mx`. Ten a la mano **un PDF cualquiera** para arrastrarlo al expediente.

Deja abiertas dos pestañas: el portal, y `/login` en ventana privada para el segundo usuario si vas a enseñar la separación de roles.

---

## El guion

### 0 · El encuadre (30 s) — antes de tocar nada

> "Esto no es un sistema para llenar formatos. Es el registro de tu cumplimiento: lo que enseñas el día que alguien pregunta. Te voy a mostrar el ciclo de un mes completo."

**No prometas nada que la pantalla no vaya a hacer.** Todo lo que sigue ocurre de verdad.

---

### 1 · Inicio — "¿estoy en regla hoy?" (1 min)

Estás en `/`. Señala la tarjeta grande, en rojo.

> "Lo primero que ves no es un tablero de métricas. Es la única pregunta que importa: **marzo de 2026 lleva N días vencido**. Y fíjate en algo — marzo no tiene ni una operación capturada."

**Lee el número de la pantalla, no de aquí.** Marzo venció el 17 de abril y la cuenta sube cada día: el 13 de agosto de 2026 iban 118. Un guion con la cifra escrita se desincroniza solo, y decir un número que la pantalla contradice cuesta más que no decirlo.

**El punto:** el sistema sabe que el obligado se dio de alta ante la autoridad en marzo, así que **debe informes en cero desde entonces**, haya operado o no.

> "Este es el incumplimiento que nadie ve, porque no hay nada que te lo recuerde. Un mes sin operaciones también debe su informe."

*Pausa aquí.* Si te preguntan "¿y eso se sanciona igual?", ya tienes su atención.

---

### 2 · El veredicto explicable (3 min) — **el corazón de la demo**

Ve a **Operaciones**. Hay tres pagos de preventa del mismo comprador:

| Fecha | Monto | Resultado |
|---|---|---|
| 14 may | $400,000 | No requiere aviso |
| 3 jun | $350,000 | No requiere aviso |
| 22 jun | $250,000 | **Aviso por acumulación** |

> "Mira los montos. El umbral de aviso de tu fracción son 8,025 UMA: **$941,412.75**. Ninguno de estos tres pagos lo cruza. El más grande es $400,000."

*Deja que lo procesen.*

> "Y sin embargo el tercero dispara aviso. ¿Por qué?"

Abre **"Por qué"** en el renglón del 22 de junio. Lee en voz alta lo que dice la pantalla:

> *"Aviso por acumulación: $1,000,000.00 sumados con 2 operación(es) previa(s) desde el 2025-12-22 (ventana de 6 meses) alcanzan el umbral de $941,412.75."*

Y señala el desglose: la UMA aplicada con su vigencia, el umbral en pesos y en UMA, la base con o sin IVA, y **las dos operaciones que suman, listadas con fecha y monto**.

**Los dos remates, en este orden:**

> "Quien evalúa pago por pago —en una hoja de cálculo, o a ojo— no avisa aquí. Y está incumpliendo sin enterarse."

> "Y esto de abajo" *(señala el hash del catálogo)* "es la versión exacta de la tabla de umbrales con la que se calculó. Dentro de tres años puedes reproducir este número y demostrar que era el correcto **entonces**."

**Aquí es donde escuchas.** Si preguntan "¿y si el SAT no está de acuerdo?" o "¿esto lo puedo imprimir?", anótalo: son las dos preguntas que más informan.

---

### 3 · El expediente y la huella (1.5 min)

Ve a **Clientes → Inversiones Palma Maya → Ver expediente**.

> "El expediente se arma contra el catálogo, no contra una lista que alguien escribió en el código. Van 3 de 13 requisitos."

**Arrastra el PDF** que preparaste. Cuando aparezca:

> "Esa cadena de 64 caracteres es la huella del archivo que acabas de subir. Si alguien lo cambia por otro —aunque sea un byte— la huella no coincide. No es que el sistema lo detecte: es que **no puede no detectarlo**."

---

### 4 · El aviso, de punta a punta (3 min)

Ve a **Avisos**. Están los cinco periodos con su estado y su plazo.

> "Junio es el que tiene la operación reportable. Los demás van en cero."

Presiona **Generar aviso del periodo** en junio. Cuando cargue, entra al aviso.

**Señala tres cosas, en orden:**

1. **El ciclo, con nombre y hora.** *"Cada paso salió de la bitácora. Dice quién lo hizo y cuándo — no que el sistema lo hizo."*

2. **El archivo, con su hash y su tamaño.** Presiona **Descargar XML** y ábrelo si te lo piden.
   > "Este archivo ya pasó la validación contra el esquema oficial del SAT. Si no hubiera validado, no existiría: el sistema no guarda avisos que el portal vaya a rechazar."

3. **La tarjeta de la frontera.** Léela tal cual:
   > *"VIZO no presenta el aviso. Descarga los archivos, preséntalos en el portal del SPPLD con la e.firma del sujeto obligado, y registra aquí el acuse."*

   > "Esto no es una limitación que estemos disculpando. **Es a propósito.** La responsabilidad legal de presentar es tuya y no queremos que sea de otro. Nosotros dejamos el archivo listo y guardamos la prueba."

Ahora **Marcar listo para revisión** → **Aprobar aviso**. Lee el texto del botón antes de apretarlo:

> *"Al aprobar declaras que revisaste este aviso. Tu nombre y la hora quedan en la bitácora, y no se puede deshacer."*

> "Aprobar no es guardar. Es firmar."

*(Opcional, si preguntan por roles: entra en la ventana privada como `capturista@vizo.mx`. El botón de aprobar está apagado — y si alguien llamara al sistema por debajo, la base de datos lo rechaza igual. La regla no vive en la pantalla.)*

---

### 5 · La evidencia (1 min) — el cierre

Ve a **Evidencia**.

> "Esto es lo que enseñas cuando alguien pregunta si tus registros son confiables."

Señala **Cadena íntegra** y el número de eventos.

> "Cada evento lleva el hash del anterior. Alterar cualquiera rompe todos los siguientes. Si algún día esto dijera *rota*, no sería un error del sistema: sería un hallazgo."

Y baja a la tarjeta de abajo:

> "Y aquí dice lo que **no** detecta: que le corten la cola. Preferimos decirlo a que lo descubras tú."

*Ese es el cierre.* No pidas nada más.

---

## Las preguntas que importan (haz estas dos, siempre)

Del análisis del Acuerdo 115/2026, son las que más informan sobre segmento y precio a la vez:

1. **¿Qué le cotizó, o le cobró, un despacho por armar su metodología de riesgo y su Manual de Políticas Internas?**
   *Calibra el ancla de valor con un número verificable.*

2. **De sus compradores del último año, ¿cuántos fueron extranjeros no residentes?**
   *Determina si cae en diligencia reforzada como caso normal — y con eso, cuánta carga operativa tiene de verdad.*

**De estructura, si hay tiempo:** ¿bajo cuántos RFC opera? · ¿quién es su REC y ya aceptó la designación en el Portal? · ¿ya tiene Manual y cuándo lo actualizó? · **¿en qué herramienta lleva hoy sus expedientes y su acumulación?** · ¿opera algún desarrollo a través de fideicomiso?

---

## Lo que NO se enseña, y por qué

- **Nada del Acuerdo 115/2026.** Salió el 7 de agosto y no está contrastado contra el DOF. Mencionar las fechas —30 de noviembre, 1 de marzo— está bien; enseñar funcionalidad que asume su articulado, no.
- **Precio.** Esta conversación es de descubrimiento. Si preguntan, la respuesta honesta es *"todavía no lo fijamos, y por eso estoy haciendo estas entrevistas"*. Un descuento otorgado ahora se vuelve el precio de referencia de ese cliente para siempre, justo antes del pico de disposición a pagar.
- **Promesas de fecha.** Lo que está construido se enseña; lo que no, se dice que no está.

---

## Si algo falla en vivo

No lo disimules. En un sistema cuyo argumento es la trazabilidad, tapar un error en la demo contradice la venta entera.

> "Eso es un bug, lo anoto."

Y sigue. La única falla que **sí** aborta la demo es que el veredicto de acumulación no aparezca: sin ese momento, el resto es una interfaz bonita sobre un formulario.

---

*Escenario y cifras verificados contra la aplicación el 11 de agosto de 2026, y contra el ambiente desplegado (`app.vizo.mx`) el 13 de agosto. Los umbrales salen del catálogo con la UMA de 2026 ($117.31), contrastada contra la tabla oficial del SPPLD.*

**Lo verificado contra producción, para no repetirlo a mano:** los cinco periodos en pantalla · marzo sin operaciones · los tres pagos con sus veredictos · el texto íntegro del veredicto de acumulación · el expediente en 3 de 13 · y todo lo que `generarAviso` exige y que, si faltara, lo detendría a media demo: clave `DIN`, formato `din-sppld-2026-08`, y los tres catálogos del SAT resolviendo a un solo código cada uno.
