const CACHE_NAME = 'econexus-v1';
const urlsToCache = [
  '/EcoNexus/',
  '/EcoNexus/index.html',
  '/EcoNexus/menu.html',
  '/EcoNexus/captacion.html',
  '/EcoNexus/logo.png.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
