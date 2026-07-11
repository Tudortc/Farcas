import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      BETTER_AUTH_URL: 'http://localhost:3030',
    },
    pool: 'forks',
  },
})
