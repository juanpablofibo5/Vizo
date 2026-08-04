# VIZO — el proyecto en una página

## ¿Qué es?

**VIZO es un sistema que ayuda a una empresa inmobiliaria a cumplir la ley anti-lavado de dinero mexicana (LFPIORPI) sin equivocarse.**

La ley dice: si vendes inmuebles en preventa (Fracción V Bis), estás obligado a **identificar a cada comprador**, armarle un **expediente con documentos**, y **avisarle al SAT** cuando sus pagos rebasan cierto monto. Hacerlo mal o tarde = multas de cientos de miles a millones de pesos. Hoy la gente lo lleva en Excel, y el Excel se equivoca justo en las partes difíciles.

## La tesis del producto: una venta, tres obligados

Aquí está lo que ningún competidor modela. **Una sola venta inmobiliaria genera obligaciones para hasta tres empresas distintas al mismo tiempo:**

| Quién | Bajo qué fracción | Qué le toca |
|---|---|---|
| **Desarrollador** | V / V Bis | Su propio expediente y su propio aviso |
| **Inmobiliaria** que comercializa | V | Su propio expediente y su propio aviso |
| **Asesor** (si está registrado por su cuenta) | V / XI | Su propio expediente y su propio aviso |

Hoy los tres le piden **al mismo comprador la misma identificación, el mismo comprobante de domicilio y la misma declaración de beneficiario controlador**. Tres veces, en tres formatos. Y con frecuencia dos de los tres no presentan el aviso, porque ni saben que les tocaba.

**La solución de VIZO: capturar una vez, cumplir tres veces.** El comprador sube sus documentos una sola vez; cada obligado recibe **su propio borrador de aviso**, en el formato de su fracción, y lo presenta con **su propia e.firma**.

> La ley no tiene una figura de "cumplimiento consolidado": nadie puede cumplir por otro, y la multa recae siempre sobre quien omitió. Por eso VIZO elimina la **captura** triplicada, nunca la **obligación** individual. Cualquier producto que prometa lo contrario está vendiendo un riesgo legal.

Detalle completo en `docs/referencia/VIZO-flujo-multiparte.pdf`.

## Este repo: el prototipo de 12 semanas

Lo de arriba es el producto. **Lo que se construye ahora es más chico a propósito**: un solo obligado (el desarrollador, Fr. V Bis), captura interna, sin screening ni sellado. 12 semanas para hacer el ciclo completo una vez, de punta a punta, y aprender construyéndolo.

El esquema de la base de datos **ya deja lugar** para el multi-parte (tablas `personas` y `consentimientos_comparticion`, vacías), para que agregarlo después no sea una cirugía.

## ¿Qué hace? (el ciclo completo, 6 pasos)

```
1. ALTA         Registrar al cliente (persona o empresa, con su
                "beneficiario controlador" si es empresa)
2. EXPEDIENTE   Subir sus documentos; cada archivo recibe una
                huella digital (hash) y el sistema dice qué falta
3. OPERACIONES  Registrar cada pago; nada se borra ni se edita
4. MOTOR        Cada pago se evalúa en automático: ¿hay que avisar
                al SAT? (por el pago solo, o por la suma de 6 meses)
5. AVISO        Se genera el XML oficial validado contra el formato
                del SAT; un admin lo aprueba y lo presenta
6. BITÁCORA     Historial encadenado e inalterable, que se puede
                reconstruir fecha por fecha
```

## Las 5 ideas que sostienen todo

1. **La ley vive en la base de datos, no en el código.** Umbrales, valor de la UMA, campos del expediente, formatos: todo son filas con fecha de vigencia. Cuando la ley cambie (y va a cambiar: hay reglas nuevas por publicarse), se insertan filas — no se reprograma nada.
2. **El motor es una calculadora, no una IA.** Misma entrada → siempre la misma salida, y cada evaluación guarda con qué valores se calculó, para poder defenderla años después.
3. **La bitácora es inalterable.** Cada evento lleva el hash del anterior (como una cadena): si alguien tocara el historial, se nota exactamente dónde.
4. **La acumulación es la joya.** Cliente que paga $400 mil tres veces en tres meses = $1.2 millones acumulados → aviso obligatorio, aunque cada pago solo parezca inocente. El sistema suma incluso entre sucursales distintas. Esto es lo que un Excel no ve.
5. **El motor no sabe qué es "inmobiliario".** Recibe una operación + una configuración. Agregar otra actividad (ej. arrendamiento) son filas nuevas en el catálogo, cero código. Lo probamos en la semana 11.

