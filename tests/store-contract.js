// @ts-check
/**
 * Behaviour every Store implementation must have. Written against a minimal
 * test/assert API so the same suite runs in Node (MemoryStore, via node:test)
 * and in the browser (IndexedDbStore, via tests/browser/index.html).
 */
import { createPlan } from '../domain/plan.js';
import { createAppointment } from '../domain/appointment.js';
import { softDelete, touch } from '../domain/entity.js';

/** @typedef {import('../storage/store.js').Store} Store */
/**
 * @typedef {object} MiniAssert
 * @property {(actual: unknown, expected: unknown, msg?: string) => void} equal
 * @property {(actual: unknown, expected: unknown, msg?: string) => void} deepEqual
 * @property {(value: unknown, msg?: string) => void} ok
 */

const T0 = new Date('2026-10-01T08:00:00.000Z');
const T1 = new Date('2026-10-02T08:00:00.000Z');
const T2 = new Date('2026-10-03T08:00:00.000Z');

/** @param {string} id @param {Date} [now] */
const plan = (id, now = T0) =>
  createPlan({ name: `Plan ${id}`, notes: '', interval: { amount: 1, unit: 'years' }, lastVisitDate: null, remindBeforeDays: null }, { now, id });

/** @param {string} id @param {string|null} [planId] */
const appointment = (id, planId = null) =>
  createAppointment(
    { planId, title: `Appt ${id}`, dateTime: '2026-10-20T09:30', durationMinutes: 60, timeZone: null, location: '', notes: '', reminderOffsets: [{ amount: 1, unit: 'days' }] },
    { now: T0, id },
  );

/** @param {{ id: string }[]} list */
const ids = (list) => list.map((e) => e.id).sort();

/**
 * @param {{
 *   makeStore: () => Promise<Store>,
 *   test: (name: string, fn: () => Promise<void>) => unknown,
 *   assert: MiniAssert,
 * }} deps
 */
export function defineStoreContract({ makeStore, test, assert }) {
  test('put then get returns an equal copy', async () => {
    const store = await makeStore();
    const p = plan('p1');
    await store.plans.put(p);
    const got = await store.plans.get('p1');
    assert.deepEqual(got, p);
    if (got) got.name = 'mutated';
    assert.equal((await store.plans.get('p1'))?.name, 'Plan p1', 'stored value is isolated from callers');
    assert.equal(await store.plans.get('missing'), undefined);
    store.close();
  });

  test('put overwrites by id', async () => {
    const store = await makeStore();
    await store.plans.put(plan('p1'));
    await store.plans.put(touch(plan('p1'), { name: 'Renamed' }, T1));
    assert.deepEqual(ids(await store.plans.list()), ['p1']);
    assert.equal((await store.plans.get('p1'))?.name, 'Renamed');
    store.close();
  });

  test('list hides soft-deleted records unless asked', async () => {
    const store = await makeStore();
    await store.appointments.putMany([appointment('a1'), softDelete(appointment('a2'), T1)]);
    assert.deepEqual(ids(await store.appointments.list()), ['a1']);
    assert.deepEqual(ids(await store.appointments.list({ includeDeleted: true })), ['a1', 'a2']);
    store.close();
  });

  test('changedSince returns records updated strictly after, including tombstones', async () => {
    const store = await makeStore();
    await store.plans.putMany([plan('old', T0), plan('new', T2), softDelete(plan('gone', T0), T2)]);
    assert.deepEqual(ids(await store.plans.changedSince(T0.toISOString())), ['gone', 'new']);
    assert.deepEqual(ids(await store.plans.changedSince(T2.toISOString())), []);
    store.close();
  });

  test('collections are independent', async () => {
    const store = await makeStore();
    await store.plans.put(plan('x'));
    assert.deepEqual(await store.appointments.list(), []);
    store.close();
  });

  test('meta get/set', async () => {
    const store = await makeStore();
    assert.equal(await store.meta.get('nothing'), undefined);
    await store.meta.set('k', { a: [1, 2] });
    assert.deepEqual(await store.meta.get('k'), { a: [1, 2] });
    store.close();
  });

  test('replaceAll swaps the whole data set', async () => {
    const store = await makeStore();
    await store.plans.putMany([plan('p1'), plan('p2')]);
    await store.appointments.put(appointment('a1'));
    await store.replaceAll({ plans: [plan('p3')], appointments: [] });
    assert.deepEqual(ids(await store.plans.list({ includeDeleted: true })), ['p3']);
    assert.deepEqual(await store.appointments.list({ includeDeleted: true }), []);
    store.close();
  });

  test('subscribe reports writes until unsubscribed', async () => {
    const store = await makeStore();
    /** @type {import('../storage/store.js').StoreChange[]} */
    const seen = [];
    const off = store.subscribe((c) => seen.push(c));
    await store.plans.put(plan('p1'));
    await store.appointments.putMany([appointment('a1'), appointment('a2')]);
    await store.meta.set('k', 1);
    off();
    await store.plans.put(plan('p2'));
    assert.deepEqual(
      seen.map((c) => [c.scope, c.ids, c.external]),
      [['plans', ['p1'], false], ['appointments', ['a1', 'a2'], false], ['meta', ['k'], false]],
    );
    store.close();
  });
}
