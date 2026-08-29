# Qué es esto

Tres cosas en un solo documento, para cerrar el ciclo de idas y vueltas:

1. **La captura fechada que tu ERR-01 marcó "sin dueño"** — hecha el mismo día, con evidencia sellada.
2. **El estado real de VIZO en lenguaje llano** — tu regla del §06 ya opera: existe `ESTADO-VIZO.md` en el repo con 30 dimensiones y su evidencia; aquí va el resumen para humanos.
3. **Quince preguntas, una sola vez.** Contéstalas (por número, en WhatsApp o como quieras) y a partir de ahí cada quien corre su carril sin volver a preguntar: JP Jr. el sprint, tú lo comercial y el especialista.

---

# 1 · La captura fechada — hecha

Tu errata decía: *"media hora de trabajo, valor total si se hace hoy, cero si se hace tarde. Nadie la tiene asignada."* Quedó hecha el mismo 28 de agosto, 19:43 hora de Mérida.

**Qué se capturó y qué prueba:**

| Evidencia | Qué prueba |
|---|---|
| El HTML tal como lo sirve notalia.app | El mapeo de fracciones está **textual** en su sitio: "Fr. X · Notarías", "Fr. VII · Compraventa de vehículos", "Fr. XV · Mediadores"… |
| El sitio completo impreso a PDF (14 páginas) | El propio navegador estampó **fecha, hora y URL en cada página** — evidencia que se fecha sola. Incluye sus precios ($0/$19/$39/$59 USD) y su narrativa sin rastro del Acuerdo 115/2026 |
| El HTML de artu.ai del mismo día | **Cero menciones del 115/2026** — tu "ventana de 12 meses" capturada en el artefacto, no en una opinión |
| Huellas SHA-256 de todo + método documentado | Nadie puede alegar que se fabricó o se editó después |

**El marcador nuevo que salió de la captura:** la **Fr. XII — la fracción real de las notarías — no aparece en ninguna parte del sitio de Notalia**. Su vertical insignia no tiene su propia fracción. Con esto son cinco errores de mapeo verificados contra la Ley vigente, no cuatro.

**Cómo se usa:** citable "al 28-ago-2026"; antes de usarla frente a un cliente se re-verifica el sitio (pueden corregirlo cualquier día) — pero aunque lo corrijan, la captura prueba lo que publicaban hoy. Los archivos viven en el repo; si quieres el paquete (HTML + PDF + capturas + huellas) te va en un zip.

---

# 2 · El estado de VIZO, en cristiano

La foto completa, con su evidencia técnica renglón por renglón, vive en `ESTADO-VIZO.md` — la "columna VIZO canónica" de tu regla. Resumen:

**Listo, probado y con evidencia (17 frentes).** Los textos legales completos con huella (el Acuerdo 115, la Ley, el Reglamento, las RCG históricas 2013–2020); el motor de umbrales con las tres bases de cálculo correctas; la acumulación de seis meses entre sucursales; el expediente con huella digital por documento; la bitácora encadenada que detecta alteraciones y reconstruye cualquier fecha pasada; el aviso XML validado contra el esquema oficial del SAT; PEP con sus dos relojes de vigencia; el perfil transaccional con alertas; la aprobación de directivo; los cuestionarios de riesgo alto; las medidas reforzadas; la metodología versionada con mitigantes e indicadores de delitos; y la seguridad multi-empresa verificada automáticamente en cada cambio.

**A medias (4).** Beneficiario controlador (la tabla y la constancia existen; falta el árbol de decisión que la norma pide); el Manual (podemos acreditar 7 de los 14 apartados con datos; los otros 7 se muestran como hueco, por diseño); el screening de listas (el esquema completo existe — OFAC, ONU, LPB, 69-B, PEP — pero el conector que consulta no está escrito, y no se vende hasta que exista); y el multi-obligado "capturar una vez, cumplir tres" (el esquema lo permite; el flujo es de la siguiente fase).

**Falta (7).** La **evaluación de entidad** (tu hallazgo — el grado del propio obligado que decide si le basta auditoría interna o paga auditor externo certificado; se destraba en la sesión con Luis); el **MER como documento exportable** (la mitad estructural ya existe); las alertas del Cap. XIII (exigibles 1-jun-2027, ya fechadas); la Capa A de datos personales (ya en el sprint); la certificación ISO 27001 (ruta por definir); la **opinión legal firmada** (sin contrato aún); y la postura sobre biometría (por decidir).

**Bloqueado, y está bien (2).** El aviso de 24 horas (el regulador no ha publicado la Resolución de formatos de la que depende) y la Capa B de datos personales (diferida a propósito).

---

# 3 · Las quince preguntas — contesta una vez y arrancamos en paralelo

Responde por número. Cada una dice qué destraba. Donde hay recomendación, va marcada.

## Bloque A — Lo que destraba el sprint (esta semana)

**Q1 · Sesión con Luis: ¿qué día y hora?**
Es la única compuerta del sprint: cierra el esquema de la evaluación de entidad → de ahí sale el MER exportable → tu "condición 1" del posicionamiento. Todo el material ya está listo (nota de arquitectura, issues, acta de retiro para firmas).
R: ______________________________

