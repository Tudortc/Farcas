import Fastify, { type FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import fstatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebSocket } from './ws.js'
import { registerStatic } from './static.js'

const here = dirname(fileURLToPath(import.meta.url))
const clientDist = join(here, '../../client/dist')

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(websocket)
  app.register(async (instance) => {
    registerWebSocket(instance)
  })

  app.get('/health', async () => ({ status: 'ok' }))

  if (existsSync(clientDist)) {
    app.register(fstatic, { root: clientDist })
    app.register(async (instance) => {
      registerStatic(instance, clientDist)
    })
  }

  return app
}
