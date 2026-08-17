-- ---------------------------------------------------------------------------
-- Los catorce apartados del Manual, como dato
-- ---------------------------------------------------------------------------
-- ADR-20, issue #18. Art. 37 Bis del Acuerdo 115/2026: el Manual de Políticas
-- Internas «deberá contener, por lo menos» catorce cosas.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LAS DOS FECHAS, QUE NO SON LA MISMA
-- ────────────────────────────────────────────────────────────────────────────
--   · El Art. 37 Bis entra con la vigencia general: **30 de noviembre de 2026**
--     (Transitorio Primero; no está en ninguna excepción).
--   · La obligación de TENERLO corre por dos vías: a los **90 días naturales**
--     del alta (Art. 37), y para quien ya estaba registrado y cumplió ese
--     plazo, **a partir del 1 de marzo de 2027** (Transitorio Tercero).
--
-- El catálogo versiona lo primero —qué debe contener— porque es lo que este
-- sistema genera. Cuándo le toca a cada obligado es una cuenta sobre su fecha
-- de alta, que ya vive en `tenants.fecha_alta_autoridad`.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ESTO ES CATÁLOGO Y NO UN `switch` DE CATORCE CASOS
-- ────────────────────────────────────────────────────────────────────────────
-- Regla dura 1. Pero además hay una razón de producto: hoy VIZO acredita siete
-- apartados y los otros siete salen como hueco. Cuando se construya el Cap. III
-- Bis, el apartado II pasa de hueco a acreditado — y eso tiene que ser un
-- `update` de una fila, no una reescritura del generador.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LA REGLA QUE ESTA TABLA HACE INEXPRESABLE (ADR-20)
-- ────────────────────────────────────────────────────────────────────────────
-- «VIZO no emite una sola frase que no pueda respaldar con un dato del sistema.»
--
-- Aquí eso se traduce en que un apartado acreditado SIN consulta de evidencia
-- no se puede escribir, y un hueco sin explicación y sin preguntas tampoco. Los
-- CHECK de abajo lo impiden: no hay forma de sembrar un apartado que prometa
-- prosa sin decir de dónde sale.

create type origen_apartado as enum (
  'acreditado',          -- VIZO lo demuestra entero, con evidencia del sistema
  'acreditado_parcial',  -- VIZO demuestra una parte; el resto lo pone el obligado
  'del_obligado'         -- ocurre fuera de VIZO: sale como hueco, nunca como prosa
);

create table apartados_manual (
  id            uuid primary key default gen_random_uuid(),
  fraccion      text not null,          -- 'I' … 'XIV', como el artículo
  orden         int  not null,
  -- El texto LITERAL de la fracción. No una paráfrasis: lo que el obligado
  -- entrega tiene que poder cotejarse contra el DOF palabra por palabra.
  texto         text not null,
  origen        origen_apartado not null,
  -- Qué recolector de evidencia corre para esta sección. El generador no sabe
  -- de fracciones: sabe de claves.
  clave_evidencia text,
  -- Por qué VIZO no lo acredita, dicho para quien lee el documento.
  por_que_no    text,
  -- Lo que el obligado tiene que contestar en su hueco. Son PREGUNTAS, nunca
  -- respuestas sugeridas: sugerir la respuesta sería redactar la política.
  preguntas     jsonb not null default '[]'::jsonb,
  fuente        text not null,
  vigente_desde date not null,
  vigente_hasta date,
  created_at    timestamptz not null default now(),

  constraint apartado_unico_por_vigencia unique (fraccion, vigente_desde),
  constraint apartado_vigencia_coherente
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  -- Un apartado acreditado SIN de dónde sacar la evidencia sería una promesa
  -- de prosa sin respaldo — exactamente lo que la frontera 5 prohíbe.
  constraint acreditado_exige_evidencia check (
    (origen = 'acreditado'
       and clave_evidencia is not null
       and por_que_no is null
       and preguntas = '[]'::jsonb)
    or
    -- Parcial: acredita algo Y dice qué le falta al obligado.
    (origen = 'acreditado_parcial'
       and clave_evidencia is not null
       and por_que_no is not null
       and jsonb_array_length(preguntas) > 0)
    or
    -- Hueco: sin evidencia, con explicación y con preguntas. Un hueco mudo
    -- deja al obligado sin saber qué le falta, que es peor que no ponerlo.
    (origen = 'del_obligado'
       and clave_evidencia is null
       and por_que_no is not null
       and jsonb_array_length(preguntas) > 0)
  )
);

