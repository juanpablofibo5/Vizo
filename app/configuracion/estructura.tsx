'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import {
  bajaIntegrante,
  guardarFigura,
  guardarIntegrante,
  registrarEnvioSat,
  type Resultado,
} from './acciones'
import type { EstadoEstructura, PapelIntegrante } from '../../src/persistencia/estructura'

/**
 * La estructura del Cap. II Ter (Art. 10 Sexies del Acuerdo 115/2026).
 *
 * El trámite ocurre en el Portal del SAT con la e.firma del RFC del propio
 * fideicomiso o figura — expresamente no la del representante (Art. 4 ¶3).
 * Esta pantalla es lo de antes y lo de después: capturar la estructura con los
 * campos exactos del Anexo para llegar al Portal con todo, y dejar constancia
 * de qué se envió y cuándo. Corregir es dar de baja y capturar de nuevo (¶4):
 * por eso ninguna fila se edita.
 */

const PAPEL_FIDEICOMISO: Array<[PapelIntegrante, string]> = [
  ['fiduciario', 'Fiduciario'],
  ['delegado_fiduciario', 'Delegado fiduciario'],
  ['fideicomitente', 'Fideicomitente'],
  ['fideicomisario', 'Fideicomisario'],
]
const PAPEL_FIGURA: Array<[PapelIntegrante, string]> = [
  ['asociante', 'Asociante'],
  ['asociado', 'Asociado'],
  ['otro', 'Otro (con descripción)'],
]

const NOMBRE_PAPEL: Record<string, string> = {
  fiduciario: 'Fiduciario',
  delegado_fiduciario: 'Delegado fiduciario',
  fideicomitente: 'Fideicomitente',
  fideicomisario: 'Fideicomisario',
  asociante: 'Asociante',
  asociado: 'Asociado',
  otro: 'Otro',
}

const NOMBRE_ESTADO: Record<string, string> = {
  capturado: 'Capturado · pendiente de envío',
  enviado: 'Enviado al SAT',
  baja: 'Dado de baja',
}

function Mensaje({ estado }: { estado: Resultado | null }) {
  if (estado === null) return null
  return <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
}

function FormularioFigura({ tipoPersona, hoy }: { tipoPersona: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarFigura,
    null,
  )
  const esFideicomiso = tipoPersona === 'fideicomiso'
  const [tipoFigura, setTipoFigura] = useState(esFideicomiso ? 'fideicomiso' : 'asociacion_en_participacion')

  return (
    <form action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '30rem' }}>
      <Mensaje estado={estado} />
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Los campos son los del {esFideicomiso ? 'Anexo 2 Bis, sección I' : 'Anexo 2 Ter, sección I'}{' '}
        — los mismos que pide la herramienta del Portal.
      </p>

      {esFideicomiso ? (
        <input type="hidden" name="tipoFigura" value="fideicomiso" />
      ) : (
        <label style={{ margin: 0 }}>
          <span>Tipo de figura jurídica</span>
          <select
            name="tipoFigura"
            value={tipoFigura}
            onChange={(e) => { setTipoFigura(e.target.value) }}
          >
            <option value="asociacion_en_participacion">Asociación en Participación</option>
            <option value="otra">Otra</option>
          </select>
        </label>
      )}
      {tipoFigura === 'otra' && (
        <label style={{ margin: 0 }}>
          <span>Descripción de la figura</span>
          <input name="descripcionOtra" required />
        </label>
      )}

      <label style={{ margin: 0 }}>
        <span>Número, identificador o referencia</span>
        <input name="numeroReferencia" required />
      </label>
      <label style={{ margin: 0, maxWidth: '14rem' }}>
        <span>{esFideicomiso ? 'Fecha de constitución' : 'Fecha de creación'}</span>
        <input type="date" name="fechaConstitucion" required max={hoy} />
      </label>
      <label style={{ margin: 0 }}>
        <span>RFC de la figura</span>
        <input name="rfc" required minLength={12} maxLength={13} style={{ textTransform: 'uppercase' }} />
      </label>

      {esFideicomiso ? (
        <>
          <label style={{ margin: 0, maxWidth: '14rem' }}>
            <span>¿Cotiza en bolsa de valores?</span>
            <select name="cotizaEnBolsa" required defaultValue="">
              <option value="" disabled>Elige…</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
          <label style={{ margin: 0, maxWidth: '18rem' }}>
            <span>¿Los fideicomisarios están determinados?</span>
            <select name="fideicomisariosDeterminados" required defaultValue="">
              <option value="" disabled>Elige…</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
        </>
      ) : (
        <label style={{ margin: 0, maxWidth: '10rem' }}>
          <span>País de nacionalidad</span>
          <input name="paisNacionalidad" required placeholder="MX" />
        </label>
      )}

      <button type="submit" disabled={pendiente}>
        {pendiente ? 'Guardando…' : 'Registrar la figura'}
      </button>
    </form>
  )
}

