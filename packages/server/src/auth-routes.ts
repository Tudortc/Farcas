import type { FastifyInstance, FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from './auth.js'

export async function getSessionFromHeaders(headers: FastifyRequest['headers']) {
  return auth.api.getSession({ headers: fromNodeHeaders(headers) })
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const origins = (process.env.BOOL_TRUSTED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  })

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      })
      const response = await auth.handler(req)
      reply.status(response.status)
      response.headers.forEach((value, key) => reply.header(key, value))
      return reply.send(response.body ? await response.text() : null)
    },
  })

  app.get('/api/me', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })
    return reply.send(session)
  })
}
