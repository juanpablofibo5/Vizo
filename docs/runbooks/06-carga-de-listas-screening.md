# Runbook 06 — Carga de las listas de control (screening)

**Para qué.** El conector de screening (issue #34, ADR-30) consulta contra las
versiones **vigentes** de las cuatro listas. Sin las cuatro cargadas, **la consulta
se detiene** a propósito — mejor un error accionable que un «sin coincidencias»
sobre lo que no se miró. Cargar una lista es crear una **versión nueva** del
catálogo global, con fecha, hash del archivo y conteo.

**Quién.** Backoffice, con `VIZO_DB_URL_ADMIN` (como el seed). La aplicación solo
lee. **Cadencia:** semanal como piso, y siempre antes de una jornada de altas del
piloto — la evidencia de cada consulta cita la fecha de descarga de lo consultado.

## El comando

```bash
pnpm tsx scripts/cargar-lista-screening.ts \
  --clave <clave> --archivo <ruta descargada> --fuente <URL oficial>
```

## Las cuatro listas

| Clave | Fuente oficial | Formato | Parser |
|---|---|---|---|
| `ofac_sdn` | https://www.treasury.gov/ofac/downloads/sdn.csv **+** https://www.treasury.gov/ofac/downloads/alt.csv | CSV sin encabezado | ✅ |
| `onu` | https://scsanctions.un.org/resources/xml/en/consolidated.xml | XML | ✅ |
| `sat_69b` | Buscar «Listado completo 69-B» en sat.gob.mx (la ruta del CSV cambia; históricamente `omawww.sat.gob.mx/cifras_sat/...`) | CSV **latin1** | ✅ |
| `lpb` | Se obtiene con la cuenta del obligado en el portal de la UIF/SPPLD — **confirmar el medio de descarga con el especialista** | — | ⬚ pendiente |

### OFAC va con sus alias, siempre

`sdn.csv` trae los nombres principales y `alt.csv` los alternos. Cargar solo el
primero deja fuera **más de la mitad de los nombres buscables** (verificado el
30-ago-2026: 19,321 principales contra 20,147 alias), y la consulta diría «sin
coincidencias» sobre alguien listado bajo otro nombre. Los dos archivos se bajan
**de la misma fecha** y se cargan juntos:

```bash
pnpm tsx scripts/cargar-lista-screening.ts \
  --clave ofac_sdn --archivo ./sdn.csv --alias ./alt.csv \
  --fuente https://www.treasury.gov/ofac/downloads/sdn.csv
```

El parser liga cada alias con su principal por `ent_num`. Si los archivos no son
de la misma descarga, la mayoría de los alias queda huérfana y el parser **se
niega**: es mejor no cargar que colgar un alias de la persona equivocada.

Correr sin `--alias` no se detiene —media lista es mejor que ninguna— pero
imprime un aviso. Si aparece ese aviso en una carga de producción, se repite.

### ONU: un solo archivo, alias incluidos

```bash
pnpm tsx scripts/cargar-lista-screening.ts \
  --clave onu --archivo ./consolidated.xml \
  --fuente https://scsanctions.un.org/resources/xml/en/consolidated.xml
```

El XML trae personas y entidades en el mismo documento, con sus alias adentro; el
parser los emite todos. Referencia del 30-ago-2026: **1,011 entradas principales**
(736 personas + 275 entidades) y 2,767 alias. Si un día carga muchas menos, hay
que mirar por qué antes de dar la carga por buena.

### LPB sigue pendiente, y no por falta de código

Su formato **no está confirmado**: se descarga con la cuenta del obligado en el
portal de la UIF. Escribir un parser para un formato que nadie ha visto sería
inventarlo. Vía provisional mientras tanto: convertir la fuente a CSV UTF-8 con
encabezado `nombre,rfc` —conversión **completa** y verificada contra la fuente— y
cargar con la clave real y el parser genérico:

```bash
pnpm tsx scripts/cargar-lista-screening.ts \
  --clave lpb --parser generico --archivo lpb-convertida.csv \
  --fuente <la URL o el medio del que se obtuvo>
```

El hash registrado es el del CSV convertido, no el del original, y así debe
decirse si se audita.

## Verificación después de cada carga

```bash
docker exec supabase_db_vizo psql -U postgres -d postgres -c \
  "select distinct on (clave) clave, descargada_en, registros, left(hash_sha256, 12) as hash \
     from listas_screening order by clave, descargada_en desc;"
```

Las cuatro claves con fecha de hoy (o de la semana) y conteos plausibles: OFAC
miles, 69-B decenas de miles, ONU cientos, LPB según publique la UIF. Un conteo
desplomado contra la carga anterior es señal de archivo truncado — no se consulta
con esa versión: se recarga.

## Lo que este runbook no permite olvidar

- **Los alias de OFAC (`alt.csv`) aún no se cargan** — el matching de hoy prueba
  el nombre principal. Está dicho en el parser y cuenta como limitación conocida
  en cualquier demo.
- El umbral de similitud vive en `parametros_motor` (`umbral_similitud_screening`)
  y cambiarlo es una decisión versionada, no un ajuste silencioso.
- VIZO **nunca** descarta una coincidencia: la resolución es humana, única y con
  razonamiento — la base lo garantiza por trigger.
