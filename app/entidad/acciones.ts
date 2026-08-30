'use server'

import { revalidatePath } from 'next/cache'
import { Client } from 'pg'
import { sesionRequerida } from '../../src/supabase/sesion'
import {
  evaluarEntidadYRegistrar,
  type BaseInformacion,
} from '../../src/persistencia/entidad'
import { DatoDeRiesgoInvalido, PlazoDeRiesgoAusente } from '../../src/persistencia/riesgo'
import { montoCapturado, OperacionInvalida } from '../../src/persistencia/operaciones'
import { hoyEnMexico } from '../../src/dominio/fechas'

/**
 * Evaluar el riesgo de la ENTIDAD (ADR-28).
 *
 * Los totales del periodo los DECLARA el obligado, no los cuenta VIZO: la
 * evaluación puede cubrir un año en el que el obligado todavía no operaba en
 * la plataforma, y rellenar con lo registrado aquí diría «esto fue tu año»
 * sobre un pedazo del año. Lo declarado queda sellado en la fila append-only
 * junto con su base de información — decir de dónde salió es parte del acto.
 */

export interface EstadoEvaluacion {
  ok: boolean | null
  mensaje: string
}

function cadenaDeConexion(): string {
  const url = process.env['VIZO_DB_URL']
  if (url === undefined || url === '') {
    throw new Error('Falta VIZO_DB_URL. Cópiala de .env.example a .env.local.')
  }
  return url
}

export async function accionEvaluarEntidad(
  _previo: EstadoEvaluacion,
  form: FormData,
): Promise<EstadoEvaluacion> {
  const sesion = await sesionRequerida()
  const ctx = { usuarioId: sesion.usuarioId, tenantId: sesion.tenantId, rol: sesion.rol }

  const base = String(form.get('base') ?? '') as BaseInformacion
  const texto = (campo: string): string | undefined => {
    const v = String(form.get(campo) ?? '').trim()
    return v === '' ? undefined : v
  }

  const entero = (campo: string, nombre: string): number => {
    const v = String(form.get(campo) ?? '').trim().replace(/,/g, '')
    if (v === '' || !/^\d+$/.test(v)) {
      throw new DatoDeRiesgoInvalido([`El ${nombre} debe ser un número entero.`])
    }
    return Number(v)
  }

  const periodoInicio = texto('periodoInicio')
  const periodoFin = texto('periodoFin')

  const db = new Client({ connectionString: cadenaDeConexion() })
  await db.connect()
  try {
    const r = await evaluarEntidadYRegistrar(db, {
      sesion: ctx,
      hoy: hoyEnMexico(),
      base,
      ...(base !== 'proyectados' && periodoInicio !== undefined ? { periodoInicio } : {}),
      ...(base !== 'proyectados' && periodoFin !== undefined ? { periodoFin } : {}),
      totalClientes: entero('totalClientes', 'total de clientes'),
      totalOperaciones: entero('totalOperaciones', 'total de operaciones'),
      montoOperadoCentavos: montoCapturado(
        String(form.get('montoOperado') ?? ''),
        'el monto operado',
      ),
    })

    if (r.resultado.estado !== 'evaluado') {
      return {
        ok: false,
        mensaje:
          'No se evaluó nada, y no es un error: a la metodología del obligado le falta ' +
          'configuración de entidad. La pantalla de arriba dice exactamente qué.',
      }
    }

    revalidatePath('/entidad')
    return {
      ok: true,
      mensaje:
        `Riesgo residual ${String(r.resultado.residual)} (inherente ${String(r.resultado.inherente)} − ` +
        `mitigación ${String(r.resultado.mitigacion)}) → grado ${r.resultado.gradoClave}. ` +
        (r.resultado.auditoria === 'externa_obligatoria'
          ? 'Con grado alto, la evaluación de efectividad anual la hace un auditor externo certificado ante la UIF (Arts. 44 y 45 del Acuerdo).'
          : 'Con este grado, el Art. 45 permite que la evaluación de efectividad anual la haga el área interna — la externa siempre puede elegirse.'),
    }
  } catch (e) {
    if (e instanceof DatoDeRiesgoInvalido) return { ok: false, mensaje: e.message }
    if (e instanceof PlazoDeRiesgoAusente) return { ok: false, mensaje: e.message }
    if (e instanceof OperacionInvalida) return { ok: false, mensaje: e.message }
    const bruto = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied|insufficient_privilege/i.test(bruto)) {
      return {
        ok: false,
        mensaje:
          'Solo un administrador registra la evaluación de entidad: es la fila de la que depende ' +
          'la auditoría del obligado. La regla la aplica la base de datos.',
      }
    }
    return { ok: false, mensaje: bruto }
  } finally {
    await db.end()
  }
}
