import './helpers/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../domain/dates.js';

describe('parsing', () => {
  test('parseLocalDate accepts real dates only', () => {
    assert.deepEqual(d.parseLocalDate('2026-10-07'), { year: 2026, month: 10, day: 7 });
    assert.deepEqual(d.parseLocalDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
    for (const bad of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-7', '26-10-07', '', null, 20261007, '2026-10-07T10:00']) {
      assert.equal(d.parseLocalDate(bad), null, String(bad));
    }
  });

  test('parseLocalDateTime validates time range', () => {
    assert.deepEqual(d.parseLocalDateTime('2026-10-07T23:59'), { year: 2026, month: 10, day: 7, hour: 23, minute: 59 });
    assert.equal(d.parseLocalDateTime('2026-10-07T24:00'), null);
    assert.equal(d.parseLocalDateTime('2026-10-07T10:60'), null);
    assert.equal(d.parseLocalDateTime('2026-10-07 10:00'), null);
    assert.equal(d.parseLocalDateTime('2026-10-07T10:00:00'), null);
  });

  test('format round-trips and pads', () => {
    assert.equal(d.formatLocalDate({ year: 987, month: 3, day: 4 }), '0987-03-04');
    assert.equal(d.formatLocalDateTime({ year: 2026, month: 1, day: 2, hour: 3, minute: 4 }), '2026-01-02T03:04');
  });

  test('datePart / timePart / combine', () => {
    assert.equal(d.datePart('2026-10-07T09:30'), '2026-10-07');
    assert.equal(d.timePart('2026-10-07T09:30'), '09:30');
    assert.equal(d.combineDateTime('2026-10-07', '09:30'), '2026-10-07T09:30');
  });

  test('isValidTime', () => {
    assert.ok(d.isValidTime('00:00'));
    assert.ok(d.isValidTime('23:59'));
    assert.ok(!d.isValidTime('24:00'));
    assert.ok(!d.isValidTime('9:00'));
  });
});

describe('calendar arithmetic', () => {
  test('addDays crosses months, years and leap days', () => {
    assert.equal(d.addDays('2026-10-07', 1), '2026-10-08');
    assert.equal(d.addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(d.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(d.addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(d.addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(d.addDays('2026-10-07', 365), '2027-10-07');
  });

  test('addDays is not affected by DST transitions', () => {
    // Europe/Bratislava: DST ends 2026-10-25, starts 2026-03-29.
    assert.equal(d.addDays('2026-10-24', 1), '2026-10-25');
    assert.equal(d.addDays('2026-10-25', 1), '2026-10-26');
    assert.equal(d.addDays('2026-03-28', 2), '2026-03-30');
  });

  test('addMonths clamps to month end (Jan 31 + 1 month)', () => {
    assert.equal(d.addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(d.addMonths('2024-01-31', 1), '2024-02-29');
    assert.equal(d.addMonths('2026-03-31', 1), '2026-04-30');
    assert.equal(d.addMonths('2026-08-31', 6), '2027-02-28');
    assert.equal(d.addMonths('2026-01-15', 1), '2026-02-15');
  });

  test('addMonths handles year rollover and negatives', () => {
    assert.equal(d.addMonths('2026-11-30', 3), '2027-02-28');
    assert.equal(d.addMonths('2026-01-31', -1), '2025-12-31');
    assert.equal(d.addMonths('2026-03-31', -1), '2026-02-28');
    assert.equal(d.addMonths('2026-01-10', -13), '2024-12-10');
    assert.equal(d.addMonths('2026-05-05', 0), '2026-05-05');
  });

  test('addYears: Feb 29 + 1 year = Feb 28', () => {
    assert.equal(d.addYears('2024-02-29', 1), '2025-02-28');
    assert.equal(d.addYears('2024-02-29', 4), '2028-02-29');
  });

  test('addInterval for each unit', () => {
    assert.equal(d.addInterval('2026-10-07', { amount: 10, unit: 'days' }), '2026-10-17');
    assert.equal(d.addInterval('2026-10-07', { amount: 2, unit: 'weeks' }), '2026-10-21');
    assert.equal(d.addInterval('2026-10-31', { amount: 6, unit: 'months' }), '2027-04-30');
    assert.equal(d.addInterval('2026-10-07', { amount: 2, unit: 'years' }), '2028-10-07');
    assert.throws(() => d.addInterval('2026-10-07', /** @type {any} */ ({ amount: 1, unit: 'decades' })), RangeError);
  });

  test('addDays rejects invalid dates instead of guessing', () => {
    assert.throws(() => d.addDays('2026-02-30', 1), RangeError);
  });

  test('diffDays', () => {
    assert.equal(d.diffDays('2026-10-07', '2026-10-07'), 0);
    assert.equal(d.diffDays('2026-10-07', '2026-11-07'), 31);
    assert.equal(d.diffDays('2026-11-07', '2026-10-07'), -31);
    assert.equal(d.diffDays('2026-03-28', '2026-03-30'), 2);
  });

  test('isoWeekday and startOfWeek (Monday-first)', () => {
    assert.equal(d.isoWeekday('2026-10-05'), 1); // Monday
    assert.equal(d.isoWeekday('2026-10-07'), 3); // Wednesday
    assert.equal(d.isoWeekday('2026-10-11'), 7); // Sunday
    assert.equal(d.isoWeekday('1970-01-01'), 4);
    assert.equal(d.isoWeekday('1969-12-29'), 1);
    assert.equal(d.startOfWeek('2026-10-11'), '2026-10-05');
    assert.equal(d.startOfWeek('2026-10-05'), '2026-10-05');
    assert.equal(d.startOfWeek('2027-01-01'), '2026-12-28');
  });

  test('weekDates returns Mon..Sun', () => {
    assert.deepEqual(d.weekDates('2026-10-07'), [
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
  });

  test('month helpers and 6-week grid', () => {
    assert.equal(d.startOfMonth('2026-10-07'), '2026-10-01');
    assert.equal(d.endOfMonth('2026-02-07'), '2026-02-28');
    assert.equal(d.endOfMonth('2024-02-07'), '2024-02-29');
    const grid = d.monthGridDates('2026-10-07');
    assert.equal(grid.length, 42);
    assert.equal(grid[0], '2026-09-28'); // Monday before Oct 1 (Thursday)
    assert.equal(grid[41], '2026-11-08');
    assert.ok(d.isSameMonth('2026-10-01', '2026-10-31'));
    assert.ok(!d.isSameMonth('2026-10-01', '2026-11-01'));
  });

  test('compare / maxOf / isWithin', () => {
    assert.equal(d.compare('2026-10-07', '2026-10-08'), -1);
    assert.equal(d.compare('2026-10-07T10:00', '2026-10-07T09:00'), 1);
    assert.equal(d.maxOf('2026-01-01', '2025-12-31'), '2026-01-01');
    assert.ok(d.isWithin('2026-10-07', '2026-10-01', '2026-10-07'));
    assert.ok(!d.isWithin('2026-10-08', '2026-10-01', '2026-10-07'));
  });
});

describe('zone-aware conversions', () => {
  test('todayLocal uses local, not UTC, calendar date', () => {
    // 23:30 UTC on Oct 7 is already Oct 8 in Bratislava (UTC+2).
    assert.equal(d.todayLocal(new Date('2026-10-07T23:30:00Z')), '2026-10-08');
    assert.equal(d.nowLocalDateTime(new Date('2026-10-07T23:30:00Z')), '2026-10-08T01:30');
  });

  test('localDateTimeToDate interprets wall-clock time locally', () => {
    assert.equal(d.localDateTimeToDate('2026-10-07T09:30').toISOString(), '2026-10-07T07:30:00.000Z'); // CEST
    assert.equal(d.localDateTimeToDate('2026-12-07T09:30').toISOString(), '2026-12-07T08:30:00.000Z'); // CET
  });

  test('localDateToDate lands on the same calendar day', () => {
    const date = d.localDateToDate('2026-10-07');
    assert.equal(date.getDate(), 7);
    assert.equal(date.getMonth(), 9);
  });

  test('reminderFireDate: day offsets keep wall-clock time across DST', () => {
    // DST ends 2026-10-25 03:00 -> 02:00. 1 day before Oct 26 09:00 is Oct 25 09:00 local.
    const fire = d.reminderFireDate('2026-10-26T09:00', { amount: 1, unit: 'days' });
    assert.equal(fire.toISOString(), '2026-10-25T08:00:00.000Z');
    assert.equal(fire.getHours(), 9);
  });

  test('reminderFireDate: hour offsets are exact durations', () => {
    const start = d.localDateTimeToDate('2026-10-25T04:00');
    const fire = d.reminderFireDate('2026-10-25T04:00', { amount: 3, unit: 'hours' });
    assert.equal(start.getTime() - fire.getTime(), 3 * 3600_000);
    const weekly = d.reminderFireDate('2026-10-20T09:30', { amount: 1, unit: 'weeks' });
    assert.equal(weekly.getDate(), 13);
    assert.equal(weekly.getHours(), 9);
  });

  test('offsetToMinutes', () => {
    assert.equal(d.offsetToMinutes({ amount: 2, unit: 'hours' }), 120);
    assert.equal(d.offsetToMinutes({ amount: 1, unit: 'weeks' }), 10080);
  });
});
