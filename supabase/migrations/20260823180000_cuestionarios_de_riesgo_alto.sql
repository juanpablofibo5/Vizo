-- ===========================================================================
-- Art. 23 Ter 3 — los cuestionarios de identificación para Grado de Riesgo alto
-- Acuerdo 115/2026, DOF 7-ago-2026 (código 5795797, edición vespertina).
-- Texto oficial: regulatorio/dof/acuerdo-115-2026.doc, SHA-256 19af24b3…
-- Exigible: 1 de marzo de 2027 (Transitorio Cuarto).
-- ===========================================================================
--
-- EL ARTÍCULO, ENTERO, PORQUE SON TRES PÁRRAFOS Y CADA UNO PIDE OTRA COSA
--
--   ¶1  «Cuando el Grado de Riesgo del Cliente o Usuaria sea alto, quien
--       realice la Actividad Vulnerable deberá requerir mayor información
--       sobre la ACTIVIDAD PREPONDERANTE de este, y realizar una revisión y
--       monitoreo más estricto al comportamiento transaccional […]»
--
--   ¶2  «deberá aplicar a sus Clientes […] que hayan catalogado con Grado de
--       Riesgo alto CONFORME A SU MANUAL DE POLÍTICAS INTERNAS, así como a los
--       Clientes […] NUEVOS clasificados como tal, CUESTIONARIOS DE
--       IDENTIFICACIÓN para obtener mayor información sobre el ORIGEN Y
--       DESTINO DE LOS RECURSOS y de los actos u operaciones QUE REALICEN O
--       QUE PRETENDAN LLEVAR A CABO.»
--
--   ¶3  «El cuestionario […] podrá realizarse vía remota, por medios digitales
--       o electrónicos, LOS CUALES en todo caso deberán contener la FIRMA
--       ELECTRÓNICA de quien los suscribe.»
--
-- ---------------------------------------------------------------------------
-- TRES LECTURAS QUE DECIDEN EL MODELO, Y DE DÓNDE SALE CADA UNA
-- ---------------------------------------------------------------------------
--
-- 1. «FIRMA ELECTRÓNICA» NO ES LA E.FIRMA DEL SAT. El propio Acuerdo define
--    las dos por separado en su Art. 3: la fr. VIII Ter es «Firma Electrónica»
--    —datos electrónicos que identifican al suscriptor y prueban que aprueba
--    el contenido, «conforme al CÓDIGO DE COMERCIO»— y la fr. VIII Quáter es
--    «Firma Electrónica Avanzada», que sí es «el certificado digital que
--    refiere el Código Fiscal». El ¶3 pide la PRIMERA.
--
--    Importa porque cambia la frontera: si pidiera la avanzada, VIZO no podría
--    tocarla (ALCANCE §0.3, no custodia e.firmas). Al ser la del Código de
--    Comercio, el cliente puede suscribir sin certificado del SAT. Aun así
--    VIZO NO produce ni valida la firma: registra su HUELLA, igual que hace
--    con el acuse del SPPLD. Si un mecanismo concreto alcanza el estándar del
--    Código de Comercio es una pregunta jurídica, y las preguntas jurídicas
--    van al especialista (ALCANCE §0.5).
--
-- 2. LA FIRMA ELECTRÓNICA LA EXIGE LA MODALIDAD REMOTA, NO EL CUESTIONARIO.
--    El «los cuales» del ¶3 se refiere a «los medios digitales o
--    electrónicos», no al cuestionario en abstracto. Un cuestionario aplicado
--    en persona y firmado de puño y letra no necesita Firma Electrónica: ya
--    tiene una autógrafa. Por eso la modalidad es una columna y el CHECK ata
--    la evidencia de firma SOLO a `remoto_digital`. Exigirla también en el
--    presencial sería inventar una obligación, que cuesta igual que omitirla.
--
-- 3. EL ARTÍCULO NO DA PLAZO DE VIGENCIA, ASÍ QUE AQUÍ NO HAY NINGUNO.
--    No dice cada cuánto se repite el cuestionario ni cuándo caduca. Lo que sí
--    dice es a QUIÉN se le aplica: a los catalogados de Grado alto y a los
--    nuevos clasificados como tal. Por eso el cuestionario CITA la evaluación
--    de riesgo que lo motivó (`evaluacion_riesgo_id`), y con eso el sistema
--    puede decir un hecho —«se aplicó sobre la clasificación del 3 de marzo, y
--    hay una clasificación más reciente»— sin llamarlo «vencido», que sería
--    una regla que nadie escribió. Si una reclasificación obliga a repetirlo
--    es POR CONFIRMAR con el especialista.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. La modalidad
-- ---------------------------------------------------------------------------
create type modalidad_cuestionario as enum (
  'presencial',      -- ¶3 por omisión: se aplica en persona, firma autógrafa
  'remoto_digital'   -- ¶3: «vía remota, por medios digitales o electrónicos»
);

