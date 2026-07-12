import { describe, it, expect } from 'vitest'
import { parseCommand, normalizeChannel } from './commands.js'

const chanCtx = { activeTarget: '1:#dev', isChannel: true }
const pmCtx = { activeTarget: '1:bob', isChannel: false }

describe('normalizeChannel', () => {
  it('prefixes # when missing', () => expect(normalizeChannel('dev')).toBe('#dev'))
  it('keeps existing # or &', () => {
    expect(normalizeChannel('#dev')).toBe('#dev')
    expect(normalizeChannel('&local')).toBe('&local')
  })
})

describe('parseCommand', () => {
  it('plain text is text', () => expect(parseCommand('hi there', chanCtx)).toEqual({ kind: 'text', text: 'hi there' }))
  it('// escapes a leading slash', () => expect(parseCommand('//not a cmd', chanCtx)).toEqual({ kind: 'text', text: '/not a cmd' }))
  it('/me -> action', () => expect(parseCommand('/me waves', chanCtx)).toEqual({ kind: 'action', text: 'waves' }))
  it('/join normalizes channel', () => expect(parseCommand('/join dev', chanCtx)).toEqual({ kind: 'join', channel: '#dev' }))
  it('/join without arg errors', () => expect(parseCommand('/join', chanCtx).kind).toBe('error'))
  it('/part with reason on a channel', () => expect(parseCommand('/part bye all', chanCtx)).toEqual({ kind: 'part', reason: 'bye all' }))
  it('/part off-channel errors', () => expect(parseCommand('/part', pmCtx).kind).toBe('error'))
  it('/msg splits nick and text', () => expect(parseCommand('/msg bob hey you', chanCtx)).toEqual({ kind: 'msg', nick: 'bob', text: 'hey you' }))
  it('/query is an alias for /msg', () => expect(parseCommand('/query bob hi', chanCtx)).toEqual({ kind: 'msg', nick: 'bob', text: 'hi' }))
  it('/nick', () => expect(parseCommand('/nick newnick', chanCtx)).toEqual({ kind: 'nick', nick: 'newnick' }))
  it('/topic on a channel', () => expect(parseCommand('/topic new topic', chanCtx)).toEqual({ kind: 'topic', topic: 'new topic' }))
  it('/topic off-channel errors', () => expect(parseCommand('/topic x', pmCtx).kind).toBe('error'))
  it('/whois', () => expect(parseCommand('/whois bob', chanCtx)).toEqual({ kind: 'whois', nick: 'bob' }))
  it('/kick with reason', () => expect(parseCommand('/kick bob spamming', chanCtx)).toEqual({ kind: 'kick', nick: 'bob', reason: 'spamming' }))
  it('/kick off-channel errors', () => expect(parseCommand('/kick bob', pmCtx).kind).toBe('error'))
  it('/mode flags and args', () => expect(parseCommand('/mode +o bob', chanCtx)).toEqual({ kind: 'mode', modes: '+o', args: 'bob' }))
  it('/mode flags only', () => expect(parseCommand('/mode +m', chanCtx)).toEqual({ kind: 'mode', modes: '+m' }))
  it('/list with filter', () => expect(parseCommand('/list *rust*', chanCtx)).toEqual({ kind: 'list', filter: '*rust*' }))
  it('/list no filter', () => expect(parseCommand('/list', chanCtx)).toEqual({ kind: 'list' }))
  it('unknown command errors', () => expect(parseCommand('/frobnicate x', chanCtx).kind).toBe('error'))
})
