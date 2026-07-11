import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@bool/shared': sharedSrc,
    },
  },
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3030', ws: true },
      '/api': { target: 'http://localhost:3030', changeOrigin: true },
      '/health': 'http://localhost:3030',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./src/test-setup.ts'],
  },
})
