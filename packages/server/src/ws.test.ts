import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import { buildApp } from './app.js'
import type { FastifyInstance } from 'fastify'
import { PROTOCOL_VERSION } from '@bool/shared'

let app: FastifyInstance
let url: string

beforeAll(async () => {
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  url = `ws://127.0.0.1:${addr.port}/ws`
})

afterAll(async () => {
  await app.close()
})

function once<T>(ws: WebSocket, send: object): Promise<T> {
  return new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify(send)))
    ws.on('message', (data) => {
      resolve(JSON.parse(data.toString()) as T)
      ws.close()
    })
    ws.on('error', reject)
  })
}

describe('websocket /ws', () => {
  it('replies welcome to hello', async () => {
    const reply = await once<{ type: string; protocolVersion: number }>(new WebSocket(url), {
      type: 'hello',
      clientVersion: 1,
    })
    expect(reply.type).toBe('welcome')
    expect(reply.protocolVersion).toBe(PROTOCOL_VERSION)
  })

  it('replies pong echoing t', async () => {
    const reply = await once<{ type: string; t: number }>(new WebSocket(url), {
      type: 'ping',
      t: 42,
    })
    expect(reply).toMatchObject({ type: 'pong', t: 42 })
  })

  it('replies error on garbage', async () => {
    const reply = await once<{ type: string }>(new WebSocket(url), { type: 'garbage' })
    expect(reply.type).toBe('error')
  })
})
