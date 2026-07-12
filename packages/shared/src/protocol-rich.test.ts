import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('rich protocol v5', () => {
  it('is version 6', () => expect(PROTOCOL_VERSION).toBe(6))
  it('parses typing/react client messages', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'typing:set', networkId: 1, target: '#x', state: 'active' })).type).toBe('typing:set')
    expect(parseClientMessage(JSON.stringify({ type: 'react:add', networkId: 1, target: '#x', msgid: 'm1', emoji: '👍' })).type).toBe('react:add')
  })
  it('chat:send accepts optional replyTo', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'chat:send', networkId: 1, target: '#x', text: 'hi', replyTo: 'm1' }))
    expect(m).toMatchObject({ type: 'chat:send', replyTo: 'm1' })
  })
  it('parses typing/react server updates and chat:msg replyTo', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'typing:update', networkId: 1, target: '#x', nick: 'bob', state: 'active' })).type).toBe('typing:update')
    expect(parseServerMessage(JSON.stringify({ type: 'react:update', networkId: 1, target: '#x', msgid: 'm1', emoji: '👍', nick: 'bob', action: 'add' })).type).toBe('react:update')
    const cm = parseServerMessage(JSON.stringify({ type: 'chat:msg', networkId: 1, target: '#x', from: 'a', kind: 'privmsg', text: 'yo', self: false, replyTo: 'm1' }))
    expect(cm).toMatchObject({ type: 'chat:msg', replyTo: 'm1' })
  })
})
