import { create } from 'zustand'
import { PROTOCOL_VERSION, type StoredMsg, type ServerMessage } from '@bool/shared'
import { createWsClient, type WebSocketLike } from '../ws-client.js'
import type { ChatStore, ChatState, TargetKind } from './types.js'
import { uploadFile as _uploadFile } from '../upload-client.js'

export function targetKey(networkId: number, target: string): string {
  return `${networkId}:${target}`
}

const emptyState: ChatState = {
  connection: 'closed',
  networks: {},
  targets: {},
  messages: {},
  readMarkers: {},
  selected: null,
  searchResults: null,
  lastError: null,
  typing: {},
  reactions: {},
  replyingTo: null,
  previews: {},
}

let _msgIdCounter = 0
function nextMsgId(): number {
  return ++_msgIdCounter
}

function mergeMessages(existing: StoredMsg[], incoming: StoredMsg[]): StoredMsg[] {
  const seen = new Set<string>()
  const all: StoredMsg[] = []

  for (const m of existing) {
    const key = m.msgid ? `msgid:${m.msgid}` : `id:${m.id}`
    if (!seen.has(key)) {
      seen.add(key)
      all.push(m)
    }
  }

  for (const m of incoming) {
    const key = m.msgid ? `msgid:${m.msgid}` : `id:${m.id}`
    if (!seen.has(key)) {
      seen.add(key)
      all.push(m)
    }
  }

  // Sort ascending by ts
  all.sort((a, b) => a.ts - b.ts)
  // Cap to most recent 500 to prevent unbounded growth in long sessions
  return all.length > 500 ? all.slice(all.length - 500) : all
}

function inferKind(target: string): TargetKind {
  if (target === '*') return 'status'
  return target.startsWith('#') || target.startsWith('&') ? 'channel' : 'pm'
}

