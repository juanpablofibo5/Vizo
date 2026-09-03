import { formatearPesosTexto } from '../../src/dominio/dinero'
import type { TonoDeRiel } from './riel'

/**
 * Cómo se ve una alerta: su gravedad y con qué se calculó.
 *
 * Una alerta ya es, por definición, algo que alguien tiene que mirar. Lo que
 * decide este módulo es CUÁNTO salta, y esa decisión tiene una regla: el tono
 * nunca se elige por cuánto molesta, sino por si el plazo ya corrió.
 *
 *   · granate — la omisión YA está corriendo, o el acto está prohibido
 *   · ámbar   — hay obligación con plazo por delante, o hay que revisar algo
 *   · neutro  — es información: nada se cruzó
 *
 * Por eso el aviso requerido es ámbar y la aprobación del Art. 23 Ter 5 es
 * granate, aunque las dos sean graves: el aviso tiene hasta el día 17 del mes
 * siguiente, y la operación con PEP de grado alto sin consentimiento ya
 * ocurrió. Es el mismo criterio con el que `ORDEN` las acomoda en la pantalla.
 */

export function tonoDeAlerta(tipo: string, por: string | null): TonoDeRiel {
  // El efectivo del Art. 32 NO es un aviso más: recibirlo está PROHIBIDO. Va
  // antes que el tipo porque comparte `aviso_requerido` con los otros dos.
  if (por === 'efectivo_restringido') return 'critico'
  // El Art. 41 fr. V alerta sobre el acto con cliente de Grado de Riesgo alto.
  // Si el grado que lo disparó YA ESTABA VENCIDO el día del acto, no es solo
  // algo que revisar: la reevaluación del Cap. III Bis se debía desde antes, y
  // el acto se hizo describiendo un riesgo de hace más de un ciclo.
  if (por === 'grado_de_riesgo_alto_vencido') return 'critico'

  switch (tipo) {
    // La omisión corre desde el acto: el ¶1 contempla detectarlo después.
    case 'aprobacion_directivo_pendiente':
      return 'critico'
    // No hay plazo que la ampare: mientras nadie la resuelva, se puede estar
    // operando con una persona listada — y eso no está «por vencer», está
    // pasando. Detectar de más fue decisión de diseño (ADR-30); el granate es
    // su otra mitad: lo detectado de más se mira pronto o estorba.
    case 'screening':
      return 'critico'
    // Obligación con plazo: hasta el día 17 del mes siguiente.
    case 'aviso_requerido':
    case 'desviacion_perfil':
    case 'perfil_ausente':
    case 'revision_identidad':
    // El Art. 41 fr. V no prohíbe operar con estos clientes ni deja una
    // omisión corriendo: pide que alguien lo mire y aplique lo reforzado que
    // corresponda. Ámbar, y no granate, es exactamente eso.
    case 'cliente_riesgo_alto':
    case 'cliente_pep':
      return 'aviso'
    // Nada se cruzó. Es aviso de que la siguiente operación puede cruzarlo.
    case 'proximidad':
      return 'neutro'
    default:
      // Un tipo que este módulo no conoce se pinta ÁMBAR, no neutro. Es la
      // regla dura 6 en una línea: cuando se añada un tipo de alerta nuevo y
      // nadie se acuerde de pasar por aquí, la pantalla va a pedir que lo
      // miren. Pintarlo de neutro lo escondería hasta que alguien lo notara.
      return 'aviso'
  }
}

/** El tipo del enum, dicho como se lee. */
const NOMBRE: Record<string, string> = {
  aviso_requerido: 'aviso requerido',
  aprobacion_directivo_pendiente: 'aprobación pendiente',
  desviacion_perfil: 'desviación de perfil',
  perfil_ausente: 'perfil ausente',
  revision_identidad: 'revisión de identidad',
  proximidad: 'proximidad',
  screening: 'listas de control',
  cliente_riesgo_alto: 'cliente de riesgo alto',
  cliente_pep: 'cliente PEP',
}

export function nombreDeTipo(tipo: string): string {
  return NOMBRE[tipo] ?? tipo.replace(/_/g, ' ')
}

/**
 * Las claves del `detalle`, dichas en español.
 *
 * `detalle` es jsonb que escribieron los productores de alertas, y crece: cada
 * capítulo nuevo mete sus propias claves. Por eso lo que NO está en este mapa
 * no se descarta — se enseña con su clave cruda. Una clave fea a la vista es
 * un recordatorio de que falta traducirla; una clave escondida es un dato del
 * cálculo que desapareció de la explicación sin que nadie se entere.
 */
