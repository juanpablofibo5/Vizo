-- ---------------------------------------------------------------------------
-- Obligado de demo para fideicomisos · pasos que corre una persona
-- ---------------------------------------------------------------------------
-- Correr UNA vez en el editor SQL de Supabase (proyecto vizo, producción).
--
-- Por qué no lo corrió el agente:
--   · el bloque 1 BORRA datos de producción, y esa decisión es del dueño;
--   · el bloque 3 crea un acceso con contraseña, y las credenciales no pasan
--     por el agente. La contraseña la eliges y la escribes tú.
--
-- Después de esto, la estructura del Anexo 2 Bis se siembra por el camino real
-- de la aplicación con:
--
--     pnpm demo:datos:remoto
--
-- ---------------------------------------------------------------------------
-- 1. Reubicar: quitar del obligado MORAL la estructura de muestra
-- ---------------------------------------------------------------------------
-- Son 1 figura y 6 integrantes capturados el 19-ago-2026 como demostración.
-- La bitácora NO se toca: es append-only y registra que esto ocurrió, que es
-- justamente lo que debe conservarse.
begin;

delete from integrantes_estructura
 where tenant_id = (select id from tenants where rfc = 'DPE010101AAA');

delete from estructura_del_obligado
 where tenant_id = (select id from tenants where rfc = 'DPE010101AAA');

-- Ahora sí puede volver a ser persona moral: sin estructura colgando, el
-- trigger `tenant_tipo_persona_coherente` no tiene nada que objetar.
update tenants set tipo_persona = 'moral' where rfc = 'DPE010101AAA';

commit;

-- ---------------------------------------------------------------------------
-- 2. El obligado nuevo: un fideicomiso de verdad, no una moral reetiquetada
-- ---------------------------------------------------------------------------
-- Los mismos datos que `supabase/seed.sql` siembra en local, para que la demo
-- local y la de producción enseñen lo mismo.
begin;

insert into tenants (id, rfc, razon_social, fecha_alta_autoridad, tipo_persona, domicilio) values (
  '00000000-0000-4000-8000-000000000003',
  'FPE200315J47',
  'Fideicomiso Península F/1847-2020',
  date '2026-03-09',
  'fideicomiso',
  '{"calle":"Calle 21","numero":"302","colonia":"Itzimná","cp":"97100","municipio":"Mérida","estado":"Yucatán"}'::jsonb
);

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

commit;

-- ---------------------------------------------------------------------------
-- 3. El acceso · CAMBIA LA CONTRASEÑA ANTES DE CORRER
-- ---------------------------------------------------------------------------
-- Sustituye PON-AQUI-TU-CONTRASENA por una que elijas tú. No uses la del seed
-- local (`vizo-demo-2026`): esa está en el repositorio.
--
-- El UUID es fijo a propósito — `scripts/datos-demo.ts` lo usa para sembrar la
-- estructura por el camino real. Si creas el usuario desde el panel de
-- Supabase en vez de aquí, el UUID sería aleatorio y el script no lo hallaría.
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-4000-8000-00000000000c',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'fideicomiso@vizo.mx', crypt('PON-AQUI-TU-CONTRASENA', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"],"tenant_id":"00000000-0000-4000-8000-000000000003","rol":"admin"}'::jsonb,
  '{}'::jsonb,
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000c',
  'email', '{"sub":"00000000-0000-4000-8000-00000000000c","email":"fideicomiso@vizo.mx","email_verified":true}'::jsonb,
  now(), now());

insert into usuarios (id, tenant_id, rol, nombre, email) values
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000003',
   'admin', 'Lucía Sansores', 'fideicomiso@vizo.mx');

commit;

-- ---------------------------------------------------------------------------
-- 4. Comprobación
-- ---------------------------------------------------------------------------
select t.razon_social, t.tipo_persona,
       (select count(*) from estructura_del_obligado e where e.tenant_id = t.id) as figuras,
       (select count(*) from usuarios u where u.tenant_id = t.id) as usuarios
  from tenants t order by t.created_at;
-- Se espera: Desarrollos Península → moral, 0 figuras
--            Fideicomiso Península  → fideicomiso, 0 figuras (las siembra
--                                     `pnpm demo:datos:remoto`), 1 usuario
