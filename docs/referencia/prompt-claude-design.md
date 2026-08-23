Estás rediseñando VIZO, un portal de cumplimiento antilavado (LFPIORPI) que ya
existe y está en producción. No es un proyecto nuevo: hay 15 pantallas vivas,
un sistema de fichas en `app/globals.css` y 24 decisiones registradas en
`docs/DECISIONES.md`. Lee `docs/DISENO.md` antes de proponer nada.

Lo usa el responsable de cumplimiento de una desarrolladora inmobiliaria
mediana en México —a veces el contador, a veces el dueño—. No es abogado. Abre
el portal con una sola pregunta, «¿estoy en regla hoy?», y trabaja contra un
plazo fijo: el día 17 de cada mes. Le teme más a la omisión silenciosa que al
error visible. Equivocarse cuesta multas de cientos de miles a millones de
pesos.

## Tres cosas que no se negocian

**1. El color es información, no estilo.** Tres colores significan un estado
regulatorio y no se pueden mover ni reasignar:

    verdigrís  #1D6B58 claro / #56B99B oscuro   = en regla
    ámbar      #A16207 claro / #D9A441 oscuro   = por vencer
    granate    #8C2F2F claro / #D2706A oscuro   = vencido

Si tu propuesta necesita mover el verdigrís, no es una decisión de estilo:
está reacomodando el semáforo de la pantalla que responde «¿estoy en regla
hoy?». Eso se discute aparte, no se hace de paso.

**2. El naranja #E8590C / #FF7A1A es la MARCA, no un estado.** Solo entra en
barra lateral, acceso, onboarding y estados vacíos. Nunca en un chip, un
`.estado`, un borde de tarjeta ni un mensaje. Y nunca como texto sobre fondo
claro: rinde 3.58:1, por debajo del 4.5:1 que pide un texto.

**3. Ninguna fuente desde un CDN.** Hoy el portal usa `system-ui` y no carga
nada externo. Si propones Barlow, tiene que entrar por `next/font`, que la
sirve desde el propio dominio. Un `<link>` a fonts.googleapis.com mandaría la
IP de cada usuario a un tercero desde pantallas que muestran nombres, RFC y
domicilios — VIZO es *encargado* bajo la LFPDPPP y esa transferencia no la
autorizó nadie.

El sistema Industry úsalo para el **cromo**: superficies, líneas, tipografía,
espaciado, densidad, elevación, radios. Ahí tienes libertad completa.

## Usa estos nombres exactos

Si devuelves `--color-primary` y yo tengo `--acento`, la integración es
traducción a mano y ahí es donde se cuelan los errores. Trabaja sobre estas
fichas, que ya existen:

    --fondo  --superficie  --superficie-2  --linea  --linea-fuerte
    --texto  --texto-suave  --texto-tenue
    --acento  --acento-vivo  --acento-suave
    --ok  --ok-suave  --alerta  --alerta-suave  --critico  --critico-suave
    --marca      --sans  --mono      --radio  --lateral

Puedes **agregar** fichas nuevas (hover, foco, elevación, espaciado). No
renombres ni elimines las que están.

Y estas clases son estructurales — el HTML de 15 pantallas depende de ellas:

    .portal .lateral .contenido .barra-movil .marca .usuario nav.areas
    .tarjeta .tarjeta-alerta .rejilla .fila .tabla-envoltura
    .chip .chip-alerta .estado (.ok .aviso .critico .neutro)
    .error .aviso .exito .sub .pequeno .tenue .mono .hash .sr-solo
    .marca-disco .marca-lockup .marca-nombre

Redefine lo que hacen. No las renombres.

## Qué falta y es lo que más quiero de ti

El portal nunca tuvo un pase de interacción. **No hay estados de hover, foco ni
active definidos como sistema**, y no hay anillo de foco de teclado. Eso es lo
más valioso que puedes entregar.

Dos reglas para eso:

- Hover, foco y active modifican luminancia, fondo o elevación **del mismo
  color semántico**; nunca cambian de matiz hacia otro color con significado.
- El anillo de foco va en un **neutral de tinta**, no en el acento ni en la
  marca. Un foco verdigrís sobre una fila vencida manda dos mensajes a la vez.

## Por dónde empezar

Por el **expediente del cliente**. Es la pantalla más densa y la que peor
escala: hoy tiene cinco secciones de conocimiento del cliente —revisión anual,
grado de riesgo, perfil transaccional, aprobación para operar, declaración
PEP— y **van a ser siete**. Diseña el patrón de sección para siete.

Después: Inicio (el semáforo), Operaciones (tabla densa con veredictos que se
expanden), Alertas, Avisos, y el resto.

Plataforma: **web de escritorio**. Hay una barra móvil para consulta, pero el
trabajo se hace sentado.

## Cómo quiero la entrega

Necesito poder aplicarlo sin traducir. Devuelve:

1. **El bloque de fichas completo**, claro y oscuro, con los nombres de arriba,
   listo para reemplazar el `:root` y el `@media (prefers-color-scheme: dark)`
   de `app/globals.css`.
2. **Las reglas de cada clase estructural** que cambies, con su nombre actual.
3. **Los estados de interacción** como fichas más selectores, definidos una
   sola vez y no repartidos por pantalla.
4. **Una nota de qué rompiste a propósito** y por qué.

Si puedes abrir un PR contra `juanpablofibo5/Vizo`, hazlo. Si no, dame los
archivos.

## Lo que va a juzgar tu propuesta

`tests/diseno/semantica-del-color.test.ts` corre en cada commit y falla si:

- un naranja de marca aparece dentro de `.chip`, `.estado`, `.tarjeta-alerta`,
  `.error`, `.aviso` o `.exito`;
- los ámbares de `--alerta` se acercan a menos de 10° de matiz del naranja de
  marca de su tema;
- alguno de los selectores del semáforo desaparece.

No es burocracia: es la única forma de que dentro de seis meses el color siga
diciendo lo que dice hoy. Si tu propuesta necesita romper una de esas reglas,
dilo explícitamente en la nota del punto 4 en vez de rodearla.
