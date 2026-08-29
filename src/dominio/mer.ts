import {
  DELITOS_DEL_PARRAFO_FINAL,
  ELEMENTOS_MINIMOS,
  metodologiaCompleta,
  type DelitoCpf,
  type Requisito,
} from './metodologia'

/**
 * El MER — la Metodología de Evaluación de Riesgos, escrita.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTE DOCUMENTO, Y POR QUÉ ES EL FOSO
 * ────────────────────────────────────────────────────────────────────────────
 * La pregunta que un verificador hará en 2028 no es «¿tienes expediente?». Es
 * «¿por qué este cliente quedó en riesgo medio en marzo de 2027, con qué
 * metodología, aprobada por quién, y puedes reconstruirlo?». El MER es la
 * respuesta escrita: la metodología del Cap. II Quáter tal como el obligado la
 * declaró y aprobó, generada DESDE su configuración — nunca desde una
 * plantilla. Ningún competidor lo declara como entregable (BMK-01 §02); por
 * eso A-06 lo pidió como eje del pitch y no como una feature más.
 *
 * Tres reglas, heredadas de la Constancia (ADR-20):
 *
 * 1. **Cada afirmación cita su respaldo.** Lo que no sale de un dato del
 *    sistema no se escribe: sale como pendiente, con su artículo.
 * 2. **La cobertura no se recalcula aquí.** Viene de
 *    `coberturaDeLaMetodologia` (ADR-27), la misma función que pinta la
 *    pantalla — dos lugares decidiendo lo mismo acaban diciendo cosas
 *    distintas.
 * 3. **Markdown, no PDF**: se hashea, se versiona, se diffea y se lee dentro
 *    de veinte años sin una aplicación que lo abra.
 */

export interface FactorDelMer {
  readonly factor: string
  readonly elemento: string
  readonly elementoNombre: string
  readonly peso: number
  readonly delitos: readonly DelitoCpf[]
}

export interface NivelDelMer {
  readonly orden: number
  readonly clave: string
  readonly nombre: string
  readonly evidenciaExigible: string
  readonly valor: number
}

export interface MitiganteDelMer {
  readonly descripcion: string
  readonly efecto: string
  readonly elementos: readonly string[]
  readonly nivel: { readonly clave: string; readonly valor: number } | null
  readonly evidenciaRef: string | null
}

export interface GradoDelMer {
  readonly clave: string
  readonly nombre: string
  readonly orden: number
  readonly esAlto: boolean
  readonly puntajeMinimo: number
}

export interface EvaluacionDelMer {
  readonly evaluadoEn: string
  readonly baseInformacion: 'anio_completo' | 'parcial_desde_inicio' | 'proyectados'
  readonly inherente: number
  readonly mitigacion: number
  readonly residual: number
  readonly gradoClave: string
  readonly esAlto: boolean
  readonly vence: string
}

export interface VersionAnterior {
  readonly version: number
  readonly vigenteDesde: string | null
  readonly aprobadoEn: string | null
}

export interface DatosDelMer {
  readonly version: number
  readonly vigenteDesde: string | null
  readonly aprobadoPor: string | null
  readonly aprobadoEn: string | null
  readonly metodoMedicion: string | null
  readonly metodoEntidad: string | null
  readonly factores: readonly FactorDelMer[]
  readonly pesosPorElemento: Readonly<Record<string, number>>
  readonly mitigantes: readonly MitiganteDelMer[]
  readonly niveles: readonly NivelDelMer[]
  readonly escala: readonly GradoDelMer[]
  readonly evaluacionEntidad: EvaluacionDelMer | null
  readonly versionesAnteriores: readonly VersionAnterior[]
  /** La cobertura del Art. 10 Septies 1, YA derivada (ADR-27). */
  readonly cobertura: readonly Requisito[]
}

export interface SeccionMer {
  readonly titulo: string
  readonly fundamento: string
  readonly hechos: readonly { readonly afirmacion: string; readonly respaldo: string }[]
  /** Qué falta, con el artículo en la voz del texto. Vacío = acreditada. */
  readonly pendientes: readonly string[]
}

export interface MerCompuesto {
  readonly secciones: readonly SeccionMer[]
  readonly total: number
  readonly acreditadas: number
  readonly conPendientes: number
  readonly completa: boolean
  readonly gradoEntidad: string | null
}

const NOMBRE_ELEMENTO: Record<string, string> = {
  actos_operaciones: 'actos u operaciones',
  tipo_cliente: 'tipo de personas Clientes o Usuarias',
  geografia: 'países y áreas geográficas',
  transacciones_canales: 'transacciones y canales',
}
const nombreDe = (clave: string): string => NOMBRE_ELEMENTO[clave] ?? clave

