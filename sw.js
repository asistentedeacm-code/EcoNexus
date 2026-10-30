const CACHE_NAME = 'econexus-v-dinamica-3';
const urlsToCache = [
  '/',
  '/menu.html',
  '/logo.png.png'
];

// Instalación inicial ligera
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activación inmediata y limpieza de versiones viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia inteligente de peticiones
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // SI ES UNA PAGINA HTML: Intentamos buscar primero en la red
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else {
    // PARA IMÁGENES O RECURSOS: Usamos caché primero para velocidad
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
}); 
