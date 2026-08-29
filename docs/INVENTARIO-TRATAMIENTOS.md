# Inventario de tratamientos de datos personales — Capa A

**29-ago-2026 · issue #33 (D4 del benchmark).** El mapa de qué datos personales viven
en VIZO, con qué papel los trata, para qué finalidad, con qué base y por cuánto
tiempo. Es el insumo del flujo ARCO diseñado en `LFPDPPP.md` §2–3, de la pregunta
B.3 del paquete al especialista, y del aviso de privacidad publicado en
`/privacidad`. **Borrador para revisión del abogado** — las preguntas abiertas de
`LFPDPPP.md` §3 (¿la identificación es dato sensible?, subencargados, supresión
inmediata vs. bloqueo trivial) no se dan aquí por resueltas.

**La distinción que ordena todo:** VIZO es **responsable** de los datos de quienes
usan el portal, y **encargado** de los datos que cada sujeto obligado trata dentro
de él (sus clientes). El aviso aplicable a los segundos es el del obligado.

| # | Tratamiento | Datos | Titular | Papel de VIZO | Finalidad | Conservación y fundamento |
|---|---|---|---|---|---|---|
| 1 | Cuentas del portal (`usuarios`, auth) | Nombre, correo, rol | Personal del obligado | **Responsable** | Operar la cuenta, aplicar permisos, evidencia de quién hizo qué | Mientras la cuenta exista; después bloqueo→supresión (Arts. 24/25 LFPDPPP) |
| 2 | Expediente de identificación (`clientes_finales`, `documentos`, `datos_expediente`) | Identificación oficial, RFC, CURP, domicilio, actividad, fecha de nacimiento | Clientes del obligado | **Encargado** | Cumplimiento LFPIORPI del obligado (Arts. 18 fr. I–III de la Ley; Cap. III de las Reglas) | **≥10 años** desde la operación (Art. 18 fr. IV LFPIORPI) → ante ARCO: bloqueo con fundamento, no supresión (Art. 25 fr. II LFPDPPP) |
| 3 | Beneficiario controlador y representantes (`beneficiarios_controladores`, `representantes`) | Identificación, participación | Terceros vinculados al cliente | **Encargado** | Art. 18 fr. III LFPIORPI; Cap. III Quinquies de las Reglas | Igual que 2 |
| 4 | Declaraciones PEP y su red (`declaraciones_pep`, vínculos) | Cargo, vínculo, parentesco (hasta 2.º grado), fechas | Cliente y personas de su red | **Encargado** | Cap. III Quáter de las Reglas | Igual que 2 · **Nota:** la red incluye datos de terceros que no son clientes — punto para el abogado |
| 5 | Operaciones y evaluaciones (`operaciones`, `evaluaciones_umbral`, `evaluaciones_riesgo`, perfiles, cuestionarios) | Montos, fechas, formas de pago, respuestas de origen/destino | Clientes del obligado | **Encargado** | Umbrales, acumulación, riesgo y avisos (Arts. 17–18 LFPIORPI; Caps. II Quáter–III Ter de las Reglas) | ≥10 años; el histórico de grado y perfil lo exige el Art. 41 fr. IV de las Reglas |
| 6 | Avisos generados y acuses (`avisos`, lotes, acuses) | Los del formato oficial del SAT | Clientes del obligado | **Encargado** | Presentación de avisos por el obligado | ≥10 años (Art. 18 fr. IV LFPIORPI) |
| 7 | Bitácora encadenada (`bitacora`) | **IDs opacos** + usuario que actuó | Personal del obligado | Responsable | Integridad y evidencia (regla dura 3: nunca nombres, RFC ni documentos en la bitácora) | La vida del sistema — es la evidencia misma |
| 8 | Registros técnicos y telemetría | **Ninguno personal** (regla dura 3) | — | — | — | — |

## Lo que este inventario obliga (y ya está en el diseño)

1. **Ninguna finalidad secundaria existe.** No hay publicidad, ni venta, ni perfiles
   comerciales — y por eso el aviso puede decirlo en una línea.
2. **Encargados de infraestructura:** Supabase (base y archivos, AWS us-east-1) y
   Vercel (aplicación). Obligación de confidencialidad por contrato; el régimen de
   subencargados es la pregunta 4 del abogado (`LFPDPPP.md` §3).
3. **El conflicto conservación↔supresión** (fila 2–6) está diseñado: bloqueo del
   Art. 24 con el fundamento del Art. 25 fr. II citado en la respuesta, y es la
   pregunta B.3 del paquete al especialista con la redacción de JP.
4. **La cláusula de consentimiento del formulario remoto** vive en
   `CLAUSULA-CONSENTIMIENTO.md` y entra al sprint junto con el mecanismo de Firma
   Electrónica (D-04 del Addendum).