comment on table apartados_manual is
  'Los catorce apartados del Art. 37 Bis, con su texto literal y de dónde sale cada uno. Los CHECK impiden sembrar un apartado acreditado sin consulta de evidencia: es la regla del ADR-20 hecha inexpresable, no vigilada.';

create index on apartados_manual (vigente_desde, orden);

alter table apartados_manual enable row level security;

-- Catálogo global: lo lee cualquier sesión, no lo escribe nadie desde la app.
-- Mismo trato que `umbrales` y `campos_expediente`.
create policy "catálogo del manual legible" on apartados_manual
  for select to authenticated using (true);

grant select on apartados_manual to authenticated;

-- ---------------------------------------------------------------------------
-- Los catorce, con el texto del DOF
-- ---------------------------------------------------------------------------
insert into apartados_manual
  (fraccion, orden, texto, origen, clave_evidencia, por_que_no, preguntas, fuente, vigente_desde)
values
  ('I', 1,
   'Los criterios para la identificación y conocimiento de Clientes o Usuarias;',
   'acreditado', 'campos_del_expediente', null, '[]'::jsonb,
   'Art. 37 Bis, fr. I', date '2026-11-30'),

  ('II', 2,
   'Los mecanismos de clasificación de Riesgo;',
   'del_obligado', null,
   'VIZO todavía no clasifica riesgo. El Capítulo III Bis es exigible el 1 de marzo de 2027 y pide al menos tres grados con reevaluación semestral; el esquema tiene la columna y la tabla preparadas, vacías.',
   '["¿Qué grados de riesgo usa, y con qué criterio asigna cada uno?", "¿Cada cuánto reevalúa, y qué lo dispara antes de tiempo?", "¿Quién autoriza un cambio de grado y dónde queda registrado?"]'::jsonb,
   'Art. 37 Bis, fr. II', date '2026-11-30'),

  ('III', 3,
   'Las medidas de debida diligencia aplicables conforme al Grado de Riesgo de cada Cliente o Usuaria;',
   'del_obligado', null,
   'Depende del apartado II. Qué medidas son adecuadas para cada grado es una decisión del obligado: VIZO no la sugiere.',
   '["¿Qué pide de más a un cliente de riesgo alto que a uno de riesgo bajo?", "¿Qué medidas aplica antes de operar, y cuáles durante la relación?"]'::jsonb,
   'Art. 37 Bis, fr. III', date '2026-11-30'),

  ('IV', 4,
   'Los procedimientos para la identificación y seguimiento reforzado de Personas Políticamente Expuestas;',
   'del_obligado', null,
   'VIZO no consulta PEP. El Capítulo III Quáter es exigible el 30 de noviembre de 2026, pero la aplicación oficial de consulta de la UIF no existe hasta el 30 de agosto de 2027 (Transitorio Décimo): en ese hueco el procedimiento es del obligado.',
   '["¿Cómo pregunta hoy si un cliente es PEP, o pariente hasta segundo grado, o socio con vínculo patrimonial?", "¿Quién autoriza operar con una PEP, y dónde queda esa autorización?", "¿Qué seguimiento reforzado aplica después?"]'::jsonb,
   'Art. 37 Bis, fr. IV', date '2026-11-30'),

  ('V', 5,
   'Los mecanismos para detectar actos u operaciones que se aparten del Perfil transaccional del Cliente o Usuaria;',
   'del_obligado', null,
   'VIZO acumula operaciones por cliente en ventana deslizante —que es la materia prima— pero no construye ni compara un perfil transaccional. El Capítulo III Ter es exigible el 1 de marzo de 2027.',
   '["¿Qué considera comportamiento normal de un cliente suyo?", "¿Qué desviación le hace levantar la mano, y quién la revisa?"]'::jsonb,
   'Art. 37 Bis, fr. V', date '2026-11-30'),

  ('VI', 6,
   'Los procedimientos para la presentación de Avisos e Informes en los tiempos y formas que establece la Ley;',
   'acreditado', 'pipeline_del_aviso', null, '[]'::jsonb,
   'Art. 37 Bis, fr. VI', date '2026-11-30'),

  ('VII', 7,
   'Los mecanismos de conservación de información y documentación;',
   'acreditado', 'conservacion_y_huellas', null, '[]'::jsonb,
   'Art. 37 Bis, fr. VII', date '2026-11-30'),

  ('VIII', 8,
   'Los mecanismos para dar seguimiento y acumular actos u operaciones que en lo individual se celebren con las personas Clientes o Usuarias, cuyo monto por suma acumulada alcance o supere los umbrales establecidos en cada caso, para la presentación de Avisos.',
   'acreditado', 'acumulacion', null, '[]'::jsonb,
   'Art. 37 Bis, fr. VIII', date '2026-11-30'),

  ('IX', 9,
   'Los mecanismos utilizados para identificar a las personas publicadas en las listas que emiten autoridades nacionales u organismos internacionales, para evitar el uso de recursos para el financiamiento de organizaciones delictivas, así como de otras actividades ilícitas.',
   'del_obligado', null,
   'VIZO no consulta listas. La tabla de consultas existe vacía desde el primer día, y la frontera del producto es explícita: VIZO nunca descarta una coincidencia de screening — esa decisión es humana y queda registrada.',
   '["¿Qué listas revisa, dónde las obtiene y cada cuánto?", "¿Qué hace cuando hay una coincidencia, y quién decide si es la misma persona?"]'::jsonb,
   'Art. 37 Bis, fr. IX', date '2026-11-30'),

  ('X', 10,
   'Las funciones y responsabilidades de la persona Representante Encargada de Cumplimiento a que se refiere el artículo 20 de la Ley;',
   'acreditado_parcial', 'designacion_rec',
   'VIZO acredita QUIÉN está designado y desde cuándo, con la aceptación del Art. 10. Las funciones y responsabilidades concretas de esa persona las define el obligado.',
   '["¿Qué decisiones toma el REC y cuáles escala?", "¿Quién lo suple y bajo qué supuestos?"]'::jsonb,
   'Art. 37 Bis, fr. X', date '2026-11-30'),

  ('XI', 11,
   'Los programas de capacitación;',
   'del_obligado', null,
   'La capacitación ocurre fuera del sistema. El Capítulo XII pide cursos al menos una vez al año y que quien los imparta acredite cinco años de experiencia en la materia; el primer periodo anual corre del 1 de enero al 31 de diciembre de 2027.',
   '["¿Quién imparte la capacitación y cómo acredita sus cinco años?", "¿A quiénes alcanza: consejo, directivos, REC, personal de atención?", "¿Dónde conserva la evidencia de asistencia?"]'::jsonb,
   'Art. 37 Bis, fr. XI', date '2026-11-30'),

  ('XII', 12,
   'Los mecanismos de control interno, supervisión y auditoría;',
   'acreditado_parcial', 'separacion_de_roles',
   'VIZO acredita la separación de funciones que impone la base de datos: quien captura no aprueba. La supervisión interna y la auditoría del Capítulo XIV —cuyo primer periodo corre en 2028— son del obligado.',
   '["¿Quién supervisa internamente el cumplimiento, y con qué periodicidad?", "¿Ya tiene auditor designado para el periodo que inicia el 1 de enero de 2028?"]'::jsonb,
   'Art. 37 Bis, fr. XII', date '2026-11-30'),

  ('XIII', 13,
   'Las medidas para garantizar la confidencialidad de la información, y',
   'acreditado', 'aislamiento_y_privilegios', null, '[]'::jsonb,
   'Art. 37 Bis, fr. XIII', date '2026-11-30'),

  ('XIV', 14,
   'Los procedimientos para la actualización del propio Manual de Políticas Internas.',
   'del_obligado', null,
   'Cómo y cada cuánto se actualiza el Manual es un procedimiento del obligado. El Art. 37 Bis 3 permite además que el SAT ordene modificaciones, así que el procedimiento tiene que contemplar ese supuesto.',
   '["¿Cada cuánto revisa el Manual, y qué lo obliga a revisarlo antes?", "¿Quién lo aprueba, y cómo consta la versión vigente?", "¿Qué hace si el SAT le señala modificaciones (Art. 37 Bis 3)?"]'::jsonb,
   'Art. 37 Bis, fr. XIV', date '2026-11-30');