## Las trampas de la ley que el sistema resuelve

| Trampa | Regla correcta |
|---|---|
| ¿Con IVA o sin IVA? | El límite de efectivo se evalúa **con** IVA y el aviso reporta el **total**. Para el umbral de aviso la postura provisional es **sin** IVA, pero hay fuentes propias en conflicto: **pendiente de confirmar** (ver `docs/DECISIONES.md`). Como la base es un dato del catálogo, cambiarla es una fila nueva, no reprogramar. |
| ¿Cuándo cambian los umbrales? | El **1 de febrero**, no el 1 de enero. Una operación de enero usa la UMA del año pasado. |
| ¿A quién identifico? | En V Bis: a **todos**, sin importar el monto. |
| ¿Y si no hubo nada que reportar? | Igual se presenta el **informe en cero**. Omitirlo también multa. |

## El plan (10 ago → 1 nov 2026, ~15 h/semana)

- **Semanas 1–4 · El motor.** Primero las pruebas (ya escritas en `docs/PRUEBAS.md`), luego el motor hasta que todas pasen. Checkpoint en la semana 4: si voy atrasado, **se recorta alcance, nunca se extiende el plazo**.
- **Semanas 5–8 · La operación.** Clientes, expedientes con documentos, registro de operaciones conectado al motor, bitácora demostrable.
- **Semanas 9–12 · El aviso.** XML validado contra el formato oficial del SAT, flujo de aprobación con roles, y demo completa frente a Luis.

Cada semana termina con algo que un tercero puede **verificar en 10 minutos** — nunca "avancé en X".

## Qué NO hace (a propósito)

El flujo multi-parte completo, el magic link al comprador, screening contra listas negras, calificación de riesgo, sellado NOM-151, WhatsApp, varios clientes reales. Todo eso quedó **fuera del build pero dentro del esquema**: las tablas ya existen vacías, para que agregarlo después no sea una cirugía. Ver `docs/POST-MVP.md`.

**El orden natural después del MVP:** magic link (para que la captura llegue al comprador) → multi-parte (para que esa captura sirva a los tres obligados) → screening y sellado.

## Stack y mapa de documentos

**Next.js + TypeScript + Supabase (Postgres/Auth/Storage) + Vercel.** Infraestructura propia de VIZO, separada de todo lo demás.

| Documento | Qué contiene |
|---|---|
| `docs/PLAN.md` | Las 12 semanas, hora por hora, con riesgos y regla de recorte |
| `docs/ARQUITECTURA.md` | Todas las tablas, el motor, el pipeline del aviso, la bitácora |
| `docs/PRUEBAS.md` | El criterio de aceptación real: casos con entrada y salida exactas |
| `docs/DECISIONES.md` | Por qué se decidió cada cosa (y qué falta confirmar con un especialista PLD) |
| `docs/POST-MVP.md` | Las puertas que quedaron abiertas |
| `docs/00–04_*.md` | El paquete de investigación original (mercado, plan maestro, proveedores) |
| `docs/referencia/` | El documento de diseño del flujo multi-parte |

## Mini-glosario

**LFPIORPI** · la ley anti-lavado ("Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita") · **Fr. V Bis** · la fracción de la ley que aplica al desarrollo inmobiliario · **UMA** · unidad de medida en pesos que usa la ley para fijar umbrales ($117.31 en 2026) · **SPPLD** · el portal del SAT donde se presentan los avisos · **XSD** · el archivo oficial que define el formato exacto del XML del aviso · **RCG** · Reglas de Carácter General; el reglamento fino que está por publicarse y cambiará formatos · **REC** · la persona de la empresa legalmente responsable de presentar los avisos · **RLS** · Row Level Security; el mecanismo de Postgres que aísla los datos de cada cliente.
