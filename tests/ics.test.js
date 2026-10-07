import './helpers/setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentToIcs, escapeText, foldLine, icsFileName, triggerFor } from '../reminders/ics.js';
import { appt, NOW } from './helpers/factories.js';

test('escapeText', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), String.raw`a\,b\;c\\d\ne`);
});

test('foldLine keeps lines within 75 octets and does not split characters', () => {
  const line = `DESCRIPTION:${'ž'.repeat(100)}`;
  const folded = foldLine(line);
  const parts = folded.split('\r\n');
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75, p);
  assert.equal(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(''), line);
  assert.equal(foldLine('SHORT:x'), 'SHORT:x');
});

test('triggerFor', () => {
  assert.equal(triggerFor({ amount: 15, unit: 'minutes' }), '-PT15M');
  assert.equal(triggerFor({ amount: 2, unit: 'hours' }), '-PT2H');
  assert.equal(triggerFor({ amount: 1, unit: 'days' }), '-P1D');
  assert.equal(triggerFor({ amount: 1, unit: 'weeks' }), '-P1W');
});

test('appointmentToIcs builds a valid VEVENT with alarms', () => {
  const a = appt({
    title: 'Dentist, check-up',
    dateTime: '2026-10-20T09:30',
    durationMinutes: 45,
    location: 'Main St 1; floor 2',
    notes: 'Bring card\nArrive early',
    reminderOffsets: [{ amount: 1, unit: 'days' }, { amount: 2, unit: 'hours' }],
  });
  const ics = appointmentToIcs(a, { now: NOW });
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'all line breaks are CRLF');
  const lines = ics.trimEnd().split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes(`UID:${a.id}@just-checkup`));
  assert.ok(lines.includes('DTSTART:20261020T073000Z'));
  assert.ok(lines.includes('DTEND:20261020T081500Z'));
  assert.ok(lines.includes('DTSTAMP:20261007T100000Z'));
  assert.ok(lines.includes(String.raw`SUMMARY:Dentist\, check-up`));
  assert.ok(lines.includes(String.raw`LOCATION:Main St 1\; floor 2`));
  assert.ok(lines.includes(String.raw`DESCRIPTION:Bring card\nArrive early`));
  assert.ok(lines.includes('STATUS:CONFIRMED'));
  assert.equal(lines.filter((l) => l === 'BEGIN:VALARM').length, 2);
  assert.ok(lines.includes('TRIGGER:-P1D'));
  assert.ok(lines.includes('TRIGGER:-PT2H'));
  assert.ok(lines.includes('SEQUENCE:0'));
});

test('winter appointments use the winter UTC offset', () => {
  const ics = appointmentToIcs(appt({ dateTime: '2026-12-01T09:30' }), { now: NOW });
  assert.match(ics, /DTSTART:20261201T083000Z/);
  assert.ok(!ics.includes('VALARM'));
  assert.ok(!ics.includes('LOCATION'));
});

test('cancelled status and sequence grows with edits', () => {
  const a = { ...appt({}, 'CANCELLED'), updatedAt: new Date(NOW.getTime() + 90_000).toISOString() };
  const ics = appointmentToIcs(a, { now: NOW });
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /SEQUENCE:90/);
});

test('icsFileName', () => {
  assert.equal(icsFileName(appt({ title: 'Zubár – kontrola!', dateTime: '2026-10-20T09:30' })), 'zubar-kontrola-2026-10-20.ics');
  assert.equal(icsFileName(appt({ title: '???', dateTime: '2026-10-20T09:30' })), 'appointment-2026-10-20.ics');
});
