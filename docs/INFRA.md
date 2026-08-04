# VIZO — Infraestructura

**Versión 1 · 4 de agosto de 2026.** Estado real de la infraestructura, el modelo de entornos y los comandos del día a día. Si algo aquí deja de ser cierto, se actualiza este archivo — no se aprende por tradición oral.

---

## 1. Inventario

| Servicio | Recurso | Identificador | Estado |
|---|---|---|---|
| **GitHub** | repo `Vizo` (privado) | `juanpablofibo5/Vizo` | ✅ activo, `main` |
| **Supabase** | organización | `juanpablofibo5's Org` (`inkuqdwcgmxecwzkkvar`) | plan **Free** |
| **Supabase** | proyecto **vizo** | ref `qmlmoyvjdejklkfussza` · región `us-east-1` | ✅ `ACTIVE_HEALTHY` |
| **Supabase** | URL de API | `https://qmlmoyvjdejklkfussza.supabase.co` | — |
| **Vercel** | cuenta / team | `juan-pablo-figueroa` (`team_OqoGgavkffdMhlnBhqPnod5j`) | ✅ CLI autenticado |
| **Vercel** | proyecto | — | ⏳ se crea en la semana 1 con `vercel link` (necesita el scaffold de Next.js) |

**Convivencia con casa-confianza:** el proyecto `vizo` vive en la misma organización que `casa-confianza`, por decisión explícita. `casa-confianza` **no se tocó ni se borró**. Cuando VIZO pase a Pro conviene separarlo a su propia organización para que la facturación y los accesos queden aislados (restricción no negociable #6).

### Herramientas locales

| Herramienta | Versión | Estado |
|---|---|---|
| `gh` | 2.95.0 | ✅ autenticado (`juanpablofibo5`) |
| `vercel` | 54.14.0 | ✅ autenticado (`juanpablofibo5`) |
| `supabase` | 2.107.0 | ✅ autenticado y **enlazado** a `qmlmoyvjdejklkfussza` |
| `node` / `pnpm` | 24.16.0 / 11.7.0 | ✅ |
| `docker` | instalado | ✅ daemon corriendo |

---

## 2. Modelo de entornos

**Decisión: dos entornos reales, no tres.** Staging existe para proteger datos reales de producción; en este MVP no hay datos reales (están fuera de alcance por decisión). Un staging vacío duplicaría el trabajo de migrar y sembrar sin proteger nada.

| Superficie | Qué es | Costo | Para qué sirve |
|---|---|---|---|
| **Local** | `supabase start` (Docker) + `pnpm dev` | $0 | El 90% del trabajo. `supabase db reset` recrea todo desde migraciones + seed en segundos. Aquí se rompen y recrean RLS y triggers sin miedo. |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) | $0 | En cada push: las migraciones aplican en limpio, y desde la semana 2, la suite de umbrales + typecheck. Es el bucle de verificación que permite trabajar sin revisar cada línea a mano. |
| **Producción** | proyecto Supabase `vizo` + Vercel (`main`) | $0 → $25/mes | Lo que se demuestra. **Datos demo, nunca reales.** |
| **Preview** | Vercel, automático por PR | $0 | Ver la UI de una rama. Apunta a la base de producción (que solo tiene datos demo). |

**Cuándo agregar staging:** cuando entre el primer cliente con datos reales. Ese día, el proyecto actual pasa a ser staging y se crea uno nuevo para producción — o se activa el branching de Supabase (requiere Pro). Ninguna de las dos rutas exige rediseñar nada de lo que se construya ahora.

**Cuándo pasar a Pro (~$25 USD/mes):** semana 5, cuando haya UI desplegada que deba estar arriba para las demos. El plan Free **pausa el proyecto tras 7 días de inactividad**, lo que es tolerable mientras el trabajo es local (semanas 1–4) e intolerable cuando hay demos semanales. Pro además habilita branching.

---

## 3. Comandos del día a día

**Base de datos local** (requiere Docker Desktop abierto):

```bash
supabase start          # levanta Postgres + Auth + Storage local; imprime URLs y llaves
supabase db reset       # recrea la base desde cero: migraciones + seed. El comando más usado
supabase migration new nombre_de_la_migracion   # crea el archivo vacío con timestamp
supabase stop           # apaga el stack
```

Verificado el 4 de agosto: 12 contenedores arriba, Postgres **17.6**, `db reset` completo en **~31 s**. Studio local en `http://127.0.0.1:54323`, API en `54321`, Postgres en `54322`.

Las llaves que imprime `supabase start` son **defaults compartidos de desarrollo**, idénticas en cualquier máquina. No son secretos y no sirven contra producción. `supabase/seed.sql` es donde vive el catálogo regulatorio y los datos demo.

**Contra el proyecto remoto** (requiere `supabase login` + `supabase link`):

```bash
supabase link --project-ref qmlmoyvjdejklkfussza
supabase db push        # aplica a producción las migraciones que faltan
supabase gen types typescript --linked > src/tipos/supabase.ts
```

**Vercel** (semana 1, cuando exista el scaffold):

```bash
vercel link             # vincula esta carpeta a un proyecto de Vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel --prod           # deploy manual; lo normal es que main despliegue solo
```

---

## 4. Secretos

- **Ninguna llave vive en el repo.** `.env.local` está en `.gitignore`; `.env.example` solo tiene placeholders y la URL pública.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` es pública por diseño (el navegador la ve). Su seguridad **depende enteramente de que RLS esté bien escrita** — por eso la prueba negativa cross-tenant de la semana 5 es bloqueante en CI.
- `SUPABASE_SERVICE_ROLE_KEY` **se salta RLS**. Solo para migraciones y seed. Si aparece importada desde código de la aplicación, es un incidente de seguridad, no un atajo.
- En producción, las variables viven en el gestor de entorno de Vercel, nunca en un archivo.

---

## 5. Pendientes de infraestructura

| # | Qué | Quién | Cuándo |
|---|---|---|---|
| ~~1~~ | ~~`supabase login`~~ | — | ✅ hecho el 4 ago |
| ~~2~~ | ~~Docker Desktop corriendo~~ | — | ✅ hecho el 4 ago |
| ~~3~~ | ~~`supabase link --project-ref qmlmoyvjdejklkfussza`~~ | — | ✅ hecho el 4 ago |
| 4 | **Descargar los XSD del SPPLD a `regulatorio/xsd/`** | Juan Pablo | semana 0 — **el único pendiente que bloquea diseño** |
| 5 | Crear el proyecto de Vercel con `vercel link` | cualquiera, tras el scaffold | semana 1 |
| 6 | Alerta del DOF por la publicación de las RCG | Juan Pablo | semana 0 |
| 7 | Upgrade a Supabase Pro | Juan Pablo (es una compra) | semana 5 |
| 8 | Mover VIZO a su propia organización de Supabase | Juan Pablo | junto con el upgrade a Pro |
