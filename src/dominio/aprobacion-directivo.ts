/**
 * La aprobación de directivo del Art. 23 Ter 5 (Acuerdo 115/2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL DISPARADOR NO ES UN BOOLEANO
 * ────────────────────────────────────────────────────────────────────────────
 * El artículo lo describe como una conjunción: la aprobación se exige cuando la
 * persona «reúne los requisitos para ser considerada Persona Políticamente
 * Expuesta **y, además, con Grado de Riesgo alto**». Dos mitades, las dos
 * necesarias.
 *
 * Pero cada mitad puede estar en tres estados, no en dos: sí, no, y **todavía
 * no se sabe**. Un cliente sin declaración PEP no es un cliente que no sea PEP;
 * un obligado que no ha configurado su metodología de riesgo no tiene clientes
 * de grado bajo, tiene clientes sin clasificar. Colapsar «no se sabe» a «no» es
 * exactamente la regla dura 6 aplicada aquí: devolvería «no se requiere
 * aprobación», que suena a respuesta y es una omisión.
 *
 * Así que la conjunción se resuelve con lógica de tres valores (Kleene), y cada
 * celda tiene su razón:
 *
 *   PEP \ ALTO │   sí            no                  no se sabe
 *   ───────────┼──────────────────────────────────────────────────────
 *   sí         │ EXIGIBLE      no exigible        INDETERMINABLE
 *   no         │ no exigible   no exigible        no exigible
 *   no se sabe │ INDETERMINABLE  no exigible      INDETERMINABLE
 *
 * La fila y la columna del «no» son el caso que sorprende y es correcto: **un
 * falso definitivo en cualquiera de las dos mitades cierra la conjunción**, sin
 * importar lo que valga la otra. Si consta que el cliente no es de grado alto,
 * el Art. 23 Ter 5 no le aplica aunque nadie sepa si es PEP — y eso no tapa
 * nada, porque la declaración PEP que falta es un incumplimiento del Cap. III
 * Quáter que se señala por su cuenta, en su propia sección del expediente.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UN SOLO PRINCIPIO PARA LA CADUCIDAD
 * ────────────────────────────────────────────────────────────────────────────
 * El Art. 23 Bis 1 obliga a reevaluar el Grado de Riesgo al menos cada seis
 * meses, así que una evaluación puede estar vencida. La regla aquí es una sola:
 *
 *   **Que un dato esté vencido nunca reduce la obligación.**
 *
 * De ahí salen los dos casos, que parecen asimétricos y no lo son. Un grado
 * alto vencido sigue disparando la exigencia: caducar no degrada a nadie. Un
 * grado no-alto vencido deja de ser un «no» definitivo y pasa a «no se sabe»:
 * el dato que descartaba la obligación ya no está vigente, y sostenerlo sería
 * apoyar un «no se requiere» en algo que la propia norma declaró viejo.
 */

/** El acto que se está consintiendo, o que espera consentimiento. */
export interface ActoDelCliente {
  readonly id: string
  /** `YYYY-MM-DD`. La fecha del acto, no la de captura. */
  readonly fecha: string
}

/**
 * Lo que se sabe del carácter PEP del cliente.
 *
 * `conocida: false` es no tener declaración. VIZO nunca resuelve si alguien es
 * PEP —esa frontera está en `ALCANCE.md`—: registra lo declarado y quién lo
 * revisó, y aquí solo lee ese registro.
 */
export type SituacionPep =
  | { readonly conocida: false }
  | { readonly conocida: true; readonly catalogado: boolean }

/**
 * Lo que se sabe del Grado de Riesgo del cliente.
 *
 * `conocida: false` cubre las dos formas de no saber que no son lo mismo por
 * fuera y sí por dentro: que el obligado no tenga metodología vigente (ADR-21),
 * y que la tenga pero nunca haya evaluado a este cliente.
 */
export type SituacionRiesgo =
  | { readonly conocida: false }
  | { readonly conocida: true; readonly esAlto: boolean; readonly vencida: boolean }

/** Por qué no se puede resolver la conjunción del Art. 23 Ter 5. */
export type MitadQueFalta = 'caracter_pep' | 'grado_de_riesgo' | 'grado_vencido'

export type ExigenciaDeAprobacion =
  | {
      readonly estado: 'exigible'
      /** El grado que la dispara está vencido: la exigencia vale igual. */
      readonly conGradoVencido: boolean
    }
  | { readonly estado: 'no_exigible'; readonly porque: 'no_es_pep' | 'no_es_grado_alto' }
  /**
   * Ni sí ni no. No es un error ni un pase: es el hueco, y quien lo reciba
   * tiene que mostrarlo con lo que falta, nunca sustituirlo por «no se
   * requiere».
   */
  | { readonly estado: 'indeterminable'; readonly falta: readonly MitadQueFalta[] }

/**
 * ¿El Art. 23 Ter 5 exige aprobación para este cliente?
 *
 * No mira operaciones: la exigencia es del cliente, y de ella cuelga después la
 * pregunta de qué actos quedaron consentidos.
 */
