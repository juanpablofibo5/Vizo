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
-- Obligado de demo que actúa por FIDEICOMISO (Cap. II Ter)
-- ---------------------------------------------------------------------------
-- Existe aparte, y no reetiquetando al obligado moral, por una razón que el
-- propio Acuerdo impone: la clase de persona decide QUÉ ANEXO le corresponde
-- —el 2 para una moral, el 2 Bis para un fideicomiso— y con qué e.firma hace
-- su trámite (Art. 4 ¶3). Un obligado que cambia de clase no es el mismo
-- obligado con otra etiqueta; por eso la migración
-- 20260819120000 impide el cambio cuando ya hay estructura registrada.
--
-- La razón social lo dice sin ambigüedad: es un fideicomiso, no una SA de CV.
-- Su estructura del Anexo 2 Bis la siembra `scripts/datos-demo.ts` por el
-- camino real de la aplicación, para que la bitácora tenga los eventos que
-- tendría en la vida real.
insert into tenants (id, rfc, razon_social, fecha_alta_autoridad, tipo_persona, domicilio) values (
  '00000000-0000-4000-8000-000000000003',
  'FPE200315J47',
  'Fideicomiso Península F/1847-2020',
  date '2026-03-09',
  'fideicomiso',
  '{"calle":"Calle 21","numero":"302","colonia":"Itzimná","cp":"97100","municipio":"Mérida","estado":"Yucatán"}'::jsonb
);

-- También realiza Fr. V Bis: es un fideicomiso de desarrollo inmobiliario, el
-- caso típico del corredor Cancún–Tulum.
insert into actividades_tenant (tenant_id, actividad_id)
select '00000000-0000-4000-8000-000000000003', id
from actividades_vulnerables where fraccion = 'V_BIS';

insert into sucursales (tenant_id, nombre, clave) values
  ('00000000-0000-4000-8000-000000000003', 'Oficina del fideicomiso', 'FID');

-- Art. 20 LFPIORPI ¶1: quienes actúan por fideicomiso también designan REC.
insert into designaciones_rec
  (tenant_id, rfc, nombre, estado, fecha_designacion, fecha_respuesta, fecha_notificacion_sat)
values (
  '00000000-0000-4000-8000-000000000003',
  'SACL820430D12', 'Lucía Fernanda Sansores Cámara',
  'aceptada', date '2026-03-09', date '2026-03-11', date '2026-03-19'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-4000-8000-00000000000c',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'fideicomiso@vizo.mx', crypt('vizo-demo-2026', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-4000-8000-000000000003","rol":"admin"}'::jsonb,
  '{}'::jsonb,
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000c',
  'email', '{"sub":"00000000-0000-4000-8000-00000000000c","email":"fideicomiso@vizo.mx","email_verified":true}'::jsonb, now(), now());

insert into usuarios (id, tenant_id, rol, nombre, email) values
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000003',
   'admin', 'Lucía Sansores', 'fideicomiso@vizo.mx');

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
