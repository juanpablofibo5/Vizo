import { describe, expect, it } from 'vitest'
import { centavos, pesos } from '../../src/dominio/dinero'
import { sumarMeses } from '../../src/dominio/fechas'
import {
  InsumoDePerfilIncoherente,
  contrastarConElPerfil,
  mesDe,
  primerDiaReevaluable,
  reevaluacionDebida,
  vencimientoDelPerfil,
  type OperacionDelMes,
  type PerfilVigente,
} from '../../src/dominio/perfil-transaccional'

const PLAZOS = { maduracionMeses: 6, cadenciaMeses: 6 }

const PERFIL: PerfilVigente = {
  perfilId: 'p1',
  origen: 'inicial',
  montoMaximoMensual: pesos(500_000),
  operacionesMaximasMensuales: null,
  fechaAncla: '2027-03-05',
  vence: '2027-09-05',
}

const op = (id: string, fecha: string, monto: number): OperacionDelMes => ({
  id,
  fecha,
  monto: pesos(monto),
})

const contrastar = (
  operaciones: readonly OperacionDelMes[],
  perfil: PerfilVigente | null = PERFIL,
  evaluada = operaciones[operaciones.length - 1]!,
) => contrastarConElPerfil({ perfil, operacion: evaluada, operacionesDelMes: operaciones })

/**
 * El Perfil transaccional (Art. 23 Ter 1 del Acuerdo 115/2026).
 *
 * Lo que estas pruebas protegen es que el número contra el que se compara lo
 * siga poniendo el cliente. Si alguna vez alguien mete una tolerancia, un tope
 * por omisión o un margen «razonable», algo de aquí muere.
 */
describe('La desviación del Perfil transaccional', () => {
  it('lo declarado por el cliente es el tope, y cruzarlo desvía', () => {
    const r = contrastar([op('a', '2027-03-10', 300_000), op('b', '2027-03-20', 250_000)])
    expect(r.estado).toBe('desviado')
    if (r.estado !== 'desviado') return
    expect(r.acumuladoDelMes).toBe(pesos(550_000))
    expect(r.desviaciones).toEqual([
      {
        por: 'monto_mensual',
        declarado: pesos(500_000),
        acumuladoDelMes: pesos(550_000),
        excedente: pesos(50_000),
      },
    ])
  })

  it('exactamente en el tope no se desvía: el cliente dijo «hasta»', () => {
    const r = contrastar([op('a', '2027-03-10', 500_000)])
    expect(r.estado).toBe('dentro_del_perfil')
  })

  it('un peso arriba del tope sí', () => {
    const r = contrastar([op('a', '2027-03-10', 500_001)])
    expect(r.estado).toBe('desviado')
  })

  it('no hay tolerancia: el excedente más chico posible desvía', () => {
    // Un centavo. Si alguien mete un margen del 1% o del 5% «para no llenar de
    // ruido el panel», este caso lo delata: ese margen es un criterio de riesgo
    // que el obligado no configuró y el cliente no declaró.
    const r = contrastarConElPerfil({
      perfil: PERFIL,
      operacion: { id: 'a', fecha: '2027-03-10', monto: centavos(50_000_001) },
      operacionesDelMes: [{ id: 'a', fecha: '2027-03-10', monto: centavos(50_000_001) }],
    })
    expect(r.estado).toBe('desviado')
  })

  it('el mes es de calendario: lo del mes anterior no suma', () => {
    const r = contrastar([op('b', '2027-04-02', 400_000)])
    expect(r.estado).toBe('dentro_del_perfil')
    if (r.estado !== 'dentro_del_perfil') return
    expect(r.mes).toBe('2027-04')
    expect(r.acumuladoDelMes).toBe(pesos(400_000))
  })

  it('el número declarado también se compara, cuando el obligado lo recabó', () => {
    const conNumero = { ...PERFIL, operacionesMaximasMensuales: 2 }
    const r = contrastar(
      [op('a', '2027-03-05', 10_000), op('b', '2027-03-12', 10_000), op('c', '2027-03-20', 10_000)],
      conNumero,
    )
    expect(r.estado).toBe('desviado')
    if (r.estado !== 'desviado') return
    expect(r.desviaciones).toEqual([
      { por: 'numero_mensual', declarado: 2, operacionesDelMes: 3 },
    ])
  })

  it('sin número declarado no se inventa un tope de operaciones', () => {
    const r = contrastar([
      op('a', '2027-03-05', 1_000),
      op('b', '2027-03-06', 1_000),
      op('c', '2027-03-07', 1_000),
      op('d', '2027-03-08', 1_000),
      op('e', '2027-03-09', 1_000),
    ])
    expect(r.estado).toBe('dentro_del_perfil')
  })

  it('las dos desviaciones pueden darse a la vez, y se reportan las dos', () => {
    const conNumero = { ...PERFIL, operacionesMaximasMensuales: 1 }
    const r = contrastar(
      [op('a', '2027-03-05', 300_000), op('b', '2027-03-12', 300_000)],
      conNumero,
    )
    expect(r.estado).toBe('desviado')
    if (r.estado !== 'desviado') return
    expect(r.desviaciones.map((d) => d.por)).toEqual(['monto_mensual', 'numero_mensual'])
  })

  it('un cliente que vuelve a operar rompe la premisa del acto único (¶4)', () => {
    const actoUnico = { ...PERFIL, origen: 'acto_unico' as const }
    const r = contrastar([op('a', '2027-03-05', 100_000), op('b', '2027-03-25', 100_000)], actoUnico)
    expect(r.estado).toBe('desviado')
    if (r.estado !== 'desviado') return
    expect(r.desviaciones).toEqual([{ por: 'acto_unico_roto', operacionesDelMes: 2 }])
  })

  it('el acto único con su único acto no desvía', () => {
    const actoUnico = { ...PERFIL, origen: 'acto_unico' as const }
    const r = contrastar([op('a', '2027-03-05', 100_000)], actoUnico)
    expect(r.estado).toBe('dentro_del_perfil')
  })
})

