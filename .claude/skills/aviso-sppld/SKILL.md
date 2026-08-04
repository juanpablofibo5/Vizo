---
name: aviso-sppld
description: Reglas para generar, fragmentar y validar el archivo XML del aviso al Sistema del Portal de Prevención de Lavado de Dinero del SAT, incluyendo informes en cero y el flujo de aprobación humana. Usar al tocar la generación de avisos, la validación contra XSD, el calendario de presentación o el manejo de acuses.
---

# Aviso al SPPLD

## Qué es y qué no es

El SPPLD es un portal web. **No tiene API.** El aviso se presenta manualmente subiendo un archivo XML, autenticado con la e.firma del Representante Encargado de Cumplimiento.

VIZO **genera y deja listo** el aviso. **Nunca lo presenta.** El REC lo sube y conserva la responsabilidad legal. Si una tarea implica automatizar el envío, para y pregunta.

## Fuente de verdad

Los XSD, instructivos y ejemplos de XML están publicados **por actividad vulnerable** en el portal del SAT y viven en `regulatorio/xsd/`. La tabla `formatos_aviso` apunta a la versión vigente para cada actividad y fecha.

Nunca inferir la estructura del XML. Leer el XSD.

## Restricciones técnicas duras

| Restricción | Valor | Consecuencia |
|---|---|---|
| Tamaño máximo del XML | **2 MB** | Fragmentar en lotes; un obligado con cientos de avisos lo rebasa |
| Extensión | `.xml` | El portal rechaza otras |
| Fecha límite de presentación | día **17** del mes siguiente | Alerta a partir del día 10 |

## Tipos de reporte

1. **Aviso normal** — operación individual que rebasa el umbral de aviso.
2. **Aviso por acumulación** — la suma de 6 meses del mismo cliente y misma actividad cruza el umbral. Se presenta en el periodo en que se cruzó, no al cierre.
3. **Informe en cero** — cuando no hubo operaciones reportables en el mes calendario. **Es obligatorio.** No presentarlo es incumplimiento igual que omitir un aviso.
4. **Aviso modificatorio** — corrección de un aviso previo.
5. **Aviso de 24 horas** — por operación intentada o sospechosa. Queda activado cuando se publiquen las Reglas de Carácter General. Diseñar el modelo de datos para soportarlo desde ahora: es *event-driven*, no batch.

## Pipeline de generación

```
expedientes aprobados
  → agrupar por tenant + actividad + periodo
  → generar XML según el XSD vigente de esa actividad
  → VALIDAR contra XSD (bloqueante)
  → fragmentar si supera 2 MB
  → marcar como "listo para revisión"
  → aprobación humana del REC (bloqueante, registrada en bitácora)
  → marcar como "listo para presentar"
  → el REC descarga, sube al SPPLD, obtiene acuse
  → registrar acuse en VIZO
  → sellar XML + acuse con NOM-151
```

Los dos pasos bloqueantes no se saltan nunca: la validación contra XSD y la aprobación humana.

## Criterio de aceptación

**El XML generado valida contra el XSD oficial vigente.** Es binario y automatizable. `pnpm test:xsd` debe correr en CI usando los ejemplos oficiales como fixtures y los expedientes de prueba como entrada.

Si valida, el aviso es presentable. Si no valida, no sale de VIZO.

## Monto que se reporta

El aviso reporta el **monto total recibido, incluyendo contribuciones**. Esto es distinto de la base con la que se evaluó el umbral (sin IVA). Ver la skill `umbrales-lfpiorpi`.

## Advertencia sobre las RCG

Las Reglas de Carácter General están vencidas desde el 16 de julio de 2026 y pendientes de publicación. Cuando salgan traerán **nuevos formatos oficiales de avisos**, lo que implica XSD nuevos.

Por eso `formatos_aviso` es una tabla con vigencias y no una constante. Cuando salgan las RCG, la respuesta correcta es cargar el XSD nuevo con su fecha de vigencia y dejar que el motor elija según la fecha del periodo — no editar código.
