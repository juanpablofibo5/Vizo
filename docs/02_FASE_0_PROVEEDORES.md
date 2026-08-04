# Fase 0 — Cotizaciones y certidumbre

Objetivo: cerrar todo lo que puede invalidar la arquitectura, antes de escribir código de producto.

---

## A. Descargas obligatorias antes de diseñar nada

| Qué | Dónde | Para qué |
|---|---|---|
| XSD del aviso — Fr. V Bis / V (inmuebles) | `sppld.sat.gob.mx/pld/interiores/inmuebles.html` | Especificación real del modelo de datos |
| XSD del aviso — Fr. VIII (vehículos) | `sppld.sat.gob.mx/pld/interiores/vehiculos.html` | Ídem |
| Instructivos de llenado de ambas | Mismas páginas | Reglas de negocio que el XSD no expresa |
| Ejemplos de XML de ambas | Mismas páginas | Fixtures para las pruebas |
| Plantillas .xlsm | Mismas páginas | Ver qué campos pide el SAT en la práctica |
| Criterios generales orientativos | `sppld.sat.gob.mx/pld/interiores/criterios.html` | Interpretación vigente del SAT |
| Tabla oficial de umbrales | `sppld.sat.gob.mx/pld/interiores/umbrales.html` | Contrastar contra el catálogo que vas a cargar |

Guardar todo en `regulatorio/` dentro del repo, con la fecha de descarga. Cuando salgan las RCG vas a necesitar saber contra qué versión construiste.

**Alerta a configurar:** publicación de las RCG en el DOF. Están vencidas desde el 16 de julio de 2026. Pueden salir cualquier día.

---

## B. Cotizaciones — preguntas exactas

### B.1 OpenSanctions (screening) — la más importante

Es la cotización que puede cambiar la viabilidad del proyecto. Preguntar textualmente:

1. VIZO es un SaaS que vende cumplimiento PLD a terceros en México. Los datos de OpenSanctions se consumen dentro del producto. **¿Eso cae en licencia de uso interno o en licencia reseller/OEM?** ¿Cuál es el precio anual de cada una?
2. ¿La cobertura de PEPs incluye funcionarios estatales y municipales de México, o solo federales?
3. ¿Incluye la Lista de Personas Bloqueadas de la UIF mexicana? ¿Y el listado del Art. 69-B del CFF? Si no, hay que ingerirlos aparte.
4. ¿Con qué frecuencia se actualiza OFAC SDN en el dataset?
5. Precio de la API hospedada para 500 / 2,000 / 10,000 consultas al mes.
6. ¿Existe el descuento de desarrollo/pre-lanzamiento que mencionan en su FAQ comercial?

**Si la licencia reseller resulta prohibitiva**, el plan B es un motor propio sobre listas públicas gratuitas (OFAC, ONU vía UIF, 69-B, LPB) más PEP construido de fuentes abiertas. Es viable, pero la calidad del PEP es el punto débil y hay que documentarlo frente al cliente y frente al consultor.

### B.2 KYC

**Didit** (primario candidato)
1. ¿El módulo de validación de vigencia de credencial INE consulta el registro del INE en tiempo real? ¿Costo por consulta?
2. ¿Validan CURP contra RENAPO? ¿RFC contra el SAT?
3. ¿Qué opciones de retención y de residencia de datos ofrecen? (relevante para el contrato de encargado)
4. Confirmar el precio del flujo completo y el tope real del tier gratuito.

**Nubarium** (complemento mexicano)
1. Precio por consulta: OCR de INE, validación de vigencia INE, CURP/RENAPO, RFC/SAT, prueba de vida.
2. ¿Hay mínimo mensual o contrato forzoso?
3. ¿Se puede consumir por API sin plataforma?

Comparar contra Incode (que ya absorbió MetaMap) y Truora solo si alguna de las dos anteriores no cubre las validaciones mexicanas.

### B.3 PSC NOM-151 (sellado)

Cotizar los tres: **AllSign**, **Cincel**, **Incode PSC**.

