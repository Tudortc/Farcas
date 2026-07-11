import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { storeMessage } from './messages.js'
import { retentionDays, runRetention } from './retention.js'

beforeAll(() => ensureAppSchema(getDb()))

describe('retention', () => {
  it('keeps everything when BOOL_RETENTION_DAYS is unset/0', () => {
    delete process.env.BOOL_RETENTION_DAYS
    expect(retentionDays()).toBe(0)
    const now = 10_000_000_000
    storeMessage('ur', { networkId: 1, target: '#r', sender: 's', kind: 'privmsg', body: 'keep', ts: 1 })
    expect(runRetention(now)).toBe(0)
  })

  it('prunes messages older than the window', () => {
    process.env.BOOL_RETENTION_DAYS = '7'
    expect(retentionDays()).toBe(7)
    const now = 1_000_000_000_000
    const oldTs = now - 8 * 86_400_000
    const freshTs = now - 1 * 86_400_000
    storeMessage('ur2', { networkId: 1, target: '#r', sender: 's', kind: 'privmsg', body: 'old', ts: oldTs })
    storeMessage('ur2', { networkId: 1, target: '#r', sender: 's', kind: 'privmsg', body: 'fresh', ts: freshTs })
    const deleted = runRetention(now)
    expect(deleted).toBeGreaterThanOrEqual(1)
    const rows = getDb().prepare('SELECT body FROM messages WHERE user_id = ?').all('ur2') as { body: string }[]
    expect(rows.map((r) => r.body)).toContain('fresh')
    expect(rows.map((r) => r.body)).not.toContain('old')
    delete process.env.BOOL_RETENTION_DAYS
  })
})
