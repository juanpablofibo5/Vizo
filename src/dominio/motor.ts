import type {
  ConfigActividad,
  EntradaEvaluacion,
  Evaluacion,
  Operacion,
  Umbral,
} from './tipos.js'
import { centavos, formatearPesos, porcentaje, type Centavos } from './dinero.js'

/**
 * EL MOTOR DE EVALUACIÓN.
 *
 * Función PURA: no consulta la base, no lee la hora, no usa aleatoriedad,
 * ningún LLM participa (restricción no negociable #4). La misma entrada da
 * siempre la misma salida — que es lo que permite defender un cálculo tres
 * años después ante una visita de verificación.
 *
 * NO SABE QUÉ ES LA FRACCIÓN V BIS. Recibe una configuración y evalúa contra
 * ella. Agregar la Fracción XV no toca este archivo: la prueba de diseño X-01
 * lo verifica en la semana 11.
 *
 * Estado: identificación, aviso individual, restricción de efectivo y alerta
 * de proximidad implementados (semana 3). La acumulación de 6 meses llega en
 * la semana 4; hasta entonces `sumaVentana` es null y los casos A-* de
 * docs/PRUEBAS.md fallan a propósito.
 */
export function evaluar(entrada: EntradaEvaluacion, config: ConfigActividad): Evaluacion {
  const { operacion, cliente } = entrada

  verificarPrecondiciones(entrada, config)

  const uIdentificacion = umbralRequerido(config, 'identificacion')
  const uAviso = umbralRequerido(config, 'aviso')
  const uEfectivo = umbralRequerido(config, 'efectivo')

  // ── 1. Identificación ──────────────────────────────────────────────────
  // `siempre` es un dato del catálogo: en Fr. V Bis se integra expediente de
  // cada aportante sin importar el monto.
  const requiereIdentificacion = uIdentificacion.siempre
    ? true
    : montoContra(operacion, uIdentificacion) >= exigeMonto(uIdentificacion)

  // ── 2. Aviso individual ────────────────────────────────────────────────
  // La base (con o sin IVA) sale de la columna `base` del umbral. Es la
  // diferencia entre el Art. 17 y el Art. 32, y es un DATO, no un `if`.
  const montoParaAviso = montoContra(operacion, uAviso)
  const umbralAviso = exigeMonto(uAviso)
  const avisoIndividual = montoParaAviso >= umbralAviso

  // ── 3. Acumulación ─────────────────────────────────────────────────────
  // Semana 4. Ver el comentario al final de la función.
  const sumaVentana: Centavos | null = null
  const operacionesAcumuladas: readonly string[] = []
  const avisoPorAcumulacion = false

  // ── 4. Restricción de efectivo (Art. 32) ───────────────────────────────
  // Solo aplica cuando el pago fue en efectivo, y se mide sobre el total
  // CON IVA y accesorios.
  const montoParaEfectivo = montoContra(operacion, uEfectivo)
  const efectivoRestringido = operacion.esEfectivo && montoParaEfectivo >= exigeMonto(uEfectivo)

  // ── 5. Alerta de proximidad ────────────────────────────────────────────
  // Decisión de producto, no obligación legal: avisar cuando falta poco.
  // No se levanta si ya hay aviso — sería ruido sobre una obligación firme.
  const umbralProximidad = porcentaje(umbralAviso, config.proximidadPct)
  const alertaProximidad =
    !avisoIndividual && !avisoPorAcumulacion && montoParaAviso >= umbralProximidad

  // ── 6. Identidad ───────────────────────────────────────────────────────
  // Cuando la identidad no se resolvió por RFC ni CURP, el motor NO asume que
  // se trata de otro cliente: acumula conservadoramente y escala a revisión
  // humana. Un falso positivo cuesta minutos de revisión; un falso negativo
  // es un aviso omitido.
  const requiereRevisionIdentidad = cliente.resolucionIdentidad === 'identidad_alterna'

  const resultadoAviso = avisoIndividual ? 'individual' : avisoPorAcumulacion ? 'acumulacion' : 'no'

  return {
    requiereIdentificacion,
    resultadoAviso,
    efectivoRestringido,
    alertaProximidad,
    requiereRevisionIdentidad,
    sumaVentana,
    operacionesAcumuladas,
    motivo: redactarMotivo({
      resultadoAviso,
      requiereIdentificacion,
      efectivoRestringido,
      alertaProximidad,
      montoParaAviso,
      umbralAviso,
      umbralProximidad,
      identificacionSiempre: uIdentificacion.siempre,
    }),
    insumos: {
      uma: config.uma,
      umaVigenteDesde: config.umaVigenteDesde,
      umaVigenteHasta: config.umaVigenteHasta,
      catalogoVersion: config.catalogoVersion,
      ventanaMeses: config.ventanaMeses,
      proximidadPct: config.proximidadPct,
      montoBaseConsiderado: operacion.montoBase,
      montoTotalConsiderado: operacion.montoTotal,
      umbralesAplicados: config.umbrales,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Piezas internas
// ─────────────────────────────────────────────────────────────────────────

export class ConfiguracionInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ConfiguracionInvalida'
  }
}

/**
 * La entrada no es coherente con la configuración recibida.
 *
 * Encontrado en la auditoría de la semana 3: el motor obedecía en silencio una
 * configuración que no correspondía a la operación. Evaluar una operación del
 * 15 de enero con la configuración de febrero usa la UMA equivocada y produce
 * un AVISO OMITIDO — el error más caro del dominio.
 *
 * Una función pura que decide obligaciones regulatorias no puede confiar en su
 * entrada. Prefiere detenerse a calcular con datos incoherentes.
 */
export class EntradaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'EntradaInvalida'
  }
}

