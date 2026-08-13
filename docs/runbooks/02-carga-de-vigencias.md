# Runbook 02 · Carga de una vigencia regulatoria

**Cuándo:** cuando el DOF publica un valor nuevo de UMA, un umbral, un campo de expediente o un formato de aviso.
**Quién:** **dos personas**. Una redacta, otra verifica contra el DOF. No la misma en dos momentos: dos personas.
**Riesgo:** este es el procedimiento más peligroso de VIZO. El catálogo es el activo compartido — **un valor mal cargado afecta a todos los clientes a la vez**, y no revienta: calcula.

---

## Por qué la doble revisión, y por qué aquí

El modo de falla de este proyecto no es el crash. Las tres auditorías del núcleo encontraron siempre lo mismo: un cálculo mal hecho que devolvía un número plausible. Ninguna lanzó una excepción.

Un umbral con la fuente equivocada es exactamente eso, multiplicado por la cartera. Si se carga 8,025 UMA donde eran 8,205, VIZO deja de avisar operaciones que debía avisar, en todos los obligados, durante meses, sin un solo error en pantalla.

Por eso el producto exige que quien genera el aviso no sea quien lo aprueba. Este runbook aplica la misma regla a nosotros.

---

## 1. La fuente

**Sin texto del DOF a la vista, no se carga nada.** No cuenta:

- un análisis de un despacho,
- una nota de prensa,
- un boletín de un competidor,
- lo que dijo el especialista por teléfono (eso se documenta como duda, no como fuente).

Se anota el **código de publicación** del DOF y la fecha. Va en la migración, en la columna `fuente` / `fuente_dof`, y en `docs/DECISIONES.md` si cambia una decisión.

> Estado actual: el **Acuerdo 115/2026** (DOF 7-ago-2026, código 5795797) todavía **no está contrastado**. Issue #9. Nada suyo entra al catálogo hasta que lo esté — ver `docs/ACUERDO-115-2026.md`.

---

## 2. La migración

Se escribe una **migración nueva**. Las aplicadas no se editan nunca; se corrige con otra.

Las vigencias tienen una **exclusion constraint** que impide traslapes (`uma_sin_traslape`, `umbral_sin_traslape`). Eso obliga a cerrar la vigencia anterior **en la misma transacción**, y es a propósito: el hueco o el traslape entre dos vigencias es precisamente el defecto que hace que el motor elija el valor de otra fecha.

```sql
-- Ejemplo: UMA 2027, publicada por INEGI en el DOF.
-- La UMA rige desde el 1 de febrero para efectos de umbrales: las operaciones
-- de enero se evalúan con la del año anterior (ver CLAUDE.md, gotchas).
begin;

update uma_vigencias
   set vigente_hasta = date '2027-01-31'
 where vigente_hasta is null;

insert into uma_vigencias (valor_diario, vigente_desde, fuente_dof)
values (000.00, date '2027-02-01', 'DOF dd-mmm-2027, código 0000000');

commit;
```

Y **una aserción** en la misma migración, que se auto-revierte, del estilo de las 16 que ya existen: cargar el valor sin comprobar que el motor lo elige en la fecha correcta es cargar a ciegas.

```sql
do $$
declare v numeric;
begin
  -- El 31 de enero todavía manda la vigencia anterior. El 1 de febrero, la nueva.
  select valor_diario into v from uma_vigencias
   where date '2027-01-31' between vigente_desde and coalesce(vigente_hasta, 'infinity');
  if v <> 000.00 then
    raise exception 'El 31 de enero se está resolviendo con la UMA equivocada: %', v;
  end if;
  raise notice '✓ la UMA nueva entra el 1 de febrero, no antes';
end $$;
```

---

## 3. La verificación cruzada

La segunda persona **no revisa el SQL: revisa los valores contra el DOF**, con el texto oficial abierto. Es una lectura distinta y por eso la hace otra persona.

Checklist del PR (se pega en el cuerpo, palomeada por quien verifica):

- [ ] Cada número del SQL aparece en el texto del DOF, leído directamente
- [ ] La **fecha de entrada en vigor** es la del decreto, no la de publicación
- [ ] La vigencia anterior se cierra el día correcto, sin hueco ni traslape
- [ ] La base de cálculo (`con_iva` / `sin_iva`) corresponde al artículo — Art. 17 sin IVA, Art. 32 con IVA
- [ ] La migración trae aserción, y falla si se sabotea el valor
- [ ] `pnpm test` y `pnpm test:xsd` en verde
- [ ] La fuente quedó escrita en la columna `fuente`/`fuente_dof`, con código del DOF

**Quien redactó no palomea.** Si solo hay una persona disponible, la carga espera. Nada de esto es urgente al grado de saltarse el control: los valores del DOF se publican con semanas de anticipación a su entrada en vigor.

---

## 4. Publicar

```bash
pnpm test          # suite completa: las aserciones corren al migrar
pnpm build         # las rutas tipadas no las ve tsc solo
```

CI verde → merge → aplicar a producción (`pnpm db:migrate` contra el proyecto remoto).

**Después de aplicar, comprobar en producción** que el valor quedó y que la vigencia anterior cerró:

```sql
select valor_diario, vigente_desde, vigente_hasta, fuente_dof
  from uma_vigencias order by vigente_desde desc limit 3;
```

---

## 5. Un formato de aviso nuevo (XSD)

Mismo procedimiento, con dos pasos más:

1. El XSD **se descarga del portal del SPPLD**, no se transcribe. Se guarda en `regulatorio/xsd/` con su nombre oficial.
2. `pnpm test:xsd` valida los XML generados contra él. Si el formato nuevo cambia campos, **la suite falla antes de que llegue a un cliente** — que es exactamente para lo que existe.

```sql
insert into formatos_aviso (actividad_id, version, ruta_xsd, vigente_desde, notas)
select id, 'v0000', 'regulatorio/xsd/xxxx.xsd', date '2027-01-01',
       'DOF dd-mmm-2026, código 0000000'
  from actividades_vulnerables where fraccion = 'V_BIS';
```

---

## 6. Lo que este runbook será en F2

La misma secuencia, con pantallas: cargar una vigencia crea un **borrador**; un segundo rol lo aprueba citando la fuente; la publicación queda en la bitácora propia del backoffice. **Sin borrador aprobado, nada entra a producción.** El procedimiento no cambia — cambia que el control deja de depender de que alguien se acuerde.
