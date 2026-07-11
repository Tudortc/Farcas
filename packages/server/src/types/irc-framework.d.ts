// Hand-written type stubs pinned to irc-framework@4.14.0.
// If you upgrade irc-framework, verify these types still match.
declare module 'irc-framework' {
  import { EventEmitter } from 'node:events'

  export interface ConnectOptions {
    host: string
    port: number
    tls?: boolean
    ssl?: boolean
    nick: string
    username?: string
    gecos?: string
    password?: string
    account?: { account: string; password: string }
    enable_echomessage?: boolean
    auto_reconnect?: boolean
    auto_reconnect_max_retries?: number
    auto_reconnect_max_wait?: number
  }

  export class Client extends EventEmitter {
    user: { nick: string }
    network: { name: string; cap: { enabled: string[]; isEnabled(c: string): boolean } }
    connect(options: ConnectOptions): void
    say(target: string, message: string, tags?: Record<string, string>): void
    tagmsg(target: string, tags: Record<string, string>): void
    notice(target: string, message: string): void
    join(channel: string, key?: string): void
    part(channel: string, message?: string): void
    changeNick(nick: string): void
    quit(message?: string): void
    raw(...args: unknown[]): void
  }

  export function ircLineParser(line: string): unknown
}
