import type { StoredMsg } from '@bool/shared'

export interface PreviewResult {
  type: 'preview:result'
  url: string
  ok: true
  title?: string
  description?: string
  image?: string
  siteName?: string
}

export type ConnectionState = 'connecting' | 'open' | 'closed'

export type TargetKind = 'channel' | 'pm'

export interface NameEntry {
  nick: string
  modes: string[]
}

export interface TargetState {
  networkId: number
  target: string
  kind: TargetKind
  unread: number
  names?: NameEntry[]
  topic?: string
}

export interface NetworkState {
  id: number
  name: string
  host: string
  nick: string
  connected: boolean
}

export interface SearchResults {
  query: string
  results: StoredMsg[]
}

export interface ChatState {
  connection: ConnectionState
  networks: Record<number, NetworkState>
  targets: Record<string, TargetState>
  messages: Record<string, StoredMsg[]>
  readMarkers: Record<string, number>
  selected: string | null
  searchResults: SearchResults | null
  lastError: { networkId: number; message: string } | null
  /** targetKey → nick → last-active timestamp (Date.now()) */
  typing: Record<string, Record<string, number>>
  /** msgid → emoji → nicks[] */
  reactions: Record<string, Record<string, string[]>>
  /** The msgid of the message currently being replied to, or null */
  replyingTo: string | null
  /** url → PreviewResult (only ok:true results stored) */
  previews: Record<string, PreviewResult>
}

export interface ChatActions {
  init(socketFactory?: (url: string) => import('../ws-client.js').WebSocketLike): void
  addNetwork(input: {
    name: string
    host: string
    port: number
    tls: boolean
    nick: string
    username?: string
    realname?: string
    saslAccount?: string
    saslPassword?: string
  }): void
  removeNetwork(id: number): void
  connectNetwork(id: number): void
  join(networkId: number, channel: string): void
  part(networkId: number, channel: string): void
  select(targetKey: string): void
  send(text: string): void
  search(query: string): void
  loadHistory(targetKey: string): void
  markRead(targetKey: string, ts: number): void
  /** Send typing:set for a target (parsed from targetKey). Does not display own typing locally. */
  setTyping(targetKey: string, state: 'active' | 'done'): void
  /** Find the message by msgid and send react:add or react:remove. */
  react(msgid: string, emoji: string, add: boolean): void
  /** Send chat:send with replyTo set to replyToMsgid, using the currently selected target. */
  sendReply(text: string, replyToMsgid: string): void
  /** Set the msgid of the message being replied to (null to clear). */
  setReplyTarget(msgid: string | null): void
  /** Upload a file to /api/upload and return the media URL, or null on failure. */
  uploadFile(file: File): Promise<string | null>
}

export type ChatStore = ChatState & ChatActions
