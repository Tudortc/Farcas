import { Client } from 'irc-framework'
import type { ServerMessage } from '@bool/shared'
import { formatNumeric } from './numerics.js'

export interface IrcClientLike {
  on(event: string, cb: (arg: any) => void): void
  emit(event: string, arg?: any): boolean
  connect(options: any): void
  say(target: string, message: string, tags?: Record<string, string>): void
  tagmsg(target: string, tags: Record<string, string>): void
  join(channel: string, key?: string): void
  part(channel: string, message?: string): void
  quit(message?: string): void
  changeNick(nick: string): void
  raw(...args: any[]): void
  removeAllListeners(event?: string): void
  user: { nick: string }
  network: { name: string; cap: { enabled: string[]; isEnabled(c: string): boolean } }
}

export type IrcClientFactory = () => IrcClientLike

export interface NetworkConfig {
  name: string
  host: string
  port: number
  tls: boolean
  nick: string
  username?: string
  realname?: string
  saslAccount?: string
  saslPassword?: string
}

export class IrcConnection {
  private client: IrcClientLike | null = null
  private connected = false

  constructor(
    private readonly networkId: number,
    private readonly config: NetworkConfig,
    private readonly sink: (msg: ServerMessage) => void,
    private readonly factory: IrcClientFactory = () => new Client() as unknown as IrcClientLike,
  ) {}

  private teardown(): void {
    if (this.client) {
      this.client.removeAllListeners()
      this.client.quit('bool bouncer')
      this.client = null
      this.connected = false
    }
  }

  connect(): void {
    // If there is an existing client, tear it down first to avoid listener/socket leaks.
    if (this.client) {
      this.teardown()
    }

    const client = this.factory()
    this.client = client
    this.wire(client)

    this.sink({ type: 'net:state', networkId: this.networkId, name: this.config.name, state: 'connecting' })

    const opts: any = {
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      nick: this.config.nick,
      username: this.config.username ?? this.config.nick,
      gecos: this.config.realname ?? this.config.nick,
      enable_echomessage: true,
      auto_reconnect: true,
    }
    if (this.config.saslAccount && this.config.saslPassword) {
      opts.account = { account: this.config.saslAccount, password: this.config.saslPassword }
    }
    client.connect(opts)
  }

  private wire(client: IrcClientLike): void {
    const nid = this.networkId

    client.on('registered', () => {
      this.connected = true
      this.sink({ type: 'net:state', networkId: nid, name: this.config.name, state: 'registered', nick: client.user.nick })
    })
    client.on('reconnecting', () => {
      this.connected = false
      this.sink({ type: 'net:state', networkId: nid, name: this.config.name, state: 'reconnecting' })
    })
    client.on('close', () => {
      this.connected = false
      this.sink({ type: 'net:state', networkId: nid, name: this.config.name, state: 'closed' })
    })

    client.on('message', (e: any) => {
      if (e.type !== 'privmsg' && e.type !== 'notice' && e.type !== 'action') return
      this.sink({
        type: 'chat:msg',
        networkId: nid,
        target: e.target,
        from: e.nick ?? '',
        kind: e.type,
        text: e.message ?? '',
        self: !!e.nick && e.nick === client.user.nick,
        ...(e.tags?.msgid ? { msgid: e.tags.msgid } : {}),
        ...(typeof e.time === 'number' ? { time: e.time } : {}),
        ...(e.account ? { account: e.account } : {}),
        ...(e.tags?.['+draft/reply'] ? { replyTo: e.tags['+draft/reply'] } : {}),
      })
    })

    client.on('tagmsg', (e: any) => {
      const tags: Record<string, string> = e.tags ?? {}
      if (tags['+typing'] !== undefined) {
        // Note: +typing has 3 states (active/paused/done); we coerce `paused` → `active`
        // since our model only tracks active vs done.
        const state = tags['+typing'] === 'done' ? 'done' : 'active'
        this.sink({ type: 'typing:update', networkId: nid, target: e.target, nick: e.nick ?? '', state })
      } else if (tags['+draft/react'] !== undefined) {
        this.sink({
          type: 'react:update',
          networkId: nid,
          target: e.target,
          msgid: tags['+draft/reply'] ?? '',
          emoji: tags['+draft/react'],
          nick: e.nick ?? '',
          action: 'add',
        })
      } else if (tags['+draft/unreact'] !== undefined) {
        this.sink({
          type: 'react:update',
          networkId: nid,
          target: e.target,
          msgid: tags['+draft/reply'] ?? '',
          emoji: tags['+draft/unreact'],
          nick: e.nick ?? '',
          action: 'remove',
        })
      }
    })

    client.on('join', (e: any) => {
      this.sink({ type: 'chan:join', networkId: nid, channel: e.channel, nick: e.nick, self: e.nick === client.user.nick })
    })
    client.on('part', (e: any) => {
      this.sink({ type: 'chan:part', networkId: nid, channel: e.channel, nick: e.nick, ...(e.message ? { reason: e.message } : {}) })
    })
    client.on('quit', (e: any) => {
      this.sink({ type: 'presence:quit', networkId: nid, nick: e.nick, ...(e.message ? { reason: e.message } : {}) })
    })
    client.on('nick', (e: any) => {
      this.sink({ type: 'presence:nick', networkId: nid, oldNick: e.nick, newNick: e.new_nick })
    })
    client.on('topic', (e: any) => {
      this.sink({ type: 'chan:topic', networkId: nid, channel: e.channel, topic: e.topic ?? '' })
    })
    client.on('userlist', (e: any) => {
      this.sink({
        type: 'chan:names',
        networkId: nid,
        channel: e.channel,
        users: (e.users ?? []).map((u: any) => ({ nick: u.nick, modes: u.modes ?? [] })),
      })
    })

    client.on('raw', (e: any) => {
      if (!e?.from_server || typeof e.line !== 'string') return
      const text = formatNumeric(e.line, client.user.nick)
      if (text) {
        this.sink({ type: 'chat:msg', networkId: nid, target: '*', from: '*', kind: 'notice', text, self: false, time: Date.now() })
      }
    })
  }

