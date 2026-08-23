# El sistema visual de VIZO

Para quien vaya a diseñar sobre este producto —persona o herramienta—. No es
una guía de estilo aspiracional: es lo que hoy está en `app/globals.css` y en
`app/componentes/`, con las razones de por qué es así.

## La regla que manda sobre todas las demás

> **En este portal el color es INFORMACIÓN, no estilo.**

VIZO se lee todos los días bajo presión de plazo, y la jerarquía tiene que
decir en un vistazo qué está en regla y qué no. Los tres estados regulatorios
—en regla, por vencer, vencido— tienen color propio y ese color significa algo.

**Consecuencia directa: una propuesta de diseño que mueva el verdigrís está
tocando información, no estilo.** Si el rediseño quiere repintar el acento, lo
que en realidad está proponiendo es reacomodar el semáforo de la pantalla que
responde «¿estoy en regla hoy?».

## Marca contra estado

| | Color | Significa | Dónde entra |
|---|---|---|---|
| **Marca** | `#E8590C` claro · `#FF7A1A` oscuro | VIZO, la empresa | **Solo donde no hay semáforo**: barra lateral, acceso, onboarding y estados vacíos |
| **Estado** | verdigrís `#1D6B58` / ámbar `#A16207` / granate `#8C2F2F` | en regla / por vencer / vencido | Chips, `.estado`, bordes de tarjeta, mensajes |

El naranja **nunca** entra en un chip, un `.estado` ni un borde de tarjeta.
`tests/diseno/semantica-del-color.test.ts` lo vigila y falla si alguien lo mete.

**Y el naranja no se usa como texto sobre fondo claro:** rinde 3.58:1 sobre
blanco y 3.30:1 sobre el `#F4F6F5` del portal, por debajo del 4.5:1 que pide un
texto. Como relleno de un contenedor o de un icono grande, sí.

El ámbar de «por vencer» se mantiene separado del naranja de marca por matiz:
14.5° en tema claro y 13.9° en oscuro. La prueba exige más de 10°.

## La marca

**«El contenedor»**: la V calada en un cuadrado con el mismo radio del portal.
Elegida el 22-ago-2026 sobre otras nueve rutas porque se comporta bien en todos
los tamaños —a 16 px sigue nítida—, como ícono de app se ve nativa, y hereda
literalmente la geometría del producto. Su debilidad, aceptada a sabiendas: es
poco diferenciada.

- Trazado: `rect x=4 y=4 w=56 h=56 rx=15` en lienzo de 64; V en
  `M20 20 L32 44 L44 20`, trazo de 8 u, extremos y vértice redondeados.
- **La V va calada**, no pintada del color del fondo: así toma lo que haya
  detrás y es correcta sobre el fondo del portal, sobre una tarjeta blanca y
  sobre el sello monocromo del PDF.
- Wordmark: cualquier grotesca neutra con `letter-spacing: .16em`. El
  contenedor hace el trabajo; la letra no compite.
- Vive en `app/componentes/marca.tsx`. **No hay archivos de imagen en el repo**:
  el trazado va en línea con `currentColor` y el color entra por `--marca`.

## Fichas

Claro / oscuro (`prefers-color-scheme`). Los neutrales tienen sesgo hacia el
acento a propósito: un gris puro se lee sin elegir.

```
--fondo        #F4F6F5  /  #0D1614      --texto        #14211E  /  #E7EDEB
--superficie   #FFFFFF  /  #141F1D      --texto-suave  #475853  /  #B2C1BD
--superficie-2 #FAFBFA  /  #182422      --texto-tenue  #728380  /  #7E8F8B
--linea        #E2E7E5  /  #23322F      --acento       #1D6B58  /  #56B99B
--linea-fuerte #C9D2CF  /  #354844      --acento-vivo  #17836A  /  #6ACFB0
                                        --acento-suave #E4F0EC  /  #17302A
--ok       #1D6B58 / #56B99B    --alerta  #A16207 / #D9A441
--critico  #8C2F2F / #D2706A    --marca   #E8590C / #FF7A1A

--radio 7px     --lateral 15rem
--sans system-ui     --mono ui-monospace
```

## Tipografía y escala

`h1` 1.45rem / `h2` 1.08rem / `h3` .95rem / cuerpo 15px con interlínea 1.55.
Encabezados con `letter-spacing` negativo; etiquetas de tabla y `.estado` en
versalitas con `letter-spacing` positivo.

**La mono no es decorativa**: se usa donde el dato se coteja carácter por
carácter —RFC, hashes, claves de catálogo, el `.estado`—. Los números que se
comparan en columna llevan `font-variant-numeric: tabular-nums`.

## Componentes que ya existen

`.tarjeta` · `.tarjeta-alerta` · `.chip` · `.chip-alerta` · `.estado` (ok /
aviso / critico / neutro) · `.error` · `.aviso` · `.exito` · `.rejilla` ·
`.tabla-envoltura` + `table` · `.fila` (formularios) · `button` y
`button.secundario` · `.hash` · `.sub` · `.marca-disco` · `.marca-lockup`.

Las tablas alinean arriba, no al centro: en Operaciones, abrir «Por qué» hace
crecer una celda a varias veces la altura del renglón, y con el centrado la
fecha y el monto quedaban flotando lejos del dato que describen.

## Las quince pantallas

**Operación** — Inicio (el semáforo: «¿estoy en regla hoy?») · Clientes · Alta
de cliente · Expediente · Histórico del expediente · Operaciones · Registrar
operación · Alertas
**Cumplimiento** — Avisos · Detalle de aviso · Calendario · Constancia ·
Evidencia
**Administración** — Configuración
Fuera del armazón: Acceso.

El armazón es `Marco` + `PanelLateral` (barra de 15rem con la marca, el
obligado, el mapa del producto y el usuario). En móvil hay una `.barra-movil`.

## Lo que el expediente enseña, y por qué importa al diseñar

La página del cliente tiene **cinco secciones** de conocimiento del cliente
—revisión anual, grado de riesgo, perfil transaccional, aprobación para operar
y declaración PEP— y **van a ser siete**: faltan los cuestionarios del Art. 23
Ter 3 y las medidas reforzadas del 23 Ter 4.

**El patrón de sección se diseña para siete, no para cinco.** Es la página más
densa del producto y la que peor escala si el patrón se ajusta al conteo de hoy.

Todas viven detrás de una puerta: si el cliente no tiene expediente abierto, la
pantalla muestra solo «Abrir expediente» (ADR-24). Esa pantalla es un **estado
vacío**, y por tanto territorio de la marca.

## Tres cosas que no se piden

1. **No repintar el acento.** Ver la primera regla.
2. **No usar el naranja para decir un estado**, ni «solo esta vez».
3. **No meter librerías** de iconos o de animación sin decisión registrada. Los
   iconos actuales son un set propio en `app/componentes/iconos.tsx`.

## Dónde están las decisiones

`docs/DECISIONES.md` — los ADR, incluido el 24 sobre la puerta del expediente.
`docs/ALCANCE.md` — las seis fronteras de producto.
`app/globals.css` — el encabezado explica por qué esto no es decoración.
