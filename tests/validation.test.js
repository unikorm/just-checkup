import './helpers/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateAppointmentInput, validatePlanInput, validateReminderOffsets } from '../domain/validation.js';

const TODAY = '2026-10-07';

describe('validatePlanInput', () => {
  const good = { name: '  Dentist ', notes: '', interval: { amount: '6', unit: 'months' }, lastVisitDate: '2026-04-01', remindBeforeDays: '14' };

  test('accepts and normalizes form input', () => {
    const r = validatePlanInput(good, TODAY);
    assert.ok(r.ok);
    assert.deepEqual(r.value, {
      name: 'Dentist',
      notes: '',
      interval: { amount: 6, unit: 'months' },
      lastVisitDate: '2026-04-01',
      remindBeforeDays: 14,
    });
  });

  test('optional fields become null when blank', () => {
    const r = validatePlanInput({ ...good, lastVisitDate: '', remindBeforeDays: ' ' }, TODAY);
    assert.ok(r.ok);
    assert.equal(r.value.lastVisitDate, null);
    assert.equal(r.value.remindBeforeDays, null);
  });

  test('reports every invalid field', () => {
    const r = validatePlanInput(
      { name: '', notes: 'x'.repeat(2001), interval: { amount: '0', unit: 'months' }, lastVisitDate: '2026-10-08', remindBeforeDays: '-1' },
      TODAY,
    );
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ['interval', 'lastVisitDate', 'name', 'notes', 'remindBeforeDays']);
  });

  test('interval limits per unit and integer only', () => {
    assert.ok(validatePlanInput({ ...good, interval: { amount: 10, unit: 'years' } }, TODAY).ok);
    assert.ok(!validatePlanInput({ ...good, interval: { amount: 11, unit: 'years' } }, TODAY).ok);
    assert.ok(!validatePlanInput({ ...good, interval: { amount: '1.5', unit: 'months' } }, TODAY).ok);
    assert.ok(!validatePlanInput({ ...good, interval: { amount: 1, unit: 'hours' } }, TODAY).ok);
    assert.ok(!validatePlanInput({ ...good, interval: undefined }, TODAY).ok);
  });

  test('rejects impossible dates', () => {
    const r = validatePlanInput({ ...good, lastVisitDate: '2026-02-30' }, TODAY);
    assert.ok(!r.ok && r.errors.lastVisitDate === 'Enter a valid date.');
  });

  test('a last visit today is fine', () => {
    assert.ok(validatePlanInput({ ...good, lastVisitDate: TODAY }, TODAY).ok);
  });
});

describe('validateReminderOffsets', () => {
  test('dedupes equal durations and sorts earliest first', () => {
    const r = validateReminderOffsets([
      { amount: '2', unit: 'hours' },
      { amount: 1, unit: 'days' },
      { amount: 120, unit: 'minutes' },
    ]);
    assert.ok(r.ok);
    assert.deepEqual(r.value, [{ amount: 1, unit: 'days' }, { amount: 2, unit: 'hours' }]);
  });

  test('limits', () => {
    assert.ok(validateReminderOffsets(undefined).ok);
    assert.ok(!validateReminderOffsets([{ amount: 0, unit: 'hours' }]).ok);
    assert.ok(!validateReminderOffsets([{ amount: 5, unit: 'weeks' }]).ok);
    assert.ok(validateReminderOffsets([{ amount: 4, unit: 'weeks' }]).ok);
    assert.ok(!validateReminderOffsets([1, 2, 3, 4, 5, 6].map((n) => ({ amount: n, unit: 'hours' }))).ok);
    assert.ok(!validateReminderOffsets('nope').ok);
  });
});

describe('validateAppointmentInput', () => {
  const good = { title: 'Dentist', dateTime: '2026-10-20T09:30', location: ' Main St 1 ', notes: '', reminderOffsets: [] };

  test('accepts minimal input with defaults', () => {
    const r = validateAppointmentInput(good);
    assert.ok(r.ok);
    assert.equal(r.value.location, 'Main St 1');
    assert.equal(r.value.durationMinutes, 60);
    assert.equal(r.value.planId, null);
    assert.equal(r.value.timeZone, null);
  });

  test('requires title and a valid date-time', () => {
    const r = validateAppointmentInput({ ...good, title: ' ', dateTime: '' });
    assert.ok(!r.ok);
    assert.ok('title' in r.errors && 'dateTime' in r.errors);
    const r2 = validateAppointmentInput({ ...good, dateTime: '2026-10-20' });
    assert.ok(!r2.ok && 'dateTime' in r2.errors);
  });

  test('duration bounds', () => {
    assert.ok(!validateAppointmentInput({ ...good, durationMinutes: '2' }).ok);
    assert.ok(validateAppointmentInput({ ...good, durationMinutes: '30' }).ok);
  });

  test('surfaces reminder errors', () => {
    const r = validateAppointmentInput({ ...good, reminderOffsets: [{ amount: -1, unit: 'days' }] });
    assert.ok(!r.ok && 'reminderOffsets' in r.errors);
  });
});
