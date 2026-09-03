/**
 * El piso de datos del Beneficiario Controlador — Art. 12 fr. VII.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOS REGÍMENES, Y LA DIFERENCIA ESTÁ EN UNA CONDICIONAL
 * ────────────────────────────────────────────────────────────────────────────
 * ¶1, cliente persona FÍSICA: «asentarán y recabarán los mismos datos y
 * documentos […] de los Anexos 3, 4, 5, 6 u 8 […] EN CASO DE QUE el Cliente o
 * Usuaria sea persona física y CUENTE CON DICHA INFORMACIÓN».
 *
 * ¶2, cliente persona MORAL o FIDEICOMISO: «recabarán los datos establecidos
 * en los numerales i), ii), iv) y ix) del inciso a) del Anexo 3 […] EN TODOS
 * LOS CASOS».
 *
 * El segundo es incondicional; el primero cuelga de que el cliente tenga la
 * información. Este módulo evalúa el segundo, que es el que se puede exigir
 * sin preguntarle a nadie — y es también el que aplica a los clientes del Cap.
 * III Quinquies, que son morales y fideicomisos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ NO DECIDE ESTE MÓDULO
 * ────────────────────────────────────────────────────────────────────────────
 * No decide cuáles numerales se exigen —llegan del catálogo, del Art. 12 fr.
 * VII ¶2— ni qué dice cada numeral, que vive en `campos_expediente` con su
 * propia fuente. Aquí solo se contrasta lo capturado contra lo exigido.
 */

/** Qué columna de la identidad responde a cada numeral del inciso a). */
export interface DatoDelPiso {
  readonly numeral: string
  /** La etiqueta viene del catálogo de campos, no de aquí. */
  readonly etiqueta: string
  readonly presente: boolean
}

export interface IdentidadDelBeneficiario {
  readonly id: string
  readonly nombre: string
  readonly rfc: string | null
  readonly curp: string | null
  readonly fechaNacimiento: string | null
  readonly nacionalidad: string | null
}

/**
 * Si un numeral está cubierto por lo que se capturó.
 *
 * El mapeo numeral → columna es una decisión de PRESENTACIÓN, no regulatoria:
 * qué dice cada numeral lo dice el catálogo; esto solo sabe en qué columna
 * guardamos nosotros esa respuesta. Por eso vive en código y no en la base.
 *
 * El ix) se cumple con CURP **o** RFC: el numeral los nombra juntos y
 * condicionados —«cuando cuente con ellas»—, así que exigir los dos sería
 * inventar un requisito que el texto no pone.
 */
function cubre(numeral: string, id: IdentidadDelBeneficiario): boolean | null {
  switch (numeral) {
    case 'i':
      return id.nombre.trim() !== ''
    case 'ii':
      return id.fechaNacimiento !== null
    case 'iv':
      return id.nacionalidad !== null
    case 'ix':
      return id.curp !== null || id.rfc !== null
    default:
      // Un numeral que el catálogo exige y este módulo no sabe leer NO se
      // salta en silencio: se devuelve `null` y quien llama se detiene. Dar
      // por cubierto lo que no se sabe evaluar es el peor de los dos errores.
      return null
  }
}

export class NumeralDelPisoDesconocido extends Error {
  constructor(numeral: string) {
    super(
      `El catálogo exige el numeral "${numeral}" del inciso a) del Anexo 3 y este módulo no sabe ` +
        'qué dato lo cubre. No se da por cubierto ni por faltante: se detiene, porque las dos ' +
        'respuestas serían inventadas.',
    )
    this.name = 'NumeralDelPisoDesconocido'
  }
}

export interface PisoDelBeneficiario {
  readonly beneficiarioId: string
  readonly nombre: string
  readonly datos: readonly DatoDelPiso[]
  readonly completo: boolean
}

export function pisoDelBeneficiario(entrada: {
  readonly identidad: IdentidadDelBeneficiario
  readonly numerales: readonly string[]
  readonly etiquetas: Readonly<Record<string, string>>
}): PisoDelBeneficiario {
  const datos = entrada.numerales.map((numeral): DatoDelPiso => {
    const presente = cubre(numeral, entrada.identidad)
    if (presente === null) throw new NumeralDelPisoDesconocido(numeral)
    return {
      numeral,
      etiqueta: entrada.etiquetas[numeral] ?? `numeral ${numeral}`,
      presente,
    }
  })

  return {
    beneficiarioId: entrada.identidad.id,
    nombre: entrada.identidad.nombre,
    datos,
    completo: datos.every((d) => d.presente),
  }
}
