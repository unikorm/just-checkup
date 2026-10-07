import './helpers/setup.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshot, parseSnapshot, SCHEMA_VERSION } from '../domain/snapshot.js';
import { mergeEntities } from '../domain/merge.js';
import { touch } from '../domain/entity.js';
import { appt, plan, NOW } from './helpers/factories.js';

describe('snapshot', () => {
  test('round-trips through JSON', () => {
    const p = plan({ lastVisitDate: '2026-01-01', remindBeforeDays: 7 });
    const a = appt({ planId: p.id, reminderOffsets: [{ amount: 1, unit: 'days' }] }, 'DONE');
    const snap = createSnapshot({ plans: [p], appointments: [a] }, NOW);
    assert.equal(snap.schemaVersion, SCHEMA_VERSION);

    const parsed = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value, snap);
  });

  test('drops unknown fields', () => {
    const p = { ...plan(), extra: 'x' };
    const parsed = parseSnapshot(createSnapshot({ plans: [/** @type {any} */ (p)], appointments: [] }, NOW));
    assert.ok(parsed.ok);
    assert.ok(!('extra' in parsed.value.plans[0]));
  });

  test('rejects foreign files, newer versions and invalid records', () => {
    assert.ok(!parseSnapshot(null).ok);
    assert.ok(!parseSnapshot({ app: 'other' }).ok);
    assert.ok(!parseSnapshot({ app: 'just-checkup', schemaVersion: SCHEMA_VERSION + 1, plans: [], appointments: [] }).ok);
    assert.ok(!parseSnapshot({ app: 'just-checkup', schemaVersion: 1, plans: {}, appointments: [] }).ok);

    const badAppt = { ...appt(), status: 'MAYBE' };
    const r = parseSnapshot({ app: 'just-checkup', schemaVersion: 1, plans: [], appointments: [badAppt] });
    assert.ok(!r.ok && /Appointment #1/.test(r.errors.file));

    const badPlan = { ...plan(), createdAt: 'yesterday' };
    assert.ok(!parseSnapshot({ app: 'just-checkup', schemaVersion: 1, plans: [badPlan], appointments: [] }).ok);
  });
});

describe('mergeEntities (last write wins)', () => {
  test('adds new, updates newer, keeps local when incoming is older or equal', () => {
    const later = new Date(NOW.getTime() + 60_000);
    const a = plan({ name: 'A' });
    const b = plan({ name: 'B' });
    const c = plan({ name: 'C' });
    const newerB = touch(b, { name: 'B2' }, later);
    const local = [a, touch(c, { name: 'C-local' }, later)];
    const incoming = [newerB, c, a];
    // b is not in local -> added; c incoming is older -> unchanged; a equal -> unchanged
    const r = mergeEntities(local, incoming);
    assert.deepEqual(r.toWrite, [newerB]);
    assert.deepEqual([r.added, r.updated, r.unchanged], [1, 0, 2]);

    const r2 = mergeEntities([b], [newerB]);
    assert.deepEqual([r2.added, r2.updated, r2.unchanged], [0, 1, 0]);
  });
});
