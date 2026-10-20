const CACHE_NAME = 'econexus-v-dinamica';
const urlsToCache = [
  '/EcoNexus/',
  '/EcoNexus/logo.png.png' 
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
          return caches.delete(cacheName); // Limpia cualquier caché anterior
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia inteligente de peticiones
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // SI ES UNA PAGINA HTML: Intentamos buscar primero en la red (GitHub)
  // Así los cambios de código o la foto de perfil se reflejan al instante.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/EcoNexus/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          // Si el usuario está totalmente sin internet, se le muestra lo que esté en caché
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
