/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Minimal app-shell service worker: network first, cache fallback (so the installed app opens offline).
const CACHE = 'brain-arcade-mvkzq92r';
const SCOPE = self.registration.scope;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE, SCOPE + 'index.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Same-origin, in-scope GET only; never Range requests (Web Bluetooth/OPFS do not use fetch)
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE) || req.headers.has('range')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Deep link on a static host (e.g. GitHub Pages 404): serve the cached app shell instead
        if (res.status === 404 && req.mode === 'navigate') {
          return caches.match(SCOPE + 'index.html').then((hit) => hit || res);
        }
        const big = Number(res.headers.get('content-length')) > 1024 * 1024 || /\.csv(\?|$)/i.test(req.url);
        if (res.status === 200 && res.type === 'basic' && !big) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match(SCOPE + 'index.html') : Response.error()))
      )
  );
});
