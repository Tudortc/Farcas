import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@bool/shared': sharedSrc,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15000,
    fileParallelism: false,
    env: {
      BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      BETTER_AUTH_URL: 'http://localhost:3030',
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
      },
    },
  },
})
