-- VIZO — seed local (solo datos DEMO)
--
-- Se ejecuta después de las migraciones en cada `supabase db reset`.
--
-- EL CATÁLOGO REGULATORIO NO VIVE AQUÍ. Está en la migración
-- 20260806190057_seed_catalogo_regulatorio.sql, porque es dato de PRODUCCIÓN:
-- sin él el motor no puede evaluar nada, así que tiene que existir en el
-- proyecto remoto, no solo en la máquina de quien desarrolla.
--
-- Aquí van los datos demo para trabajar con la UI. Nunca datos de un cliente
-- real.

-- ---------------------------------------------------------------------------
-- Tenant demo y sus sucursales
-- ---------------------------------------------------------------------------
-- `fecha_alta_autoridad` en marzo, DOS MESES antes de la primera operación de
-- la demo: así se ve el caso que ese campo desbloquea —marzo y abril deben un
-- informe en cero aunque no haya nada capturado— en vez de esconderlo.
insert into tenants (id, rfc, razon_social, fecha_alta_autoridad, tipo_persona, domicilio) values (
  '00000000-0000-4000-8000-000000000001',
  'DPE010101AAA',
  'Desarrollos Península SA de CV',
  date '2026-03-09',
  'moral',
  '{"calle":"Prolongación Montejo","numero":"120","colonia":"Campestre","cp":"97120","municipio":"Mérida","estado":"Yucatán"}'::jsonb
);

-- El REC, con su designación ACEPTADA.
--
-- Aceptada y no pendiente a propósito: el obligado demo es el que hace las
-- cosas bien, y así el estado pendiente —que es el que enseña la consecuencia
-- del Art. 20 ¶2— se alcanza usando el portal, no viene precargado. Las fechas
-- son coherentes con el alta de marzo: se designa al darse de alta y el SAT
-- notifica dentro de los diez días hábiles del Art. 10 ¶3.
insert into designaciones_rec
  (tenant_id, rfc, nombre, estado, fecha_designacion, fecha_respuesta, fecha_notificacion_sat)
values (
  '00000000-0000-4000-8000-000000000001',
  -- CALM = Canto (C,A) + Lizárraga (L) + María (M), la regla del SAT.
  'CALM850312HN4', 'María Fernanda Canto Lizárraga',
  'aceptada', date '2026-03-09', date '2026-03-12', date '2026-03-20'
);

insert into sucursales (tenant_id, nombre, clave) values
  ('00000000-0000-4000-8000-000000000001', 'Matriz Mérida', 'MID'),
  ('00000000-0000-4000-8000-000000000001', 'Playa del Carmen', 'PDC');

-- El tenant realiza Fr. V Bis.
insert into actividades_tenant (tenant_id, actividad_id)
select '00000000-0000-4000-8000-000000000001', id
from actividades_vulnerables where fraccion = 'V_BIS';

-- ---------------------------------------------------------------------------
-- Usuarios demo: uno de cada rol
-- ---------------------------------------------------------------------------
-- Dos roles para poder demostrar la separación captura/aprobación, que es lo
-- regulatoriamente relevante. `tenant_id` y `rol` van en app_metadata: es lo
-- que lee RLS, y solo el servicio de Auth puede escribirlo. Ponerlos en
-- user_metadata los haría auto-asignables y por tanto inservibles.
--
-- Contraseña de ambos: vizo-demo-2026
--
-- OJO con las columnas de token: GoTrue las lee como texto y falla con
-- "Database error querying schema" si vienen en NULL. Por eso van en cadena
-- vacía y no se omiten. Es el tropiezo clásico de sembrar usuarios directo en
-- auth.users en vez de darlos de alta por la API.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  (
    '00000000-0000-4000-8000-00000000000a',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@vizo.mx', crypt('vizo-demo-2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-4000-8000-000000000001","rol":"admin"}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-4000-8000-00000000000b',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'capturista@vizo.mx', crypt('vizo-demo-2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-4000-8000-000000000001","rol":"capturista"}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a',
   'email', '{"sub":"00000000-0000-4000-8000-00000000000a","email":"admin@vizo.mx","email_verified":true}'::jsonb, now(), now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b',
   'email', '{"sub":"00000000-0000-4000-8000-00000000000b","email":"capturista@vizo.mx","email_verified":true}'::jsonb, now(), now());

insert into usuarios (id, tenant_id, rol, nombre, email) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'admin', 'Ana Rivera', 'admin@vizo.mx'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001', 'capturista', 'Carlos Pech', 'capturista@vizo.mx');

-- ---------------------------------------------------------------------------
-- Segundo tenant: existe para que el aislamiento sea demostrable
-- ---------------------------------------------------------------------------
-- Sin un segundo obligado con datos propios, "RLS funciona" es una afirmación
-- sin forma de comprobarse desde la UI.
insert into tenants (id, rfc, razon_social) values
  ('00000000-0000-4000-8000-000000000002', 'OTR020202BBB', 'Otro Desarrollador SA de CV');

insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
values (
  '00000000-0000-4000-8000-000000000002', 'moral', 'CLB030303CCC',
  'Cliente Privado del Otro Tenant SA', 'MX'
);

-- ---------------------------------------------------------------------------
-- Contraseña LOCAL del rol de aplicación
-- ---------------------------------------------------------------------------
-- La migración 018 crea `vizo_app` sin contraseña a propósito: una contraseña
-- en una migración queda en el repositorio y viaja a producción.
--
-- Esta línea vive en el seed porque el seed SOLO corre en local, igual que los
-- usuarios demo. En producción la contraseña se carga a mano una vez y nunca
-- toca el repositorio (ver docs/INFRA.md §5, pendiente 9).
alter role vizo_app with password 'vizo-local-dev';
