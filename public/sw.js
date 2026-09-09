// The Squad service worker: public PWA shell plus standards Web Push.
const CACHE_NAME = 'the-squad-shell-v10';
const SCHEDULE_SHELL_URL = '/schedule-app';
const SHELL_URLS = [
  SCHEDULE_SHELL_URL,
  '/offline.html',
  '/manifest.json',
  '/app-icon-192-v5.png',
  '/app-icon-512-v5.png',
  '/app-icon-maskable-192-v5.png',
  '/app-icon-maskable-512-v5.png',
  '/notification-badge.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestedUrl = new URL(event.request.url);
  if (requestedUrl.origin === self.location.origin && requestedUrl.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }
  if (event.request.mode === 'navigate') {
    if (requestedUrl.origin === self.location.origin && requestedUrl.pathname === SCHEDULE_SHELL_URL) {
      event.respondWith(
        fetch(event.request)
          .then(async (response) => {
            if (response.ok) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(SCHEDULE_SHELL_URL, response.clone());
            }
            return response;
          })
          .catch(async () => (await caches.match(SCHEDULE_SHELL_URL)) || caches.match('/offline.html'))
      );
      return;
    }
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});

function showSquadNotification({ title, body, imageUrl, url, tag }) {
  return self.registration.showNotification(title || 'The Squad', {
    body: body || '',
    icon: '/app-icon-192-v5.png',
    badge: '/notification-badge.png',
    image: imageUrl || undefined,
    data: { url: typeof url === 'string' && url.startsWith('/') ? url : '/dashboard' },
    tag: tag || 'squad-notification',
    renotify: true,
    requireInteraction: false,
    silent: false,
  });
}

// App-icon badging is distinct from the notification's monochrome badge image.
// Count outstanding OS notifications, not replacements of the same tagged card.
let notificationPresentationQueue = Promise.resolve();
function withNotificationPresentationLock(operation) {
  const run = async () => {
    if (!self.navigator?.locks?.request) return operation();
    let started = false;
    try {
      return await self.navigator.locks.request('squad-notification-presentation', () => {
        started = true;
        return operation();
      });
    } catch (error) {
      // Lock acquisition is an enhancement, never a prerequisite for delivery.
      // Do not retry a failed notification operation that already held the lock.
      if (started) throw error;
      return operation();
    }
  };
  // Web Locks also coordinate with window cleanup. Older browsers retain worker
  // event ordering through this queue, even when they cannot display app badges.
  const result = notificationPresentationQueue.then(run, run);
  notificationPresentationQueue = result.catch(() => {});
  return result;
}

async function syncAppBadge() {
  try {
    if (!self.navigator?.setAppBadge) return;
    const notifications = await self.registration.getNotifications();
    if (notifications.length) await self.navigator.setAppBadge(notifications.length);
    else await self.navigator.clearAppBadge();
  } catch {
    // Unsupported/disabled badging must never prevent notification delivery.
  }
}

// Browser-native Web Push is the only PWA transport. A single transport avoids
// Firebase token lifecycle conflicts with the browser's PushSubscription.
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
      await withNotificationPresentationLock(async () => {
        await showSquadNotification({
          title: typeof webPush.title === 'string' ? webPush.title : 'The Squad',
          body: typeof webPush.body === 'string' ? webPush.body : '',
          imageUrl: typeof webPush.imageUrl === 'string' ? webPush.imageUrl : undefined,
          url: typeof webPush.url === 'string' ? webPush.url : '/dashboard',
          tag: 'squad-web-push',
        });
        await syncAppBadge();
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    Promise.all([withNotificationPresentationLock(async () => {
      event.notification.close();
      await syncAppBadge();
    }), clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })])
  );
});

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(withNotificationPresentationLock(syncAppBadge));
});
