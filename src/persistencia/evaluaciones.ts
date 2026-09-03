import type { EjecutorSql } from '../catalogo/cargador'
import { centavosAPesosTexto } from '../dominio/dinero'
import { exigirSesionActiva, type ContextoSesion } from './transaccion'
import type { ConfigActividad, Evaluacion } from '../dominio/tipos'

/**
 * Registro de evaluaciones.
 *
 * REGLA: una evaluación que no guarda sus insumos no existe. Sin la UMA, los
 * umbrales y los parámetros con los que se calculó, no hay forma de explicar
 * el resultado en una visita de verificación tres años después — y el plazo de
 * conservación es de diez.
 *
 * La tabla es APPEND-ONLY. Reevaluar una operación (porque se corrigió, o
 * porque cambió el catálogo) inserta una fila nueva; la anterior queda como
 * está. Ver docs/ARQUITECTURA.md §3.3.
 */

export interface DatosRegistro {
  /**
   * Quién evalúa. De aquí sale el tenant: no se recibe suelto.
   *
   * ISSUE #7, abierto en la auditoría de la semana 5 y cerrado aquí. Mientras
   * esta función recibía `tenantId` y se llamaba con una conexión cualquiera,
   * escribía en la tabla que sostiene el cálculo regulatorio SIN que RLS se
   * evaluara — porque la app se conecta con un rol que la salta. No era un
   * defecto vivo mientras solo la llamaban los tests; la semana 7 la conecta a
   * la UI, que es cuando lo habría sido.
   */
  sesion: ContextoSesion
  /**
   * La operación NO se pasa por separado: se toma de `evaluacion.operacionId`.
   *
   * Antes esta interfaz recibía un `operacionId` suelto y nada impedía guardar
   * el cálculo de una operación apuntando a otra. El registro quedaba
   * incoherente en la tabla que se defiende ante la autoridad. Quitar el
   * parámetro elimina la clase de error en vez de vigilarla.
   */
  evaluacion: Evaluacion
  config: ConfigActividad
}

/**
 * Devuelve el id de la evaluación registrada.
 *
 * DEBE llamarse DENTRO de una `enTransaccionDeSesion`: la evaluación y la
 * operación que la origina tienen que quedar o las dos o ninguna, así que
 * comparten transacción y esta función no puede abrir la suya. La precondición
 * de abajo lo exige en vez de confiar en que se lea este párrafo.
 */
export async function registrarEvaluacion(
  db: EjecutorSql,
  { sesion, evaluacion: ev, config }: DatosRegistro,
): Promise<string> {
  await exigirSesionActiva(db, sesion)

  const { insumos } = ev
  const operacionId = ev.operacionId

  // Los montos se pasan como texto decimal y Postgres los convierte a
  // `numeric`. Nunca como número de JavaScript: ese viaje pasa por punto
  // flotante y puede perder el centavo que decide si hay aviso.
  const { rows } = await db.query(
    `insert into evaluaciones_umbral (
       tenant_id, operacion_id, actividad_id,
       uma_valor, uma_vigencia,
       umbrales_aplicados, parametros_aplicados, catalogo_version,
       monto_base_considerado, monto_total_considerado,
       requiere_identificacion, resultado_aviso, efectivo_restringido,
       instrumento_restringido,
       alerta_proximidad, suma_ventana, operaciones_acumuladas,
       requiere_revision_identidad, motivo
     ) values (
       $1, $2, $3,
       $4::numeric, daterange($5::date, $6::date, '[]'),
       $7::jsonb, $8::jsonb, $9,
       $10::numeric, $11::numeric,
       $12, $13::resultado_aviso, $14,
       $20,
       $15, $16::numeric, $17::uuid[],
       $18, $19
     ) returning id`,
    [
      sesion.tenantId,
      operacionId,
      config.actividadId,
      centavosAPesosTexto(insumos.uma),
      insumos.umaVigenteDesde,
      insumos.umaVigenteHasta,
      JSON.stringify(
        insumos.umbralesAplicados.map((u) => ({
          tipo: u.tipo,
          siempre: u.siempre,
          valor_uma: u.valorUma,
          base: u.base,
          // El umbral ya convertido a pesos con la UMA de esa fecha: es el
          // número contra el que realmente se comparó.
          en_pesos: u.enCentavos === null ? null : centavosAPesosTexto(u.enCentavos),
        })),
      ),
      JSON.stringify({
        ventana_acumulacion_meses: insumos.ventanaMeses,
        umbral_proximidad_pct: insumos.proximidadPct,
      }),
      insumos.catalogoVersion,
      centavosAPesosTexto(insumos.montoBaseConsiderado),
      centavosAPesosTexto(insumos.montoTotalConsiderado),
      ev.requiereIdentificacion,
      ev.resultadoAviso,
      ev.efectivoRestringido,
      ev.alertaProximidad,
      ev.sumaVentana === null ? null : centavosAPesosTexto(ev.sumaVentana),
      ev.operacionesAcumuladas,
      ev.requiereRevisionIdentidad,
      ev.motivo,
      // $20. Va al final de la lista y no junto a su columna porque los
      // números de parámetro ya están escritos arriba; renumerarlos por
      // estética es la clase de cambio que mueve un monto de columna sin que
      // nadie lo note.
      ev.instrumentoRestringido,
    ],
  )

  const fila = rows[0] as { id: string } | undefined
  if (!fila) {
    throw new Error('No se pudo registrar la evaluación')
  }
  return fila.id
}
