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
| `rcg-reforma-2020-shcp.pdf` | SHCP/UIF — pld.hacienda.gob.mx ([liga](https://www.pld.hacienda.gob.mx/work/models/PLD/documentos/reforma_rcg_dof30nov20.pdf)). Facsímil del **Acuerdo 126/2020**, DOF 30-nov-2020 ([nota 5606232](https://www.dof.gob.mx/nota_detalle.php?codigo=5606232&fecha=30/11/2020)) | `e8b1c46e…6705282f` |
| `rcg-reforma-2020-shcp.txt` | Extracción propia (`pdftotext -layout`) | `cc1bf2b5…3a0305a2` |

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

- ~~El texto de la reforma DOF 30-nov-2020.~~ **Conseguido el 28-ago-2026**
  (facsímil oficial de la SHCP; la nota del DOF es la 5606232). Es el
  **Acuerdo 126/2020** y su alcance es angosto: reforma los Arts. 4 y 5 y la
  denominación del Cap. II, y adiciona el Cap. II Bis (proveedores de activos
  virtuales) y el Art. 34 Bis (certificación UIF). **No toca los Anexos ni el
  Art. 12** (línea 94 del `.txt`). Con eso la cadena del Anexo 3 b) iv) queda
  completa —2013 → 2014 → intacta en 2020 → reescrita en 2026— y la fila del
  periodo actual de la constancia entró en la migración `20260828100000`,
  pendiente de la doble revisión del runbook 02 antes de aplicarse a
  producción.
- ~~La consolidación completa de los Anexos 3, 4, 4 Bis, 5, 6, 6 Bis y 8
  (2013+2014+2026).~~ **Hecha a medias el 30-ago-2026: los Anexos 3 y 4**
  (persona física nacional o residente, y persona moral mexicana) quedaron
  transcritos completos y sembrados en `campos_expediente` para la Fr. VIII
  (migración `20260830140000`). **Faltan 4 Bis, 5, 6, 6 Bis, 7, 7 Bis y 8** —
  issue #31 sigue abierto, y hoy son inexpresables de todos modos porque
  `campos_expediente.aplica_a` solo distingue persona física de moral
  (`docs/DECISIONES.md`, POR CONFIRMAR-17).

## Lo que la transcripción de los Anexos 3 y 4 dejó ver (30-ago-2026)

- **La identificación NO se organiza por fracción, sino por tipo de cliente.**
  El sujeto del Art. 12 es «quienes realicen Actividades Vulnerables», sin
  distinguir cuál. Las únicas excepciones por fracción en todo el texto son los
  Arts. 12 Bis (fr. XI), 13 y 13 Bis (fr. XII). Por eso el Acuerdo 115/2026 no
  menciona vehículos ni una sola vez: no le tocaba.
- **El límite de tres meses del comprobante de domicilio cuelga de ALGUNOS
  documentos aceptados**, no del campo. «recibo de pago por servicios
  domiciliados o estados de cuenta bancarios, *todos ellos* con una antigüedad
  no mayor a tres meses» — pero el «contrato de arrendamiento vigente» y la
  «Constancia de inscripción en el RFC» se aceptan sin límite. Eso explica la
  coletilla del Art. 21 («conforme a los Anexos […] que así lo solicitan») y
  pone en duda la fila del 30-nov-2026 de la V Bis (POR CONFIRMAR-15).
- **En persona física el comprobante de domicilio es condicional** («cuando el
  domicilio manifestado […] no coincida con el de la identificación o ésta no
  lo contenga», Anexo 3 b iii); **en persona moral no lo es** (Anexo 4 b iii).
- **El Anexo 4 b) v) cambia de naturaleza el 30-nov-2026**: de constancia
  firmada a obligación de identificar al Beneficiario Controlador
  (POR CONFIRMAR-16).
