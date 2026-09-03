# Verificación del mapa — contrastar los documentos contra el código

> **Por qué existe este archivo.** `ROADMAP-2027.md` y `ALCANCE.md` son los
> documentos con los que se decide qué se construye. En dos días aparecieron
> **cuatro** afirmaciones suyas que daban por «no construido» algo que sí
> estaba: el Cap. II Quáter (24-ago), el Cap. III Bis y dos filas de la tabla
> del Cap. XIII (2-sep). No es mala fe ni descuido: cada capítulo construido
> deja atrás una línea que nadie volvió a leer.
>
> El costo ya se cobró. El 2-sep recomendé arrancar con el Beneficiario
> Controlador diciendo «falta el árbol»; el árbol llevaba doce días escrito y
> con pruebas — lo que faltaba era que algo lo importara. Y el Cap. XIII se
> veía como el hueco grande cuando tres de sus seis funciones ya estaban.
>
> Un mapa que exagera lo que falta hace planear de más; uno que exagera lo
> construido hace llegar tarde. Los dos errores son del mismo tipo: una
> afirmación que nadie volvió a contrastar.

## El método

Uno por uno, y sin atajos:

1. Lee la afirmación completa, no su encabezado.
2. Búscala en el código: tablas en la base local, funciones en `src/`,
   pantallas en `app/`, pruebas en `tests/`. **Ver el archivo no basta** — el
   caso del Beneficiario Controlador era un módulo entero con pruebas que
   nadie importaba. Comprueba que algo lo *use*.
3. Marca el resultado en la tabla de abajo con la fecha.
4. Si la afirmación está mal, **corrígela en su documento** dejando dicho qué
   decía antes y por qué era falsa — igual que las correcciones que ya llevan
   esos archivos. Una corrección silenciosa se vuelve a introducir.
5. Un commit por afirmación corregida, o uno por grupo si son de la misma
   sección. La suite en verde antes de cada uno.

**Lo que NO hace este barrido:** construir nada, ni decidir alcance, ni tocar
producción. Si al verificar aparece un hueco real, se anota aquí y se sigue.

## `docs/ROADMAP-2027.md` §2 — capítulo por capítulo

| Afirmación | Estado | Qué se encontró |
|---|---|---|
| Cap. II Ter · Fideicomisos (línea ~42) | ⬜ por verificar | |
| Cap. III Quáter · PEP (~49) | ⬜ por verificar | |
| Cap. II Quáter · Enfoque basado en Riesgos (~54) | ✅ 24-ago-2026 | Decía «nada construido»; la fr. I estaba desde el ADR-21 y la fr. II a medias |
| Cap. III Bis · Grado de riesgo (~66) | ✅ 2-sep-2026 | Decía «tablas vacías desde la migración 001»; están el modelo, la escala, las evaluaciones append-only y la pantalla que clasifica |
| Cap. III Ter · Perfil transaccional (~71) | ⬜ por verificar | |
| Cap. III Ter · Aprobación del Art. 23 Ter 5 (~73) | ⬜ por verificar | |
| Cap. III Ter · Cuestionario del Art. 23 Ter 3 (~75) | ⬜ por verificar | |
| Cap. III Ter · Medidas reforzadas del Art. 23 Ter 4 (~77) | ⬜ por verificar | |
| Cap. III Quinquies · Beneficiario Controlador (~90) | ✅ 2-sep-2026 | Decía «falta el árbol»; el árbol estaba desde el 20-ago sin que nadie lo importara |
| Cap. X · Manual (~94) | ⬜ por verificar | No afirma nada de VIZO, pero dice que falta una decisión de alcance: comprobar que siga abierta |
| Cap. XII · Capacitación (~104) | ✅ 31-ago y 2-sep-2026 | |
| Cap. XIII · Mecanismos automatizados, tabla de seis funciones (~108) | ✅ 2-sep-2026 | Tres filas daban «no» sobre cosas construidas; la fr. V quedó parcial de verdad |
| Cap. XIV · Auditoría (~124) | ⬜ por verificar | Dice que la bitácora encadenada y el manifiesto «ya son la mitad»: comprobar qué hay del paquete de evidencia por obligación |

## `docs/ROADMAP-2027.md`, otras secciones

| Sección | Estado | Qué se encontró |
|---|---|---|
| §1 · La tabla de fechas y sus transitorios | ⬜ por verificar | Contrastar cada renglón contra el `.txt` del DOF otra vez: es la base de todo lo demás |
| §3 · Lo que el contraste corrigió del análisis original | ⬜ por verificar | |
| §5 · Lo que sigue sin verificar | ⬜ por verificar | La lista de pendientes puede tener cosas ya resueltas |

## `docs/ALCANCE.md` — el mapa de rutas de F1

Catorce filas de la tabla de rutas más la tabla de estimación. Cada fila
declara un estado (`● existe`, `◐ rediseño`, `○ nueva`, `✅ construida`) y un
alcance.

| Fila | Estado | Qué se encontró |
|---|---|---|
| `/login` | ⬜ por verificar | |
| `/` Inicio | ⬜ por verificar | Dice `◐ rediseño`: comprobar si ya ocurrió |
| `/clientes` + `/nuevo` + `/[id]/expediente` | ⬜ por verificar | **Sabemos que tiene un error**: dice «las siete secciones de conocimiento» y desde el 2-sep son ocho |
| `/operaciones` + `/nueva` | ⬜ por verificar | |
| `/alertas` | ⬜ por verificar | Comprobar que mencione los tipos del Art. 41 fr. V |
| `/avisos` y `/avisos/[id]` | ⬜ por verificar | Dicen `○ nueva` |
| `/entidad` | ⬜ por verificar | |
| `/mer` | ⬜ por verificar | |
| `/clientes/[id]/expediente` §08 | ✅ 2-sep-2026 | Fila nueva |
| `/capacitacion` | ✅ 31-ago-2026 | Fila nueva |
| `/evidencia` | ⬜ por verificar | Dice `○ nueva` |
| `/calendario` | ⬜ por verificar | Dice `○ nueva` |
| `/configuracion` | ⬜ por verificar | Enumera pestañas: comprobar que estén todas y que no falte ninguna |
| Tabla de estimación (~151) | ⬜ por verificar | Si las rutas ya existen, la estimación sobra o cambia |

## Huecos reales encontrados durante el barrido

Se anotan aquí y **no se construyen** en este trabajo.

- **El «no se sabe» del Art. 41 fr. V no llega a la bandeja de alertas.** Un
  cliente sin clasificar y sin declaración PEP no levanta nada; se ve en el
  riel del expediente pero no en `/alertas`. Decisión de producto pendiente
  (ADR-33).
- **El cuarto supuesto del Art. 41 fr. V** —jurisdicciones— necesita dos
  fuentes que no tenemos contrastadas y un dato que el modelo no guarda.
- **La plantilla del Cap. XII no bloquea `DELETE`** como sí lo hacen las tres
  tablas de evidencia (ADR-31, «asimetría conocida»).
