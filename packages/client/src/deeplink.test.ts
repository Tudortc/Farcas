import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyDeepLink, initDeepLinks } from './deeplink.js'
import { useChat, targetKey } from './store/chat-store.js'

// Reset store between tests
beforeEach(() => {
  useChat.setState((useChat as any).getInitialState(), true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// applyDeepLink — unit test (no navigator needed)
// ---------------------------------------------------------------------------

describe('applyDeepLink', () => {
  it('calls select with the correct targetKey', () => {
    const selectSpy = vi.spyOn(useChat.getState(), 'select')
    applyDeepLink(1, '#general')
    expect(selectSpy).toHaveBeenCalledWith(targetKey(1, '#general'))
  })

  it('calls loadHistory with the correct targetKey', () => {
    const loadSpy = vi.spyOn(useChat.getState(), 'loadHistory')
    applyDeepLink(2, '#random')
    expect(loadSpy).toHaveBeenCalledWith(targetKey(2, '#random'))
  })
})

// ---------------------------------------------------------------------------
// initDeepLinks — serviceWorker message listener
// ---------------------------------------------------------------------------

describe('initDeepLinks — message listener', () => {
  it('registers a message listener on navigator.serviceWorker', () => {
    const addEventListenerSpy = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener: addEventListenerSpy },
      configurable: true,
      writable: true,
    })

    initDeepLinks()

    expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('calls applyDeepLink when a notification:click message arrives', () => {
    let capturedHandler: ((e: MessageEvent) => void) | undefined

    const addEventListenerSpy = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      if (event === 'message') capturedHandler = handler
    })

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener: addEventListenerSpy },
      configurable: true,
      writable: true,
    })

    initDeepLinks()

    const selectSpy = vi.spyOn(useChat.getState(), 'select')

    // Simulate a notification:click message from the SW
    capturedHandler!({
      data: { type: 'notification:click', data: { networkId: 1, target: '#x' } },
    } as MessageEvent)

    expect(selectSpy).toHaveBeenCalledWith(targetKey(1, '#x'))
  })

  it('ignores messages with a different type', () => {
    let capturedHandler: ((e: MessageEvent) => void) | undefined

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((_event: string, handler: (e: MessageEvent) => void) => {
          capturedHandler = handler
        }),
      },
      configurable: true,
      writable: true,
    })

    initDeepLinks()

    const selectSpy = vi.spyOn(useChat.getState(), 'select')

    capturedHandler!({ data: { type: 'sw:update' } } as MessageEvent)

    expect(selectSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// initDeepLinks — URL query params (cold-open path)
// NOTE: jsdom does not allow directly assigning window.location, so we test
// applyDeepLink directly (already covered above) and verify the URL-param
// branch via a mocked URLSearchParams / history.replaceState.
// ---------------------------------------------------------------------------

describe('initDeepLinks — URL query params', () => {
  it('calls applyDeepLink and clears query when net+target params are present', () => {
    // Stub URLSearchParams to simulate ?net=2&target=%23y being present
    const fakeParams = new URLSearchParams('net=2&target=%23y')
    vi.spyOn(globalThis, 'URLSearchParams').mockImplementationOnce(() => fakeParams)

    const replaceStateSpy = vi.spyOn(history, 'replaceState')

    // Suppress serviceWorker in this test to isolate the URL path.
    // We stub it with a no-op addEventListener so the 'serviceWorker' in navigator
    // check passes but no real listener registration happens.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener: vi.fn() },
      configurable: true,
      writable: true,
    })

    vi.useFakeTimers()

    initDeepLinks()

    // replaceState should be called synchronously to clear the query
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', window.location.pathname)

    const selectSpy = vi.spyOn(useChat.getState(), 'select')

    // Advance past the 500 ms setTimeout
    vi.advanceTimersByTime(600)

    expect(selectSpy).toHaveBeenCalledWith(targetKey(2, '#y'))

    vi.useRealTimers()
  })

  it('does nothing when URL has no net/target params', () => {
    const fakeParams = new URLSearchParams('')
    vi.spyOn(globalThis, 'URLSearchParams').mockImplementationOnce(() => fakeParams)

    const replaceStateSpy = vi.spyOn(history, 'replaceState')

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { addEventListener: vi.fn() },
      configurable: true,
      writable: true,
    })

    initDeepLinks()

    expect(replaceStateSpy).not.toHaveBeenCalled()
  })
})
