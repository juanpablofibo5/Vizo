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
| `ofac_sdn` | https://www.treasury.gov/ofac/downloads/sdn.csv | CSV sin encabezado | ✅ |
| `sat_69b` | Buscar «Listado completo 69-B» en sat.gob.mx (la ruta del CSV cambia; históricamente `omawww.sat.gob.mx/cifras_sat/...`) | CSV **latin1** | ✅ |
| `onu` | https://scsanctions.un.org/resources/xml/en/consolidated.xml | XML | ⬚ pendiente |
| `lpb` | Se obtiene con la cuenta del obligado en el portal de la UIF/SPPLD — **confirmar el medio de descarga con el especialista** | — | ⬚ pendiente |

**Mientras ONU y LPB no tengan parser, la vía provisional** es: convertir la
fuente oficial a CSV UTF-8 con encabezado `nombre,rfc` (conversión **completa** y
verificada contra la fuente — una lista a medias es peor que ninguna) y cargarla
con la clave real y el parser genérico:

```bash
pnpm tsx scripts/cargar-lista-screening.ts \
  --clave onu --parser generico --archivo onu-convertida.csv \
  --fuente https://scsanctions.un.org/resources/xml/en/consolidated.xml
```

El hash registrado es el del CSV convertido — no el del XML original — y así debe
decirse si se audita. Preferible: esperar el parser (está en el issue #34).

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
