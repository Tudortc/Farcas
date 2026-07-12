import type { ServerMessage } from '@bool/shared'
import { IrcConnection, type IrcClientFactory } from './connection.js'
import { getNetwork } from '../networks.js'
import { storeMessage } from '../messages.js'
import { Hub } from './hub.js'
import { maybeNotify } from '../notifier.js'
import { fetchPreview } from '../link-preview.js'

/** Regex to extract the first http(s) URL from a chat message body. */
const URL_REGEX = /https?:\/\/[^\s<>"']+/i

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
        maybeNotify(userId, msg, {
          selfNick: conn.currentNick(),
          activeSockets: this.hub.subscriberCount(userId),
        }).catch((err) => console.error('[IrcManager] maybeNotify failed', err))

        // Kick off a non-blocking link preview fetch for the first URL in the message.
        // Failure must never affect relay or persistence.
        const urlMatch = msg.text?.match(URL_REGEX)
        if (urlMatch) {
          void fetchPreview(urlMatch[0]!)
            .then((res) => {
              if (res.ok) {
                this.hub.publish(userId, {
                  type: 'preview:result' as const,
                  url: res.url,
                  ok: res.ok,
                  ...(res.title !== undefined ? { title: res.title } : {}),
                  ...(res.description !== undefined ? { description: res.description } : {}),
                  ...(res.image !== undefined ? { image: res.image } : {}),
                  ...(res.siteName !== undefined ? { siteName: res.siteName } : {}),
                })
              }
            })
            .catch(() => {
              // Silently swallow — preview failure is non-fatal
            })
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

  setNick(userId: string, networkId: number, nick: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.setNick(nick)
    return true
  }
  setTopic(userId: string, networkId: number, channel: string, topic: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.setTopic(channel, topic)
    return true
  }
  kick(userId: string, networkId: number, channel: string, nick: string, reason?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.kick(channel, nick, reason)
    return true
  }
  setMode(userId: string, networkId: number, target: string, modes: string, args?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.setMode(target, modes, args)
    return true
  }
  whois(userId: string, networkId: number, nick: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.whois(nick)
    return true
  }
  listChannels(userId: string, networkId: number, filter?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.listChannels(filter)
    return true
  }
  sendAction(userId: string, networkId: number, target: string, text: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.action(target, text)
    return true
  }

  getConnection(userId: string, networkId: number): IrcConnection | undefined {
    return this.conns.get(keyOf(userId, networkId))
  }
  isConnected(userId: string, networkId: number): boolean {
    return this.conns.get(keyOf(userId, networkId))?.isConnected() ?? false
  }
}
