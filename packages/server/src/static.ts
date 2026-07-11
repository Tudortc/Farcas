import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Assumes @fastify/static is already registered with { root: clientDist }.
export function registerStatic(app: FastifyInstance, clientDist: string): void {
  app.get('/', async (_req, reply) => reply.sendFile('index.html'))

  // SPA history fallback: any GET not matched above and not an API/ws route.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/health') && !req.url.startsWith('/ws')) {
      if (existsSync(join(clientDist, 'index.html'))) {
        return reply.sendFile('index.html')
      }
    }
    return reply.code(404).send({ error: 'not found' })
  })
}
