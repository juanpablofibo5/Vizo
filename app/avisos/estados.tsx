import type { EstadoPlazo } from '../../src/dominio/calendario'

/**
 * Cómo se ven los estados del aviso y del plazo.
 *
 * El color aquí es información, no estilo: un obligado que abre esta pantalla
 * el día 15 necesita distinguir de un vistazo lo que está en regla de lo que
 * le va a costar una multa. Por eso el estado del pipeline y el del plazo se
 * pintan por separado — un aviso puede estar perfectamente generado y aun así
 * ir tarde.
 */

const PIPELINE: Record<string, { texto: string; tono: string }> = {
  borrador: { texto: 'Borrador', tono: 'neutro' },
  generado: { texto: 'Generado', tono: 'neutro' },
  validado: { texto: 'Validado', tono: 'neutro' },
  listo_revision: { texto: 'Espera revisión', tono: 'aviso' },
  aprobado: { texto: 'Aprobado', tono: 'aviso' },
  presentado: { texto: 'Presentado', tono: 'ok' },
}

export function EstadoAviso({ estatus }: { estatus: string | null }) {
  if (estatus === null) {
    return <span className="estado neutro">Sin generar</span>
  }
  const e = PIPELINE[estatus] ?? { texto: estatus, tono: 'neutro' }
  return <span className={`estado ${e.tono}`}>{e.texto}</span>
}

const PLAZO: Record<EstadoPlazo, { tono: string }> = {
  holgado: { tono: 'neutro' },
  por_vencer: { tono: 'aviso' },
  vence_hoy: { tono: 'critico' },
  vencido: { tono: 'critico' },
}

export function PlazoBadge({
  estado,
  diasRestantes,
  fechaLimite,
}: {
  estado: EstadoPlazo
  diasRestantes: number
  fechaLimite: string
}) {
  // El texto dice el número de días, no solo la etiqueta: "vence en 4 días"
  // mueve a alguien; "por vencer" se ignora.
  const texto =
    estado === 'vencido'
      ? `Vencido hace ${String(Math.abs(diasRestantes))} d`
      : estado === 'vence_hoy'
        ? 'Vence hoy'
        : `Vence en ${String(diasRestantes)} d`

  return (
    <span className={`estado ${PLAZO[estado].tono}`} title={`Fecha límite: ${fechaLimite}`}>
      {texto}
    </span>
  )
}

/** 'AAAA-MM-01' → 'mayo 2026'. El periodo se lee, no se descifra. */
export function nombreDePeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${meses[Number(mes) - 1] ?? mes} ${anio ?? ''}`
}
