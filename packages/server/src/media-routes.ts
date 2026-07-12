import { createReadStream } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { getSessionFromHeaders } from './auth-routes.js'
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, saveMedia, getMedia } from './media.js'

export async function registerMedia(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
    },
  })

  app.post('/api/upload', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })

    let part: Awaited<ReturnType<typeof request.file>>
    try {
      part = await request.file()
    } catch (err: any) {
      // @fastify/multipart throws when the file size limit is reached
      if (
        err?.code === 'FST_FILES_LIMIT' ||
        err?.code === 'FST_REQ_FILE_TOO_LARGE' ||
        err?.statusCode === 413 ||
        err?.message?.includes('size limit')
      ) {
        return reply.status(413).send({ error: 'file too large' })
      }
      throw err
    }

    if (!part) {
      return reply.status(400).send({ error: 'no file uploaded' })
    }

    // Validate MIME before buffering
    if (!ALLOWED_MIME.has(part.mimetype)) {
      // Drain the stream to avoid resource leaks
      part.file.resume()
      return reply.status(415).send({ error: 'unsupported media type' })
    }

    let bytes: Buffer
    try {
      bytes = await part.toBuffer()
    } catch (err: any) {
      if (
        err?.code === 'FST_FILES_LIMIT' ||
        err?.code === 'FST_REQ_FILE_TOO_LARGE' ||
        err?.statusCode === 413 ||
        err?.message?.includes('size limit') ||
        err?.code === 'RequestFileTooLargeError'
      ) {
        return reply.status(413).send({ error: 'file too large' })
      }
      throw err
    }

    // Double-check size after buffering (handles edge cases)
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return reply.status(413).send({ error: 'file too large' })
    }

    const result = saveMedia(session.user.id, {
      filename: part.filename,
      mime: part.mimetype,
      bytes,
    })

    return reply.status(200).send({ id: result.id, url: result.url, mime: part.mimetype })
  })

  app.get('/api/media/:id', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })

    const { id } = request.params as { id: string }
    const record = getMedia(id)
    if (!record) return reply.status(404).send({ error: 'not found' })

    // Sanitize filename: strip control chars and characters unsafe in quoted-string
    const asciiSafe = record.filename
      .replace(/[\x00-\x1f\x7f"\\]/g, '_')
      .replace(/[^\x20-\x7e]/g, '_')
    const rfc5987 = encodeURIComponent(record.filename)

    reply.header('Content-Type', record.mime)
    reply.header(
      'Content-Disposition',
      `inline; filename="${asciiSafe}"; filename*=UTF-8''${rfc5987}`,
    )
    reply.header('X-Content-Type-Options', 'nosniff')

    return reply.send(createReadStream(record.path))
  })
}
