import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors the `@/*` path alias from tsconfig.json so tests can import app modules.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
