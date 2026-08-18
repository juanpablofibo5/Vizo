'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { declararPep, revisarPep, type EstadoRevision } from './acciones'
import type { EstadoPep } from '../../../../src/persistencia/pep'

/**
 * La declaración PEP (Art. 23 Quáter del Acuerdo 115/2026).
 *
 * No es una casilla «¿es usted PEP?» — es una red: la función pública propia,
 * o la de alguien del ¶3 (cónyuge, concubinato, parentesco hasta 2º grado,
 * socios con vínculos patrimoniales). La pantalla captura la red; la vigencia
 * la deriva el dominio con los dos relojes y aquí solo se PINTA.
 *
 * El que niega también declara: esa respuesta queda registrada como hecho con
 * fecha y capturista, que es distinto de no haber preguntado.
 */

const INICIAL: EstadoRevision = { ok: null, mensaje: '' }

const TIPOS_RED = [
  ['conyuge', 'Cónyuge'],
  ['concubinato', 'Concubina / concubinario'],
  ['consanguinidad', 'Parentesco por consanguinidad'],
  ['afinidad', 'Parentesco por afinidad'],
  ['socio_patrimonial', 'Socio de una moral con vínculos patrimoniales'],
] as const

interface FilaVinculo {
  clave: number
  tipo: string
  grado: string
  nombrePep: string
  cargo: string
  ambito: string
  pais: string
  enFunciones: boolean
  fechaCese: string
  detalle: string
}

const FILA_VACIA = (clave: number, tipo = 'conyuge'): FilaVinculo => ({
  clave,
  tipo,
  grado: '',
  nombrePep: '',
  cargo: '',
  ambito: 'nacional',
  pais: '',
  enFunciones: true,
  fechaCese: '',
  detalle: '',
})

function etiquetaCatalogacion(c: {
  catalogada: boolean
  motivo: string
  hasta?: string | null
  fechaActo?: string
}): { texto: string; vigente: boolean } {
  switch (c.motivo) {
    case 'en_funciones':
      return { texto: 'En funciones: catalogada', vigente: true }
    case 'extranjera_sin_reloj':
      return { texto: 'Extranjera: catalogada sin fecha de fin', vigente: true }
    case 'ano_siguiente_al_cese':
      return { texto: `Catalogada hasta el ${c.hasta ?? ''} (año siguiente al del cese)`, vigente: true }
    case 'ano_siguiente_al_acto':
      return {
        texto: `Catalogada hasta el ${c.hasta ?? ''} (año siguiente al del acto del ${c.fechaActo ?? ''})`,
        vigente: true,
      }
    default:
      return { texto: 'Relojes vencidos: ya no se cataloga', vigente: false }
  }
}

const NOMBRE_RESULTADO: Record<string, string> = {
  niega: 'Declaró que ni la persona ni su red tienen función pública',
  pep_por_funcion: 'PEP por función propia',
  pep_asimilada: 'PEP asimilada: la función la tiene alguien de su red',
}

