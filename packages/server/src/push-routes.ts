import type { FastifyInstance } from 'fastify'
import { getSessionFromHeaders } from './auth-routes.js'
import { isPushConfigured, vapidPublicKey, savePushSubscription, removePushSubscription } from './push.js'

function isValidSubscribeBody(body: unknown): body is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  if (typeof b.endpoint !== 'string') return false
  if (typeof b.keys !== 'object' || b.keys === null) return false
  const keys = b.keys as Record<string, unknown>
  return typeof keys.p256dh === 'string' && typeof keys.auth === 'string'
}

function isValidUnsubscribeBody(body: unknown): body is { endpoint: string } {
  if (typeof body !== 'object' || body === null) return false
  return typeof (body as Record<string, unknown>).endpoint === 'string'
}

export async function registerPush(app: FastifyInstance): Promise<void> {
  // GET /api/push/vapid — intentionally unauthenticated; the public key is not a secret and clients need it before subscribing
  app.get('/api/push/vapid', async (_request, reply) => {
    const key = vapidPublicKey()
    if (!key || !isPushConfigured()) {
      return reply.status(404).send({ error: 'push not configured' })
    }
    return reply.send({ key })
  })

  app.post('/api/push/subscribe', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })

    if (!isValidSubscribeBody(request.body)) {
      return reply.code(400).send({ error: 'invalid subscription' })
    }

    await savePushSubscription(session.user.id, request.body)
    return reply.status(200).send({ ok: true })
  })

  app.post('/api/push/unsubscribe', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })

    if (!isValidUnsubscribeBody(request.body)) {
      return reply.code(400).send({ error: 'invalid subscription' })
    }

    await removePushSubscription(session.user.id, request.body.endpoint)
    return reply.status(200).send({ ok: true })
  })
}
