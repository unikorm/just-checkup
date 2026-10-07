// @ts-check
/**
 * Notification delivery. The scheduler only knows the Notifier interface, so
 * other channels (in-app only, Web Push from a server) can be swapped in.
 */

/**
 * @typedef {object} NotificationMessage
 * @property {string} tag    one notification per tag; repeats replace it
 * @property {string} title
 * @property {string} body
 * @property {string} url    in-app route to open on click, e.g. '#/edit/<id>'
 */

/**
 * @typedef {object} Notifier
 * @property {(message: NotificationMessage) => Promise<boolean>} notify  true if shown
 */

const ICON = 'assets/icons/icon-192.png';

/**
 * Shows system notifications. Goes through the service worker when there is
 * one (required on Android, and lets a click open the app); falls back to
 * the page-level Notification constructor.
 * @returns {Notifier}
 */
export function createBrowserNotifier() {
  return {
    async notify({ tag, title, body, url }) {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration) {
          await registration.showNotification(title, { body, tag, icon: ICON, badge: ICON, data: { url } });
          return true;
        }
        const n = new Notification(title, { body, tag, icon: ICON });
        n.onclick = () => {
          window.focus();
          location.hash = url;
          n.close();
        };
        return true;
      } catch (err) {
        console.warn('Notification failed', err);
        return false;
      }
    },
  };
}
