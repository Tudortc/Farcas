import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from './db.js'

export const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
])

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export interface MediaError extends Error {
  code: 'BAD_TYPE' | 'TOO_LARGE'
}

function mediaError(code: 'BAD_TYPE' | 'TOO_LARGE', message: string): MediaError {
  const err = new Error(message) as MediaError
  err.code = code
  return err
}

function mediaDir(): string {
  return process.env.BOOL_MEDIA_DIR ?? './media'
}

export interface SaveMediaParams {
  filename: string
  mime: string
  bytes: Buffer
}

export interface SaveMediaResult {
  id: string
  url: string
}

export function saveMedia(userId: string, { filename, mime, bytes }: SaveMediaParams): SaveMediaResult {
  if (!ALLOWED_MIME.has(mime)) {
    throw mediaError('BAD_TYPE', `MIME type not allowed: ${mime}`)
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw mediaError('TOO_LARGE', `File too large: ${bytes.byteLength} > ${MAX_UPLOAD_BYTES}`)
  }

  const id = randomUUID()
  const dir = mediaDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, id), bytes)

  getDb()
    .prepare(
      'INSERT INTO media (id, user_id, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, userId, filename, mime, bytes.byteLength, Date.now())

  return { id, url: `/api/media/${id}` }
}

export interface MediaRecord {
  userId: string
  filename: string
  mime: string
  size: number
  path: string
}

export function getMedia(id: string): MediaRecord | null {
  const row = getDb()
    .prepare('SELECT user_id, filename, mime, size FROM media WHERE id = ?')
    .get(id) as { user_id: string; filename: string; mime: string; size: number } | undefined

  if (!row) return null
  return {
    userId: row.user_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    path: join(mediaDir(), id),
  }
}
