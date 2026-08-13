# Runbooks del backoffice

**Qué son:** los procedimientos que hoy ejecuta una persona de VIZO a mano, escritos para que se puedan seguir sin reconstruir el razonamiento cada vez.

**Por qué existen ahora y no después.** La decisión de `ALCANCE.md` §2 es explícita: *en F1 el backoffice es manual y documentado; el software del backoffice es F2, condicionado al go de viabilidad.* Construir pantallas para operar 1–3 clientes piloto es vanidad. No documentar cómo se opera es lo contrario: es dejar que el procedimiento viva en la cabeza de quien lo hizo la primera vez.

Estos documentos son también **el diseño del backoffice de F2**. Lo que aquí es un `psql` con doble revisión humana, allá será una pantalla con un rol que carga y otro que aprueba. El procedimiento no cambia; cambia quién lo teclea.

| Runbook | Cuándo se ejecuta | Riesgo si sale mal |
|---|---|---|
| [01 · Alta de un obligado](01-alta-de-obligado.md) | Al cerrar una venta | El cliente no puede operar, o —peor— opera con datos de otro |
| [02 · Carga de una vigencia regulatoria](02-carga-de-vigencias.md) | Cuando el DOF publica | **Afecta a todos los clientes a la vez.** Un umbral mal cargado calcula mal y nadie lo nota |
| [03 · Monitoreo de la flota](03-monitoreo.md) | Semanal, y todo día 10 al 17 | Un obligado incumple un plazo y se entera después de la multa |
| [04 · Soporte](04-soporte.md) | Cuando un cliente pide ayuda | Se mira lo que no se debe, o se toca lo que jamás |

## Las reglas que atraviesan los cuatro

1. **Quien carga no es quien aprueba.** Es el mismo patrón que el aviso ejerce en el producto, aplicado a nosotros. En F1 lo ejercen dos personas; en F2, dos roles.
2. **Ningún valor regulatorio se teclea sin fuente oficial a la vista.** El DOF, con código de publicación. Un análisis secundario no es fuente.
3. **Nada de esto se hace con prisa un día 16.** Si el calendario aprieta, se avisa al cliente y se hace bien al día siguiente. Un dato mal cargado sobrevive al apuro que lo causó.
4. **Sin impersonation, nunca.** Ni con permiso del cliente. La regla no tiene excepción operativa porque su valor está en no tenerla (`ALCANCE.md` §0, frontera 6).
5. **Todo lo que se ejecuta contra producción se escribe antes.** El SQL se redacta, se revisa y se pega; no se improvisa en la terminal.
