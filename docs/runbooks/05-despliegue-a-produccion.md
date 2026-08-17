# Runbook 05 · Despliegue de migraciones a producción

**Cuándo:** siempre que haya migraciones nuevas en `supabase/migrations/` que producción no tenga.
**Quién:** una persona, con la contraseña de la base a mano.
**Riesgo:** el código se despliega solo —Vercel publica en cada push a `main`— pero **el esquema no**. Entre el push y el `db push` hay una ventana en la que producción corre el código de hoy contra la base de ayer.

---

## Por qué este runbook existe

El 16 de agosto de 2026 el despliegue falló **tres veces seguidas** por dos causas distintas, y ninguna dio un error a la primera. Lo que sigue es lo que se aprendió, escrito para no volver a deducirlo.

Y el detalle que enmarca todo: **Vercel despliega el código en cada push, la base no**. Si haces push y no aplicas las migraciones, producción queda con el código nuevo contra el esquema viejo. Ese día eso significó cuatro pantallas en 500 y —lo peor— el umbral de efectivo del Art. 32 midiendo la base en vez del total, sin un solo error visible.

> **Regla: el `db push` va inmediatamente después del `git push`, no «cuando se pueda».**

---

## 1. Antes de tocar producción

```bash
supabase db reset && pnpm test && pnpm build
```

Si esto no está en verde, no hay nada que desplegar. Y ojo con lo que **local no puede probar** — ver §4.

---

## 2. Comparar los dos historiales

```bash
supabase migration list --linked
```

Lee el resultado buscando **dos síntomas**, no uno:

| Síntoma | Qué significa |
|---|---|
| Filas con `"remote":""` | Migraciones locales pendientes. Normal si son las nuevas |
| Filas con `"local":""` | **Anomalía.** Producción tiene migraciones que el repositorio no conoce |

El segundo síntoma es el que costó dos intentos. Ocurre cuando la **misma** migración quedó registrada con dos números distintos: el del archivo local y la hora en que se aplicó allá.

```
20260810210000_aviso_lotes.sql   ← local
20260813041428  aviso_lotes      ← remoto, el mismo archivo
```

Cuando pasa, el CLI cree que hay 20 migraciones pendientes cuando solo hay 5, intenta re-aplicar una que ya existe, revienta con `already exists` y **aborta el lote completo sin aplicar nada**. Por eso el push «no hace nada» y no siempre es evidente por qué.

### Si hay huérfanos, se reparan antes de empujar

`migration repair` **solo toca la tabla de registro**. No ejecuta SQL ni deshace nada — «reverted» suena destructivo y solo borra el renglón del historial.

```bash
supabase migration repair --status applied  <versiones-locales-ya-aplicadas>
supabase migration repair --status reverted <versiones-remotas-huérfanas>
```

Vuelve a correr `migration list --linked`. **No sigas hasta que la única diferencia sean las migraciones que de verdad son nuevas.**

> Nunca uses `--include-all` para saltarte esto. No arregla el desfase: lo empeora, porque manda a aplicar también las que ya están.

---

## 3. Aplicar

```bash
supabase db push
```

Sin banderas. Si algo no cuadra, que el CLI te detenga.

Las migraciones de este proyecto traen **aserciones dentro**, así que se verifican solas contra producción y cada una corre en su propia transacción: una que falla revierte entera y no deja la tabla a medias. **Un push que se detiene es el sistema funcionando**, no un contratiempo.

---

## 4. Lo que local NO puede probar

Hay una clase de defecto que la máquina de desarrollo **no puede reproducir por construcción**, y este es el lugar para recordarla.

Los *default privileges* de Postgres cuelgan del **rol que crea** el objeto, y los dos entornos no tienen los mismos:

| Rol dueño del default en `public` | Local | Producción |
|---|---|---|
| `supabase_admin` | sí | sí |
| **`postgres`** | **no** | **sí** |

Las migraciones corren como `postgres`. En local una tabla nueva nace limpia; en producción nacía con `INSERT`, `UPDATE` y `DELETE` para `anon`. La migración `20260815150000_defaults_de_tablas_nuevas.sql` cerró ese grifo y dejó `app.verificar_defaults_de_tablas_nuevas()` para vigilarlo.

**La lección general:** cuando una migración pasa en local y falla en producción, **la primera hipótesis es un privilegio o un default que difiere entre entornos**, no un error de la migración. Ya pasó tres veces: ADR-17, la migración 040 y ésta.

---

## 5. Verificar, contra la base y no contra el log

El log del CLI dice qué intentó. Estas consultas dicen qué quedó.

```sql
-- Las tres auditorías estructurales. Las tres deben dar cero.
select count(*) from app.verificar_privilegios_declarados();
select count(*) from app.verificar_privilegios_por_omision();
select count(*) from app.verificar_defaults_de_tablas_nuevas();

-- Toda tabla nueva con RLS, y toda vista nueva con security_invoker.
select c.relname, c.relkind, c.relrowsecurity, c.reloptions
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','v')
   and c.relname in ( /* lo que creó este despliegue */ );

-- La cadena de bitácora de cada obligado, intacta.
select t.razon_social, (select count(*) from app.bitacora_verificar(t.id)) as eslabones_rotos
  from tenants t;
```

Una vista sin `security_invoker` la evalúa **su dueño**, que es `postgres` y tiene `BYPASSRLS`: enseñaría los datos de todos los obligados. Es un incidente, no un pendiente — ver la migración `20260813020000`.

---

## 6. Cerrar el circuito en la pantalla

Lo anterior prueba la base. **Falta el formulario**, y es donde este proyecto ya se quemó una vez: la pantalla de fecha de alta se desplegó sin poder guardar nunca, porque faltaban el `grant` y la política de `UPDATE`, y ninguna prueba lo notó porque ninguna prueba podía ejercerla.

Entra al portal y **guarda algo de verdad** en lo que se acaba de desplegar. Si guarda, el circuito está cerrado de punta a punta.

---

## Resumen

1. `supabase db reset && pnpm test && pnpm build`
2. `supabase migration list --linked` → **buscar huérfanos en los dos lados**
3. Reparar si los hay. Nunca `--include-all`
4. `supabase db push`, sin banderas
5. Verificar contra la base: las tres auditorías en cero
6. Guardar algo desde el portal
