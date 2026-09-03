'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import {
  NOMBRE_DEL_ROL,
  NOMBRE_DEL_TEMA,
  FUNDAMENTO_DEL_TEMA,
  TEMAS_MINIMOS,
  type RolCapacitacion,
} from '../../src/dominio/capacitacion'
import {
  accionAgregarAPlantilla,
  accionRecabarDeclaracion,
  accionRegistrarContratacion,
  accionDarDeBaja,
  accionEvaluar,
  accionRegistrarSesion,
  type Resultado,
} from './acciones'

/**
 * Los tres formularios del Cap. XII.
 *
 * Cliente por una sola razón en cada caso, y las tres son la misma: que el
 * error no se pueda expresar desde la pantalla. El folio de constancia
 * desaparece cuando el resultado no es satisfactorio (¶2 del Art. 39 Bis 1);
 * el nombre del archivo aparece solo si hay huella que respaldar; y los temas
 * se marcan de una lista cerrada porque los cinco los fija el artículo, no el
 * obligado.
 */

// Vive aquí y no en `acciones.ts` porque un archivo `'use server'` solo puede
// exportar funciones async: exportar la constante desde allá compila, pasa el
// `build`, y revienta en la primera petición con un digest opaco.
const INICIAL: Resultado = { ok: null, mensaje: '' }

/**
 * Repintar lo capturado tras un error.
 *
 * React 19 vacía el DOM del formulario cuando la acción termina, y remontarlo
 * con una `key` nueva es lo que deja los campos consistentes de una vez en vez
 * de perseguirlos uno por uno. Es el patrón que ya usa el alta de clientes.
 */
function useRepintado(estado: Resultado): {
  clave: string
  texto: (campo: string) => string
  marcado: (campo: string, valor: string) => boolean
} {
  const intento = useRef(0)
  const [clave, setClave] = useState('form-0')

  useEffect(() => {
    if (estado.ok !== false) return
    intento.current += 1
    setClave(`form-${String(intento.current)}`)
  }, [estado])

  // `texto` va memoizada porque dos efectos dependen de ella: sin esto cambia
  // de identidad en cada render y el efecto vuelve a correr en cada uno.
  const texto = useCallback(
    (campo: string): string => {
      const v = estado.valores?.[campo]
      return typeof v === 'string' ? v : ''
    },
    [estado],
  )

  return {
    clave,
    texto,
    marcado: (campo, valor) => {
      const v = estado.valores?.[campo]
      return Array.isArray(v) && v.includes(valor)
    },
  }
}

function Mensaje({ estado }: { estado: Resultado }) {
  if (estado.ok === null) return null
  return <div className={estado.ok ? 'exito' : 'error'}>{estado.mensaje}</div>
}

const ROLES = Object.keys(NOMBRE_DEL_ROL) as RolCapacitacion[]

export function FormularioPersona({ puede }: { puede: boolean }) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionAgregarAPlantilla,
    INICIAL,
  )
  const { clave, texto } = useRepintado(estado)

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '30rem' }}>
      <Mensaje estado={estado} />

      <label style={{ margin: 0 }}>
        <span>Nombre</span>
        <input type="text" name="nombre" defaultValue={texto('nombre')} disabled={!puede} required />
      </label>

      <label style={{ margin: 0 }}>
        <span>
          Papel dentro del obligado{' '}
          <span className="pista">los nueve que nombra el Art. 39 Bis ¶1</span>
        </span>
        <select name="rol" defaultValue={texto('rol') || 'atencion_publico'} disabled={!puede}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_DEL_ROL[r]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ margin: 0 }}>
        <span>
          Fecha de ingreso al área{' '}
          <span className="pista">no el alta en VIZO: el ¶3 cuelga de esta fecha</span>
        </span>
        <input
          type="date"
          name="ingresoAlArea"
          defaultValue={texto('ingresoAlArea')}
          disabled={!puede}
          required
        />
      </label>

      <button type="submit" disabled={!puede || guardando}>
        {guardando ? 'Agregando…' : 'Agregar a la plantilla'}
      </button>
    </form>
  )
}

