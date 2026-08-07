# VIZO — dónde vamos

**Qué estamos construyendo.** Un sistema que le permite a una empresa inmobiliaria cumplir con la ley anti-lavado de dinero sin equivocarse. Hoy eso se lleva en Excel, y el Excel falla justo en lo difícil: no se da cuenta cuando los pagos parciales de un cliente suman lo suficiente para que haya que avisarle al SAT. Ese aviso omitido es una multa de millones.

**Estamos en la semana 1 de 12.** Es un prototipo para demostrar que el ciclo completo funciona, antes de invertir en escalarlo.

## Lo que ya está listo

**El plan completo, semana por semana.** Cada una de las 12 semanas tiene un entregable concreto que un tercero puede verificar en 10 minutos. Nada de "avancé un poco".

**Las reglas del negocio escritas como examen, antes de programar.** Antes de escribir una sola línea del cerebro del sistema, dejamos por escrito los casos exactos que tiene que resolver bien, con números y resultados esperados. El sistema estará terminado cuando pase todos. Es la diferencia entre "creo que calcula bien" y "está demostrado".

**La infraestructura.** Base de datos, servidor y revisión automática funcionando y separados de cualquier otro proyecto.

**Los documentos oficiales del SAT.** Bajamos el formato exacto que exige la autoridad. Y ahí encontramos algo revelador: **el ejemplo oficial que el SAT publica tiene un error de dedo y no cumple con su propio formato.** Quien haya copiado ese ejemplo para construir su software está generando avisos que pueden ser rechazados. Nosotros seguimos el formato oficial, no el ejemplo.

**El archivero digital, terminado y probado.** Esta semana quedó construida la estructura donde vivirá toda la información. Tiene tres cosas que no se pueden agregar después:

- Los datos de cada empresa quedan **aislados**: probamos que una no puede ver los de otra.
- Hay un **libro de registro inalterable**: cada acción queda encadenada a la anterior, y si alguien intentara modificar el historial, el sistema señala exactamente dónde. Ya lo probamos alterándolo a propósito.
- **Las reglas de la ley viven como datos, no dentro del programa.** Cuando cambien los montos —y van a cambiar pronto—, se actualiza un dato. No se reprograma nada.

## En qué estamos ahora

Cargando los montos oficiales de la ley al sistema y traduciendo el formato del SAT a la estructura de datos.

## Lo que sigue

Semanas 2 a 4: el cerebro que decide cuándo hay que avisar. Semanas 5 a 8: las pantallas para capturar clientes, documentos y pagos. Semanas 9 a 12: la generación del aviso oficial y la demostración completa.
