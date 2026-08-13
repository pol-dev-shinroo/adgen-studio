import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Part CC-6: frontend had zero test infra before this — separate from
// vite.config.js (dev server config) rather than merged into it, so the
// dev server's own config never has to account for test-only settings.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // Scoped to src/ only — backend/ has its own separate node:test runner
    // (npm test inside backend/), and without this Vitest's default globs
    // also pick up (and fail to bundle) backend/test/*.test.js files.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
})
