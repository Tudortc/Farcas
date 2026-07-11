import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'

// Set VAPID env before importing push.ts so isPushConfigured is true
const FAKE_PUBLIC = 'BFakePublicKeyForTestingOnly1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh'
const FAKE_PRIVATE = 'FakePrivateKeyForTestingOnly1234567890ABCDEF'

beforeAll(() => {
  process.env.BOOL_VAPID_PUBLIC = FAKE_PUBLIC
  process.env.BOOL_VAPID_PRIVATE = FAKE_PRIVATE
  ensureAppSchema(getDb())
})

// We import dynamically so env is already set
const pushModule = await import('./push.js')
const { isPushConfigured, vapidPublicKey, savePushSubscription, removePushSubscription, sendPushToUser } = pushModule

afterEach(() => {
  // Clean up push_subs after each test
  getDb().exec('DELETE FROM push_subs')
})

describe('isPushConfigured', () => {
  it('returns true when VAPID env vars are set', () => {
    expect(isPushConfigured()).toBe(true)
  })
})

describe('vapidPublicKey', () => {
  it('returns the public key when configured', () => {
    expect(vapidPublicKey()).toBe(FAKE_PUBLIC)
  })
})

describe('savePushSubscription', () => {
  it('stores a subscription for a user', async () => {
    await savePushSubscription('user1', { endpoint: 'https://push.example.com/e1', keys: { p256dh: 'x', auth: 'y' } })
    const row = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').get('https://push.example.com/e1') as any
    expect(row).toBeTruthy()
    expect(row.user_id).toBe('user1')
    expect(JSON.parse(row.keys_json)).toEqual({ p256dh: 'x', auth: 'y' })
  })

  it('upserts by endpoint (same endpoint, different data)', async () => {
    await savePushSubscription('user1', { endpoint: 'https://push.example.com/e2', keys: { p256dh: 'a', auth: 'b' } })
    await savePushSubscription('user1', { endpoint: 'https://push.example.com/e2', keys: { p256dh: 'c', auth: 'd' } })
    const rows = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').all('https://push.example.com/e2') as any[]
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]!.keys_json)).toEqual({ p256dh: 'c', auth: 'd' })
  })
})

describe('removePushSubscription', () => {
  it('removes a subscription for a user', async () => {
    await savePushSubscription('user1', { endpoint: 'https://push.example.com/e3', keys: { p256dh: 'x', auth: 'y' } })
    await removePushSubscription('user1', 'https://push.example.com/e3')
    const row = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').get('https://push.example.com/e3')
    expect(row).toBeUndefined()
  })
})

describe('sendPushToUser', () => {
  it('calls the injected sender once per subscription with the payload string', async () => {
    await savePushSubscription('userA', { endpoint: 'https://push.example.com/send1', keys: { p256dh: 'x', auth: 'y' } })

    const calls: Array<{ sub: any; payload: string }> = []
    const fakeSender = async (sub: any, payload: string) => {
      calls.push({ sub, payload })
    }

    const count = await sendPushToUser('userA', { title: 'Hello' }, fakeSender)
    expect(count).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.payload).toBe(JSON.stringify({ title: 'Hello' }))
    expect(calls[0]!.sub.endpoint).toBe('https://push.example.com/send1')
  })

  it('prunes subscriptions when the sender rejects with statusCode 410', async () => {
    await savePushSubscription('userB', { endpoint: 'https://push.example.com/gone1', keys: { p256dh: 'x', auth: 'y' } })

    const goneError = Object.assign(new Error('Gone'), { statusCode: 410 })
    const fakeSender = async (_sub: any, _payload: string) => {
      throw goneError
    }

    const count1 = await sendPushToUser('userB', { title: 'Test' }, fakeSender)
    expect(count1).toBe(0)

    // The subscription should have been pruned
    const row = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').get('https://push.example.com/gone1')
    expect(row).toBeUndefined()

    // Second send should skip (0 subs for userB)
    const calls: any[] = []
    const fakeSender2 = async (sub: any, payload: string) => { calls.push({ sub, payload }) }
    const count2 = await sendPushToUser('userB', { title: 'Test' }, fakeSender2)
    expect(count2).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('prunes subscriptions when the sender rejects with statusCode 404', async () => {
    await savePushSubscription('userC', { endpoint: 'https://push.example.com/gone404', keys: { p256dh: 'x', auth: 'y' } })

    const goneError = Object.assign(new Error('Not Found'), { statusCode: 404 })
    const fakeSender = async (_sub: any, _payload: string) => {
      throw goneError
    }

    await sendPushToUser('userC', { title: 'Test' }, fakeSender)
    const row = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').get('https://push.example.com/gone404')
    expect(row).toBeUndefined()
  })

  it('returns 0 and no-ops when isPushConfigured is false', async () => {
    // Temporarily unset VAPID vars
    const pub = process.env.BOOL_VAPID_PUBLIC
    const priv = process.env.BOOL_VAPID_PRIVATE
    delete process.env.BOOL_VAPID_PUBLIC
    delete process.env.BOOL_VAPID_PRIVATE

    try {
      await savePushSubscription('userD', { endpoint: 'https://push.example.com/noop', keys: { p256dh: 'x', auth: 'y' } })
      const calls: any[] = []
      const fakeSender = async (sub: any, payload: string) => { calls.push({ sub, payload }) }
      const count = await sendPushToUser('userD', { title: 'Test' }, fakeSender)
      // sendPushToUser no-ops when isPushConfigured() is false
      expect(count).toBe(0)
    } finally {
      process.env.BOOL_VAPID_PUBLIC = pub
      process.env.BOOL_VAPID_PRIVATE = priv
    }
  })
})
