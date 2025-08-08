// Service Worker for VisionGlowFrames PWA
const VERSION = 'v1.0.4';
const STATIC_CACHE = `glowframes-static-${VERSION}`;
const DYNAMIC_CACHE = `glowframes-dynamic-${VERSION}`;

const staticAssets = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './glowframeicon.png',
  './manifest.json',
  './offline.html'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('SW installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(staticAssets);
      })
      .then(() => {
        console.log('SW installed successfully');
  return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache install failed:', error);
      })
  );
});

// Activate Service Worker and clean up old caches
self.addEventListener('activate', (event) => {
  console.log('SW activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('SW activated successfully');
        return self.clients.claim();
      })
  );
});

// Listen for skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - Cache First strategy for static assets, Network First for dynamic content
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests
  const isSameOrigin = url.origin === self.location.origin;
  
  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./offline.html'))
    );
    return;
  }
  
  // Network First strategy for critical files to ensure updates
  const criticalFiles = ['index.html', 'styles.css', 'script.js', 'manifest.json'];
  if (isSameOrigin && criticalFiles.some(file => url.pathname.includes(file))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return caches.match(request) || response;
          }
          const responseClone = response.clone();
          caches.open(STATIC_CACHE)
            .then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
  } 
  // Cache First strategy for other same-origin static assets
  else if (isSameOrigin && staticAssets.some(asset => url.pathname.endsWith(asset.replace('./', '')))) {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          return response || fetch(request)
            .then((fetchResponse) => {
              if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
                return fetchResponse;
              }
              const responseClone = fetchResponse.clone();
              caches.open(STATIC_CACHE)
                .then((cache) => cache.put(request, responseClone));
              return fetchResponse;
            });
        })
        .catch(() => {
          // Return offline page for HTML requests
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
        })
    );
  } else if (isSameOrigin) {
    // Network First strategy for other requests
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'default')) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
  } else if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    // Cache Google Fonts: stale-while-revalidate
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200)) {
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, networkResponse.clone()));
          }
          return networkResponse;
        });
        return cached || fetchPromise;
      })
    );
  }
});