-- ---------------------------------------------------------------------------
-- 2. El cuestionario
-- ---------------------------------------------------------------------------
create table cuestionarios_riesgo_alto (
  id         uuid primary key default gen_random_uuid(),
  -- `now()` es de la transacción, no del statement: dos cuestionarios
  -- asentados en la misma transacción tendrían el mismo timestamp y no habría
  -- forma de ordenarlos. La misma lección de `perfiles_transaccionales`.
  secuencia  bigserial not null,
  tenant_id  uuid not null references tenants(id),
  cliente_id uuid not null,

  -- El hecho que lo exige. La FK es COMPUESTA por la misma razón que en la
  -- aprobación: sin ella, un cuestionario podría citar la evaluación de riesgo
  -- de otra persona y la fila se vería impecable.
  evaluacion_riesgo_id uuid not null,

  modalidad        modalidad_cuestionario not null,
  fecha_aplicacion date not null,

  -- ¶1: la actividad preponderante. Es una obligación DISTINTA del ¶2 y por
  -- eso es su propia columna: el ¶1 la pide siempre que el grado sea alto,
  -- exista cuestionario o no.
  actividad_preponderante text not null,

  -- ¶2: los cuatro temas que el artículo NOMBRA. No son «las preguntas»: son
  -- el piso. Lo que el Manual añada vive en `respuestas_del_manual`.
  origen_recursos    text not null,
  destino_recursos   text not null,
  -- «los actos u operaciones QUE REALICEN O QUE PRETENDAN llevar a cabo». Son
  -- dos tiempos verbales distintos y por eso dos columnas: lo que ya hizo lo
  -- sabe el sistema, lo que PRETENDE hacer solo lo sabe el cliente, y es lo
  -- único de todo el capítulo que mira hacia adelante.
  actos_que_realiza  text not null,
  actos_que_pretende text not null,

  -- Lo que el obligado pregunte de más, «conforme a su Manual de Políticas
  -- Internas». VIZO no propone preguntas —mismo criterio que el ADR-21 con los
  -- factores de riesgo—: pone el registro, el obligado pone el criterio.
  respuestas_del_manual jsonb not null default '{}'::jsonb,

  -- ¶3: quién lo suscribe. Un cuestionario que nadie firmó no es evidencia de
  -- nada, así que el nombre es obligatorio en las dos modalidades.
  suscrito_por text not null,

  -- ¶3: la huella del documento firmado. VIZO no genera ni verifica la firma
  -- —registra que existe y cuál es—. Obligatoria solo en la modalidad remota,
  -- por la lectura 2 de arriba.
  firma_hash_sha256 text,
  firma_archivo     text,
  firma_tamano_bytes bigint,
  firma_mime        text,

  aplicado_por  uuid not null references usuarios(id),
  registrado_en timestamptz not null default now(),

  constraint cuestionario_cita_evaluacion_del_mismo_cliente
    foreign key (tenant_id, cliente_id, evaluacion_riesgo_id)
    references evaluaciones_riesgo (tenant_id, cliente_id, id),

  -- ¶3, hecho inexpresable: no se puede guardar un cuestionario remoto sin la
  -- huella de su Firma Electrónica.
  constraint remoto_exige_firma_electronica check (
    modalidad <> 'remoto_digital' or firma_hash_sha256 is not null
  ),

  -- Un hash tiene 64 hexadecimales. Un campo libre aquí acabaría con
  -- «pendiente» escrito dentro, y eso no es una huella.
  constraint firma_hash_es_sha256 check (
    firma_hash_sha256 is null or firma_hash_sha256 ~ '^[0-9a-f]{64}$'
  ),

  -- Los cuatro campos del archivo van juntos o no va ninguno: media evidencia
  -- es una fila que no se puede verificar.
  constraint evidencia_de_firma_completa check (
    (firma_hash_sha256 is null and firma_archivo is null
      and firma_tamano_bytes is null and firma_mime is null)
    or (firma_hash_sha256 is not null and firma_archivo is not null
      and firma_tamano_bytes is not null and firma_mime is not null)
  ),

  -- Las respuestas del piso no pueden ser espacios en blanco: `not null` deja
  -- pasar la cadena vacía, y una cadena vacía es un hueco que se ve lleno.
  constraint respuestas_del_piso_no_vacias check (
    length(btrim(actividad_preponderante)) > 0
    and length(btrim(origen_recursos)) > 0
    and length(btrim(destino_recursos)) > 0
    and length(btrim(actos_que_realiza)) > 0
    and length(btrim(actos_que_pretende)) > 0
    and length(btrim(suscrito_por)) > 0
  )
);