  join(channel: string): void {
    this.client?.join(channel)
  }
  part(channel: string): void {
    this.client?.part(channel)
  }
  setNick(nick: string): void {
    this.client?.changeNick(nick)
  }
  setTopic(channel: string, topic: string): void {
    this.client?.raw(`TOPIC ${channel} :${topic}`)
  }
  kick(channel: string, nick: string, reason?: string): void {
    this.client?.raw(`KICK ${channel} ${nick}${reason ? ` :${reason}` : ''}`)
  }
  setMode(target: string, modes: string, args?: string): void {
    this.client?.raw(`MODE ${target} ${modes}${args ? ` ${args}` : ''}`)
  }
  whois(nick: string): void {
    this.client?.raw(`WHOIS ${nick}`)
  }
  listChannels(filter?: string): void {
    this.client?.raw(`LIST${filter ? ` ${filter}` : ''}`)
  }
  action(target: string, text: string): void {
    this.client?.say(target, `\x01ACTION ${text}\x01`)
  }
  say(target: string, text: string, replyTo?: string): void {
    if (!this.client) return
    const capEnabled = this.client.network.cap.isEnabled('message-tags')
    if (replyTo) {
      if (capEnabled) {
        this.client.say(target, text, { '+draft/reply': replyTo })
      } else {
        // Degraded reply: no message-tags cap, so prefix text to label it clearly
        this.client.say(target, '(reply) ' + text)
      }
    } else {
      this.client.say(target, text)
    }
  }
  sendTyping(target: string, state: 'active' | 'done'): void {
    if (!this.client) return
    if (!this.client.network.cap.isEnabled('message-tags')) return
    this.client.tagmsg(target, { '+typing': state })
  }
  sendReaction(target: string, msgid: string, emoji: string, add: boolean): void {
    if (!this.client) return
    if (!this.client.network.cap.isEnabled('message-tags')) return
    if (add) {
      this.client.tagmsg(target, { '+draft/react': emoji, '+draft/reply': msgid })
    } else {
      this.client.tagmsg(target, { '+draft/unreact': emoji, '+draft/reply': msgid })
    }
  }
  disconnect(): void {
    this.teardown()
  }
  isConnected(): boolean {
    return this.connected
  }
  currentNick(): string {
    return this.client?.user.nick ?? this.config.nick
  }
}
