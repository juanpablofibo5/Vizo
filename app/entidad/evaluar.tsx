'use client'

import { useActionState, useState } from 'react'
import { accionEvaluarEntidad, type EstadoEvaluacion } from './acciones'

/**
 * El formulario de evaluación de la entidad.
 *
 * Cliente únicamente por el interruptor de la base de información: con datos
 * proyectados no hay periodo histórico que declarar, y dejar los campos de
 * fecha a la vista invitaría a llenarlos — la persistencia los rechazaría,
 * pero mejor que el error no se pueda expresar desde el formulario.
 */

const INICIAL: EstadoEvaluacion = { ok: null, mensaje: '' }

const BASES = [
  {
    valor: 'anio_completo',
    nombre: 'Año completo',
    pista: 'Un ejercicio cerrado: doce meses de operación real.',
  },
  {
    valor: 'parcial_desde_inicio',
    nombre: 'Parcial desde el inicio',
    pista: 'Lo operado desde que empezó la actividad, cuando aún no cierra un año.',
  },
  {
    valor: 'proyectados',
    nombre: 'Datos proyectados',
    pista: 'Sin historia que medir: lo que el obligado espera operar.',
  },
] as const

export function FormularioEvaluarEntidad({ reevaluacion }: { reevaluacion: boolean }) {
  const [estado, accion, evaluando] = useActionState<EstadoEvaluacion, FormData>(
    accionEvaluarEntidad,
    INICIAL,
  )
  const [base, setBase] = useState<string>('anio_completo')
  const conPeriodo = base !== 'proyectados'

  return (
    <form action={accion} style={{ display: 'grid', gap: '.9rem' }}>
      <div>
        <h3 style={{ margin: '0 0 .2rem' }}>{reevaluacion ? 'Reevaluar' : 'Evaluar'}</h3>
        <p className="pequeno tenue" style={{ margin: 0, maxWidth: '44rem' }}>
          Los números del periodo los declara el obligado — la evaluación puede cubrir tiempo en
          el que todavía no operaba en VIZO, y contarle solo lo registrado aquí diría «esto fue
          tu año» sobre un pedazo del año. Lo declarado queda sellado con la evaluación.
        </p>
      </div>

      {estado.ok !== null && (
        <div className={estado.ok ? 'exito' : 'error'} style={{ margin: 0 }}>
          {estado.mensaje}
        </div>
      )}

      <fieldset style={{ display: 'grid', gap: '.4rem' }}>
        <legend>Base de la información (Art. 10 Septies 1)</legend>
        {BASES.map((b) => (
          <label key={b.valor} className="casilla parrafo">
            <input
              type="radio"
              name="base"
              value={b.valor}
              checked={base === b.valor}
              onChange={() => {
                setBase(b.valor)
              }}
            />
            <span>
              {b.nombre} <span className="pequeno tenue">· {b.pista}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {conPeriodo && (
        <div className="fila">
          <label>
            <span className="pequeno">Periodo — desde</span>
            <input type="date" name="periodoInicio" required />
          </label>
          <label>
            <span className="pequeno">Periodo — hasta</span>
            <input type="date" name="periodoFin" required />
          </label>
        </div>
      )}

      <div className="fila">
        <label>
          <span className="pequeno">Total de clientes</span>
          <input type="text" name="totalClientes" inputMode="numeric" placeholder="120" required />
        </label>
        <label>
          <span className="pequeno">Total de operaciones</span>
          <input
            type="text"
            name="totalOperaciones"
            inputMode="numeric"
            placeholder="480"
            required
          />
        </label>
        <label>
          <span className="pequeno">Monto operado (MXN)</span>
          <input
            type="text"
            name="montoOperado"
            inputMode="decimal"
            placeholder="18,500,000.00"
            required
          />
        </label>
      </div>

      <div>
        <button type="submit" disabled={evaluando}>
          {evaluando ? 'Evaluando…' : 'Evaluar la entidad'}
        </button>
      </div>
      <p className="pequeno tenue" style={{ margin: 0, maxWidth: '44rem' }}>
        La evaluación queda con tu nombre y la hora, y no se reescribe: una reevaluación es un
        registro nuevo. Del grado que salga depende quién puede hacer la evaluación de
        efectividad anual (Arts. 44 y 45 del Acuerdo 115/2026).
      </p>
    </form>
  )
}
