import type { NextConfig } from 'next'

const config: NextConfig = {
  typedRoutes: true,
  // El dominio y los tests corren fuera de Next; aquí solo vive la UI.
  serverExternalPackages: ['pg'],
}

export default config
