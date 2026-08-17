import type { Constancia, SeccionResuelta } from './constancia'

/**
 * El índice del Manual de Políticas Internas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN DOCUMENTO DISTINTO DE LA CONSTANCIA, Y NO EL MISMO
 * ────────────────────────────────────────────────────────────────────────────
 * Son de dueños distintos, y eso decide todo lo demás.
 *
 *   · La **Constancia** la afirma VIZO: «este sistema hace esto, y así se
 *     comprueba». Es el «documento distinto» que permite el Art. 37 ¶2.
 *   · El **índice** es el Manual DEL OBLIGADO. Lo adopta él, lo firma él, y
 *     ante una revisión responde él.
 *
 * Juntarlos en un archivo sería cómodo y sería el error que el ADR-20 existe
 * para impedir: un obligado que recibe un solo documento con catorce apartados
 * lo entrega tal cual, y estaría entregando como propio un texto que VIZO
 * escribió sobre sí mismo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE DOCUMENTO NO CONTIENE, Y ES LA CLAVE
 * ────────────────────────────────────────────────────────────────────────────
 * **No repite un solo hecho acreditado.** Donde la Constancia demuestra algo,
 * el índice pone una REFERENCIA —fecha y huella SHA-256— y nada más. Es
 * literalmente lo que el Art. 37 ¶2 autoriza:
 *
 *   «se deberán incluir las REFERENCIAS de aquellos criterios, medidas,
 *    procedimientos internos y demás información que […] puedan quedar
 *    plasmados en un documento distinto al antes mencionado.»
 *
 * Copiar los hechos aquí rompería la referencia en el peor momento: el Manual
 * diría una cosa, la Constancia otra, y ninguna de las dos sabría cuál manda.
 *
 * Y donde VIZO no acredita, el índice deja el hueco con sus preguntas. Nunca
 * una respuesta sugerida: qué políticas adopta el obligado es su decisión.
 */

/** La Constancia a la que este índice remite. Fija, no regenerable. */
export interface ReferenciaConstancia {
  /** Fecha con la que se juzgó, 'AAAA-MM-DD'. */
  fecha: string
  hashSha256: string
}

export interface DatosDelManual {
  razonSocial: string
  rfc: string
  /** 'AAAA-MM-DD' de la generación del índice. */
  fecha: string
  /** Cuando el Art. 37 Bis todavía no rige: desde cuándo lo hará. */
  anticipadaDesde?: string | undefined
}

const vinetas = (items: readonly string[]): string => items.map((i) => `- ${i}`).join('\n')

function apartadoEscrito(s: SeccionResuelta, ref: ReferenciaConstancia): string {
  const encabezado = [
    `## ${s.fraccion}. ${primeraLinea(s.texto)}`,
    '',
    `> *Art. 37 Bis, fracción ${s.fraccion}:* ${s.texto}`,
  ]

  // La referencia sustituye al contenido. No lo resume ni lo adelanta: dice
  // dónde está y con qué huella se comprueba que no cambió.
  const referencia = [
    '',
    `**Este apartado consta en la Constancia de mecanismos implementados** emitida el ` +
      `${ref.fecha}, sección «Fracción ${s.fraccion}», que forma parte integrante de este ` +
      'Manual por referencia.',
    '',
    `<sub>Huella SHA-256 de la Constancia referida: \`${ref.hashSha256}\`</sub>`,
  ]

  const pendiente = (titulo: string, porQue: string | undefined, preguntas: readonly string[]) => [
    '',
    `### ⬚ ${titulo}`,
    '',
    '> **[PENDIENTE DE REDACCIÓN]** — este apartado lo escribe el sujeto obligado.',
    ...(porQue === undefined ? [] : ['', porQue]),
    ...(preguntas.length === 0
      ? []
      : ['', '**Preguntas que este apartado debe responder:**', '', vinetas(preguntas)]),
  ]

  if (s.resolucion === 'acreditado') {
    return [...encabezado, ...referencia].join('\n')
  }

  if (s.resolucion === 'parcial') {
    return [
      ...encabezado,
      ...referencia,
      ...pendiente('Falta redactar en este apartado', s.porQueNo, s.preguntas),
    ].join('\n')
  }

  return [...encabezado, ...pendiente('Sin redactar', s.porQueNo, s.preguntas)].join('\n')
}

/** El texto del artículo abreviado para el título, sin el punto y coma final. */
function primeraLinea(texto: string): string {
  const limpio = texto.replace(/[;.]$/, '')
  return limpio.length <= 70 ? limpio : `${limpio.slice(0, 67)}…`
}

export function escribirIndiceDelManual(
  c: Constancia,
  o: DatosDelManual,
  ref: ReferenciaConstancia,
): string {
  const pendientes = c.huecos + c.parciales

  const anticipo =
    o.anticipadaDesde === undefined
      ? []
      : [
          `> ⚠️ **BORRADOR ANTICIPADO.** El Artículo 37 Bis entra en vigor el ` +
            `**${o.anticipadaDesde}**. Este índice se armó con las reglas que entrarán ese día.`,
          '',
        ]

  const cabecera = [
    '# Manual de Políticas Internas',
    '',
    `**${o.razonSocial}** · RFC ${o.rfc}`,
    `Índice generado el ${o.fecha}`,
    '',
    ...anticipo,
    '---',
    '',
    '## Cómo se usa este documento',
    '',
    '**Este es el índice de su Manual, no su Manual terminado.** Tiene los catorce apartados que ' +
      'exige el Art. 37 Bis del Acuerdo 115/2026, con el texto de cada fracción, y está en dos ' +
      'estados:',
    '',
    `- **${String(c.acreditados + c.parciales)} apartados remiten a la Constancia de mecanismos** ` +
      `emitida el ${ref.fecha}, que describe lo que su sistema hace y cómo se comprueba. El ` +
      'Art. 37, párrafo 2, permite expresamente que el Manual incluya las **referencias** de ' +
      'información que quede en un documento distinto.',
    `- **${String(pendientes)} apartados están marcados como PENDIENTES DE REDACCIÓN.** Son las ` +
      'políticas de su organización: nadie más que usted puede escribirlas. Cada uno lleva las ' +
      'preguntas que debe responder.',
    '',
    '> Este índice **no está firmado ni adoptado**. Para que sea su Manual hay que redactar los ' +
      'pendientes, revisarlo con quien corresponda y adoptarlo formalmente. El Art. 37 le da ' +
      'noventa días naturales desde su alta y registro; el Art. 37 Bis 3 permite además que el ' +
      'SAT le señale modificaciones.',
    '',
    '**La Constancia referida debe entregarse junto con este Manual.** Sin ella, los apartados ' +
      'que remiten a ella quedan vacíos.',
    '',
    '---',
    '',
  ].join('\n')

  const cuerpo = c.secciones.map((s) => apartadoEscrito(s, ref)).join('\n\n---\n\n')

  const pie = [
    '',
    '---',
    '',
    '## Documento referido',
    '',
    `**Constancia de mecanismos implementados** · ${o.razonSocial} · emitida el ${ref.fecha}`,
    '',
    `Huella SHA-256: \`${ref.hashSha256}\``,
    '',
    'Esa huella permite comprobar que la Constancia que acompaña a este Manual es exactamente la ' +
      'que se referenció al armarlo. Si la Constancia se vuelve a emitir —porque cambió la ' +
      'operación— su huella cambia, y este índice debe regenerarse para seguir apuntando al ' +
      'documento correcto.',
  ].join('\n')

  return `${cabecera}${cuerpo}\n${pie}\n`
}
