# Campos del aviso — Fracción V Bis (Desarrollo Inmobiliario)

**Fuente:** `regulatorio/xsd/din.xsd` e `regulatorio/instructivos/act_din.pdf`, descargados del SPPLD el 4 de agosto de 2026.
**Método:** parseo del XSD (158 elementos, 46 complexTypes, 40 tipos simples) contrastado con el instructivo oficial. Nada aquí es interpretación propia salvo lo marcado como tal.

---

## 1. El hallazgo que cambia el modelo de datos

**En Fracción V Bis, el "cliente" NO es quien compra un inmueble. Es quien APORTA recursos para desarrollarlo.**

El instructivo oficial lo dice textualmente:

> integrar los expedientes de identificación de clientes o usuarios, **es decir de las personas de quienes recibe las aportaciones** para llevar a cabo el desarrollo de inmuebles, en todos los casos

Y el umbral de aviso se mide sobre lo mismo:

> presentar avisos […] cuando quien realice la Actividad Vulnerable **reciba aportaciones** para el desarrollo de bienes inmuebles por un monto igual o superior al equivalente a 8,025 veces […]

El XSD lo confirma: bajo `datos_operacion` no hay ningún elemento "comprador". Hay `desarrollos_inmobiliarios` (el proyecto) y `aportaciones`, que se desglosan en seis modalidades excluyentes: **recursos propios, socios, terceros, préstamo financiero, préstamo no financiero y financiamiento bursátil**.

Un comprador en preventa **sí** aparece — pero como *tercero* que hace una aportación numeraria, y el XSD tiene un campo específico para ese caso: `valor_inmueble_preventa`, que existe únicamente en la rama de terceros.

**Consecuencia práctica:** el modelo mental de "alta de cliente → expediente → sus pagos" es correcto en la forma, pero la entidad que se identifica es el **aportante** y falta por completo la entidad **desarrollo inmobiliario**, que es sobre la que se agrupan las aportaciones. Ver §6.

**Además, Fr. V Bis y Fr. V son obligaciones separadas.** El instructivo:

> La obligación de presentar avisos por las aportaciones recibidas **es independiente** a la que está sujeto el desarrollador inmobiliario cuando esté inscrito por la Actividad Vulnerable de Inmuebles y deba presentar avisos por las operaciones de compraventa

Esto es exactamente lo que anticipa el documento de flujo multi-parte: un mismo desarrollador puede deber avisos por dos fracciones distintas, que nunca se suman entre sí. El modelo ya lo soporta (`actividades_tenant` + acumulados por fracción).

---

## 2. Estructura del archivo

```
archivo
└─ informe (N)                          ← uno por mes reportado
   ├─ mes_reportado         AAAAMM      obligatorio
   ├─ sujeto_obligado                   obligatorio
   │  ├─ clave_entidad_colegiada        opcional
   │  ├─ clave_sujeto_obligado          obligatorio   ← RFC+homoclave del tenant
   │  ├─ clave_actividad = "DIN"        obligatorio   ← literal, fijo
   │  └─ exento                         opcional
   └─ aviso (N)                         OPCIONAL  ← su ausencia ES el informe en cero
      ├─ referencia_aviso               obligatorio   ← folio propio del obligado
      ├─ modificatorio                  opcional      ← folio + descripción del cambio
      ├─ prioridad            1|2       obligatorio
      ├─ alerta                         obligatorio   ← tipo_alerta (3-4 dígitos) + descripción
      └─ detalle_operaciones            obligatorio
         └─ datos_operacion (N)
            ├─ tipo_operacion  3-4 díg  obligatorio
            ├─ desarrollos_inmobiliarios
            │  └─ datos_desarrollo (N)
            │     ├─ objeto_aviso_anterior  SI|NO
            │     ├─ modificacion           SI|NO
            │     ├─ entidad_federativa     1-2 díg
            │     ├─ registro_licencia      hasta 200
            │     └─ caracteristicas_desarrollo (N)
            │        ├─ codigo_postal, colonia, calle
            │        ├─ tipo_desarrollo         1-2 díg
            │        ├─ descripcion_desarrollo  opcional
            │        ├─ monto_desarrollo
            │        ├─ unidades_comercializadas
            │        ├─ costo_unidad
            │        └─ otras_empresas          SI|NO
            └─ aportaciones
               ├─ fecha_aportacion   AAAAMMDD  opcional
               └─ tipo_aportacion (N)  ← CHOICE de seis modalidades excluyentes
                  ├─ recursos_propios
                  ├─ socios          → datos_socio (N)
                  ├─ terceros        → datos_tercero (N)   ← aquí va la preventa
                  ├─ prestamo_financiero
                  ├─ prestamo_no_financiero → detalle_acreedores
                  └─ financiamiento_bursatil
```

