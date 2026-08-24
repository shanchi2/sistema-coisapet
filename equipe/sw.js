// CoisaPet Equipe — Service Worker v6
const CACHE = 'cp-equipe-v8'
// index.html NUNCA entra no cache — sempre busca da rede
const STATIC = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Tudo externo (Supabase, CDN, fonts) — passa direto
  if (url.origin !== self.location.origin) return

  // index.html — SEMPRE da rede, nunca do cache
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('/equipe/') ||
    url.pathname.endsWith('/equipe') ||
    url.pathname.endsWith('index.html') ||
    url.search.startsWith('?v=') // recargas forçadas
  ) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  // Ícones e manifest — cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (res.ok) {
          const resClone = res.clone() // clona ANTES de consumir
          caches.open(CACHE).then(c => c.put(e.request, resClone))
        }
        return res
      })
    })
  )
})

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
