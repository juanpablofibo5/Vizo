-- VIZO · Migración — Qué integra el expediente de la Fracción VIII (vehículos)
--
-- La migración 20260830100000 dio de alta la Fr. VIII con sus TRES umbrales y
-- dejó `campos_expediente` sin una sola fila. La consecuencia se verificó el
-- 30-ago-2026: un obligado de la Fr. VIII no puede abrir expediente de ningún
-- cliente — `calcularCompletitud` se niega con `CatalogoDeExpedienteVacio`
-- antes que decir «completo» sobre un expediente vacío (regla dura 6), y la
-- pantalla lo explica en vez de ofrecer el botón. Esta migración lo llena.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. DE DÓNDE SALE, Y LA PREMISA QUE HUBO QUE CORREGIR
-- ═══════════════════════════════════════════════════════════════════════════
-- El expediente de identificación NO se define por fracción. Se define por
-- TIPO DE CLIENTE, y el artículo que lo hace es el **Art. 12 de las Reglas de
-- Carácter General**, no el Art. 12 del Reglamento — que desde su reforma
-- (DOF 27-03-2026) trata del RFC y la e.firma para el alta en el Padrón, y no
-- dice nada de identificación de clientes (`regulatorio/leyes/Reg_LFPIORPI.txt`
-- líneas 412-432, leído el 2026-08-30).
--
-- La cadena del fundamento, de arriba abajo:
--
--   · **Art. 18 fr. I de la Ley** — «Identificar y conocer de manera directa a
--     las personas Clientes o Usuarias […] y verificar su identidad basándose
--     en documentos u otros medios de identificación con reconocimiento
--     oficial, así como recabar copia de los mismos, **de conformidad con las
--     Reglas de carácter general que emita la Secretaría**». La Ley delega el
--     contenido; no lista campos. (`LFPIORPI.txt` línea 944, reforma
--     DOF 16-07-2025.)
--   · **Art. 18 fr. II** — la actividad u ocupación se solicita «Para los casos
--     en que se establezca una **Relación de negocios**». Es condicional en la
--     Ley misma, y los Anexos lo repiten.
--   · **Art. 18 fr. III** — persona moral: identificar al Beneficiario
--     Controlador; persona física: recabar la **declaración** de si tiene o no
--     conocimiento de que exista uno.
--   · **Art. 12 de las RCG** — «Quienes realicen Actividades Vulnerables
--     deberán integrar y conservar un expediente único de identificación de
--     cada uno de sus Clientes o Usuarias», y remite por tipo de cliente a los
--     Anexos 3 (PF nacional o residente), 4 (PM mexicana), 4 Bis, 5, 6, 6 Bis,
--     7, 7 Bis y 8.
--
-- **El sujeto del Art. 12 es «quienes realicen Actividades Vulnerables», sin
-- distinguir fracción.** Por eso la Fr. VIII se identifica con los MISMOS
-- Anexos que la V Bis. Es la misma lectura que la doble revisión ya bendijo
-- para la constancia del BC (migración 20260828100000), aplicada aquí.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LO QUE EL ACUERDO 115/2026 DICE DE ESTA FRACCIÓN: NADA
-- ═══════════════════════════════════════════════════════════════════════════
-- Se buscó «vehícul», «automotor» y «fracción VIII» sobre el texto completo
-- del DOF (`regulatorio/dof/acuerdo-115-2026.txt`, código 5795797, edición
-- vespertina del 7-ago-2026) el 2026-08-30: **cero coincidencias**. Coincide
-- con lo que `docs/ACUERDO-115-2026.md §0` ya tenía registrado.
--
-- Ese silencio no es un hueco: es la respuesta. El Acuerdo no crea requisitos
-- de identificación por actividad, porque las RCG no organizan la
-- identificación por actividad. Las únicas excepciones POR FRACCIÓN que el
-- texto trae son el Art. 12 Bis (fr. XI), el Art. 13 y el 13 Bis (fr. XII).
-- La VIII no está entre ellas, así que le aplica la regla general del Art. 12.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DOS VIGENCIAS, Y QUÉ CAMBIA EL 30 DE NOVIEMBRE
-- ═══════════════════════════════════════════════════════════════════════════
-- El Cap. III de las RCG (Arts. 11 a 23) y los Anexos entran por el
-- **Transitorio Primero** — 30-nov-2026, sin excepción que los alcance (el
-- Segundo cubre el Cap. II Quáter, el Tercero el Manual, el Cuarto los Caps.
-- III Bis / III Ter / III Quinquies, el Quinto los avisos de 24 h).
--
-- De los Anexos 3 y 4, **dos cambios mueven el catálogo** y se siembran como
-- segunda vigencia; el resto no cambia lo que VIZO puede exigir:
--
--   (a) **Anexo 3 b) iv)** — la constancia del conocimiento del BC pasa de
--       «Dueño Beneficiario» a «Beneficiario Controlador» y admite Firma
--       Electrónica además de la autógrafa. Mismo campo, fuente nueva.
--   (b) **Anexo 4 b) v)** — deja de ser una constancia firmada y pasa a ser
--       «Quien realice la Actividad Vulnerable deberá **identificar** […] al
--       Beneficiario Controlador», remitiendo al Art. 12 fr. VII ¶2, que exige
--       recabar los numerales i), ii), iv) y ix) del inciso a) del Anexo 3
--       **«en todos los casos»**. Es más estricto, no menos.
--
-- Cambios verificados que NO mueven el catálogo, dichos para que la segunda
-- revisión no los busque en vano:
--   · Anexo 3 a) i): «Apellido paterno/materno» → «Primer/segundo apellido».
--     Redacción; las columnas no cambian.
--   · Anexo 3 b) i) y Anexo 4 b) iv): se añade «**excepto la cédula
--     profesional**» a los documentos válidos. Es una regla sobre QUÉ
--     documento vale, y nada en VIZO la consume hoy — inventarle una llave de
--     `validacion` que ningún código lee sería fingir que se aplica. Queda
--     como pendiente declarado (§5).
--   · Anexo 3 b) ii) ¶2 (adicionado): no hace falta la constancia de CURP si
--     esta aparece en otro documento oficial. El campo ya es no obligatorio
--     por el texto vigente, así que el efecto es nulo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 4. OBLIGATORIO = LO QUE EL TEXTO EXIGE SIN CONDICIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- Aquí está la diferencia grande contra la siembra de la V Bis, y conviene
-- decirla porque parece un descuido y no lo es.
--
-- La V Bis se sembró desde DOS fuentes: los Anexos y el **XSD** del aviso
-- (`regulatorio/xsd/din.xsd`), que exige RFC, actividad económica y domicilio
-- para poder emitir el archivo. Por eso allá esos campos son obligatorios.
--
-- **La Fr. VIII no tiene XSD**: `actividades_vulnerables.clave_sppld` es NULL
-- a propósito y `generarAviso` se detiene diciéndolo. Así que la única fuente
-- disponible es el texto, y el texto condiciona varias exigencias:
--
--   · RFC y CURP — «**cuando cuente con ellas**» (Anexo 3 a ix, Anexo 4 a viii)
--   · Actividad / giro — «**para los casos en que se establezca una Relación
--     de Negocios**» (Anexo 3 a v, Anexo 4 a iv; y Art. 18 fr. II de la Ley)
--   · Teléfono — «cuando cuenten con aquél» · Correo — «en su caso»
--   · Constancia de CURP / Cédula de Identificación Fiscal — «cuando el
--     Cliente o Usuario cuente con ellas» / «en caso de contar con ésta»
--   · Comprobante de domicilio de PERSONA FÍSICA — solo «**cuando el domicilio
--     manifestado […] no coincida con el de la identificación o ésta no lo
--     contenga**» (Anexo 3 b iii). En PERSONA MORAL el Anexo 4 b iii) lo pide
--     sin condición: por eso las dos filas difieren en `obligatorio`.
--   · Poder del representante — «cuando no estén contenidos en el instrumento
--     público que acredite la constitución» (Anexo 4 b iv)
--   · Carta poder — solo si la persona física actúa como apoderada (Anexo 3 b v)
--
-- `campos_expediente.obligatorio` es booleano y no sabe decir «depende». Un
-- condicional marcado obligatorio dejaría expedientes legítimos incompletos
-- para siempre; marcado no obligatorio, el campo **sigue siendo capturable y
-- visible** (`camposCapturables` no filtra por `obligatorio`) pero no bloquea.
-- De las dos lecturas imperfectas, esta es la que no miente sobre el texto.
-- Cuando el XSD de vehículos se descargue, lo que el formato exija sube a
-- obligatorio con una vigencia nueva y su fuente — que es exactamente para lo
-- que la tabla está versionada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 5. EL SILENCIO DE LA FUENTE, CITADO EN LUGAR DE RELLENADO
-- ═══════════════════════════════════════════════════════════════════════════
-- Cinco cosas que el texto SÍ pide y esta migración NO siembra, porque el
-- modelo no puede expresarlas. Se dejan escritas para que se vean:
--
--   (i)   **País de nacimiento** (Anexo 3 a iii) — `clientes_finales` no tiene
--         la columna. Solo guarda `nacionalidad`, que es el numeral iv).
--   (ii)  **Datos de la identificación** — nombre del documento, autoridad que
--         lo emite y número (Anexo 3 a x, Anexo 4 a ix). Sin columna. Hoy VIZO
--         guarda la IMAGEN del documento pero no sus datos, y el Anexo pide
--         las dos cosas.
--   (iii) **Datos del representante o apoderado** (Anexo 4 a ix) — viven en la
--         tabla `representantes`, no en `clientes_finales`. La aserción de
--         abajo rechaza cualquier campo de dato que no apunte a una columna
--         real, así que sembrarlo sería imposible además de falso.
--   (iv)  **Los otros seis tipos de cliente** — `aplica_a` solo tiene
--         'persona_fisica', 'persona_moral' y 'ambas'. Los Anexos 4 Bis (PM de
--         derecho público), 5 (PF **extranjera visitante**: pide pasaporte, no
--         INE), 6 (PM extranjera), 6 Bis (embajadas), 7 / 7 Bis (medidas
--         simplificadas) y 8 (fideicomiso) no son representables. Lo sembrado
--         cubre Anexo 3 y Anexo 4, y **nada más**. La V Bis tiene el mismo
--         hueco; esta migración no lo agranda ni lo tapa.
--   (v)   **La antigüedad de tres meses del comprobante de domicilio NO se
--         siembra para la Fr. VIII**, y esto merece leerse dos veces. El
--         Art. 21 la enuncia «conforme a los Anexos de estas reglas que así lo
--         solicitan», y al transcribir los Anexos se ve por qué esa coletilla
--         está ahí: el límite cuelga de ALGUNOS documentos aceptados —«recibo
--         de pago por servicios domiciliados o estados de cuenta bancarios,
--         **todos ellos** con una antigüedad no mayor a tres meses»— y **no**
--         del «contrato de arrendamiento vigente» ni de la «Constancia de
--         inscripción en el RFC», que el mismo numeral acepta sin límite.
--         `documentos` no registra cuál de los tres se subió, así que poner
--         `antiguedad_maxima_meses: 3` marcaría «vencido» un comprobante
--         válido. Un rechazo falso es tan indefendible como una omisión, y
--         este además se vería como si el sistema tuviera razón.
--         **Consecuencia para la V Bis:** su fila del 30-nov-2026 (migración
--         20260815170000) sí lo trae, y esa migración avisó de este mismo
--         riesgo — «el Anexo de la Fr. V Bis no se ha transcrito». Ya está
--         transcrito. Revisarla es trabajo aparte y con su propia doble
--         revisión: las migraciones aplicadas no se editan.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 6. LO QUE LA DOBLE REVISIÓN TIENE QUE BENDECIR (runbook 02 §3)
-- ═══════════════════════════════════════════════════════════════════════════
-- **Esta migración NO se aplica a producción sin la segunda lectura.** Quien
-- verifica no revisa este SQL: abre los textos y coteja. Dos puntos son los
-- caros:
--
--   1. **La procedencia del texto 2013/2014.** Las filas del periodo actual se
--      transcribieron de `regulatorio/dof/rcg-historico/`, que son facsímiles
--      oficiales del SAT y de la SHCP — **no el DOF mismo**, como el propio
--      README de esa carpeta advierte. El runbook 02 §1 exige el DOF a la
--      vista. Cotejar contra **DOF 23-ago-2013 (Segunda Sección)** y **DOF
--      24-jul-2014** es requisito de aplicación, no sugerencia. Las filas del
--      30-nov-2026 sí salen del DOF (código 5795797, SHA-256 en el repo).
--   2. **Que la sustitución del Anexo 4 b) v) sea legítima** — ver la fuente
--      de `identificacion_beneficiario_controlador`, que dice en qué se apoya
--      y en qué se aproxima.

