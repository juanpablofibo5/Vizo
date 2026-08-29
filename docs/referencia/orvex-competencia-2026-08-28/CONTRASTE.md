# Contraste de BMK-01 y COMP-01 contra el repo y las fuentes — 28-ago-2026

Los dos PDF de esta carpeta son inteligencia competitiva de la revisión externa
(ORVEX), emitidos el 28-ago-2026 sobre fuentes secundarias. Este documento registra
qué se verificó el mismo día contra el texto primario del repo y contra los sitios
vivos, qué decisiones quedan cerradas, y qué celdas de sus matrices describen a VIZO
con información atrasada.

---

## 1. D1 — CERRADA. La numeración del Art. 17, verificada contra el texto primario

El BMK-01 marcaba como «acción obligatoria antes de usar el hallazgo» verificar la
numeración de fracciones contra el DOF, y la asignaba a Grecia. **No hacía falta: el
texto vigente vive en el repo** (`regulatorio/leyes/LFPIORPI.txt`, reforma
16-jul-2025, Art. 17 desde la línea 551). Contra ese texto, y contra el sitio de
Notalia consultado en vivo el 28-ago-2026:

| Actividad | Ley vigente (Art. 17) | Notalia publica | Veredicto |
|---|---|---|---|
| Notarías / fe pública | **Fr. XII** (Apartado A: notarios) | Fr. X | ❌ error |
| Vehículos (3,210 UMA) | **Fr. VIII** | Fr. VII | ❌ error |
| Traslado/custodia de valores | **Fr. X** | — (se la asigna a notarías) | ❌ error |
| Blindaje | **Fr. IX** | «Fr. VIII y IX» | ❌ a medias |
| Brokers | — (donativos es **Fr. XIII**) | «Fr. IV y XIII» | ❌ XIII no es brokers |
| Arrendamiento inmobiliario | **Fr. XV** (la que VIZO tiene sembrada) | «Fr. XV: mediadores, nueva 2025» | ❌ error |
| Joyerías VI · Inmuebles V/V Bis · Aduanales XIV · Activos virtuales XVI | ✅ | igual | ✅ |

**El hallazgo del BMK-01 queda confirmado y es peor de lo que registró**: al menos
cuatro fracciones mal mapeadas en el sitio público de un proveedor de cumplimiento.
Para usarlo ante un tercero falta solo la captura fechada de las páginas de Notalia
(pantallazo con fecha), porque el sitio puede corregirse en cualquier momento.

También verificado en vivo (28-ago-2026): los precios ($0/$19/$39/$59 USD), la
ausencia total del Acuerdo 115/2026 en su contenido, y los enlaces de Privacidad y
Términos apuntando a `#`.

## 2. La ventana de Artu, verificada abierta hoy

`artu.ai` consultado el 28-ago-2026: **cero menciones del Acuerdo 115/2026, de las
RCG de agosto y de las fechas 30-nov-2026 / 1-mar-2027 / 1-jun-2027.** La ventaja
perecedera del §04.2 de COMP-01 sigue abierta a la fecha.

Dato que actualiza el perfil: sus casos publicados ya no son solo las cuatro
fintechs — el sitio lista también Nu Bank, BDU y **Red Ambiental** (no financiera).
La tesis del «ADN fintech» sigue en pie por el peso del portafolio, pero la
afirmación «no publican un solo caso no financiero» ya no es exacta y no debe usarse.

## 3. Celdas de las matrices que describen a VIZO con datos atrasados

La regla del propio COMP-01 —«un benchmark que sólo registra fortalezas no es
utilizable»— corre igual en sentido contrario: estas celdas subestiman el estado
real y llevarían a decidir mal.

| Afirmación de los documentos | Estado real (verificable en el repo) |
|---|---|
| «Todo el marco 115/2026 descansa en fuentes secundarias. Sin texto primario el argumento no puede salir a cliente. Depende de Grecia» (BMK-01 §07.2, A-01) | **Falso desde el 16-ago.** El texto primario está en `regulatorio/dof/` con SHA-256 (edición vespertina, CVE citado), contrastado transitorio por transitorio en `ROADMAP-2027.md` y capítulo por capítulo en `RIESGO-EBR.md`. Las RCG históricas (2013/2014/2020) están en `rcg-historico/` desde el 27–28-ago. **La condición 2 del posicionamiento ya está cumplida**; de A-01 solo falta la mitad de «convertirlo en material comercial» |
| «Acumulación de umbrales: por definir» (BMK-01, matriz) | Construida y probada desde la semana 4: ventana de 6 meses por cliente+actividad, cross-sucursal, con la suite en verde. La única duda fina (qué se reporta tras el primer aviso) es la pregunta A.1 del paquete al especialista |
| «Monitoreo transaccional: fuera de v1.0 / no cubierto» (ambos) | **Parcial, no ausente**: el perfil transaccional y las alertas de desviación están construidos (ADR-22) y evalúan al registrar cada operación. Lo pendiente del Cap. XIII es la alerta de listas/PEP (Art. 41 fr. V) y el proceso programado de reevaluación — con fecha 1-jun-2027 ya en el roadmap (lo que pide A-05) |
| «MER versionado: por construir» (implícito en ambos) | La mitad estructural existe: `modelos_riesgo` versionado con borrador→vigente, aprobación con quién/cuándo, congelamiento por trigger y cobertura del Art. 10 Septies 1 en pantalla (ADR-27). **Lo que falta es el MER como documento exportable** — eso sí es la pieza de A-06 |
| «Validación legal externa: Escalante Palma» (BMK-01, matriz, como si existiera) | Candidato, no contratado (issue #32). En material comparativo debe decir «pendiente» |

## 4. A-04 (asignada a JP Jr.) — respondida el mismo día

| Punto de Artu | Estado en VIZO |
|---|---|
| Acumulación semestral por persona y tipo | ✅ Construida y probada (ver arriba) |
| Beneficiario controlador ≥25% | ✅ `beneficiarios_controladores` existe con el umbral y la declaración; **falta el árbol de prelación** del Art. 23 Quinquies (la pieza «mejor valor/esfuerzo» del roadmap) y la constancia de conocimiento ya está en el catálogo (migraciones del 27–28-ago) |
| Screening 69-B SAT | **Esquema completo, conector no escrito**: `consultas_screening` con listas mínimas definidas (OFAC · ONU · LPB · 69-B · PEP), alertas cableadas y resolución humana como frontera (regla dura 5). `DEMO.md` prohíbe venderlo hasta que el conector exista. Es el «diferenciador barato de igualar» que COMP-01 señala — la decisión de activarlo es de alcance, no de arquitectura |

## 5. Dónde quedó absorbido lo demás

- **D4 (Capa A LFPDPPP al sprint)** → issue #33, con el alcance de `docs/LFPDPPP.md`.
- **A-06 (MER de muestra como pieza de demo)** → comentario en el issue #30; sale
  natural del esquema que la sesión con Luis cierre.
- **D5 (desbloquear ARQ-01)** → ya en curso: issues #30/#31 y la sesión.
- D2, D3, D6–D10, A-01 (mitad comercial), A-02, A-03, A-07, A-08 son carril
  comercial/gobernanza de JP — no consumen horas de desarrollo y no se les da
  seguimiento desde el repo.
