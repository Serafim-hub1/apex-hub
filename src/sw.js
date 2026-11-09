/* Service worker APEX Hub: офлайн-кэш оболочки + приём push-уведомлений (Firebase Cloud Messaging). */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);
try { registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'))); } catch (e) { /* dev */ }

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { data: { title: 'APEX', body: event.data && event.data.text() } }; }
  // FCM кладёт наши поля в data; на всякий случай поддерживаем и notification.
  const p = Object.assign({}, d.notification || {}, d.data || {});
  const title = p.title || 'APEX';
  const options = {
    body: p.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    tag: p.tag || undefined,
    renotify: Boolean(p.tag),
    data: { url: p.url || '/' },
  };
  const jobs = [self.registration.showNotification(title, options)];
  if (p.badge !== undefined && self.navigator && 'setAppBadge' in self.navigator) {
    const n = Number(p.badge);
    jobs.push(n > 0 ? self.navigator.setAppBadge(n).catch(() => {}) : self.navigator.clearAppBadge().catch(() => {}));
  }
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL(self.registration.scope).href + '#' + (path.startsWith('/') ? path : '/' + path);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        try { await w.navigate(target); } catch (e) { /* iOS */ }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
