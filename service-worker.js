// Simple service worker for HostelSync PWA.
// Bump the cache name to force the service worker to fetch updated assets.
// Bump the cache name each time we release a new version so the service
// worker fetches the latest assets instead of serving old files from cache.
const CACHE_NAME = 'hostelsync-cache-v7';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/laundry.html',
  '/rooms.html',
  '/leaderboard.html',
  '/my-washes.html',
  '/alerts.html',
  '/my-bookings.html',
  '/admin-bookings.html',
  '/profile.html',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  // Pre-cache essential assets during installation.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', event => {
  // Remove old caches on activation.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Serve assets from cache when available, falling back to network.
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});