function verificarPrecondiciones(entrada: EntradaEvaluacion, config: ConfigActividad): void {
  const { operacion, cliente, historial } = entrada

  // 1. La configuración tiene que ser la de ESTA fecha.
  //    El riesgo real: cargar la config una vez y reutilizarla para operaciones
  //    de fechas distintas — exactamente lo que hará el batch mensual y la
  //    acumulación de la semana 4, donde el historial cruza meses.
  if (!fechaDentroDeVigencia(operacion.fechaOperacion, config)) {
    throw new EntradaInvalida(
      `La operación es del ${operacion.fechaOperacion} pero la configuración corresponde a la ` +
        `UMA vigente desde ${config.umaVigenteDesde}` +
        (config.umaVigenteHasta ? ` hasta ${config.umaVigenteHasta}` : '') +
        '. Carga la configuración con la fecha de la operación: usar otra UMA omite avisos.',
    )
  }

  // 2. La operación tiene que ser de esta actividad.
  //    Los umbrales y los acumulados NUNCA se cruzan entre fracciones (A-04).
  if (operacion.actividadId !== config.actividadId) {
    throw new EntradaInvalida(
      `La operación pertenece a la actividad ${operacion.actividadId} y la configuración es de ` +
        `${config.actividadId} (${config.fraccion}). Los umbrales no se cruzan entre fracciones.`,
    )
  }

  // 3. Los montos tienen que cuadrar.
  //    La base de datos lo garantiza con un CHECK, pero el motor también
  //    recibe operaciones armadas en memoria (parser CFDI, tests, importación).
  //    Un total falseado evalúa mal el Art. 32.
  const suma = operacion.montoBase + operacion.iva + operacion.isai + operacion.otrosAccesorios
  if (operacion.montoTotal !== suma) {
    throw new EntradaInvalida(
      `El monto total (${formatearPesos(operacion.montoTotal)}) no cuadra con la suma de sus ` +
        `componentes (${formatearPesos(centavos(suma))}).`,
    )
  }

  // 4. El historial tiene que ser del mismo cliente.
  //    Sin esto, la acumulación de la semana 4 podría sumar operaciones de
  //    otra persona y disparar un aviso falso.
  const ajena = historial.find((h) => h.clienteId !== undefined && h.clienteId !== cliente.id)
  if (ajena) {
    throw new EntradaInvalida(
      `El historial trae la operación ${ajena.id}, que es de otro cliente. ` +
        'La acumulación es por mismo cliente y misma actividad.',
    )
  }

  // 5. Ninguna operación del historial puede ser posterior a la evaluada.
  //    La ventana se cuenta hacia atrás; una operación futura en el historial
  //    es un error de quien consulta, no un caso a resolver.
  const futura = historial.find((h) => h.fechaOperacion > operacion.fechaOperacion)
  if (futura) {
    throw new EntradaInvalida(
      `El historial trae la operación ${futura.id} del ${futura.fechaOperacion}, posterior a la ` +
        `operación evaluada (${operacion.fechaOperacion}).`,
    )
  }
}

/** ¿La fecha cae dentro de la vigencia de la UMA con la que se armó la config? */
function fechaDentroDeVigencia(fecha: string, config: ConfigActividad): boolean {
  if (fecha < config.umaVigenteDesde) return false
  if (config.umaVigenteHasta !== null && fecha > config.umaVigenteHasta) return false
  return true
}

