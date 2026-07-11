import { parseServerMessage, type ClientMessage, type ServerMessage } from '@bool/shared'

export interface WebSocketLike {
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close', cb: (ev: unknown) => void): void
}

export interface WsClient {
  send(msg: ClientMessage): void
  onMessage(cb: (msg: ServerMessage) => void): void
  close(): void
}

export function createWsClient(opts: {
  url: string
  socketFactory?: (url: string) => WebSocketLike
}): WsClient {
  const factory = opts.socketFactory ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike)
  const sock = factory(opts.url)
  const handlers: ((msg: ServerMessage) => void)[] = []

  sock.addEventListener('message', (ev) => {
    const data = (ev as { data: string }).data
    let msg: ServerMessage
    try {
      msg = parseServerMessage(data)
    } catch {
      return
    }
    handlers.forEach((h) => h(msg))
  })

  return {
    send: (msg) => sock.send(JSON.stringify(msg)),
    onMessage: (cb) => handlers.push(cb),
    close: () => sock.close(),
  }
}
