// The Squad service worker: public PWA shell plus FCM and standards Web Push.
const CACHE_NAME = 'the-squad-shell-v3';
const SHELL_URLS = [
  '/offline.html',
  '/manifest.json',
  '/favicon-192.png',
  '/favicon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});

function showSquadNotification({ title, body, imageUrl, url, tag }) {
  return self.registration.showNotification(title || 'The Squad', {
    body: body || '',
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    image: imageUrl || undefined,
    data: { url: typeof url === 'string' && url.startsWith('/') ? url : '/dashboard' },
    tag: tag || 'squad-notification',
    renotify: true,
    requireInteraction: false,
    silent: false,
  });
}

// Standards Web Push payloads are explicitly marked so they never duplicate FCM.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        return;
      }
      const webPush = payload?.webPush;
      if (!webPush || typeof webPush !== 'object') return;
      await showSquadNotification({
        title: typeof webPush.title === 'string' ? webPush.title : 'The Squad',
        body: typeof webPush.body === 'string' ? webPush.body : '',
        imageUrl: typeof webPush.imageUrl === 'string' ? webPush.imageUrl : undefined,
        url: typeof webPush.url === 'string' ? webPush.url : '/dashboard',
        tag: 'squad-web-push',
      });
    })()
  );
});

// Firebase Messaging only supports a subset of browser environments. Keeping
// its setup guarded lets standards Web Push continue to work where FCM cannot.
try {
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
    // A stale registration uses the fallback config until the client refreshes it.
  }

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const { title, body, image } = payload.notification ?? {};
    return showSquadNotification({
      title,
      body,
      imageUrl: image,
      url: payload.fcmOptions?.link || '/dashboard',
      tag: payload.collapseKey || 'squad-notification',
    });
  });
} catch {
  console.warn('[FCM] Service worker initialization skipped.');
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
