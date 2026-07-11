/**
 * push-client.ts — browser-side Web Push helpers
 *
 * All browser globals are injectable via `deps` so unit tests can supply fakes
 * without needing a real service worker, PushManager, or Notification API.
 */

/** Returns true when the browser supports service workers, PushManager, and Notification. */
export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Returns the current notification permission state (or 'unsupported'). */
export function notificationState(): 'unsupported' | 'default' | 'granted' | 'denied' {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission as 'default' | 'granted' | 'denied'
}

/**
 * Decode a base64url-encoded VAPID public key to a Uint8Array.
 * Pads if needed, replaces URL-safe chars, then decodes via atob.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Std)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}

// ---------------------------------------------------------------------------
// Injectable deps types
// ---------------------------------------------------------------------------

interface NotificationLike {
  permission: NotificationPermission
  requestPermission(): Promise<NotificationPermission>
}

interface ServiceWorkerContainerLike {
  ready: Promise<ServiceWorkerRegistrationLike>
}

interface PushManagerLike {
  subscribe(options: PushSubscriptionOptionsInit): Promise<PushSubscriptionLike>
  getSubscription(): Promise<PushSubscriptionLike | null>
}

interface ServiceWorkerRegistrationLike {
  pushManager: PushManagerLike
}

interface PushSubscriptionLike {
  endpoint: string
  unsubscribe(): Promise<boolean>
  toJSON(): object
}

export interface EnablePushDeps {
  Notification?: NotificationLike
  serviceWorker?: ServiceWorkerContainerLike
  fetch?: typeof globalThis.fetch
}

export interface DisablePushDeps {
  serviceWorker?: ServiceWorkerContainerLike
  fetch?: typeof globalThis.fetch
}

// ---------------------------------------------------------------------------
// enablePush
// ---------------------------------------------------------------------------

/**
 * Request notification permission, fetch the VAPID public key, subscribe via
 * the service worker's PushManager, and POST the subscription to the server.
 *
 * @returns true on success, false if permission was not granted.
 */
export async function enablePush(deps?: EnablePushDeps): Promise<boolean> {
  const notif = (deps?.Notification ?? window.Notification) as NotificationLike
  const sw = (deps?.serviceWorker ?? navigator.serviceWorker) as ServiceWorkerContainerLike
  const fetchFn = deps?.fetch ?? globalThis.fetch.bind(globalThis)

  // 1. Request permission
  const permission = await notif.requestPermission()
  if (permission !== 'granted') return false

  // 2. Fetch VAPID public key
  const vapidRes = await fetchFn('/api/push/vapid')
  const { key } = (await vapidRes.json()) as { key: string }

  // 3. Subscribe via service worker
  const registration = await sw.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
  })

  // 4. POST subscription to server
  await fetchFn('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })

  return true
}

// ---------------------------------------------------------------------------
// disablePush
// ---------------------------------------------------------------------------

/**
 * Get the current push subscription, unsubscribe it locally, and notify the
 * server so it can remove the stored subscription.
 */
export async function disablePush(deps?: DisablePushDeps): Promise<void> {
  const sw = (deps?.serviceWorker ?? navigator.serviceWorker) as ServiceWorkerContainerLike
  const fetchFn = deps?.fetch ?? globalThis.fetch.bind(globalThis)

  const registration = await sw.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await subscription.unsubscribe()

  await fetchFn('/api/push/unsubscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
}