const ETIQUETA: Record<string, string> = {
  monto_base: 'Monto base',
  monto_total: 'Monto total',
  suma_ventana: 'Suma de la ventana',
  operaciones_en_ventana: 'Operaciones en la ventana',
  ventana_meses: 'Meses de la ventana',
  umbral_proximidad_pct: 'Umbral de proximidad',
  mes: 'Mes',
  acumulado_del_mes: 'Acumulado del mes',
  operaciones_del_mes: 'Operaciones del mes',
  declarado: 'Declarado',
  excedente: 'Excedente',
  via: 'Vía que corresponde',
  grado_vencido: 'El grado estaba vencido',
  coincidencias: 'Coincidencias detectadas',
  listas: 'Listas con coincidencia',
  instrumento_restringido: 'Instrumento del pago',
  fundamento: 'Fundamento',
  grado: 'Grado de Riesgo',
  puntaje: 'Puntaje',
  vence: 'La clasificación vence el',
  clasificacion_vencida_al_acto: 'Ya había vencido al momento del acto',
  fecha_operacion: 'Fecha del acto',
  fecha_declaracion: 'Fecha de la declaración',
  declaracion_revisada: 'Declaración revisada por un administrador',
}

/**
 * Las claves que llevan dinero.
 *
 * Se formatean con `formatearPesosTexto`, el MISMO de todo el portal. La
 * primera versión de este módulo no las formateaba, razonando que el monto
 * «ya viene formateado por quien escribió la alerta» y que pasarlo otra vez
 * sería un segundo formato del mismo dato. Era al revés, y se vio en pantalla:
 * dentro de la misma caja del «Por qué», la suma de la ventana salía
 * `1000000.00` en el desglose de arriba y `$1,000,000.00` en el del motor de
 * abajo. Lo que la base guarda es un `numeric` en texto plano; el formato es
 * presentación, y hay uno solo.
 *
 * El docstring de `formatearPesosTexto` ya contaba este bug con estas mismas
 * palabras —«el panel de alertas mostraba $400000.00»— desde antes de que yo
 * lo reintrodujera.
 */
const MONEDA = new Set([
  'monto_base',
  'monto_total',
  'suma_ventana',
  'acumulado_del_mes',
  'declarado',
  'excedente',
])

/** Los valores que no son texto, dichos sin inventarles formato. */
const VIA: Record<string, string> = {
  directivo: 'aprobación de un directivo',
  constancia_persona_fisica: 'constancia de motivos',
}

export interface ParDelCalculo {
  readonly clave: string
  readonly etiqueta: string
  readonly valor: string
}

/**
 * `detalle` → los pares de «Con qué se calculó».
 *
 * `por` y `motivo` se excluyen porque ya se leen en la tarjeta: `por` es el
 * discriminante que elige el tono, y `motivo` es el párrafo. Repetirlos aquí
 * sería llenar el desglose con lo que el usuario acaba de leer.
 */
export function calculoDeLaAlerta(detalle: Record<string, unknown>): ParDelCalculo[] {
  const pares: ParDelCalculo[] = []
  for (const [clave, valor] of Object.entries(detalle)) {
    if (clave === 'por' || clave === 'motivo') continue
    // Las desviaciones son una lista de objetos: cada una se abre en sus
    // propios pares, prefijados con la desviación de la que salen.
    if (clave === 'desviaciones' && Array.isArray(valor)) {
      for (const d of valor as Record<string, unknown>[]) {
        const de = typeof d['por'] === 'string' ? nombreDeTipo(d['por']) : 'desviación'
        for (const [k, v] of Object.entries(d)) {
          if (k === 'por') continue
          pares.push({
            clave: `${de}.${k}`,
            etiqueta: `${ETIQUETA[k] ?? k} (${de})`,
            valor: comoTexto(k, v),
          })
        }
      }
      continue
    }
    pares.push({ clave, etiqueta: ETIQUETA[clave] ?? clave, valor: comoTexto(clave, valor) })
  }
  return pares
}

function comoTexto(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'
  // Una lista de textos se lee como lista, no como JSON. La alerta de
  // screening trae las listas donde hubo coincidencia y salía en pantalla
  // como ["ofac_sdn"], corchetes y comillas incluidos. Las claves se dejan
  // crudas a propósito —igual que el resto del desglose— para que una clave
  // sin traducir se vea; lo que no aporta nada es la sintaxis del JSON.
  if (Array.isArray(valor) && valor.every((v) => typeof v === 'string')) {
    return valor.length === 0 ? '—' : (valor as string[]).join(', ')
  }
  if (clave === 'via' && typeof valor === 'string') return VIA[valor] ?? valor
  if (clave === 'umbral_proximidad_pct') return `${String(valor)}%`
  if (MONEDA.has(clave) && (typeof valor === 'string' || typeof valor === 'number')) {
    return formatearPesosTexto(String(valor))
  }
  if (typeof valor === 'string' || typeof valor === 'number') return String(valor)
  return JSON.stringify(valor)
}
