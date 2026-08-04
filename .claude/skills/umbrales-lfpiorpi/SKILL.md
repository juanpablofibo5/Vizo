---
name: umbrales-lfpiorpi
description: Reglas de cálculo de umbrales de identificación, aviso y restricción de efectivo bajo la LFPIORPI, incluyendo acumulación de 6 meses, tratamiento del IVA y vigencia de la UMA. Usar siempre que se toque el motor de umbrales, el catálogo regulatorio, la acumulación por cliente o cualquier cálculo que determine si una operación genera obligación.
---

# Umbrales LFPIORPI

Marco vigente: LFPIORPI reformada (DOF 16/07/2025, vigente 17/07/2025) · Reglamento reformado (DOF 27/03/2026, vigente 28/03/2026) · Reglas de Carácter General **pendientes de publicación** desde el 16/07/2026.

## Regla cero

Ningún valor de esta página se escribe en código. Todo vive en las tablas `uma_vigencias`, `umbrales` y `actividades_vulnerables`. Esta skill documenta **cómo se calcula**, no **cuánto vale**.

## Valores de referencia (para pruebas, no para producción)

| Año | UMA diaria | Vigencia de umbrales |
|---|---|---|
| 2025 | $113.14 | 1 feb 2025 – 31 ene 2026 |
| 2026 | $117.31 | desde 1 feb 2026 |

La UMA la publica el INEGI en enero, pero **los umbrales entran en vigor el 1 de febrero**. Una operación del 15 de enero de 2026 se evalúa con la UMA 2025.

Umbrales de las fracciones ancla, en UMA:

| Fracción | Actividad | Identificación | Aviso | Efectivo (Art. 32) |
|---|---|---|---|---|
| V | Comercialización de inmuebles | siempre | 8,025 | 8,025 |
| V Bis | Desarrollo inmobiliario | siempre | 8,025 | 8,025 |
| VIII | Vehículos terrestres, aéreos, marítimos | 3,210 | 6,420 | 3,210 |
| VI | Joyas, metales preciosos, relojes | 805 | 1,605 | 3,210 |
| IV | Préstamos o créditos | siempre | 1,605 | — |
| XV | Arrendamiento de inmuebles | 1,605 | 3,210 | 3,210 |

Convertir siempre: `umbral_pesos = umbral_uma × uma_vigente(fecha_operacion)`.

## Las tres bases de cálculo

Este es el error más frecuente del mercado y la fuente principal de avisos mal presentados.

| Qué se evalúa | Base | Fundamento |
|---|---|---|
| Umbral de identificación | monto **sin IVA** ni accesorios | Art. 17 + Art. 6 Reglamento |
| Umbral de aviso | monto **sin IVA** ni accesorios | Art. 17 + Art. 6 Reglamento |
| Restricción de efectivo | monto **con IVA** y accesorios | Art. 32 + Art. 6 Reglamento |
| Monto que se reporta en el aviso | **total recibido**, incluyendo contribuciones | Instructivo SPPLD |

Ejemplo oficial del SAT: arrendamiento de $1,000,000 + IVA $160,000, umbral de aviso 3,210 UMA ($376,565), límite de efectivo 8,025 UMA ($941,413).
→ Contra el umbral de aviso se usa $1,000,000 (rebasa).
→ Contra el límite de efectivo se usa $1,160,000 (rebasa).

## Acumulación

Regla confirmada por el SAT en el webinar oficial del 20 de junio de 2026:

1. **Ventana de 6 meses**, contada hacia atrás desde la operación que se está evaluando.
2. Solo se suman operaciones que **individualmente** se ubican en el supuesto de identificación.
3. Se acumula por **mismo cliente + misma actividad vulnerable**. Nunca se suman fracciones distintas: un obligado que realiza Fr. IV y Fr. VIII lleva acumulados independientes y presenta avisos separados.
4. Se acumula **a través de sucursales** del mismo obligado. Esto es lo que un Excel por sucursal no puede ver, y es la promesa central del producto.
5. El aviso se dispara **en el momento** en que la suma alcanza o rebasa el umbral, no al cierre del periodo. Si se rebasa en el mes 2, se presenta en el mes 2.

Implicación de implementación: la acumulación se evalúa en cada operación nueva contra una ventana deslizante. **No es un job mensual.**

## Identidad del cliente

La acumulación solo funciona si "mismo cliente" está bien resuelto.

- Persona física o moral mexicana: normalizar por RFC. CURP como refuerzo para físicas.
- Extranjero sin RFC: **estrategia pendiente de definir con el consultor PLD.** Hasta que se defina, marcar el expediente y escalar a revisión humana en vez de asumir que son clientes distintos.
- Nunca resolver identidad solo por nombre. Es el camino directo a un falso negativo.

## Beneficiario controlador

Umbral de participación: **25%** (bajó de 50% con la reforma de 2025). Aplica a personas morales, fideicomisos y otras figuras jurídicas. Para personas físicas se recaba declaración sobre su existencia.

## Salidas obligatorias del motor

Toda evaluación registra en `evaluaciones_umbral`:

- la UMA aplicada y su vigencia
- la versión del catálogo de umbrales usada
- el monto base y el monto total considerados
- el resultado de cada una de las cuatro evaluaciones
- si hubo acumulación, qué operaciones entraron en la ventana

Sin esto no hay forma de defender el cálculo en una verificación tres años después.

## Sanciones (contexto de por qué esto importa)

| Supuesto | Multa en UMA |
|---|---|
| Aviso extemporáneo ≤30 días, no identificar, expediente incompleto | 200 – 2,000 |
| Aviso extemporáneo >30 días | 2,000 – 10,000 |
| No presentar aviso, o actos prohibidos del Art. 32 | 10,000 – 65,000 |

Más responsabilidad penal en supuestos de manipulación dolosa de información.

Un umbral mal codificado no produce un bug: produce un aviso omitido.
