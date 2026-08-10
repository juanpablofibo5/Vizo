import type { EjecutorSql } from '../catalogo/cargador'

/**
 * El formato del aviso vigente para una actividad en una fecha.
 *
 * REGLA DURA 1: el formato es dato regulatorio, versionado por vigencia. Las
 * Reglas de Carácter General están vencidas desde julio de 2026 y van a cambiar
 * los formatos; cuando eso pase, el cambio es un INSERT en `formatos_aviso`
 * —XSD nuevo al lado, vigencia nueva— y no un deploy.
 *
 * Por eso la ruta del XSD se resuelve aquí y no hay ninguna constante con un
 * nombre de archivo en el generador ni en el validador.
 */

export class FormatoNoVigente extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'FormatoNoVigente'
  }
}

export interface FormatoAviso {
  id: string
  version: string
  rutaXsd: string
  vigenteDesde: string
  vigenteHasta: string | null
}

export async function formatoVigente(
  db: EjecutorSql,
  p: { actividadId: string; fecha: string },
): Promise<FormatoAviso> {
  const { rows } = await db.query(
    `select id::text, version, ruta_xsd, vigente_desde::text, vigente_hasta::text
       from formatos_aviso
      where actividad_id = $1
        and daterange(vigente_desde, vigente_hasta, '[]') @> $2::date`,
    [p.actividadId, p.fecha],
  )

  // Ni un formato por omisión ni "el más reciente". Un aviso generado con el
  // formato equivocado es un aviso rechazado, y averiguarlo tarde cuesta el
  // plazo (regla dura 6).
  if (rows.length === 0) {
    throw new FormatoNoVigente(
      `No hay formato de aviso vigente para la actividad ${p.actividadId} en ${p.fecha}. ` +
        'Cárgalo en formatos_aviso con su XSD y su vigencia; el motor no asume uno.',
    )
  }

  const f = rows[0] as {
    id: string
    version: string
    ruta_xsd: string
    vigente_desde: string
    vigente_hasta: string | null
  }
  return {
    id: f.id,
    version: f.version,
    rutaXsd: f.ruta_xsd,
    vigenteDesde: f.vigente_desde,
    vigenteHasta: f.vigente_hasta,
  }
}
