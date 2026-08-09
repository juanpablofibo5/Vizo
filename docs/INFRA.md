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
| **Vercel** | proyecto `vizo` | `prj_U98S0BU9ILy7fpfVNCb2CpvrmBIB` | ✅ creado 7 ago, ligado al repo — ver §6 |
| **GoDaddy** | dominio `vizo.mx` | ns `ns59/ns60.domaincontrol.com` | ⏳ comprado; DNS aún en parqueo — ver §6 |

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
| ~~4~~ | ~~Descargar los XSD del SPPLD~~ | — | ✅ hecho el 4 ago — ver `regulatorio/README.md` |
| ~~5~~ | ~~Crear el proyecto de Vercel~~ | — | ✅ hecho el 7 ago — ver §6 |
| 6 | Alerta del DOF por la publicación de las RCG | Juan Pablo | semana 0 |
| 7 | Upgrade a Supabase Pro | Juan Pablo (es una compra) | semana 5 |
| 8 | Mover VIZO a su propia organización de Supabase | Juan Pablo | junto con el upgrade a Pro |
| ~~9~~ | ~~Rol de base `vizo_app`~~ | — | ✅ hecho el 9 ago — migración 018, ADR-18 |
| 10 | Pooler de transacciones para la conexión SQL directa | cualquiera | antes del primer deploy |

**Sobre el 9, ya hecho.** La aplicación se conecta como `vizo_app`: sin superusuario, sin BYPASSRLS y **NOINHERIT**, así que no puede hacer nada por sí mismo — tiene que asumir `authenticated`. Olvidar el cambio de rol pasó de ser un agujero silencioso a un `permission denied` inmediato (ADR-18).

Hay **dos** cadenas de conexión y llevan nombres distintos a propósito:

| Variable | Rol | Quién la usa |
|---|---|---|
| `VIZO_DB_URL` | `vizo_app` | La aplicación. Sin BYPASSRLS. |
| `VIZO_DB_URL_ADMIN` | `postgres` | Migraciones, seed y la suite de tests, que preparan escenarios. **La app nunca.** |

Si `VIZO_DB_URL_ADMIN` aparece importada desde `app/` o `src/`, es un incidente de seguridad y no un atajo.

**La contraseña de `vizo_app` en producción se carga UNA VEZ, a mano.** La migración crea el rol sin contraseña a propósito: una contraseña en una migración queda en el repositorio y viaja a producción. En local la pone `supabase/seed.sql`, que solo corre en local.

**Sobre el 10.** Cada Server Action abre una conexión nueva con `pg` y la cierra al terminar. En local no se nota; en Vercel cada invocación concurrente es una conexión directa, y el límite se alcanza antes de lo que parece. Corresponde apuntar `VIZO_DB_URL` al pooler de transacciones (puerto 6543), no al puerto 5432. No es un defecto hoy —no hay nada desplegado— pero sí lo primero que falla bajo carga.

---

## 6. Vercel y el dominio vizo.mx

Estado al 7 de agosto de 2026.

| Pieza | Estado |
|---|---|
| Proyecto `vizo` (`prj_U98S0BU9ILy7fpfVNCb2CpvrmBIB`) | ✅ creado, ligado a `juanpablofibo5/Vizo` |
| Deploy automático desde `main` | ✅ conectado |
| `vizo.mx`, `www.vizo.mx` y **`app.vizo.mx`** asignados al proyecto | ✅ del lado de Vercel |
| DNS en GoDaddy apuntando a Vercel | ❌ **pendiente** — falta el registro A de `app` |
| `NEXT_PUBLIC_SUPABASE_URL` en Vercel | ✅ cargada en production, preview y development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `VIZO_DB_URL` | ❌ **pendientes** — son credenciales, las carga su dueño |
| Datos demo en la base de producción | ✅ un obligado, dos sucursales, dos usuarios **sin contraseña** |
| Protección de deploy (Vercel Authentication) | ✅ activa: solo la cuenta dueña ve el sitio |

**Decisión tomada el 9 de agosto:** la app vive en **`app.vizo.mx`**; el apex `vizo.mx` queda libre para la landing comercial. Es lo convencional en SaaS multi-tenant y no compromete el dominio comercial con un prototipo.

**Verificado, no supuesto:** Vercel marcó las variables de producción como *Sensitive*, lo que hacía dudar de si estarían disponibles en tiempo de build — que es cuando las `NEXT_PUBLIC_*` se inyectan al bundle. Se comprobó con un build real: la URL aparece en el bundle estático. Sí llegan.

### Lo que falta para que el dominio sirva la app

**1. DNS en GoDaddy.** El dominio está comprado ahí (`ns59/ns60.domaincontrol.com`) y hoy apunta a la IP de parqueo. Vercel pide una de dos:

- **Recomendado:** agregar en GoDaddy el registro `A` de `vizo.mx` → `76.76.21.21`, y un `CNAME` de `www` → `cname.vercel-dns.com`. Deja el resto del DNS (correo, etc.) donde está.
- **Alternativa:** cambiar los nameservers del dominio a los de Vercel. Mueve *todo* el DNS, incluido el correo si algún día lo hay.

**2. Variables de entorno.** El proyecto no tiene ninguna, así que aunque el DNS apunte, la app no arranca. Hacen falta tres, y **las tres las carga Juan Pablo**, no un agente: dos son credenciales.

| Variable | Qué es | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qmlmoyvjdejklkfussza.supabase.co` | No es secreto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | llave publicable del proyecto remoto | Viaja al navegador por diseño |
| `VIZO_DB_URL` | cadena de conexión a Postgres | **Contiene contraseña** |

Las dos `NEXT_PUBLIC_*` se inyectan **en tiempo de build**: hay que redesplegar después de cargarlas, no basta con guardarlas.

**3. Antes de cargar `VIZO_DB_URL`, resolver los pendientes 9 y 10.** Hoy esa cadena sería la del superusuario `postgres`, que ignora RLS (ADR-16), y apuntaría al puerto directo en vez del pooler. Ninguna de las dos cosas se nota en local y las dos muerden en serverless.

**4. La base de producción no tiene usuarios.** Tiene el catálogo regulatorio, pero cero obligados y cero cuentas: `supabase/seed.sql` solo corre en local, a propósito, porque son datos demo. Con el dominio conectado hoy, el resultado sería un login por el que nadie puede entrar. Antes de mostrar la app hay que decidir qué obligado y qué usuarios existen en producción — decisión de producto, no de infraestructura.

### Decisión pendiente: apex o subdominio

`vizo.mx` es el dominio comercial. Ponerle encima un prototipo de la semana 5 ocupa el apex y obliga a redirects después. La alternativa convencional en SaaS multi-tenant es `app.vizo.mx` para la aplicación y el apex para la landing. Un subdominio no cuesta nada: se crea con un registro DNS más.

Hoy ambos nombres están asignados al proyecto, así que la decisión sigue abierta y se ejecuta en GoDaddy, no en Vercel.
