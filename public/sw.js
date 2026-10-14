/* global self, caches */
/* oGoogle AI service worker: installable PWA with a safe offline shell.
 * - Page navigations: network first, cached shell only when offline (deploys are never stale).
 * - /assets/*: content-hashed and immutable, so cache first.
 * - /api/* and other origins: never touched (private data is never cached here).
 */
const CUSTOMER = self.location.pathname.startsWith('/explore/')
const PREFIX = CUSTOMER ? 'chalkboard-customer-' : 'chalkboard-business-'
const CACHE = PREFIX + 'v2'
const HOME = CUSTOMER ? '/explore/' : '/?app=business'
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
    event.respondWith(fetch(request).catch(() => caches.match(HOME)))
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
