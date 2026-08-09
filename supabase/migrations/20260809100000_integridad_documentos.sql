-- VIZO · Migración 017 — El documento no puede mentir sobre qué es ni a qué reemplaza
--
-- HALLAZGOS DE LA AUDITORÍA DE LA SEMANA 6.
--
-- `registrarDocumento` recibía `campo` y `reemplaza_a` y los guardaba sin
-- contrastarlos con nada. Tres consecuencias, todas comprobadas contra la base
-- local con el código real, y las tres silenciosas:
--
--   H1. Un campo con typo ('identificacion_oficia') se aceptaba, se guardaba y
--       se mostraba en la lista de documentos. El expediente seguía pidiendo
--       'identificacion_oficial'. Quien captura sube el archivo correcto y el
--       sistema le dice que sigue faltando, sin decir por qué.
--
--   H2. Un 'comprobante_domicilio' podía declarar que reemplaza a la
--       'identificacion_oficial'. La identificación quedaba marcada como
--       reemplazada, dejaba de cubrir su campo, y un requisito que estaba
--       cumplido RETROCEDÍA sin que nada lo anunciara.
--
--   H3. Peor: `reemplaza_a` podía apuntar a un documento de OTRO expediente
--       del mismo obligado. Subir un archivo al expediente del cliente A
--       descubría un hueco en el del cliente B.
--
-- Ninguna lanzaba excepción. Las tres dejaban el expediente en un estado
-- plausible y equivocado — el modo de falla de la regla dura 6, esta vez sobre
-- lo que se defiende ante una visita.
--
-- Se cierran en el NIVEL 2 del orden de preferencia de CLAUDE.md: que lo
-- impida la base, para que no dependa de que alguien llame a la función
-- correcta. `registrarDocumento` además valida antes, para dar un mensaje que
-- diga qué hacer; pero si esa capa se salta, la base sigue diciendo que no.

-- ---------------------------------------------------------------------------
-- 1. Un reemplazo es del MISMO expediente y del MISMO campo (H2 y H3)
-- ---------------------------------------------------------------------------
-- Se resuelve con una llave foránea compuesta, no con un trigger: es
-- declarativo, lo aplica el motor y no hay forma de rodearlo.
--
-- Cuando `reemplaza_a` es NULL la restricción no aplica (MATCH SIMPLE), que es
-- justo lo que se quiere: un documento nuevo no reemplaza a nadie.
alter table documentos
  add constraint documentos_expediente_campo_id_unico
  unique (tenant_id, expediente_id, campo, id);

alter table documentos
  add constraint documentos_reemplaza_mismo_campo
  foreign key (tenant_id, expediente_id, campo, reemplaza_a)
  references documentos (tenant_id, expediente_id, campo, id);

-- Un documento tampoco puede reemplazarse a sí mismo: se autoexcluiría de la
-- completitud y el campo quedaría descubierto con el archivo ahí, presente.
alter table documentos
  add constraint documentos_no_se_reemplaza_a_si_mismo
  check (reemplaza_a is null or reemplaza_a <> id);

-- ---------------------------------------------------------------------------
-- 2. El campo tiene que existir en el catálogo de la actividad (H1)
-- ---------------------------------------------------------------------------
-- Aquí una FK no sirve: `campos_expediente` está versionada por vigencia y su
-- llave es (actividad, aplica_a, campo, vigente_desde), así que `campo` no es
-- único por sí solo. Va como trigger.
--
-- Se comprueba la EXISTENCIA en la actividad, no la vigencia a la fecha de
-- hoy: un documento que satisface un campo cuya vigencia ya cerró sigue siendo
-- evidencia histórica legítima, y rechazarlo borraría la posibilidad de
-- reconstruir un expediente como se integró en su momento.
create or replace function app.validar_campo_de_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actividad uuid;
  v_validos   text;
begin
  select e.actividad_id into v_actividad
    from public.expedientes e
   where e.id = new.expediente_id;

  if not exists (
    select 1 from public.campos_expediente c
     where c.actividad_id = v_actividad
       and c.campo = new.campo
  ) then
    select string_agg(distinct c.campo, ', ' order by c.campo) into v_validos
      from public.campos_expediente c
     where c.actividad_id = v_actividad
       and c.tipo_dato = 'documento';

    raise exception
      'El campo "%" no existe en el catálogo del expediente de esta actividad. Válidos: %',
      new.campo, coalesce(v_validos, '(el catálogo está vacío)')
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger documentos_campo_del_catalogo
  before insert on documentos
  for each row execute function app.validar_campo_de_documento();

-- ---------------------------------------------------------------------------
-- 3. Aserción
-- ---------------------------------------------------------------------------
do $$
declare
  v_faltan text;
begin
  select string_agg(nombre, ', ') into v_faltan
    from (values
      ('documentos_reemplaza_mismo_campo'),
      ('documentos_no_se_reemplaza_a_si_mismo'),
      ('documentos_expediente_campo_id_unico')
    ) as t(nombre)
   where not exists (
     select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.documentos'::regclass and conname = t.nombre
   );
  if v_faltan is not null then
    raise exception 'Faltan restricciones de integridad en documentos: %', v_faltan;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.documentos'::regclass
       and tgname = 'documentos_campo_del_catalogo'
       and not tgisinternal
  ) then
    raise exception 'Falta el trigger que valida el campo contra el catálogo';
  end if;

  raise notice 'Integridad de documentos: OK. Reemplazo acotado a mismo expediente y campo; campo validado contra el catálogo.';
end;
$$;