**El informe en cero no es un documento aparte:** es un `informe` con `sujeto_obligado` y **sin ningún `aviso`**. El instructivo lo confirma: *"En caso de no recibir ninguna aportación que sea objeto de aviso durante el mes […] presentar un informe señalando que […] no se llevaron a cabo actos u operaciones que sean objeto de Aviso"*. Nuestro pipeline lo genera por el mismo camino, como estaba diseñado.

---

## 3. Datos de la persona (socio, tercero o acreedor)

Las tres ramas usan la misma forma: un CHOICE entre persona física, persona moral y fideicomiso.

| Persona física | Persona moral | Fideicomiso |
|---|---|---|
| nombre | denominacion_razon | denominacion_razon |
| apellido_paterno | fecha_constitucion | rfc (moral) |
| apellido_materno | rfc (moral) | identificador_fideicomiso |
| fecha_nacimiento | pais_nacionalidad | |
| rfc (física) | giro_mercantil (7 díg) | |
| curp | **representante_apoderado** (obligatorio) | |
| pais_nacionalidad | └ nombre, apellidos, fecha_nac, rfc, curp | |
| actividad_economica (7 díg) | | |

Los socios además llevan **domicilio** (CHOICE nacional/extranjero) y teléfono/correo:

- **nacional:** colonia, calle, número exterior, número interior, código postal (5 dígitos)
- **extranjero:** país, estado/provincia, ciudad, colonia, calle, números, CP alfanumérico

Y su aportación: numerario (instrumento monetario, moneda, monto, si es a fideicomiso, institución) o en especie (descripción del bien, monto estimado).

---

## 4. Formatos exactos de los tipos

Estos patrones son la razón por la que el generador de XML **no puede improvisar formato**.

| Tipo | Patrón | Nota para el generador |
|---|---|---|
| `fecha_type` | `\d{8}` | **AAAAMMDD**, no ISO. `2026-03-15` → `20260315` |
| `mes_reportado_type` | `\d{4}[0\|1]\d{1}` | **AAAAMM** |
| `monto_type` | `\d{1,14}\.\d{2}` | String con **exactamente 2 decimales**, sin separadores de miles ni signo de pesos |
| `nombre_type` | `[A-ZÑ \.,]{1,200}` | **MAYÚSCULAS, sin acentos**. Ñ sí se permite |
| `denominacion_razon_type` | `[A-ZÑ\d #\-\.&,_@';:+/()\[\]{}]{1,254}` | mayúsculas |
| `rfc_fisica_type` | `[A-ZÑ&%+]{4}\d{6}[A-Z0-9]{3}` | **4** letras |
| `rfc_moral_type` | `[A-ZÑ&%+]{3}\d{6}[A-Z0-9]{3}` | **3** letras — son tipos distintos |
| `clave_so_type` | `[A-ZÑ&%+]{3,4}\d{6}[A-Z0-9]{3}` | RFC del obligado, física o moral |
| `curp_type` | `[A-Z]{4}\d{6}[MH][A-Z]{5}[A-Z0-9]{2}` | |
| `cp_type` | `\d{5}` | nacional |
| `cp_extranjero_type` | `[A-ZÑ0-9]{4,12}` | |
| `pais_type` | `[A-Z]{2}` | código de 2 letras |
| `si_no_type` | `SI\|NO` | literal |
| `clave_actividad_type` | `DIN` | constante |
| `correo_electronico_type` | `[A-Z\d\._'\-]+@…` | **el correo también va en MAYÚSCULAS** |
| `numero_telefono_type` | `\d{10,12}` | solo dígitos |
| `tipo_alerta_type` | `\d{3,4}` | |
| `folio_modificacion_type` | `\d{4}\-\d{1,9}` | |

**Implicación de diseño:** hay que normalizar a mayúsculas y quitar acentos **al generar el XML**, no al guardar. Los datos se conservan como los capturó el usuario (con acentos, como en la identificación oficial) y la transformación ocurre en el pipeline del aviso. Ojo: `app.normalizar_nombre()` en la base convierte `Ñ→N` y sirve para **resolución de identidad**, no para el XML — el XSD sí acepta Ñ. Son dos normalizaciones distintas y no deben compartirse.

---

## 5. Lo que el XSD NO valida (y por qué importa)

**El XSD tiene cero `enumeration`.** Todos los "catálogos" son patrones de forma:

| Campo | Lo que el XSD exige | Lo que NO exige |
|---|---|---|
| `tipo_operacion` | 3 o 4 dígitos | que el número sea un tipo válido |
| `tipo_desarrollo` | 1 o 2 dígitos | que exista ese tipo |
| `entidad_federativa` | 1 o 2 dígitos | que sea una entidad real |
| `moneda` | 1 a 3 dígitos | que sea una moneda del catálogo |
| `instrumento_monetario` | 1 o 2 dígitos | ídem |
| `actividad_economica` / `giro_mercantil` | 7 dígitos | que exista en el catálogo del SAT |
| `pais_nacionalidad` | 2 letras | que sea un país |