const BASES_ESCRITAS: Record<EvaluacionDelMer['baseInformacion'], string> = {
  anio_completo: 'información del año inmediato anterior (Art. 10 Septies 2, fr. II)',
  parcial_desde_inicio:
    'información disponible desde el inicio de la Actividad Vulnerable (Transitorio Segundo ¶2)',
  proyectados: 'datos proyectados, por no contar con operaciones del periodo (Art. 10 Septies 2)',
}

/** Compone las secciones del MER desde la configuración declarada. Puro. */
export function componerMer(d: DatosDelMer): MerCompuesto {
  const requisito = (clave: Requisito['clave']): Requisito | undefined =>
    d.cobertura.find((r) => r.clave === clave)

  const secciones: SeccionMer[] = []

  // ── 1 · Gobierno ──────────────────────────────────────────────────────
  {
    const hechos = [
      {
        afirmacion:
          `Versión **${String(d.version)}** de la metodología, vigente desde ` +
          `**${d.vigenteDesde ?? '—'}**, aprobada por **${d.aprobadoPor ?? '—'}** el ` +
          `**${d.aprobadoEn ?? '—'}**.`,
        respaldo: 'modelos_riesgo (aprobación con nombre y hora) y bitácora encadenada',
      },
      {
        afirmacion:
          `Método de medición declarado: **${d.metodoMedicion ?? 'sin declarar'}**. Método de ` +
          `evaluación de entidad declarado: **${d.metodoEntidad ?? 'sin declarar'}**.`,
        respaldo: 'modelos_riesgo.metodo_medicion / metodo_entidad',
      },
      ...(d.versionesAnteriores.length > 0
        ? [
            {
              afirmacion:
                'Versiones anteriores conservadas: ' +
                d.versionesAnteriores
                  .map((v) => `v${String(v.version)} (vigente desde ${v.vigenteDesde ?? '—'})`)
                  .join(' · ') +
                '. Cada evaluación registrada cita la versión con la que se hizo.',
              respaldo: 'modelos_riesgo (estado sustituido) y evaluaciones append-only',
            },
          ]
        : []),
    ]
    const pendientes =
      d.metodoEntidad === null
        ? [
            'La metodología no declara su método de evaluación de entidad, y de esa evaluación ' +
              'depende el tipo de auditoría (Arts. 44/45 del Acuerdo).',
          ]
        : []
    secciones.push({
      titulo: 'La metodología y su gobierno',
      fundamento: 'Art. 10 Septies del Acuerdo 115/2026 · Art. 18 fr. VII de la LFPIORPI',
      hechos,
      pendientes,
    })
  }

  // ── 2 · Fr. I — elementos e indicadores ───────────────────────────────
  {
    const hechos = ELEMENTOS_MINIMOS.flatMap((e) => {
      const propios = d.factores.filter((f) => f.elemento === e)
      if (propios.length === 0) return []
      return [
        {
          afirmacion:
            `**${nombreDe(e)}** — ${String(propios.length)} indicador(es): ` +
            propios.map((f) => `«${f.factor}» (peso ${String(f.peso)})`).join(' · '),
          respaldo: 'factores_modelo, congelados con la versión',
        },
      ]
    })
    secciones.push({
      titulo: 'Elementos e indicadores',
      fundamento: 'Art. 10 Septies 1, fr. I',
      hechos,
      pendientes: requisito('fr_i')?.falta ?? [],
    })
  }

  // ── 3 · Fr. II — el método y los valores ──────────────────────────────
  {
    const hechos = Object.entries(d.pesosPorElemento).map(([e, v]) => ({
      afirmacion: `Valor del elemento **${nombreDe(e)}**: **${String(v)}**.`,
      respaldo: 'pesos_elemento, congelados con la versión',
    }))
    secciones.push({
      titulo: 'El método de medición y los valores por elemento',
      fundamento: 'Art. 10 Septies 1, fr. II',
      hechos,
      pendientes: requisito('fr_ii')?.falta ?? [],
    })
  }

  // ── 4 · Fr. III — mitigantes ──────────────────────────────────────────
  {
    const hechos = d.mitigantes.map((m) => ({
      afirmacion:
        `**${m.descripcion}** — efecto: ${m.efecto} Actúa sobre: ` +
        `${m.elementos.map(nombreDe).join(', ') || '—'}. Nivel de efectividad: ` +
        (m.nivel === null
          ? '**pendiente de declarar**'
          : `**${m.nivel.clave}** (reduce ${String(m.nivel.valor)})`) +
        (m.evidenciaRef === null ? '' : `. Evidencia: ${m.evidenciaRef}`) +
        '.',
      respaldo: 'mitigantes y mitigantes_elementos, congelados con la versión',
    }))
    secciones.push({
      titulo: 'Mitigantes identificados al momento del diseño',
      fundamento: 'Art. 10 Septies 1, fr. III',
      hechos,
      pendientes: requisito('fr_iii')?.falta ?? [],
    })
  }

  // ── 5 · ¶ final — indicadores de los dos delitos ──────────────────────
  {
    const hechos = ELEMENTOS_MINIMOS.flatMap((e) =>
      DELITOS_DEL_PARRAFO_FINAL.flatMap((delito) => {
        const marcados = d.factores.filter((f) => f.elemento === e && f.delitos.includes(delito))
        if (marcados.length === 0) return []
        const art = delito === 'art_139_quater' ? '139 Quáter' : '400 Bis'
        return [
          {
            afirmacion:
              `**${nombreDe(e)} × Art. ${art} CPF**: ` +
              marcados.map((f) => `«${f.factor}»`).join(' · '),
            respaldo: 'factores_modelo.delitos',
          },
        ]
      }),
    )
    secciones.push({
      titulo: 'Indicadores específicos de los delitos del CPF',
      fundamento: 'Art. 10 Septies 1, párrafo final (Arts. 139 Quáter y 400 Bis del CPF)',
      hechos,
      pendientes: requisito('parrafo_final')?.falta ?? [],
    })
  }

  // ── 6 · La escala de Grado de Riesgo ──────────────────────────────────
  {
    const hechos = [...d.escala]
      .sort((a, b) => a.orden - b.orden)
      .map((g) => ({
        afirmacion:
          `**${g.nombre}** (${g.clave}) — desde ${String(g.puntajeMinimo)} puntos` +
          (g.esAlto ? '. **Marcado como alto**: dispara las medidas reforzadas.' : '.'),
        respaldo: 'grados_riesgo, con cortes del obligado',
      }))
    secciones.push({
      titulo: 'La escala de Grado de Riesgo y sus cortes',
      fundamento: 'Art. 23 Bis del Acuerdo (al menos tres clasificaciones)',
      hechos,
      pendientes: d.escala.length === 0 ? ['La escala de grados no está definida.'] : [],
    })
  }

  // ── 7 · La evaluación de la entidad ───────────────────────────────────
  {
    const hechos: { afirmacion: string; respaldo: string }[] = []
    if (d.niveles.length > 0) {
      hechos.push({
        afirmacion:
          'Escala de efectividad de mitigantes: ' +
          [...d.niveles]
            .sort((a, b) => a.orden - b.orden)
            .map(
              (n) =>
                `**${n.nombre}** (reduce ${String(n.valor)}; exige: ${n.evidenciaExigible})`,
            )
            .join(' · '),
        respaldo: 'niveles_efectividad, congelados con la versión (ADR-28)',
      })
    }
    if (d.evaluacionEntidad !== null) {
      const ev = d.evaluacionEntidad
      hechos.push({
        afirmacion:
          `Última evaluación de la entidad (${ev.evaluadoEn}), sobre ` +
          `${BASES_ESCRITAS[ev.baseInformacion]}: riesgo inherente **${String(ev.inherente)}**, ` +
          `mitigación **${String(ev.mitigacion)}**, residual **${String(ev.residual)}** → grado ` +
          `**${ev.gradoClave}**. Consecuencia (Arts. 44/45): ` +
          (ev.esAlto
            ? '**el dictamen anual exige persona auditora externa independiente certificada por la UIF**.'
            : '**el dictamen anual puede emitirlo el área de auditoría o control interno**.') +
          ` Reevaluación a más tardar el ${ev.vence}.`,
        respaldo: 'evaluaciones_entidad, append-only, con el desglose por elemento en su detalle',
      })
    }
    const pendientes: string[] = []
    if (d.evaluacionEntidad === null) {
      pendientes.push(
        'No hay evaluación de entidad registrada bajo esta versión. El Art. 18 fr. VII de la ' +
          'Ley exige evaluar los Riesgos propios del obligado, y de su grado depende el tipo de ' +
          'auditoría anual (Arts. 44/45 del Acuerdo).',
      )
    }
    for (const m of d.mitigantes) {
      if (m.nivel === null) {
        pendientes.push(
          `El mitigante «${m.descripcion}» no tiene nivel de efectividad declarado: sin él, la ` +
            'evaluación de entidad se detiene.',
        )
      }
    }
    secciones.push({
      titulo: 'La evaluación de la entidad y su consecuencia de auditoría',
      fundamento: 'Art. 18 frs. VII y XI de la LFPIORPI · Arts. 44 y 45 del Acuerdo 115/2026',
      hechos,
      pendientes,
    })
  }

  // ── 8 · Cobertura del Art. 10 Septies 1, sin re-decidir ───────────────
  {
    secciones.push({
      titulo: 'Cobertura del Art. 10 Septies 1',
      fundamento: 'Art. 10 Septies 1 del Acuerdo 115/2026 (las cuatro exigencias)',
      hechos: d.cobertura
        .filter((r) => r.acreditado)
        .map((r) => ({
          afirmacion: `**${r.fundamento}** — acreditada: ${r.exige}`,
          respaldo: 'derivada por la misma función que la pantalla (ADR-27)',
        })),
      // El resumen, no el detalle: las faltas ya viven en su sección, y
      // repetirlas aquí haría parecer que hay el doble de pendientes.
      pendientes: d.cobertura
        .filter((r) => !r.acreditado)
        .map((r) => `**${r.fundamento}** — no acreditada: ${r.exige} (detalle en su sección)`),
    })
  }

  const acreditadas = secciones.filter((s) => s.pendientes.length === 0).length
  return {
    secciones,
    total: secciones.length,
    acreditadas,
    conPendientes: secciones.length - acreditadas,
    completa: metodologiaCompleta(d.cobertura),
    gradoEntidad: d.evaluacionEntidad?.gradoClave ?? null,
  }
}