do $$
declare
  v_act    uuid;
  v_desde  date := date '2025-07-17';
  v_corte  date := date '2026-11-29';
  v_nueva  date := date '2026-11-30';

  -- Sufijos comunes. Van concatenados en cada fila para que ninguna quede
  -- dependiendo de este comentario para poder defenderse.
  v_rcg text := ' — RCG (Acuerdo 02/2013, DOF 23-ago-2013, Segunda Sección), '
             || 'texto consolidado con la reforma DOF 24-jul-2014; el Acuerdo 126/2020 '
             || '(DOF 30-nov-2020, código 5606232) no tocó los Anexos ni el Art. 12. '
             || 'Aplica a la Fr. VIII porque el Art. 12 de las RCG remite a los Anexos '
             || 'POR TIPO DE CLIENTE para quienes realicen cualquier Actividad Vulnerable. '
             || 'Transcrito de regulatorio/dof/rcg-historico/rcg-compilado-reforma-2014-shcp.txt '
             || 'el 2026-08-30. PENDIENTE: contraste directo contra el DOF (runbook 02 §1).';

  v_115 text := ' — Anexos reformados por el Acuerdo 115/2026 (DOF 7-ago-2026, '
             || 'edición vespertina, código 5795797), exigibles el 30-nov-2026 por el '
             || 'Transitorio Primero. Contrastado contra regulatorio/dof/acuerdo-115-2026.txt '
             || 'el 2026-08-30.';