-- La fuente completa se compone: la columna guarda la fracción y aquí se le
-- pega el resto, que es idéntico para las catorce. Así no se repite catorce
-- veces una cadena de doscientos caracteres que después se corrige en trece.
update apartados_manual
   set fuente = fuente || ' del Acuerdo 115/2026 (DOF 7-ago-2026, edición vespertina, código 5795797). Texto literal. Contrastado el 2026-08-16.'
 where vigente_desde = date '2026-11-30';

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
do $$
declare
  v_total int; v_acred int; v_parcial int; v_hueco int; v_rechazo boolean;
begin
  select count(*) into v_total from apartados_manual
   where vigente_desde <= date '2027-03-01'
     and (vigente_hasta is null or vigente_hasta >= date '2027-03-01');
  if v_total <> 14 then
    raise exception 'El Manual debe tener 14 apartados vigentes y tiene %.', v_total;
  end if;

  select count(*) filter (where origen = 'acreditado'),
         count(*) filter (where origen = 'acreditado_parcial'),
         count(*) filter (where origen = 'del_obligado')
    into v_acred, v_parcial, v_hueco
    from apartados_manual;

  -- El reparto del ADR-20. Si cambia sin que nadie lo decida, es que alguien
  -- movió un apartado de hueco a acreditado — y eso significa afirmar algo que
  -- quizá no se puede demostrar.
  if v_acred <> 5 or v_parcial <> 2 or v_hueco <> 7 then
    raise exception 'El reparto es % acreditados, % parciales y % huecos; el ADR-20 fijó 5, 2 y 7.',
      v_acred, v_parcial, v_hueco;
  end if;

  -- 1. Un apartado que promete acreditar sin decir de dónde sale la evidencia.
  v_rechazo := false;
  begin
    insert into apartados_manual (fraccion, orden, texto, origen, fuente, vigente_desde)
    values ('XV', 99, 'Aserción', 'acreditado', 'aserción', date '2026-11-30');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se pudo sembrar un apartado acreditado sin consulta de evidencia: el generador prometería prosa sin respaldo.';
  end if;

  -- 2. Un hueco mudo, sin explicación ni preguntas.
  v_rechazo := false;
  begin
    insert into apartados_manual (fraccion, orden, texto, origen, fuente, vigente_desde)
    values ('XV', 99, 'Aserción', 'del_obligado', 'aserción', date '2026-11-30');
  exception when check_violation then v_rechazo := true;
  end;
  if not v_rechazo then
    raise exception 'Se pudo sembrar un hueco sin decir qué falta: el obligado no sabría qué contestar.';
  end if;

  -- 3. Y el texto es LITERAL: la fracción VIII es la que sostiene la demo, así
  --    que si alguien la parafrasea, deja de poder cotejarse contra el DOF.
  if not exists (
    select 1 from apartados_manual
     where fraccion = 'VIII'
       and texto like '%dar seguimiento y acumular actos u operaciones%'
  ) then
    raise exception 'La fracción VIII dejó de citar el texto del artículo.';
  end if;

  raise notice '✓ apartados_manual: los 14 del Art. 37 Bis — 5 acreditados, 2 parciales, 7 huecos, y un acreditado sin evidencia es inexpresable';
end $$;
