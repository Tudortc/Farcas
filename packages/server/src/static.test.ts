import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import fstatic from '@fastify/static'
import { registerStatic } from './static.js'

let app: FastifyInstance
let dist: string

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'bool-dist-'))
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>bool</title>')
  app = Fastify()
  await app.register(fstatic, { root: dist })
  registerStatic(app, dist)
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('static serving', () => {
  it('serves index.html at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('bool')
  })

  it('falls back to index.html for unknown SPA routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/channels/libera' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('bool')
  })

  it('returns 404 JSON for non-GET requests on unknown routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/whatever' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'not found' })
  })
})
