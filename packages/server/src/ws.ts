import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'
import { getSessionFromHeaders } from './auth-routes.js'

export function serverTimeNow(): number {
  return Date.now()
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg))

    const session = await getSessionFromHeaders(request.headers)
    if (!session) {
      send({ type: 'error', message: 'unauthorized' })
      socket.close()
      return
    }

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const text = Buffer.isBuffer(raw)
        ? raw.toString()
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString()
          : Buffer.from(raw).toString()
      let msg
      try {
        msg = parseClientMessage(text)
      } catch {
        send({ type: 'error', message: 'invalid message' })
        return
      }

      switch (msg.type) {
        case 'hello':
          send({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, serverTime: serverTimeNow() })
          break
        case 'ping':
          send({ type: 'pong', t: msg.t })
          break
      }
    })
  })
}
