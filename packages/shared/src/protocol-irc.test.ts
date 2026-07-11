import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('irc protocol messages', () => {
  it('bumped PROTOCOL_VERSION to 3', () => {
    expect(PROTOCOL_VERSION).toBe(3)
  })

  it('parses net:add', () => {
    const m = parseClientMessage(
      JSON.stringify({ type: 'net:add', name: 'Libera', host: 'irc.libera.chat', port: 6697, tls: true, nick: 'bool' }),
    )
    expect(m.type).toBe('net:add')
  })

  it('parses chat:send and chan:join', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'chat:send', networkId: 1, target: '#x', text: 'hi' })).type).toBe('chat:send')
    expect(parseClientMessage(JSON.stringify({ type: 'chan:join', networkId: 1, channel: '#x' })).type).toBe('chan:join')
  })

  it('parses server chat:msg with optional tags', () => {
    const m = parseServerMessage(
      JSON.stringify({ type: 'chat:msg', networkId: 1, target: '#x', from: 'bob', kind: 'privmsg', text: 'yo', self: false, msgid: 'abc', time: 123 }),
    )
    expect(m).toMatchObject({ type: 'chat:msg', from: 'bob', kind: 'privmsg' })
  })

  it('parses net:state and chan:names', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'net:state', networkId: 1, name: 'Libera', state: 'registered', nick: 'bool' })).type).toBe('net:state')
    expect(
      parseServerMessage(JSON.stringify({ type: 'chan:names', networkId: 1, channel: '#x', users: [{ nick: 'bob', modes: ['o'] }] })).type,
    ).toBe('chan:names')
  })

  it('rejects an unknown type and a malformed net:add', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'net:nope' }))).toThrow()
    expect(() => parseClientMessage(JSON.stringify({ type: 'net:add', name: 'x' }))).toThrow()
  })
})
