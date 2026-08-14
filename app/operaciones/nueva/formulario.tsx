'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { crearOperacion, type EstadoOperacion } from './acciones'

const INICIAL: EstadoOperacion = { problemas: [], valores: {} }

export interface Opcion {
  id: string
  etiqueta: string
}

/** Formas de pago del catálogo c_FormaPago del SAT que aplican a una aportación. */
const FORMAS_PAGO: Array<{ codigo: string; nombre: string }> = [
  { codigo: '03', nombre: 'Transferencia electrónica' },
  { codigo: '01', nombre: 'Efectivo' },
  { codigo: '02', nombre: 'Cheque nominativo' },
  { codigo: '04', nombre: 'Tarjeta de crédito' },
  { codigo: '28', nombre: 'Tarjeta de débito' },
]

export interface CodigoDeCatalogo {
  codigo: string
  descripcion: string
}

export function FormularioOperacion({
  clientes,
  sucursales,
  desarrollos,
  instrumentos,
  monedas,
  hoy,
}: {
  clientes: Opcion[]
  sucursales: Opcion[]
  desarrollos: Opcion[]
  instrumentos: CodigoDeCatalogo[]
  monedas: CodigoDeCatalogo[]
  hoy: string
}) {
  const [estado, accion, enviando] = useActionState(crearOperacion, INICIAL)

  // Misma lección que el alta de clientes (semana 5): React 19 resetea el
  // formulario tras cada acción y el `select` controlado se desincroniza del
  // DOM. Se remonta con una key nueva en cada intento fallido.
  const intento = useRef(0)
  const [clave, setClave] = useState('op-0')
  const previo = (campo: string, pordefecto = ''): string =>
    estado.valores[campo] ?? pordefecto

  const [efectivo, setEfectivo] = useState(false)

  useEffect(() => {
    if (estado.problemas.length === 0) return
    setEfectivo(estado.valores['formaPago'] === '01')
    intento.current += 1
    setClave(`op-${intento.current}`)
  }, [estado])

  return (
    <form action={accion} key={clave} className="tarjeta">
      {estado.problemas.length > 0 && (
        <div className="error">
          <strong>Revisa estos datos antes de registrar:</strong>
          <ul>
            {estado.problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="fila">
        <label>
          <span>Aportante</span>
          <select name="clienteId" required defaultValue={previo('clienteId')}>
            <option value="">Elige…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sucursal</span>
          <select name="sucursalId" required defaultValue={previo('sucursalId')}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lo que el AVISO necesita describir. No es burocracia de captura: sin
          estos tres campos la operación no se puede reportar, y hasta hace poco
          se guardaba igual y desaparecía del aviso sin que nada fallara. */}
      <div className="fila">
        <label>
          <span>
            Desarrollo inmobiliario{' '}
            <span className="pista">— el aviso lo describe</span>
          </span>
          <select name="desarrolloId" required defaultValue={previo('desarrolloId')}>
            <option value="">Elige…</option>
            {desarrollos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Instrumento monetario</span>
          <select
            name="instrumentoMonetario"
            required
            defaultValue={previo('instrumentoMonetario', '1')}
          >
            {instrumentos.map((i) => (
              <option key={i.codigo} value={i.codigo}>
                {i.descripcion}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fila">
        <label>
          <span>Moneda</span>
          <select name="monedaCodigo" required defaultValue={previo('monedaCodigo', '1')}>
            {monedas.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.descripcion}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Institución <span className="pista">(si el pago pasó por una)</span>
          </span>
          <input name="nombreInstitucion" defaultValue={previo('nombreInstitucion')} />
        </label>
      </div>

      <label className="casilla">
        <input
          type="checkbox"
          name="aportacionFideicomiso"
          value="si"
          defaultChecked={previo('aportacionFideicomiso') === 'si'}
        />
        <span>La aportación se hizo a través de un fideicomiso</span>
      </label>

      <div className="fila">
        <label>
          <span>
            Fecha de la operación <span className="pista">— la del acto, no la de captura</span>
          </span>
          <input type="date" name="fechaOperacion" required defaultValue={previo('fechaOperacion', hoy)} />
        </label>
        <label>
          <span>Forma de pago</span>
          <select
            name="formaPago"
            defaultValue={previo('formaPago', '03')}
            onChange={(e) => setEfectivo(e.target.value === '01')}
          >
            {FORMAS_PAGO.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {efectivo && (
        <p className="aviso">
          El efectivo se mide contra el <strong>Art. 32</strong>, que va <strong>con IVA</strong> y
          es una <strong>prohibición</strong>, no solo un aviso. Captura el IVA para que el límite
          se calcule bien.
        </p>
      )}

      <fieldset>
        <legend>Importes</legend>
        <p className="sub" style={{ margin: '0 0 .75rem' }}>
          El umbral del <strong>Art. 17</strong> se mide sobre el monto <strong>sin</strong>{' '}
          impuestos; el aviso se reporta con el total. Por eso se capturan por separado.
        </p>
        <div className="fila">
          <label>
            <span>Monto de la operación <span className="pista">(sin impuestos)</span></span>
            <input name="montoBase" required placeholder="400000.00" defaultValue={previo('montoBase')} />
          </label>
          <label>
            <span>IVA <span className="pista">(opcional)</span></span>
            <input name="iva" placeholder="0.00" defaultValue={previo('iva')} />
          </label>
        </div>
        <div className="fila">
          <label>
            <span>ISAI <span className="pista">(opcional)</span></span>
            <input name="isai" placeholder="0.00" defaultValue={previo('isai')} />
          </label>
          <label>
            <span>Otros accesorios <span className="pista">(opcional)</span></span>
            <input name="otrosAccesorios" placeholder="0.00" defaultValue={previo('otrosAccesorios')} />
          </label>
        </div>
      </fieldset>

      <label>
        <span>Descripción del bien <span className="pista">(opcional)</span></span>
        <input name="descripcionBien" defaultValue={previo('descripcionBien')} />
      </label>

      <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Evaluando…' : 'Registrar y evaluar'}
        </button>
        <Link href="/operaciones">
          <button type="button" className="secundario">
            Cancelar
          </button>
        </Link>
      </div>
    </form>
  )
}
