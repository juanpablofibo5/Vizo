# ESTADO-VIZO — la columna VIZO canónica

**Regla operativa (ERR-01 §06, 28-ago-2026):** todo documento comparativo —matriz,
benchmark, pitch— puebla su columna VIZO **desde este archivo**, nunca desde
conversación. Una matriz sin esa trazabilidad no se emite. El error que esta regla
evita ya costó dos documentos (BMK-01 y COMP-01 subestimaron a VIZO en nueve celdas;
la fe de erratas está en `referencia/orvex-competencia-2026-08-28/`).

**Mantenimiento:** una fila por dimensión comparativa, cada una con el ADR, la
migración, la suite o el documento que la respalda. Se actualiza al cerrar cada
pieza. **Fecha de corte: 29-ago-2026.**

| # | Dimensión | Estado | Evidencia |
|---|---|---|---|
| 1 | Texto primario del Acuerdo 115/2026 | ✅ Íntegro con SHA-256 y CVE; contrastado transitorio por transitorio y capítulo por capítulo | `regulatorio/dof/` · `ROADMAP-2027.md` · `RIESGO-EBR.md` |
| 2 | RCG históricas 2013 / 2014 / 2020 | ✅ En repo con huella (facsímiles SAT/SHCP) | `regulatorio/dof/rcg-historico/` |
| 3 | Motor de umbrales (identificación · aviso · efectivo, bases con/sin contribuciones) | ✅ Construido y probado; base del umbral contrastada contra el Art. 6 del Reglamento | `tests/umbrales/` · ADR-08 · DECISIONES §4 |
| 4 | Acumulación semestral por cliente + actividad, cross-sucursal | ✅ Construida y probada (semana 4). Única duda fina: efecto del primer aviso sobre la ventana → pregunta A.1 del especialista | suite · `CONSULTA-PLD.md` A.1 |
| 5 | Expediente KYC con completitud por catálogo y huella SHA-256 por documento | ✅ Construido (semana 6); reverificación anual y vigencia de comprobante incluidas | migraciones 08–15-ago |
| 6 | Constancia de conocimiento del BC (persona física) | ✅ Sembrada en dos vigencias (actual + 30-nov-2026); la fila actual espera doble revisión del runbook 02 antes de producción | migraciones `20260827160000` / `20260828100000` |
| 7 | Beneficiario controlador ≥25% | ◐ Tabla, umbral y declaración existen; **falta el árbol de prelación** del Art. 23 Quinquies | `ROADMAP-2027.md` §Cap. III Quinquies |
| 8 | Bitácora encadenada · verificador · reconstrucción histórica | ✅ Construidos (semana 8), con demo de alteración detectada | smoke test · `/evidencia` |
| 9 | Manifiesto por versión de expediente | ✅ Construido; **sellado NOM-151 pendiente** (pregunta B.1 al especialista; tabla diseñada y vacía) | semana 8 · `CONSULTA-PLD.md` B.1 |
| 10 | Pipeline del aviso: XML validado contra XSD oficial (bloqueante en CI), fragmentación 2 MB, informe en cero, modificatorio, acuse | ✅ Construido (semanas 9–10 + F1) | `pnpm test:xsd` · `ALCANCE.md` |
| 11 | Aviso 24 horas | ⛔ Bloqueado por diseño: espera la Resolución de formatos (Transitorio Quinto, sin fecha) | `ROADMAP-2027.md` |
| 12 | PEP: declaración con red hasta 2.º grado, dos relojes de vigencia | ✅ Construido (issue #19); consulta oficial = Consulta PEP 2.0 del obligado (frontera) | migración 17-ago · ROADMAP |
| 13 | Perfil transaccional + alertas de desviación | ✅ Construido; evalúa al registrar cada operación; append-only (≥10 años cubiertos) | ADR-22 |
| 14 | Aprobación de directivo (PEP + riesgo alto) | ✅ Construida, **no bloqueante** con fundamento textual; hacerla configurable por tenant es la conciliación D-05 pendiente de la sesión | ADR-23 · issue #31 |
| 15 | Cuestionarios de riesgo alto + Firma Electrónica (huella, sin validar) | ✅ Construidos | ADR-25 |
| 16 | Medidas reforzadas del Art. 23 Ter 4 (Cap. III Ter completo) | ✅ Construidas; hueco del fideicomiso documentado en pantalla | ADR-26 |
| 17 | Cap. II Quáter: modelo versionado (borrador→vigente, aprobación trazada, congelamiento), pesos por elemento, mitigantes con efecto y cobertura, indicadores 139 Quáter/400 Bis por elemento | ✅ Construido; la configuración nace vacía y la declara el obligado (frontera ADR-21) | ADR-21/27 · migraciones 21–24-ago |
| 18 | **Evaluación de entidad** (riesgo del obligado → tipo de auditoría, Arts. 44/45) | ◐ **Esquema, motor y persistencia construidos (29-ago, ADR-28):** escala de efectividad ordinal con evidencia exigible por nivel, residual por elemento con tope estructural, histórico append-only con la consecuencia de los Arts. 44/45 ya resuelta (`externa_obligatoria`/`interna_permitida`). Falta la pantalla; la sesión con Luis valida contra lo construido | ADR-28 · migración `20260829150000` · `tests/persistencia/entidad.test.ts` |
| 19 | **MER como documento exportable** | ❌ Pendiente — la pieza real de A-06; la mitad estructural (fila 17) ya existe | issue #30 |
| 20 | Manual de Políticas Internas | ◐ Frontera decidida (ADR-20): VIZO acredita 7 apartados con datos y muestra el hueco en los otros 7; Constancia de mecanismos construida | ADR-20 · `constancias` |
| 21 | Screening de listas (OFAC · ONU · LPB · 69-B · PEP) | ◐ **Esquema completo, conector no escrito**; resolución humana como frontera; venta prohibida hasta que exista | `POST-MVP.md` · `DEMO.md` |
| 22 | Cap. XIII restante: alerta de listas/PEP (Art. 41 fr. V) y reevaluación programada | ❌ Pendiente, con fecha exigible 1-jun-2027 en el roadmap | `ROADMAP-2027.md` |
| 23 | Multi-obligado («capturar una vez, cumplir tres») | ◐ Puerta abierta en el esquema (`personas`, `consentimientos_comparticion`, ADR-15); el flujo es F2+ | issue #13 |
| 24 | LFPDPPP Capa A (aviso de privacidad, inventario de tratamientos, cláusula de consentimiento) | ❌ Al sprint actual por decisión D4 | issue #33 · `LFPDPPP.md` |
| 25 | LFPDPPP Capa B (módulo vendible) | ⛔ Diferida (~abr-2027); el pitch no la menciona | issue #23 |
| 26 | Certificación ISO 27001 | ❌ No iniciada — ruta por definir (D10, carril JP, Q1-2027) | BMK-01 D10 |
| 27 | Validación legal externa | ❌ **Pendiente** — Escalante Palma es candidato, no contratado. En toda matriz dice «pendiente» | issue #32 · ERR-01 E-1 |
| 28 | Biometría / prueba de vida | ❌ No integrada; postura por decidir con argumento documentado (A-07) | COMP-01 A-07 |
| 29 | Seguridad de base: RLS por tenant, rol sin BYPASSRLS, privilegios declarados uno a uno, verificados en cada CI | ✅ Construido y vigilado (la aserción 1f-bis detectó el hueco del 23–24-ago y se corrigió) | ADR-16/17/18 · smoke test |
| 30 | Aislamiento de la evidencia: append-only con triggers, timestamps del servidor, montos en centavos, cero regulatorio en código | ✅ Reglas duras 1–6 del proyecto, verificadas por suite y CI | `CLAUDE.md` |
