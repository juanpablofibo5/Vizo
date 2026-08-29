import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { conectar, crearTenantConUsuario } from '../soporte/db'
import { enTransaccionDeSesion, type ContextoSesion } from '../../src/persistencia/transaccion'
import {
  activarModelo,
  agregarFactor,
  crearModelo,
  definirGrado,
} from '../../src/persistencia/riesgo'
import {
  agregarMitigante,
  declararMetodoEntidad,
  definirNivelEfectividad,
  evaluarEntidadYRegistrar,
} from '../../src/persistencia/entidad'
import { emitirMer, listarMer } from '../../src/persistencia/mer'
import { coberturaDeLaMetodologia } from '../../src/dominio/metodologia'
import { componerMer, escribirMer, type DatosDelMer } from '../../src/dominio/mer'

const HOY = '2027-03-15'

// ─────────────────────────────────────────────────────────────────────────────
// La composición pura
// ─────────────────────────────────────────────────────────────────────────────

const datosCompletos = (): DatosDelMer => {
  const factores = [
    { factor: 'Persona moral reciente', elemento: 'tipo_cliente', elementoNombre: 'Tipo', peso: 15, delitos: ['art_139_quater', 'art_400_bis'] as const },
    { factor: 'Zona fronteriza', elemento: 'geografia', elementoNombre: 'Geografía', peso: 10, delitos: ['art_139_quater', 'art_400_bis'] as const },
    { factor: 'Pago fraccionado por terceros', elemento: 'actos_operaciones', elementoNombre: 'Actos', peso: 20, delitos: ['art_139_quater', 'art_400_bis'] as const },
    { factor: 'Canal remoto', elemento: 'transacciones_canales', elementoNombre: 'Canales', peso: 5, delitos: ['art_139_quater', 'art_400_bis'] as const },
  ]
  const pesosPorElemento = { actos_operaciones: 25, geografia: 25, tipo_cliente: 25, transacciones_canales: 25 }
  const mitigantes = [
    {
      descripcion: 'Doble revisión del expediente.',
      efecto: 'Reduce identidades incompletas.',
      elementos: ['tipo_cliente'],
      nivel: { clave: 'auditado', valor: 20 },
      evidenciaRef: 'Manual §7.2',
    },
  ]
  return {
    version: 2,
    vigenteDesde: '2027-03-01',
    aprobadoPor: 'Ana Admin',
    aprobadoEn: '2027-03-01T10:00:00Z',
    metodoMedicion: 'suma_ponderada_por_elemento',
    metodoEntidad: 'residual_por_elemento',
    factores,
    pesosPorElemento,
    mitigantes,
    niveles: [
      { orden: 1, clave: 'documentado', nombre: 'Documentado', evidenciaExigible: 'Política escrita.', valor: 5 },
      { orden: 2, clave: 'auditado', nombre: 'Auditado', evidenciaExigible: 'Constancia de revisión.', valor: 20 },
    ],
    escala: [
      { clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0 },
      { clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35 },
      { clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70 },
    ],
    evaluacionEntidad: {
      evaluadoEn: '2027-03-10T09:00:00Z',
      baseInformacion: 'anio_completo',
      inherente: 100,
      mitigacion: 20,
      residual: 80,
      gradoClave: 'alto',
      esAlto: true,
      vence: '2028-03-10',
    },
    versionesAnteriores: [{ version: 1, vigenteDesde: '2026-09-01', aprobadoEn: '2026-09-01T10:00:00Z' }],
    cobertura: coberturaDeLaMetodologia({
      metodoMedicion: 'suma_ponderada_por_elemento',
      indicadores: factores.map((f) => ({ elemento: f.elemento, peso: f.peso, delitos: [...f.delitos] })),
      pesosPorElemento,
      mitigantes: mitigantes.map((m) => ({ descripcion: m.descripcion, efecto: m.efecto, elementos: m.elementos })),
    }),
  }
}

