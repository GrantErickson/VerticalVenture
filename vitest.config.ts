import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The game logic under app/scripts is plain TypeScript with no Vue or Nuxt
// imports, so the tests need only Nuxt's `~`/`@` path aliases, not the Nuxt
// test environment.
const app = fileURLToPath(new URL('./app', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '~': app, '@': app },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
  },
})
