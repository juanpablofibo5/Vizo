# RCG históricas — materia prima para el texto consolidado de los Anexos

**Descargadas el 27 de agosto de 2026.** El Acuerdo 115/2026 publica los Anexos como
reforma parcial (solo desarrolla los numerales modificados), así que llenar
`campos_expediente` exige reconstruir el texto consolidado: 2013 + reforma
24-jul-2014 + reforma 30-nov-2020 + reforma 7-ago-2026. Estos archivos son la
materia prima de ese trabajo de gabinete.

| Archivo | Fuente | SHA-256 |
|---|---|---|
| `rcg-2013-original-sat.pdf` | SAT — minisitio Actividades Vulnerables, Normateca ([liga](https://www.sat.gob.mx/minisitio/ActividadesVulnerables/documentos/Normateca/Nacional/LFPIORPI/RCG.pdf)). Facsímil del DOF 23-ago-2013, Segunda Sección, **con las notas de la reforma 2014 incorporadas** | `89a3cc19…d800f5c3f` |
| `rcg-2013-original-sat.txt` | Extracción propia (`pdftotext -layout`) | `a06c14c9…da44cc12` |
| `rcg-compilado-reforma-2014-shcp.pdf` | SHCP/UIF — pld.hacienda.gob.mx ([liga](https://www.pld.hacienda.gob.mx/work/models/PLD/documentos/compilado_rcg_reforma2014.pdf)). Compilado oficial 2013+2014 | `fd2e7998…4ec836a194` |
| `rcg-compilado-reforma-2014-shcp.txt` | Extracción propia (`pdftotext -layout`) | `8c0014e9…75bf82f4` |

Los hashes completos se verifican con `shasum -a 256`.

## Provenance y límites

Son **copias oficiales de segunda mano** (SAT y SHCP), no el DOF mismo. Para el
trabajo de reconstrucción sirven; cualquier dato que termine sembrado en el
catálogo o citado ante un tercero se contrasta contra el DOF, como todo lo demás.

## Lo que ya se encontró aquí (27-ago-2026)

- **Anexo 3, inciso b), numeral iv)** (línea 990 del `.txt` del SAT): la constancia
  de solicitud de información sobre conocimiento del **Dueño Beneficiario**
  —término que el Art. 3 fr. VII original define como «al Beneficiario
  Controlador»— **firmada por el Cliente o Usuario**, existe desde 2013 con
  reforma del 24-jul-2014. Es el antecedente directo del Anexo 3 b) iv)
  reformado por el Acuerdo 115/2026 (migración `20260827160000`).
- El Anexo 4 (personas morales) de 2013/2014 también traía su propia constancia
  (numeral v), línea 1079) firmada por el representante.

## Lo que falta

- **El texto de la reforma DOF 30-nov-2020.** No se consiguió por fetch: el
  índice del DOF en línea no expone esa nota a extracción automatizada.
  Conseguirlo a mano en dof.gob.mx (Búsqueda Avanzada, 30/11/2020, SHCP) o vía
  el minisitio del SAT. Sin ese texto no se puede afirmar qué numerales de los
  Anexos estaban vigentes entre el 30-nov-2020 y el 30-nov-2026 — y de eso
  depende la fila del periodo actual de la constancia (ver la migración).