1. Precio por constancia de conservación a volúmenes de 100 / 500 / 2,000 al mes.
2. ¿La API permite sellar un **hash** que yo calculo, sin subirles el documento? (Esto importa: si hay que subir la identificación del cliente al PSC, se agrega un sub-encargado a la cadena de datos personales.)
3. ¿Emiten también sello digital de tiempo RFC 3161 por separado?
4. ¿La constancia incluye la cadena de verificación para presentarla ante el SAT sin depender de su plataforma?
5. ¿Cuál es su acreditación vigente ante la Secretaría de Economía y su publicación en el DOF?

La pregunta 2 es la que discrimina. Un PSC que solo sella hashes es estructuralmente mejor para VIZO: no ve datos personales.

### B.4 Infraestructura

- Supabase Pro: confirmar límites de storage y costo del excedente proyectado a 10 años de conservación.
- Vercel: confirmar si el plan gratuito alcanza para el piloto o hay que ir a Pro.

---

## C. Consultor PLD — lista cerrada de preguntas

Llevar esto por escrito. No es una conversación exploratoria; es una validación con entregable.

**Sobre umbrales**
1. ¿Confirmas esta tabla de umbrales para Fr. V Bis y Fr. VIII con UMA 2026 de $117.31, y que la vigencia arranca el 1 de febrero?
2. ¿Confirmas que Art. 17 se evalúa sin IVA y Art. 32 con IVA, y que el aviso se reporta con el monto total incluyendo contribuciones?

**Sobre acumulación**
3. ¿La ventana de 6 meses se cuenta hacia atrás desde cada operación, o son periodos fijos?
4. ¿Se acumulan operaciones de distintas sucursales del mismo obligado? (Necesitamos que sea sí; confírmalo con fundamento.)
5. ¿Cómo se identifica al "mismo cliente" cuando es extranjero sin RFC? ¿Pasaporte? ¿Qué criterio resiste una verificación?

**Sobre expediente y sellado**
6. ¿Una constancia NOM-151 sobre un manifiesto que contiene los hashes de todos los documentos satisface la exigencia de fecha cierta, o la autoridad espera constancia por documento?
7. ¿Qué campos son obligatorios en el expediente para cada fracción, más allá de lo que exige el XSD?
8. ¿Qué se conserva de una coincidencia de screening que se descartó?

**Sobre las RCG**
9. ¿Qué esperas que cambie en los formatos cuando salgan? ¿Vale la pena esperar a que se publiquen para cerrar el diseño del aviso?
10. ¿El aviso de 24 horas por operación intentada cambia el flujo operativo del cliente, o solo agrega un tipo de reporte?

**Entregable esperado del consultor:** las respuestas por escrito, firmadas o al menos en correo. Es el respaldo de por qué el sistema calcula como calcula.

---

## D. Legal (con Grecia)

1. **Contrato de encargado del tratamiento** entre VIZO y cada cliente obligado, bajo la LFPDPPP vigente desde marzo de 2025.
2. Cláusula de **sub-encargados** que nombre a Supabase, Vercel, el proveedor de KYC, el de screening y el PSC.
3. Cláusula de **transferencia internacional** (los datos se procesan en EE. UU.).
4. **Aviso de privacidad** de VIZO: integral y simplificado. El simplificado se muestra en el formulario de captura antes de la primera foto.
5. Modelo de **contrato de servicio** con delimitación explícita de responsabilidad: VIZO no presenta el aviso, no sustituye al REC, y el sujeto obligado sigue siendo el cliente. Esto ya está bien dicho en el pitch; tiene que estar igual de bien dicho en el contrato.

---

## E. Con el cliente ancla

1. ¿Qué fracción del Art. 17 realiza? ¿Solo una?
2. ¿Cuántas sucursales y cuántos avisos presentó en los últimos 6 meses?
3. ¿Quién es el REC y tiene e.firma vigente?
4. ¿Cuál es la métrica de decisión del piloto, por escrito? Propuesta: porcentaje de expedientes completos sin seguimiento manual, y minutos por aviso.
5. ¿Están dispuestos a correr el piloto en paralelo a su proceso actual durante un mes completo?

---

## Entregable de la Fase 0

Un archivo `regulatorio/decisiones.md` con:

- Cada cotización con fecha, monto y contacto
- Cada respuesta del consultor
- La tabla de umbrales validada, lista para cargar al catálogo
- Los XSD descargados y fechados
- Los contratos en borrador

Sin esto cerrado, escribir código de producto es apostar.
