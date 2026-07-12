import { describe, it, expect } from 'vitest'
import { parseClientMessage, PROTOCOL_VERSION } from './protocol.js'

describe('command protocol', () => {
  it('bumped protocol version', () => expect(PROTOCOL_VERSION).toBe(7))
  it('chat:send accepts action flag', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chat:send', networkId: 1, target: '#x', text: 'hi', action: true }))).toMatchObject({ action: true }))
  it('user:nick', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'user:nick', networkId: 1, nick: 'neo' })).type).toBe('user:nick'))
  it('chan:topic:set', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:topic:set', networkId: 1, channel: '#x', topic: 't' })).type).toBe('chan:topic:set'))
  it('chan:kick', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:kick', networkId: 1, channel: '#x', nick: 'bob' })).type).toBe('chan:kick'))
  it('chan:mode', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:mode', networkId: 1, target: '#x', modes: '+o', args: 'bob' })).type).toBe('chan:mode'))
  it('user:whois', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'user:whois', networkId: 1, nick: 'bob' })).type).toBe('user:whois'))
  it('chan:list', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:list', networkId: 1 })).type).toBe('chan:list'))
})
