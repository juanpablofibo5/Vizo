'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { crearCliente, type EstadoFormulario } from './acciones'

const INICIAL: EstadoFormulario = { problemas: [], valores: {} }

export function FormularioAlta() {
  const [estado, accion, enviando] = useActionState(crearCliente, INICIAL)

  /**
   * React 19 resetea el DOM del formulario tras cada acción, pero no avisa a
   * los componentes controlados: el `select` quedaba mostrando "Persona
   * física" mientras el estado decía "moral". Remontar el formulario con una
   * `key` nueva en cada intento fallido deja todo consistente de una vez, en
   * vez de perseguir cada campo por separado.
   */
  const intento = useRef(0)
  const [claveForm, setClaveForm] = useState('form-0')

  /** Lo que el usuario había capturado, para no perderlo al fallar. */
  const previo = (campo: string, pordefecto = ''): string => estado.valores[campo] ?? pordefecto

  const [tipo, setTipo] = useState<'fisica' | 'moral' | 'fideicomiso'>('fisica')
  const [sinRfc, setSinRfc] = useState(false)
  const [sinBeneficiario, setSinBeneficiario] = useState(false)

  // Tras un error, React devuelve el formulario vacío. Se restauran el tipo de
  // persona y los interruptores, que son los que cambian qué campos se ven.
  useEffect(() => {
    if (estado.problemas.length === 0) return
    const t = estado.valores['tipoPersona']
    if (t === 'fisica' || t === 'moral' || t === 'fideicomiso') setTipo(t)
    setSinRfc(estado.valores['identidadNumero'] !== undefined)
    setSinBeneficiario(estado.valores['sinBeneficiario'] === 'on')
    intento.current += 1
    setClaveForm(`form-${intento.current}`)
  }, [estado])

  const esFisica = tipo === 'fisica'
  const formatoRfc = esFisica ? '4 letras + 6 dígitos + 3' : '3 letras + 6 dígitos + 3'

  return (
    <form action={accion} key={claveForm}>
      {estado.problemas.length > 0 && (
        <div className="error">
          <strong>Revisa estos datos antes de guardar:</strong>
          <ul>
            {estado.problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset>
        <legend>Identificación</legend>

        <label>
          <span>Tipo de persona</span>
          <select
            name="tipoPersona"
            defaultValue={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="fisica">Persona física</option>
            <option value="moral">Persona moral</option>
            <option value="fideicomiso">Fideicomiso</option>
          </select>
        </label>

        {esFisica ? (
          <div className="fila">
            <label>
              <span>Nombre de pila</span>
              <input name="nombrePila" defaultValue={previo('nombrePila')} required />
            </label>
            <label>
              <span>Apellido paterno</span>
              <input name="apellidoPaterno" defaultValue={previo('apellidoPaterno')} required />
            </label>
            <label>
              <span>Apellido materno <span className="pista">(opcional)</span></span>
              <input name="apellidoMaterno" defaultValue={previo('apellidoMaterno')} />
            </label>
          </div>
        ) : null}

        <label>
          <span>
            {esFisica ? 'Nombre completo' : 'Razón social'}{' '}
            <span className="pista">— como aparece en la identificación</span>
          </span>
          <input name="nombreORazonSocial" defaultValue={previo('nombreORazonSocial')} required />
        </label>

        <label className="casilla">
          <input type="checkbox" checked={sinRfc} onChange={(e) => setSinRfc(e.target.checked)} />
          <span>Extranjero sin RFC</span>
        </label>

        {sinRfc ? (
          <>
            <p className="aviso">
              Sin RFC ni CURP, la acumulación de 6 meses se resuelve por documento de identidad y
              cada evaluación se escala a revisión humana.
            </p>
            <div className="fila" style={{ marginTop: '.75rem' }}>
              <label>
                <span>Tipo de documento</span>
                <select name="identidadTipoDoc" defaultValue={previo('identidadTipoDoc', 'pasaporte')}>
                  <option value="pasaporte">Pasaporte</option>
                  <option value="documento_migratorio">Documento migratorio</option>
                  <option value="id_extranjera">Identificación extranjera</option>
                </select>
              </label>
              <label>
                <span>Número</span>
                <input name="identidadNumero" defaultValue={previo('identidadNumero')} required />
              </label>
              <label>
                <span>País <span className="pista">(2 letras)</span></span>
                <input name="identidadPais" maxLength={2} placeholder="US" defaultValue={previo('identidadPais')} required />
              </label>
            </div>
          </>
        ) : (
          <div className="fila">
            <label>
              <span>RFC <span className="pista">({formatoRfc})</span></span>
              <input name="rfc" defaultValue={previo('rfc')} required />
            </label>
            {esFisica ? (
              <label>
                <span>CURP <span className="pista">(opcional)</span></span>
                <input name="curp" defaultValue={previo('curp')} />
              </label>
            ) : null}
          </div>
        )}

        <div className="fila">
          <label>
            <span>{esFisica ? 'Fecha de nacimiento' : 'Fecha de constitución'}</span>
            <input type="date" name="fecha" defaultValue={previo('fecha')} />
          </label>
          <label>
            <span>Nacionalidad <span className="pista">(2 letras)</span></span>
            <input name="nacionalidad" maxLength={2} placeholder="MX" defaultValue={previo('nacionalidad', 'MX')} />
          </label>
        </div>
      </fieldset>

      {!esFisica && (
        <fieldset>
          <legend>Beneficiario controlador</legend>
          <p className="sub" style={{ margin: '0 0 .75rem' }}>
            Obligatorio para personas morales y fideicomisos. El umbral de participación es del{' '}
            <strong>25%</strong>, pero el control también puede ejercerse sin acciones.
          </p>

          <label className="casilla">
            <input
              type="checkbox"
              name="sinBeneficiario"
              defaultChecked={sinBeneficiario}
              onChange={(e) => setSinBeneficiario(e.target.checked)}
            />
            <span>Declaro que no existe beneficiario controlador</span>
          </label>

          {!sinBeneficiario && (
            <>
              <label>
                <span>Nombre completo</span>
                <input name="beneficiarioNombre" defaultValue={previo('beneficiarioNombre')} />
              </label>
              <div className="fila">
                <label>
                  <span>RFC <span className="pista">(opcional)</span></span>
                  <input name="beneficiarioRfc" defaultValue={previo('beneficiarioRfc')} />
                </label>
                <label>
                  <span>El control se ejerce por</span>
                  <select name="beneficiarioControlPor" defaultValue={previo('beneficiarioControlPor', 'participacion')}>
                    <option value="participacion">Participación accionaria</option>
                    <option value="control_efectivo">Control efectivo</option>
                  </select>
                </label>
                <label>
                  <span>Participación %</span>
                  <input name="beneficiarioPct" type="number" min={0} max={100} step="0.01" defaultValue={previo('beneficiarioPct')} />
                </label>
              </div>
            </>
          )}
        </fieldset>
      )}

      <div style={{ display: 'flex', gap: '.6rem' }}>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Dar de alta'}
        </button>
        <Link href="/clientes">
          <button type="button" className="secundario">
            Cancelar
          </button>
        </Link>
      </div>
    </form>
  )
}
