import Fastify, { type FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import { registerWebSocket } from './ws.js'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(websocket)
  app.register(async (instance) => {
    registerWebSocket(instance)
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
