import type { ServerMessage } from '@bool/shared'
import { IrcConnection, type IrcClientFactory } from './connection.js'
import { getNetwork } from '../networks.js'
import { storeMessage } from '../messages.js'
import { Hub } from './hub.js'
import { maybeNotify } from '../notifier.js'

const keyOf = (userId: string, networkId: number) => `${userId}:${networkId}`

export class IrcManager {
  private conns = new Map<string, IrcConnection>()
  private hub: Hub

  constructor(private readonly factory?: IrcClientFactory, hub?: Hub) {
    this.hub = hub ?? new Hub()
  }

  getHub(): Hub {
    return this.hub
  }

  connectNetwork(userId: string, networkId: number): void {
    const k = keyOf(userId, networkId)
    const existing = this.conns.get(k)
    if (existing) {
      if (!existing.isConnected()) existing.connect()
      return
    }
    const cfg = getNetwork(userId, networkId)
    if (!cfg) {
      this.hub.publish(userId, { type: 'net:error', networkId, message: 'network not found' })
      return
    }
    const persistingSink = (msg: ServerMessage) => {
      if (msg.type === 'chat:msg') {
        try {
          storeMessage(userId, {
            networkId: msg.networkId,
            target: msg.target,
            sender: msg.from,
            kind: msg.kind,
            body: msg.text,
            ts: msg.time ?? Date.now(),
            ...(msg.msgid ? { msgid: msg.msgid } : {}),
            ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          })
        } catch (err) {
          console.error('[IrcManager] persistingSink: storeMessage failed', err)
        }
      }
      this.hub.publish(userId, msg)
      if (msg.type === 'chat:msg') {
        try {
          void maybeNotify(userId, msg, {
            selfNick: conn.currentNick(),
            activeSockets: this.hub.subscriberCount(userId),
          })
        } catch (err) {
          console.error('[IrcManager] persistingSink: maybeNotify failed', err)
        }
      }
    }
    const conn = new IrcConnection(
      networkId,
      { name: cfg.name, host: cfg.host, port: cfg.port, tls: cfg.tls, nick: cfg.nick, username: cfg.username, realname: cfg.realname, saslAccount: cfg.saslAccount, saslPassword: cfg.saslPassword },
      persistingSink,
      this.factory,
    )
    this.conns.set(k, conn)
    conn.connect()
  }

  disconnectNetwork(userId: string, networkId: number): void {
    const k = keyOf(userId, networkId)
    const c = this.conns.get(k)
    if (c) {
      c.disconnect()
      this.conns.delete(k)
    }
  }

  join(userId: string, networkId: number, channel: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.join(channel)
    return true
  }
  part(userId: string, networkId: number, channel: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.part(channel)
    return true
  }
  say(userId: string, networkId: number, target: string, text: string, replyTo?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.say(target, text, replyTo)
    return true
  }
  setTyping(userId: string, networkId: number, target: string, state: 'active' | 'done'): void {
    const c = this.conns.get(keyOf(userId, networkId))
    c?.sendTyping(target, state)
  }
  react(userId: string, networkId: number, target: string, msgid: string, emoji: string, add: boolean): void {
    const c = this.conns.get(keyOf(userId, networkId))
    c?.sendReaction(target, msgid, emoji, add)
  }

  getConnection(userId: string, networkId: number): IrcConnection | undefined {
    return this.conns.get(keyOf(userId, networkId))
  }
  isConnected(userId: string, networkId: number): boolean {
    return this.conns.get(keyOf(userId, networkId))?.isConnected() ?? false
  }
}
