-- ---------------------------------------------------------------------------
-- Obligado de demo para fideicomisos · pasos que corre una persona
-- ---------------------------------------------------------------------------
-- Editor SQL de Supabase, proyecto **vizo** (`qmlmoyvjdejklkfussza`).
--
-- DOS LECCIONES DEL PRIMER INTENTO (20-ago-2026), y por eso este archivo se
-- reescribió:
--
--   1. NO uses `begin;` / `commit;` aquí. El editor de Supabase ya envuelve lo
--      que corres en su propia transacción; un `begin` anidado hace que el
--      `commit` cierre la transacción equivocada y, si algo falla después, se
--      revierte todo sin que el error sea evidente. La primera corrida no dejó
--      absolutamente nada y el editor no lo dijo.
--
--   2. Cada paso TERMINA CON UN SELECT, a propósito. Un `DELETE` o un `UPDATE`
--      sin `RETURNING` hacen que el editor diga «Success. No rows returned»
--      tanto si tocó seis filas como si no tocó ninguna — es indistinguible del
--      fracaso. El SELECT final obliga al editor a mostrar el estado real.
--
-- Corre un paso a la vez y lee el resultado antes de seguir.
--
-- ---------------------------------------------------------------------------
-- PASO 1 · Terminar de reubicar la estructura de muestra
-- ---------------------------------------------------------------------------
-- (Los integrantes ya se borraron en el intento anterior.)
delete from estructura_del_obligado
 where tenant_id = (select id from tenants where rfc = 'DPE010101AAA');

-- Sin estructura colgando, el trigger `tenant_tipo_persona_coherente` ya no
-- tiene nada que objetar y el obligado puede volver a ser persona moral.
update tenants set tipo_persona = 'moral' where rfc = 'DPE010101AAA';

select razon_social, tipo_persona,
       (select count(*) from estructura_del_obligado) as figuras,
       (select count(*) from integrantes_estructura) as integrantes
  from tenants where rfc = 'DPE010101AAA';
-- ESPERADO: Desarrollos Península SA de CV · moral · 0 · 0

-- ---------------------------------------------------------------------------
-- PASO 2 · El obligado nuevo: un fideicomiso de verdad, no una moral
--          reetiquetada
-- ---------------------------------------------------------------------------
-- Los mismos datos que `supabase/seed.sql` siembra en local, para que la demo
-- local y la de producción enseñen lo mismo.
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

select t.razon_social, t.tipo_persona,
       (select count(*) from actividades_tenant a where a.tenant_id = t.id) as actividades,
       (select count(*) from sucursales s where s.tenant_id = t.id) as sucursales,
       (select count(*) from designaciones_rec d where d.tenant_id = t.id) as rec
  from tenants t where t.id = '00000000-0000-4000-8000-000000000003';
-- ESPERADO: Fideicomiso Península F/1847-2020 · fideicomiso · 1 · 1 · 1

-- ---------------------------------------------------------------------------
-- PASO 3 · El acceso — ESTO NO ES SQL
-- ---------------------------------------------------------------------------
-- En el panel de Supabase: Authentication → Users → Add user → Create new user
--   correo:     fideicomiso@vizo.mx
--   contraseña: la que tú elijas (NO la del seed local, que está en el repo)
--   marca «Auto Confirm User»
--
-- La contraseña se escribe ahí y no en un archivo. Por eso este paso no está
-- automatizado.

-- ---------------------------------------------------------------------------
-- PASO 4 · Conectar el acceso con su obligado
-- ---------------------------------------------------------------------------
-- El panel no escribe el tenant ni el rol, y eso es lo único que RLS lee.
update auth.users
   set raw_app_meta_data = raw_app_meta_data
     || '{"tenant_id":"00000000-0000-4000-8000-000000000003","rol":"admin"}'::jsonb
 where email = 'fideicomiso@vizo.mx';

insert into usuarios (id, tenant_id, rol, nombre, email)
select id, '00000000-0000-4000-8000-000000000003', 'admin', 'Lucía Sansores', email
  from auth.users where email = 'fideicomiso@vizo.mx';

select u.email, u.rol, u.tenant_id,
       (select raw_app_meta_data->>'tenant_id' from auth.users a where a.id = u.id) as tenant_en_jwt,
       (select raw_app_meta_data->>'rol' from auth.users a where a.id = u.id) as rol_en_jwt
  from usuarios u where u.email = 'fideicomiso@vizo.mx';
-- ESPERADO: una fila, con tenant_en_jwt y rol_en_jwt LLENOS.
-- Si sale vacío, el usuario del paso 3 no se creó: vuelve al panel.

-- ---------------------------------------------------------------------------
-- PASO 5 · Sembrar la estructura, ya no aquí
-- ---------------------------------------------------------------------------
-- En la terminal del repositorio:
--
--     pnpm demo:datos:remoto
--
-- Siembra la estructura del Anexo 2 Bis por el camino real de la aplicación,
-- para que la bitácora tenga los eventos que tendría en la vida real. Debe
-- imprimir «Fideicomiso demo: estructura del Anexo 2 Bis con 5 integrantes
-- enviados al SAT».

-- ---------------------------------------------------------------------------
-- PASO 6 · Comprobación final
-- ---------------------------------------------------------------------------
select t.razon_social, t.tipo_persona,
       (select count(*) from estructura_del_obligado e where e.tenant_id = t.id) as figuras,
       (select count(*) from integrantes_estructura i where i.tenant_id = t.id) as integrantes,
       (select count(*) from usuarios u where u.tenant_id = t.id) as usuarios
  from tenants t order by t.created_at;
-- ESPERADO:
--   Desarrollos Península SA de CV     · moral       · 0 · 0 · 2
--   Fideicomiso Península F/1847-2020  · fideicomiso · 1 · 5 · 1
