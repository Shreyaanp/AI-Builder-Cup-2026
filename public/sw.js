/* global self, caches */
/* oGoogle AI service worker: installable PWA with a safe offline shell.
 * - Page navigations: network first, cached shell only when offline (deploys are never stale),
 *   or when the network answers 429 or a server error instead of the app (A-4).
 * - /assets/*: content-hashed and immutable, so cache first.
 * - /art/* and /icons/*: the network's copy, or the kept one when offline or refused (A-18).
 * - /api/* and other origins: never touched (private data is never cached here).
 */
const CUSTOMER = self.location.pathname.startsWith('/explore/')
const PREFIX = CUSTOMER ? 'chalkboard-customer-' : 'chalkboard-business-'
const CACHE = PREFIX + 'v2'
const HOME = CUSTOMER ? '/explore/' : '/?app=business'
// Static pictures the app shows everywhere (category art, icons).
const KEPT_ART = /^\/(?:art|icons)\//
// What the page may ask this worker to keep: the app's own code and pictures, nothing else.
const KEEPABLE = /^\/(?:assets|art|icons)\//
const SHELL = [HOME, CUSTOMER ? '/explore/manifest.webmanifest' : '/manifest-business.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => (key.startsWith(PREFIX) || key === 'ogoogle-shell-v1') && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // A-4: a busy edge (429) or a server error never replaces the app with a bare page.
          if (response.status === 429 || response.status >= 500)
            return caches.match(HOME).then((cached) => cached || response)
          const html = (response.headers.get('content-type') || '').includes('text/html')
          if (CUSTOMER && response.ok && html) {
            // Every customer route serves the same app page: keep the newest one as the shell.
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(HOME, copy))
          }
          return response
        })
        .catch(() => caches.match(HOME)),
    )
    return
  }
  if (KEPT_ART.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
            return response
          }
          return caches.match(request).then((cached) => cached || response)
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    )
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              void caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})

// A-18: the page lists the code and pictures it loaded before this worker controlled it, so the
// screens and art it has shown open offline too. Already kept files are not fetched again.
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'keep' || !Array.isArray(data.urls)) return
  const urls = data.urls
    .slice(0, 300)
    .filter((value) => typeof value === 'string')
    .map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin && KEEPABLE.test(url.pathname))
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          urls.map((url) =>
            cache.match(url.href).then((hit) => hit || cache.add(url.href).catch(() => undefined)),
          ),
        ),
      ),
  )
})

// Only owner reminders; never ask for permission from a worker or during page load.
self.addEventListener('push', (event) => {
  if (CUSTOMER || !event.data) return
  let data
  try {
    data = event.data.json()
  } catch {
    return
  }
  if (!['morning', 'evening'].includes(data.kind) || typeof data.title !== 'string') return
  event.waitUntil(
    self.registration.showNotification(data.title.slice(0, 100), {
      icon: '/icons/business-192.png',
      tag: data.tag,
      data: { url: '/?app=business' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const client = windows.find((item) => {
        const url = new URL(item.url)
        return url.origin === self.location.origin && url.searchParams.get('app') === 'business'
      })
      if (client) return client.focus()
      return self.clients.openWindow('/?app=business')
    }),
  )
})
