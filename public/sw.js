/* Nook service worker: makes the site installable, opens fast, and shows push notifications.
   It never caches the database or any of your messages: only the app's own files. */
const CACHE = 'nook-shell-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/favicon.svg', '/icon-192.png'])).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // Supabase, LiveKit and uploads go straight to the network
  if (req.mode === 'navigate') {
    // Newest page when online, saved page when offline.
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    // Built files have a hash in their name, so a saved copy is always the right one.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return r })))
  }
})

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : '' } }
  e.waitUntil((async () => {
    // Do not buzz when the person is already looking at Nook.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (open.some((c) => c.visibilityState === 'visible' && c.focused)) return
    await self.registration.showNotification(d.title || 'Nook', {
      body: d.body || 'New message',
      tag: d.tag || 'nook',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const to = e.notification.data?.url || '/'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const c = all[0]
    if (c) { await c.focus(); return }
    await self.clients.openWindow(to)
  })())
})
