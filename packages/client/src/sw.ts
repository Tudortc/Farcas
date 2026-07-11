/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

import { precacheAndRoute } from 'workbox-precaching'
import { parsePushPayload } from './push-payload.js'

// Workbox injects the precache manifest here at build time
precacheAndRoute(self.__WB_MANIFEST)

// Handle incoming push notifications
self.addEventListener('push', (e) => {
  e.waitUntil(
    (async () => {
      const p = parsePushPayload(await e.data?.text())
      await self.registration.showNotification(p.title, {
        body: p.body,
        tag: p.tag,
        data: p.data,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      })
    })(),
  )
})

// Handle notification clicks
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const notifData = e.notification.data as { networkId: number; target: string }

  e.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = clientList[0]

      if (existing) {
        await existing.focus()
        existing.postMessage({ type: 'notification:click', data: notifData })
      } else {
        // Cold open: encode target in URL so the page can route without a postMessage race
        await self.clients.openWindow(
          '/?net=' + notifData.networkId + '&target=' + encodeURIComponent(notifData.target),
        )
      }
    })(),
  )
})
