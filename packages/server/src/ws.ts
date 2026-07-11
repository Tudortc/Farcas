import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'

export function serverTimeNow(): number {
  return Date.now()
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg))

    socket.on('message', (raw: Buffer) => {
      let msg
      try {
        msg = parseClientMessage(raw.toString())
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
