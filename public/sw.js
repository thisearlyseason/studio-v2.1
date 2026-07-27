// The Squad Pro — Service Worker
// Handles: schedule-app offline caching + FCM push notifications

// ── 1. App Shell Cache ───────────────────────────────────────────────────────
const CACHE_NAME = 'squad-schedule-v2';
const SHELL_URLS = [
  '/schedule-app',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/schedule-app') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

// ── 2. FCM Push Notification Handler ────────────────────────────────────────
// Firebase Messaging SDK uses the service worker to deliver push messages
// when the app is backgrounded or closed.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyA8G2_7gu0WK8efQ9sl7UJG6tsrC7iOCdU',
  authDomain: 'studio-6850142148-fe343.firebaseapp.com',
  projectId: 'studio-6850142148-fe343',
  storageBucket: 'studio-6850142148-fe343.firebasestorage.app',
  messagingSenderId: '61782012212',
  appId: '1:61782012212:web:8913d2b40fd9843148f561',
};

let firebaseConfig = fallbackFirebaseConfig;
try {
  const configured = new URL(self.location.href).searchParams.get('firebaseConfig');
  if (configured) firebaseConfig = JSON.parse(configured);
} catch {
  // Keep the production fallback if a stale or malformed registration is found.
}
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Background message handler — shows the notification when app is not in focus
messaging.onBackgroundMessage((payload) => {
  const { title, body, image } = payload.notification ?? {};
  const url = payload.fcmOptions?.link || '/';

  self.registration.showNotification(title || 'The Squad Pro', {
    body: body || '',
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    image: image || undefined,
    data: { url },
    // Group notifications by topic so they don't stack endlessly
    tag: payload.collapseKey || 'squad-notification',
    renotify: true,
    requireInteraction: false,
    silent: false,
  });
});

// Notification click — open/focus the app and navigate to the relevant URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