describe('El hueco y los insumos que no cuadran', () => {
  it('sin perfil no dice «dentro»: devuelve el hueco', () => {
    const r = contrastar([op('a', '2027-03-10', 9_000_000)], null)
    expect(r).toEqual({ estado: 'sin_perfil', mes: '2027-03' })
  })

  it('si la operación evaluada no viene en el mes, se detiene', () => {
    // La lección del motor de umbrales: cuando la operación evaluada llegaba a
    // veces dentro y a veces fuera de su propio historial, la suma salía bien
    // unas veces y duplicada otras, y nada reventaba.
    expect(() =>
      contrastarConElPerfil({
        perfil: PERFIL,
        operacion: op('z', '2027-03-10', 100_000),
        operacionesDelMes: [op('a', '2027-03-01', 100_000)],
      }),
    ).toThrow(InsumoDePerfilIncoherente)
  })

  it('una operación repetida en el mes se detiene antes de contarla dos veces', () => {
    expect(() =>
      contrastarConElPerfil({
        perfil: PERFIL,
        operacion: op('a', '2027-03-10', 300_000),
        operacionesDelMes: [op('a', '2027-03-10', 300_000), op('a', '2027-03-10', 300_000)],
      }),
    ).toThrow(InsumoDePerfilIncoherente)
  })

  it('mezclar meses se detiene', () => {
    expect(() =>
      contrastarConElPerfil({
        perfil: PERFIL,
        operacion: op('b', '2027-04-02', 100_000),
        operacionesDelMes: [op('a', '2027-03-28', 400_000), op('b', '2027-04-02', 100_000)],
      }),
    ).toThrow(InsumoDePerfilIncoherente)
  })

  it('una operación anterior al ancla del perfil no se contrasta contra él', () => {
    expect(() => contrastar([op('a', '2027-02-10', 100_000)])).toThrow(InsumoDePerfilIncoherente)
  })
})

describe('Los dos relojes del Art. 23 Ter 1', () => {
  it('el perfil inicial vence a los seis meses del acto, no de la captura', () => {
    expect(vencimientoDelPerfil({ origen: 'inicial', fechaAncla: '2027-03-05' }, PLAZOS)).toBe(
      '2027-09-05',
    )
  })

  it('la reevaluación cuenta desde el día del ejercicio, no desde el ancla', () => {
    expect(
      vencimientoDelPerfil({ origen: 'reevaluacion', vigenteDesde: '2027-09-20' }, PLAZOS),
    ).toBe('2028-03-20')
  })

  it('la corrección hereda el vencimiento: compra exactitud, nunca tiempo', () => {
    expect(
      vencimientoDelPerfil({ origen: 'correccion', venceDelCorregido: '2027-09-05' }, PLAZOS),
    ).toBe('2027-09-05')
  })

  it('los dos plazos son distintos aunque hoy valgan lo mismo', () => {
    // Si una reforma mueve la cadencia y deja la maduración, el perfil inicial
    // no se mueve. Compartir la fila los movería juntos.
    const plazos = { maduracionMeses: 6, cadenciaMeses: 3 }
    expect(vencimientoDelPerfil({ origen: 'inicial', fechaAncla: '2027-03-05' }, plazos)).toBe(
      '2027-09-05',
    )
    expect(
      vencimientoDelPerfil({ origen: 'reevaluacion', vigenteDesde: '2027-09-05' }, plazos),
    ).toBe('2027-12-05')
  })

  it('un plazo que no viene del catálogo detiene el cálculo', () => {
    expect(() =>
      vencimientoDelPerfil({ origen: 'inicial', fechaAncla: '2027-03-05' }, {
        maduracionMeses: 0,
        cadenciaMeses: 6,
      }),
    ).toThrow(InsumoDePerfilIncoherente)
  })

  it('el fin de mes se recorta igual que en Postgres', () => {
    // `date '2027-08-31' + interval '6 months'` da 2028-02-29 en Postgres, y el
    // trigger recalcula el vencimiento allá. Si aquí saliera 2028-03-02, ningún
    // perfil anclado a fin de mes se podría guardar.
    expect(sumarMeses('2027-08-31', 6)).toBe('2028-02-29')
    expect(primerDiaReevaluable('2027-08-31', PLAZOS)).toBe('2028-02-29')
  })

  it('la reevaluación se debe el día del vencimiento, no al siguiente', () => {
    expect(reevaluacionDebida(PERFIL, '2027-09-04')).toBe(false)
    expect(reevaluacionDebida(PERFIL, '2027-09-05')).toBe(true)
  })

  it('el mes se lee de la fecha del acto', () => {
    expect(mesDe('2027-01-31')).toBe('2027-01')
    expect(mesDe('2027-12-01')).toBe('2027-12')
  })
})