describe('La composición del MER', () => {
  it('con la configuración completa, las ocho secciones quedan acreditadas', () => {
    const m = componerMer(datosCompletos())
    expect(m.total).toBe(8)
    expect(m.conPendientes).toBe(0)
    expect(m.completa).toBe(true)
    expect(m.gradoEntidad).toBe('alto')

    const texto = escribirMer(m, { razonSocial: 'Prueba SA', rfc: 'PRU010101AAA', fecha: HOY }, 2)
    expect(texto).toContain('# Metodología de Evaluación de Riesgos')
    expect(texto).toContain('persona auditora externa independiente certificada por la UIF')
    expect(texto).toContain('acredita las cuatro exigencias')
    expect(texto).not.toContain('⬚ Pendiente')
  })

  it('sin evaluación de entidad y sin delitos declarados, los huecos salen con su artículo', () => {
    const base = datosCompletos()
    const datos: DatosDelMer = {
      ...base,
      evaluacionEntidad: null,
      factores: base.factores.map((f) => ({ ...f, delitos: [] })),
      cobertura: coberturaDeLaMetodologia({
        metodoMedicion: 'suma_ponderada_por_elemento',
        indicadores: base.factores.map((f) => ({ elemento: f.elemento, peso: f.peso, delitos: [] })),
        pesosPorElemento: base.pesosPorElemento,
        mitigantes: base.mitigantes.map((m) => ({ descripcion: m.descripcion, efecto: m.efecto, elementos: m.elementos })),
      }),
    }
    const m = componerMer(datos)
    expect(m.completa).toBe(false)
    expect(m.conPendientes).toBeGreaterThan(0)

    const texto = escribirMer(m, { razonSocial: 'Prueba SA', rfc: 'PRU010101AAA', fecha: HOY }, 2)
    // El ¶ final exige indicador por elemento Y por delito: ocho celdas vacías.
    expect((texto.match(/Sin indicador del Art\./g) ?? []).length).toBe(8)
    expect(texto).toContain('Art. 18 fr. VII')
    expect(texto).toContain('no admite avances parciales')
  })

  it('un mitigante sin nivel sale como pendiente nombrado, nunca callado', () => {
    const base = datosCompletos()
    const m = componerMer({
      ...base,
      mitigantes: [{ ...base.mitigantes[0]!, nivel: null }],
    })
    const texto = escribirMer(m, { razonSocial: 'P', rfc: 'PRU010101AAA', fecha: HOY }, 2)
    expect(texto).toContain('no tiene nivel de efectividad declarado')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// La emisión, contra la base
// ─────────────────────────────────────────────────────────────────────────────

describe('La emisión del MER', () => {
  let db: Client
  let admin: ContextoSesion

  beforeAll(async () => {
    db = await conectar()
  })

  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    const marca = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100)
    admin = await crearTenantConUsuario(db, marca, 'admin')
  })

  const metodologiaVigente = async () => {
    await definirGrado(db, { sesion: admin, clave: 'bajo', nombre: 'Bajo', orden: 1, esAlto: false, puntajeMinimo: 0, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion: admin, clave: 'medio', nombre: 'Medio', orden: 2, esAlto: false, puntajeMinimo: 35, vigenteDesde: '2027-03-01' })
    await definirGrado(db, { sesion: admin, clave: 'alto', nombre: 'Alto', orden: 3, esAlto: true, puntajeMinimo: 70, vigenteDesde: '2027-03-01' })
    const { modeloId } = await crearModelo(db, { sesion: admin, metodoMedicion: 'suma_ponderada' })
    await declararMetodoEntidad(db, { sesion: admin, modeloId, metodo: 'residual_por_elemento' })

    const el = await db.query(`select id::text, clave from elementos_riesgo order by clave`)
    const elementos = el.rows as { id: string; clave: string }[]
    const tipoCliente = elementos.find((e) => e.clave === 'tipo_cliente')
    if (tipoCliente === undefined) throw new Error('falta tipo_cliente')

    await agregarFactor(db, { sesion: admin, modeloId, elementoId: tipoCliente.id, factor: 'Factor de prueba', peso: 10 })
    await enTransaccionDeSesion(db, admin, async () => {
      for (const e of elementos) {
        await db.query(
          `insert into pesos_elemento (tenant_id, modelo_id, elemento_id, peso) values ($1,$2,$3,25)`,
          [admin.tenantId, modeloId, e.id],
        )
      }
    })
    const { nivelId } = await definirNivelEfectividad(db, {
      sesion: admin, modeloId, orden: 1, clave: 'auditado', nombre: 'Auditado',
      evidenciaExigible: 'Constancia de revisión interna.', valor: 20,
    })
    await agregarMitigante(db, {
      sesion: admin, modeloId,
      descripcion: 'Doble revisión del expediente antes de operar.',
      efecto: 'Reduce la exposición del tipo de cliente.',
      elementoIds: [tipoCliente.id], nivelId, evidenciaRef: 'Manual §7.2',
    })
    await activarModelo(db, { sesion: admin, modeloId, vigenteDesde: '2027-03-01' })
    return { modeloId }
  }

  it('sin modelo vigente no hay MER: habría que inventar la metodología', async () => {
    await expect(emitirMer(db, { sesion: admin, hoy: HOY })).rejects.toThrow(/vigente/)
    const n = await db.query(`select count(*)::int as n from mer_emitidos where tenant_id = $1`, [admin.tenantId])
    expect((n.rows[0] as { n: number }).n).toBe(0)
  })

  it('emite congelado: la huella cuadra con el texto, el resumen con la base, y la evaluación citada es la del modelo vigente', async () => {
    await metodologiaVigente()
    await evaluarEntidadYRegistrar(db, {
      sesion: admin, hoy: HOY, base: 'anio_completo',
      periodoInicio: '2026-01-01', periodoFin: '2026-12-31',
      totalClientes: 120, totalOperaciones: 350, montoOperadoCentavos: 5_000_000_00,
    })

    const mer = await emitirMer(db, { sesion: admin, hoy: HOY })
    expect(mer.nueva).toBe(true)
    expect(mer.hash).toBe(createHash('sha256').update(mer.contenido, 'utf8').digest('hex'))
    expect(mer.contenido).toContain('residual **80**')
    expect(mer.contenido).toContain('auditora externa independiente')

    const fila = await db.query(
      `select total, acreditadas, con_pendientes, grado_entidad, contenido from mer_emitidos where id = $1`,
      [mer.merId],
    )
    const f = fila.rows[0] as { total: number; acreditadas: number; con_pendientes: number; grado_entidad: string; contenido: string }
    expect(f.total).toBe(mer.total)
    expect(f.grado_entidad).toBe('alto')
    expect(f.contenido).toBe(mer.contenido)

    // Emitir lo mismo el mismo día devuelve el MISMO documento, no otro.
    const otra = await emitirMer(db, { sesion: admin, hoy: HOY })
    expect(otra.nueva).toBe(false)
    expect(otra.merId).toBe(mer.merId)

    const lista = await enTransaccionDeSesion(db, admin, () => listarMer(db, { sesion: admin }))
    expect(lista).toHaveLength(1)
    expect(lista[0]?.hash).toBe(mer.hash)
  })

  it('sin evaluación de entidad el MER se emite CON el pendiente escrito, no lo esconde', async () => {
    await metodologiaVigente()
    const mer = await emitirMer(db, { sesion: admin, hoy: HOY })
    expect(mer.conPendientes).toBeGreaterThan(0)
    expect(mer.contenido).toContain('No hay evaluación de entidad registrada')
  })

  it('un MER emitido no se reescribe: corregir es emitir otro', async () => {
    await metodologiaVigente()
    const mer = await emitirMer(db, { sesion: admin, hoy: HOY })
    await expect(
      db.query(`update mer_emitidos set contenido = 'otra cosa' where id = $1`, [mer.merId]),
    ).rejects.toThrow()
  })
})
