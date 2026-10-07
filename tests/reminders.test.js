import './helpers/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeReminders,
  allReminders,
  appointmentReminders,
  bannerItems,
  nextFireTime,
  planReminders,
  pruneNotifiedLog,
  toNotify,
} from '../reminders/compute.js';
import { summarizePlan, summarizePlans } from '../domain/plan.js';
import { softDelete } from '../domain/entity.js';
import { appt, plan, NOW } from './helpers/factories.js';

const TODAY = '2026-10-07';
const at = (iso) => new Date(iso);

describe('appointmentReminders', () => {
  test('one per offset, fired before local start time', () => {
    const a = appt({ dateTime: '2026-10-20T09:30', reminderOffsets: [{ amount: 1, unit: 'days' }, { amount: 2, unit: 'hours' }] });
    const [day, hours] = appointmentReminders(a);
    assert.equal(day.fireAt, '2026-10-19T07:30:00.000Z'); // 09:30 CEST
    assert.equal(hours.fireAt, '2026-10-20T05:30:00.000Z');
    assert.equal(day.startsAt, '2026-10-20T07:30:00.000Z');
    assert.equal(day.key, `appt:${a.id}:2026-10-20T09:30:1440`);
  });

  test('keys change when rescheduled so the reminder fires again', () => {
    const a = appt({ reminderOffsets: [{ amount: 1, unit: 'hours' }] });
    const moved = { ...a, dateTime: '2026-10-21T09:30' };
    assert.notEqual(appointmentReminders(a)[0].key, appointmentReminders(moved)[0].key);
  });

  test('none for done, cancelled or deleted appointments', () => {
    const offsets = [{ amount: 1, unit: 'hours' }];
    assert.deepEqual(appointmentReminders(appt({ reminderOffsets: offsets }, 'DONE')), []);
    assert.deepEqual(appointmentReminders(appt({ reminderOffsets: offsets }, 'CANCELLED')), []);
    assert.deepEqual(appointmentReminders(softDelete(appt({ reminderOffsets: offsets }), NOW)), []);
  });
});

describe('planReminders', () => {
  test('fires remindBeforeDays before due, at 09:00 local', () => {
    const p = plan({ lastVisitDate: '2026-04-20', remindBeforeDays: 14 }); // due 10-20
    const [r] = planReminders(summarizePlan(p, [], TODAY));
    assert.equal(r.dueDate, '2026-10-20');
    assert.equal(r.fireAt, '2026-10-06T07:00:00.000Z');
    assert.equal(r.key, `plan:${p.id}:2026-10-20`);
  });

  test('none without remindBeforeDays, without history, or once booked', () => {
    assert.deepEqual(planReminders(summarizePlan(plan({ lastVisitDate: '2026-04-20' }), [], TODAY)), []);
    assert.deepEqual(planReminders(summarizePlan(plan({ remindBeforeDays: 7 }), [], TODAY)), []);
    const p = plan({ lastVisitDate: '2026-04-20', remindBeforeDays: 14 });
    const booking = appt({ planId: p.id, dateTime: '2026-10-25T10:00' });
    assert.deepEqual(planReminders(summarizePlan(p, [booking], TODAY)), []);
  });
});

describe('active / next / notify', () => {
  const a = appt({ dateTime: '2026-10-07T15:00', reminderOffsets: [{ amount: 2, unit: 'hours' }, { amount: 1, unit: 'days' }] });
  const later = appt({ dateTime: '2026-10-09T08:30', reminderOffsets: [{ amount: 1, unit: 'days' }] });
  const reminders = allReminders([a, later], []);

  test('allReminders is sorted by fire time', () => {
    assert.deepEqual(reminders.map((r) => r.fireAt), [...reminders.map((r) => r.fireAt)].sort());
  });

  test('active means fired and the appointment has not started', () => {
    // 12:00 local: the 1-day reminder fired yesterday, 2-hour fires at 13:00.
    const noon = at('2026-10-07T10:00:00Z');
    assert.deepEqual(activeReminders(reminders, noon).map((r) => r.key), [`appt:${a.id}:2026-10-07T15:00:1440`]);
    const afterStart = at('2026-10-07T13:30:00Z'); // 15:30 local
    assert.deepEqual(activeReminders(reminders, afterStart).map((r) => r.entityId), []);
  });

  test('nextFireTime finds the next pending reminder', () => {
    assert.equal(nextFireTime(reminders, at('2026-10-07T10:00:00Z'))?.toISOString(), '2026-10-07T11:00:00.000Z');
    assert.equal(nextFireTime(reminders, at('2026-10-30T00:00:00Z')), null);
  });

  test('toNotify skips logged keys; prune drops stale keys', () => {
    const active = activeReminders(reminders, at('2026-10-07T10:00:00Z'));
    assert.equal(toNotify(active, new Set([active[0].key])).length, 0);
    assert.equal(toNotify(active, new Set()).length, 1);
    assert.deepEqual(pruneNotifiedLog(['gone', active[0].key], reminders), [active[0].key]);
  });
});

describe('bannerItems', () => {
  test('lists appointments within 24h, active reminders, overdue and reminded plans', () => {
    const soon = appt({ title: 'Soon', dateTime: '2026-10-08T09:00' }); // within 24h
    const farWithReminder = appt({ title: 'Far', dateTime: '2026-10-09T09:00', reminderOffsets: [{ amount: 2, unit: 'days' }] });
    const farNoReminder = appt({ title: 'Quiet', dateTime: '2026-10-12T09:00' });
    const past = appt({ title: 'Past', dateTime: '2026-10-07T08:00' });
    const overdue = plan({ name: 'Overdue', lastVisitDate: '2026-01-01' });
    const reminded = plan({ name: 'Reminded', lastVisitDate: '2026-04-15', remindBeforeDays: 10 }); // due 10-15, fired 10-05
    const quiet = plan({ name: 'Quiet plan', lastVisitDate: '2026-04-15' }); // due soon but no reminder
    const items = bannerItems({
      appointments: [farNoReminder, farWithReminder, soon, past],
      summaries: summarizePlans([overdue, reminded, quiet], [], TODAY),
      now: NOW,
    });
    assert.deepEqual(items.map((i) => [i.title, i.tone]), [
      ['Soon', 'soon'],
      ['Far', 'soon'],
      ['Overdue', 'overdue'],
      ['Reminded', 'due'],
    ]);
  });
});
