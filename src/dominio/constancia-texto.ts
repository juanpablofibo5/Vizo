import type { Constancia, SeccionResuelta } from './constancia'

/**
 * La Constancia, escrita.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL ENCABEZADO ES PARTE DE LA FRONTERA, NO UNA PORTADA
 * ────────────────────────────────────────────────────────────────────────────
 * Este documento **no es el Manual de Políticas Internas** y tiene que decirlo
 * en el primer párrafo, en negritas y antes que cualquier otra cosa.
 *
 * Un obligado que recibe algo llamado «su Manual» lo entrega como completo. Si
 * le faltan siete apartados, lo estaría entregando incompleto ante la autoridad
 * —y creyendo lo contrario, que es peor—. Por eso el título dice Constancia, el
 * encabezado dice cuántos apartados faltan, y los huecos van numerados y con
 * sus preguntas a la vista en vez de escondidos al final.
 *
 * El Art. 37, párrafo 2, es lo que hace que esto funcione: el Manual «deberá
 * incluir las referencias» de la información que quede en un documento
 * distinto. Este es ese documento distinto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ MARKDOWN
 * ────────────────────────────────────────────────────────────────────────────
 * Porque es texto: se hashea, se versiona, se diffea y se lee dentro de veinte
 * años sin una aplicación que lo abra. Un PDF se ve mejor y es peor evidencia.
 */

export interface DatosDelObligado {
  razonSocial: string
  rfc: string
  /** 'AAAA-MM-DD' de la generación. */
  fecha: string
}

const vinetas = (items: readonly string[]): string =>
  items.map((i) => `- ${i}`).join('\n')

function seccionEscrita(s: SeccionResuelta): string {
  const encabezado = `## Fracción ${s.fraccion}\n\n> ${s.texto}\n\n*${s.fuente}*`

  if (s.resolucion === 'hueco') {
    const nota = s.degradado
      ? '\n\n**Nota:** este apartado normalmente lo acredita el sistema. Hoy no encontró evidencia, así que queda pendiente.'
      : ''
    return [
      encabezado,
      '',
      '### ⬚ Pendiente — lo redacta el sujeto obligado',
      '',
      s.porQueNo ?? '',
      nota,
      '',
      '**Qué hay que responder aquí:**',
      '',
      vinetas(s.preguntas),
    ].join('\n')
  }

  const hechos = s.hechos
    .map((h) => `${h.afirmacion}\n\n  <sub>Verificable en: ${h.respaldo}</sub>`)
    .join('\n\n')

  const faltante =
    s.resolucion === 'parcial'
      ? [
          '',
          '### ⬚ Lo que falta en este apartado',
          '',
          s.porQueNo ?? '',
          '',
          '**Qué hay que responder:**',
          '',
          vinetas(s.preguntas),
        ].join('\n')
      : ''

  return [encabezado, '', '### Mecanismos acreditados', '', hechos, faltante].join('\n')
}

export function escribirConstancia(c: Constancia, o: DatosDelObligado): string {
  const pendientes = c.huecos + c.parciales

  const cabecera = [
    '# Constancia de mecanismos implementados',
    '',
    `**${o.razonSocial}** · RFC ${o.rfc}`,
    `Generada el ${o.fecha}`,
    '',
    '---',
    '',
    '## Qué es este documento, y qué no',
    '',
    '**Esto NO es su Manual de Políticas Internas.** Es la constancia de los mecanismos que su ' +
      'sistema de cumplimiento tiene implementados, con la evidencia que los respalda. Está ' +
      'pensada para que su Manual la **referencie**, como permite el Art. 37, párrafo 2, del ' +
      'Acuerdo 115/2026.',
    '',
    `De los **catorce apartados** que exige el Art. 37 Bis, este documento acredita ` +
      `**${String(c.acreditados)}** por completo y **${String(c.parciales)}** de forma parcial. ` +
      `**Quedan ${String(pendientes)} apartados que usted debe redactar**, y aparecen abajo ` +
      'marcados como pendientes, con las preguntas que hay que contestar en cada uno.',
    '',
    '> Ninguna afirmación de este documento se escribió sin un dato del sistema que la respalde. ' +
      'Donde no hay evidencia no hay redacción: hay un pendiente. Es deliberado — VIZO acredita ' +
      'lo que su sistema hace y no redacta políticas por usted.',
    '',
    '---',
    '',
  ].join('\n')

  const cuerpo = c.secciones.map(seccionEscrita).join('\n\n---\n\n')

  const pie = [
    '',
    '---',
    '',
    '## Sobre esta constancia',
    '',
    `Fundamento: Artículo 37 Bis del Acuerdo 115/2026, publicado en el Diario Oficial de la ` +
      'Federación el 7 de agosto de 2026 (edición vespertina, código 5795797). El texto de cada ' +
      'fracción se reproduce literal.',
    '',
    'Los mecanismos acreditados citan dónde comprobarlos. Los apartados pendientes citan el ' +
      'artículo y las preguntas, nunca una respuesta sugerida: qué políticas adopta su ' +
      'organización es una decisión suya, y VIZO no la toma ni la recomienda.',
    '',
    c.degradados.length > 0
      ? `**Atención:** ${String(c.degradados.length)} apartado(s) que el sistema normalmente ` +
        `acredita (${c.degradados.join(', ')}) quedaron sin evidencia. Suele significar que la ` +
        'cuenta está a medio configurar o que aún no hay operación registrada. Conviene ' +
        'resolverlo antes de entregar este documento.'
      : '',
  ].join('\n')

  return `${cabecera}${cuerpo}${pie}\n`
}
