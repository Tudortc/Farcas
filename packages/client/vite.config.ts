import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@bool/shared': sharedSrc,
    },
  },
  plugins: [
    react(),
    // Disable the PWA plugin during Vitest runs — it requires a real build
    // context that is unavailable in the test environment.
    ...(process.env.VITEST
      ? []
      : [
          VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            injectManifest: {},
            manifest: {
              name: 'bool',
              short_name: 'bool',
              description: 'A modern self-hosted web IRC client',
              display: 'standalone',
              start_url: '/',
              background_color: '#0a0c0d',
              theme_color: '#0a0c0d',
              icons: [
                { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: '/icon-maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
          }),
        ]),
  ],
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
    // Playwright e2e specs live in ./e2e and must not be collected by Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
