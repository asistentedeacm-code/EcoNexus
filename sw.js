const CACHE_NAME = 'econexus-v2'; // <--- ¡INCREMENTA ESTO CADA VEZ QUE HAGAS UNA ACTUALIZACIÓN IMPORTANTE! (v3, v4...)
const urlsToCache = [
  '/EcoNexus/',
  '/EcoNexus/index.html',
  '/EcoNexus/menu.html',
  '/EcoNexus/captacion.html',
  '/EcoNexus/logo.png.png'
];

// 1. INSTALACIÓN: Forzar la instalación inmediata del nuevo Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Fuerza a que el SW pase de "esperando" a "activo" de inmediato
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. ACTIVACIÓN: Limpiar cachés antiguas y tomar control absoluto de las pestañas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Borrando caché obsoleta:', cacheName);
            return caches.delete(cacheName); // Borra econexus-v1 u otras viejas
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Toma el control de la PWA abierta sin esperar reinicio
    })
  );
});

// 3. FETCH INTELIGENTE: Red primero para HTML (para ver cambios), Caché primero para estáticos
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Si es una página HTML, intentamos buscar la versión más reciente en la red
  if (event.request.mode === 'navigate' || requestUrl.pathname.endsWith('.html') || requestUrl.pathname.endsWith('/EcoNexus/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // Si el usuario está offline, devolvemos la caché disponible
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para imágenes y recursos estáticos: Caché primero, respaldo en red
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    })
  );
});