comment on table cuestionarios_riesgo_alto is
  'Art. 23 Ter 3 del Acuerdo 115/2026. Append-only. Las cinco respuestas del '
  'piso son las que el artículo nombra; lo que el Manual añada va en '
  'respuestas_del_manual. La Firma Electrónica del ¶3 se guarda como huella, '
  'no se produce ni se valida: es del Código de Comercio (Art. 3 fr. VIII '
  'Ter), no la e.firma del SAT (fr. VIII Quáter).';

create index on cuestionarios_riesgo_alto (tenant_id, cliente_id, secuencia desc);

-- ---------------------------------------------------------------------------
-- 3. Append-only
-- ---------------------------------------------------------------------------
-- Corregir un cuestionario es aplicar otro, igual que con el perfil y la
-- declaración PEP. Lo que se le enseñó a la autoridad no se edita.
create or replace function app.cuestionario_append_only()
returns trigger language plpgsql as $$
begin
  raise exception using
    errcode = 'check_violation',
    message = 'Los cuestionarios del Art. 23 Ter 3 no se editan ni se borran.',
    hint    = 'Para corregir, aplica un cuestionario nuevo: el historial es la evidencia.';
end $$;

create trigger cuestionarios_append_only
  before update or delete on cuestionarios_riesgo_alto
  for each row execute function app.cuestionario_append_only();

-- ---------------------------------------------------------------------------
-- 4. La coherencia que la FK no alcanza
-- ---------------------------------------------------------------------------
create or replace function app.cuestionario_coherente()
returns trigger language plpgsql as $$
declare
  v_es_alto boolean;
  v_evaluado date;
begin
  -- El disparador del artículo es «Grado de Riesgo alto». Un cuestionario
  -- citando una evaluación que NO clasificó alto diría que el Art. 23 Ter 3
  -- lo exigía cuando no lo exigía — y esa fila se defendería sola ante la
  -- autoridad hasta que alguien leyera la evaluación citada.
  select g.es_alto, e.evaluado_en::date
    into v_es_alto, v_evaluado
    from evaluaciones_riesgo e
    join grados_riesgo g on g.id = e.grado_id
   where e.id = new.evaluacion_riesgo_id;

  if not coalesce(v_es_alto, false) then
    raise exception using
      errcode = 'check_violation',
      message = 'La evaluación citada no clasificó al cliente con Grado de Riesgo alto.',
      hint    = 'El Art. 23 Ter 3 se dispara con el grado alto. Cita la evaluación que lo determinó.';
  end if;

  -- El cuestionario responde a una clasificación: no puede ser anterior a
  -- ella. Una fecha previa no es un error de captura menor — invierte la
  -- causa, y el documento diría que se preguntó por algo que aún no pasaba.
  if new.fecha_aplicacion < v_evaluado then
    raise exception using
      errcode = 'check_violation',
      message = 'El cuestionario no puede aplicarse antes de la clasificación que lo exige.',
      hint    = format('La evaluación citada es del %s.', v_evaluado);
  end if;

  return new;
end $$;

-- INMEDIATO, no diferido. La declaración PEP necesita diferir porque su
-- coherencia depende de vínculos que se insertan después, en la misma
-- transacción. Aquí no: el cuestionario cita una evaluación que YA existe, así
-- que no hay nada que esperar. Diferirlo tenía además un costo real —el error
-- llegaba en el commit y no en el INSERT, y la capa de persistencia no podía
-- decir cuál fila lo causó—. La primera versión lo difería por copiar el
-- patrón de al lado sin preguntarse si aplicaba; lo delató la aserción 2, que
-- pasó cuando no debía.
create trigger cuestionario_coherente
  after insert on cuestionarios_riesgo_alto
  for each row execute function app.cuestionario_coherente();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table cuestionarios_riesgo_alto enable row level security;