function reduceServerMessage(state: ChatState, msg: ServerMessage): Partial<ChatState> {
  switch (msg.type) {
    case 'net:list': {
      const networks = { ...state.networks }
      for (const net of msg.networks) {
        networks[net.id] = {
          id: net.id,
          name: net.name,
          host: net.host,
          nick: net.nick,
          connected: net.connected,
        }
      }
      return { networks }
    }

    case 'net:state': {
      const existing = state.networks[msg.networkId]
      if (!existing) return {}
      return {
        networks: {
          ...state.networks,
          [msg.networkId]: {
            ...existing,
            name: msg.name,
            nick: msg.nick ?? existing.nick,
            connected: msg.state === 'registered',
          },
        },
      }
    }

    case 'chat:msg': {
      const key = targetKey(msg.networkId, msg.target)
      const isSelected = state.selected === key
      const storedMsg: StoredMsg = {
        id: nextMsgId(),
        networkId: msg.networkId,
        target: msg.target,
        sender: msg.from,
        kind: msg.kind,
        body: msg.text,
        ts: msg.time ?? Date.now(),
        msgid: msg.msgid,
        replyTo: msg.replyTo,
      }

      const existingMessages = state.messages[key] ?? []
      const newMessages = mergeMessages(existingMessages, [storedMsg])

      const existingTarget = state.targets[key]
      const shouldBumpUnread = !msg.self && !isSelected
      const unread = (existingTarget?.unread ?? 0) + (shouldBumpUnread ? 1 : 0)

      return {
        messages: { ...state.messages, [key]: newMessages },
        targets: {
          ...state.targets,
          [key]: {
            networkId: msg.networkId,
            target: msg.target,
            kind: inferKind(msg.target),
            unread,
            names: existingTarget?.names,
            topic: existingTarget?.topic,
          },
        },
      }
    }

    case 'chan:names': {
      const key = targetKey(msg.networkId, msg.channel)
      const existing = state.targets[key]
      return {
        targets: {
          ...state.targets,
          [key]: {
            networkId: msg.networkId,
            target: msg.channel,
            kind: 'channel',
            unread: existing?.unread ?? 0,
            names: msg.users,
            topic: existing?.topic,
          },
        },
      }
    }

    case 'chan:topic': {
      const key = targetKey(msg.networkId, msg.channel)
      const existing = state.targets[key]
      return {
        targets: {
          ...state.targets,
          [key]: {
            networkId: msg.networkId,
            target: msg.channel,
            kind: 'channel',
            unread: existing?.unread ?? 0,
            names: existing?.names,
            topic: msg.topic,
          },
        },
      }
    }

    case 'chan:join': {
      const key = targetKey(msg.networkId, msg.channel)
      const existing = state.targets[key]
      if (msg.self) {
        // We joined the channel — ensure target exists
        return {
          targets: {
            ...state.targets,
            [key]: existing ?? {
              networkId: msg.networkId,
              target: msg.channel,
              kind: 'channel' as TargetKind,
              unread: 0,
            },
          },
        }
      }
      // Someone else joined — add them to the names list
      if (!existing) return {}
      const names = [...(existing.names ?? []), { nick: msg.nick, modes: [] }]
      return {
        targets: {
          ...state.targets,
          [key]: { ...existing, names },
        },
      }
    }

    case 'chan:part': {
      const key = targetKey(msg.networkId, msg.channel)
      const existing = state.targets[key]
      if (!existing) return {}
      const names = (existing.names ?? []).filter((n) => n.nick !== msg.nick)
      return {
        targets: {
          ...state.targets,
          [key]: { ...existing, names },
        },
      }
    }

    case 'presence:quit': {
      // Remove the nick from all targets in this network
      const targets = { ...state.targets }
      for (const [key, t] of Object.entries(targets)) {
        if (t.networkId === msg.networkId && t.names) {
          targets[key] = { ...t, names: t.names.filter((n) => n.nick !== msg.nick) }
        }
      }
      return { targets }
    }

    case 'presence:nick': {
      // Rename the nick in all targets in this network
      const targets = { ...state.targets }
      for (const [key, t] of Object.entries(targets)) {
        if (t.networkId === msg.networkId && t.names) {
          targets[key] = {
            ...t,
            names: t.names.map((n) => n.nick === msg.oldNick ? { ...n, nick: msg.newNick } : n),
          }
        }
      }
      return { targets }
    }

    case 'read:list': {
      const readMarkers = { ...state.readMarkers }
      for (const m of msg.markers) {
        readMarkers[targetKey(m.networkId, m.target)] = m.ts
      }
      return { readMarkers }
    }

    case 'read:update': {
      const key = targetKey(msg.networkId, msg.target)
      return {
        readMarkers: { ...state.readMarkers, [key]: msg.ts },
      }
    }

    case 'net:error': {
      return {
        lastError: { networkId: msg.networkId, message: msg.message },
      }
    }

    case 'search:results': {
      return {
        searchResults: { query: msg.query, results: msg.results },
      }
    }

    case 'history:batch': {
      const key = targetKey(msg.networkId, msg.target)
      const existing = state.messages[key] ?? []
      return {
        messages: { ...state.messages, [key]: mergeMessages(existing, msg.messages) },
      }
    }

    case 'typing:update': {
      const key = targetKey(msg.networkId, msg.target)
      const targetTyping = { ...(state.typing[key] ?? {}) }
      if (msg.state === 'active') {
        targetTyping[msg.nick] = Date.now()
      } else {
        delete targetTyping[msg.nick]
      }
      return {
        typing: { ...state.typing, [key]: targetTyping },
      }
    }

    case 'react:update': {
      const msgReactions = { ...(state.reactions[msg.msgid] ?? {}) }
      if (msg.action === 'add') {
        const nicks = msgReactions[msg.emoji] ?? []
        if (!nicks.includes(msg.nick)) {
          msgReactions[msg.emoji] = [...nicks, msg.nick]
        }
      } else {
        const nicks = (msgReactions[msg.emoji] ?? []).filter((n) => n !== msg.nick)
        if (nicks.length > 0) {
          msgReactions[msg.emoji] = nicks
        } else {
          delete msgReactions[msg.emoji]
        }
      }
      const reactions = { ...state.reactions }
      if (Object.keys(msgReactions).length > 0) {
        reactions[msg.msgid] = msgReactions
      } else {
        delete reactions[msg.msgid]
      }
      return { reactions }
    }

    case 'preview:result': {
      if (!msg.ok) return {}
      return {
        previews: {
          ...state.previews,
          [msg.url]: {
            type: 'preview:result' as const,
            url: msg.url,
            ok: true as const,
            title: msg.title,
            description: msg.description,
            image: msg.image,
            siteName: msg.siteName,
          },
        },
      }
    }

    default:
      return {}
  }
}

// Module-level WsClient send reference — replaced on each init()
let _send: ((msg: import('@bool/shared').ClientMessage) => void) | null = null

