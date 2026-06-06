/**
 * sw.js — SETRADAR Service Worker
 * Handles Web Push notifications for iOS (16.4+) and Android
 */

self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SETRADAR', body: event.data.text() };
  }

  const title = payload.title || 'SETRADAR';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './icon.svg',
    badge: payload.badge || './icon.svg',
    tag: payload.tag || 'setradar-default',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    renotify: true,
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification.data?.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (url !== './index.html') client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});