begin
  select id into strict v_act from actividades_vulnerables where fraccion = 'VIII';

  -- ═══════════════════════════════════════════════════════════════════════
  -- VIGENCIA ACTUAL — desde el 17-jul-2025
  -- ═══════════════════════════════════════════════════════════════════════
  -- La fecha es la LÍNEA BASE DEL CATÁLOGO (entrada en vigor de la reforma de
  -- la Ley, DOF 16-jul-2025), la misma con la que se sembraron los umbrales de
  -- la Fr. VIII. No es una afirmación de que la obligación naciera ese día:
  -- la Fr. VIII existe desde 2013. VIZO no evalúa actos anteriores a su línea
  -- base, así que la distinción no cambia ningún cálculo — pero sí cambia lo
  -- que la fila dice, y por eso queda escrita.
  insert into campos_expediente
    (actividad_id, aplica_a, campo, etiqueta, tipo_dato, obligatorio, validacion,
     orden, vigente_desde, vigente_hasta, fuente)
  values
  -- ── DATOS · persona física (Anexo 3, inciso a) ─────────────────────────
    (v_act, 'persona_fisica', 'nombre_pila', 'Nombre(s)', 'texto', true,
     '{"columna":"nombre_pila"}'::jsonb, 10, v_desde, null,
     'Anexo 3 a) i): «Apellido paterno, apellido materno y nombre(s), sin abreviaturas»' || v_rcg),

    (v_act, 'persona_fisica', 'apellido_paterno', 'Primer apellido', 'texto', true,
     '{"columna":"apellido_paterno"}'::jsonb, 20, v_desde, null,
     'Anexo 3 a) i)' || v_rcg),

    -- El segundo apellido NO es obligatorio porque el mismo numeral admite
    -- «en caso de ser extranjero, los apellidos completos que correspondan»,
    -- y hay nacionalidades con un solo apellido. Exigirlo dejaría a esas
    -- personas con el expediente incompleto para siempre.
    (v_act, 'persona_fisica', 'apellido_materno', 'Segundo apellido', 'texto', false,
     '{"columna":"apellido_materno"}'::jsonb, 30, v_desde, null,
     'Anexo 3 a) i), condicionado por «en caso de ser extranjero, los apellidos completos '
     || 'que correspondan»: hay clientes con un solo apellido' || v_rcg),

  -- ── DATOS · persona moral (Anexo 4, inciso a) ──────────────────────────
    (v_act, 'persona_moral', 'nombre_o_razon_social', 'Denominación o razón social', 'texto', true,
     '{"columna":"nombre_o_razon_social"}'::jsonb, 10, v_desde, null,
     'Anexo 4 a) i): «Denominación o razón social»' || v_rcg),

  -- ── DATOS · ambas ──────────────────────────────────────────────────────
    (v_act, 'ambas', 'fecha_nacimiento_o_constitucion',
     'Fecha de nacimiento o de constitución', 'fecha', true,
     '{"columna":"fecha_nacimiento_o_constitucion"}'::jsonb, 40, v_desde, null,
     'Anexo 3 a) ii) «Fecha de nacimiento» y Anexo 4 a) ii) «Fecha de constitución»' || v_rcg),

    (v_act, 'ambas', 'nacionalidad', 'País de nacionalidad', 'catalogo', true,
     '{"columna":"nacionalidad","catalogo":"pais"}'::jsonb, 50, v_desde, null,
     'Anexo 3 a) iv) y Anexo 4 a) iii): «País de nacionalidad»' || v_rcg),

    -- Condicional en el texto Y en la Ley (Art. 18 fr. II): solo se solicita
    -- cuando se establece Relación de negocios, que el Art. 3 fr. XIV define
    -- como la formal y habitual, EXCLUYENDO los actos ocasionales. Una venta
    -- única de vehículo es justamente el acto ocasional.
    (v_act, 'persona_fisica', 'actividad_economica',
     'Actividad, ocupación, profesión o giro del negocio', 'catalogo', false,
     '{"columna":"actividad_economica","catalogo":"actividad_economica"}'::jsonb,
     60, v_desde, null,
     'Anexo 3 a) v): «…al que se dedique el Cliente o Usuario, PARA LOS CASOS EN QUE SE '
     || 'ESTABLEZCA UNA RELACIÓN DE NEGOCIOS». Condicional también en el Art. 18 fr. II '
     || 'de la Ley' || v_rcg),

    (v_act, 'persona_moral', 'giro_mercantil',
     'Actividad, giro mercantil u objeto social', 'catalogo', false,
     '{"columna":"giro_mercantil","catalogo":"giro_mercantil"}'::jsonb, 60, v_desde, null,
     'Anexo 4 a) iv): «…para los casos en que se establezca una Relación de Negocios». '
     || 'Condicional también en el Art. 18 fr. II de la Ley' || v_rcg),

    (v_act, 'ambas', 'domicilio', 'Domicilio', 'texto', true,
     '{"columna":"domicilio"}'::jsonb, 70, v_desde, null,
     'Anexo 3 a) vi) «Domicilio en el lugar de residencia, compuesto de los siguientes '
     || 'datos…» y Anexo 4 a) v)' || v_rcg),

    (v_act, 'ambas', 'telefono_numero', 'Teléfono', 'texto', false,
     '{"columna":"telefono_numero"}'::jsonb, 80, v_desde, null,
     'Anexo 3 a) vii) y Anexo 4 a) vi): «cuando cuenten con aquél»' || v_rcg),

    (v_act, 'ambas', 'correo_electronico', 'Correo electrónico', 'texto', false,
     '{"columna":"correo_electronico"}'::jsonb, 90, v_desde, null,
     'Anexo 3 a) viii) y Anexo 4 a) vii): «en su caso»' || v_rcg),

    (v_act, 'persona_fisica', 'curp', 'CURP', 'texto', false,
     '{"columna":"curp"}'::jsonb, 100, v_desde, null,
     'Anexo 3 a) ix): «Clave Única de Registro de Población y la clave del Registro '
     || 'Federal de Contribuyentes, CUANDO CUENTE CON ELLAS»' || v_rcg),

    -- Sin XSD que lo exija, el RFC es lo que el texto dice: condicional.
    -- Nada de esto afecta la acumulación — la identidad del cliente la
    -- resuelve `cliente_identificable` (RFC, CURP o identidad alterna), que es
    -- un CHECK de la base y no depende de este catálogo.
    (v_act, 'ambas', 'rfc', 'RFC', 'texto', false,
     '{"columna":"rfc"}'::jsonb, 110, v_desde, null,
     'Anexo 3 a) ix) «cuando cuente con ellas» y Anexo 4 a) viii) «cuando cuente con ella»'
     || v_rcg),

  -- ── DOCUMENTOS · persona física (Anexo 3, inciso b) ────────────────────
    (v_act, 'persona_fisica', 'identificacion_oficial',
     'Identificación oficial vigente', 'documento', true, '{}'::jsonb, 200, v_desde, null,
     'Anexo 3 b) i): «documento original oficial emitido por autoridad competente, '
     || 'vigente o que la fecha de vencimiento, al momento de su presentación, no sea '
     || 'mayor a dos años, que contenga la fotografía, firma y, en su caso, domicilio»'
     || v_rcg),

    (v_act, 'persona_fisica', 'constancia_curp_o_cif',
     'Constancia de CURP o Cédula de Identificación Fiscal', 'documento', false,
     '{}'::jsonb, 210, v_desde, null,
     'Anexo 3 b) ii): «Constancia de la Clave Única de Registro de Población […] O Cédula '
     || 'de Identificación Fiscal expedida por el SAT, CUANDO EL CLIENTE O USUARIO CUENTE '
     || 'CON ELLAS». Son alternativas, no acumulativas' || v_rcg),

    -- La diferencia PF/PM es del texto, no una decisión de producto.
    (v_act, 'persona_fisica', 'comprobante_domicilio',
     'Comprobante de domicilio', 'documento', false, '{}'::jsonb, 220, v_desde, null,
     'Anexo 3 b) iii): se recaba «CUANDO EL DOMICILIO MANIFESTADO […] NO COINCIDA CON EL '
     || 'DE LA IDENTIFICACIÓN O ÉSTA NO LO CONTENGA». Sin antiguedad_maxima_meses: el '
     || 'límite de tres meses cuelga del recibo o estado de cuenta, no del contrato de '
     || 'arrendamiento ni de la constancia de RFC, y `documentos` no distingue cuál se '
     || 'subió' || v_rcg),

    (v_act, 'persona_fisica', 'constancia_conocimiento_bc',
     'Constancia firmada: se solicitó información sobre conocimiento del Beneficiario Controlador',
     'documento', true, '{}'::jsonb, 230, v_desde, v_corte,
     'Anexo 3 b) iv): «Constancia por la que se acredite que quien realice la Actividad '
     || 'Vulnerable solicitó a su Cliente o Usuario, información acerca de si tiene '
     || 'conocimiento de la existencia del Dueño Beneficiario, la cual deberá estar '
     || 'firmada por el Cliente o Usuario». El Art. 3 fr. VII define «Dueño Beneficiario, '
     || 'al Beneficiario Controlador». Cierra el 29-nov-2026: el Acuerdo 115/2026 '
     || 'reescribe el numeral' || v_rcg),

    (v_act, 'persona_fisica', 'carta_poder_apoderado',
     'Carta poder o instrumento del apoderado (si actúa por otra persona)',
     'documento', false, '{}'::jsonb, 240, v_desde, null,
     'Anexo 3 b) v): «PARA EL CASO EN QUE la persona física actúe como apoderado de otra '
     || 'persona», con identificación y comprobante de domicilio del apoderado' || v_rcg),

  -- ── DOCUMENTOS · persona moral (Anexo 4, inciso b) ─────────────────────
    (v_act, 'persona_moral', 'acta_constitutiva',
     'Acta constitutiva o instrumento que acredite su existencia', 'documento', true,
     '{}'::jsonb, 250, v_desde, null,
     'Anexo 4 b) i): «Testimonio o copia certificada del instrumento público que acredite '
     || 'su constitución e inscripción en el registro público que corresponda […] o bien, '
     || 'del documento que […] acredite su existencia»' || v_rcg),

    (v_act, 'persona_moral', 'cedula_identificacion_fiscal',
     'Cédula de Identificación Fiscal', 'documento', false, '{}'::jsonb, 210, v_desde, null,
     'Anexo 4 b) ii): «Cédula de Identificación Fiscal expedida por el SAT, EN CASO DE '
     || 'CONTAR CON ÉSTA»' || v_rcg),

    -- En persona moral el Anexo NO lo condiciona: se pide siempre.
    (v_act, 'persona_moral', 'comprobante_domicilio',
     'Comprobante de domicilio', 'documento', true, '{}'::jsonb, 220, v_desde, null,
     'Anexo 4 b) iii): «Comprobante que acredite el domicilio a que se refiere el numeral '
     || 'v), del inciso a) anterior» — sin la condicionante que sí trae el Anexo 3 b) iii). '
     || 'Sin antiguedad_maxima_meses por la misma razón que en persona física: el límite '
     || 'de tres meses no alcanza al contrato de arrendamiento ni a la constancia de RFC'
     || v_rcg),

    (v_act, 'persona_moral', 'poder_representante',
     'Poder del representante o apoderado', 'documento', false, '{}'::jsonb, 260, v_desde, null,
     'Anexo 4 b) iv): «CUANDO NO ESTÉN CONTENIDOS EN EL INSTRUMENTO PÚBLICO que acredite '
     || 'la constitución de la persona moral»' || v_rcg),

    (v_act, 'persona_moral', 'identificacion_representante',
     'Identificación oficial del representante o apoderado', 'documento', true,
     '{}'::jsonb, 270, v_desde, null,
     'Anexo 4 b) iv), segunda mitad: «así como la identificación de cada uno de dichos '
     || 'representantes, apoderados legales o personas que realicen el acto u operación a '
     || 'nombre de dicha persona moral». Esta parte NO está condicionada' || v_rcg),

    (v_act, 'persona_moral', 'declaracion_beneficiario',
     'Constancia firmada: se solicitó información sobre conocimiento del Beneficiario Controlador',
     'documento', true, '{}'::jsonb, 280, v_desde, v_corte,
     'Anexo 4 b) v): «Constancia por la que se acredite que quien realice la Actividad '
     || 'Vulnerable solicitó a su Cliente o Usuario información acerca de si tiene '
     || 'conocimiento de la existencia del Dueño Beneficiario, la cual deberá estar '
     || 'firmada por el Cliente o Usuarios». Cierra el 29-nov-2026: el Acuerdo 115/2026 '
     || 'sustituye la constancia por una obligación de identificar' || v_rcg),

  -- ═══════════════════════════════════════════════════════════════════════
  -- VIGENCIA DEL ACUERDO 115/2026 — desde el 30-nov-2026
  -- ═══════════════════════════════════════════════════════════════════════
  -- La `etiqueta` se conserva IDÉNTICA a la fila que sustituye cuando el campo
  -- es el mismo: la pantalla resuelve nombres con
  -- `select distinct campo, etiqueta from campos_expediente`, y dos etiquetas
  -- para una clave harían que el nombre mostrado dependiera del orden en que
  -- salieran las filas. Lo que cambia va en `fuente`, que es donde se defiende.
    (v_act, 'persona_fisica', 'constancia_conocimiento_bc',
     'Constancia firmada: se solicitó información sobre conocimiento del Beneficiario Controlador',
     'documento', true, '{}'::jsonb, 230, v_nueva, null,
     'Anexo 3 b) iv) reformado: «…información acerca de si tiene conocimiento de la '
     || 'existencia del Beneficiario Controlador, la cual deberá estar firmada por el '
     || 'Cliente o Usuaria DE MANERA AUTÓGRAFA O BIEN, MEDIANTE FIRMA ELECTRÓNICA». '
     || 'Cambian el término y la forma de firma; la obligación es la misma' || v_115),

    -- La fila que impide que el expediente de persona moral se vuelva MÁS
    -- FÁCIL el 30 de noviembre. Ver la aserción de no-relajación abajo.
    (v_act, 'persona_moral', 'identificacion_beneficiario_controlador',
     'Identificación del Beneficiario Controlador', 'documento', true,
     '{}'::jsonb, 280, v_nueva, null,
     'Anexo 4 b) v) reformado: «Quien realice la Actividad Vulnerable deberá IDENTIFICAR '
     || 'de conformidad a lo dispuesto en la fracción VII, segundo párrafo del artículo 12 '
     || 'de las presentes reglas, al Beneficiario Controlador», y ese párrafo exige '
     || 'recabar «los datos establecidos en los numerales i), ii), iv) y ix) del inciso a) '
     || 'del Anexo 3 […] EN TODOS LOS CASOS» (nombre y apellidos, fecha de nacimiento, '
     || 'país de nacionalidad, CURP y RFC). APROXIMACIÓN DECLARADA: el texto pide DATOS, y '
     || 'esos datos del BC viven en `beneficiarios_controladores`, mientras que un campo '
     || 'de dato de este catálogo solo puede satisfacerse desde una columna de '
     || '`clientes_finales`. Se modela como documento probatorio para no relajar el '
     || 'expediente el 30-nov. Sustituir esta fila por captura estructurada del BC es '
     || 'trabajo pendiente, y es el punto 2 de la doble revisión' || v_115);