**Un XML puede validar contra el XSD y aun así ser rechazado o mal presentado.** La validación XSD es **necesaria pero no suficiente**: los valores válidos viven en los catálogos del instructivo y de las plantillas .xlsm (`regulatorio/plantillas/`).

Esto refuerza la decisión de `campos_expediente` con columna `validacion jsonb`: ahí van los catálogos de valores cerrados que el XSD no impone, para validar antes de generar. **Pendiente:** extraer los catálogos de las plantillas .xlsm.

---

## 6. Cruce contra el modelo de datos actual

Este es el cruce que `docs/PLAN.md` programaba para la semana 6 y que conviene resolver ahora, con la migración 001 recién aplicada y las tablas vacías.

### Lo que ya calza

| Campo del XSD | Columna actual |
|---|---|
| `clave_sujeto_obligado` | `tenants.rfc` |
| `mes_reportado` | `avisos.periodo` |
| `rfc`, `curp` de la persona | `clientes_finales.rfc` / `.curp` |
| `fecha_nacimiento` / `fecha_constitucion` | `clientes_finales.fecha_nacimiento_o_constitucion` |
| `pais_nacionalidad` | `clientes_finales.nacionalidad` (guardar código ISO de 2 letras) |
| persona física / moral / fideicomiso | `clientes_finales.tipo_persona` (falta el valor `fideicomiso`) |
| `monto_aportacion` | `operaciones.monto_base` |
| `fecha_aportacion` | `operaciones.fecha_operacion` |
| `modificatorio` | `avisos.tipo = 'modificatorio'` |
| ausencia de `aviso` | `avisos.tipo = 'cero'` |

### Lo que falta (7 huecos)

| # | Hueco | Impacto |
|---|---|---|
| 1 | **Apellidos separados.** El XSD pide `nombre`, `apellido_paterno` y `apellido_materno` como campos distintos; el modelo tiene `nombre_o_razon_social` en uno solo | Alto — partir un nombre completo a posteriori es adivinar |
| 2 | **Entidad `desarrollos_inmobiliarios`.** No existe en el modelo: CP, colonia, calle, tipo, monto, unidades comercializadas, costo por unidad, licencia, entidad federativa | Alto — es sobre lo que se agrupan las aportaciones |
| 3 | **Domicilio del aportante** (nacional/extranjero, con estructuras distintas) | Alto — obligatorio para socios |
| 4 | **Representante o apoderado** de personas morales, con sus propios datos | Alto — el XSD lo marca obligatorio en persona moral |
| 5 | **Modalidad de la aportación**: socio / tercero / préstamo / recursos propios / bursátil, más `valor_inmueble_preventa`, `instrumento_monetario`, `moneda` | Alto — determina en qué rama del XML entra |
| 6 | **Teléfono y correo** del aportante | Medio — obligatorio para socios |
| 7 | **`actividad_economica` / `giro_mercantil`** (7 dígitos), `tipo_persona = fideicomiso` | Medio |

Ninguno es un cambio de arquitectura: son columnas y dos tablas nuevas, todas dentro de las convenciones ya establecidas (tenant_id + RLS + append-only donde corresponda). Se resuelven con una migración `002` sobre tablas vacías, que es el momento más barato posible.

---

## 7. Hallazgos que van a POR CONFIRMAR

**7.1 — El instructivo publicado está desactualizado.** `act_din.pdf` dice conservar la documentación **5 años** y mide el umbral en *"veces el salario mínimo general vigente en el Distrito Federal"*. La reforma de 2025 subió la conservación a **10 años** y el umbral se mide en **UMA**. El portal sigue publicando el documento viejo.
→ **No se toma nada de ese PDF como vigente sin contrastarlo.** La estructura de campos sí es utilizable (coincide con el XSD); las obligaciones y los plazos, no.

**7.2 — El ejemplo oficial de XML no valida** contra su propio XSD (ver `regulatorio/README.md`). Ya registrado como POR CONFIRMAR-6.

**7.3 — Catálogos de valores.** Los códigos de `tipo_operacion`, `tipo_desarrollo`, `moneda` e `instrumento_monetario` no están en el XSD. Hay que extraerlos de las plantillas .xlsm y confirmarlos.

**7.4 — `referencia_aviso` y `tipo_alerta`.** El primero es folio propio del obligado (falta definir cómo se genera y que sea único). El segundo es obligatorio en cada aviso y su catálogo tampoco está en el XSD.
