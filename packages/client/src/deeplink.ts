import { useChat, targetKey } from './store/chat-store.js'

/**
 * Navigate the chat store to the given network + target, loading history.
 */
export function applyDeepLink(networkId: number, target: string): void {
  const key = targetKey(networkId, target)
  useChat.getState().select(key)
  useChat.getState().loadHistory(key)
}

/**
 * Wire up deep-link routing from two sources:
 *  1. ServiceWorker postMessage (warm open — existing window receives notification click)
 *  2. URL query params ?net=<id>&target=<target> (cold open — page was opened by SW openWindow)
 *
 * Call once at app startup (before or after mount — registration is synchronous).
 */
export function initDeepLinks(): void {
  // 1. ServiceWorker message listener (warm path)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'notification:click') {
        const { networkId, target } = e.data.data as { networkId: number; target: string }
        applyDeepLink(networkId, target)
      }
    })
  }

  // 2. URL query params (cold path — SW used openWindow with encoded URL)
  const params = new URLSearchParams(window.location.search)
  const net = params.get('net')
  const target = params.get('target')
  if (net !== null && target !== null) {
    // Clear the query string so refreshing doesn't re-navigate
    history.replaceState(null, '', window.location.pathname)
    // Short delay so the WebSocket has a chance to connect before requesting history
    setTimeout(() => {
      applyDeepLink(Number(net), target)
    }, 500)
  }
}
