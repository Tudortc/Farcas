/**
 * Tests for authenticated multipart upload + media serving.
 *
 * Multipart approach: we hand-build a multipart/form-data body string with a
 * fixed boundary and pass it via app.inject. This avoids adding any extra dep.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'

// A minimal valid 1×1 transparent PNG (67 bytes)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex',
)

const BOUNDARY = 'TestBoundary12345'

function buildMultipart(filename: string, mimeType: string, content: Buffer): Buffer {
  const header = [
    `--${BOUNDARY}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join('\r\n')
  const footer = `\r\n--${BOUNDARY}--\r\n`
  return Buffer.concat([Buffer.from(header), content, Buffer.from(footer)])
}

let app: FastifyInstance
let mediaDir: string

beforeAll(async () => {
  mediaDir = mkdtempSync(join(tmpdir(), 'bool-media-test-'))
  process.env.BOOL_MEDIA_DIR = mediaDir
  ensureAppSchema(getDb())
  app = buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
  rmSync(mediaDir, { recursive: true, force: true })
})

afterEach(() => {
  getDb().exec('DELETE FROM media')
})

const uniq = () => `u${Math.floor(performance.now() * 1000) % 1_000_000_000}`

async function signUpAndGetCookie(name: string): Promise<string> {
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  expect(signup.statusCode).toBeLessThan(400)
  const cookie = signup.headers['set-cookie']
  return Array.isArray(cookie) ? cookie.join('; ') : String(cookie)
}

describe('POST /api/upload', () => {
  it('returns 401 when not authenticated', async () => {
    const body = buildMultipart('test.png', 'image/png', TINY_PNG)
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('uploads a valid PNG and returns {id, url, mime}; row exists in media table', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    const body = buildMultipart('photo.png', 'image/png', TINY_PNG)
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body,
    })
    expect(res.statusCode).toBe(200)
    const json = res.json<{ id: string; url: string; mime: string }>()
    expect(json.id).toBeTruthy()
    expect(json.url).toBe(`/api/media/${json.id}`)
    expect(json.mime).toBe('image/png')

    const row = getDb().prepare('SELECT * FROM media WHERE id = ?').get(json.id) as any
    expect(row).toBeTruthy()
    expect(row.mime).toBe('image/png')
    expect(row.filename).toBe('photo.png')
  })

  it('returns 415 for a disallowed MIME type', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    const body = buildMultipart('evil.sh', 'application/x-sh', Buffer.from('#!/bin/sh\necho hi'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body,
    })
    expect(res.statusCode).toBe(415)
  })
})

describe('GET /api/media/:id', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/media/nonexistent' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for an unknown id', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    const res = await app.inject({
      method: 'GET',
      url: '/api/media/does-not-exist-id',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('streams the file with correct content-type and security headers', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    // Upload first
    const body = buildMultipart('image.png', 'image/png', TINY_PNG)
    const upload = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body,
    })
    expect(upload.statusCode).toBe(200)
    const { id } = upload.json<{ id: string }>()

    // Serve
    const res = await app.inject({
      method: 'GET',
      url: `/api/media/${id}`,
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/^image\/png/)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.rawPayload).toEqual(TINY_PNG)
  })
})