export function SeccionPep({
  clienteId,
  estado,
  esAdmin,
  hoy,
}: {
  clienteId: string
  estado: EstadoPep
  esAdmin: boolean
  hoy: string
}) {
  const [captura, accionCaptura, capturando] = useActionState<EstadoRevision, FormData>(
    declararPep,
    INICIAL,
  )
  const [revision, accionRevision, revisando] = useActionState<EstadoRevision, FormData>(
    revisarPep,
    INICIAL,
  )

  const [capturarNueva, setCapturarNueva] = useState(false)
  const [resultado, setResultado] = useState('')
  const [filas, setFilas] = useState<FilaVinculo[]>([])
  const [contador, setContador] = useState(1)

  const decl = estado.declaracion
  const mostrarFormulario = decl === null || capturarNueva

  const cambiarResultado = (r: string) => {
    setResultado(r)
    if (r === 'niega') setFilas([])
    if (r === 'pep_por_funcion') setFilas([FILA_VACIA(0, 'titular')])
    if (r === 'pep_asimilada') setFilas([FILA_VACIA(0)])
  }

  const editar = (clave: number, cambio: Partial<FilaVinculo>) => {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))
  }

  const agregar = () => {
    setFilas((fs) => [...fs, FILA_VACIA(contador)])
    setContador((n) => n + 1)
  }

  const quitar = (clave: number) => {
    setFilas((fs) => fs.filter((f) => f.clave !== clave))
  }

  // Lo que viaja al servidor: el estado de las filas, serializado. El servidor
  // y la base vuelven a validar todo — esto solo es transporte.
  const vinculosJson = JSON.stringify(
    filas.map((f) => ({
      tipo: f.tipo,
      ...(f.grado === '' ? {} : { grado: Number(f.grado) }),
      ...(f.nombrePep.trim() === '' ? {} : { nombrePep: f.nombrePep.trim() }),
      cargo: f.cargo.trim(),
      ambito: f.ambito,
      ...(f.pais.trim() === '' ? {} : { pais: f.pais.trim() }),
      enFunciones: f.enFunciones,
      ...(f.fechaCese === '' ? {} : { fechaCese: f.fechaCese }),
      ...(f.detalle.trim() === '' ? {} : { detalle: f.detalle.trim() }),
    })),
  )

  return (
    <div className="tarjeta" style={{ display: 'grid', gap: '1.2rem' }}>
      {estado.anticipada && (
        <div className="aviso" style={{ margin: 0 }}>
          <strong>Vista anticipada.</strong> El Cap. III Quáter es exigible desde el{' '}
          {estado.exigibleDesde}; declarar desde hoy deja la evidencia lista para ese día.
        </div>
      )}

      {decl !== null && (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          <p style={{ margin: 0 }}>
            <span className={estado.catalogado ? 'chip alerta' : 'chip'}>
              {estado.catalogado ? 'Catalogada como PEP hoy' : 'No catalogada hoy'}
            </span>{' '}
            <span className="pequeno tenue">
              declaración del {decl.fechaDeclaracion} ·{' '}
              {decl.revisadaEn === null
                ? 'sin revisar'
                : `revisada el ${decl.revisadaEn}`}
            </span>
          </p>
          <p className="pequeno" style={{ margin: 0 }}>
            {NOMBRE_RESULTADO[decl.resultado]}
          </p>

          {decl.vinculos.length > 0 && (
            <ul className="pequeno" style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {decl.vinculos.map((v) => {
                const cat = etiquetaCatalogacion(v.catalogacion)
                return (
                  <li key={v.id}>
                    <strong>
                      {v.tipo === 'titular'
                        ? 'La propia persona'
                        : `${v.nombrePep ?? ''} (${v.tipo}${v.grado === undefined ? '' : ` ${String(v.grado)}º`})`}
                    </strong>
                    {' — '}
                    {v.cargo}, {v.ambito === 'nacional' ? 'México' : (v.pais ?? 'extranjero')} ·{' '}
                    {v.enFunciones ? 'en funciones' : `cesó el ${v.fechaCese ?? ''}`}
                    {v.detalle === undefined ? '' : ` · ${v.detalle}`}
                    <br />
                    <span className={cat.vigente ? 'chip alerta' : 'tenue'}>{cat.texto}</span>
                  </li>
                )
              })}
            </ul>
          )}

          {revision.ok !== null && (
            <div className={revision.ok ? 'exito' : 'error'}>{revision.mensaje}</div>
          )}

          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {decl.revisadaEn === null && (
              <form action={accionRevision} style={{ margin: 0 }}>
                <input type="hidden" name="clienteId" value={clienteId} />
                <input type="hidden" name="declaracionId" value={decl.id} />
                <button type="submit" disabled={!esAdmin || revisando}>
                  {revisando ? 'Registrando…' : 'Registrar revisión'}
                </button>
              </form>
            )}
            {!capturarNueva && (
              <button type="button" className="secundario" onClick={() => { setCapturarNueva(true) }}>
                Capturar una declaración nueva
              </button>
            )}
          </div>
          {decl.revisadaEn === null && !esAdmin && (
            <p className="pequeno tenue" style={{ margin: 0 }}>
              La revisión que congela la declaración es de un administrador.
            </p>
          )}
        </div>
      )}

      {mostrarFormulario && (
        <form action={accionCaptura} style={{ display: 'grid', gap: '.8rem' }}>
          <input type="hidden" name="clienteId" value={clienteId} />
          <input type="hidden" name="vinculos" value={vinculosJson} />

          {captura.ok !== null && (
            <div className={captura.ok ? 'exito' : 'error'}>{captura.mensaje}</div>
          )}

          <p className="pequeno tenue" style={{ margin: 0 }}>
            El Art. 23 Quáter ¶3 asimila a PEP al cónyuge, la concubina y el concubinario, al
            parentesco por consanguinidad o afinidad <strong>hasta el segundo grado</strong>, y a
            los asociados o socios de personas morales con vínculos patrimoniales. La pregunta se
            hace con esa red enfrente — no a ciegas.
          </p>

          <label style={{ margin: 0, maxWidth: '30rem' }}>
            <span>¿Qué declaró la persona?</span>
            <select
              name="resultado"
              required
              value={resultado}
              onChange={(e) => { cambiarResultado(e.target.value) }}
            >
              <option value="" disabled>
                Elige una respuesta
              </option>
              <option value="niega">Ni ella ni su red tienen función pública</option>
              <option value="pep_por_funcion">Tiene o tuvo función pública propia</option>
              <option value="pep_asimilada">Alguien de su red la tiene o la tuvo</option>
            </select>
          </label>

          <label style={{ margin: 0, maxWidth: '14rem' }}>
            <span>Fecha de la declaración</span>
            <input type="date" name="fechaDeclaracion" defaultValue={hoy} required />
          </label>

          {filas.map((f) => (
            <fieldset
              key={f.clave}
              style={{ display: 'grid', gap: '.5rem', border: '1px solid var(--linea, #ddd)', padding: '.8rem' }}
            >
              <legend className="pequeno">
                {f.tipo === 'titular' ? 'La función pública de la propia persona' : 'Vínculo de la red'}
              </legend>

              {f.tipo !== 'titular' && (
                <>
                  <label style={{ margin: 0 }}>
                    <span>Vínculo</span>
                    <select value={f.tipo} onChange={(e) => { editar(f.clave, { tipo: e.target.value, grado: '' }) }}>
                      {TIPOS_RED.map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(f.tipo === 'consanguinidad' || f.tipo === 'afinidad') && (
                    <label style={{ margin: 0, maxWidth: '10rem' }}>
                      <span>Grado</span>
                      <select value={f.grado} onChange={(e) => { editar(f.clave, { grado: e.target.value }) }} required>
                        <option value="" disabled>
                          1 o 2
                        </option>
                        <option value="1">Primero</option>
                        <option value="2">Segundo</option>
                      </select>
                    </label>
                  )}
                  <label style={{ margin: 0 }}>
                    <span>Nombre de la persona con la función pública</span>
                    <input
                      value={f.nombrePep}
                      onChange={(e) => { editar(f.clave, { nombrePep: e.target.value }) }}
                      required
                    />
                  </label>
                  {f.tipo === 'socio_patrimonial' && (
                    <label style={{ margin: 0 }}>
                      <span>Persona moral por la que existe el vínculo</span>
                      <input
                        value={f.detalle}
                        onChange={(e) => { editar(f.clave, { detalle: e.target.value }) }}
                        required
                      />
                    </label>
                  )}
                </>
              )}

              <label style={{ margin: 0 }}>
                <span>Cargo o función pública</span>
                <input value={f.cargo} onChange={(e) => { editar(f.clave, { cargo: e.target.value }) }} required />
              </label>

              <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
                <label style={{ margin: 0 }}>
                  <span>Ámbito</span>
                  <select value={f.ambito} onChange={(e) => { editar(f.clave, { ambito: e.target.value, pais: '' }) }}>
                    <option value="nacional">Nacional</option>
                    <option value="extranjero">Extranjero</option>
                  </select>
                </label>
                {f.ambito === 'extranjero' && (
                  <label style={{ margin: 0 }}>
                    <span>País</span>
                    <input value={f.pais} onChange={(e) => { editar(f.clave, { pais: e.target.value }) }} required />
                  </label>
                )}
              </div>

              <label style={{ margin: 0, display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={f.enFunciones}
                  onChange={(e) => { editar(f.clave, { enFunciones: e.target.checked, fechaCese: '' }) }}
                />
                <span>Sigue en funciones</span>
              </label>
              {!f.enFunciones && (
                <label style={{ margin: 0, maxWidth: '14rem' }}>
                  <span>Fecha en que dejó el cargo</span>
                  <input
                    type="date"
                    value={f.fechaCese}
                    onChange={(e) => { editar(f.clave, { fechaCese: e.target.value }) }}
                    required
                  />
                </label>
              )}

              {f.tipo !== 'titular' && (
                <button type="button" className="secundario" onClick={() => { quitar(f.clave) }}>
                  Quitar este vínculo
                </button>
              )}
            </fieldset>
          ))}

          {(resultado === 'pep_por_funcion' || resultado === 'pep_asimilada') && (
            <button type="button" className="secundario" onClick={agregar} style={{ justifySelf: 'start' }}>
              Agregar un vínculo de la red
            </button>
          )}

          <button type="submit" disabled={capturando || resultado === ''} style={{ justifySelf: 'start' }}>
            {capturando ? 'Registrando…' : 'Registrar la declaración'}
          </button>
          <p className="pequeno tenue" style={{ margin: 0 }}>
            La captura entra completa o no entra; después la congela la revisión de un
            administrador. Corregir es declarar de nuevo — el historial no se reescribe.
          </p>
        </form>
      )}
    </div>
  )
}
