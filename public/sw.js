// Nostalgia Console — Service Worker v1
// Caches the app shell for offline use.
// Does NOT cache: Socket.IO, EmulatorJS CDN, ROM blobs.

const CACHE = 'nc-shell-v1'

const SHELL = [
  '/',
  '/tv',
  '/controller',
  '/logo.svg',
  '/icons/tv-icon.svg',
  '/icons/controller-icon.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Never intercept: Socket.IO, EmulatorJS CDN, blob URLs, API routes
  if (
    url.pathname.startsWith('/socket.io') ||
    url.hostname === 'cdn.emulatorjs.org' ||
    url.protocol === 'blob:' ||
    url.pathname.startsWith('/api/')
  ) return

  // Navigation: network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((r) => r ?? caches.match('/'))
      )
    )
    return
  }

  // Static assets: cache-first, then network
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok && request.method === 'GET') {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(request, clone))
        }
        return res
      }).catch(() => cached)
    })
  )
})
