-- ---------------------------------------------------------------------------
-- Obligado de demo para fideicomisos · pasos que corre una persona
-- ---------------------------------------------------------------------------
-- Editor SQL de Supabase, proyecto vizo (producción). Los bloques van en orden
-- y cada uno se corre por separado.
--
-- Por qué no los corrió el agente: el bloque 1 BORRA datos de producción, y esa
-- decisión es del dueño. La contraseña del acceso nunca aparece aquí — se
-- escribe en el panel de Supabase (paso 3 del instructivo), que es su lugar.
--
-- ---------------------------------------------------------------------------
-- BLOQUE 1 · Reubicar: quitar del obligado MORAL la estructura de muestra
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
-- BLOQUE 2 · El obligado nuevo: un fideicomiso de verdad, no una moral
--            reetiquetada
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
-- BLOQUE 3 · Conectar el acceso con su obligado
-- ---------------------------------------------------------------------------
-- ANTES de correr esto, crea el usuario en el panel:
--   Authentication → Users → Add user
--   correo: fideicomiso@vizo.mx · contraseña: la que tú elijas
--   (marca «Auto Confirm User»)
--
-- Este bloque hace las dos cosas que el panel NO hace y que RLS necesita:
-- pone el tenant y el rol en app_metadata —lo único que RLS lee, y que solo el
-- servicio de Auth puede escribir— y da de alta el perfil legible en `usuarios`.
begin;

update auth.users
   set raw_app_meta_data = raw_app_meta_data
     || '{"tenant_id":"00000000-0000-4000-8000-000000000003","rol":"admin"}'::jsonb
 where email = 'fideicomiso@vizo.mx';

insert into usuarios (id, tenant_id, rol, nombre, email)
select id, '00000000-0000-4000-8000-000000000003', 'admin', 'Lucía Sansores', email
  from auth.users where email = 'fideicomiso@vizo.mx';

commit;

-- ---------------------------------------------------------------------------
-- BLOQUE 4 · Comprobación
-- ---------------------------------------------------------------------------
select t.razon_social,
       t.tipo_persona,
       (select count(*) from estructura_del_obligado e where e.tenant_id = t.id) as figuras,
       (select count(*) from usuarios u where u.tenant_id = t.id) as usuarios
  from tenants t order by t.created_at;

-- Se espera:
--   Desarrollos Península SA de CV      · moral       · 0 figuras · 2 usuarios
--   Fideicomiso Península F/1847-2020   · fideicomiso · 0 figuras · 1 usuario
--
-- Las figuras siguen en 0 a propósito: la estructura del Anexo 2 Bis la siembra
-- `pnpm demo:datos:remoto` por el camino real de la aplicación, para que la
-- bitácora tenga los eventos que tendría en la vida real.
