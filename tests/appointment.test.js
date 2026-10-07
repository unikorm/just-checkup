import './helpers/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cancel, canTransition, markDone, reopen, reschedule, updateAppointment } from '../domain/appointment.js';
import { softDelete, restore, isLive } from '../domain/entity.js';
import { appt, NOW } from './helpers/factories.js';

const LATER = new Date(NOW.getTime() + 60_000);

describe('creation', () => {
  test('creates a SCHEDULED appointment with meta fields', () => {
    const a = appt();
    assert.equal(a.status, 'SCHEDULED');
    assert.equal(a.createdAt, NOW.toISOString());
    assert.equal(a.updatedAt, NOW.toISOString());
    assert.equal(a.deletedAt, null);
    assert.match(a.id, /^id-\d+$/);
  });
});

describe('status transitions', () => {
  test('transition table', () => {
    assert.ok(canTransition('SCHEDULED', 'DONE'));
    assert.ok(canTransition('SCHEDULED', 'CANCELLED'));
    assert.ok(canTransition('SCHEDULED', 'SCHEDULED'));
    assert.ok(canTransition('CANCELLED', 'SCHEDULED'));
    assert.ok(canTransition('DONE', 'SCHEDULED'));
    assert.ok(!canTransition('DONE', 'CANCELLED'));
    assert.ok(!canTransition('CANCELLED', 'DONE'));
  });

  test('markDone works for past and today, not the future', () => {
    const past = markDone(appt({ dateTime: '2026-10-01T09:00' }), LATER);
    assert.ok(past.ok && past.value.status === 'DONE' && past.value.updatedAt === LATER.toISOString());
    const laterToday = markDone(appt({ dateTime: '2026-10-07T18:00' }), LATER);
    assert.ok(laterToday.ok);
    const future = markDone(appt({ dateTime: '2026-10-08T09:00' }), LATER);
    assert.ok(!future.ok && 'status' in future.errors);
  });

  test('cancel then reschedule reactivates', () => {
    const c = cancel(appt(), LATER);
    assert.ok(c.ok);
    assert.equal(c.value.status, 'CANCELLED');
    const r = reschedule(c.value, '2026-11-01T10:00', LATER);
    assert.ok(r.ok);
    assert.equal(r.value.status, 'SCHEDULED');
    assert.equal(r.value.dateTime, '2026-11-01T10:00');
  });

  test('cannot cancel a done appointment, but can reopen it', () => {
    const done = appt({ dateTime: '2026-10-01T09:00' }, 'DONE');
    assert.ok(!cancel(done, LATER).ok);
    const r = reopen(done, LATER);
    assert.ok(r.ok && r.value.status === 'SCHEDULED');
  });

  test('reschedule rejects invalid date-times', () => {
    const r = reschedule(appt(), '2026-02-30T10:00', LATER);
    assert.ok(!r.ok && 'dateTime' in r.errors);
  });

  test('deleted appointments cannot transition', () => {
    const gone = softDelete(appt(), LATER);
    assert.ok(!cancel(gone, LATER).ok);
  });
});

test('updateAppointment keeps status and bumps updatedAt', () => {
  const a = appt({}, 'CANCELLED');
  const u = updateAppointment(a, { ...a, title: 'New title', reminderOffsets: [{ amount: 1, unit: 'days' }] }, LATER);
  assert.equal(u.status, 'CANCELLED');
  assert.equal(u.title, 'New title');
  assert.equal(u.updatedAt, LATER.toISOString());
  assert.equal(a.title, 'Checkup');
});

test('soft delete and restore', () => {
  const a = appt();
  const gone = softDelete(a, LATER);
  assert.equal(gone.deletedAt, LATER.toISOString());
  assert.equal(gone.updatedAt, LATER.toISOString());
  assert.ok(!isLive(gone));
  assert.ok(isLive(restore(gone, LATER)));
});