/**
 * Un umbral que falta es un catálogo incompleto, no un cero. El motor se
 * detiene antes que calcular con un supuesto.
 */
function umbralRequerido(config: ConfigActividad, tipo: Umbral['tipo']): Umbral {
  const u = config.umbrales.find((x) => x.tipo === tipo)
  if (!u) {
    throw new ConfiguracionInvalida(
      `Falta el umbral "${tipo}" para ${config.fraccion} en el catálogo. ` +
        'El motor no evalúa con umbrales asumidos.',
    )
  }
  return u
}

function exigeMonto(u: Umbral): Centavos {
  if (u.enCentavos === null) {
    throw new ConfiguracionInvalida(
      `El umbral "${u.tipo}" no tiene monto y no está marcado como "siempre".`,
    )
  }
  return u.enCentavos
}

/**
 * Qué monto de la operación se compara contra este umbral.
 *
 * Aquí vive la trampa que el mercado suele fallar: sobre el MISMO número hay
 * tres reglas. El Art. 17 (identificación y aviso) mide sin IVA; el Art. 32
 * (efectivo) mide con IVA y accesorios; y el aviso reporta el total. Las dos
 * primeras las decide esta función leyendo `umbral.base`, que es un dato del
 * catálogo: si la confirmación de POR CONFIRMAR-4 cambia la base del Art. 17,
 * se actualiza el catálogo y este código no se toca.
 */
function montoContra(operacion: Operacion, umbral: Umbral): Centavos {
  return umbral.base === 'con_iva' ? operacion.montoTotal : operacion.montoBase
}

interface DatosMotivo {
  resultadoAviso: Evaluacion['resultadoAviso']
  requiereIdentificacion: boolean
  efectivoRestringido: boolean
  alertaProximidad: boolean
  montoParaAviso: Centavos
  umbralAviso: Centavos
  umbralProximidad: Centavos
  identificacionSiempre: boolean
}

/**
 * Explicación legible de por qué salió lo que salió. Va a la bitácora y a la
 * pantalla: quien captura tiene que poder entender la obligación sin leer el
 * código, y quien audita tiene que poder seguir el razonamiento.
 */
function redactarMotivo(d: DatosMotivo): string {
  const partes: string[] = []

  partes.push(
    d.identificacionSiempre
      ? 'Identificación obligatoria en esta actividad sin importar el monto.'
      : d.requiereIdentificacion
        ? 'El monto alcanza el umbral de identificación.'
        : 'No alcanza el umbral de identificación.',
  )

  if (d.resultadoAviso === 'individual') {
    partes.push(
      `Aviso por operación individual: ${formatearPesos(d.montoParaAviso)} ` +
        `alcanza el umbral de ${formatearPesos(d.umbralAviso)}.`,
    )
  } else if (d.resultadoAviso === 'acumulacion') {
    partes.push('Aviso por acumulación en la ventana vigente.')
  } else {
    partes.push(
      `Sin aviso: ${formatearPesos(d.montoParaAviso)} no alcanza ` +
        `${formatearPesos(d.umbralAviso)}.`,
    )
  }

  if (d.alertaProximidad) {
    partes.push(
      `Proximidad al umbral: alcanza o supera ${formatearPesos(d.umbralProximidad)}.`,
    )
  }

  if (d.efectivoRestringido) {
    partes.push('Pago en efectivo por encima del límite del Art. 32.')
  }

  return partes.join(' ')
}

/**
 * ACUMULACIÓN — semana 4.
 *
 * Lo que falta implementar, con la regla ya escrita para no reinterpretarla:
 *
 *   1. Ventana de `config.ventanaMeses` meses contada hacia atrás desde
 *      `fechaOperacion`. Deslizante, no periodos fijos.
 *   2. Solo suman las operaciones que INDIVIDUALMENTE caen en el supuesto de
 *      identificación (`caeEnIdentificacion`). En V Bis eso es todas, pero el
 *      motor no puede darlo por hecho: en Fr. XV sí discrimina.
 *   3. Se acumula por mismo cliente + misma actividad, cruzando sucursales.
 *      Nunca entre fracciones distintas (caso A-04).
 *   4. El aviso se dispara EN EL MOMENTO en que la suma alcanza el umbral,
 *      no al cierre del periodo.
 *
 * El historial ya llega en `entrada.historial`; el motor no tiene que ir a
 * buscarlo. Ver docs/PRUEBAS.md casos A-01 a A-06.
 */
