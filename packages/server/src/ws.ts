import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'
import { getSessionFromHeaders } from './auth-routes.js'
import { ircManager } from './irc/singleton.js'
import { createNetwork, removeNetwork, listNetworks } from './networks.js'

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
    const userId = session.user.id
    // Single-socket relay: the sink forwards manager ServerMessages to this socket only.
    // Full multi-device fan-out (re-binding all of a user's live sockets) is Milestone 4 (Sync gateway).
    const sink = (msg: ServerMessage) => send(msg)

    const sendNetList = () => {
      send({
        type: 'net:list',
        networks: listNetworks(userId).map((n) => ({
          id: n.id,
          name: n.name,
          host: n.host,
          port: n.port,
          tls: n.tls,
          nick: n.nick,
          connected: ircManager.isConnected(userId, n.id),
        })),
      })
    }

    const handleMessage = (msg: ReturnType<typeof parseClientMessage>) => {
      switch (msg.type) {
        case 'hello':
          send({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, serverTime: serverTimeNow() })
          break
        case 'ping':
          send({ type: 'pong', t: msg.t })
          break
        case 'net:add':
          createNetwork(userId, {
            name: msg.name,
            host: msg.host,
            port: msg.port,
            tls: msg.tls,
            nick: msg.nick,
            username: msg.username,
            realname: msg.realname,
            saslAccount: msg.saslAccount,
            saslPassword: msg.saslPassword,
          })
          sendNetList()
          break
        case 'net:remove':
          ircManager.disconnectNetwork(userId, msg.networkId)
          removeNetwork(userId, msg.networkId)
          sendNetList()
          break
        case 'net:list':
          sendNetList()
          break
        case 'net:connect':
          ircManager.connectNetwork(userId, msg.networkId, sink)
          break
        case 'net:disconnect':
          ircManager.disconnectNetwork(userId, msg.networkId)
          sendNetList()
          break
        case 'chan:join':
          ircManager.join(userId, msg.networkId, msg.channel)
          break
        case 'chan:part':
          ircManager.part(userId, msg.networkId, msg.channel)
          break
        case 'chat:send':
          if (!ircManager.say(userId, msg.networkId, msg.target, msg.text)) {
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          }
          break
      }
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

      try {
        handleMessage(msg)
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'internal error' })
      }
    })
  })
}
