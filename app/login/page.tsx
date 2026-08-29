'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '../../src/supabase/navegador'
import { Marca } from '../componentes/marca'
import { Ojo } from '../componentes/iconos'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verClave, setVerClave] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const { error } = await clienteNavegador().auth.signInWithPassword({ email, password })
    if (error !== null) {
      setError('Correo o contraseña incorrectos.')
      setEnviando(false)
      return
    }
    // Al dashboard, que es la única pantalla que responde la pregunta con la
    // que alguien abre este portal: ¿estoy en regla hoy? Aterrizar en la lista
    // de clientes obligaba a buscar los periodos vencidos, que es justo lo que
    // el semáforo existe para no tener que buscar.
    router.push('/')
    router.refresh()
  }

  return (
    <div className="acceso">
      {/* ── El panel de marca ────────────────────────────────────────── */}
      {/* No lleva la razón social del obligado: antes de autenticar, decir de
          qué empresa es este portal filtra a quién quiera que se sepa. */}
      <div className="acceso-panel">
        <span className="acceso-marca">
          <Marca tamano={26} titulo="VIZO" />
          VIZO
        </span>
        <div>
          <p className="acceso-lema">Tu cumplimiento, en regla y a la vista.</p>
          <p className="acceso-sub">
            Avisos, expedientes y alertas de la Fracción V Bis en un solo lugar.
          </p>
        </div>
        <p className="acceso-pie">© {new Date().getFullYear()} VIZO</p>
      </div>

      {/* ── La tarjeta de acceso ─────────────────────────────────────── */}
      <div className="acceso-lado">
        <form onSubmit={entrar} className="acceso-tarjeta">
          <div className="acceso-titulo">
            <h1>Entrar al portal</h1>
            <p className="sub" style={{ margin: 0 }}>
              Usa la cuenta que te asignó tu administrador.
            </p>
          </div>

          {error !== null && <div className="error">{error}</div>}

          <label className="acceso-campo">
            <span>Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="tu@empresa.mx"
            />
          </label>

          <label className="acceso-campo">
            <span>Contraseña</span>
            <span className="acceso-clave">
              <input
                type={verClave ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                className="acceso-ojo"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Ojo tachado={verClave} />
              </button>
            </span>
          </label>

          <button type="submit" className="acceso-entrar" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          {/* Esta frase es CIERTA, y por eso puede estar aquí: cada sesión
              queda en la bitácora encadenada. Una promesa de seguridad que
              no se cumple es peor que no hacerla. */}
          <p className="acceso-legal">
            Acceso solo para personal autorizado. Cada sesión queda registrada en la bitácora.{' '}
            <a className="acceso-enlace" href="/privacidad">
              Aviso de privacidad
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}
