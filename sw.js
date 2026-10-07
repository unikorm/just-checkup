// @ts-check
/// <reference lib="webworker" />
/**
 * Service worker: offline app shell, notification clicks, and a push
 * handler ready for when a backend exists.
 *
 * Caching:
 * - Production: cache-first from a versioned cache. Bump CACHE_VERSION on
 *   every deploy; the page then offers "Update ready – Reload".
 * - localhost: network-first (so edits show up immediately), falling back
 *   to the cache when offline.
 *
 * Keep APP_SHELL in sync with the files the app loads. The test
 * tests/precache.test.js fails if a file is missing.
 */

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const CACHE_VERSION = 'v1';
const CACHE_NAME = `just-checkup-${CACHE_VERSION}`;
const DEV = sw.location.hostname === 'localhost' || sw.location.hostname === '127.0.0.1';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'styles/tokens.css',
  'styles/base.css',
  'styles/components.css',
  'app/clock.js',
  'app/services.js',
  'app/state.js',
  'domain/appointment.js',
  'domain/calendar.js',
  'domain/constants.js',
  'domain/dates.js',
  'domain/entity.js',
  'domain/merge.js',
  'domain/plan.js',
  'domain/snapshot.js',
  'domain/types.js',
  'domain/validation.js',
  'reminders/compute.js',
  'reminders/ics.js',
  'reminders/notifier.js',
  'reminders/permission.js',
  'reminders/scheduler.js',
  'storage/index.js',
  'storage/indexeddb-store.js',
  'storage/memory-store.js',
  'storage/persist.js',
  'storage/store.js',
  'ui/colors.js',
  'ui/components/cards.js',
  'ui/components/dialog.js',
  'ui/components/field.js',
  'ui/components/notification-prompt.js',
  'ui/components/reminder-banner.js',
  'ui/components/reminder-picker.js',
  'ui/components/toast.js',
  'ui/context.js',
  'ui/dom.js',
  'ui/download.js',
  'ui/format.js',
  'ui/ics-action.js',
  'ui/icons.js',
  'ui/main.js',
  'ui/pwa.js',
  'ui/reminder-text.js',
  'ui/router.js',
  'ui/screens/calendar.js',
  'ui/screens/edit.js',
  'ui/screens/settings.js',
];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((path) => new Request(path, { cache: 'reload' })))),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('just-checkup-') && k !== CACHE_NAME).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // All routes are hash-based, so every navigation is the app shell.
  const key = request.mode === 'navigate' ? 'index.html' : request;
  event.respondWith(DEV ? networkFirst(request, key) : cacheFirst(request, key));
});

/**
 * @param {Request} request
 * @param {RequestInfo} key
 */
async function cacheFirst(request, key) {
  const cached = await caches.match(key, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
  return response;
}

/**
 * @param {Request} request
 * @param {RequestInfo} key
 */
async function networkFirst(request, key) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE_NAME)).put(key, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(key, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

// Clicking a reminder notification focuses the app (or opens it) on the item.
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = /** @type {{ url?: string }} */ (event.notification.data ?? {}).url ?? '#/';
  const target = new URL(`./${hash}`, sw.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = /** @type {WindowClient|undefined} */ (windows[0]);
      if (client) {
        await client.focus();
        return client.navigate(target).catch(() => undefined);
      }
      return sw.clients.openWindow(target);
    })(),
  );
});

// Web Push (future): a backend sends { title, body, tag, url } and this shows
// it. Nothing sends pushes in v1; this exists so adding a server needs no
// service worker changes.
sw.addEventListener('push', (event) => {
  /** @type {{ title?: string, body?: string, tag?: string, url?: string }} */
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    sw.registration.showNotification(data.title ?? 'Just Checkup', {
      body: data.body ?? '',
      tag: data.tag,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      data: { url: data.url ?? '#/' },
    }),
  );
});
