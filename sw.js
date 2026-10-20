const CACHE_NAME = 'econexus-v-dinamica-v3';
const urlsToCache = [
  '/EcoNexus/',
  '/EcoNexus/logo.png.png'
];

// Instalación inicial
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activación inmediata y purga estricta de versiones antiguas
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

// Estrategia Network-First para HTML y Cache-First para estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Para navegaciones y documentos HTML: Siempre buscar directamente en la red
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/EcoNexus/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else {
    // Para imágenes y recursos estáticos: Usar caché primero para mayor velocidad
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});