function createActions(
  set: (partial: Partial<ChatStore> | ((s: ChatStore) => Partial<ChatStore>)) => void,
  get: () => ChatStore,
): Omit<ChatStore, keyof ChatState> {
  return {
    init(socketFactory?: (url: string) => WebSocketLike) {
      // Reset data state, keep connection=connecting
      set({ ...emptyState, connection: 'connecting' })
      _send = null

      const client = createWsClient({ url: '/ws', socketFactory })
      _send = (msg) => client.send(msg)

      client.onOpen(() => set({ connection: 'open' }))
      client.onClose(() => set({ connection: 'closed' }))

      client.onMessage((msg: ServerMessage) => {
        set((state) => reduceServerMessage(state, msg))
      })

      // Send hello (ws-client queues it until open)
      client.send({ type: 'hello', clientVersion: PROTOCOL_VERSION })
    },

    addNetwork(input) {
      _send?.({ type: 'net:add', ...input })
    },

    removeNetwork(id: number) {
      _send?.({ type: 'net:remove', networkId: id })
    },

    connectNetwork(id: number) {
      _send?.({ type: 'net:connect', networkId: id })
    },

    join(networkId: number, channel: string) {
      _send?.({ type: 'chan:join', networkId, channel })
    },

    part(networkId: number, channel: string) {
      _send?.({ type: 'chan:part', networkId, channel })
    },

    sendAction(text: string) {
      const { selected } = get()
      if (!selected) return
      const colonIdx = selected.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(selected.slice(0, colonIdx))
      const target = selected.slice(colonIdx + 1)
      _send?.({ type: 'chat:send', networkId, target, text, action: true })
    },

    setNick(networkId: number, nick: string) {
      _send?.({ type: 'user:nick', networkId, nick })
    },

    setTopic(networkId: number, channel: string, topic: string) {
      _send?.({ type: 'chan:topic:set', networkId, channel, topic })
    },

    whois(networkId: number, nick: string) {
      _send?.({ type: 'user:whois', networkId, nick })
    },

    kick(networkId: number, channel: string, nick: string, reason?: string) {
      _send?.({ type: 'chan:kick', networkId, channel, nick, ...(reason ? { reason } : {}) })
    },

    setMode(networkId: number, target: string, modes: string, args?: string) {
      _send?.({ type: 'chan:mode', networkId, target, modes, ...(args ? { args } : {}) })
    },

    listChannels(networkId: number, filter?: string) {
      _send?.({ type: 'chan:list', networkId, ...(filter ? { filter } : {}) })
    },

    messageUser(networkId: number, nick: string, text: string) {
      const key = targetKey(networkId, nick)
      set((state) => ({
        selected: key,
        targets: {
          ...state.targets,
          [key]: state.targets[key] ?? { networkId, target: nick, kind: 'pm', unread: 0 },
        },
      }))
      _send?.({ type: 'chat:send', networkId, target: nick, text })
    },

    select(key: string) {
      set({ selected: key })
      // Clear unread for the selected target
      const targets = get().targets
      const t = targets[key]
      if (t && t.unread > 0) {
        set({ targets: { ...targets, [key]: { ...t, unread: 0 } } })
      }
    },

    send(text: string) {
      const { selected } = get()
      if (!selected) return
      const colonIdx = selected.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(selected.slice(0, colonIdx))
      const target = selected.slice(colonIdx + 1)
      _send?.({ type: 'chat:send', networkId, target, text })
    },

    search(query: string) {
      _send?.({ type: 'chat:search', query })
    },

    loadHistory(key: string) {
      const colonIdx = key.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(key.slice(0, colonIdx))
      const target = key.slice(colonIdx + 1)
      const msgs = get().messages[key] ?? []
      const before = msgs.length > 0 ? msgs[0]!.ts : undefined
      _send?.({ type: 'history:request', networkId, target, before })
    },

    markRead(key: string, ts: number) {
      const colonIdx = key.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(key.slice(0, colonIdx))
      const target = key.slice(colonIdx + 1)
      _send?.({ type: 'read:set', networkId, target, ts })

      set((state) => {
        const t = state.targets[key]
        return {
          readMarkers: { ...state.readMarkers, [key]: ts },
          targets: t
            ? { ...state.targets, [key]: { ...t, unread: 0 } }
            : state.targets,
        }
      })
    },

    setTyping(key: string, state: 'active' | 'done') {
      const colonIdx = key.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(key.slice(0, colonIdx))
      const target = key.slice(colonIdx + 1)
      _send?.({ type: 'typing:set', networkId, target, state })
    },

    react(msgid: string, emoji: string, add: boolean) {
      // Search messages to find which network/target this message belongs to
      const messages = get().messages
      for (const [key, msgs] of Object.entries(messages)) {
        const found = msgs.find((m) => m.msgid === msgid)
        if (found) {
          const colonIdx = key.indexOf(':')
          if (colonIdx === -1) return
          const networkId = Number(key.slice(0, colonIdx))
          const target = key.slice(colonIdx + 1)
          if (add) {
            _send?.({ type: 'react:add', networkId, target, msgid, emoji })
          } else {
            _send?.({ type: 'react:remove', networkId, target, msgid, emoji })
          }
          return
        }
      }
    },

    sendReply(text: string, replyToMsgid: string) {
      const { selected } = get()
      if (!selected) return
      const colonIdx = selected.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(selected.slice(0, colonIdx))
      const target = selected.slice(colonIdx + 1)
      _send?.({ type: 'chat:send', networkId, target, text, replyTo: replyToMsgid })
    },

    setReplyTarget(msgid: string | null) {
      set({ replyingTo: msgid })
    },

    async uploadFile(file: File): Promise<string | null> {
      return _uploadFile(file)
    },
  }
}

export const useChat = create<ChatStore>((set, get) => ({
  ...emptyState,
  ...createActions(set, get),
}))

// Expose for test resets: returns full store (state + actions) so
// useChat.setState(useChat.getInitialState(), true) works correctly.
;(useChat as any).getInitialState = () => ({
  ...emptyState,
  ...createActions(
    (partial) => useChat.setState(partial as Partial<ChatStore>),
    () => useChat.getState(),
  ),
})
