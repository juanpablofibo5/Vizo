import { partes } from '../../src/dominio/fechas'

/**
 * La regla del mes: el día 17 como un LUGAR, no como una fecha suelta.
 *
 * Treinta y una barras, una por día. La del día límite se levanta con la tinta
 * del estado, la de hoy queda a media altura en tinta oscura, y el resto son
 * grises. En un vistazo se ve dónde está uno respecto del plazo, que es
 * exactamente la pregunta con la que se abre este portal.
 *
 * POR QUÉ NO ES UNA BARRA DE PROGRESO. Una barra de progreso diría «vas al
 * 55% del mes», que no le importa a nadie. Lo que importa es la distancia al
 * 17, y esa distancia se lee comparando dos alturas, no un porcentaje.
 *
 * El número de días sale del mes real —febrero tiene 28 o 29—, no de un 31
 * fijo: una regla que dibuje días que no existen deja de ser una regla.
 */

/** Último día del mes de una fecha `YYYY-MM-DD`. */
function diasDelMes(fecha: string): number {
  const { anio, mes } = partes(fecha)
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

export function ReglaDelMes({
  hoy,
  fechaLimite,
  tinta,
}: {
  /** `YYYY-MM-DD`. */
  hoy: string
  /** `YYYY-MM-DD` del día 17 (o el que fije el catálogo) del periodo. */
  fechaLimite: string
  /** El color del estado del plazo. La regla no elige color: lo recibe. */
  tinta: string
}) {
  const total = diasDelMes(hoy)
  const diaHoy = partes(hoy).dia

  // SI EL LÍMITE NO CAE EN ESTE MES, NO SE DIBUJA NADA.
  //
  // La regla existe para contestar «¿a qué distancia estoy del 17?». Cuando el
  // periodo venció hace meses, esa distancia ya no cabe en una regla de 31
  // días: dibujarla mostraría el mes actual con una barra de «hoy» y ningún
  // límite, que se lee como un calendario decorativo. Lo que hay que saber en
  // ese caso —cuánto lleva vencido— ya lo dice el chip, con un número.
  //
  // Es la misma regla que el resto del producto: no se pinta algo que no
  // conteste la pregunta que motivó pintarlo.
  if (fechaLimite.slice(0, 7) !== hoy.slice(0, 7)) return null

  const limiteEsteMes = partes(fechaLimite).dia

  return (
    <>
      <div className="regla-mes">
        {Array.from({ length: total }, (_, i) => {
          const dia = i + 1
          const esLimite = dia === limiteEsteMes
          const esHoy = dia === diaHoy
          return (
            <div
              key={dia}
              className={
                esLimite ? 'dia limite' : esHoy ? 'dia hoy' : dia < diaHoy ? 'dia ido' : 'dia'
              }
              style={{
                ...(esLimite ? { background: tinta } : {}),
                // Escalonado: cada barra entra 18 ms después de la anterior.
                animationDelay: `${String(i * 18)}ms`,
              }}
            />
          )
        })}
      </div>
      <div className="regla-leyenda">
        <span>1</span>
        <span style={{ color: tinta, fontWeight: 600 }}>{limiteEsteMes} · límite legal</span>
        <span>{total}</span>
      </div>
    </>
  )
}
