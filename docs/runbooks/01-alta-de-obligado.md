# Runbook 01 · Alta de un obligado

**Cuándo:** al cerrar una venta, como parte del proyecto de implementación (cobrado aparte de la suscripción).
**Quién:** una persona de VIZO con acceso al proyecto de Supabase.
**Cuánto toma:** 20–40 minutos si los datos llegaron completos. El tiempo real se lo lleva conseguirlos.

---

## 0. Lo que hay que tener ANTES de tocar la base

Esta lista no es burocracia: cada dato de aquí bloquea algo concreto del sistema, y conseguirlos a medio camino es cómo se dan de alta obligados a los que después les falta algo que nadie recuerda.

| Dato | De dónde sale | Qué bloquea si falta |
|---|---|---|
| RFC y razón social | Constancia de situación fiscal | Todo. Es la unidad de cobro y la llave del aislamiento |
| Domicilio fiscal | Constancia | El aviso lo reporta |
| **Fecha de alta y registro ante el SAT** | Acuse del alta en actividades vulnerables | Sin ella no se sabe desde qué mes debe informar, y los informes en cero anteriores quedan invisibles |
| Actividades vulnerables que ejerce | Acuse del alta | El motor no evalúa nada sin esto |
| Sucursales (nombre y clave) | El cliente | No se puede registrar una operación |
| Desarrollos inmobiliarios (solo Fr. V Bis) | El cliente | El aviso los describe: sin uno no hay aviso posible |
| Usuarios: nombre, correo, rol | El cliente | Nadie puede entrar |

**El correo del usuario admin importa más de lo que parece:** es quien va a aprobar avisos y expedientes, y su nombre queda en la bitácora de cada aprobación. Que sea el correo de la persona, no uno compartido del despacho.

---

## 1. Verificar que el RFC no existe

`tenants.rfc` es único. Si ya existe, **no se da de alta otra vez**: o es una reactivación o alguien lo dio de alta ya.

```sql
select id, rfc, razon_social, activo, created_at from tenants where rfc = 'XXXX000000XXX';
```

---

## 2. El alta, en una sola transacción

Todo junto: un obligado a medio crear es peor que uno no creado, porque parece que existe.

```sql
begin;

insert into tenants (rfc, razon_social, fecha_alta_autoridad, domicilio) values (
  'XXXX000000XXX',
  'Razón Social SA de CV',
  date '2026-03-09',          -- alta ante el SAT; si el cliente no la tiene todavía, va NULL
  '{"calle":"...","numero":"...","colonia":"...","cp":"...","municipio":"...","estado":"..."}'::jsonb
) returning id;                -- ← anotar este id: se usa en todo lo demás

-- Las actividades contratadas, por fracción. NO por id: los ids cambian entre
-- ambientes y la fracción es lo que el cliente firmó.
insert into actividades_tenant (tenant_id, actividad_id)
select '<TENANT_ID>', id from actividades_vulnerables where fraccion = 'V_BIS';

insert into sucursales (tenant_id, nombre, clave) values
  ('<TENANT_ID>', 'Matriz', 'MTZ');

commit;
```

Los **desarrollos inmobiliarios** se cargan después, con los datos que exige el XSD del aviso (entidad, CP, colonia, calle, tipo, monto, unidades, costo por unidad). Si el cliente no los tiene a la mano, se deja para la sesión de capacitación: es un campo del aviso, no del alta.

> `fecha_alta_autoridad` tiene un `CHECK` que la exige entre el 17-jul-2013 y hoy. Si el cliente da una fecha futura, es que confundió el dato — probablemente con la fecha en que *piensa* darse de alta.

---

## 3. Los usuarios: por la API de Auth, nunca por INSERT

En local el seed inserta directo en `auth.users` porque es local. **En producción no.** El flujo es:

```ts
// 1. Invitar. El cliente fija su propia contraseña desde el correo:
//    VIZO nunca la ve, nunca la teclea, nunca la guarda.
const { data } = await admin.auth.admin.inviteUserByEmail('persona@cliente.mx')

// 2. El tenant y el rol van en app_metadata, que solo el servicio de Auth
//    puede escribir. En user_metadata serían AUTO-ASIGNABLES por el propio
//    usuario, y por lo tanto inservibles como control de acceso: cualquiera
//    podría declararse admin de otro obligado.
await admin.auth.admin.updateUserById(data.user.id, {
  app_metadata: { tenant_id: '<TENANT_ID>', rol: 'admin' },
})
```

```sql
-- 3. La fila de la aplicación, con el MISMO id que auth.users:
--    bitacora.actor_id apunta a usuarios(tenant_id, id), y sin esta fila el
--    usuario entra pero no puede escribir nada.
insert into usuarios (id, tenant_id, rol, nombre, email)
values ('<AUTH_USER_ID>', '<TENANT_ID>', 'admin', 'Nombre Apellido', 'persona@cliente.mx');
```

**Al menos dos usuarios**, uno `admin` y uno `capturista`, salvo que el obligado sea de una sola persona. La separación captura/aprobación es lo regulatoriamente relevante y es lo que la demo enseña.

---

## 4. La verificación es el propio portal

No hay checklist aparte: **el checklist de arranque de la pantalla de Inicio es la verificación**. Se entra con el usuario del cliente y se mira.

| Lo que se ve | Qué significa |
|---|---|
| «Sin actividad vulnerable contratada» bajo la razón social | El paso 2 falló, o se contrató la fracción equivocada |
| El semáforo no aparece | No hay actividad contratada: el sistema no puede opinar sobre cumplimiento, y no finge que sí |
| Pasos marcados «VIZO» sin palomear | Trabajo nuestro pendiente: sucursal, desarrollo, actividad |
| Pasos sin marca y sin «VIZO» | Trabajo del cliente: se le enseñan en la capacitación |

El arranque **no se declara terminado hasta que el cliente cierra su primer periodo con acuse**. Hasta ese momento nadie sabe si el circuito completo funciona para ese obligado, y averiguarlo un día 17 es tarde.

---

## 5. Lo que NO se hace en el alta

- **No se dan de alta clientes finales del obligado.** Sus compradores son sus datos personales; nosotros somos encargados, no coautores de su expediente.
- **No se capturan operaciones por el cliente.** Quien captura queda en la bitácora, y esa firma no es nuestra.
- **No se aprueba nada.** Ni expedientes ni avisos: toda decisión con peso legal es del obligado.
- **No se pone la contraseña del cliente**, ni siquiera una temporal "para que la cambie después".

---

## 6. Cuando el alta sale mal

| Síntoma | Causa casi siempre | Qué hacer |
|---|---|---|
| El usuario entra y ve el portal vacío o un error de permisos | `app_metadata` sin `tenant_id`/`rol`, o falta la fila en `usuarios` | Revisar los dos; el JWT se refresca al volver a entrar |
| `insert or update on table "usuarios" violates foreign key` | El id no coincide con `auth.users` | Usar el id que devolvió la invitación |
| El cliente reporta que "no ve sus datos" | Casi nunca es RLS: casi siempre entró con el usuario de otra cuenta | Confirmar el correo y el RFC que muestra el encabezado del portal |
| Se dio de alta con el RFC equivocado | — | **No se edita el RFC.** Se da de baja (`activo = false`) y se hace el alta correcta. El RFC es la llave de todo lo que ya se registró |
