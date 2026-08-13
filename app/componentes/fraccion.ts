/**
 * La fracción, escrita como la escribe la ley.
 *
 * En el catálogo la fracción es una clave —`V_BIS`, `XV`— porque así se compara
 * y se indexa sin ambigüedad. En pantalla eso se lee como código de sistema, y
 * lo que el usuario reconoce es "V Bis".
 *
 * La distinción que hace el formato: los números romanos van en versalitas
 * (`XV`, no `Xv`) y las palabras no (`Bis`, no `BIS`). Escribir "FRACCIÓN V
 * BIS" en mayúsculas grita; escribir "V Bis" es como aparece en el Art. 17.
 *
 * Vive en la capa de presentación a propósito: no se guarda así, no se compara
 * así, y ningún cálculo depende de esto.
 */

/** Solo estos caracteres forman un número romano; el resto es palabra. */
const ROMANO = /^[IVXLCDM]+$/

export function fraccionLegible(clave: string): string {
  return clave
    .split('_')
    .filter((parte) => parte !== '')
    .map((parte) =>
      ROMANO.test(parte.toUpperCase())
        ? parte.toUpperCase()
        : parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase(),
    )
    .join(' ')
}
