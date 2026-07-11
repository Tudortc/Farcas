import type { StoredMsg } from '@bool/shared'

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
  connectNetwork(id: number): void
  join(networkId: number, channel: string): void
  part(networkId: number, channel: string): void
  select(targetKey: string): void
  send(text: string): void
  search(query: string): void
  loadHistory(targetKey: string): void
  markRead(targetKey: string, ts: number): void
}

export type ChatStore = ChatState & ChatActions
