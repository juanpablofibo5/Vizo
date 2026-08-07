'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '../../src/supabase/navegador'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

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
    router.push('/clientes')
    router.refresh()
  }

  return (
    <main style={{ maxWidth: '22rem', marginTop: '4rem' }}>
      <h1>VIZO</h1>
      <p className="sub">Cumplimiento PLD · Fracción V Bis</p>

      <form onSubmit={entrar} className="tarjeta">
        {error !== null && <div className="error">{error}</div>}
        <label>
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
