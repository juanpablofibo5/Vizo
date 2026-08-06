-- VIZO · Migración 001 (parte 1/8) — Fundamentos
--
-- Extensiones, esquema de helpers, tipos del dominio y las funciones que RLS
-- usa para leer la identidad del usuario. Nada de esto es regulatorio.
--
-- Ver docs/ARQUITECTURA.md §2 y §9.

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
-- btree_gist: necesario para las exclusion constraints que impiden que dos
-- filas del catálogo tengan vigencias traslapadas para la misma clave.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Esquema de helpers
-- ---------------------------------------------------------------------------
-- Las funciones de infraestructura viven en `app` para no ensuciar `public`,
-- que es lo que PostgREST expone como API.
create schema if not exists app;
comment on schema app is
  'Funciones de infraestructura de VIZO. No se expone por la API.';

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Identidad del usuario (la base de toda política RLS)
-- ---------------------------------------------------------------------------
-- tenant_id y rol viajan en app_metadata del JWT. app_metadata solo lo puede
-- escribir el servicio de Auth, nunca el usuario: por eso es confiable para
-- decidir permisos. Un claim en user_metadata sería auto-asignable y por lo
-- tanto inservible como control de acceso.
create or replace function app.claim(clave text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
         -> 'app_metadata' ->> clave;
$$;

create or replace function app.tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(app.claim('tenant_id'), '')::uuid;
$$;

create or replace function app.rol()
returns text
language sql
stable
set search_path = ''
as $$
  select app.claim('rol');
$$;

create or replace function app.es_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(app.rol() = 'admin', false);
$$;

comment on function app.tenant_id() is
  'Tenant del usuario autenticado, leído de app_metadata del JWT. NULL si no hay sesión.';

-- ---------------------------------------------------------------------------
-- Append-only: el guardián
-- ---------------------------------------------------------------------------
-- Se aplica como trigger a bitacora, operaciones, evaluaciones_umbral y
-- documentos. Un trigger es más fuerte que un REVOKE porque también detiene
-- al owner de la tabla y a service_role: no hay ruta administrativa que
-- reescriba el historial por accidente. Corregir es insertar una fila nueva.
create or replace function app.prohibir_mutacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    '% es append-only: % no está permitido. Una corrección es una fila nueva.',
    tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- Normalización de nombres
-- ---------------------------------------------------------------------------
-- Se usa en columnas generadas, así que tiene que ser IMMUTABLE. Por eso usa
-- translate() y no unaccent(), que no lo es.
--
-- Advertencia de diseño: el nombre normalizado NUNCA resuelve identidad por
-- sí solo (ver docs/ARQUITECTURA.md §3.3). Es apoyo de búsqueda y cotejo
-- humano. Resolver "mismo cliente" por nombre es el camino directo a un falso
-- negativo, que en este dominio significa un aviso omitido.
create or replace function app.normalizar_nombre(texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(
      upper(translate(
        texto,
        'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
        'aeiouAEIOUaeiouAEIOUaeiouAEIOUnNcC'
      )),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- Tipos del dominio
-- ---------------------------------------------------------------------------
-- Enums de Postgres, no text+CHECK: dan tipos generados en TypeScript y un
-- error claro al insertar un valor inválido. Agregar un valor después es
-- ALTER TYPE ... ADD VALUE, sin reescribir la tabla.

-- Tenancy y usuarios
create type rol_usuario as enum ('admin', 'capturista');

-- Catálogo regulatorio
create type tipo_umbral as enum ('identificacion', 'aviso', 'efectivo');
-- La base del cálculo es un DATO, no un `if` en el motor. Art. 17 y Art. 32
-- usan bases distintas sobre el mismo monto, y cuál aplica a cuál está
-- pendiente de confirmación (docs/DECISIONES.md, POR CONFIRMAR-4).
create type base_calculo as enum ('sin_iva', 'con_iva');
create type aplica_persona as enum ('persona_fisica', 'persona_moral', 'ambas');
create type tipo_dato_campo as enum ('texto', 'fecha', 'monto', 'catalogo', 'documento');

-- Núcleo operativo
create type tipo_persona as enum ('fisica', 'moral');
create type control_beneficiario as enum ('participacion', 'control_efectivo');
create type estatus_expediente as enum ('incompleto', 'completo', 'aprobado');
create type resultado_aviso as enum ('no', 'individual', 'acumulacion');
create type tipo_alerta as enum (
  'proximidad', 'aviso_requerido', 'revision_identidad', 'screening', 'calendario'
);
create type estado_alerta as enum ('abierta', 'atendida');

-- Aviso. 'modificatorio' y '24h' NO se generan en v1, pero el tipo existe
-- desde hoy: el aviso de 24 horas se activa con las RCG y es event-driven.
-- Agregarlo después sería tocar un enum en uso.
create type tipo_aviso as enum ('normal', 'acumulacion', 'cero', 'modificatorio', '24h');
create type estatus_aviso as enum (
  'borrador', 'generado', 'validado', 'listo_revision', 'aprobado', 'presentado'
);

-- Esqueleto post-MVP (tablas vacías en v1)
create type nivel_riesgo as enum ('bajo', 'medio', 'alto');
create type sujeto_screening as enum ('cliente', 'beneficiario');
create type resultado_screening as enum ('sin_coincidencia', 'coincidencia');
create type resolucion_screening as enum ('pendiente', 'descartada', 'confirmada');
create type estado_caso as enum ('abierto', 'en_revision', 'cerrado');
create type objeto_sellado as enum ('manifiesto', 'aviso');
