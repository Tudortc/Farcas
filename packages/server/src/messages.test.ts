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

  it('storeMessage: row is findable via both searchMessages (FTS) and getHistory (base table)', () => {
    const id = storeMessage('uFTS', base({ body: 'unique fts probe text', ts: 5000 }))
    expect(id).toBeGreaterThan(0)
    // FTS path
    const found = searchMessages('uFTS', 'probe')
    expect(found).toHaveLength(1)
    expect(found[0]!.body).toBe('unique fts probe text')
    // base-table path
    const hist = getHistory('uFTS', 1, '#linux')
    expect(hist.some((m) => m.id === id)).toBe(true)
  })

  it('pruneOlderThan: row is gone from both searchMessages and getHistory', () => {
    const id = storeMessage('uPRUNE', base({ body: 'old news item', ts: 10 }))
    expect(id).toBeGreaterThan(0)
    const del = pruneOlderThan(11)
    expect(del).toBeGreaterThanOrEqual(1)
    expect(searchMessages('uPRUNE', 'old news')).toHaveLength(0)
    expect(getHistory('uPRUNE', 1, '#linux')).toHaveLength(0)
  })

  it('FTS integrity-check passes after store+prune cycle', () => {
    storeMessage('uINT', base({ body: 'integrity test body', ts: 20 }))
    pruneOlderThan(21)
    expect(() => {
      getDb().prepare("INSERT INTO messages_fts(messages_fts) VALUES('integrity-check')").run()
    }).not.toThrow()
  })

  it('user-scope injection: adversarial queries as uY cannot see messages stored for uX', () => {
    storeMessage('uX', base({ body: 'private data for uX', ts: 9000 }))
    // Adversarial queries that could attempt to escape user scope via FTS or SQL
    expect(searchMessages('uY', '" OR 1=1 --')).toEqual([])
    expect(searchMessages('uY', 'from:uX* *')).toEqual([])
    expect(searchMessages('uY', 'private')).toEqual([])
    // Positive sanity: uX can see their own data
    expect(searchMessages('uX', 'private')).toHaveLength(1)
  })
})
