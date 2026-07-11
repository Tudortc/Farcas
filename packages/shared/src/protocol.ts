import { z } from 'zod'

export const PROTOCOL_VERSION = 4

// --- Client -> Server ---
export const helloSchema = z.object({ type: z.literal('hello'), clientVersion: z.number().int() })
export const pingSchema = z.object({ type: z.literal('ping'), t: z.number() })

// --- IRC: Client -> Server ---
export const netAddSchema = z.object({
  type: z.literal('net:add'),
  name: z.string(),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  tls: z.boolean(),
  nick: z.string(),
  username: z.string().optional(),
  realname: z.string().optional(),
  saslAccount: z.string().optional(),
  saslPassword: z.string().optional(),
})
export const netRemoveSchema = z.object({ type: z.literal('net:remove'), networkId: z.number().int() })
export const netConnectSchema = z.object({ type: z.literal('net:connect'), networkId: z.number().int() })
export const netDisconnectSchema = z.object({ type: z.literal('net:disconnect'), networkId: z.number().int() })
export const netListReqSchema = z.object({ type: z.literal('net:list') })
export const chanJoinSchema = z.object({ type: z.literal('chan:join'), networkId: z.number().int(), channel: z.string() })
export const chanPartSchema = z.object({ type: z.literal('chan:part'), networkId: z.number().int(), channel: z.string() })
export const chatSendSchema = z.object({ type: z.literal('chat:send'), networkId: z.number().int(), target: z.string(), text: z.string() })
export const chatSearchSchema = z.object({ type: z.literal('chat:search'), query: z.string(), limit: z.number().int().optional() })
export const historyRequestSchema = z.object({
  type: z.literal('history:request'),
  networkId: z.number().int(),
  target: z.string(),
  limit: z.number().int().optional(),
  before: z.number().optional(),
})

export const readSetSchema = z.object({ type: z.literal('read:set'), networkId: z.number().int(), target: z.string(), ts: z.number() })
export const readListReqSchema = z.object({ type: z.literal('read:list') })

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloSchema, pingSchema,
  netAddSchema, netRemoveSchema, netConnectSchema, netDisconnectSchema, netListReqSchema,
  chanJoinSchema, chanPartSchema, chatSendSchema, chatSearchSchema, historyRequestSchema,
  readSetSchema, readListReqSchema,
])
export type ClientMessage = z.infer<typeof clientMessageSchema>

// --- Server -> Client ---
export const welcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int(),
  serverTime: z.number(),
})
export const pongSchema = z.object({ type: z.literal('pong'), t: z.number() })
export const errorSchema = z.object({ type: z.literal('error'), message: z.string() })

// --- IRC: Server -> Client ---
export const netStateSchema = z.object({
  type: z.literal('net:state'),
  networkId: z.number().int(),
  name: z.string(),
  state: z.enum(['connecting', 'registered', 'reconnecting', 'closed']),
  nick: z.string().optional(),
})
export const netListSchema = z.object({
  type: z.literal('net:list'),
  networks: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      host: z.string(),
      port: z.number().int(),
      tls: z.boolean(),
      nick: z.string(),
      connected: z.boolean(),
    }),
  ),
})
export const netErrorSchema = z.object({ type: z.literal('net:error'), networkId: z.number().int(), message: z.string() })
export const chatMsgSchema = z.object({
  type: z.literal('chat:msg'),
  networkId: z.number().int(),
  target: z.string(),
  from: z.string(),
  kind: z.enum(['privmsg', 'notice', 'action']),
  text: z.string(),
  self: z.boolean(),
  msgid: z.string().optional(),
  time: z.number().optional(),
  account: z.string().optional(),
})
export const chanNamesSchema = z.object({
  type: z.literal('chan:names'),
  networkId: z.number().int(),
  channel: z.string(),
  users: z.array(z.object({ nick: z.string(), modes: z.array(z.string()) })),
})
export const chanJoinEvtSchema = z.object({ type: z.literal('chan:join'), networkId: z.number().int(), channel: z.string(), nick: z.string(), self: z.boolean() })
export const chanPartEvtSchema = z.object({ type: z.literal('chan:part'), networkId: z.number().int(), channel: z.string(), nick: z.string(), reason: z.string().optional() })
export const chanTopicSchema = z.object({ type: z.literal('chan:topic'), networkId: z.number().int(), channel: z.string(), topic: z.string() })
export const presenceQuitSchema = z.object({ type: z.literal('presence:quit'), networkId: z.number().int(), nick: z.string(), reason: z.string().optional() })
export const presenceNickSchema = z.object({ type: z.literal('presence:nick'), networkId: z.number().int(), oldNick: z.string(), newNick: z.string() })

export const storedMsgSchema = z.object({
  id: z.number().int(),
  networkId: z.number().int(),
  target: z.string(),
  sender: z.string(),
  kind: z.enum(['privmsg', 'notice', 'action']),
  body: z.string(),
  ts: z.number(),
  msgid: z.string().optional(),
})
export type StoredMsg = z.infer<typeof storedMsgSchema>

export const searchResultsSchema = z.object({ type: z.literal('search:results'), query: z.string(), results: z.array(storedMsgSchema) })
export const historyBatchSchema = z.object({ type: z.literal('history:batch'), networkId: z.number().int(), target: z.string(), messages: z.array(storedMsgSchema) })

export const readUpdateSchema = z.object({ type: z.literal('read:update'), networkId: z.number().int(), target: z.string(), ts: z.number() })
export const readListSchema = z.object({
  type: z.literal('read:list'),
  markers: z.array(z.object({ networkId: z.number().int(), target: z.string(), ts: z.number() })),
})

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema, pongSchema, errorSchema,
  netStateSchema, netListSchema, netErrorSchema,
  chatMsgSchema, chanNamesSchema, chanJoinEvtSchema, chanPartEvtSchema, chanTopicSchema,
  presenceQuitSchema, presenceNickSchema,
  searchResultsSchema, historyBatchSchema,
  readUpdateSchema, readListSchema,
])
export type ServerMessage = z.infer<typeof serverMessageSchema>

export function parseClientMessage(raw: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(raw))
}

export function parseServerMessage(raw: string): ServerMessage {
  return serverMessageSchema.parse(JSON.parse(raw))
}
