import type { FastifyInstance } from 'fastify'
import type { RawData } from 'ws'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'

export function serverTimeNow(): number {
  return Date.now()
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg))

    socket.on('message', (raw: RawData) => {
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
