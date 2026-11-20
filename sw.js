// Офлайн-режим: оболочка приложения кэшируется, учебник — «сначала сеть, потом кэш»,
// чтобы новые уроки подхватывались сами, а без интернета работало последнее загруженное.
const VERSION = 'espanola-v9';
const SHELL = ['./', 'index.html', 'css/app.css', 'config.js', 'manifest.webmanifest',
  'js/main.js', 'js/store.js', 'js/data.js', 'js/srs.js', 'js/speech.js', 'js/quiz.js', 'js/ai.js', 'js/sync.js', 'js/cloud.js',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'espanola-data' && k.startsWith('espanola-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const isData = new URL(req.url).pathname.includes('/textbook/');
  const c = await caches.open(isData ? 'espanola-data' : VERSION);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
async function cacheFirst(req) {
  const c = await caches.open(new URL(req.url).pathname.includes('/textbook/') ? 'espanola-data' : VERSION);
  const hit = await caches.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google API, вход и Gemini — только сеть
  if (/googleapis\.com$|accounts\.google\.com$|gemini\.google\.com$|googleusercontent\.com$/.test(url.hostname) && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/textbook/images/') && !url.pathname.endsWith('.json')) { e.respondWith(cacheFirst(req)); return; }
  // всё своё: сначала сеть (свежие уроки и обновления), без сети — кэш
  e.respondWith(networkFirst(req).catch(() => caches.match('index.html')));
});
