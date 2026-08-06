import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests que tocan la base comparten una sola instancia local; correrlos
    // en paralelo produce fallos que no son del código.
    fileParallelism: false,
    reporters: 'verbose',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
