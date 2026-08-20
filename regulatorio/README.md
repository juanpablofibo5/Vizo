# Fuentes regulatorias oficiales

**Descargado el 4 de agosto de 2026** del portal SPPLD del SAT / UIF-SHCP.
Estos archivos son **de la autoridad, no del proyecto**: no se editan nunca. Si el SAT publica una versión nueva, se descarga al lado con su fecha y se registra aquí — no se sobrescribe. Saber contra qué versión se construyó es lo que permite defender un aviso años después.

## Inventario

Fracción **V Bis — Desarrollo Inmobiliario** (prefijo oficial `din`), desde `sppld.sat.gob.mx/pld/interiores/desarrollo_inmobiliario.html`:

| Archivo | Qué es | Origen |
|---|---|---|
| `xsd/din.xsd` | **La especificación real del aviso.** 158 elementos, 46 complexTypes, 40 tipos simples. Namespace `http://www.uif.shcp.gob.mx/recepcion/din` | `pld.hacienda.gob.mx/.../xsd/din.xsd` |
| `ejemplos/ejemplo_din.xml` | Ejemplo oficial del SAT — **tal cual se publicó, con su defecto** (ver abajo) | `.../ejemplosxml/ejemplo_din.xml` |
| `ejemplos/ejemplo_din.CORREGIDO.xml` | Derivado del anterior con el typo corregido. **Valida contra el XSD.** Este es el fixture usable | generado aquí |
| `instructivos/act_din.pdf` | Documento oficial de la actividad vulnerable | `.../actividades/act_din.pdf` |
| `instructivos/inst_excel.pdf`, `inst_excel2.pdf` | Instructivos de llenado de la plantilla | `.../documentos/` |
| `plantillas/desarrollosinmobiliarios.zip` | Plantilla oficial .xlsm de captura | `.../plantillas/` |
| `plantillas/informeenceros.zip` | Plantilla del informe en cero | `.../plantillas/` |
| `paginas/umbrales_sppld_2026-08-04.html` | Tabla oficial de umbrales, capturada con su fecha | `sppld.sat.gob.mx/pld/interiores/umbrales.html` |
| `paginas/criterios_sppld_2026-08-04.html` | Criterios generales orientativos | `.../criterios.html` |
| `paginas/desarrollo_inmobiliario_sppld_2026-08-04.html` | La página de la fracción | `.../desarrollo_inmobiliario.html` |

## Hallazgo 1 — el ejemplo oficial del SAT no valida contra su propio XSD

```
$ xmllint --noout --schema xsd/din.xsd ejemplos/ejemplo_din.xml
Element 'caractersiticas_desarrollo': This element is not expected.
Expected is ( caracteristicas_desarrollo ).
→ fails to validate
```

El **XSD** declara `caracteristicas_desarrollo`; el **ejemplo** trae `caractersiticas_desarrollo` (una `i` traspuesta). Corregido ese único carácter, el ejemplo valida limpio.

**Consecuencias para el proyecto:**

1. Confirma en la práctica la regla heredada: *nunca inferir la estructura del XML, leer el XSD.* Quien haya construido su generador copiando el ejemplo publica avisos que un validador estricto rechaza.
2. El fixture de `pnpm test:xsd` es `ejemplo_din.CORREGIDO.xml`, nunca el original. El original se conserva intacto como evidencia de la fuente.
3. **Abre POR CONFIRMAR-6** (ver `docs/DECISIONES.md`): ¿el portal SPPLD valida estrictamente contra el XSD al recibir el archivo? Si es estricto, el ejemplo publicado induce a error. Si es laxo, VIZO igual debe generar según el XSD — validar más duro que la autoridad nunca produce un aviso rechazado.

## Hallazgo 2 — la tabla oficial confirma el catálogo

La página de umbrales, capturada hoy, dice textualmente para la fracción **V Bis, Desarrollo Inmobiliario**: identificación **Siempre**, aviso **8,025 UMA = $941,412.75**, con **UMA de $117.31 a partir del 01 de febrero de 2026**.

Confirma tres cosas del diseño: el umbral de 8,025 UMA, la identificación siempre, y que **la vigencia arranca el 1 de febrero** (no el 1 de enero). Los valores del seed de `docs/PRUEBAS.md` coinciden con la fuente oficial.

## Hallazgo 3 — el IVA sigue sin resolverse aquí

Se buscó en las páginas de umbrales y de criterios cualquier mención a IVA, impuestos, accesorios o contribuciones: **no hay ninguna**. La contradicción de POR CONFIRMAR-4 (si el umbral del Art. 17 se evalúa sin o con impuestos) **no se resuelve con estas fuentes** — necesita el texto del Reglamento reformado y validación del especialista PLD.

## Lo que el XSD ya revela (análisis completo pendiente de la semana 1)

Jerarquía de primer nivel: `archivo → informe → sujeto_obligado + aviso → detalle_operaciones → datos_operacion → desarrollos_inmobiliarios → datos_desarrollo → caracteristicas_desarrollo + aportaciones`.

Dos tipos merecen atención temprana porque tocan decisiones ya tomadas:

- **`modificatorio_type`** — el aviso modificatorio existe en el formato oficial. `avisos.tipo` ya lo contempla en el esquema.
- **`alerta_type`** — el formato ya contempla alertas de operación inusual, que es el terreno del aviso de 24 h que las RCG activarán.

El desglose campo por campo va a `docs/campos-aviso.md` en la semana 1.

## Leyes (`regulatorio/leyes/`)

Textos oficiales de leyes federales, uno por archivo, con su SHA-256 para saber contra qué versión se contrastó cada afirmación del proyecto.

| Archivo | Qué es | Origen | SHA-256 |
|---|---|---|---|
| `leyes/LFPDPPP.pdf` | LFPDPPP — texto vigente, nueva Ley (DOF 20-mar-2025, abroga la de 2010), última reforma DOF 14-11-2025. 24 páginas. Descargado el 20 de agosto de 2026 | `diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf` | `04d67464e1efc0472040e2ff8012ced52c73ff4fc3573c8e2d3477fd976359c6` |
| `leyes/LFPDPPP.txt` | Texto plano del anterior (`pdftotext -layout`), para grep — no reemplaza al PDF como fuente | generado aquí | `14654ace642b1a27262a9e449324d62db9f22ef8eaf47127541cc4ed04a46b21` |

El contraste completo del módulo de datos personales contra este texto vive en `docs/LFPDPPP.md`.