create policy "ver los cuestionarios de mi obligado" on cuestionarios_riesgo_alto
  for select to authenticated using (tenant_id = app.tenant_id());

create policy "admin aplica el cuestionario" on cuestionarios_riesgo_alto
  for insert to authenticated
  with check (tenant_id = app.tenant_id() and app.es_admin());

grant select, insert on cuestionarios_riesgo_alto to authenticated;
grant usage, select on sequence cuestionarios_riesgo_alto_secuencia_seq to authenticated;

select app.verificar_privilegios_por_omision();

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
-- Cada una intenta guardar una fila que el artículo no permite. Si alguna
-- entra, la migración muere aquí y no en producción.
do $$
declare
  v_tenant uuid; v_user uuid; v_cliente uuid; v_otro uuid;
  v_modelo uuid; v_alto uuid; v_medio uuid; v_elem uuid;
  v_eval_alta uuid; v_eval_media uuid; v_eval_otro uuid;
  v_cuest uuid; v_rechazo boolean;
  v_hoy date := date '2027-04-10';
  v_hash text := repeat('a', 64);
begin
  insert into tenants (rfc, razon_social, tipo_persona)
  values ('CUE270401AB1', 'Aserción cuestionarios', 'moral') returning id into v_tenant;

  insert into auth.users (id, instance_id, aud, role, email)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'asercion-cuestionario@ejemplo.mx')
  returning id into v_user;
  insert into usuarios (id, tenant_id, rol, nombre, email)
  values (v_user, v_tenant, 'admin', 'Aserción Cuestionario', 'asercion-cuestionario@ejemplo.mx');

  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'CUAA800101AA1', 'Cliente Alto de Aserción', 'MX')
  returning id into v_cliente;
  insert into clientes_finales (tenant_id, tipo_persona, rfc, nombre_o_razon_social, nacionalidad)
  values (v_tenant, 'fisica', 'CUBB800101BB2', 'Cliente Ajeno de Aserción', 'MX')
  returning id into v_otro;

  -- La escala y el modelo del obligado. El grado más bajo arranca en 0 porque
  -- `app.escala_de_riesgo_monotona()` lo exige desde la migración del Cap. III
  -- Bis: un puntaje por debajo del mínimo no tendría grado que le corresponda.
  -- Lo descubrió esta migración al correr, que es para lo que sirve esa guarda.
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'bajo', 'Bajo', 1, false, 0, v_hoy - 60);
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'medio', 'Medio', 2, false, 35, v_hoy - 60) returning id into v_medio;
  insert into grados_riesgo (tenant_id, clave, nombre, orden, es_alto, puntaje_minimo, vigente_desde)
  values (v_tenant, 'alto', 'Alto', 3, true, 70, v_hoy - 60) returning id into v_alto;
  insert into modelos_riesgo (tenant_id, version) values (v_tenant, 1) returning id into v_modelo;
  select id into v_elem from elementos_riesgo where clave = 'tipo_cliente';
  insert into factores_modelo (tenant_id, modelo_id, elemento_id, factor, peso)
  values (v_tenant, v_modelo, v_elem, 'Aserción', 80);
  update modelos_riesgo set estado = 'vigente', vigente_desde = v_hoy - 60,
         aprobado_por = v_user, aprobado_en = now() where id = v_modelo;

  insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                   factores_aplicados, evaluado_por, evaluado_en, vence)
  values (v_tenant, v_cliente, v_modelo, v_alto, 80, '[]'::jsonb, v_user, v_hoy - 10, v_hoy + 170)
  returning id into v_eval_alta;
  insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                   factores_aplicados, evaluado_por, evaluado_en, vence)
  values (v_tenant, v_cliente, v_modelo, v_medio, 40, '[]'::jsonb, v_user, v_hoy - 9, v_hoy + 171)
  returning id into v_eval_media;
  insert into evaluaciones_riesgo (tenant_id, cliente_id, modelo_id, grado_id, puntaje,
                                   factores_aplicados, evaluado_por, evaluado_en, vence)
  values (v_tenant, v_otro, v_modelo, v_alto, 80, '[]'::jsonb, v_user, v_hoy - 10, v_hoy + 170)
  returning id into v_eval_otro;

  -- ── 1. El camino feliz entra ──────────────────────────────────────────
  insert into cuestionarios_riesgo_alto
    (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
     actividad_preponderante, origen_recursos, destino_recursos,
     actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por)
  values (v_tenant, v_cliente, v_eval_alta, 'presencial', v_hoy,
          'Comercio al por mayor de materiales', 'Venta de un inmueble previo',
          'Adquisición de vivienda', 'Una compraventa en 2027',
          'Dos compraventas más en el año', 'Cliente Alto de Aserción', v_user)
  returning id into v_cuest;
  assert v_cuest is not null, 'ASERCIÓN 1: el cuestionario válido no se guardó';

  -- ── 2. Citando una evaluación que NO clasificó alto ───────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por)
    values (v_tenant, v_cliente, v_eval_media, 'presencial', v_hoy,
            'a', 'b', 'c', 'd', 'e', 'f', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 2: se guardó un cuestionario sobre una clasificación que no era alta';

  -- ── 3. Citando la evaluación de OTRO cliente ──────────────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por)
    values (v_tenant, v_cliente, v_eval_otro, 'presencial', v_hoy,
            'a', 'b', 'c', 'd', 'e', 'f', v_user);
  exception when foreign_key_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 3: un cuestionario citó la evaluación de otro cliente';

  -- ── 4. ¶3: remoto SIN Firma Electrónica ───────────────────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por)
    values (v_tenant, v_cliente, v_eval_alta, 'remoto_digital', v_hoy,
            'a', 'b', 'c', 'd', 'e', 'f', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 4: se guardó un cuestionario remoto sin Firma Electrónica (¶3)';

  -- ── 5. Una huella que no es un SHA-256 ────────────────────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por,
       firma_hash_sha256, firma_archivo, firma_tamano_bytes, firma_mime)
    values (v_tenant, v_cliente, v_eval_alta, 'remoto_digital', v_hoy,
            'a', 'b', 'c', 'd', 'e', 'f', v_user,
            'pendiente', 'cuestionario.pdf', 1024, 'application/pdf');
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 5: se guardó «pendiente» como huella de la firma';

  -- ── 6. Media evidencia: hash sin archivo ──────────────────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por,
       firma_hash_sha256)
    values (v_tenant, v_cliente, v_eval_alta, 'remoto_digital', v_hoy,
            'a', 'b', 'c', 'd', 'e', 'f', v_user, v_hash);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 6: se guardó media evidencia de firma';

  -- ── 7. Una respuesta del piso en blanco ───────────────────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por)
    values (v_tenant, v_cliente, v_eval_alta, 'presencial', v_hoy,
            '   ', 'b', 'c', 'd', 'e', 'f', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 7: se guardó una respuesta obligatoria en blanco';

  -- ── 8. Aplicado ANTES de la clasificación que lo exige ────────────────
  v_rechazo := false;
  begin
    insert into cuestionarios_riesgo_alto
      (tenant_id, cliente_id, evaluacion_riesgo_id, modalidad, fecha_aplicacion,
       actividad_preponderante, origen_recursos, destino_recursos,
       actos_que_realiza, actos_que_pretende, suscrito_por, aplicado_por)
    values (v_tenant, v_cliente, v_eval_alta, 'presencial', v_hoy - 30,
            'a', 'b', 'c', 'd', 'e', 'f', v_user);
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 8: un cuestionario se aplicó antes de la clasificación que lo motiva';

  -- ── 9 y 10. Append-only ───────────────────────────────────────────────
  v_rechazo := false;
  begin
    update cuestionarios_riesgo_alto set origen_recursos = 'otra cosa' where id = v_cuest;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 9: se editó un cuestionario ya asentado';

  v_rechazo := false;
  begin
    delete from cuestionarios_riesgo_alto where id = v_cuest;
  exception when check_violation then v_rechazo := true;
  end;
  assert v_rechazo, 'ASERCIÓN 10: se borró un cuestionario ya asentado';

  raise notice 'Cuestionarios del Art. 23 Ter 3: 10 aserciones en verde.';
  raise exception using errcode = 'GUARD', message = 'aserciones ok, se revierte';
exception
  when sqlstate 'GUARD' then null;
end $$;
