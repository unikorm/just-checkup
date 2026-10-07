import './helpers/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lastVisitOf, nextDueDate, summarizePlan, summarizePlans, updatePlan } from '../domain/plan.js';
import { softDelete } from '../domain/entity.js';
import { plan, appt, NOW } from './helpers/factories.js';

const TODAY = '2026-10-07';

describe('nextDueDate', () => {
  test('is null without any history', () => {
    assert.equal(nextDueDate(plan(), []), null);
  });

  test('uses lastVisitDate when there are no done appointments', () => {
    const p = plan({ lastVisitDate: '2026-04-15' });
    assert.equal(nextDueDate(p, []), '2026-10-15');
  });

  test('uses the latest DONE appointment of the plan', () => {
    const p = plan({ lastVisitDate: '2025-01-01' });
    const appts = [
      appt({ planId: p.id, dateTime: '2026-03-10T09:00' }, 'DONE'),
      appt({ planId: p.id, dateTime: '2026-05-31T14:00' }, 'DONE'),
      appt({ planId: p.id, dateTime: '2026-09-01T09:00' }, 'CANCELLED'),
      appt({ planId: p.id, dateTime: '2026-09-02T09:00' }, 'SCHEDULED'),
      appt({ planId: 'other', dateTime: '2026-09-03T09:00' }, 'DONE'),
    ];
    assert.equal(lastVisitOf(p, appts), '2026-05-31');
    assert.equal(nextDueDate(p, appts), '2026-11-30'); // May 31 + 6 months, clamped
  });

  test('takes the later of lastVisitDate and done appointments', () => {
    const p = plan({ lastVisitDate: '2026-08-01' });
    const appts = [appt({ planId: p.id, dateTime: '2026-03-10T09:00' }, 'DONE')];
    assert.equal(nextDueDate(p, appts), '2027-02-01');
  });

  test('ignores deleted appointments', () => {
    const p = plan();
    const done = softDelete(appt({ planId: p.id, dateTime: '2026-03-10T09:00' }, 'DONE'), NOW);
    assert.equal(nextDueDate(p, [done]), null);
  });

  test('works with every interval unit', () => {
    assert.equal(nextDueDate(plan({ lastVisitDate: '2026-01-31', interval: { amount: 1, unit: 'months' } }), []), '2026-02-28');
    assert.equal(nextDueDate(plan({ lastVisitDate: '2024-02-29', interval: { amount: 1, unit: 'years' } }), []), '2025-02-28');
    assert.equal(nextDueDate(plan({ lastVisitDate: '2026-10-01', interval: { amount: 3, unit: 'weeks' } }), []), '2026-10-22');
    assert.equal(nextDueDate(plan({ lastVisitDate: '2026-10-01', interval: { amount: 90, unit: 'days' } }), []), '2026-12-30');
  });
});

describe('summarizePlan status', () => {
  test('no-history', () => {
    const s = summarizePlan(plan(), [], TODAY);
    assert.equal(s.status, 'no-history');
    assert.equal(s.nextDue, null);
    assert.equal(s.daysUntilDue, null);
  });

  test('overdue', () => {
    const s = summarizePlan(plan({ lastVisitDate: '2026-01-01' }), [], TODAY);
    assert.equal(s.nextDue, '2026-07-01');
    assert.equal(s.status, 'overdue');
    assert.equal(s.daysUntilDue, -98);
  });

  test('due-soon uses the default 30-day window', () => {
    assert.equal(summarizePlan(plan({ lastVisitDate: '2026-05-06' }), [], TODAY).status, 'due-soon'); // due 11-06, 30 days
    assert.equal(summarizePlan(plan({ lastVisitDate: '2026-05-08' }), [], TODAY).status, 'later'); // due 11-08, 32 days
  });

  test('due-soon respects remindBeforeDays', () => {
    const p = plan({ lastVisitDate: '2026-04-10', remindBeforeDays: 3 }); // due 10-10
    assert.equal(summarizePlan(p, [], TODAY).status, 'due-soon');
    const p2 = plan({ lastVisitDate: '2026-04-11', remindBeforeDays: 3 }); // due 10-11
    assert.equal(summarizePlan(p2, [], TODAY).status, 'later');
  });

  test('due today counts as due-soon even with remindBeforeDays 0', () => {
    const p = plan({ lastVisitDate: '2026-04-07', remindBeforeDays: 0 });
    assert.equal(summarizePlan(p, [], TODAY).status, 'due-soon');
  });

  test('booked when a scheduled appointment exists from today on', () => {
    const p = plan({ lastVisitDate: '2026-01-01' });
    const future = appt({ planId: p.id, dateTime: '2026-10-07T08:00' });
    const s = summarizePlan(p, [future], TODAY);
    assert.equal(s.status, 'booked');
    assert.equal(s.nextAppointment, future);
  });

  test('a past scheduled appointment does not count as booked', () => {
    const p = plan({ lastVisitDate: '2026-01-01' });
    const past = appt({ planId: p.id, dateTime: '2026-10-06T08:00' });
    assert.equal(summarizePlan(p, [past], TODAY).status, 'overdue');
  });

  test('summarizePlans skips deleted plans', () => {
    const live = plan();
    const gone = softDelete(plan(), NOW);
    assert.deepEqual(summarizePlans([live, gone], [], TODAY).map((s) => s.plan.id), [live.id]);
  });
});

test('updatePlan bumps updatedAt and keeps identity', () => {
  const p = plan();
  const later = new Date(NOW.getTime() + 60_000);
  const u = updatePlan(p, { name: 'Eye exam', notes: 'x', interval: { amount: 1, unit: 'years' }, lastVisitDate: null, remindBeforeDays: 14 }, later);
  assert.equal(u.id, p.id);
  assert.equal(u.createdAt, p.createdAt);
  assert.equal(u.updatedAt, later.toISOString());
  assert.equal(u.name, 'Eye exam');
  assert.equal(p.name, 'Dentist', 'original is not mutated');
});
