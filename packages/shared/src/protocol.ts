import { z } from 'zod'

export const PROTOCOL_VERSION = 1

// --- Client -> Server ---
export const helloSchema = z.object({ type: z.literal('hello'), clientVersion: z.number().int() })
export const pingSchema = z.object({ type: z.literal('ping'), t: z.number() })

export const clientMessageSchema = z.discriminatedUnion('type', [helloSchema, pingSchema])
export type ClientMessage = z.infer<typeof clientMessageSchema>

// --- Server -> Client ---
export const welcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int(),
  serverTime: z.number(),
})
export const pongSchema = z.object({ type: z.literal('pong'), t: z.number() })
export const errorSchema = z.object({ type: z.literal('error'), message: z.string() })

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema,
  pongSchema,
  errorSchema,
])
export type ServerMessage = z.infer<typeof serverMessageSchema>

export function parseClientMessage(raw: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(raw))
}

export function parseServerMessage(raw: string): ServerMessage {
  return serverMessageSchema.parse(JSON.parse(raw))
}
