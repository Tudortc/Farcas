import type { FastifyInstance } from 'fastify'
import { getSessionFromHeaders } from './auth-routes.js'
import { isPushConfigured, vapidPublicKey, savePushSubscription, removePushSubscription } from './push.js'

export async function registerPush(app: FastifyInstance): Promise<void> {
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

    const body = request.body as { endpoint: string; keys: { p256dh: string; auth: string } }
    await savePushSubscription(session.user.id, body)
    return reply.status(200).send({ ok: true })
  })

  app.post('/api/push/unsubscribe', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })

    const body = request.body as { endpoint: string }
    await removePushSubscription(session.user.id, body.endpoint)
    return reply.status(200).send({ ok: true })
  })
}
