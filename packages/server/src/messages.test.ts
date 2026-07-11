import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { storeMessage, searchMessages, getHistory, pruneOlderThan, parseSearch } from './messages.js'

beforeAll(() => ensureAppSchema(getDb()))

const base = (over: Partial<Parameters<typeof storeMessage>[1]> = {}) => ({
  networkId: 1, target: '#linux', sender: 'alice', kind: 'privmsg' as const, body: 'hello world', ts: 1000, ...over,
})

describe('parseSearch', () => {
  it('extracts in: and from: tokens', () => {
    expect(parseSearch('in:#linux from:bob kernel panic')).toEqual({ terms: 'kernel panic', target: '#linux', sender: 'bob' })
  })
  it('returns just terms when no tokens', () => {
    expect(parseSearch('hello there')).toEqual({ terms: 'hello there' })
  })
})

describe('messages store', () => {
  it('stores and searches by body', () => {
    storeMessage('u1', base({ body: 'the quick brown fox', ts: 10 }))
    const r = searchMessages('u1', 'brown')
    expect(r.length).toBe(1)
    expect(r[0]!.body).toBe('the quick brown fox')
  })

  it('isolates users', () => {
    storeMessage('uA', base({ body: 'secret alpha', ts: 20 }))
    expect(searchMessages('uB', 'alpha')).toHaveLength(0)
  })

  it('applies in:#channel and from:user filters', () => {
    storeMessage('u2', base({ target: '#python', sender: 'carol', body: 'match me', ts: 30 }))
    storeMessage('u2', base({ target: '#linux', sender: 'dave', body: 'match me', ts: 31 }))
    const r = searchMessages('u2', 'in:#python match')
    expect(r).toHaveLength(1)
    expect(r[0]!.target).toBe('#python')
  })

  it('does not crash on FTS special characters', () => {
    expect(() => searchMessages('u3', 'foo "bar OR baz*')).not.toThrow()
  })

  it('returns channel history oldest-first', () => {
    storeMessage('u4', base({ networkId: 2, target: '#c', body: 'first', ts: 100 }))
    storeMessage('u4', base({ networkId: 2, target: '#c', body: 'second', ts: 200 }))
    const h = getHistory('u4', 2, '#c')
    expect(h.map((m) => m.body)).toEqual(['first', 'second'])
  })

  it('prunes old messages from both tables', () => {
    const id = storeMessage('u5', base({ body: 'ancient', ts: 1 }))
    const del = pruneOlderThan(2)
    expect(del).toBeGreaterThanOrEqual(1)
    expect(getDb().prepare('SELECT COUNT(*) n FROM messages WHERE id = ?').get(id)).toEqual({ n: 0 })
    expect(searchMessages('u5', 'ancient')).toHaveLength(0)
  })
})
