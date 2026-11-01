/* Service worker : pré-cache de l'appli pour le fonctionnement hors ligne (cible web uniquement).
   VERSION doit rester égale à APP_VERSION de platform.js (vérifié par tests/platform.test.js). */
var VERSION = '1.4.0';
var CACHE = 'paie-assmat-' + VERSION;
var FILES = ['./', 'index.html', 'style.css', 'engine.js', 'db.js', 'platform.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('paie-assmat-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).catch(function () { return req.mode === 'navigate' ? c.match('index.html') : Response.error(); });
    });
  }));
});
