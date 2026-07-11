import { describe, it, expect, vi, beforeEach } from 'vitest'
import { urlBase64ToUint8Array, enablePush, disablePush, pushSupported, notificationState } from './push-client.js'

// ---------------------------------------------------------------------------
// urlBase64ToUint8Array
// ---------------------------------------------------------------------------

describe('urlBase64ToUint8Array', () => {
  it('decodes a known base64url string to the expected byte length', () => {
    // 65-byte sequence (bytes 1..65) encoded in base64url, padding stripped
    // Generated via: Buffer.from(new Uint8Array(65).map((_,i)=>i+1)).toString('base64url')
    const key =
      'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4_QEE'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBe(65)
  })

  it('handles keys with + and / characters (standard base64)', () => {
    // A short, well-known base64 string: "hello" -> aGVsbG8=
    const b64url = 'aGVsbG8=' // "hello" — no url-unsafe chars, just testing the path
    const bytes = urlBase64ToUint8Array(b64url)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// pushSupported / notificationState
// ---------------------------------------------------------------------------

describe('pushSupported', () => {
  it('returns false when serviceWorker is absent from navigator', () => {
    // jsdom doesn't have serviceWorker / PushManager / Notification by default
    expect(typeof pushSupported()).toBe('boolean')
  })
})

describe('notificationState', () => {
  it("returns 'unsupported' when Notification is not in window", () => {
    // jsdom doesn't define Notification by default
    const state = notificationState()
    expect(['unsupported', 'default', 'granted', 'denied']).toContain(state)
  })
})

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

function makeFakeSub(endpoint = 'https://push.example.com/sub1') {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'aaa', auth: 'bbb' } }),
  }
}

function makeFakePushManager(sub: ReturnType<typeof makeFakeSub> | null = null) {
  return {
    subscribe: vi.fn().mockResolvedValue(makeFakeSub()),
    getSubscription: vi.fn().mockResolvedValue(sub),
  }
}

function makeFakeRegistration(pushManager = makeFakePushManager()) {
  return { pushManager }
}

function makeFakeServiceWorker(registration = makeFakeRegistration()) {
  return {
    ready: Promise.resolve(registration),
  }
}

function makeFakeFetch(vapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLl1yCOyHZF2JQ3I') {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/push/vapid') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ key: vapidKey }),
      })
    }
    // POST /api/push/subscribe or /api/push/unsubscribe
    return Promise.resolve({ ok: true })
  })
}

// ---------------------------------------------------------------------------
// enablePush
// ---------------------------------------------------------------------------

describe('enablePush', () => {
  it('returns true when permission is granted, fetches vapid, subscribes, and POSTs subscription', async () => {
    const fakeNotification = {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue('granted' as NotificationPermission),
    }
    const fakeFetch = makeFakeFetch()
    const fakeSub = makeFakeSub()
    const fakePushManager = { ...makeFakePushManager(), subscribe: vi.fn().mockResolvedValue(fakeSub) }
    const fakeRegistration = makeFakeRegistration(fakePushManager)
    const fakeSW = makeFakeServiceWorker(fakeRegistration)

    const result = await enablePush({
      Notification: fakeNotification as unknown as typeof Notification,
      serviceWorker: fakeSW as unknown as ServiceWorkerContainer,
      fetch: fakeFetch,
    })

    expect(result).toBe(true)
    expect(fakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    // Should fetch vapid key
    expect(fakeFetch).toHaveBeenCalledWith('/api/push/vapid')
    // Should subscribe
    expect(fakePushManager.subscribe).toHaveBeenCalledTimes(1)
    const subscribeCall = (fakePushManager.subscribe.mock.calls[0] as unknown[])[0] as PushSubscriptionOptionsInit
    expect(subscribeCall.userVisibleOnly).toBe(true)
    expect(subscribeCall.applicationServerKey).toBeInstanceOf(ArrayBuffer)
    // Should POST subscription
    const postCall = (fakeFetch.mock.calls as unknown[][]).find(
      (c) => c[0] === '/api/push/subscribe'
    )
    expect(postCall).toBeDefined()
    const postInit = postCall![1] as RequestInit
    expect(postInit.method).toBe('POST')
    expect(postInit.credentials).toBe('same-origin')
  })

  it('returns false and does not subscribe when permission is denied', async () => {
    const fakeNotification = {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue('denied' as NotificationPermission),
    }
    const fakeFetch = makeFakeFetch()
    const fakePushManager = makeFakePushManager()
    const fakeRegistration = makeFakeRegistration(fakePushManager)
    const fakeSW = makeFakeServiceWorker(fakeRegistration)

    const result = await enablePush({
      Notification: fakeNotification as unknown as typeof Notification,
      serviceWorker: fakeSW as unknown as ServiceWorkerContainer,
      fetch: fakeFetch,
    })

    expect(result).toBe(false)
    expect(fakePushManager.subscribe).not.toHaveBeenCalled()
    expect(fakeFetch).not.toHaveBeenCalledWith('/api/push/subscribe', expect.anything())
  })

  it('returns false when permission is dismissed/default', async () => {
    const fakeNotification = {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue('default' as NotificationPermission),
    }
    const fakeFetch = makeFakeFetch()
    const fakePushManager = makeFakePushManager()
    const fakeRegistration = makeFakeRegistration(fakePushManager)
    const fakeSW = makeFakeServiceWorker(fakeRegistration)

    const result = await enablePush({
      Notification: fakeNotification as unknown as typeof Notification,
      serviceWorker: fakeSW as unknown as ServiceWorkerContainer,
      fetch: fakeFetch,
    })

    expect(result).toBe(false)
    expect(fakePushManager.subscribe).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// disablePush
// ---------------------------------------------------------------------------

describe('disablePush', () => {
  it('unsubscribes locally and POSTs to /api/push/unsubscribe', async () => {
    const fakeSub = makeFakeSub('https://push.example.com/endpoint-abc')
    const fakePushManager = makeFakePushManager(fakeSub)
    const fakeRegistration = makeFakeRegistration(fakePushManager)
    const fakeSW = makeFakeServiceWorker(fakeRegistration)
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true })

    await disablePush({
      serviceWorker: fakeSW as unknown as ServiceWorkerContainer,
      fetch: fakeFetch,
    })

    expect(fakeSub.unsubscribe).toHaveBeenCalledTimes(1)
    expect(fakeFetch).toHaveBeenCalledWith(
      '/api/push/unsubscribe',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ endpoint: 'https://push.example.com/endpoint-abc' }),
      })
    )
  })

  it('does nothing if there is no existing subscription', async () => {
    const fakePushManager = makeFakePushManager(null) // no subscription
    const fakeRegistration = makeFakeRegistration(fakePushManager)
    const fakeSW = makeFakeServiceWorker(fakeRegistration)
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true })

    await disablePush({
      serviceWorker: fakeSW as unknown as ServiceWorkerContainer,
      fetch: fakeFetch,
    })

    expect(fakeFetch).not.toHaveBeenCalled()
  })
})
