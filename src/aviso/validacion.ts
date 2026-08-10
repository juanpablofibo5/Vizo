import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Validación del XML del aviso contra el XSD oficial del SPPLD.
 *
 * ES UN PASO BLOQUEANTE, no una advertencia. Un aviso que no valida no existe:
 * el portal lo rechaza y la obligación queda incumplida con su plazo corriendo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO SE CONSTRUYE ANTES QUE EL GENERADOR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * El propio SAT publica un XML de ejemplo que NO valida contra su propio XSD:
 * el esquema declara `caracteristicas_desarrollo` y el ejemplo trae
 * `caractersiticas_desarrollo`, con una `i` traspuesta (ver regulatorio/
 * README.md). Quien construya su generador copiando el ejemplo —que es lo
 * natural— produce avisos que un validador estricto rechaza, y no se entera
 * hasta que la autoridad los rechaza.
 *
 * Por eso el arnés existe antes que lo que tiene que arnesar. La estructura se
 * lee del XSD; el ejemplo sirve de fixture, no de especificación.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ xmllint Y NO UNA LIBRERÍA DE npm
 * ────────────────────────────────────────────────────────────────────────────
 *
 * libxml2 es la implementación de referencia de XSD 1.0 y es la que usa medio
 * mundo, incluido —con toda probabilidad— quien recibe del otro lado. Validar
 * con algo más laxo daría un verde que no significa nada.
 *
 * El precio es depender de un binario del sistema. Ese precio se paga de una
 * sola forma honesta: si `xmllint` no está, esto REVIENTA. Un validador
 * bloqueante que se salta solo cuando falta su herramienta es peor que no
 * tenerlo, porque además tranquiliza.
 */

export class ValidadorNoDisponible extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ValidadorNoDisponible'
  }
}

export interface ResultadoValidacion {
  valida: boolean
  /** Una línea por error, tal como las reporta libxml2. */
  errores: string[]
}

/** Deja pasar el binario para poder probar el camino de "no está instalado". */
export interface OpcionesValidacion {
  binario?: string
}

/**
 * Valida un XML contra un XSD. `rutaXsd` sale del catálogo (`formatos_aviso`),
 * nunca de una constante en el código: el formato es dato regulatorio y las RCG
 * lo van a cambiar (regla dura 1).
 */
export function validarContraXsd(
  xml: string,
  rutaXsd: string,
  opciones: OpcionesValidacion = {},
): ResultadoValidacion {
  const binario = opciones.binario ?? 'xmllint'
  const carpeta = mkdtempSync(join(tmpdir(), 'vizo-xsd-'))
  const rutaXml = join(carpeta, 'aviso.xml')

  try {
    writeFileSync(rutaXml, xml, 'utf8')
    const r = spawnSync(binario, ['--noout', '--schema', rutaXsd, rutaXml], {
      encoding: 'utf8',
    })

    if (r.error !== undefined) {
      throw new ValidadorNoDisponible(
        `No se pudo ejecutar '${binario}': ${r.error.message}. La validación contra el XSD ` +
          'es un paso BLOQUEANTE del aviso y no se puede omitir. Instálalo: ' +
          'macOS ya lo trae; en Debian/Ubuntu es el paquete libxml2-utils.',
      )
    }

    // Códigos MEDIDOS contra el libxml2 de la máquina, no recordados:
    //   0 → válido
    //   1 → el XML no está bien formado
    //   3 → bien formado pero no cumple el esquema
    //   5 → el ESQUEMA no se pudo leer
    //
    // La distinción que importa es la última. Un XSD ilegible reportado como
    // "el aviso no valida" mandaría a corregir la captura cuando lo que está
    // roto es la ruta del catálogo — y el aviso correcto se quedaría sin
    // enviar por buscar un error que no existe.
    const codigo = r.status
    const salida = `${r.stderr ?? ''}`.trim()

    if (codigo === 0) return { valida: true, errores: [] }
    if (codigo === 1 || codigo === 3) {
      return {
        valida: false,
        errores: salida.split('\n').filter((l) => l.trim() !== ''),
      }
    }

    throw new ValidadorNoDisponible(
      `'${binario}' terminó con código ${String(codigo)} sin llegar a validar. Eso NO ` +
        `significa que el XML esté mal: significa que el esquema ${rutaXsd} no se pudo leer. ` +
        `Revisa la ruta que trae formatos_aviso.\n${salida}`,
    )
  } finally {
    rmSync(carpeta, { recursive: true, force: true })
  }
}