export function exigenciaDeAprobacion(entrada: {
  readonly pep: SituacionPep
  readonly riesgo: SituacionRiesgo
}): ExigenciaDeAprobacion {
  const { pep, riesgo } = entrada

  // La caducidad nunca reduce la obligación: un grado alto vencido sigue
  // siendo alto; un grado no-alto vencido deja de ser un «no» que se pueda
  // oponer.
  const alto: boolean | null = !riesgo.conocida
    ? null
    : riesgo.esAlto
      ? true
      : riesgo.vencida
        ? null
        : false

  const esPep: boolean | null = pep.conocida ? pep.catalogado : null

  // Un falso definitivo en cualquiera de las dos mitades cierra la conjunción.
  // Va ANTES que el hueco a propósito: si consta que no aplica, decirlo es más
  // útil que pedir el dato que falta, y no esconde nada.
  if (esPep === false) return { estado: 'no_exigible', porque: 'no_es_pep' }
  if (alto === false) return { estado: 'no_exigible', porque: 'no_es_grado_alto' }

  if (esPep === true && alto === true) {
    return { estado: 'exigible', conGradoVencido: riesgo.conocida && riesgo.vencida }
  }

  const falta: MitadQueFalta[] = []
  if (esPep === null) falta.push('caracter_pep')
  if (alto === null) {
    falta.push(riesgo.conocida ? 'grado_vencido' : 'grado_de_riesgo')
  }
  return { estado: 'indeterminable', falta }
}

// ─────────────────────────────────────────────────────────────────────────
// Qué actos quedaron consentidos
// ─────────────────────────────────────────────────────────────────────────

/**
 * Una aprobación asentada, vista desde el dominio.
 *
 * `previa` y `posterior` son los dos casos que el ¶1 nombra —«previamente o con
 * posterioridad al acto u operación»— y cubren de forma distinta, porque
 * consienten cosas distintas: la posterior consiente actos que ya ocurrieron y
 * los nombra uno por uno; la previa consiente actos que aún no ocurren, y por
 * eso lleva el plazo que el propio directivo fijó.
 */
export type AprobacionAsentada =
  | {
      readonly id: string
      readonly momento: 'posterior'
      readonly fechaAprobacion: string
      /** Los actos que nombra. El ¶1 dice «los actos u operaciones RESPECTIVOS». */
      readonly operacionesConsentidas: readonly string[]
    }
  | {
      readonly id: string
      readonly momento: 'previa'
      readonly fechaAprobacion: string
      readonly vigenteHasta: string
    }

/** ¿Esta aprobación consiente este acto? */
export function consiente(aprobacion: AprobacionAsentada, acto: ActoDelCliente): boolean {
  if (aprobacion.momento === 'posterior') {
    return aprobacion.operacionesConsentidas.includes(acto.id)
  }
  // La previa cubre por ventana, y no hacia atrás: un acto anterior a la firma
  // no fue consentido «previamente» por ella. Ese caso se cierra con una
  // aprobación posterior que lo nombre, que es lo que el ¶1 prevé.
  // Comparación lexicográfica: para YYYY-MM-DD equivale a la cronológica.
  return acto.fecha >= aprobacion.fechaAprobacion && acto.fecha <= aprobacion.vigenteHasta
}

/**
 * Los actos que ninguna aprobación consiente.
 *
 * Es el faltante que hay que cerrar, y VIZO lo calcula pero no lo cierra: la
 * firma es de una persona (regla dura 5 en espíritu, y el propio artículo dice
 * «obtener la aprobación de un directivo»).
 */
export function actosSinConsentir(entrada: {
  readonly actos: readonly ActoDelCliente[]
  readonly aprobaciones: readonly AprobacionAsentada[]
}): readonly ActoDelCliente[] {
  return entrada.actos.filter((a) => !entrada.aprobaciones.some((ap) => consiente(ap, a)))
}

// ─────────────────────────────────────────────────────────────────────────
// Cuál de las dos ramas del ¶2 le toca al obligado
// ─────────────────────────────────────────────────────────────────────────

export type ViaDeAprobacion = 'directivo' | 'constancia_persona_fisica'

/**
 * La rama no se elige: la impone qué es el obligado.
 *
 * ¶2: «Cuando quien realice la Actividad Vulnerable sea una persona física, la
 * aprobación referida en el párrafo anterior SE SUBSANARÁ con una constancia».
 * Subsanar es sustituir, no ofrecer una alternativa: una persona física no
 * tiene directivos que firmen, y una moral no se libra de la firma emitiéndose
 * una constancia a sí misma. La base lo impide con un trigger; esto existe para
 * que la pantalla pida los campos correctos y no para repetir la validación.
 */
export function viaQueCorresponde(tipoPersonaDelObligado: string): ViaDeAprobacion {
  return tipoPersonaDelObligado === 'fisica' ? 'constancia_persona_fisica' : 'directivo'
}
