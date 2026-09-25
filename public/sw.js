// My Space service worker: lets the installed app open without a connection.
// Pages are network-first (you always get the latest version when online) and
// fall back to the last copy; hashed build assets are cache-first. Documents
// and boards live in IndexedDB and never pass through here.

const CACHE = 'my-space-v1'
const SHELL = ['/write', '/create', '/work']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          if (response.ok) caches.open(CACHE).then(cache => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('/write')))
    )
    return
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon') || url.pathname.startsWith('/apple-icon')) {
    event.respondWith(
      caches.match(request).then(
        hit =>
          hit ||
          fetch(request).then(response => {
            const copy = response.clone()
            if (response.ok) caches.open(CACHE).then(cache => cache.put(request, copy))
            return response
          })
      )
    )
  }
})
