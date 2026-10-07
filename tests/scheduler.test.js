import './helpers/setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReminderScheduler } from '../reminders/scheduler.js';
import { allReminders } from '../reminders/compute.js';
import { createMemoryStore } from '../storage/memory-store.js';
import { META_KEYS } from '../storage/store.js';
import { appt } from './helpers/factories.js';

const a = appt({ title: 'Allergy shot', dateTime: '2026-10-07T15:00', reminderOffsets: [{ amount: 1, unit: 'days' }, { amount: 2, unit: 'hours' }] });

function setup(allow = true) {
  const store = createMemoryStore();
  /** @type {string[]} */
  const shown = [];
  let now = new Date('2026-10-07T10:00:00Z'); // 12:00 local: the 1-day reminder is active
  const scheduler = createReminderScheduler({
    store,
    notifier: { notify: async (m) => (allow ? (shown.push(m.tag), true) : false) },
    getReminders: () => allReminders([a], []),
    toMessage: (r) => ({ tag: r.key, title: r.title, body: '', url: `#/edit/${r.entityId}` }),
    now: () => now,
  });
  return { store, shown, scheduler, setNow: (/** @type {string} */ iso) => (now = new Date(iso)) };
}

test('notifies each active reminder once and logs it', async () => {
  const { store, shown, scheduler, setNow } = setup();
  await scheduler.check();
  await scheduler.check();
  assert.deepEqual(shown, [`appt:${a.id}:2026-10-07T15:00:1440`]);
  setNow('2026-10-07T11:30:00Z'); // 13:30 local: 2-hour reminder now active too
  await scheduler.check();
  assert.equal(shown.length, 2);
  assert.deepEqual((await store.meta.get(META_KEYS.notifiedReminders))?.length, 2);
});

test('does not log reminders that could not be shown', async () => {
  const { store, shown, scheduler } = setup(false);
  await scheduler.check();
  assert.deepEqual(shown, []);
  assert.equal(await store.meta.get(META_KEYS.notifiedReminders), undefined);
});

test('prunes log entries for reminders that no longer exist', async () => {
  const { store, scheduler } = setup();
  await store.meta.set(META_KEYS.notifiedReminders, ['appt:old:2026-01-01T09:00:60']);
  await scheduler.check();
  assert.deepEqual(await store.meta.get(META_KEYS.notifiedReminders), [`appt:${a.id}:2026-10-07T15:00:1440`]);
});
