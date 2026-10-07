// @ts-check
/**
 * App startup: open storage, load data, route, render.
 */
import { openStore } from '../storage/index.js';
import { requestPersistenceOnFirstRun } from '../storage/persist.js';
import { createServices } from '../app/services.js';
import { createAppState } from '../app/state.js';
import { systemClock } from '../app/clock.js';
import { parseHash } from './router.js';
import { showToast } from './components/toast.js';
import { calendarScreen } from './screens/calendar.js';
import { editScreen } from './screens/edit.js';
import { settingsScreen } from './screens/settings.js';
import { h } from './dom.js';
import { createReminderScheduler } from '../reminders/scheduler.js';
import { createBrowserNotifier } from '../reminders/notifier.js';
import { allReminders } from '../reminders/compute.js';
import { summarizePlans } from '../domain/plan.js';
import { todayLocal } from '../domain/dates.js';
import { reminderMessage } from './reminder-text.js';
import { registerIcsAction } from './ics-action.js';

/** @typedef {import('./context.js').AppContext} AppContext */
/** @typedef {import('./context.js').Screen} Screen */
/** @typedef {import('./router.js').Route} Route */

const root = /** @type {HTMLElement} */ (document.getElementById('app'));

async function start() {
  const store = await openStore();
  const services = createServices({ store });
  const state = createAppState();

  const reload = async () => state.set(await services.loadAll());

  // Any write (here or in another tab) reloads the data. Writes come in
  // bursts, so they are coalesced; a write that lands mid-reload triggers
  // one more pass so nothing is missed.
  /** @type {Promise<void>|null} */
  let reloading = null;
  let dirty = false;
  const scheduleReload = () => {
    dirty = true;
    reloading ??= (async () => {
      try {
        while (dirty) {
          dirty = false;
          await reload();
        }
      } finally {
        reloading = null;
      }
    })();
    return reloading;
  };
  store.subscribe((change) => {
    if (change.scope !== 'meta') scheduleReload();
  });

  const scheduler = createReminderScheduler({
    store,
    notifier: createBrowserNotifier(),
    now: () => systemClock.now(),
    getReminders: () => {
      const { plans, appointments } = state.get();
      return allReminders(appointments, summarizePlans(plans, appointments, todayLocal(systemClock.now())));
    },
    toMessage: (reminder) => reminderMessage(reminder, systemClock.now()),
  });
  registerIcsAction();

  /** @type {Screen|null} */
  let current = null;
  let firstRender = true;

  /** @type {AppContext} */
  const ctx = {
    services,
    state,
    store,
    now: () => systemClock.now(),
    toast: showToast,
    reminders: { check: () => scheduler.check() },
    refresh: async () => {
      await scheduleReload();
      render({ keepFocus: true });
    },
  };

  /** @param {Route} route @returns {Screen} */
  function screenFor(route) {
    switch (route.name) {
      case 'calendar':
        return calendarScreen(ctx);
      case 'new':
      case 'edit':
        return editScreen(ctx, route);
      case 'settings':
        return settingsScreen(ctx);
      default:
        return {
          title: 'Not found',
          el: h('div', { class: 'screen' }, h('h1', { tabindex: '-1' }, 'Page not found'), h('p', null, h('a', { href: '#/' }, 'Back to the calendar'))),
        };
    }
  }

  /** @param {{ keepFocus?: boolean }} [options] */
  function render({ keepFocus = false } = {}) {
    const route = parseHash(location.hash);
    const scrollY = window.scrollY;
    current?.destroy?.();
    current = screenFor(route);
    root.replaceChildren(current.el);
    root.classList.toggle('is-wide', !!current.wide);
    document.title = `${current.title} · Just Checkup`;

    for (const link of document.querySelectorAll('.bottom-bar [data-route]')) {
      const active = /** @type {HTMLElement} */ (link).dataset.route === route.name;
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    if (keepFocus) {
      window.scrollTo(0, scrollY);
    } else if (!firstRender) {
      // Move focus to the new screen's heading so screen readers announce it.
      window.scrollTo(0, 0);
      /** @type {HTMLElement|null} */ (root.querySelector('h1'))?.focus({ preventScroll: true });
    }
    firstRender = false;
  }

  state.subscribe((data) => {
    current?.update?.(data);
    scheduler.check();
  });
  window.addEventListener('hashchange', async () => {
    // Render with fresh data when navigating right after a save.
    if (reloading) await reloading;
    render();
  });

  await reload();
  render();
  scheduler.start();
  requestPersistenceOnFirstRun(store).catch(() => {});

  if (store.kind === 'memory') {
    showToast('Storage is unavailable: changes will be lost when you close this tab.');
  }

  return ctx;
}

start().catch((err) => {
  console.error(err);
  root.replaceChildren(
    h('div', { class: 'empty', role: 'alert' }, 'Just Checkup could not start. ', err instanceof Error ? err.message : String(err)),
  );
});
