// @ts-check
/**
 * Service worker registration, "update ready" prompt, and the install
 * prompt (Chrome/Android only; iOS installs via Share → Add to Home Screen).
 */
import { h } from './dom.js';

/** @type {any} BeforeInstallPromptEvent (not in TS DOM lib) */
let deferredInstall = null;
/** @type {Set<() => void>} */
const installListeners = new Set();
let updateAccepted = false;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    for (const l of installListeners) l();
  });

  // Reload only when the user accepted an update. The very first install
  // also fires controllerchange (clients.claim), and must not reload the
  // page under the user's fingers.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateAccepted) return;
    updateAccepted = false;
    location.reload();
  });

  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      // Only offer an update if a previous version is controlling the page.
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
    })
    .catch((err) => console.warn('Service worker registration failed', err));
}

/** @param {ServiceWorker} worker */
function offerUpdate(worker) {
  if (document.querySelector('.update-bar')) return;
  const bar = h(
    'div',
    { class: 'update-bar', role: 'status' },
    h('span', null, 'A new version is ready.'),
    h('button', { type: 'button', class: 'btn btn--small btn--accent', onclick: () => {
      updateAccepted = true;
      worker.postMessage('SKIP_WAITING');
    } }, 'Reload'),
  );
  document.body.append(bar);
}

/** True when the browser offered an install prompt we can show. */
export const canInstall = () => deferredInstall !== null;

/** @param {() => void} listener */
export function onInstallAvailable(listener) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

/** @returns {Promise<boolean>} */
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  return outcome === 'accepted';
}

/** Running as an installed app (home screen / standalone window). */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
}