function FormularioIntegrante({
  esFideicomiso,
  bajas,
  hoy,
}: {
  esFideicomiso: boolean
  bajas: Array<{ id: string; etiqueta: string }>
  hoy: string
}) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    guardarIntegrante,
    null,
  )
  const papeles = esFideicomiso ? PAPEL_FIDEICOMISO : PAPEL_FIGURA
  const [papel, setPapel] = useState<string>('')
  const [naturaleza, setNaturaleza] = useState<string>('')

  const cambiarPapel = (p: string) => {
    setPapel(p)
    // El Anexo fija la naturaleza de dos papeles; para el resto se elige.
    if (p === 'fiduciario') setNaturaleza('moral')
    else if (p === 'delegado_fiduciario') setNaturaleza('fisica')
    else setNaturaleza('')
  }

  const naturalezaFija = papel === 'fiduciario' || papel === 'delegado_fiduciario'
  const admiteFideicomiso = papel === 'fideicomitente' || papel === 'fideicomisario'

  return (
    <form action={accion} style={{ display: 'grid', gap: '.7rem', maxWidth: '30rem' }}>
      <h4 style={{ margin: 0 }}>Capturar un integrante</h4>
      <Mensaje estado={estado} />

      <label style={{ margin: 0 }}>
        <span>Papel</span>
        <select name="papel" required value={papel} onChange={(e) => { cambiarPapel(e.target.value) }}>
          <option value="" disabled>Elige…</option>
          {papeles.map(([v, n]) => (
            <option key={v} value={v}>{n}</option>
          ))}
        </select>
      </label>
      {papel === 'otro' && (
        <label style={{ margin: 0 }}>
          <span>Descripción del papel</span>
          <input name="descripcionOtro" required />
        </label>
      )}

      {papel !== '' && (
        <label style={{ margin: 0 }}>
          <span>Naturaleza</span>
          {naturalezaFija ? (
            <>
              <input type="hidden" name="naturaleza" value={naturaleza} />
              <input
                value={naturaleza === 'moral' ? 'Persona moral (Anexo 2 Bis II)' : 'Persona física (Anexo 2 Bis II.I)'}
                disabled
              />
            </>
          ) : (
            <select
              name="naturaleza"
              required
              value={naturaleza}
              onChange={(e) => { setNaturaleza(e.target.value) }}
            >
              <option value="" disabled>Elige…</option>
              <option value="fisica">Persona física</option>
              <option value="moral">Persona moral</option>
              {admiteFideicomiso && <option value="fideicomiso">Fideicomiso</option>}
            </select>
          )}
        </label>
      )}

      {naturaleza === 'fisica' && (
        <>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <label style={{ margin: 0 }}>
              <span>Primer apellido</span>
              <input name="primerApellido" required />
            </label>
            <label style={{ margin: 0 }}>
              <span>Segundo apellido</span>
              <input name="segundoApellido" />
            </label>
          </div>
          <label style={{ margin: 0 }}>
            <span>Nombre(s), sin abreviaturas</span>
            <input name="nombres" required />
          </label>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <label style={{ margin: 0 }}>
              <span>Fecha de nacimiento</span>
              <input type="date" name="fechaNacimiento" required max={hoy} />
            </label>
            <label style={{ margin: 0 }}>
              <span>CURP</span>
              <input name="curp" placeholder="si la tiene" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <label style={{ margin: 0, maxWidth: '10rem' }}>
              <span>País de nacionalidad</span>
              <input name="paisNacionalidad" required placeholder="MX" />
            </label>
            <label style={{ margin: 0, maxWidth: '10rem' }}>
              <span>País de nacimiento</span>
              <input name="paisNacimiento" required placeholder="MX" />
            </label>
          </div>
        </>
      )}

      {naturaleza === 'moral' && (
        <>
          <label style={{ margin: 0 }}>
            <span>Denominación o razón social</span>
            <input name="denominacion" required />
          </label>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <label style={{ margin: 0 }}>
              <span>Fecha de constitución</span>
              <input type="date" name="fechaConstitucion" required max={hoy} />
            </label>
            <label style={{ margin: 0, maxWidth: '10rem' }}>
              <span>País de nacionalidad</span>
              <input name="paisNacionalidad" required placeholder="MX" />
            </label>
          </div>
        </>
      )}

      {naturaleza === 'fideicomiso' && (
        <>
          <p className="pequeno tenue" style={{ margin: 0 }}>
            Un fideicomiso dentro del fideicomiso se identifica con estos cuatro datos (Anexo 2
            Bis, III.III) — no con su estructura completa.
          </p>
          <label style={{ margin: 0 }}>
            <span>Número, identificador o referencia</span>
            <input name="numeroReferencia" required />
          </label>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <label style={{ margin: 0 }}>
              <span>Fecha de constitución</span>
              <input type="date" name="fechaConstitucion" required max={hoy} />
            </label>
          </div>
          <label style={{ margin: 0 }}>
            <span>Denominación de su fiduciario</span>
            <input name="denominacionFiduciario" required />
          </label>
        </>
      )}

      {naturaleza !== '' && (
        <label style={{ margin: 0 }}>
          <span>RFC</span>
          <input name="rfc" required minLength={12} maxLength={13} style={{ textTransform: 'uppercase' }} />
        </label>
      )}

      {bajas.length > 0 && naturaleza !== '' && (
        <label style={{ margin: 0 }}>
          <span>
            ¿Corrige a un integrante dado de baja?{' '}
            <span className="pista">Art. 10 Sexies ¶4: primero la baja, luego el reenvío</span>
          </span>
          <select name="corrigeA" defaultValue="">
            <option value="">No — es un integrante nuevo</option>
            {bajas.map((b) => (
              <option key={b.id} value={b.id}>{b.etiqueta}</option>
            ))}
          </select>
        </label>
      )}

      <button type="submit" disabled={pendiente || naturaleza === ''}>
        {pendiente ? 'Guardando…' : 'Capturar integrante'}
      </button>
    </form>
  )
}

