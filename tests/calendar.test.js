import './helpers/setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentsOn, dueToBook, markersByDate, unconfirmedAppointments, upcomingAppointments } from '../domain/calendar.js';
import { summarizePlans } from '../domain/plan.js';
import { softDelete } from '../domain/entity.js';
import { weekDates } from '../domain/dates.js';
import { appt, plan, NOW } from './helpers/factories.js';

const TODAY = '2026-10-07';
const NOW_LOCAL = '2026-10-07T12:00';

test('upcoming and unconfirmed split at the current time', () => {
  const morning = appt({ dateTime: '2026-10-07T09:00' });
  const evening = appt({ dateTime: '2026-10-07T18:00' });
  const next = appt({ dateTime: '2026-10-09T08:00' });
  const done = appt({ dateTime: '2026-10-08T08:00' }, 'DONE');
  const cancelled = appt({ dateTime: '2026-10-08T08:00' }, 'CANCELLED');
  const deleted = softDelete(appt({ dateTime: '2026-10-08T08:00' }), NOW);
  const all = [next, done, evening, cancelled, morning, deleted];

  assert.deepEqual(upcomingAppointments(all, NOW_LOCAL), [evening, next]);
  assert.deepEqual(unconfirmedAppointments(all, NOW_LOCAL), [morning]);
});

test('dueToBook: overdue first, then due-soon by date, then no-history', () => {
  const soon = plan({ name: 'Soon', lastVisitDate: '2026-04-20' }); // due 10-20
  const sooner = plan({ name: 'Sooner', lastVisitDate: '2026-04-10' }); // due 10-10
  const overdue = plan({ name: 'Overdue', lastVisitDate: '2026-01-01' });
  const never = plan({ name: 'Never' });
  const later = plan({ name: 'Later', lastVisitDate: '2026-09-01' });
  const booked = plan({ name: 'Booked', lastVisitDate: '2026-01-01' });
  const appts = [appt({ planId: booked.id, dateTime: '2026-10-30T10:00' })];

  const result = dueToBook(summarizePlans([soon, sooner, overdue, never, later, booked], appts, TODAY));
  assert.deepEqual(result.map((s) => s.plan.name), ['Overdue', 'Sooner', 'Soon', 'Never']);
});

test('markersByDate collects appointments and unbooked due plans', () => {
  const week = weekDates(TODAY);
  const a1 = appt({ dateTime: '2026-10-08T10:00' });
  const a2 = appt({ dateTime: '2026-10-08T08:00' }, 'DONE');
  const cancelled = appt({ dateTime: '2026-10-09T08:00' }, 'CANCELLED');
  const outside = appt({ dateTime: '2026-10-20T08:00' });
  const due = plan({ lastVisitDate: '2026-04-10' }); // due 10-10
  const bookedPlan = plan({ lastVisitDate: '2026-04-11' }); // due 10-11 but booked
  const booking = appt({ planId: bookedPlan.id, dateTime: '2026-10-30T10:00' });

  const markers = markersByDate(week, [a1, a2, cancelled, outside, booking], summarizePlans([due, bookedPlan], [booking], TODAY));
  assert.equal(markers.size, 7);
  assert.deepEqual(markers.get('2026-10-08')?.appointments, [a2, a1]);
  assert.deepEqual(markers.get('2026-10-09')?.appointments, []);
  assert.deepEqual(markers.get('2026-10-10')?.duePlans, [due]);
  assert.deepEqual(markers.get('2026-10-11')?.duePlans, []);
});

test('appointmentsOn includes any status but not deleted', () => {
  const a = appt({ dateTime: '2026-10-08T10:00' }, 'CANCELLED');
  const b = softDelete(appt({ dateTime: '2026-10-08T11:00' }), NOW);
  assert.deepEqual(appointmentsOn([a, b], '2026-10-08'), [a]);
});