export function FormularioSesion({
  anio,
  hoy,
  plantilla,
  puede,
}: {
  anio: number
  hoy: string
  plantilla: readonly { id: string; nombre: string; rol: RolCapacitacion }[]
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionRegistrarSesion,
    INICIAL,
  )
  const { clave, texto, marcado } = useRepintado(estado)
  const [hash, setHash] = useState('')

  // La huella es campo controlado —de ella depende que aparezca el nombre del
  // archivo—, así que el remontado no la recupera solo.
  useEffect(() => {
    if (estado.ok === false) setHash(texto('acreditaHash'))
  }, [estado, texto])

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '1rem', maxWidth: '38rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="anio" value={anio} />

      <label style={{ margin: 0 }}>
        <span>Título de la sesión</span>
        <input type="text" name="titulo" defaultValue={texto('titulo')} disabled={!puede} required />
      </label>

      <label style={{ margin: 0 }}>
        <span>
          Fecha en que se impartió{' '}
          <span className="pista">dentro del periodo, y ya ocurrida</span>
        </span>
        {/* El calendario acota el periodo y el presente. La persistencia
            rechaza las dos cosas igual; acotar aquí es que ni siquiera se
            puedan escoger. */}
        <input
          type="date"
          name="fecha"
          defaultValue={texto('fecha')}
          min={`${String(anio)}-01-01`}
          max={hoy < `${String(anio)}-12-31` ? hoy : `${String(anio)}-12-31`}
          disabled={!puede}
          required
        />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pequeno" style={{ padding: 0, marginBottom: '.5rem' }}>
          Temas cubiertos <span className="pista">los cinco del Art. 39 Bis fr. I y II</span>
        </legend>
        <div style={{ display: 'grid', gap: '.45rem' }}>
          {TEMAS_MINIMOS.map((t) => (
            <label key={t} className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
              <input
                type="checkbox"
                name="temas"
                value={t}
                defaultChecked={marcado('temas', t)}
                disabled={!puede}
              />
              <span>
                {NOMBRE_DEL_TEMA[t]} <span className="tenue">· {FUNDAMENTO_DEL_TEMA[t]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rejilla" style={{ gap: '.8rem' }}>
        <label style={{ margin: 0 }}>
          <span>Quién la impartió</span>
          <input
            type="text"
            name="instructorNombre"
            defaultValue={texto('instructorNombre')}
            disabled={!puede}
            required
          />
        </label>
        <label style={{ margin: 0 }}>
          <span>
            Años de experiencia <span className="pista">fr. III</span>
          </span>
          <input
            type="number"
            name="anios"
            min={0}
            max={70}
            defaultValue={texto('anios')}
            disabled={!puede}
            required
          />
        </label>
      </div>

      <label style={{ margin: 0 }}>
        <span>
          Huella del documento que acredita la experiencia{' '}
          <span className="pista">SHA-256 · «contar Y acreditar» son dos cosas</span>
        </span>
        <input
          type="text"
          name="acreditaHash"
          className="mono pequeno"
          value={hash}
          onChange={(e) => { setHash(e.target.value.trim()) }}
          disabled={!puede}
        />
      </label>

      {hash !== '' && (
        <label style={{ margin: 0 }}>
          <span>Nombre del archivo</span>
          <input
            type="text"
            name="acreditaArchivo"
            defaultValue={texto('acreditaArchivo')}
            disabled={!puede}
          />
        </label>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="pequeno" style={{ padding: 0, marginBottom: '.5rem' }}>
          Lista de asistencia
        </legend>
        {plantilla.length === 0 ? (
          <p className="pequeno tenue" style={{ margin: 0 }}>
            La plantilla está vacía. Sin ella la sesión se registra, pero no cubre a nadie.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '.45rem' }}>
            {plantilla.map((p) => (
              <label
                key={p.id}
                className="pequeno"
                style={{ margin: 0, display: 'flex', gap: '.5rem' }}
              >
                <input
                  type="checkbox"
                  name="asistentes"
                  value={p.id}
                  defaultChecked={marcado('asistentes', p.id)}
                  disabled={!puede}
                />
                <span>
                  {p.nombre} <span className="tenue">· {NOMBRE_DEL_ROL[p.rol]}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <button type="submit" disabled={!puede || guardando}>
        {guardando ? 'Registrando…' : 'Registrar la sesión'}
      </button>
    </form>
  )
}

export function FormularioEvaluar({
  asistenciaId,
  puede,
}: {
  asistenciaId: string
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(accionEvaluar, INICIAL)
  const { clave, texto } = useRepintado(estado)
  const [satisfactoria, setSatisfactoria] = useState(true)

  useEffect(() => {
    if (estado.ok === false) setSatisfactoria(texto('resultado') !== 'no_satisfactoria')
  }, [estado, texto])

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.7rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="asistenciaId" value={asistenciaId} />

      <div className="rejilla" style={{ gap: '.7rem' }}>
        <label style={{ margin: 0 }}>
          <span>Resultado</span>
          <select
            name="resultado"
            defaultValue={texto('resultado') || 'satisfactoria'}
            onChange={(e) => { setSatisfactoria(e.target.value === 'satisfactoria') }}
            disabled={!puede}
          >
            <option value="satisfactoria">Satisfactorio</option>
            <option value="no_satisfactoria">No satisfactorio</option>
          </select>
        </label>

        <label style={{ margin: 0 }}>
          <span>Fecha de la evaluación</span>
          <input type="date" name="fecha" defaultValue={texto('fecha')} disabled={!puede} required />
        </label>

        {/* El folio solo existe si aprobó. No es cortesía: el ¶2 ata la
            constancia a la evaluación satisfactoria, y la base lo rechaza con
            un CHECK. Mejor que ni siquiera se pueda teclear. */}
        {satisfactoria && (
          <label style={{ margin: 0 }}>
            <span>Folio de la constancia</span>
            <input
              type="text"
              name="folio"
              className="mono"
              defaultValue={texto('folio')}
              disabled={!puede}
              required
            />
          </label>
        )}
      </div>

      <label style={{ margin: 0 }}>
        <span>
          Detalle <span className="pista">opcional</span>
        </span>
        <input type="text" name="detalle" defaultValue={texto('detalle')} disabled={!puede} />
      </label>

      <button type="submit" className="secundario" disabled={!puede || guardando}>
        {guardando
          ? 'Asentando…'
          : satisfactoria
            ? 'Asentar evaluación y expedir constancia'
            : 'Asentar evaluación'}
      </button>
    </form>
  )
}

export function FormularioBaja({
  personaId,
  hoy,
  puede,
}: {
  personaId: string
  hoy: string
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(accionDarDeBaja, INICIAL)
  const { clave } = useRepintado(estado)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button
        type="button"
        className="secundario pequeno"
        onClick={() => { setAbierto(true) }}
        disabled={!puede}
      >
        Dejó el área
      </button>
    )
  }

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.4rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="personaId" value={personaId} />
      <label style={{ margin: 0 }}>
        <span className="pequeno">Último día en el área</span>
        <input type="date" name="fechaBaja" max={hoy} disabled={!puede} required />
      </label>
      <button type="submit" className="secundario pequeno" disabled={!puede || guardando}>
        {guardando ? 'Registrando…' : 'Registrar la baja'}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Art. 39 Bis 2 · Selección de personal
// ─────────────────────────────────────────────────────────────────────────

export function FormularioContratacion({
  personaId,
  hoy,
  puede,
}: {
  personaId: string
  hoy: string
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionRegistrarContratacion,
    INICIAL,
  )
  const { clave } = useRepintado(estado)
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button
        type="button"
        className="secundario pequeno"
        onClick={() => { setAbierto(true) }}
        disabled={!puede}
      >
        Decir cuándo
      </button>
    )
  }

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.4rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="personaId" value={personaId} />
      <label style={{ margin: 0 }}>
        <span className="pequeno">Fecha de contratación</span>
        <input type="date" name="fechaContratacion" max={hoy} disabled={!puede} required />
      </label>
      <button type="submit" className="secundario pequeno" disabled={!puede || guardando}>
        {guardando ? 'Registrando…' : 'Registrar'}
      </button>
    </form>
  )
}

/**
 * La declaración firmada del ¶2.
 *
 * Las tres manifestaciones de la fr. II son casillas SIN marcar de origen. Es
 * deliberado: el artículo pide que en la declaración *conste* que la persona
 * no fue sentenciada ni inhabilitada, y traerlas marcadas convertiría esa
 * manifestación en un valor por omisión que nadie leyó. Que la casilla esté
 * vacía obliga a afirmarla una por una.
 */
export function FormularioDeclaracion({
  personaId,
  nombre,
  hoy,
  puede,
}: {
  personaId: string
  nombre: string
  hoy: string
  puede: boolean
}) {
  const [estado, accion, guardando] = useActionState<Resultado, FormData>(
    accionRecabarDeclaracion,
    INICIAL,
  )
  const { clave, texto } = useRepintado(estado)
  const [otroSector, setOtroSector] = useState(false)
  const [hash, setHash] = useState('')

  useEffect(() => {
    if (estado.ok === false) {
      setOtroSector(texto('laboroEnSectorObligado') === 'si')
      setHash(texto('firmaHash'))
    }
  }, [estado, texto])

  return (
    <form key={clave} action={accion} style={{ display: 'grid', gap: '.8rem', maxWidth: '34rem' }}>
      <Mensaje estado={estado} />
      <input type="hidden" name="personaId" value={personaId} />

      <p className="pequeno tenue" style={{ margin: 0 }}>
        Lo que <strong>{nombre}</strong> firmó. VIZO no produce ni valida la firma: guarda la
        huella del documento que recabaste.
      </p>

      <label style={{ margin: 0, maxWidth: '16rem' }}>
        <span>Fecha de la declaración</span>
        <input
          type="date"
          name="fechaDeclaracion"
          defaultValue={texto('fechaDeclaracion')}
          max={hoy}
          disabled={!puede}
          required
        />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '.45rem' }}>
        <legend className="pequeno" style={{ padding: 0 }}>
          Fracción I <span className="pista">otros sectores obligados donde haya laborado</span>
        </legend>
        <label className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
          <input
            type="checkbox"
            name="laboroEnSectorObligado"
            value="si"
            checked={otroSector}
            onChange={(e) => { setOtroSector(e.target.checked) }}
            disabled={!puede}
          />
          <span>Laboró antes en otro sector sujeto a las obligaciones de la Ley</span>
        </label>
        {otroSector && (
          <label style={{ margin: 0 }}>
            <span className="pequeno">En cuáles, y cuándo</span>
            <input
              type="text"
              name="sectoresPrevios"
              defaultValue={texto('sectoresPrevios')}
              disabled={!puede}
              required
            />
          </label>
        )}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '.45rem' }}>
        <legend className="pequeno" style={{ padding: 0 }}>
          Fracción II <span className="pista">marca solo lo que la persona declaró</span>
        </legend>
        {[
          ['sinSentenciaPatrimonial', 'No ha sido sentenciada por delitos patrimoniales'],
          ['sinInhabilitacionComercio', 'No está inhabilitada para ejercer el comercio'],
          [
            'sinInhabilitacionServicioOFinanciero',
            'No está inhabilitada para el servicio público ni para el sistema financiero mexicano',
          ],
        ].map(([campo, dice]) => (
          <label key={campo} className="pequeno" style={{ margin: 0, display: 'flex', gap: '.5rem' }}>
            <input type="checkbox" name={campo} value="si" disabled={!puede} />
            <span>{dice}</span>
          </label>
        ))}
      </fieldset>

      <label style={{ margin: 0 }}>
        <span>
          Huella de la declaración firmada{' '}
          <span className="pista">SHA-256 · opcional, pero es lo que la vuelve evidencia</span>
        </span>
        <input
          type="text"
          name="firmaHash"
          className="mono pequeno"
          value={hash}
          onChange={(e) => { setHash(e.target.value.trim()) }}
          disabled={!puede}
        />
      </label>

      {hash !== '' && (
        <label style={{ margin: 0 }}>
          <span>Nombre del archivo</span>
          <input
            type="text"
            name="firmaArchivo"
            defaultValue={texto('firmaArchivo')}
            disabled={!puede}
            required
          />
        </label>
      )}

      <button type="submit" disabled={!puede || guardando}>
        {guardando ? 'Asentando…' : 'Asentar la declaración'}
      </button>
    </form>
  )
}
