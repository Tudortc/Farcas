import { describe, it, expect, vi } from 'vitest'
import { maybeNotify } from './notifier.js'
import type { ServerMessage } from '@bool/shared'

function dmMsg(overrides: Partial<Extract<ServerMessage, { type: 'chat:msg' }>> = {}): Extract<ServerMessage, { type: 'chat:msg' }> {
  return {
    type: 'chat:msg',
    networkId: 1,
    target: 'alice',   // will be set to selfNick in tests
    from: 'bob',
    kind: 'privmsg',
    text: 'hey there',
    self: false,
    ...overrides,
  }
}

function chanMsg(overrides: Partial<Extract<ServerMessage, { type: 'chat:msg' }>> = {}): Extract<ServerMessage, { type: 'chat:msg' }> {
  return {
    type: 'chat:msg',
    networkId: 1,
    target: '#general',
    from: 'bob',
    kind: 'privmsg',
    text: 'hey alice how are you',
    self: false,
    ...overrides,
  }
}

describe('maybeNotify', () => {
  it('fires push for a DM (target === selfNick) with 0 active sockets', async () => {
    const send = vi.fn().mockResolvedValue(1)
    const msg = dmMsg({ target: 'alice' })
    const fired = await maybeNotify('user1', msg, { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(true)
    expect(send).toHaveBeenCalledOnce()
    const [calledUserId, payload] = send.mock.calls[0]!
    expect(calledUserId).toBe('user1')
    // DM: title = from (sender)
    expect(payload.title).toBe('bob')
    expect(payload.body).toContain('bob')
    expect(payload.tag).toBe('1:alice')
    expect(payload.data).toEqual({ networkId: 1, target: 'alice' })
  })

  it('fires push for a channel message mentioning selfNick as a whole word with 0 sockets', async () => {
    const send = vi.fn().mockResolvedValue(1)
    const msg = chanMsg({ text: 'hey alice how are you' })
    const fired = await maybeNotify('user1', msg, { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(true)
    expect(send).toHaveBeenCalledOnce()
    const [calledUserId, payload] = send.mock.calls[0]!
    expect(calledUserId).toBe('user1')
    // Channel mention: title = channel name
    expect(payload.title).toBe('#general')
    expect(payload.body).toContain('bob')
    expect(payload.tag).toBe('1:#general')
    expect(payload.data).toEqual({ networkId: 1, target: '#general' })
  })

  it('does NOT fire push when activeSockets > 0 (user has active socket)', async () => {
    const send = vi.fn()
    const fired = await maybeNotify('user1', chanMsg({ text: 'hey alice how are you' }), { selfNick: 'alice', activeSockets: 1, send })
    expect(fired).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT fire push for a self message', async () => {
    const send = vi.fn()
    const fired = await maybeNotify('user1', dmMsg({ target: 'alice', self: true }), { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT fire push for a channel message that does NOT mention selfNick', async () => {
    const send = vi.fn()
    const fired = await maybeNotify('user1', chanMsg({ text: 'hey bob how are you' }), { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT fire for a substring match like selfNickington (not a whole word)', async () => {
    const send = vi.fn()
    const fired = await maybeNotify('user1', chanMsg({ text: 'alicington was here' }), { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT fire for a leading-prefix match like "alicebot"', async () => {
    const send = vi.fn()
    const fired = await maybeNotify('user1', chanMsg({ text: 'alicebot says hi' }), { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('fires for a mention with mixed case (case-insensitive)', async () => {
    const send = vi.fn().mockResolvedValue(1)
    const fired = await maybeNotify('user1', chanMsg({ text: 'ALICE are you there?' }), { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(true)
    expect(send).toHaveBeenCalledOnce()
  })

  it('truncates long messages to ~120 chars in body', async () => {
    const send = vi.fn().mockResolvedValue(1)
    const longText = 'a'.repeat(200)
    const fired = await maybeNotify('user1', dmMsg({ target: 'alice', text: longText }), { selfNick: 'alice', activeSockets: 0, send })
    expect(fired).toBe(true)
    const payload = send.mock.calls[0]![1]
    expect(payload.body.length).toBeLessThanOrEqual(124) // "bob: " (5) + 120 + possible ellipsis
  })

  it('uses sendPushToUser as default send fn (does not throw when push not configured)', async () => {
    // Just ensure it does not crash when send is omitted and push is not configured
    const msg = dmMsg({ target: 'alice' })
    const fired = await maybeNotify('user1', msg, { selfNick: 'alice', activeSockets: 0 })
    // isPushConfigured() is false in test env, so sendPushToUser returns 0 → fired still true (send was called, returned 0)
    expect(fired).toBe(true)
  })

  it('resolves to true even when the injected send rejects', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'))
    const msg = dmMsg({ target: 'alice' })
    await expect(maybeNotify('user1', msg, { selfNick: 'alice', activeSockets: 0, send })).resolves.toBe(true)
  })
})
