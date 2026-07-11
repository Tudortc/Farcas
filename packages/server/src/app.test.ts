import { describe, it, expect, afterAll } from 'vitest'
import { buildApp } from './app.js'

const app = buildApp()
afterAll(async () => {
  await app.close()
})

describe('server app', () => {
  it('responds to GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
