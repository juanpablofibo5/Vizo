# Runbook 04 · Soporte

**Cuándo:** un cliente reporta un problema o pide ayuda.
**Quién:** cualquiera del equipo.
**La regla que gobierna todo lo demás:** somos **encargados** bajo la LFPDPPP. Los datos del portal de un obligado son de él y de sus clientes finales; nosotros los tratamos para prestarle el servicio, y para nada más.

---

## 1. Lo primero: casi nunca hace falta ver sus datos

La mayoría de los reportes se resuelven sin abrir la base:

| Reporte típico | Casi siempre es | Cómo se confirma sin mirar datos |
|---|---|---|
| «No veo mis operaciones» | Entró con otra cuenta o en otro obligado | Que lea el RFC del encabezado del portal |
| «El botón de aprobar está apagado» | Su rol es capturista | Que lea el chip junto a su nombre |
| «No me deja generar el aviso» | Falta un dato del desarrollo o del cliente | El mensaje de error lo dice; que lo lea completo |
| «El sistema no calculó bien» | Casi siempre calculó bien | Que abra el **veredicto explicable** de esa operación: trae la UMA, su vigencia, el umbral, la base y la versión de catálogo |

Pedirle al cliente que lea su pantalla no es evasión: es la forma más rápida, y evita que dos personas miren datos personales que no hacía falta mirar.

---

## 2. Cuando sí hay que mirar

**Consulta de solo lectura, mínima y anotada.** Antes de correr nada:

1. Que el cliente **lo pida explícitamente** y por escrito (correo o ticket, no de palabra).
2. Se mira **lo mínimo**: la fila que explica el síntoma, no el expediente completo.
3. Se consulta con `select`. Nunca `update` ni `delete` sobre datos de un obligado.
4. Queda **anotado en el ticket**: qué se consultó, cuándo, quién y por qué.

Lo que casi siempre alcanza, sin tocar un solo dato personal:

```sql
-- El estado de un aviso y su historia, por id opaco.
select id, to_char(periodo,'YYYY-MM') as periodo, estatus::text, tipo::text,
       fragmentos, aprobado_en, acuse_registrado_en
  from avisos where tenant_id = '<TENANT_ID>' order by periodo desc;

-- Qué pasó, en la bitácora, sin leer el contenido de los objetos.
select ocurrido_en, evento, objeto_tipo, objeto_id
  from bitacora where tenant_id = '<TENANT_ID>'
 order by ocurrido_en desc limit 50;

-- Por qué el motor decidió lo que decidió, sin abrir al cliente final.
select id, operacion_id, resultado_aviso::text, motivo, uma_valor, uma_vigencia,
       catalogo_version, evaluado_en
  from evaluaciones_umbral where tenant_id = '<TENANT_ID>' order by evaluado_en desc limit 20;
```

---

## 3. Lo que jamás

- **Impersonation.** Nadie de VIZO puede «entrar como» un cliente. Ni con su permiso, ni para reproducir un error, ni «un minuto». Es una de las seis fronteras de producto (`ALCANCE.md` §0) y no tiene excepción operativa: su valor entero está en no tenerla. Cuando exista soporte con rol propio (F2), será de **solo lectura y con consentimiento registrado**.
- **Editar datos de clientes finales.** Ni para «arreglarle» un RFC mal capturado. Se le indica cómo corregirlo; la corrección lleva su firma, no la nuestra.
- **Tocar la bitácora.** Es append-only. No hay caso de soporte que justifique un `update`, y si pareciera haberlo, el caso está mal entendido.
- **Aprobar o presentar por el cliente.** Toda decisión con peso legal es humana y suya.
- **Copiar datos personales a un ticket, un chat, una captura de pantalla o un log.** Nombres, RFC de clientes finales, CURP, domicilios, identificaciones. Se usan ids opacos. Los biométricos son datos sensibles: la multa se duplica.
- **Pedir o recibir la contraseña del cliente.** Si no puede entrar, se le manda el restablecimiento; nosotros no la vemos nunca.

---

## 4. Preguntas regulatorias

Un cliente va a preguntar cosas como «¿esta operación se avisa?» o «¿me alcanza este expediente?».

**VIZO no asesora legalmente** (frontera 5). Se puede explicar **qué hizo el sistema y con qué datos** —para eso existe el veredicto explicable—, y se debe distinguir eso de decir qué debe hacer él. La respuesta correcta a una duda de interpretación es: *«el sistema aplicó esta regla con esta fuente; si la interpretación de tu caso está en duda, es una consulta para tu especialista PLD»*.

Las dudas que se repiten se anotan en el issue de preguntas por confirmar (#3). Ahí es donde el producto aprende; en el chat de soporte se pierden.

---

## 5. Escalamiento

| Situación | Qué se hace |
|---|---|
| Un cálculo que parece equivocado | **Se reproduce en local con un test antes de tocar nada.** Si el test falla, es un defecto: se arregla en la capa más fuerte posible y se agrega a la suite |
| Un valor del catálogo posiblemente mal cargado | **Máxima prioridad.** Afecta a toda la cartera. Se verifica contra el DOF (runbook 02) antes de decirle nada al cliente |
| Sospecha de acceso indebido a datos | Se documenta la hora, el usuario y lo consultado; se avisa al obligado. Somos encargados: la notificación al titular es suya, pero la información se la damos completa |
| El cliente pide algo que cruza una frontera | Se dice que no, con la razón, y qué sí se puede hacer en su lugar. Las fronteras se venden tanto como las funciones |
