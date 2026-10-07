import './helpers/setup.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../app/services.js';
import { createMemoryStore } from '../storage/memory-store.js';
import { nextDueDate } from '../domain/plan.js';

/** @type {Date} */
let now;
/** @type {ReturnType<typeof createMemoryStore>} */
let store;
/** @type {ReturnType<typeof createServices>} */
let svc;
let n = 0;

beforeEach(() => {
  now = new Date('2026-10-07T10:00:00.000Z');
  store = createMemoryStore();
  svc = createServices({ store, clock: { now: () => now }, newId: () => `id-${++n}`, timeZone: () => 'Europe/Bratislava' });
});

const planForm = { name: 'Dentist', notes: '', interval: { amount: '6', unit: 'months' }, lastVisitDate: '2026-03-01', remindBeforeDays: '' };
const apptForm = { title: 'Dentist', dateTime: '2026-10-20T09:30', location: '', notes: '', reminderOffsets: [{ amount: 1, unit: 'days' }] };

describe('services', () => {
  test('savePlan creates, then updates', async () => {
    const created = await svc.savePlan(planForm, null);
    assert.ok(created.ok);
    const updated = await svc.savePlan({ ...planForm, name: 'Dental hygiene' }, created.value.id);
    assert.ok(updated.ok);
    assert.equal(updated.value.id, created.value.id);
    assert.equal((await svc.loadAll()).plans.length, 1);
    assert.equal((await store.plans.get(created.value.id))?.name, 'Dental hygiene');
  });

  test('savePlan returns validation errors and writes nothing', async () => {
    const r = await svc.savePlan({ ...planForm, name: '' }, null);
    assert.ok(!r.ok && 'name' in r.errors);
    assert.equal((await svc.loadAll()).plans.length, 0);
  });

  test('saveAppointment stamps the device time zone and checks the plan exists', async () => {
    const r = await svc.saveAppointment(apptForm, null);
    assert.ok(r.ok);
    assert.equal(r.value.timeZone, 'Europe/Bratislava');
    assert.equal(r.value.status, 'SCHEDULED');
    const bad = await svc.saveAppointment({ ...apptForm, planId: 'nope' }, null);
    assert.ok(!bad.ok && 'planId' in bad.errors);
  });

  test('transitions go through the domain rules', async () => {
    const r = await svc.saveAppointment({ ...apptForm, dateTime: '2026-10-01T09:00' }, null);
    assert.ok(r.ok);
    const done = await svc.markDone(r.value.id);
    assert.ok(done.ok && done.value.status === 'DONE');
    const cancel = await svc.cancel(r.value.id);
    assert.ok(!cancel.ok, 'DONE cannot be cancelled');
    const reopened = await svc.reopen(r.value.id);
    assert.ok(reopened.ok && reopened.value.status === 'SCHEDULED');
    const moved = await svc.reschedule(r.value.id, '2026-11-11T11:00');
    assert.ok(moved.ok && moved.value.dateTime === '2026-11-11T11:00');
  });

  test('marking a plan appointment done moves the plan due date', async () => {
    const plan = await svc.savePlan(planForm, null);
    assert.ok(plan.ok);
    const visit = await svc.saveAppointment({ ...apptForm, planId: plan.value.id, dateTime: '2026-10-06T09:00' }, null);
    assert.ok(visit.ok);
    await svc.markDone(visit.value.id);
    const { plans, appointments } = await svc.loadAll();
    assert.equal(nextDueDate(plans[0], appointments), '2027-04-06');
  });

  test('delete is soft and hides records', async () => {
    const plan = await svc.savePlan(planForm, null);
    const a = await svc.saveAppointment(apptForm, null);
    assert.ok(plan.ok && a.ok);
    await svc.deletePlan(plan.value.id);
    await svc.deleteAppointment(a.value.id);
    assert.deepEqual(await svc.loadAll(), { plans: [], appointments: [] });
    assert.equal((await store.plans.list({ includeDeleted: true })).length, 1);
    assert.equal(await svc.find(plan.value.id), null);
    assert.ok(!(await svc.markDone(a.value.id)).ok);
  });

  test('logVisit records a DONE appointment and rejects future dates', async () => {
    const plan = await svc.savePlan(planForm, null);
    assert.ok(plan.ok);
    const visit = await svc.logVisit(plan.value.id, '2026-10-07');
    assert.ok(visit.ok);
    assert.equal(visit.value.status, 'DONE');
    assert.equal(visit.value.dateTime, '2026-10-07T12:00'); // local now
    assert.equal(visit.value.title, 'Dentist');
    const past = await svc.logVisit(plan.value.id, '2026-09-01');
    assert.ok(past.ok && past.value.dateTime === '2026-09-01T12:00');
    assert.ok(!(await svc.logVisit(plan.value.id, '2026-10-08')).ok);
  });

  test('find resolves either kind', async () => {
    const plan = await svc.savePlan(planForm, null);
    const a = await svc.saveAppointment(apptForm, null);
    assert.ok(plan.ok && a.ok);
    assert.equal((await svc.find(plan.value.id))?.kind, 'plan');
    assert.equal((await svc.find(a.value.id))?.kind, 'appointment');
    assert.equal(await svc.find('missing'), null);
  });
});

describe('export / import', () => {
  test('export includes tombstones and records the backup time', async () => {
    const p = await svc.savePlan(planForm, null);
    const a = await svc.saveAppointment(apptForm, null);
    assert.ok(p.ok && a.ok);
    await svc.deleteAppointment(a.value.id);
    const snap = await svc.exportSnapshot();
    assert.equal(snap.plans.length, 1);
    assert.equal(snap.appointments.length, 1);
    assert.ok(snap.appointments[0].deletedAt);
    assert.equal(await store.meta.get('lastBackupAt'), now.toISOString());
  });

  test('round trip into an empty store restores everything', async () => {
    await svc.savePlan(planForm, null);
    await svc.saveAppointment(apptForm, null);
    const json = JSON.parse(JSON.stringify(await svc.exportSnapshot()));

    const other = createServices({ store: createMemoryStore(), clock: { now: () => now } });
    const parsed = other.readSnapshot(json);
    assert.ok(parsed.ok);
    const summary = await other.importSnapshot(parsed.value, 'merge');
    assert.deepEqual(summary, { mode: 'merge', added: 2, updated: 0, unchanged: 0 });
    assert.deepEqual(await other.loadAll(), await svc.loadAll());
  });

  test('merge keeps the newer version of each record', async () => {
    const p = await svc.savePlan(planForm, null);
    assert.ok(p.ok);
    const backup = await svc.exportSnapshot();
    now = new Date(now.getTime() + 60_000);
    await svc.savePlan({ ...planForm, name: 'Newer local name' }, p.value.id);
    const r = await svc.importSnapshot(backup, 'merge');
    assert.deepEqual([r.added, r.updated, r.unchanged], [0, 0, 1]);
    assert.equal((await store.plans.get(p.value.id))?.name, 'Newer local name');
  });

  test('replace discards local data', async () => {
    const backup = await svc.exportSnapshot(); // empty
    await svc.savePlan(planForm, null);
    await svc.importSnapshot(backup, 'replace');
    assert.deepEqual(await svc.loadAll(), { plans: [], appointments: [] });
  });

  test('readSnapshot rejects garbage', () => {
    assert.ok(!svc.readSnapshot({ hello: 'world' }).ok);
  });
});
