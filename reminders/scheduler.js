// @ts-check
/**
 * v1 reminder delivery without a server.
 *
 * Browsers cannot wake a closed web app at a set time, so reminders are
 * checked when the app opens, when it becomes visible again, whenever the
 * data changes, and by a timer for the next reminder while the app stays
 * open. A log in the store's meta area makes sure each reminder is shown
 * as a notification only once.
 *
 * With a backend later, a PushScheduler can take the same allReminders()
 * output and register it with the server instead (or in addition).
 */
import { activeReminders, nextFireTime, pruneNotifiedLog, toNotify } from './compute.js';
import { META_KEYS } from '../storage/store.js';

/** @typedef {import('./compute.js').Reminder} Reminder */
/** @typedef {import('./notifier.js').Notifier} Notifier */
/** @typedef {import('./notifier.js').NotificationMessage} NotificationMessage */
/** @typedef {import('../storage/store.js').Store} Store */

/** Re-check at least this often while open, to survive sleep/clock changes. */
const MAX_TIMER_MS = 60 * 60 * 1000;

/**
 * @param {{
 *   store: Store,
 *   notifier: Notifier,
 *   getReminders: () => Reminder[],
 *   toMessage: (reminder: Reminder) => NotificationMessage,
 *   now: () => Date,
 * }} deps
 */
export function createReminderScheduler({ store, notifier, getReminders, toMessage, now }) {
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  /** @type {Promise<void>} */
  let queue = Promise.resolve();
  let started = false;

  async function runCheck() {
    const reminders = getReminders();
    const current = now();
    const stored = await store.meta.get(META_KEYS.notifiedReminders);
    const log = new Set(Array.isArray(stored) ? stored.filter((k) => typeof k === 'string') : []);

    let changed = false;
    for (const reminder of toNotify(activeReminders(reminders, current), log)) {
      if (await notifier.notify(toMessage(reminder))) {
        log.add(reminder.key);
        changed = true;
      }
    }
    const pruned = pruneNotifiedLog(log, reminders);
    if (changed || pruned.length !== log.size) await store.meta.set(META_KEYS.notifiedReminders, pruned);

    clearTimeout(timer);
    if (!started) return;
    const next = nextFireTime(reminders, current);
    const delay = next ? Math.min(Math.max(next.getTime() - current.getTime(), 0) + 500, MAX_TIMER_MS) : MAX_TIMER_MS;
    timer = setTimeout(check, delay);
  }

  /** Serialized so overlapping triggers never double-notify. */
  function check() {
    queue = queue.then(runCheck).catch((err) => console.warn('Reminder check failed', err));
    return queue;
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };

  return {
    check,
    start() {
      started = true;
      document.addEventListener('visibilitychange', onVisible);
      return check();
    },
    stop() {
      started = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

/** @typedef {ReturnType<typeof createReminderScheduler>} ReminderScheduler */