**Q2 · La constancia de BC del periodo actual: ¿quién bendice la doble revisión?**
La fila está redactada, probada y en el repo — falta el visto bueno de un solo punto interpretativo (que las reglas viejas aplican a la fracción nueva en el interinato) para aplicarla a producción. ¿La bendices tú, Luis, o va con el especialista?
R: ______________________________

**Q3 · Conector de screening (OFAC · ONU · LPB · 69-B · PEP): ¿entra al sprint o después del piloto?**
Tu errata lo marca "decisión JP, ejecución JP Jr.". Es el diferenciador "barato de igualar y muy visible en demo". El esquema ya existe; es escribir el conector.
R: ______________________________

**Q4 · Biometría: ¿descartar con argumento o integrar proveedor?**
Recomendación: **descartar con argumento documentado** — la norma no la exige, es el terreno de datos sensibles de la LFPDPPP (con pregunta abierta al abogado), y el checklist del comprador real (tu sesión de NEXUM) ni la menciona. Si la quieres, es integración de proveedor con costo y contrato de encargado.
R: ______________________________

## Bloque B — El especialista (destraba el paquete de 7 y el foso)

**Q5 · Escalante Palma: ¿en qué está la conversación y con qué alcance?**
Tres cosas dependen de ese contrato y conviene cotizarlas juntas: (a) la consulta de las siete preguntas, (b) la **opinión legal firmada** — tu "condición 3", lo único que ningún competidor puede copiar rápido —, y (c) la **configuración de referencia sectorial firmada** (la salida que tú mismo diseñaste para no vender hoja en blanca). ¿Fecha estimada y alcance?
R: ______________________________

**Q6 · El paquete de siete preguntas: ¿quién lo manda y a quién?**
Está terminado, con las citas corregidas y la pregunta nueva de supresión/ARCO con tu redacción. Al llegar respuestas, JP Jr. corrige catálogo directo — sin volver a preguntarte nada.
R: ______________________________

## Bloque C — PIL-01: los datos duros de la semana 0

**Q7 · ¿El piloto es Grupo Dicas? ¿Cuáles dos sucursales y quién es el contacto operativo?**
R: ______________________________

**Q8 · ¿Qué gastaron en dictamen/auditoría el último ejercicio?**
Tu propia condición: es el ancla de precio. Si no hay número exacto, un rango sirve.
R: ______________________________

**Q9 · ¿Cuándo renueva su contrato con Regcheq?**
Tu D7: define si el piloto es coexistencia o desplazamiento — "son conversaciones distintas".
R: ______________________________

**Q10 · Volumen mensual aproximado por sucursal: ¿cuántas ventas y cuántos clientes nuevos?**
Dimensiona la carga, la demo con datos realistas y el precio.
R: ______________________________

**Q11 · Razón(es) social(es) y RFC(s) que entrarían como obligados, y qué otras actividades vulnerables realizan además de vehículos** (¿arrendamiento?, ¿préstamos/autofinanciamiento?).
Con esto JP Jr. prepara el alta y el escenario de demo real sin pedir nada más.
R: ______________________________

**Q12 · Fecha objetivo de arranque del piloto: ¿queremos PIL-01 operando antes del 30 de noviembre?**
Define el orden del sprint de septiembre-octubre.
R: ______________________________

## Bloque D — Tu carril comercial (para no pisarnos)

**Q13 · Precio de PIL-01: ¿cuál es el fee de implementación y la suscripción por RFC objetivo?**
Y la regularización retroactiva (tu A-03): ¿la modelas tú, o JP Jr. te arma la propuesta con los datos del repo y tú le pones el precio?
R: ______________________________

**Q14 · ¿Qué material necesitas y en qué orden?**
Del repo pueden salir ya, citables: (a) el comparativo con la captura fechada de Notalia/Artu, (b) el one-pager del calendario 30-nov → 1-mar → 1-jun con artículo por fecha, (c) el crosswalk del checklist del comprador de NEXUM contra lo construido, (d) el material comercial del 115 (la mitad restante de tu A-01). Dime cuáles y para cuándo.
R: ______________________________

**Q15 · Preséntanos a Grecia.**
JP Jr. no la ubica. La extracción del DOF ya no hace falta (todo el texto primario está en el repo) — lo que queda en su cancha serían las capturas trimestrales de Artu (tu A-08) y las capturas fechadas futuras. ¿Quién es y le pasamos el método?
R: ______________________________

---

**Con estas quince respuestas:** JP Jr. corre el sprint completo (entidad → MER → Capa A → piloto) sin volver a preguntarte; tú corres precio, canal y especialista con el material que pidas; y la foto compartida del avance es siempre `ESTADO-VIZO.md` — actualizada en cada cierre, para que nadie vuelva a poblar una matriz desde memoria.

*Orvex / Vizo · 28 de agosto de 2026 · Preparado por JP Jr. — las afirmaciones sobre el estado del sistema son reproducibles contra los artefactos del repositorio; las capturas de sitios de terceros son del 28-ago-2026 y perecederas.*
