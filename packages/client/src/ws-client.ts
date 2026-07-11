import { parseServerMessage, type ClientMessage, type ServerMessage } from '@bool/shared'

export interface WebSocketLike {
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close', cb: (ev: unknown) => void): void
}

export interface WsClient {
  send(msg: ClientMessage): void
  onMessage(cb: (msg: ServerMessage) => void): void
  onOpen(cb: () => void): void
  onClose(cb: () => void): void
  close(): void
}

export function createWsClient(opts: {
  url: string
  socketFactory?: (url: string) => WebSocketLike
}): WsClient {
  const factory = opts.socketFactory ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike)
  const sock = factory(opts.url)
  const handlers: ((msg: ServerMessage) => void)[] = []
  const openHandlers: (() => void)[] = []
  const closeHandlers: (() => void)[] = []
  let isOpen = false
  const queue: string[] = []

  sock.addEventListener('open', () => {
    isOpen = true
    for (const json of queue) {
      sock.send(json)
    }
    queue.length = 0
    openHandlers.forEach((h) => h())
  })

  sock.addEventListener('close', () => {
    isOpen = false
    closeHandlers.forEach((h) => h())
  })

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
    send: (msg) => {
      const json = JSON.stringify(msg)
      if (isOpen) {
        sock.send(json)
      } else {
        queue.push(json)
      }
    },
    onMessage: (cb) => handlers.push(cb),
    onOpen: (cb) => openHandlers.push(cb),
    onClose: (cb) => closeHandlers.push(cb),
    close: () => sock.close(),
  }
}