export interface EncabezadoDelMer {
  readonly razonSocial: string
  readonly rfc: string
  /** 'AAAA-MM-DD' de la emisión. */
  readonly fecha: string
}

/** El MER, escrito. Markdown: se hashea, se diffea, se lee en veinte años. */
export function escribirMer(m: MerCompuesto, o: EncabezadoDelMer, version: number): string {
  const cabecera = [
    '# Metodología de Evaluación de Riesgos (MER)',
    '',
    `**${o.razonSocial}** · RFC ${o.rfc}`,
    `Versión ${String(version)} de la metodología · Emitido el ${o.fecha}`,
    '',
    '---',
    '',
    '## Qué es este documento',
    '',
    '**Es la metodología de evaluación de Riesgos del Capítulo II Quáter, tal como este sujeto ' +
      'obligado la declaró y aprobó**, escrita desde su configuración registrada — no desde una ' +
      'plantilla. Los elementos mínimos los fija la norma; los indicadores, los valores, los ' +
      'mitigantes y los cortes son decisiones del obligado, y este documento las asienta con su ' +
      'respaldo verificable.',
    '',
    m.conPendientes === 0
      ? `Las **${String(m.total)} secciones** están acreditadas con datos del sistema.`
      : `De las **${String(m.total)} secciones**, **${String(m.acreditadas)}** están acreditadas ` +
        `y **${String(m.conPendientes)}** tienen pendientes — aparecen abajo con el artículo que ` +
        'los exige, nunca con una redacción supuesta.',
    '',
    '> Ninguna afirmación de este documento se escribió sin un dato del sistema que la respalde. ' +
      'VIZO no propone factores, valores ni mitigantes: acredita los que el obligado declaró.',
    '',
    '---',
    '',
  ].join('\n')

  const cuerpo = m.secciones
    .map((s) => {
      const hechos = s.hechos
        .map((h) => `${h.afirmacion}\n\n  <sub>Verificable en: ${h.respaldo}</sub>`)
        .join('\n\n')
      const pendientes =
        s.pendientes.length === 0
          ? ''
          : [
              '',
              '### ⬚ Pendiente',
              '',
              s.pendientes.map((p) => `- ${p}`).join('\n'),
            ].join('\n')
      return [
        `## ${s.titulo}`,
        '',
        `*${s.fundamento}*`,
        '',
        hechos === '' ? '*Sin configuración declarada en esta sección.*' : hechos,
        pendientes,
      ].join('\n')
    })
    .join('\n\n---\n\n')

  const pie = [
    '',
    '---',
    '',
    '## Sobre este documento',
    '',
    'Fundamento: Capítulo II Quáter del Acuerdo 115/2026 (DOF 7 de agosto de 2026, edición ' +
      'vespertina, código 5795797) y Art. 18 frs. VII y XI de la LFPIORPI (reforma DOF ' +
      '16 de julio de 2025). Emitirlo es un acto, no una descarga: el texto queda congelado con ' +
      'su huella SHA-256 y esta versión puede regenerarse y compararse en cualquier fecha.',
    '',
    m.completa
      ? 'La metodología acredita las cuatro exigencias del Art. 10 Septies 1.'
      : '**Atención:** la metodología aún no acredita las cuatro exigencias del Art. 10 ' +
        'Septies 1 — el Transitorio Segundo no admite avances parciales el 1 de marzo de 2027. ' +
        'Los pendientes están arriba, cada uno con su artículo.',
  ].join('\n')

  return `${cabecera}${cuerpo}\n${pie}\n`
}
