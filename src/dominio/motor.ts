import type {
  ConfigActividad,
  EntradaEvaluacion,
  Evaluacion,
  Operacion,
  OperacionPrevia,
  Umbral,
} from './tipos'
import { centavos, formatearPesos, porcentaje, sumar, type Centavos } from './dinero'
import { dentroDeVentana, inicioVentana } from './fechas'

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
 * Cubre identificación, aviso individual, acumulación en ventana deslizante,
 * restricción de efectivo del Art. 32 y alerta de proximidad.
 */
/**
 * ¿El monto alcanza este umbral?
 *
 * ISSUE #17. Antes esto era `>=` escrito cuatro veces, y el Art. 17 no usa una
 * sola fórmula: la identificación de la Fr. XV dice «por un valor mensual
 * SUPERIOR a», mientras que casi todo lo demás dice «igual o superior». En el
 * valor exacto del umbral las dos redacciones dan respuestas distintas.
 *
 * La diferencia vive en el catálogo (`umbrales.inclusivo`), no aquí: una
 * fracción nueva trae la suya y esta función no cambia.
 */
function alcanza(monto: Centavos, umbral: Umbral): boolean {
  const exigido = exigeMonto(umbral)
  return umbral.inclusivo ? monto >= exigido : monto > exigido
}

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
    : alcanza(montoContra(operacion, uIdentificacion), uIdentificacion)

  // ── 2. Aviso individual ────────────────────────────────────────────────
  // La base (con o sin IVA) sale de la columna `base` del umbral. Es la
  // diferencia entre el Art. 17 y el Art. 32, y es un DATO, no un `if`.
  const montoParaAviso = montoContra(operacion, uAviso)
  const umbralAviso = exigeMonto(uAviso)
  const avisoIndividual = alcanza(montoParaAviso, uAviso)

  // ── 3. Acumulación en ventana deslizante ───────────────────────────────
  // Confirmado por el SAT en el webinar del 20/06/2026:
  //   · Ventana de N meses (dato del catálogo) hacia atrás desde ESTA
  //     operación. Deslizante, no periodos fijos de calendario.
  //   · Solo suman las operaciones que INDIVIDUALMENTE caen en el supuesto de
  //     identificación. En V Bis eso es todas, pero el motor no lo da por
  //     hecho: en Fr. XV hay umbral de identificación y ahí sí discrimina.
  //   · Se acumula por mismo cliente y misma actividad, CRUZANDO SUCURSALES.
  //     Es lo que un Excel por sucursal no puede ver.
  //   · El aviso se dispara EN EL MOMENTO en que la suma alcanza el umbral,
  //     no al cierre del periodo.
  const inicio = inicioVentana(operacion.fechaOperacion, config.ventanaMeses)
  const enVentana = entrada.historial.filter(
    (h) => h.caeEnIdentificacion && dentroDeVentana(h.fechaOperacion, inicio, operacion.fechaOperacion),
  )
  // Se suma el mismo tipo de monto contra el que se compara el umbral de
  // aviso, para que la comparación sea homogénea. Si POR CONFIRMAR-4 mueve el
  // Art. 17 a "con impuestos", el historial ya trae `montoTotal`.
  const sumaVentana = sumar(
    montoParaAviso,
    ...enVentana.map((h) => montoDePrevia(h, uAviso)),
  )
  const operacionesAcumuladas: readonly string[] = enVentana.map((h) => h.id)

  // Si la operación por sí sola ya obliga a avisar, el aviso es individual: no
  // se reporta dos veces la misma obligación.
  //
  // POR CONFIRMAR-8 (auditoría de la semana 4): qué pasa DESPUÉS del primer
  // aviso por acumulación. Si los pagos 1-3 ya dispararon uno, el pago 4 deja
  // la suma por encima del umbral y aquí vuelve a marcar 'acumulacion'.
  // Las dos lecturas posibles:
  //   (a) cada operación nueva que mantiene la suma sobre el umbral se reporta
  //       —es la conducta actual, y la conservadora: no omite nada;
  //   (b) la ventana se "reinicia" tras el aviso y solo vuelve a disparar
  //       cuando las operaciones NO reportadas cruzan el umbral por su cuenta.
  // El marco no lo resuelve explícitamente. Se implementa (a) porque un aviso
  // de más se corrige; uno omitido se sanciona. Pendiente de validar con el
  // especialista PLD antes del piloto.
  const avisoPorAcumulacion = !avisoIndividual && alcanza(sumaVentana, uAviso)

  // ── 4. Restricción de efectivo (Art. 32) ───────────────────────────────
  // Solo aplica cuando el pago fue en efectivo, y se mide sobre el total
  // CON IVA y accesorios.
  const montoParaEfectivo = montoContra(operacion, uEfectivo)
  const efectivoRestringido = operacion.esEfectivo && alcanza(montoParaEfectivo, uEfectivo)

  // ── 5. Alerta de proximidad ────────────────────────────────────────────
  // Decisión de producto, no obligación legal: avisar cuando falta poco.
  // No se levanta si ya hay aviso — sería ruido sobre una obligación firme.
  const umbralProximidad = porcentaje(umbralAviso, config.proximidadPct)
  // Se mide sobre la SUMA de la ventana, no solo sobre esta operación: dos
  // pagos que juntos rozan el umbral son la señal que importa (caso A-06).
  const alertaProximidad =
    !avisoIndividual && !avisoPorAcumulacion && sumaVentana >= umbralProximidad

  // ── 6. Identidad ───────────────────────────────────────────────────────
  // Cuando la identidad no se resolvió por RFC ni CURP, el motor NO asume que
  // se trata de otro cliente: acumula conservadoramente y escala a revisión
  // humana. Un falso positivo cuesta minutos de revisión; un falso negativo
  // es un aviso omitido.
  const requiereRevisionIdentidad = cliente.resolucionIdentidad === 'identidad_alterna'

  const resultadoAviso = avisoIndividual ? 'individual' : avisoPorAcumulacion ? 'acumulacion' : 'no'

  return {
    operacionId: operacion.id,
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
      sumaVentana,
      operacionesEnVentana: enVentana.length,
      ventanaMeses: config.ventanaMeses,
      inicioVentana: inicio,
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

  // 6. La operación evaluada NO puede venir también en su propio historial.
  //    Encontrado en la auditoría de la semana 4: si el llamador olvida
  //    excluirla, su monto se cuenta dos veces y la suma dispara un aviso que
  //    no corresponde. Un aviso de más es menos grave que uno omitido, pero
  //    sigue siendo un cálculo que no se puede defender.
  if (historial.some((h) => h.id === operacion.id)) {
    throw new EntradaInvalida(
      `La operación ${operacion.id} viene también en su propio historial: se contaría dos veces. ` +
        'Excluye la operación evaluada al consultar el historial.',
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
 * tres reglas, y el Art. 6 del Reglamento (reformado DOF 27-03-2026) las dice
 * en dos párrafos:
 *
 *   1. Art. 17 (identificación y aviso) → «no deberán considerar las
 *      contribuciones y demás accesorios»
 *   2. El Aviso → «reportar los montos TOTALES […] incluidos los relacionados
 *      con las contribuciones, sin necesidad de desglosarlos»
 *   3. Art. 32 (efectivo) → «deberán considerarse las contribuciones y demás
 *      accesorios»
 *
 * Las reglas 1 y 3 las decide esta función leyendo `umbral.base`, dato del
 * catálogo. La 2 no vive aquí: la aplica el generador del aviso, que reporta
 * `monto_total`. Contrastado contra el texto el 16 de agosto de 2026 — era la
 * pregunta abierta más cara del proyecto, y la respuesta confirmó la postura
 * provisional. Ver `docs/DECISIONES.md`.
 *
 * «Contribuciones y demás accesorios» es más amplio que «IVA»: el ISAI es una
 * contribución. Por eso el enum dice `sin_contribuciones` y no `sin_iva`.
 */
function montoContra(operacion: Operacion, umbral: Umbral): Centavos {
  return umbral.base === 'con_contribuciones' ? operacion.montoTotal : operacion.montoBase
}

/**
 * El monto de una operación del historial, en la misma base que el umbral.
 *
 * Si el umbral se evalúa `con_contribuciones` y la operación previa no trae total, el
 * motor SE DETIENE. La auditoría de la semana 4 mostró que el fallback
 * anterior —usar la base— sumaba de menos en silencio, y sumar de menos en la
 * acumulación es exactamente cómo se omite un aviso.
 *
 * Es el mismo criterio que en el resto del sistema: ante un dato que falta,
 * fallar ruidosamente en vez de calcular con un supuesto.
 */
function montoDePrevia(previa: OperacionPrevia, umbral: Umbral): Centavos {
  if (umbral.base !== 'con_contribuciones') {
    return previa.montoBase
  }
  if (previa.montoTotal === undefined) {
    throw new EntradaInvalida(
      `El umbral de aviso se evalúa con impuestos, pero la operación ${previa.id} del historial ` +
        'no trae monto total. Sumar solo la base omitiría parte de la acumulación.',
    )
  }
  return previa.montoTotal
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
  sumaVentana: Centavos
  operacionesEnVentana: number
  ventanaMeses: number
  inicioVentana: string
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
    partes.push(
      `Aviso por acumulación: ${formatearPesos(d.sumaVentana)} sumados con ` +
        `${d.operacionesEnVentana} operación(es) previa(s) desde el ${d.inicioVentana} ` +
        `(ventana de ${d.ventanaMeses} meses) alcanzan el umbral de ` +
        `${formatearPesos(d.umbralAviso)}.`,
    )
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
