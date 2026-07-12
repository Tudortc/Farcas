import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'
import { getSessionFromHeaders } from './auth-routes.js'
import { hub, ircManager } from './irc/singleton.js'
import { createNetwork, removeNetwork, listNetworks } from './networks.js'
import { searchMessages, getHistory } from './messages.js'
import { setReadMarker, listReadMarkers } from './read-markers.js'

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
    // Subscribe this socket to the hub so all IRC + fan-out messages reach it.
    const unsubFromHub = hub.subscribe(userId, (msg: ServerMessage) => send(msg))
    socket.on('close', () => unsubFromHub())

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

    // Send current state to the freshly-subscribed socket.
    sendNetList()
    send({ type: 'read:list', markers: listReadMarkers(userId) })

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
          ircManager.connectNetwork(userId, msg.networkId)
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
        case 'user:nick':
          if (!ircManager.setNick(userId, msg.networkId, msg.nick))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:topic:set':
          if (!ircManager.setTopic(userId, msg.networkId, msg.channel, msg.topic))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:kick':
          if (!ircManager.kick(userId, msg.networkId, msg.channel, msg.nick, msg.reason))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:mode':
          if (!ircManager.setMode(userId, msg.networkId, msg.target, msg.modes, msg.args))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'user:whois':
          if (!ircManager.whois(userId, msg.networkId, msg.nick))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:list':
          if (!ircManager.listChannels(userId, msg.networkId, msg.filter))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chat:send': {
          const ok = msg.action
            ? ircManager.sendAction(userId, msg.networkId, msg.target, msg.text)
            : ircManager.say(userId, msg.networkId, msg.target, msg.text, msg.replyTo)
          if (!ok) send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        }
        case 'typing:set':
          ircManager.setTyping(userId, msg.networkId, msg.target, msg.state)
          break
        case 'react:add': {
          ircManager.react(userId, msg.networkId, msg.target, msg.msgid, msg.emoji, true)
          const addNick = ircManager.getConnection(userId, msg.networkId)?.currentNick() ?? 'you'
          hub.publish(userId, { type: 'react:update', networkId: msg.networkId, target: msg.target, msgid: msg.msgid, emoji: msg.emoji, nick: addNick, action: 'add' })
          break
        }
        case 'react:remove': {
          ircManager.react(userId, msg.networkId, msg.target, msg.msgid, msg.emoji, false)
          const removeNick = ircManager.getConnection(userId, msg.networkId)?.currentNick() ?? 'you'
          hub.publish(userId, { type: 'react:update', networkId: msg.networkId, target: msg.target, msgid: msg.msgid, emoji: msg.emoji, nick: removeNick, action: 'remove' })
          break
        }
        case 'chat:search':
          send({ type: 'search:results', query: msg.query, results: searchMessages(userId, msg.query, msg.limit) })
          break
        case 'history:request':
          send({ type: 'history:batch', networkId: msg.networkId, target: msg.target, messages: getHistory(userId, msg.networkId, msg.target, msg.limit, msg.before) })
          break
        case 'read:set': {
          const { ts, changed } = setReadMarker(userId, msg.networkId, msg.target, msg.ts)
          if (changed) {
            hub.publish(userId, { type: 'read:update', networkId: msg.networkId, target: msg.target, ts })
          }
          break
        }
        case 'read:list':
          send({ type: 'read:list', markers: listReadMarkers(userId) })
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