end $$;

-- ---------------------------------------------------------------------------
-- Aserciones
-- ---------------------------------------------------------------------------
-- Cargar el catálogo sin comprobar que el motor lo resuelve en la fecha
-- correcta es cargar a ciegas (runbook 02 §2).
do $$
declare
  v_act      uuid;
  v_n        int;
  v_txt      text;
  v_antes    int;
  v_despues  int;
begin
  select id into strict v_act from actividades_vulnerables where fraccion = 'VIII';

  -- 1. El total. Si alguien agrega o quita una fila sin actualizar el número,
  --    esta migración ya corrió y la siguiente tendrá que decir por qué.
  select count(*) into v_n from campos_expediente where actividad_id = v_act;
  if v_n <> 26 then
    raise exception 'La Fr. VIII quedó con % campos de expediente en vez de 26.', v_n;
  end if;

  -- 2. Regla dura 1 aplicada a esta tabla: ninguna fila sin fuente. Las 17
  --    originales de la V Bis nacieron sin ella y por eso la columna es
  --    nullable; ninguna de la Fr. VIII puede repetirlo.
  select string_agg(campo, ', ') into v_txt
    from campos_expediente
   where actividad_id = v_act and (fuente is null or btrim(fuente) = '');
  if v_txt is not null then
    raise exception 'Campos de la Fr. VIII sin fuente citada: %', v_txt;
  end if;

  -- 3. Todo campo de dato tiene que decir de qué columna sale, y esa columna
  --    tiene que existir. Un campo sin columna revienta en `CampoSinOrigen` la
  --    primera vez que alguien abra el expediente.
  select string_agg(c.campo, ', ') into v_txt
    from campos_expediente c
   where c.actividad_id = v_act
     and c.tipo_dato <> 'documento'
     and not exists (
       select 1 from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = 'clientes_finales'
          and ic.column_name = c.validacion->>'columna'
     );
  if v_txt is not null then
    raise exception 'Campos de la Fr. VIII sin columna válida en clientes_finales: %', v_txt;
  end if;

  -- 4. Ninguna fecha puede tener dos filas vigentes del mismo campo y tipo de
  --    persona: la completitud dependería del orden de la consulta.
  select count(*) into v_n
    from campos_expediente a
    join campos_expediente b
      on a.actividad_id = b.actividad_id and a.aplica_a = b.aplica_a
     and a.campo = b.campo and a.id < b.id
   where a.actividad_id = v_act
     and coalesce(a.vigente_hasta, 'infinity') >= b.vigente_desde
     and coalesce(b.vigente_hasta, 'infinity') >= a.vigente_desde;
  if v_n <> 0 then
    raise exception 'La Fr. VIII tiene % pares de vigencias traslapadas.', v_n;
  end if;

  -- 5. LA ASERCIÓN QUE IMPORTA. El 30 de noviembre entra una reforma que
  --    ENDURECE la identificación del Beneficiario Controlador. Si el conteo
  --    de obligatorios BAJA al cruzar esa frontera, alguien cerró una vigencia
  --    sin abrir su sustituta y el expediente se volvió más fácil justo el día
  --    en que la regla se volvió más estricta. Eso no lanza ninguna excepción
  --    por sí solo: se vería como expedientes que de pronto están completos.
  for v_txt in select unnest(array['persona_fisica', 'persona_moral']) loop
    select count(*) into v_antes
      from campos_expediente
     where actividad_id = v_act and obligatorio
       and aplica_a::text in ('ambas', v_txt)
       and daterange(vigente_desde, vigente_hasta, '[]') @> date '2026-11-29';

    select count(*) into v_despues
      from campos_expediente
     where actividad_id = v_act and obligatorio
       and aplica_a::text in ('ambas', v_txt)
       and daterange(vigente_desde, vigente_hasta, '[]') @> date '2026-11-30';

    if v_despues < v_antes then
      raise exception
        'El 30-nov-2026 el expediente de % se RELAJA: % obligatorios contra % del día '
        'anterior. La reforma del Anexo 4 b) v) endurece, no afloja.',
        v_txt, v_despues, v_antes;
    end if;

    if v_antes = 0 or v_despues = 0 then
      raise exception
        'El expediente de % se queda sin obligatorios en alguna de las dos fechas '
        '(% y %). `calcularCompletitud` lo daría por completo estando vacío.',
        v_txt, v_antes, v_despues;
    end if;
  end loop;

  -- 6. Los números concretos, para que la segunda revisión los pueda contar a
  --    mano contra los Anexos en vez de confiar en la aritmética de arriba.
  select count(*) into v_antes
    from campos_expediente
   where actividad_id = v_act and obligatorio
     and aplica_a::text in ('ambas', 'persona_fisica')
     and daterange(vigente_desde, vigente_hasta, '[]') @> date '2026-08-30';
  if v_antes <> 7 then
    raise exception 'Persona física: se esperaban 7 obligatorios hoy, hay %.', v_antes;
  end if;

  select count(*) into v_antes
    from campos_expediente
   where actividad_id = v_act and obligatorio
     and aplica_a::text in ('ambas', 'persona_moral')
     and daterange(vigente_desde, vigente_hasta, '[]') @> date '2026-08-30';
  if v_antes <> 8 then
    raise exception 'Persona moral: se esperaban 8 obligatorios hoy, hay %.', v_antes;
  end if;

  raise notice '✓ Fr. VIII: 26 campos de expediente, todos con fuente, en dos vigencias. '
               'PF 7 obligatorios · PM 8. Sin XSD, lo condicionado por el texto queda '
               'capturable y no bloqueante.';
end $$;
