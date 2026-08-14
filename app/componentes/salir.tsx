'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '../../src/supabase/navegador'

/**
 * Cerrar sesión.
 *
 * El portal no tenía forma de salir. En un producto donde cada acción queda
 * registrada con el nombre de quien la hizo, eso no es una comodidad que
 * faltaba: una computadora compartida en una oficina de ventas deja al
 * siguiente operando con la sesión del anterior, y la bitácora —que es
 * inmutable— guarda para siempre que la operación la capturó alguien que no
 * estaba ahí. Un registro con el autor equivocado es peor que no tenerlo:
 * parece evidencia.
 *
 * `router.refresh()` después de salir no es adorno: sin él quedan en caché las
 * pantallas ya renderizadas con los datos del obligado anterior.
 */
export function Salir() {
  const router = useRouter()
  const [saliendo, setSaliendo] = useState(false)

  async function salir() {
    setSaliendo(true)
    await clienteNavegador().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button type="button" className="salir" onClick={salir} disabled={saliendo}>
      <svg
        viewBox="0 0 18 18"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 15.3H4.2a1.5 1.5 0 0 1-1.5-1.5V4.2a1.5 1.5 0 0 1 1.5-1.5H7" />
        <path d="M11.6 12.1 14.7 9l-3.1-3.1" />
        <path d="M14.7 9H7.1" />
      </svg>
      {saliendo ? 'Cerrando…' : 'Cerrar sesión'}
    </button>
  )
}
