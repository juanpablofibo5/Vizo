# Runbook 03 · Monitoreo de la flota

**Cuándo:** una revisión semanal, y **una diaria del día 10 al 17** de cada mes, que es la ventana en la que un descuido se vuelve un incumplimiento.
**Quién:** cualquiera del equipo.
**Para qué:** que ningún obligado se entere de que incumplió por la multa.

Todas las consultas se corren como rol administrativo contra producción, y **ninguna devuelve datos personales**: RFC y razón social del obligado —que es nuestro cliente, no su comprador— e identificadores opacos para todo lo demás. Un tablero de monitoreo con nombres de clientes finales sería una fuga con buenas intenciones.

---

## 1. CI y aserciones (automático, solo hay que mirarlo)

- **CI en cada push:** `pnpm test` (suite completa) y `pnpm build`. Si está rojo, no se despliega nada.
- **16 aserciones estructurales** corren al aplicar migraciones: comprueban que los `CHECK`, las FK compuestas y los privilegios por omisión siguen mordiendo. Una migración que las rompe no se aplica.
- **`app.verificar_privilegios_por_omision()`** vigila lo que Supabase concede solo: TRUNCATE, TRIGGER, REFERENCES y MAINTAIN a `anon`/`authenticated` sobre cada tabla nueva de `public`. No aparece en ninguna migración, así que no se ve leyendo el código.

---

## 2. La consulta que importa: periodos vencidos sin presentar

```sql
with obligacion as (
  select t.id as tenant_id, t.rfc, t.razon_social, act.actividad_id,
         -- La obligación corre desde el alta ante la autoridad. Si no la
         -- tenemos, se arranca en la primera operación: cubre menos, y por eso
         -- la fecha de alta es un paso del arranque.
         coalesce(
           date_trunc('month', t.fecha_alta_autoridad),
           date_trunc('month', (select min(o.fecha_operacion) from operaciones o
                                 where o.tenant_id = t.id))
         )::date as desde
    from tenants t
    join actividades_tenant act on act.tenant_id = t.id
   where t.activo
),
periodos as (
  select o.*, gs::date as periodo
    from obligacion o
    cross join lateral generate_series(
      o.desde,
      (date_trunc('month', current_date) - interval '1 month')::date,
      interval '1 month'
    ) gs
   where o.desde is not null
)
select p.rfc, p.razon_social, to_char(p.periodo, 'YYYY-MM') as periodo,
       (p.periodo + interval '1 month' + interval '16 days')::date as vence,
       current_date > (p.periodo + interval '1 month' + interval '16 days')::date as vencido
  from periodos p
  left join avisos a
    on  a.tenant_id = p.tenant_id
    and a.actividad_id = p.actividad_id
    and a.periodo = p.periodo
    and a.estatus = 'presentado'
 where a.id is null
 order by vencido desc, p.periodo;
```

**Un periodo sin operaciones también aparece, y debe aparecer:** el informe en cero es una obligación por sí misma, no la ausencia de una.

> **Esta consulta es una alarma de operación, no la fuente legal del plazo.** El plazo que vale lo calcula `plazoDePresentacion` y lo pinta el calendario del portal. Si algún día difieren, el defecto está aquí — no allá. Se duplica la regla a sabiendas porque la alternativa es no tener alarma de flota.

**Qué se hace con un renglón:** se le avisa al obligado por su canal, con el periodo y la fecha. No se genera ni se aprueba nada por él.

---

## 3. Los obligados invisibles

La consulta anterior cruza `actividades_tenant`. **Un obligado sin actividad contratada no aparece en ella** — y es justo el que peor está, porque su portal tampoco puede evaluar nada.

```sql
select t.rfc, t.razon_social, t.created_at::date as dado_de_alta
  from tenants t
 where t.activo
   and not exists (select 1 from actividades_tenant a where a.tenant_id = t.id)
 order by t.created_at;
```

Cualquier renglón aquí es **un alta incompleta nuestra** (runbook 01, paso 2). El cliente está viendo su checklist de arranque atorado en el primer paso, marcado «VIZO».

---

## 4. Trabajo estancado

```sql
-- Expedientes que llevan más de 30 días sin aprobarse.
select e.tenant_id, e.id as expediente, e.estatus::text, e.created_at::date
  from expedientes e
 where e.estatus <> 'aprobado'
   and e.created_at < now() - interval '30 days'
 order by e.created_at;

-- Avisos generados que nadie aprobó. Del 10 en adelante, cada uno es una
-- llamada.
select a.tenant_id, a.id as aviso, to_char(a.periodo,'YYYY-MM') as periodo,
       a.estatus::text, a.created_at::date
  from avisos a
 where a.estatus in ('generado', 'validado', 'listo_revision')
 order by a.periodo;

-- Aprobados que nunca recibieron acuse: se aprobó, ¿se presentó?
select a.tenant_id, a.id as aviso, to_char(a.periodo,'YYYY-MM') as periodo,
       a.aprobado_en::date
  from avisos a
 where a.estatus = 'aprobado' and a.aprobado_en < now() - interval '7 days'
 order by a.aprobado_en;
```

El último caso es el más delicado del producto: **VIZO no presenta**. Un aviso aprobado y sin acuse puede significar que el obligado lo presentó y no subió el acuse… o que creyó que VIZO lo mandaba. La llamada aclara cuál de las dos, y esa distinción vale más que cualquier métrica del tablero.

---

## 5. Integridad y almacenamiento

- **Cadena de bitácora:** cada obligado puede verificarla desde `/evidencia`. Para revisarla de nuestro lado se usa la misma función que usa el portal, sobre una copia — nunca escribiendo en `bitacora`, que es append-only.
- **Huérfanos en Storage** (issue #15): cuando la transacción de un aviso se revierte después de subir el archivo, el objeto queda sin fila. No corrompe nada; ocupa espacio y confunde una auditoría. Revisión trimestral hasta que el issue se cierre.

---

## 6. Cadencia

| Cuándo | Qué |
|---|---|
| Cada push | CI (automático) |
| Lunes | §2 completa, §3, §4 |
| Del 10 al 17, diario | §2 filtrada al periodo corriente, §4 avisos sin aprobar |
| Día 18 | Cierre: quién no presentó y por qué. Si hubo un incumplimiento, se documenta qué falló — nuestro o suyo |
| Trimestral | §5 |
