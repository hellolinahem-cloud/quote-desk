// Quote Desk service worker – always tries the network first (no stale app after an update),
// keeps a copy so the app still opens offline. API calls (script.google.com) are never touched.
const CACHE = 'quotedesk-v5';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request.url, { cache: 'no-cache' });
  e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