function FilaBaja({ integranteId, hoy }: { integranteId: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState<Resultado | null, FormData>(
    bajaIntegrante,
    null,
  )
  return (
    <form action={accion} style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
      <input type="hidden" name="integranteId" value={integranteId} />
      <input type="date" name="fecha" required defaultValue={hoy} style={{ maxWidth: '10rem' }} />
      <button type="submit" className="secundario" disabled={pendiente}>
        {pendiente ? '…' : 'Dar de baja'}
      </button>
      {estado !== null && !estado.ok && <span className="error pequeno">{estado.mensaje}</span>}
    </form>
  )
}

export function SeccionEstructura({
  estado,
  puede,
  hoy,
}: {
  estado: EstadoEstructura
  puede: boolean
  hoy: string
}) {
  const [envio, accionEnvio, enviando] = useActionState<Resultado | null, FormData>(
    registrarEnvioSat,
    null,
  )

  const esFideicomiso = estado.tipoPersona === 'fideicomiso'
  const pendientes = estado.integrantes.filter((x) => x.estado === 'capturado').length
  const bajas = estado.integrantes
    .filter((x) => x.estado === 'baja')
    .map((x) => ({
      id: x.id,
      etiqueta: `${NOMBRE_PAPEL[x.papel] ?? x.papel} · ${x.denominacion ?? x.numeroReferencia ?? [x.nombres, x.primerApellido].filter(Boolean).join(' ')}`,
    }))

  if (!puede && estado.figura === null) {
    return (
      <div className="tarjeta">
        <p className="tenue" style={{ margin: 0 }}>
          La estructura la registra un administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.2rem' }}>
      <p className="pequeno tenue" style={{ margin: 0 }}>
        Quien actúa por fideicomiso u otra figura registra a sus integrantes ante el SAT con la
        herramienta del Portal, firmando con la e.firma del RFC de la propia figura (Arts. 4 y 10
        Sexies del Acuerdo 115/2026). Aquí se captura la estructura con los campos del Anexo y se
        deja constancia del trámite. <strong>Corregir es dar de baja y capturar de nuevo</strong> —
        el ¶4 no admite ediciones, y esta pantalla tampoco.
      </p>

      {estado.figura === null ? (
        <FormularioFigura tipoPersona={estado.tipoPersona ?? ''} hoy={hoy} />
      ) : (
        <>
          <div>
            <strong>
              {esFideicomiso ? 'Fideicomiso' : estado.figura.tipoFigura === 'otra' ? `Figura: ${estado.figura.descripcionOtra ?? 'otra'}` : 'Asociación en Participación'}
            </strong>{' '}
            <span className="pequeno tenue">
              {estado.figura.numeroReferencia} · RFC {estado.figura.rfc} · constituida el{' '}
              {estado.figura.fechaConstitucion}
              {esFideicomiso &&
                ` · ${estado.figura.cotizaEnBolsa === true ? 'cotiza en bolsa' : 'no cotiza en bolsa'} · fideicomisarios ${estado.figura.fideicomisariosDeterminados === true ? 'determinados' : 'no determinados'}`}
            </span>
          </div>

          {estado.integrantes.length > 0 && (
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Papel</th>
                    <th>Integrante</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {estado.integrantes.map((x) => (
                    <tr key={x.id}>
                      <td>
                        {NOMBRE_PAPEL[x.papel] ?? x.papel}
                        {x.corrigeA !== null && (
                          <span className="pequeno tenue"> · corrige a otro dado de baja</span>
                        )}
                      </td>
                      <td>
                        {x.naturaleza === 'fisica'
                          ? `${[x.nombres, x.primerApellido, x.segundoApellido].filter(Boolean).join(' ')}`
                          : x.naturaleza === 'moral'
                            ? x.denominacion
                            : `Fideicomiso ${x.numeroReferencia ?? ''} (fiduciario: ${x.denominacionFiduciario ?? ''})`}
                        <span className="pequeno tenue"> · {x.rfc}</span>
                      </td>
                      <td>
                        <span className={x.estado === 'enviado' ? 'chip' : x.estado === 'baja' ? 'tenue pequeno' : 'chip alerta'}>
                          {NOMBRE_ESTADO[x.estado]}
                        </span>
                        <span className="pequeno tenue">
                          {x.estado === 'enviado' && x.fechaEnvio !== null && ` ${x.fechaEnvio}`}
                          {x.estado === 'baja' && x.fechaBaja !== null && ` ${x.fechaBaja}`}
                        </span>
                      </td>
                      <td>{puede && x.estado !== 'baja' && <FilaBaja integranteId={x.id} hoy={hoy} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {puede && (
            <>
              {pendientes > 0 && (
                <form
                  action={accionEnvio}
                  style={{ display: 'flex', gap: '.6rem', alignItems: 'end', flexWrap: 'wrap' }}
                >
                  {envio !== null && <Mensaje estado={envio} />}
                  <label style={{ margin: 0 }}>
                    <span>
                      Fecha del trámite en el Portal{' '}
                      <span className="pista">{String(pendientes)} pendiente(s) de envío</span>
                    </span>
                    <input type="date" name="fecha" required defaultValue={hoy} style={{ maxWidth: '12rem' }} />
                  </label>
                  <button type="submit" disabled={enviando}>
                    {enviando ? 'Registrando…' : 'Registrar envío al SAT'}
                  </button>
                </form>
              )}
              <FormularioIntegrante esFideicomiso={esFideicomiso} bajas={bajas} hoy={hoy} />
            </>
          )}
        </>
      )}
    </div>
  )
}
