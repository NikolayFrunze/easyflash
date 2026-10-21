// Network first, so a new deploy shows up on the next load; the cache is only the offline fallback.
const CACHE = 'easyflash-v4';
const SHELL = [
  './', 'index.html', 'styles.css', 'fonts.css', 'app.js', 'manifest.webmanifest',
  'apple-touch-icon.png', 'icon/icon-192.png', 'icon/icon-512.png',
  'fonts/fraunces-600-latin-ext.woff2', 'fonts/fraunces-600-latin.woff2',
  'fonts/fraunces-700-latin-ext.woff2', 'fonts/fraunces-700-latin.woff2',
  ...[400, 500, 600].flatMap((w) => ['cyrillic-ext', 'cyrillic', 'latin-ext', 'latin'].map((s) => `fonts/inter-${w}-${s}.woff2`)),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // never cache the local auto-save API (server.py) or anything from another site
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // GitHub Pages lets browsers reuse files for 10 minutes; revalidate instead
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))),
  );
});
